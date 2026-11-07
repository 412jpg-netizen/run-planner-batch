/* Sweep every post-Switch chain with every version choice: each non-empty subset of LGPE, SWSH, BDSP, PLA, SV, LZA in release order,
   with each two-version game played as version 1 or 2 (Pikachu/Eevee, Sword/Shield, BD/SP, Scarlet/Violet) = 323 chains per rule set.
   node tools/sweep-postswitch.js [outDir]   (count: node tools/sweep-postswitch.js count). Rules: PT_RULES as in sweep-through-time.js.
   Writes <outDir>/sweep/<flags>-d<delta>-ps.json (same row layout as sweep-combos.js; chain entries are CODE@ver). PT_FULL=1 also keeps every full result. */
'use strict';
const fs = require('fs'), path = require('path'), { Worker } = require('worker_threads');
const ROOT = path.join(__dirname, '..'), DATA = path.resolve(process.env.PT_DATA || path.join(ROOT, 'data')) + path.sep;
const OUT = path.resolve(process.argv[2] && process.argv[2] !== 'count' ? process.argv[2] : path.join(ROOT, 'out')), NW = +process.env.PT_WORKERS || 3, CONC = +process.env.PT_CONC || 6, KEEP = +process.env.PT_KEEP || 3, SHARD = 0, SHARDS = 1;
const PS = [['LGPE', 2], ['SWSH', 2], ['BDSP', 2], ['PLA', 1], ['SV', 2], ['LZA', 1]];   // [code, versions]
let chains = []; (function pick(i, cur) { if (i === PS.length) { if (cur.length) chains.push(cur.slice()); return; }
  const [c, n] = PS[i]; for (let v = 1; v <= n; v++) { cur.push(c + '@' + v); pick(i + 1, cur); cur.pop(); } pick(i + 1, cur); })(0, []);   // shared prefixes stay adjacent
/* PT_DLC=1: only the chains with DLC (Nov 1 2026): each DLC follows its base game in the same version, in release order
   (SWSH IOA CT, SV TM ID, LZA MD) = 4,373 - 323 = 4,050 chains per rule set; writes <flags>-d<delta>-dlc.json */
const DLCS = { SWSH: ['IOA', 'CT'], SV: ['TM', 'ID'], LZA: ['MD'] }, DLCMODE = process.env.PT_DLC === '1';
if (DLCMODE) {
  const subsets = l => l.reduce((a, x) => a.concat(a.map(y => y.concat(x))), [[]]);   // keeps release order, [] first
  chains = []; (function pick(i, cur) { if (i === PS.length) { if (cur.some(c => /^(IOA|CT|TM|ID|MD)@/.test(c))) chains.push(cur.slice()); return; }
    const [c, n] = PS[i]; for (let v = 1; v <= n; v++) for (const d of subsets(DLCS[c] || [])) { const add = [c + '@' + v].concat(d.map(x => x + '@' + v)); cur.push(...add); pick(i + 1, cur); cur.length -= add.length; }
    pick(i + 1, cur); })(0, []);
}
if (process.argv[2] === 'count') { console.log(chains.length); process.exit(0); }
try { require('os').setPriority(10); } catch {}
const CE = require(path.join(ROOT, 'assets', 'planner', 'chain-engine.js'));
const rj = p => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'));
const DEX = rj('dex.json'), PL = rj('planner.json'), AVAIL = rj('avail.json').rows;
const STARTERS = Object.fromEntries(PL.games.map(g => [g.code, g.starters.map(s => s.n)]));
const R = Object.assign({ delta: 2, obey: true, vc: true, frlgSwitch: false, gifts: true, tms: false }, JSON.parse(process.env.PT_RULES || '{}'), process.env.PT_POOL === '1' ? { keepPool: true } : {});   // PT_POOL=1: full results keep each game's carried pool
const flags = ['obey', 'vc', 'frlgSwitch', 'gifts', 'tms'].map(k => R[k] ? 1 : 0).join('');
const mine = chains;

