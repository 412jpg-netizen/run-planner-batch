/* Through Time largest-first sweep planner (Nov 1 2026, Hoss: "we can do the chains from largest to smallest"; any games in release order,
   generations may be skipped). For one chain size, lists the (rule set, shard) jobs not yet in tt/, cut into parts of at most 250
   (GitHub's matrix limit). node tools/tt-plan.js <size> <part>  -> prints {"include":[...],"more":bool} for the workflow matrix. */
'use strict';
const fs = require('fs'), path = require('path');
const SIZE = +process.argv[2], PART = +process.argv[3] || 0, N = 22;
const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); };
const count = choose(N, SIZE);
const PER = { 5: 1500, 2: 1000, 0: 350 };   // chains per job, so each job stays well under GitHub's 6 h limit (+0 runs ~3x slower)
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.github', 'tt-rules.json'), 'utf8'));
const flagsOf = R => ['obey', 'vc', 'frlgSwitch', 'gifts', 'tms'].map(k => R[k] ? 1 : 0).join('') + '-d' + R.delta;
const jobs = [];
for (const r of rules) {
  const R = JSON.parse(r), shards = Math.max(1, Math.ceil(count / PER[R.delta]));
  for (let k = 0; k < shards; k++) {
    const f = `${flagsOf(R)}-s${String(SIZE).padStart(2, '0')}-${String(k).padStart(String(shards).length, '0')}of${shards}.json`;
    if (fs.existsSync(path.join(__dirname, '..', 'tt', f))) continue;
    jobs.push({ rules: r, shard: k, shards, file: f });
  }
}
// done jobs are already left out above, so every part takes the first 250 still to do (PART is kept only for older callers)
const include = jobs.slice(0, 250);
console.log(JSON.stringify({ include, more: jobs.length > 250, total: jobs.length }));
