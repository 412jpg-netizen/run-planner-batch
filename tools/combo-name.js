/* File name of one combo summary for the rules in PT_RULES:  node tools/combo-name.js <size>  ->  11010-d2-s10-0of1.json
   node tools/combo-name.js done <file>  exits 0 if that summary exists and is complete. */
'use strict';
const fs = require('fs');
if (process.argv[2] === 'done') {
  try { const d = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); process.exit(d.done === d.total && d.total > 0 ? 0 : 1); } catch { process.exit(1); }
}
const R = Object.assign({ delta: 2, obey: true, vc: true, frlgSwitch: false, gifts: true, tms: false }, JSON.parse(process.env.PT_RULES || '{}'));
const flags = ['obey', 'vc', 'frlgSwitch', 'gifts', 'tms'].map(k => R[k] ? 1 : 0).join('');
console.log(`${flags}-d${R.delta}-s${String(+process.argv[2]).padStart(2, '0')}-0of1.json`);
