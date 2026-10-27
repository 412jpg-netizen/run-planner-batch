/* Precompute Through Time plans (Oct 26 2026, Hoss: "run and store all plan data, starting with the longest and working backwards").
   node tools/precompute-through-time.js [outDir] [workers]
   Jobs run longest first (Find-the-lowest-chain searches, then 9-game chains). Each finished job is saved at once to
   <outDir>/results/<key>.json and logged to <outDir>/jobs.log with its seconds; progress is in <outDir>/progress.json. Re-running skips
   jobs that already have a result file. Merge into data/plans/through-time.json with tools/merge-through-time.js once the data is in.
   Keys match the page: chain.join('-') + '|d' + delta + obey vc frlgSwitch gifts tms, and 'best|d…' for the Find results. */
'use strict';
const fs = require('fs'), path = require('path'), { Worker } = require('worker_threads');
// PT_DATA: the data folder to plan against (the published Run Planner's data/, which can be ahead of this folder's)
const ROOT = path.join(__dirname, '..'), DATA = path.resolve(process.env.PT_DATA || path.join(ROOT, 'data')) + path.sep;
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'out')), NW = +process.argv[3] || +process.env.PT_WORKERS || 3;
fs.mkdirSync(path.join(OUT, 'results'), { recursive: true });
try { require('os').setPriority(10); } catch {}   // below normal: the PC stays usable while it runs
const CE = require(path.join(ROOT, 'assets', 'planner', 'chain-engine.js'));
const rj = p => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'));
const DEX = rj('dex.json'), PL = rj('planner.json'), AVAIL = rj('avail.json').rows;
const STARTERS = Object.fromEntries(PL.games.map(g => [g.code, g.starters.map(s => s.n)]));
const GENS = [['RB', 'Y'], ['GS', 'C'], ['RS', 'E', 'FRLG'], ['DP', 'PT', 'HGSS'], ['BW', 'B2W2'], ['XY', 'ORAS'], ['SM', 'USUM', 'LGPE'], ['SWSH', 'BDSP', 'PLA'], ['SV', 'LZA']];
const DEFAULT = GENS.map(g => g[0]);
const flags = o => ['obey', 'vc', 'frlgSwitch', 'gifts', 'tms'].map(k => o[k] ? 1 : 0).join('');
const R0 = { delta: 2, obey: true, vc: true, frlgSwitch: false, gifts: true, tms: false };
const withR = ch => Object.assign({}, R0, ch);
// rule sets: the default, each setting flipped once (what "Preview what each setting changes" shows), and the +0 / +5 margins
const RULESETS = [['default', withR({})], ['obey off', withR({ obey: false })], ['VC off', withR({ vc: false })], ['FRLG on Switch', withR({ frlgSwitch: true })],
  ['gifts off', withR({ gifts: false })], ['TMs on', withR({ tms: true })], ['+0', withR({ delta: 0 })], ['+5', withR({ delta: 5 })]];
const jobs = [];
for (const [name, R] of RULESETS) jobs.push({ kind: 'best', name, R, key: 'best|d' + R.delta + flags(R), rank: 100 });   // Find: every game and starter of every generation
for (const [name, R] of RULESETS) jobs.push({ kind: 'chain', name, R, key: DEFAULT.join('-') + '|d' + R.delta + flags(R), rank: 9 });   // the default 9-game chain
// PT_EXTRA: a JSON file of more chains to plan, [{ "name": "Yellow + Emerald", "chain": ["Y","E"], "rules": { "delta": 2, "tms": true } }] (rules default to the standard ones)
if (process.env.PT_EXTRA) for (const x of JSON.parse(fs.readFileSync(path.resolve(process.env.PT_EXTRA), 'utf8'))) {
  const R = withR(x.rules || {}); jobs.push({ kind: 'chain', name: x.name || x.chain.join('-'), R, chain: x.chain, key: x.chain.join('-') + '|d' + R.delta + flags(R), rank: x.chain.length });
}
jobs.sort((a, b) => b.rank - a.rank);   // longest first; stable, so the order above is kept inside a rank
const STORED = new Set(Object.keys(rj('plans/through-time.json')));   // already shipped with the page: not worked out again
for (let i = jobs.length - 1; i >= 0; i--) if (STORED.has(jobs[i].key)) jobs.splice(i, 1);
// PT_FILTER: only the jobs whose "kind|name" matches this regex (the GitHub workflow runs one job per machine this way)
if (process.env.PT_FILTER) { const re = new RegExp(process.env.PT_FILTER, 'i'); for (let i = jobs.length - 1; i >= 0; i--) if (!re.test(jobs[i].kind + '|' + jobs[i].name)) jobs.splice(i, 1); }