const ws = [], q = [], pend = new Map(); let nid = 0;
function next() { for (const w of ws) { if (w.busy || !q.length || !w.ready) continue; const t = q.shift(); w.busy = true; pend.set(t.id, { t, w }); w.postMessage({ id: t.id, code: t.code, opts: t.opts }); } }
const planGame = (code, opts) => new Promise((res, rej) => { q.push({ id: ++nid, code, opts, res, rej }); next(); });
const WORKER = `const { parentPort } = require('worker_threads'); const E = require(${JSON.stringify(path.join(ROOT, 'assets', 'planner', 'engine.js'))});
const ready = E.init(${JSON.stringify(DATA)}).then(() => parentPort.postMessage({ ready: true }));
parentPort.on('message', async m => { try { await ready; const r = await E.planGame(m.code, m.opts); parentPort.postMessage({ id: m.id, result: r }); } catch (e) { parentPort.postMessage({ id: m.id, error: String(e && e.stack || e) }); } });`;
for (let i = 0; i < NW; i++) {
  const w = new Worker(WORKER, { eval: true }); w.busy = false; w.ready = false;
  w.on('message', m => { if (m.ready) { w.ready = true; next(); return; } const p = pend.get(m.id); pend.delete(m.id); w.busy = false; if (p) m.error ? p.t.rej(new Error(m.error)) : p.t.res(m.result); next(); });
  ws.push(w);
}
const ce = CE.create({ planGame, games: DEX.games, avail: AVAIL, starters: STARTERS });
fs.mkdirSync(path.join(OUT, 'sweep'), { recursive: true });
const file = path.join(OUT, 'sweep', `${flags}-d${R.delta}-${DLCMODE ? 'dlc' : 'ps'}.json`), t0 = Date.now();
const FULL = process.env.PT_FULL === '1', fulls = [];   // PT_FULL=1: also keep every chain's full result, gzipped to <outDir>/full/
const rows = [], bestFull = [];   // bestFull: [{ total, catches, result }] kept sorted, KEEP long
const log = s => console.log(((Date.now() - t0) / 60000).toFixed(1).padStart(6) + ' min  ' + s);
const save = done => fs.writeFileSync(file, JSON.stringify({ shard: SHARD, shards: SHARDS, rules: R, done, total: mine.length, minutes: +((Date.now() - t0) / 60000).toFixed(1),
  rows, best: bestFull.map(b => b.result) }));
(async () => {
  log(`shard ${SHARD}/${SHARDS}: ${mine.length} chains (${mine[0].join('-')} .. ${mine[mine.length - 1].join('-')}), ${NW} workers x ${CONC} at a time`);
  let i = 0, done = 0;
  const lane = async () => {
    while (i < mine.length) {
      const chain = mine[i++];
      try {
        const r = await ce.planChain(chain.map(c => { const [code, v] = c.split('@'); return { code, ver: +v || 1 }; }), R);
        if (FULL) fulls.push(r);
        rows.push([chain, r.total, r.catches, r.games.map(g => g.ok ? g.newUsed : null), r.cleared]);
        if (r.cleared === chain.length) { bestFull.push({ total: r.total, catches: r.catches, result: r }); bestFull.sort((a, b) => a.total - b.total || a.catches - b.catches); bestFull.length = Math.min(bestFull.length, KEEP); }
      } catch (e) { rows.push([chain, null, null, null, 0, String(e && e.message || e).slice(0, 120)]); }
      if (++done % 10 === 0) { save(done); log(`${done}/${mine.length} planned, best so far ${bestFull[0] ? bestFull[0].total : '-'} Pokémon`); }
    }
  };
  await Promise.all(Array.from({ length: CONC }, lane));
  save(done);
  if (FULL) { fs.mkdirSync(path.join(OUT, 'full'), { recursive: true }); fs.writeFileSync(file.replace(path.join(OUT, 'sweep'), path.join(OUT, 'full')) + '.gz', require('zlib').gzipSync(JSON.stringify(fulls), { level: 9 })); }
  log(`finished: ${done} chains, best ${bestFull[0] ? bestFull[0].total + ' ' + bestFull[0].result.chain.join('-') : 'none'}`);
  process.exit(0);
})();
