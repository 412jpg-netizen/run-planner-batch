/* Sweep ALL combos: every non-empty subset of the 22 games in release order (chains may skip games or whole generations), by chain length, longest first.
   node tools/sweep-combos.js <size> <shard> <shards> [outDir]      size = games per chain (22 .. 1), e.g. 22 0 1 out;  node tools/sweep-combos.js count  = chains per size
   Chains of one size are listed with the first game slowest, then cut into contiguous shards (shared prefixes -> chain-engine.js cache). Rules: PT_RULES as in sweep-through-time.js.
   Writes <outDir>/sweep/<flags>-d<delta>-s<size>-<shard>of<shards>.json, same layout as sweep-through-time.js. PT_FULL=1 also keeps every full result. */
'use strict';
const fs = require('fs'), path = require('path'), { Worker } = require('worker_threads');
const ROOT = path.join(__dirname, '..'), DATA = path.resolve(process.env.PT_DATA || path.join(ROOT, 'data')) + path.sep;
const SIZE = +process.argv[2], SHARD = +process.argv[3], SHARDS = +process.argv[4], OUT = path.resolve(process.argv[5] || path.join(ROOT, 'out')), NW = +process.env.PT_WORKERS || 3, CONC = +process.env.PT_CONC || 6, KEEP = +process.env.PT_KEEP || 3;
const ALL = process.env.PT_GAMES ? process.env.PT_GAMES.split(',') : ['RB', 'Y', 'GS', 'C', 'RS', 'E', 'FRLG', 'DP', 'PT', 'HGSS', 'BW', 'B2W2', 'XY', 'ORAS', 'SM', 'USUM', 'LGPE', 'SWSH', 'BDSP', 'PLA', 'SV', 'LZA'];   // PT_GAMES=XY,ORAS,... limits the pool (e.g. post-Bank only)
const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); };
if (process.argv[2] === 'count') { for (let k = ALL.length; k >= 1; k--) console.log(k, choose(ALL.length, k)); process.exit(0); }
if (!(SIZE >= 1 && SIZE <= ALL.length) || !(SHARDS > 0) || !(SHARD >= 0 && SHARD < SHARDS)) { console.error('usage: sweep-combos.js <size> <shard> <shards> [outDir]'); process.exit(1); }
try { require('os').setPriority(10); } catch {}
const CE = require(path.join(ROOT, 'assets', 'planner', 'chain-engine.js'));
const rj = p => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'));
const DEX = rj('dex.json'), PL = rj('planner.json'), AVAIL = rj('avail.json').rows;
const STARTERS = Object.fromEntries(PL.games.map(g => [g.code, g.starters.map(s => s.n)]));
const R = Object.assign({ delta: 2, obey: true, vc: true, frlgSwitch: false, gifts: true, tms: false }, JSON.parse(process.env.PT_RULES || '{}'));
const flags = ['obey', 'vc', 'frlgSwitch', 'gifts', 'tms'].map(k => R[k] ? 1 : 0).join('');
const chains = []; (function pick(i, cur) { if (cur.length === SIZE) { chains.push(cur.slice()); return; } if (ALL.length - i < SIZE - cur.length) return; cur.push(ALL[i]); pick(i + 1, cur); cur.pop(); pick(i + 1, cur); })(0, []);   // release order, first game slowest
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
const file = path.join(OUT, 'sweep', `${flags}-d${R.delta}-s${String(SIZE).padStart(2, '0')}-${String(SHARD).padStart(String(SHARDS).length, '0')}of${SHARDS}.json`), t0 = Date.now();
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
        const r = await ce.planChain(chain.map(code => ({ code, ver: 1 })), R);
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