/* worker pool: engine.js planGame in worker threads, handed to chain-engine.js as its planGame */
const ws = [], q = [], pend = new Map(); let nid = 0;
function next() { for (const w of ws) { if (w.busy || !q.length || !w.ready) continue; const t = q.shift(); w.busy = true; pend.set(t.id, { t, w }); w.postMessage({ id: t.id, code: t.code, opts: t.opts }); } }
function planGame(code, opts) { return new Promise((res, rej) => { q.push({ id: ++nid, code, opts, res, rej }); next(); }); }
const WORKER = `const { parentPort } = require('worker_threads'); const E = require(${JSON.stringify(path.join(ROOT, 'assets', 'planner', 'engine.js'))});
const ready = E.init(${JSON.stringify(DATA)}).then(() => parentPort.postMessage({ ready: true }));
parentPort.on('message', async m => { try { await ready; const r = await E.planGame(m.code, m.opts); parentPort.postMessage({ id: m.id, result: r }); } catch (e) { parentPort.postMessage({ id: m.id, error: String(e && e.stack || e) }); } });`;
for (let i = 0; i < NW; i++) {
  const w = new Worker(WORKER, { eval: true }); w.busy = false; w.ready = false;
  w.on('message', m => { if (m.ready) { w.ready = true; next(); return; } const p = pend.get(m.id); pend.delete(m.id); w.busy = false; if (p) m.error ? p.t.rej(new Error(m.error)) : p.t.res(m.result); next(); });
  w.on('error', e => console.error('worker error', e)); ws.push(w);
}
const ce = CE.create({ planGame, games: DEX.games, avail: AVAIL, starters: STARTERS });
const t0 = Date.now(), stamp = () => ((Date.now() - t0) / 60000).toFixed(1) + ' min';
const log = s => { const l = new Date().toISOString() + '  ' + s; console.log(l); fs.appendFileSync(path.join(OUT, 'jobs.log'), l + '\n'); };
const prog = o => fs.writeFileSync(path.join(OUT, 'progress.json'), JSON.stringify(o, null, 1));
const fileOf = key => path.join(OUT, 'results', key.replace(/[|]/g, '__') + '.json');

(async () => {
  log(`start: ${jobs.length} jobs, ${NW} workers, out ${OUT}`);
  let n = 0;
  for (const j of jobs) {
    n++; if (fs.existsSync(fileOf(j.key))) { log(`skip ${j.key} (done)`); continue; }
    const js = Date.now(); log(`begin ${n}/${jobs.length} ${j.kind} [${j.name}] ${j.key}`);
    const onProg = m => prog({ job: j.key, n, of: jobs.length, name: j.name, kind: j.kind, since: new Date(js).toISOString(), elapsed: stamp(), last: m && { phase: m.phase, gen: m.gen, gens: m.gens, game: m.game, index: m.index, total: m.total, best: m.best && m.best.total } });
    try {
      const r = j.kind === 'best' ? await ce.bestChain(GENS.map(o => o.map(code => ({ code, ver: 1 }))), j.R, { beam: 3 }, onProg)
        : await ce.planChain((j.chain || DEFAULT).map(code => ({ code, ver: 1 })), j.R, onProg);
      fs.writeFileSync(fileOf(j.key), JSON.stringify({ key: j.key, kind: j.kind, name: j.name, rules: j.R, seconds: Math.round((Date.now() - js) / 1000), result: r }));
      log(`done  ${j.key}: ${r.total} Pokémon, chain ${r.chain.join('-')}, ${Math.round((Date.now() - js) / 1000)} s`);
    } catch (e) { log(`FAIL  ${j.key}: ${String(e && e.stack || e).split('\n')[0]}`); }
  }
  log('all jobs finished'); prog({ finished: true, elapsed: stamp() }); process.exit(0);
})();
