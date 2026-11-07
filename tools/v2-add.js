/* DEXCORE V2: add a new batch of sweep results to an already published step store, without rewriting what is there.
   node tools/v2-add.js <index.json.gz> <outDir> <tag> <file-or-dir>...
   index.json.gz = {rel: {stepId: hash}} for every step already stored (created from a store dir with --init <storeDir>).
   New steps go to <outDir>/<kind>/<ruleKey>/q<n>-<tag>.txt (same format as build-steps.js); the page merges every part listed
   under manifest.files[rel].urls. A step already stored is skipped; one that differs from the stored plan is a conflict (exit 2). */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const GAMES = ['RB', 'Y', 'GS', 'C', 'RS', 'E', 'FRLG', 'DP', 'PT', 'HGSS', 'BW', 'B2W2', 'XY', 'ORAS', 'SM', 'USUM', 'LGPE', 'SWSH', 'BDSP', 'PLA', 'SV', 'LZA',
  'IOA', 'CT', 'TM', 'ID', 'MD'];
const BIT = Object.fromEntries(GAMES.map((g, i) => [g, i])), GEN12 = new Set(['RB', 'Y', 'GS', 'C']), GEN7UP = new Set(GAMES.slice(14));
const mask = ch => ch.reduce((m, c) => m | (1 << BIT[c]), 0);
const stepId = (ch, v) => { const h = '0x' + mask(ch).toString(16).toUpperCase().padStart(6, '0'); return v && v.some(x => x !== 1) ? h + '.' + v.join('') : h; };
function ruleKey(R, ch) {
  const k = ['d' + R.delta];
  if (R.obey !== false) k.push('obey'); if (R.gifts !== false) k.push('gifts');
  for (const t of ['tms', 'trades', 'events', 'legends']) if (R[t]) k.push(t);
  if (R.vc !== false && ch.some(c => GEN12.has(c)) && ch.some(c => GEN7UP.has(c))) k.push('vc');
  if (R.frlgSwitch && ch.includes('FRLG') && ch.some(c => c !== 'FRLG' && BIT[c] >= BIT.RS)) k.push('frlgsw');
  return k.join('-');
}
const relOf = (ch, R, id) => (ch.every(c => BIT[c] < 12) ? 'open' : 'tail') + '/' + ruleKey(R, ch) + '/q' + (parseInt(id.slice(2).split('.')[0], 16) & 3) + '.txt';
const hash = rec => crypto.createHash('sha1').update(JSON.stringify(rec.g) + '|' + rec.total).digest('hex').slice(0, 12);
const unpackFile = p => JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(p, 'utf8'), 'base64'))).steps;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

const [, , IDX, a2, a3, ...rest] = process.argv;
if (a2 === '--init') {   // index every step of a built store
  const idx = {};
  for (const f of walk(a3).filter(f => f.endsWith('.txt'))) {
    const rel = path.relative(a3, f).replace(/-[^/]*(?=\.txt$)/, '');   // q1-t20.txt -> q1.txt
    const m = idx[rel] ||= {}; for (const [id, r] of Object.entries(unpackFile(f))) m[id] = hash(r);
  }
  fs.writeFileSync(IDX, zlib.gzipSync(JSON.stringify(idx)));
  console.log(JSON.stringify({ rels: Object.keys(idx).length, steps: Object.values(idx).reduce((a, m) => a + Object.keys(m).length, 0) }));
  process.exit(0);
}
const OUT = path.resolve(a2), TAG = a3;
const idx = fs.existsSync(IDX) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(IDX))) : {};
const inputs = rest.flatMap(p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => f.endsWith('.json.gz')).map(f => path.join(p, f)) : [p]);
const add = {}; let chains = 0, known = 0, fresh = 0, conflicts = 0; const cl = [];
for (const f of inputs) for (const r of JSON.parse(zlib.gunzipSync(fs.readFileSync(f)))) {
  chains++;
  const full = r.chain.map(c => String(c).split('@')[0]), fv = r.versions || r.chain.map(c => +(String(c).split('@')[1] || 1));
  const per = r.games.every(g => Array.isArray(g.pool) && g.pool.every(p => Array.isArray(p.usedIn)));
  for (let k = per ? 1 : full.length; k <= full.length; k++) {
    const ch = full.slice(0, k), v = fv.slice(0, k), last = r.games[k - 1], g = Object.assign({}, last); delete g.pool;
    const pool = k === full.length ? r.roster : last.pool, used = pool.filter(p => p.used);
    const rec = { g, pool, total: used.length, catches: used.filter(p => p.kind !== 'starter').length, cleared: r.games.slice(0, k).filter(x => x.ok).length, n: k };
    const id = stepId(ch, v), rel = relOf(ch, r.rules, id), h = hash(rec), m = idx[rel] ||= {};
    if (m[id]) { known++; if (m[id] !== h) { conflicts++; if (cl.length < 20) cl.push(rel + ' ' + id + ' ' + path.basename(f)); } continue; }
    m[id] = h; (add[rel] ||= {})[id] = rec; fresh++;
  }
}
const files = {};
for (const [rel, steps] of Object.entries(add)) {
  const out = rel.replace(/\.txt$/, '-' + TAG + '.txt'), t = zlib.gzipSync(JSON.stringify({ v: 2, key: rel.split('/').slice(0, 2).join('/'), steps }), { level: 9 }).toString('base64');
  fs.mkdirSync(path.dirname(path.join(OUT, out)), { recursive: true }); fs.writeFileSync(path.join(OUT, out), t); files[out] = { rel, bytes: t.length };
}
fs.writeFileSync(path.join(OUT, 'added.json'), JSON.stringify(files));
if (!conflicts) fs.writeFileSync(IDX, zlib.gzipSync(JSON.stringify(idx)));
console.log(JSON.stringify({ inputs: inputs.length, chains, known, fresh, conflicts, files: Object.keys(files).length, mb: +(Object.values(files).reduce((a, f) => a + f.bytes, 0) / 1e6).toFixed(1) }));
if (conflicts) { console.error('CONFLICTS:\n' + cl.join('\n')); process.exit(2); }
