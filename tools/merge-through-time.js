/* Merge precomputed Through Time results into data/plans/through-time.json (and the Run Planner app's copy).
   node tools/merge-through-time.js [batchDir]   Backs the file up first (backups/through-time.<stamp>.json). A Find result is stored
   under its 'best|…' key and under its chain's own key, like the entries already there. Existing keys are kept as they are. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), BATCH = path.resolve(process.argv[2] || path.join(ROOT, '..', 'precompute-through-time'));
// PT_BASE: the file to build on, normally the published artifact's own through-time.json (it can be ahead of this folder's); the result goes to the app folder
const FILES = [path.join(ROOT, 'run-planner-app', 'data', 'plans', 'through-time.json')], BASE = process.env.PT_BASE && path.resolve(process.env.PT_BASE);
const flags = o => ['obey', 'vc', 'frlgSwitch', 'gifts', 'tms'].map(k => o[k] ? 1 : 0).join('');
const results = fs.readdirSync(path.join(BATCH, 'results')).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(BATCH, 'results', f), 'utf8')));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(BASE || file, 'utf8'));
  fs.mkdirSync(path.join(ROOT, 'backups'), { recursive: true });
  fs.copyFileSync(file, path.join(ROOT, 'backups', 'through-time.' + (file.includes('run-planner-app') ? 'app.' : '') + stamp + '.json'));
  let added = 0; const add = (k, v) => { if (!(k in data)) { data[k] = v; added++; } };
  for (const j of results) {
    add(j.key, j.result);
    if (j.kind === 'best') add(j.result.chain.join('-') + '|d' + j.rules.delta + flags(j.rules), j.result);
  }
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(path.relative(ROOT, file), 'added', added, 'keys, now', Object.keys(data).length);
}
