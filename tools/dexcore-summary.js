/* DEXCORE summary layer (Nov 4 2026, Hoss: a Coverage tab in the Run Planner). Reads the sweep summaries (tt/, postswitch2/, postswitch-dlc/
   shards: rows of [chain, total, catches, newPerGame, cleared]) and writes, into <outDir>:
     manifest.json  what is computed, by family and size: chains expected, done, shards, stored (opens instantly) or live
     rollups.json   per family x size x rule set: n, min / median / max total, fully cleared, best chain
     rows/<family>-s<size>.txt  every chain as [ruleSet, mask, versions, total, catches, cleared], base64(gzip(JSON)), for search and lists
   Re-runnable: run it again as each size lands.  node tools/dexcore-summary.js <sumDir> <outDir> [--stored tt:22,21,20 ...] */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const [, , SUM, OUT, ...rest] = process.argv;
const ORDER = ['RB', 'Y', 'GS', 'C', 'RS', 'E', 'FRLG', 'DP', 'PT', 'HGSS', 'BW', 'B2W2', 'XY', 'ORAS', 'SM', 'USUM', 'LGPE', 'SWSH', 'BDSP', 'PLA', 'SV', 'LZA'];
const BIT = Object.assign(Object.fromEntries(ORDER.map((c, i) => [c, i])), { IOA: 22, CT: 23, TM: 24, ID: 25, MD: 26 });
const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); };
const stored = {}; for (let i = 0; i < rest.length; i++) if (rest[i] === '--stored') rest[i + 1].split(';').forEach(s => { const [f, l] = s.split(':'); stored[f] = new Set(l.split(',').map(Number)); });
const flagsOf = R => ['obey', 'vc', 'frlgSwitch', 'gifts', 'tms'].map(k => R[k] ? 1 : 0).join('') + '-d' + R.delta;
const FAM = { tt: { dir: 'tt', size: f => +f.match(/-s(\d+)-/)[1], expect: n => binom(22, n) },
  ps: { dir: 'postswitch2', size: () => 0, expect: () => 323 }, dlc: { dir: 'postswitch-dlc', size: () => 0, expect: () => 4050 } };
const RS = new Map(), rsIx = f => { if (!RS.has(f)) RS.set(f, RS.size); return RS.get(f); };
const man = { v: 1, built: new Date().toISOString(), families: {} }, roll = {};
fs.mkdirSync(path.join(OUT, 'rows'), { recursive: true });
for (const [fam, F] of Object.entries(FAM)) {
  const dir = path.join(SUM, F.dir); if (!fs.existsSync(dir)) continue;
  const bySize = {};
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f))), size = F.size(f), flags = flagsOf(j.rules);
    const S = bySize[size] ||= { shards: 0, shardsDone: 0, rs: {}, rows: [], byLen: {} };
    S.shards++; if (j.done === j.total) S.shardsDone++;
    const R = S.rs[flags] ||= { n: 0, totals: [], cleared: 0, best: null, shardsSeen: 0, shardsOf: j.shards || 1 };
    R.shardsSeen++;
    for (const [chain, total, catches, , cleared] of j.rows) {
      const codes = chain.map(c => String(c).split('@')[0]), vers = chain.map(c => +String(c).split('@')[1] || 1);
      const mask = codes.reduce((m, c) => m + 2 ** BIT[c], 0), all = cleared === codes.length;
      const add = R => { R.n++; R.totals.push(total); if (all) R.cleared++;
        if (all && (!R.best || total < R.best[1] || total === R.best[1] && catches < R.best[2])) R.best = [chain, total, catches]; };
      add(R); if (fam !== "tt") add((S.byLen[codes.length] ||= {})[flags] ||= { n: 0, totals: [], cleared: 0, best: null });
      S.rows.push([rsIx(flags), mask, vers.some(v => v !== 1) ? vers.join('') : 0, total, catches, cleared]);
    }
  }
  const fm = man.families[fam] = { sizes: {} };
  for (const [size, S] of Object.entries(bySize)) {
    const expect = F.expect(+size), rsDone = Object.values(S.rs).filter(r => r.shardsSeen >= r.shardsOf && r.n >= expect).length;
    fm.sizes[size] = { perRuleSet: expect, ruleSets: Object.keys(S.rs).length, ruleSetsDone: rsDone, chains: S.rows.length, expected: expect * 96,
      shards: S.shards, shardsDone: S.shardsDone, stored: !!(stored[fam] && stored[fam].has(+size)) || fam !== 'tt' };
    const sum = rs => Object.fromEntries(Object.entries(rs).map(([flags, R]) => { const t = R.totals.sort((a, b) => a - b);
      return [flags, { n: R.n, min: t[0], med: t[t.length >> 1], max: t[t.length - 1], cleared: R.cleared, best: R.best }]; }));
    roll[fam + (fam === 'tt' ? '-s' + size : '')] = sum(S.rs);
    for (const [len, rs] of Object.entries(S.byLen)) roll[fam + '-g' + len] = sum(rs);   // post-Switch and DLC: by number of games too
    // a file in the store holds at most 20 MiB: big sizes are written as parts (.p0, .p1, ...) of ~2M rows each; the page merges them
    const PART = 2e6, parts = Math.max(1, Math.ceil(S.rows.length / PART));
    for (let p = 0; p < parts; p++) {
      const txt = zlib.gzipSync(JSON.stringify({ v: 1, fam, size: +size, part: p, parts, ruleSets: [...RS.keys()], rows: S.rows.slice(p * PART, (p + 1) * PART) }), { level: 9 }).toString('base64');
      fs.writeFileSync(path.join(OUT, 'rows', fam + '-s' + size + (parts > 1 ? '.p' + p : '') + '.txt'), txt);
      console.error(fam, size, p + 1 + '/' + parts, Math.min(PART, S.rows.length - p * PART), 'rows', (txt.length / 1048576).toFixed(1) + ' MB');
    }
  }
}
man.ruleSets = [...RS.keys()];
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(man));
fs.writeFileSync(path.join(OUT, 'rollups.json'), JSON.stringify(roll));
console.error('rollups', (fs.statSync(path.join(OUT, 'rollups.json')).size / 1024).toFixed(0) + ' KB');
