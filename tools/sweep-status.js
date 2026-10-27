/* Sweep progress, one line per rule set: shards finished, chains planned, best chain so far.  node tools/sweep-status.js [dir=sweep] */
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'sweep'));
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
const sets = {};   // "flags-dDELTA" -> { shards, planned, errors, best, minutes }
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
  const k = f.replace(/-\d+of\d+\.json$/, ''), s = sets[k] ||= { shards: 0, planned: 0, errors: 0, best: null, minutes: 0, rules: d.rules };
  s.shards++; s.minutes = Math.max(s.minutes, d.minutes || 0);
  for (const r of d.rows) { s.planned++; if (r[1] == null) s.errors++; else if (r[4] === r[0].length && (!s.best || r[1] < s.best[1] || (r[1] === s.best[1] && r[2] < s.best[2]))) s.best = r; }
}
const name = r => { const o = []; if (!r.obey) o.push('obedience off'); if (!r.vc) o.push('VC off'); if (r.frlgSwitch) o.push('FRLG Switch'); if (!r.gifts) o.push('gifts off'); if (r.tms) o.push('TMs on'); if (r.delta !== 2) o.push('+' + r.delta); return o.join(', ') || 'standard'; };
for (const [k, s] of Object.entries(sets)) console.log(`${name(s.rules).padEnd(14)} ${String(s.shards).padStart(2)}/24 shards, ${String(s.planned).padStart(4)}/2592 chains, ${s.errors} errors, longest ${s.minutes} min, best ${s.best ? s.best[1] + ' Pokémon (' + s.best[2] + ' catches) ' + s.best[0].join('-') : 'none yet'}`);
