/* Sweep: plan EVERY one-game-per-generation 9-game chain (2,592 of them) and keep a compact summary of each.
   node tools/sweep-through-time.js <shard> <shards> [outDir]      e.g. 3 24 out
   Chains are listed in release order with the first generations varying slowest, then cut into contiguous shards, so a shard's chains
   share long prefixes and chain-engine.js's cache plans each shared game once. Rules: PT_RULES='{"obey":false}' (default: standard).
   Writes <outDir>/sweep/<rules>-<shard>.json = { shard, rules, rows: [[chainCodes, total, catches, [newPerGame], cleared]], best: [full results of the best few] }. */
'use strict';
const fs = require('fs'), path = require('path'), { Worker } = require('worker_threads');
const ROOT = path.join(__dirname, '..'), DATA = path.resolve(process.env.PT_DATA || path.join(ROOT, 'data')) + path.sep;
const SHARD = +process.argv[2], SHARDS = +process.argv[3], OUT = path.resolve(process.argv[4] || path.join(ROOT, 'out')), NW = +process.env.PT_WORKERS || 3, CONC = +process.env.PT_CONC || 6, KEEP = +process.env.PT_KEEP || 3;
if (!(SHARDS > 0) || !(SHARD >= 0 && SHARD < SHARDS)) { console.error('usage: sweep-through-time.js <shard> <shards> [outDir]'); process.exit(1); }
try { require('os').setPriority(10); } catch {}
const CE = require(path.join(ROOT, 'assets', 'planner', 'chain-engine.js'));
const rj = p => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'));
const DEX = rj('dex.json'), PL = rj('planner.json'), AVAIL = rj('avail.json').rows;
const STARTERS = Object.fromEntries(PL.games.map(g => [g.code, g.starters.map(s => s.n)]));
const GENS = [['RB', 'Y'], ['GS', 'C'], ['RS', 'E', 'FRLG'], ['DP', 'PT', 'HGSS'], ['BW', 'B2W2'], ['XY', 'ORAS'], ['SM', 'USUM', 'LGPE'], ['SWSH', 'BDSP', 'PLA'], ['SV', 'LZA']];
const R = Object.assign({ delta: 2, obey: true, vc: true, frlgSwitch: false, gifts: true, tms: false }, JSON.parse(process.env.PT_RULES || '{}'));
const flags = ['obey', 'vc', 'frlgSwitch', 'gifts', 'tms'].map(k => R[k] ? 1 : 0).join('');
let chains = [[]]; for (const g of GENS) chains = chains.flatMap(c => g.map(x => c.concat(x)));   // 2592, first generation slowest
const per = Math.ceil(chains.length / SHARDS), mine = chains.slice(SHARD * per, (SHARD + 1) * per);

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
const file = path.join(OUT, 'sweep', `${flags}-d${R.delta}-${String(SHARD).padStart(2, '0')}of${SHARDS}.json`), t0 = Date.now();
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
        const r = await ce.planChain(chain.map(code => ({ code, ver: 1 })), R);
        rows.push([chain, r.total, r.catches, r.games.map(g => g.ok ? g.newUsed : null), r.cleared]);
        if (r.cleared === chain.length) { bestFull.push({ total: r.total, catches: r.catches, result: r }); bestFull.sort((a, b) => a.total - b.total || a.catches - b.catches); bestFull.length = Math.min(bestFull.length, KEEP); }
      } catch (e) { rows.push([chain, null, null, null, 0, String(e && e.message || e).slice(0, 120)]); }
      if (++done % 10 === 0) { save(done); log(`${done}/${mine.length} planned, best so far ${bestFull[0] ? bestFull[0].total : '-'} Pokémon`); }
    }
  };
  await Promise.all(Array.from({ length: CONC }, lane));
  save(done); log(`finished: ${done} chains, best ${bestFull[0] ? bestFull[0].total + ' ' + bestFull[0].result.chain.join('-') : 'none'}`);
  process.exit(0);
})();
