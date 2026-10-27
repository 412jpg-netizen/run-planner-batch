/* Add the sweep's best chains (full results) to the page's through-time.json, and print the leaderboard per rule set,
   slowest (largest) rule set first.
   node tools/merge-sweep.js <through-time.json to update> [topN=12] [sweepDir=sweep]
   Chains are keyed like the page: chain.join('-') + '|d' + delta + obey vc frlgSwitch gifts tms. Existing keys are kept. */
'use strict';
const fs = require('fs'), path = require('path');
const target = path.resolve(process.argv[2]), TOP = +process.argv[3] || 12, dir = path.resolve(process.argv[4] || path.join(__dirname, '..', 'sweep'));
const flags = o => ['obey', 'vc', 'frlgSwitch', 'gifts', 'tms'].map(k => o[k] ? 1 : 0).join('');
const rows = [], full = new Map(), mins = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const set = 'd' + d.rules.delta + ' ' + flags(d.rules); mins[set] = Math.max(mins[set] || 0, d.minutes || 0);
  const key = c => c.join('-') + '|d' + d.rules.delta + flags(d.rules);
  for (const r of d.rows) rows.push({ set, key: key(r[0]), chain: r[0], total: r[1], catches: r[2], per: r[3], cleared: r[4] });
  for (const r of d.best) full.set(key(r.chain), r);
}
const ok = rows.filter(r => r.total != null && r.cleared === r.chain.length).sort((a, b) => a.total - b.total || a.catches - b.catches);
console.log(`${rows.length} chains, ${ok.length} fully cleared; Pokémon totals ${ok[0].total}..${ok[ok.length - 1].total}`);
const data = JSON.parse(fs.readFileSync(target, 'utf8')); let added = 0;
for (const set of Object.keys(mins).sort((a, b) => mins[b] - mins[a])) {
  console.log('\n' + set + ' (longest shard ' + mins[set] + ' min), top ' + TOP + ':');
  for (const r of ok.filter(r => r.set === set).slice(0, TOP)) {
    const have = r.key in data, f = full.get(r.key);
    if (!have && f) { data[r.key] = f; added++; }
    console.log(String(r.total).padStart(3), String(r.catches).padStart(3) + ' catches', r.chain.join('-').padEnd(40), have ? '(already stored)' : f ? '(added)' : "(summary only: not in a shard's top 3)");
  }
}
fs.writeFileSync(target, JSON.stringify(data)); console.log('\nadded', added, 'chains; file now has', Object.keys(data).length);
