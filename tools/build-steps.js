/* DEXCORE V2: turn full sweep results (*.json.gz arrays of planChain results, from sweep-combos.js with PT_FULL=1) into step files.
   node tools/build-steps.js <outDir> <file-or-dir> [...]
   A step = one chain's last game plus the team it carries out (planChain's roster). Every chain in a sweep is also the prefix of longer
   chains, so a stored step lets the page resume any longer chain with planChain(chain, R, onProg, {pool, games}).
   Step id = 22-bit mask of the games played, one bit per game in release order (RB = bit 0 .. LZA = bit 21), hex; chains that use a
   second version add '.' + one digit per game. Rule key = the toggles that can change the chain (see ruleKey).
   Output, per rule key:  <outDir>/<kind>/<ruleKey>/q0..q3.txt (steps grouped by the RB and Y bits of the mask),
   plus <outDir>/index/<ruleKey>.json (one row per stored chain) and <outDir>/manifest.json. .txt files hold base64(gzip(JSON)),
   because the artifact file store takes text and JSON but not raw gzip. */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const GAMES = ['RB', 'Y', 'GS', 'C', 'RS', 'E', 'FRLG', 'DP', 'PT', 'HGSS', 'BW', 'B2W2', 'XY', 'ORAS', 'SM', 'USUM', 'LGPE', 'SWSH', 'BDSP', 'PLA', 'SV', 'LZA',
  'IOA', 'CT', 'TM', 'ID', 'MD'];   // DLC after LZA, bits 22-26 (chains still run in release order; a DLC follows its base game)
const BIT = Object.fromEntries(GAMES.map((g, i) => [g, i]));
const GEN12 = new Set(['RB', 'Y', 'GS', 'C']), GEN7UP = new Set(GAMES.slice(14));
const OUT = path.resolve(process.argv[2]);
if (!OUT || process.argv.length < 4) { console.error('usage: build-steps.js <outDir> <file-or-dir> [...]'); process.exit(1); }

const mask = chain => chain.reduce((m, c) => m | (1 << BIT[c]), 0);
const stepId = (chain, versions) => {
  const hex = '0x' + mask(chain).toString(16).toUpperCase().padStart(6, '0');
  return versions && versions.some(v => v !== 1) ? hex + '.' + versions.join('') : hex;
};
/* only the toggles that can change this chain: VC needs a Gen 1-2 game and a Gen 7+ game (checked: no effect on Gen 1-5 openings);
   FRLG on Switch removes FRLG's link trades and Pal Park, so it needs FRLG plus any Gen 3+ game (checked on the openings sweep) */
function ruleKey(R, chain) {
  const k = ['d' + R.delta];
  if (R.obey !== false) k.push('obey');
  if (R.gifts !== false) k.push('gifts');
  for (const t of ['tms', 'trades', 'events', 'legends']) if (R[t]) k.push(t);
  if (R.vc !== false && chain.some(c => GEN12.has(c)) && chain.some(c => GEN7UP.has(c))) k.push('vc');
  if (R.frlgSwitch && chain.includes('FRLG') && chain.some(c => c !== 'FRLG' && BIT[c] >= BIT.RS)) k.push('frlgsw');
  return k.join('-');
}
const kindOf = chain => chain.every(c => BIT[c] < 12) ? 'open' : 'tail';

const inputs = process.argv.slice(3).flatMap(p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => f.endsWith('.json.gz')).map(f => path.join(p, f)) : [p]);
const store = new Map();   // kind/ruleKey -> Map(stepId -> record)
let chains = 0, dup = 0, conflicts = 0, stored = 0;
const conflictList = [];
for (const f of inputs) {
  for (const r of JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString())) {
    chains++;
    const full = r.chain.map(c => String(c).split('@')[0]), fullVer = r.versions || full.map(() => 1);
    /* games that carry their own roster-shaped pool (g.pool with usedIn) give a step for every prefix; otherwise only the whole chain */
    const perGame = r.games.every(g => Array.isArray(g.pool) && g.pool.every(p => Array.isArray(p.usedIn)));
    for (let k = perGame ? 1 : full.length; k <= full.length; k++) {
      const chain = full.slice(0, k), versions = fullVer.slice(0, k), last = r.games[k - 1];
      const key = kindOf(chain) + '/' + ruleKey(r.rules, chain), id = stepId(chain, versions);
      const g = Object.assign({}, last); delete g.pool;
      const pool = k === full.length ? r.roster : last.pool, used = pool.filter(p => p.used);
      const rec = { g, pool, total: used.length, catches: used.filter(p => p.kind !== 'starter').length, cleared: r.games.slice(0, k).filter(x => x.ok).length, n: k };
      if (!store.has(key)) store.set(key, new Map());
      const m = store.get(key), old = m.get(id);
      if (old) {
        dup++;
        if (JSON.stringify(old.g) !== JSON.stringify(rec.g) || old.total !== rec.total) { conflicts++; if (conflictList.length < 20) conflictList.push(key + ' ' + id + ' ' + path.basename(f)); }
        continue;
      }
      m.set(id, rec); stored++;
    }
  }
}

const manifest = { v: 2, engine: 'xp2261101', chain: 'lv2', built: new Date().toISOString(), games: GAMES, files: {} };
const write = (rel, text) => {
  const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text);
  manifest.files[rel] = { bytes: Buffer.byteLength(text), sha1: crypto.createHash('sha1').update(text).digest('hex').slice(0, 16) };
};
const pack = obj => zlib.gzipSync(JSON.stringify(obj), { level: 9 }).toString('base64');
for (const [key, m] of store) {
  const groups = new Map();
  for (const [id, rec] of m) {
    const name = 'q' + (parseInt(id.slice(2).split('.')[0], 16) & 3);   // 4 files per rule key, by the RB and Y bits (~1 MB each for openings)
    if (!groups.has(name)) groups.set(name, {}); groups.get(name)[id] = rec;
  }
  for (const [name, steps] of groups) write(`${key}/${name}.txt`, pack({ v: 2, key, steps }));
  const rows = [...m].map(([id, r]) => [id, r.n, r.total, r.catches, r.cleared]);
  write(`index/${key.replace('/', '-')}.json`, JSON.stringify({ v: 2, key, cols: ['id', 'games', 'total', 'catches', 'cleared'], rows }));
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
const total = Object.values(manifest.files).reduce((a, f) => a + f.bytes, 0);
console.log(JSON.stringify({ inputs: inputs.length, chains, stored, duplicates: dup, conflicts, ruleKeys: store.size, files: Object.keys(manifest.files).length, mb: +(total / 1e6).toFixed(1) }));
if (conflicts) { console.error('CONFLICTS (same step, different plan):\n' + conflictList.join('\n')); process.exit(2); }
