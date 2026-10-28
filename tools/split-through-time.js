/* Split the big through-time.json (kept locally, every chain) into one file per chain plus an index of keys, the layout the page lazy-loads.
   node tools/split-through-time.js <through-time.json> <outDir>   writes <outDir>/through-time-index.json and <outDir>/tt/<key>.json
   File name = key with every character outside A-Za-z0-9- turned into _ (same rule as the page's preFile). */
'use strict';
const fs = require('fs'), path = require('path');
const src = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const data = JSON.parse(fs.readFileSync(src, 'utf8')), dir = path.join(out, 'tt'), names = new Map();
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
for (const [k, v] of Object.entries(data)) {
  const f = k.replace(/[^A-Za-z0-9-]/g, '_') + '.json';
  if (names.has(f)) throw new Error('file name clash: ' + k + ' vs ' + names.get(f)); names.set(f, k);
  fs.writeFileSync(path.join(dir, f), JSON.stringify(v));
}
fs.writeFileSync(path.join(out, 'through-time-index.json'), JSON.stringify(Object.keys(data)));
console.log(Object.keys(data).length, 'chains split into', dir);
