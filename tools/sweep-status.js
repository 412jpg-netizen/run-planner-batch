/* One line about the sweep: shards finished, chains planned, best chain so far.  node tools/sweep-status.js [dir=sweep] */
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'sweep'));
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
let planned = 0, total = 0, shards = 0, errors = 0, best = null, minutes = 0;
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
  shards++; total += d.total || 0; minutes = Math.max(minutes, d.minutes || 0);
  for (const r of d.rows) { planned++; if (r[1] == null) errors++; else if (r[4] === r[0].length && (!best || r[1] < best[1] || (r[1] === best[1] && r[2] < best[2]))) best = r; }
}
console.log(`sweep: ${shards}/24 shard files, ${planned} chains planned, ${errors} errors, longest shard ${minutes} min, best ${best ? best[1] + ' Pokémon (' + best[2] + ' catches): ' + best[0].join('-') : 'none yet'}`);
