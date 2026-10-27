/* GDex Run Planner engine (JS port of plan.py) — fewest catches to beat every story boss.
   Runs in a Web Worker (browser) or in Node (tests / precompute). Data = GDex's own files. */
'use strict';
const IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined' && typeof importScripts === 'undefined';
let BASE = 'data/';
const cache = {};
async function load(p) {
  if (cache[p]) return cache[p];
  if (IS_NODE) { const fs = require('fs'), path = require('path'); cache[p] = JSON.parse(fs.readFileSync(path.join(BASE, p), 'utf8')); }
  else { const r = await fetch(BASE + p); if (!r.ok) throw new Error(p + ' ' + r.status); cache[p] = await r.json(); }
  return cache[p];
}
let DEX, W, B, MV, STORY, MAP_OF, TMLOC, GAMES, CODE, SLOTS, BYNUM, CHART, MOVES, PK, MOVEID, EVO, LEARN = {}, MAPS = {}, RTDATA = {}, RIDATA = {};
const LOC_VG = { XD: 13, IOA: 20, CT: 20, TM: 25, ID: 25, MD: 30 };
const STARTERS = {
  RB: [1, 4, 7], FRLG: [1, 4, 7], Y: [25], LGPE: [25, 133],
  GS: [152, 155, 158], C: [152, 155, 158], HGSS: [152, 155, 158],
  RS: [252, 255, 258], E: [252, 255, 258], ORAS: [252, 255, 258],
  DP: [387, 390, 393], PT: [387, 390, 393], BDSP: [387, 390, 393],
  BW: [495, 498, 501], B2W2: [495, 498, 501], XY: [650, 653, 656],
  SM: [722, 725, 728], USUM: [722, 725, 728], SWSH: [810, 813, 816], IOA: [810, 813, 816], CT: [810, 813, 816],
  SV: [906, 909, 912], TM: [906, 909, 912], ID: [906, 909, 912], PLA: [722, 155, 501], LZA: [152, 498, 158],
  MD: [152, 498, 158], COLO: [196], XD: [133] };
const PAIR = { COLO: [197] };
const ROLE = {}; const PLA_ROLE = { 722: 0, 155: 1, 501: 2 }, LZA_ROLE = { 152: 0, 498: 1, 158: 2 };
for (const [code, l] of Object.entries(STARTERS)) if (l.length === 3 && !['PLA', 'LZA', 'MD'].includes(code)) l.forEach((n, i) => ROLE[code + '|' + n] = i);
let STARTER_LINE;
const PHYS_T = new Set(['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel']);
const MULTI = { 'double kick': 2, 'double hit': 2, 'dual chop': 2, 'twineedle': 2, 'bonemerang': 2, 'double iron bash': 2, 'dragon darts': 2,
  'fury attack': 3, 'fury swipes': 3, 'pin missile': 3, 'spike cannon': 3, 'barrage': 3, 'comet punch': 3, 'double slap': 3,
  'bullet seed': 3, 'icicle spear': 3, 'rock blast': 3, 'arm thrust': 3, 'bone rush': 3, 'tail slap': 3, 'water shuriken': 3,
  'scale shot': 3, 'triple kick': 3, 'triple axel': 3, 'population bomb': 4, 'surging strikes': 3 };
const FIXED = { 'seismic toss': 'lv', 'night shade': 'lv', 'dragon rage': 40, 'sonic boom': 20, 'psywave': 'lv' };
const SKIP = new Set(['self-destruct', 'selfdestruct', 'explosion', 'misty explosion', 'dream eater', 'focus punch', 'fake out', 'first impression',
  'snore', 'sleep talk', 'last resort', 'belch', 'synchronoise', 'fissure', 'guillotine', 'horn drill', 'sheer cold', 'endeavor',
  'final gambit', 'counter', 'mirror coat', 'metal burst', 'bide', 'natural gift', 'fling', 'spit up', 'steel beam', 'mind blown',
  'struggle', 'trump card', 'future sight', 'doom desire', 'sky drop', 'feint', 'present', 'beat up', 'magnitude', 'rollout',
  'ice ball', 'outrage', 'thrash', 'petal dance', 'uproar', 'echoed voice', 'round', 'fury cutter']);
const HALF = new Set(['hyper beam', 'giga impact', 'blast burn', 'hydro cannon', 'frenzy plant', 'rock wrecker', 'roar of time', 'prismatic laser',
  'eternabeam', 'meteor assault', 'solar beam', 'solarbeam', 'sky attack', 'skull bash', 'razor wind', 'solar blade', 'meteor beam',
  'freeze shock', 'ice burn', 'geomancy']);
const IMMUNE = { 'Levitate': 'Ground', 'Flash Fire': 'Fire', 'Water Absorb': 'Water', 'Volt Absorb': 'Electric', 'Motor Drive': 'Electric',
  'Sap Sipper': 'Grass', 'Storm Drain': 'Water', 'Lightning Rod': 'Electric', 'Dry Skin': 'Water', 'Earth Eater': 'Ground', 'Well-Baked Body': 'Fire' };
const EVO_OK_ITEM = /Stone|Apple|Pot|Galarica|Scroll|Tower|Ice Stone|Moon|Sun|Dusk|Dawn|Shiny/i;

const FOSSILS = new Set([138, 140, 142, 345, 347, 408, 410, 564, 566, 696, 698, 880, 881, 882, 883]);   // Omanyte ... Arctovish
/* obedience (Through Time, Oct 22 2026): the highest level a Pokémon from another save obeys, by badges held (index 0-8; 8 = all).
   Gen I-IV rise every second badge; Gen V on every badge; Alola by island (4 + the challenge); Legends by rank; SV by the level it was met at.
   Games with fewer story stages than 8 are scaled (badges x 8 / stages). Sources: Bulbapedia "Obedience", the badge lists. */
const OBEY = {
  KANTO: [10, 10, 30, 30, 50, 50, 70, 70, 100], HGSS: [10, 20, 30, 30, 50, 60, 70, 70, 100],
  BW: [10, 20, 30, 40, 50, 60, 70, 80, 100], KALOS: [20, 30, 40, 50, 60, 70, 80, 90, 100],
  ALOLA: [20, 35, 50, 65, 80], GALAR: [20, 25, 30, 35, 40, 45, 50, 55, 100],   // Alola: by islands cleared (4 grand trials); all only after the title
  PLA: [10, 20, 30, 40, 50, 65, 80, 80, 100], LZA: [20, 25, 30, 35, 40, 60, 70, 80, 100] };
const OBEY_OF = { RB: 'KANTO', Y: 'KANTO', FRLG: 'KANTO', LGPE: 'KANTO', GS: 'KANTO', C: 'KANTO', HGSS: 'HGSS', RS: 'KANTO', E: 'KANTO',
  DP: 'KANTO', PT: 'KANTO', BDSP: 'KANTO', BW: 'BW', B2W2: 'BW', XY: 'KALOS', ORAS: 'KALOS', SM: 'ALOLA', USUM: 'ALOLA',
  SWSH: 'GALAR', SV: 'GALAR', PLA: 'PLA', LZA: 'LZA' };
function obeyCap(code, badges, stages) {
  const name = OBEY_OF[code], t = OBEY[name]; if (!t) return 100;
  if (name === 'ALOLA') return t[Math.min(4, badges)];
  const s = Math.min(stages, 8);                                        // Johto games: the 8 Johto badges count; Kanto's come after
  if (badges >= s) return 100;
  return t[s === 8 ? badges : Math.floor(badges * 8 / Math.max(1, s))];
}
async function init(base) {
  if (base) BASE = base;
  if (DEX) return;
  [DEX, W, B, MV, TMLOC] = await Promise.all(['dex.json', 'where.json', 'bosses.json', 'moves.json', 'tmloc.json'].map(load));
  const P = await load('planner.json'); STORY = P.story; MAP_OF = P.mapof;
  GAMES = DEX.games; CODE = GAMES.map(g => g.code);
  SLOTS = {}; BYNUM = {};
  for (const s of DEX.slots) { SLOTS[s.id] = s; (BYNUM[s.n] = BYNUM[s.n] || []).push(s); }
  CHART = DEX.chart; MOVES = {}; for (const [k, v] of Object.entries(MV.moves)) MOVES[+k] = v;
  PK = MV.pk || {}; MOVEID = {}; for (const [k, v] of Object.entries(MOVES)) MOVEID[v[0].toLowerCase()] = +k;
  EVO = {}; for (const e of DEX.evo) (EVO[e[0]] = EVO[e[0]] || []).push([e[1], e[3]]);
  STARTER_LINE = {};
  for (const [code, l] of Object.entries(STARTERS)) for (const n of l) for (const x of lineOf(n)) STARTER_LINE[code + '|' + x] = n;
  try { RTDATA = await load('route-trainers.json'); } catch { RTDATA = {}; }
  try { RIDATA = await load('route-items.json'); } catch { RIDATA = {}; }
}
async function MAP(r) { if (!MAPS[r]) MAPS[r] = await load('maps/' + r + '.json'); return MAPS[r]; }
async function loadLearn(n) { const k = Math.floor((n - 1) / MV.chunk); if (!LEARN[k]) LEARN[k] = await load('learn/' + String(k).padStart(2, '0') + '.json'); }
function learnset(slotId, n, vg) {
  const k = Math.floor((n - 1) / MV.chunk), L = LEARN[k]; if (!L) return {};
  const pid = String(PK[slotId] != null ? PK[slotId] : n);
  const d = L[pid] || L[String(n)] || {};
  return d[String(vg)] || {};
}
function lineOf(n) { const out = [n], todo = [n]; while (todo.length) { const x = todo.pop(); for (const [t] of EVO[x] || []) { out.push(t); todo.push(t); } } return out; }
const base = n => (BYNUM[n] || []).find(x => x.k === 'base') || (BYNUM[n] || [])[0] || null;

function typesIn(types, gen) {
  let t = [...types];
  if (gen < 6) t = t.map(x => x === 'Fairy' ? 'Normal' : x);
  if (gen === 1) { t = t.filter(x => x !== 'Steel' && x !== 'Dark'); if (!t.length) t = ['Normal']; }
  return [...new Set(t)];
}
function mtype(mid, gen) {
  const m = MOVES[mid]; let t = m[1];
  if (gen < 6 && t === 'Fairy') t = 'Normal';
  if (gen === 1 && ['Bite', 'Gust', 'Karate Chop', 'Sand Attack'].includes(m[0])) t = 'Normal';
  return t;
}
function eff(at, dtypes) { let x = 1.0; for (const d of dtypes) { const r = (CHART[at] || {})[d]; x *= r == null ? 1.0 : r; } return x; }
// ev: EVs (Gen 3+) or stat experience (Gen 1-2) per stat, [hp, atk, def, spa, spd, spe]; only Minimum battles passes them
function stats(slot, lv, gen, iv, ev) {
  const b = slot.s;
  if (gen <= 2) {
    const dv = iv == null ? 8 : iv, se = i => ev ? Math.floor(Math.ceil(Math.sqrt(ev[i])) / 4) : 0;
    const hp = Math.floor(((b[0] + dv) * 2 + se(0)) * lv / 100) + lv + 10;
    const o = b.slice(1).map((x, i) => Math.floor(((x + dv) * 2 + se(i + 1)) * lv / 100) + 5);
    if (gen === 1) o[3] = o[2];
    return [hp, ...o];
  }
  const v = iv == null ? 15 : iv, e = i => ev ? Math.floor(ev[i] / 4) : 0;
  return [Math.floor((2 * b[0] + v + e(0)) * lv / 100) + lv + 10, ...b.slice(1).map((x, i) => Math.floor((2 * x + v + e(i + 1)) * lv / 100) + 5)];
}
function dmg(att, mid, defn, gen, roll) {
  const m = MOVES[mid], name = m[0].toLowerCase(), p = m[3] || 0, t = mtype(mid, gen);
  if (name in FIXED) { const v = FIXED[name] === 'lv' ? att.lv : FIXED[name]; return eff(t, defn.types) === 0 ? 0 : v; }
  if (!p || m[2] === 2 || SKIP.has(name)) return 0;
  const cat = gen <= 3 ? (PHYS_T.has(t) ? 0 : 1) : m[2];
  const A = cat === 0 ? att.st[1] : att.st[3], D = cat === 0 ? defn.st[2] : defn.st[4];
  const bse = Math.floor(Math.floor(Math.floor(2 * att.lv / 5 + 2) * p * A / Math.max(1, D)) / 50) + 2;
  let e = eff(t, defn.types);
  if (IMMUNE[defn.ability] === t) e = 0;
  if (defn.ability === 'Wonder Guard' && e <= 1) e = 0;
  let stab = att.types.includes(t) ? 1.5 : 1.0;
  if (stab > 1 && att.ability === 'Adaptability') stab = 2.0;
  let v = bse * stab * e * roll * (MULTI[name] || 1);
  if (HALF.has(name)) v /= 2;
  return v;
}
function mon(slot, lv, gen, moves, ability, item, iv, ev) {
  return { slot, lv, st: stats(slot, lv, gen, iv, ev), types: typesIn(slot.t, gen), moves, ability: gen >= 3 ? (ability || '') : '', item: item || '' };
}
// damage rolls assumed (Oct 26 2026, speedrun idea 8): [ours, theirs]. Safe = our lowest roll vs their full damage (the planner's rule);
// Average = both 92.5%; Bold = our full roll vs their lowest. planGame sets it from o.risk; safeWins re-checks a line at Safe.
const ROLLS = { safe: [0.85, 1.0], avg: [0.925, 0.925], bold: [1.0, 0.85] };
let ROLL = ROLLS.safe;
function safeWins(us, hp, foe, gen) { if (ROLL === ROLLS.safe) return true; const r = ROLL; ROLL = ROLLS.safe; const w = duel(us, hp, foe, gen)[0]; ROLL = r; return w; }
function best(att, defn, gen, ours) {
  let bv = 0, bm = null;
  for (const mid of att.moves) {
    const acc = MOVES[mid][4] || 100;
    const v = dmg(att, mid, defn, gen, ours ? ROLL[0] : ROLL[1]) * (ours ? Math.min(acc, 100) / 100 : 1);
    if (v > bv) { bv = v; bm = mid; }
  }
  return [bv, bm];
}
function duel(us, hpUs, foe, gen) {
  const [d1, m1] = best(us, foe, gen, true), [d2] = best(foe, us, gen, false);
  let fhp = foe.st[0]; const it = foe.item || '';
  if (it === 'Sitrus Berry') fhp += foe.st[0] * (gen >= 4 ? 0.25 : 0) + (gen === 3 ? 30 : 0);
  else if (it === 'Oran Berry' || it === 'Berry') fhp += 10;
  else if (it === 'Gold Berry') fhp += 30;
  if (d1 <= 0) return [false, 0, 99, 1, null];
  let n1 = Math.ceil(fhp / d1);
  // a foe whose every move is one the model skips (Explosion, Counter, Mirror Coat...) deals 0 here, but it is not a free win: it
  // explodes, counters or outlasts you. More than 12 hits to drop it, or a foe 15+ levels above you with no modelled move, is a loss
  // (error sweep, Oct 24 2026: a Lv 5 Grookey "beat" a Lv 65 Weezing)
  if (d2 <= 0 && (n1 > 12 || foe.lv >= us.lv + 15)) return [false, 0, n1, 1, m1];
  const n2 = d2 > 0 ? Math.ceil(hpUs / d2) : 999;
  const first = us.st[5] > foe.st[5];
  if (us.ability === 'Truant') n1 = 2 * n1 - 1;
  const turns = first ? n1 - 1 : n1;
  const hits = foe.ability === 'Truant' ? Math.floor((turns + 1) / 2) : turns;
  if (hits >= n2) return [false, 0, n1, n2, m1];
  return [true, hpUs - hits * d2, n1, n2, m1];
}
function evolvePath(slot0, code) {
  const out = [];
  const formOf = (n, bs) => {
    const c = BYNUM[n] || [], fm = bs.forme;
    if (code === 'PLA') { const h = c.filter(x => x.forme === 'Hisui'); if (h.length && [724, 157, 503, 59, 101, 211, 215, 549, 571, 628, 705, 706, 713].includes(n)) return h[0]; }
    if (['Alola', 'Galar', 'Hisui', 'Paldea'].includes(fm)) { const s = c.filter(x => x.forme === fm); if (s.length) return s[0]; }
    const b = c.filter(x => x.k === 'base'); return (b.length ? b : c.length ? c : [null])[0];
  };
  // regional forms evolve along their own line (Oct 24 2026): a Hisuian Sneasel never becomes Weavile and a Johto one never Sneasler;
  // likewise Galar's Obstagoon, Perrserker, Cursola, Sirfetch'd, Mr. Rime and Runerigus, Hisui's Overqwil and Basculegion, Paldea's Clodsire
  const REGIONAL = ['Alola', 'Galar', 'Hisui', 'Paldea'];
  const walk = (slot, path) => {
    const nxt = (EVO[slot.n] || []).map(([t, how]) => [formOf(t, slot), how, t]).filter(([s, , t]) => { if (!s) return false;
      const need = FORM_ONLY[t]; if (need) return slot.forme === need;
      return !(REGIONAL.includes(slot.forme) && s.forme !== slot.forme); });
    if (!nxt.length) { out.push(path); return; }
    for (const [s, how] of nxt) walk(s, path.concat([[s, how]]));
  };
  walk(slot0, [[slot0, '']]);
  return out;
}
function evoReached(how, lv, caughtLv, bossesSince, stage, trades) {
  const m = /^Level (\d+)/.exec(how); if (m) return lv >= +m[1];
  if (how.startsWith('Trade')) return trades;
  if (how.startsWith('Level Up') || how.startsWith('LvN')) return bossesSince >= 1 && lv >= caughtLv + 5;
  if (EVO_OK_ITEM.test(how)) return stage >= 3;
  return false;
}
function levelMoves(lv, vg, pathSlots) {
  const seen = [];
  for (const s of pathSlots) for (const [mid, l] of learnset(s.id, s.n, vg).L || []) if (l <= lv && MOVES[mid] && !seen.includes(mid)) seen.push(mid);
  return seen;
}
const r2 = x => Math.round(x * 100) / 100;

/* ---------- Minimum battles (Oct 23 2026, Hoss: "a minimum battle run button"): levels come from the XP of the battles you
   actually fight, not "the boss's ace + the margin". The story is walked boss by boss; before each boss, battles are added only
   until the team clears it: free items first (Rare Candies, Exp. Candies, vitamins found on the way), then the route trainer worth
   the most XP that can be beaten, then wild battles at the best spot open by then. Bosses always count, and so does every wild
   catch. XP: Gens 1-4 and 6 flat (base XP x level / 7, trainers x1.5); Gens 5 and 7+ scaled by the level gap (Gen 5 trainers
   x1.5; no trainer bonus from Gen 7). Exp. Share: none in Gens 1-5 (the member that needs levels fights alone); from Gen 6 on (the
   item in Gens 6-7, always on from Let's Go) the rest of the team gets half (Bulbapedia, Exp. Share). EVs (Gen 1-2 stat experience)
   from every Pokémon beaten, by whoever gets its XP. Let's Go has no wild battles: its wild XP comes from catching (encounters).
   Base XP yields are the modern ones; IVs as in the rest of the engine. ---------- */
const GROW = { Fast: n => 4 * n ** 3 / 5, Medium: n => n ** 3, 'Med. Slow': n => 6 / 5 * n ** 3 - 15 * n ** 2 + 100 * n - 140, Slow: n => 5 * n ** 3 / 4,
  Erratic: n => n <= 50 ? n ** 3 * (100 - n) / 50 : n <= 68 ? n ** 3 * (150 - n) / 100 : n <= 98 ? n ** 3 * Math.floor((1911 - 10 * n) / 3) / 500 : n ** 3 * (160 - n) / 100,
  Fluctuating: n => n <= 15 ? n ** 3 * (Math.floor((n + 1) / 3) + 24) / 50 : n <= 36 ? n ** 3 * (n + 14) / 50 : n ** 3 * (Math.floor(n / 2) + 32) / 50 };
const expAt = (gr, n) => n <= 1 ? 0 : Math.max(0, Math.floor((GROW[gr] || GROW.Medium)(n)));
const lvAt = (gr, xp) => { let n = 1; while (n < 100 && expAt(gr, n + 1) <= xp) n++; return n; };
const EVI = { HP: 0, Attack: 1, Defense: 2, 'Sp. Atk': 3, 'Sp. Def': 4, Speed: 5 };
function evYield(n) {
  const out = [0, 0, 0, 0, 0, 0];
  for (const p of String((DEX.species[String(n)] || {}).ev || '').split(',')) { const m = /(\d+)\s+(.+)/.exec(p.trim()); if (m && m[2] in EVI) out[EVI[m[2]]] += +m[1]; }
  return out;
}
function xpGain(gen, n, lFoe, lUs, trainer) {
  const b = (DEX.species[String(n)] || {}).exp || 50;
  if (gen === 5 || gen >= 7) { let x = Math.floor(b * lFoe / 5 * Math.pow((2 * lFoe + 10) / (lFoe + lUs + 10), 2.5)) + 1; if (gen === 5 && trainer) x = Math.floor(x * 1.5); return x; }
  const x = Math.floor(b * lFoe / 7); return trainer ? Math.floor(x * 1.5) : x;
}
const CANDY_XP = { 'Exp. Candy XS': 100, 'Exp. Candy S': 800, 'Exp. Candy M': 3000, 'Exp. Candy L': 10000, 'Exp. Candy XL': 30000 };
const VITAMIN = { 'HP Up': 0, Protein: 1, Iron: 2, Calcium: 3, Zinc: 4, Carbos: 5 };
const GRIND = new Set(['Grass', 'Wild', 'Dark grass', 'Surfing', 'Old Rod', 'Good Rod', 'Super Rod', 'Fishing', 'Seen', 'Wandering', 'Rough terrain', 'Flowers', 'Walking']);
const CATCH_FREE = new Set(['Gift', 'Egg', 'In-game trade', 'Starter']);   // no battle to get these
const RT_CAP = 10;   // a route trainer more than this many levels above the next boss's strongest Pokémon is a post-game team
// starting levels that aren't 5 (only Minimum battles uses them; the fewest-catches plan sets levels from the bosses):
// Colosseum's Espeon Lv 25 and Umbreon Lv 26, XD's Eevee Lv 10 (bug sweep, Oct 23 2026)
const START_LV = { 'COLO|STARTER': 25, 'COLO|PAIR': 26, 'XD|STARTER': 10 };
// bosses the boss list has more than once that are one battle (bug sweep, Oct 23 2026; Minimum battles only, the fewest-catches plan
// is unchanged). One of: the rival is May or Brendan (Urbain or Taunie) by the player's gender, and Striaton's leader is the one
// strong against your starter. Together: one double battle against two trainers. Matched by place and top level.
const BOSS_ONE_OF = { RS: [['May', 'Brendan']], E: [['May', 'Brendan']], ORAS: [['May', 'Brendan']], LZA: [['Urbain', 'Taunie']], BW: [['Chili', 'Cress', 'Cilan']] };
const STRIATON = { 495: 'Chili', 498: 'Cress', 501: 'Cilan' };
const BOSS_DOUBLE = { LGPE: [['Jessie', 'James']], PT: [['Mars', 'Jupiter']] };
// areas the story table places before the Elite Four that open only after it (bug sweep, Oct 23 2026): Route 224 needs the National Dex
const POST_AREAS = { DP: ['ROUTE_224'], PT: ['ROUTE_224'], BDSP: ['ROUTE_224'] };
// ELSE_ map sections the story walks through, with their badge stage (the maps mark them ELSE_ because they are off the overworld grid):
// the Hoenn team hideouts, entered after the 6th badge at Lilycove (Magma's in Emerald is the Jagged Pass one, after the 4th)
// story flags: a gate's name runs to the next flag ('gate:ROCK SMASH' is one gate; Oct 24 2026: it used to split into ROCK + SMASH, so no
// two-word gate ever registered), and Let's Go's secret techniques stand in for the HMs they replace
const FORM_ONLY = { 862: 'Galar', 863: 'Galar', 864: 'Galar', 865: 'Galar', 866: 'Galar', 867: 'Galar', 903: 'Hisui', 904: 'Hisui', 980: 'Paldea', 902: 'White-Striped' };
const GATE_ALIAS = { 'SEA SKIM': 'SURF', 'CHOP DOWN': 'CUT', 'STRONG PUSH': 'STRENGTH', 'LIGHT UP': 'FLASH', 'SKY DASH': 'FLY', 'BICYCLE': 'BIKE', 'MACH BIKE': 'BIKE', 'ACRO BIKE': 'BIKE',
  'LAPRAS PADDLE': 'SURF', 'SHARPEDO JET': 'DIVE', 'MACHAMP SHOVE': 'STRENGTH', 'TAUROS CHARGE': 'ROCK SMASH', 'CHARIZARD GLIDE': 'FLY', 'ROTOM BIKE WATER MODE': 'SURF' }, FLAG_WORDS = new Set(['gym', 'trial', 'e4', 'post', 'fly']);
function flagsOf(s) { const t = String(s || '').split(/\s+/).filter(Boolean), out = []; for (let i = 0; i < t.length; i++) { let f = t[i]; if (f.startsWith('gate:')) while (i + 1 < t.length && !t[i + 1].includes(':') && !FLAG_WORDS.has(t[i + 1])) f += ' ' + t[++i]; out.push(f); } return out; }
const ELSE_STORY = { RS: { ELSE_AQUA_HIDEOUT: 6, ELSE_MAGMA_HIDEOUT: 6 }, E: { ELSE_AQUA_HIDEOUT: 6, ELSE_MAGMA_HIDEOUT: 4 }, ORAS: { ELSE_AQUA_HIDEOUT: 6, ELSE_MAGMA_HIDEOUT: 6 } };

/* opts: {delta, version, trades, gifts, events, legends, tms, starter, onProgress,
          carry: [{id, lv, at}] Pokémon brought from earlier games (free team members from story stage `at`), obey: false ignores obedience} */
async function planGame(code, opts = {}) {
  await init();
  const o = Object.assign({ delta: 2, version: 1, trades: false, gifts: true, events: false, legends: false, tms: false, starter: null, carry: [], obey: true }, opts);
  const delta = o.delta, version = o.version, trades = o.trades; ROLL = ROLLS[o.risk] || ROLLS.safe;
  const gi = CODE.indexOf(code), g = GAMES[gi], gen = g.gen;
  const vg = LOC_VG[code] || (MV.games.find(x => x[1] === g.name) || [])[0];
  const vname = g.vers ? (g.vers[version - 1] || '') : '';
  for (const r of MAP_OF[code] || []) await MAP(r);
  // stages
  const stage = {}; let nStage = 0, nGyms = 0; const gates = {}; const stopsOf = {}; let idx = 0;   // nGyms: badge stages only (obedience)
  for (const [region, stops] of Object.entries(STORY[code] || {})) for (const st of stops) {
    const sec = st[0], fl = st.length > 2 && st[2] ? flagsOf(st[2]) : [];
    const key = region + '|' + sec; (stopsOf[key] = stopsOf[key] || []).push([idx, nStage, fl]); idx++;
    for (const f of fl) if (f.startsWith('gate:')) { const gk = f.slice(5).toUpperCase(); if (!(gk in gates)) gates[gk] = nStage; const al = GATE_ALIAS[gk]; if (al && !(al in gates)) gates[al] = nStage; }
    if (!(key in stage)) stage[key] = fl.includes('post') ? 99 : nStage;
    if (fl.includes('gym') || fl.includes('trial')) { nStage++; nGyms++; }
    if (fl.includes('e4')) nStage++;
  }
  const surf = 'SURF' in gates ? gates.SURF : 3, smash = 'ROCK SMASH' in gates ? gates['ROCK SMASH'] : surf, e4Stage = nStage;
  const placeStage = {}, nameStage = [], secSt = {};   // secSt: each map section's own story stage
  for (const region of MAP_OF[code] || []) {
    const mp = MAPS[region], cells = {};
    for (const c of mp.cells) (cells[c[2]] = cells[c[2]] || []).push([c[0], c[1]]);
    const known = {}; for (const s of Object.keys(mp.secs)) if ((region + '|' + s) in stage) known[s] = stage[region + '|' + s];
    for (const [s, v] of Object.entries(mp.secs)) {
      let st_;
      if (s in known) st_ = known[s];
      else {
        const dist = [];
        for (const [k, kv] of Object.entries(known)) {
          let md = Infinity; for (const a of cells[s] || []) for (const b of cells[k] || []) md = Math.min(md, Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]));
          if (md < Infinity) dist.push([md, kv]);
        }
        // the nearest story stops decide; among them a post-game (99) neighbour never pulls a story area to 99, but a section whose
        // nearest stops are all post-game is post-game (error sweep, Oct 24 2026: BDSP Route 220 is story, Black City is not)
        if (dist.length) { const d0 = Math.min(...dist.map(x => x[0])), near = dist.filter(x => x[0] <= d0 + 1), story = near.filter(x => x[1] < 99);
          st_ = story.length ? Math.max(...story.map(x => x[1])) : 99; } else st_ = 99;
        // ELSE_ sections are off the story, except the ones the story walks through (ELSE_STORY): the Hoenn team hideouts
        if (s.startsWith('ELSE_')) st_ = (ELSE_STORY[code] || {})[s] ?? 99;
      }
      for (const p of v.places || []) placeStage[p] = Math.min(placeStage[p] == null ? 99 : placeStage[p], st_);
      secSt[s] = Math.min(secSt[s] == null ? 99 : secSt[s], st_);
      const gymStops = (stopsOf[region + '|' + s] || []).filter(x => x[2].includes('gym') || x[2].includes('trial'));
      const gymS = gymStops.length ? gymStops[0][1] + 1 : st_ + 1;
      nameStage.push([v.name, st_, v.kind, gymS]); for (const p of v.places || []) nameStage.push([p, st_, v.kind, gymS]);
    }
  }
  // Route trainers: section -> stage mapping, grouped for results
  const secStage = {};
  for (const region of MAP_OF[code] || []) { const mp = MAPS[region];
    for (const [s, v] of Object.entries(mp.secs)) { let st = 99; for (const p of v.places || []) if (placeStage[p] != null) st = Math.min(st, placeStage[p]);
      if (!(v.places || []).length) st = secSt[s] == null ? 99 : secSt[s];   // a town with no wild Pokémon: its own stage (its gym trainers were left out; bug sweep, Oct 24 2026)
      secStage[s] = Math.min(secStage[s] == null ? 99 : secStage[s], st); } }
  for (const s of POST_AREAS[code] || []) secStage[s] = 99;   // trainers and items only; wild catches keep the story table's stage
  const rtGame = RTDATA[code] || {}, rtBySec = [];
  const rtNorm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [sec, trs] of Object.entries(rtGame)) { const st = secStage[sec]; if (st == null || st >= 99) continue;
    const secName = nameStage.find(ns => ns[0] && rtNorm(ns[0]) === rtNorm(sec.replace(/_/g, ' ')));
    let lvs = []; for (const t of trs) for (const m of t.t) lvs.push(m[2] || 5);
    rtBySec.push({ sec, stage: st, name: secName ? secName[0] : sec.replace(/_/g, ' '), count: trs.length, mons: lvs.length, lvMin: Math.min(...lvs), lvMax: Math.max(...lvs),
      trainers: trs.map(t => ({ c: t.c, n: t.n, t: t.t.map(m => [m[0], m[2] || 5]) })) }); }
  rtBySec.sort((a, b) => a.stage - b.stage || a.sec.localeCompare(b.sec));

  // TMs: where each TM is found -> the first stage you can have it
  const tmStage = {}, tmInfo = [];
  if (o.tms) {
    const labels = (MV.tm || {})[vg] || {}, where = ((TMLOC.loc || {})[vg]) || {};
    const names = nameStage.filter(([n]) => n && n.length > 3).sort((a, b) => b[0].length - a[0].length);
    for (const [mid, lab] of Object.entries(labels)) {
      const txt = where[lab]; if (!txt || /Not in this game/i.test(txt)) continue;
      let rest = txt; const hits = [];
      for (const [nm, s, kind, gymS] of names) if (rest.includes(nm)) {
        const after = rest.slice(rest.indexOf(nm) + nm.length, rest.indexOf(nm) + nm.length + 8);
        hits.push([/Gym/i.test(after) || (/Gym/i.test(txt) && kind === 'town' && txt.split(',').length === 1) ? gymS : s, kind]); rest = rest.split(nm).join(' '); }
      const wild = hits.filter(h => h[1] !== 'town');                     // a pickup spot beats a shop / TM-machine town
      const use = wild.length ? wild : hits;
      const bestS = use.length ? Math.min(...use.map(h => h[0])) : 99;
      if (bestS < 99) { tmStage[+mid] = bestS; tmInfo.push([lab, MOVES[+mid] ? MOVES[+mid][0] : '', txt, bestS]); }
    }
  }
  // bosses
  const allstops = Object.values(stopsOf).flat().sort((a, b) => a[0] - b[0]);
  const e4s = allstops.find(x => x[2].includes('e4')); const e4stop = e4s ? [e4s[0], e4s[1]] : [1e5, nStage];
  const gb = []; B.forEach((b, i) => { if (b.game === code) gb.push([i, b]); });
  const lpc = {}; for (const [, b] of gb) { const ord = b.order || 0; if (ord >= 20 && ord <= 24 && !b.rematch) lpc[b.place] = (lpc[b.place] || 0) + 1; }
  let lpBest = null; for (const [p, c] of Object.entries(lpc)) if (lpBest === null || c > lpc[lpBest]) lpBest = p;
  const leaguePlace = new Set(lpBest ? [lpBest] : []);
  const secOf = {};
  for (const region of MAP_OF[code] || []) for (const [sec, v] of Object.entries(MAPS[region].secs)) for (const bi of v.bosses || []) if (!(bi in secOf)) secOf[bi] = region + '|' + sec;
  const bossAt = {};
  for (const [i, b] of gb) {
    let ord = b.order || 0;
    if ((ord >= 20 && ord <= 24 || b.cls === 'Champion' || b.cls === 'Elite Four') && leaguePlace.has(b.place)) {
      bossAt[i] = [e4stop[0] + (Math.max(ord, 20) - 20) * 0.01 + (b.cls === 'Champion' ? 0.04 : 0), e4stop[1]]; continue; }
    if (ord < 20 && e4stop[0] < 1e5) ord = Math.min(ord, Math.max(0, e4stop[1] - 1));
    const st_ = stopsOf[secOf[i]] || [];
    const gymst = (['Leader', 'Gym Leader', 'Kahuna', 'Trial Captain'].includes(b.cls) || b.place.includes('Gym')) ? st_.filter(x => x[2].includes('gym') || x[2].includes('trial')) : [];
    if (gymst.length) { bossAt[i] = [gymst[0][0], gymst[0][1]]; continue; }
    const later = st_.filter(x => x[1] >= ord && x[0] < e4stop[0]);
    if (later.length) { bossAt[i] = [later[0][0], Math.max(later[0][1], ord)]; continue; }
    let nxt = (allstops.find(x => x[1] > ord) || [e4stop[0]])[0];
    if (ord <= e4stop[1]) nxt = Math.min(nxt, e4stop[0]);
    bossAt[i] = [nxt - 0.5, ord];
  }
  const blist = gb.filter(([, b]) => !b.rematch && ((b.order || 0) < 20 || ((b.order || 0) <= 24 && leaguePlace.has(b.place)))
    && !['Legendary', 'Legendary Pokémon', 'Wanderer'].includes(b.cls));
  // catchable lines
  const cands = new Map(), grind = [];
  for (const [ns, rows] of Object.entries(W.rows)) {
    const n = +ns;
    for (const r of rows) {
      if (r[0] !== gi) continue;
      if (r[7] && r[7] !== version) continue;
      const note = r.length > 8 ? r[8] : '';
      if (note === 'Never') continue;
      if (note === 'Event' && !o.events) continue;
      const meth = W.methods[r[2]], pl = W.places[r[1]];
      if (!o.gifts && (meth === 'Gift' || meth === 'Egg')) continue;
      let s = placeStage[pl] == null ? 99 : placeStage[pl];
      if (['Surfing', 'Rippling water', 'Diving', 'Super Rod', 'Fishing', 'Bubbles'].includes(meth)) s = Math.max(s, surf);
      if (meth === 'Old Rod') s = Math.max(s, 2);
      if (meth === 'Good Rod') s = Math.max(s, 3);
      if (meth === 'In-game trade' && !trades) continue;
      if (meth === 'Rock Smash') s = Math.max(s, smash);
      if (/\bBack/.test(pl)) s = Math.max(s, 'WATERFALL' in gates ? gates.WATERFALL : e4Stage);
      if (meth === 'Headbutt') s = Math.max(s, 2);
      if (note.includes('National Dex') || note.includes('Post') || note.includes('Rematch')) s = 99;
      // Let's Go's flying sky spawns (Charizard, Dragonite, the legendary birds: 'Rare', level-scaled 3-56) only appear after
      // the Champion fight (Oct 15 2026: a Route 1 Dragonite was being picked before Brock)
      if (code === 'LGPE' && meth === 'Rare' && r[4] && r[4] <= 5 && r[5] >= 50) s = 99;
      // fossils: a revive needs the fossil first, which most games hand out late; same rule as GDex's boss cards (Oct 15 2026)
      if (FOSSILS.has(n) && (meth === 'Gift' || meth === 'One-time encounter')) s = Math.max(s, e4Stage);
      const m2 = /After (\d+) badges/.exec(note); if (m2) s = Math.max(s, +m2[1]);
      if (s < 99 && GRIND.has(meth) && !(r[6] && r[6] < 5) && !(DEX.species[String(n)] || {}).legend && !/alpha/i.test(note))   // spots to level up at (alphas' boosted stats are not modelled)
        grind.push([s, n, r[4] && r[5] ? (r[5] - r[4] > 10 ? r[4] : Math.round((r[4] + r[5]) / 2)) : (r[4] || r[5] || 5), pl, meth]);   // a wide range folds in post-game levels: its lowest
      if (s >= 99) continue;
      const slotId = r.length > 9 && r[9] ? r[9] : null;
      const slot = slotId ? SLOTS[slotId] : base(n);
      if (!slot) continue;
      if (STARTER_LINE[code + '|' + n] != null) continue;
      if ((meth === 'Gift' || meth === 'One-time encounter') && Object.keys(STARTERS).some(g2 => STARTER_LINE[g2 + '|' + n] != null)) continue;
      if (!o.legends && (DEX.species[String(n)] || {}).legend) continue;
      const rate = r[6] || 0;
      let effort = ['Grass', 'Wild', 'Dark grass', 'Gift', 'Starter', 'In-game trade', 'One-time encounter', 'Surfing', 'Old Rod', 'Good Rod', 'Super Rod',
        'Fishing', 'Horde', 'Tree', 'Underground', 'Rock Smash', 'Headbutt'].includes(meth) ? 1 : 3;
      if (meth === 'In-game trade') effort += 2;                        // you catch the Pokémon you trade away too
      if (rate && rate < 10 && effort === 1) effort = 2;
      const lv = r[4] || r[5] || 5, key = slot.id, cur = cands.get(key);
      const cand = { slot, stage: s, lv, place: pl, method: meth, effort, rate, note, ver: r[7] };
      const lt = (a, b) => a.stage !== b.stage ? a.stage < b.stage : a.effort !== b.effort ? a.effort < b.effort : a.lv < b.lv;
      if (!cur || lt(cand, cur)) cands.set(key, cand);
    }
  }
  const needN = new Set(); for (const c of cands.values()) for (const x of lineOf(c.slot.n)) needN.add(x);
  for (const sn of STARTERS[code] || []) for (const x of lineOf(sn)) needN.add(x);
  for (const x of PAIR[code] || []) for (const y of lineOf(x)) needN.add(y);
  const carried = (o.carry || []).map(c => ({ c, slot: SLOTS[c.id] })).filter(x => x.slot);
  for (const { slot } of carried) needN.add(slot.n);
  for (const [, b] of gb) for (const m of b.team) needN.add(m.n);
  // Minimum battles: route trainers (beaten for XP), items on the way, the best wild spots by story stage
  const rtList = [], itemsAt = [];
  if (o.minBattles) {
    for (const r of rtBySec) for (const t of r.trainers) { rtList.push({ name: [t.c, t.n].filter(Boolean).join(' ') || 'Trainer', place: r.name, stage: r.stage, mons: t.t, top: Math.max(...t.t.map(m => m[1])) });
      for (const [n] of t.t) needN.add(n); }
    for (const [sec, item, qty, , ver, gate] of RIDATA[code] || []) { let st = secStage[sec]; if (st == null || st >= 99 || (ver && ver !== version)) continue;
      if (gate) { const gk = gate.toUpperCase(); st = Math.max(st, gk in gates ? gates[gk] : gk === 'SURF' ? surf : gk === 'ROCK SMASH' ? smash : e4Stage); }   // behind an HM or key item: from that gate's stage
      itemsAt.push([st, item, qty || 1, sec]); }
    itemsAt.sort((a, b) => a[0] - b[0]);
    // at each story stage: the 20 spots worth the most XP, and the 8 lowest-level ones (what a young team can actually beat)
    const seenG = new Set(), g2 = [], perStage = {}, lowStage = {}, xpOf = x => x[2] * ((DEX.species[String(x[1])] || {}).exp || 50);
    for (const x of grind.slice().sort((a, b) => xpOf(b) - xpOf(a))) {
      const k = x[0] + '|' + x[1] + '|' + x[2]; if (seenG.has(k) || (perStage[x[0]] || 0) >= 20) continue; seenG.add(k); perStage[x[0]] = (perStage[x[0]] || 0) + 1; g2.push(x); }
    for (const x of grind.slice().sort((a, b) => a[2] - b[2] || xpOf(b) - xpOf(a))) {
      const k = x[0] + '|' + x[1] + '|' + x[2]; if (seenG.has(k) || (lowStage[x[0]] || 0) >= 8) continue; seenG.add(k); lowStage[x[0]] = (lowStage[x[0]] || 0) + 1; g2.push(x); }
    grind.length = 0; grind.push(...g2); for (const x of grind) needN.add(x[1]);
  }
  for (const n of needN) await loadLearn(n);
  // group route trainers by boss stage for per-fight summaries
  const rtByFight = [];
  // XP density (Oct 26 2026, speedrun idea 14): XP per minute for one member fighting at the spot's own top level, trainers priced at
  // 38 s + 12 s a Pokémon, wild battles at 28 s each; the Run page's cost table. Stage = story stage (0 = before the first boss)
  function routeXp() {
    const out = [];
    // the strongest boss Pokémon at each story stage: a trainer far above the next boss is a post-game team in an early area (RT_CAP, as the walk does)
    const stAce = {}; for (const [i, b] of blist) { const st = bossAt[i] ? bossAt[i][1] : (b.order || 0), lv = Math.max(0, ...b.team.filter(m => m.lv >= 1).map(m => m.lv)); if (lv) stAce[st] = Math.max(stAce[st] || 0, lv); }
    const stK = Object.keys(stAce).map(Number).sort((a, b) => a - b), aceAt = st => { const k = stK.find(x => x >= st); return k == null ? 100 : stAce[k]; };
    for (const r of rtBySec) { if (r.stage >= 99) continue; let xp = 0, secs = 0, n = 0, lo = 100, hi = 0; const cap = aceAt(r.stage) + RT_CAP;
      for (const t of r.trainers) { const top = Math.max(...t.t.map(m => m[1] || 5)); if (top > cap) continue; n++; secs += 38 + t.t.length * 12;
        for (const [m, l] of t.t) { xp += xpGain(gen, m, l || 5, top, true); lo = Math.min(lo, l || 5); hi = Math.max(hi, l || 5); } }
      if (secs) out.push({ kind: 'trainers', name: r.name, stage: r.stage, n, lvMin: lo, lvMax: hi, xp, secs, xpm: Math.round(xp / secs * 60) }); }
    const best = {};
    for (const [st, n, l, pl] of grind) { if (st >= 99 || l > aceAt(st) + RT_CAP) continue; const x = xpGain(gen, n, l, l, false), k = pl + '|' + st;
      if (!best[k] || x > best[k].x) best[k] = { x, n, l, pl, st }; }
    for (const b of Object.values(best)) out.push({ kind: 'wild', name: b.pl, stage: b.st, mon: (BYNUM[b.n] && BYNUM[b.n][0] || {}).name || '', lvMin: b.l, lvMax: b.l, xp: b.x, secs: 28, xpm: Math.round(b.x / 28 * 60) });
    return out.sort((a, b) => a.stage - b.stage || b.xpm - a.xpm);
  }
  const results = { game: code, name: g.name, gen, version: vname, delta, opts: { trades, gifts: o.gifts, events: o.events, legends: o.legends, tms: o.tms }, starters: [],
    tm_list: tmInfo.sort((a, b) => a[3] - b[3] || a[0].localeCompare(b[0])), route_trainers: rtBySec, route_xp: routeXp() };

  // lvAt / ev: Minimum battles gives the level the XP reached and the EVs earned, instead of the boss's ace + the margin
  function buildMember(slot0, caughtLv, caughtStage, bossLv, bossOrder, path, lvAt_, ev) {
    const lv = lvAt_ != null ? lvAt_ : Math.max(caughtLv, bossLv + delta);
    let cur = slot0; const seen = [slot0]; const since = Math.max(0, bossOrder - caughtStage);
    for (const [s, how] of path.slice(1)) {
      if (!Object.keys(learnset(s.id, s.n, vg)).length) break;
      if (evoReached(how, lv, caughtLv, since, bossOrder, trades)) { cur = s; seen.push(s); } else break;
    }
    let moves = levelMoves(lv, vg, seen).filter(m => MOVES[m][3] || (MOVES[m][0].toLowerCase() in FIXED));
    const tmMoves = [];
    if (o.tms) for (const mid of learnset(cur.id, cur.n, vg).M || []) if (tmStage[mid] != null && tmStage[mid] <= bossOrder && MOVES[mid] && MOVES[mid][3] && !moves.includes(mid)) tmMoves.push(mid);
    moves = moves.concat(tmMoves);
    const m = mon(cur, lv, gen, moves, (cur.a || [''])[0], '', null, ev); m.tms = tmMoves; return m;
  }
  function bossMons(b) {
    const out = [];
    for (const m of b.team) {
      let sl = null; const list = BYNUM[m.n] || [];
      if (m.form) { const f = m.form.replace(/^-+|-+$/g, '').toLowerCase(); sl = list.find(x => (x.forme || '').toLowerCase().includes(f) || x.id.endsWith(f)) || null; }
      sl = sl || list.find(x => x.k === 'base') || list[0]; if (!sl) continue;
      if (!(m.lv >= 1)) continue;   // no level on record (LZA Ange's Floette): skip, not a Lv 0 foe
      let mids = (m.moves || []).map(x => MOVEID[x.toLowerCase()]).filter(Boolean);
      if (!mids.length) mids = (learnset(sl.id, sl.n, vg).L || []).slice().sort((a, b) => a[1] - b[1]).filter(z => z[1] <= m.lv).map(z => z[0]).slice(-4);
      const ab = m.ability || ((sl.a || []).filter(Boolean).join() === 'Truant' ? 'Truant' : '');
      out.push(mon(sl, m.lv, gen, mids, ab, m.item || '', gen <= 2 ? 9 : null));
    }
    return out;
  }
  function rivalOk(b, sn) {
    const v = b.version || ''; if (!v) return true;
    if (g.vers && g.vers.includes(v)) return v === vname;
    if (['Omega Ruby', 'Alpha Sapphire', 'Sword', 'Shield', 'Scarlet', 'Violet', 'Ultra Sun', 'Ultra Moon', 'Sun', 'Moon', 'Black', 'White', 'X', 'Y'].some(x => v.endsWith(x)))
      return !!vname && v.endsWith(vname);
    let mm = /(?:chose|vs) ([A-Za-zé]+)/.exec(v);
    if (mm) { const nm = mm[1].toLowerCase(); for (const n of STARTERS[code] || []) if (BYNUM[n][0].name.toLowerCase() === nm) return n === sn; return true; }
    mm = /with ([A-Za-zé]+)/.exec(v);
    if (mm) {
      const nm = mm[1].toLowerCase();
      for (const n of STARTERS[code] || []) {
        if (lineOf(n).some(x => BYNUM[x][0].name.toLowerCase() === nm)) {
          const roles = code === 'PLA' ? PLA_ROLE : (code === 'LZA' || code === 'MD') ? LZA_ROLE : Object.fromEntries(Object.entries(ROLE).filter(([k]) => k.startsWith(code + '|')).map(([k, v2]) => [+k.split('|')[1], v2]));
          const rr = roles[n], sr = roles[sn]; if (rr == null || sr == null) return true;
          return rr === (sr + 1) % 3;
        }
      }
      return true;
    }
    return true;
  }
  const starterList = (STARTERS[code] || []).filter(sn => !o.starter || sn === o.starter);
  let prog = 0;
  for (const sn of starterList) {
    const sslot = base(sn);
    const bosses = blist.filter(([, b]) => rivalOk(b, sn));
    const bkey = ([i, b]) => { const at = bossAt[i]; let k0 = at ? at[0] : 1e6 + (b.order || 0);
      if ((b.order || 0) < 20 && !leaguePlace.has(b.place) && k0 >= e4stop[0]) k0 = e4stop[0] - 0.1; return [k0, b.order || 0, i]; };
    bosses.sort((x, y) => { const a = bkey(x), b = bkey(y); for (let j = 0; j < 3; j++) if (a[j] !== b[j]) return a[j] - b[j]; return 0; });
    let bm = bosses.map(([i, b]) => [i, b, bossMons(b), Math.max(...b.team.filter(m => m.lv >= 1).map(m => m.lv))]).filter(x => x[2].length);   // a boss with no levelled Pokémon on record is left out
    const e4lv = bm.filter(([, b]) => b.cls === 'Elite Four' || ((b.order || 0) >= 20 && (b.order || 0) <= 23)).map(x => x[3]);
    if (e4lv.length) { const mid = e4lv.slice().sort((a, b) => a - b)[Math.floor(e4lv.length / 2)];
      bm = bm.filter(x => !(((x[1].order || 0) >= 20 || x[1].cls === 'Champion') && x[3] > mid + 15)); }
    const bstage = bm.map(([i, b]) => bossAt[i] ? bossAt[i][1] : (b.order || 0));
    const team0 = [{ key: 'STARTER', slot: sslot, paths: evolvePath(sslot, code), lv: 5, stage: 0, effort: 0 }];
    for (const extra of PAIR[code] || []) { const ps = base(extra); team0.push({ key: 'PAIR', slot: ps, paths: evolvePath(ps, code), lv: 25, stage: 0, effort: 0 }); }
    const nOwn = team0.length;                                          // starter (+ partner); carried Pokémon come after
    for (const { c, slot } of carried) team0.push({ key: 'CARRY', slot, paths: [evolvePath(slot, code)[0]], lv: c.lv, stage: c.at || 0, effort: 0, carry: c });   // it can still evolve here (one path)
    const candList = [...cands.entries()].map(([k, c]) => ({ key: k, slot: c.slot, paths: evolvePath(c.slot, code), lv: c.lv, stage: c.stage, effort: c.effort, info: c }));
    const memo = new Map();
    const memberAt = (ci, pi, k) => { const key = ci + ',' + pi + ',' + k; let v = memo.get(key);
      if (!v) { const c = ci < 0 ? team0[-ci - 1] : candList[ci]; v = buildMember(c.slot, c.lv, c.stage, bm[k][3], bstage[k], c.paths[pi]); memo.set(key, v); } return v; };
    const isCarry = m => { if (m[0] >= 0) return 0; const t = team0[-m[0] - 1]; return !t.carry ? 0 : t.carry.used ? 2 : 1; };   // 2: already counted in the chain
    // prefer: carried Pokémon take every foe they can beat (the count of Pokémon used stays low); only for describing a found team
    function clears(members, k, prefer, describe) {
      const foes = bm[k][2]; const hp = new Map(), us = new Map(), info = []; let worst = 1.0;
      for (const m of members) { const u = memberAt(m[0], m[1], k); us.set(m, u); hp.set(m, u.st[0]); }
      for (const f of foes) {
        const optsL = [];
        for (const m of members) { if (hp.get(m) <= 0) continue; const u = us.get(m);
          const [win, left, n1, n2, mv] = duel(u, hp.get(m), f, gen); if (win) optsL.push([left / u.st[0], m, left, n1, n2, mv]); }
        if (!optsL.length) return [false, 0, info];
        optsL.sort((a, b) => (prefer ? isCarry(b[1]) - isCarry(a[1]) : 0) || b[0] - a[0]); const [fr, m, left, n1, n2, mv] = optsL[0];
        const u = us.get(m), rk = describe && !safeWins(u, hp.get(m), f, gen);   // describe: only for a found team's fight list (keeps the search fast)
        hp.set(m, left); worst = Math.min(worst, fr);
        info.push([f.slot.name, f.lv, u.slot.name, u.lv, mv ? MOVES[mv][0] : '', n1, n2, r2(fr), u.tms && mv && u.tms.includes(mv), rk]);
      }
      return [true, worst, info];
    }
    function available(ci, k) {
      if (ci < 0) { const t = team0[-ci - 1]; if (!t.carry) return true;
        if (t.stage > bstage[k]) return false;                          // not transferred in yet
        return o.obey === false || t.lv <= obeyCap(code, bstage[k], nGyms); }   // too high a level for the badges: it won't obey
      const c = candList[ci];
      if (c.stage > bstage[k]) return false;
      if (!['Gift', 'One-time encounter', 'Starter'].includes(c.info.method) && c.lv > bm[k][3] + 3) return false;
      if ((c.info.method === 'Gift' || c.info.method === 'One-time encounter') && c.lv > bm[k][3] + 15) return false;
      return true;
    }
    const tkey = t => t.map(m => m[0] + ':' + m[1]).sort().join('|');
    const tok = new Map();
    function teamOk(team) {
      const key = tkey(team); if (tok.has(key)) return tok.get(key);
      let worst = 1.0, res = null;
      for (let k = 0; k < bm.length; k++) { const mem = team.filter(m => available(m[0], k)); const [ok, w] = clears(mem, k);
        if (!ok) { res = [false, k, 0]; break; } worst = Math.min(worst, w); }
      if (!res) res = [true, null, worst];
      tok.set(key, res); return res;
    }
    // starter path (branching starters such as Eevee)
    let bestBase = null;
    const combos = team0.reduce((acc, t) => acc.flatMap(c => t.paths.map((_, pi) => c.concat([pi]))), [[]]);
    for (const combo of combos) {
      const tm = combo.map((pi, t) => [-1 - t, pi]); const [ok, fk, w] = teamOk(tm);
      const score = [ok ? 1 : 0, fk != null ? fk : bm.length, w];
      if (!bestBase || score[0] > bestBase[0][0] || (score[0] === bestBase[0][0] && (score[1] > bestBase[0][1] || (score[1] === bestBase[0][1] && score[2] > bestBase[0][2])))) bestBase = [score, tm];
    }
    const baseTeam = bestBase[1];
    const [soloOk, firstFail, soloW] = teamOk(baseTeam);
    let soloClears = 0; for (let k = 0; k < bm.length; k++) if (clears(baseTeam.filter(m => available(m[0], k)), k)[0]) soloClears++;
    let useful = [];
    candList.forEach((c, ci) => { for (let pi = 0; pi < c.paths.length; pi++) { let hit = 0;
      for (let k = 0; k < bm.length; k++) { if (!available(ci, k)) continue; const u = memberAt(ci, pi, k);
        for (const f of bm[k][2]) if (duel(u, u.st[0], f, gen)[0]) hit++; }
      if (hit) useful.push([[ci, pi], hit]); } });
    useful.sort((a, b) => b[1] - a[1]); useful = useful.slice(0, 70).map(x => x[0]);
    // speedrun categories (Oct 26 2026, idea 4): o.maxCatches caps the catches (0 = starter only); o.onePerPlace allows one catch per place (the Nuzlocke first-encounter rule)
    const sols = [], MAXX = Math.min(6 - nOwn, o.maxCatches != null ? +o.maxCatches : 99), BRANCH = 12; let seenT = new Set();   // carried Pokémon don't use up catch slots (they wait in the box)
    const placeOf = ci => ci >= 0 ? ((candList[ci].info || {}).place || '') : '';
    function dfs(team, depth) {
      const [ok, fk, w] = teamOk(team);
      if (ok) { sols.push([team.length, team, w]); return; }
      if (depth === 0) return;
      let tried = 0;
      for (const cp of useful) {
        if (team.some(m => m[0] === cp[0])) continue;
        if (o.onePerPlace && cp[0] >= 0 && team.some(m => m[0] >= 0 && placeOf(m[0]) === placeOf(cp[0]))) continue;
        if (!available(cp[0], fk)) continue;
        const t2 = team.concat([cp]), sk = tkey(t2); if (seenT.has(sk)) continue; seenT.add(sk);
        if (!clears(t2.filter(m => available(m[0], fk)), fk)[0]) continue;
        tried++; dfs(t2, depth - 1);
        if (sols.length >= 20 || tried >= BRANCH) return;
      }
    }
    /* Minimum battles: one team walked through the story with real XP (see GROW / xpGain above) */
    let mbTarget = null; const mbCtx = { no: 0, of: 0, starter: '' };
    function simTeam(team) {
      const mem = team.map(([ci, pi]) => { const c = ci < 0 ? team0[-ci - 1] : candList[ci], gr = (DEX.species[String(c.slot.n)] || {}).growth || 'Medium';
        const lv0 = ci < 0 && !c.carry ? START_LV[code + '|' + c.key] || c.lv : c.lv;   // the level the game really hands it over at
        return { ci, pi, c, gr, lv: lv0, xp: expAt(gr, lv0), ev: [0, 0, 0, 0, 0, 0], joined: false }; });
      const evKey = ev => gen <= 2 ? ev.map(x => Math.floor(Math.ceil(Math.sqrt(x)) / 4)).join() : ev.map(x => x >> 2).join();
      const mm = new Map();
      let stK = 0;   // the story stage reached so far (it only moves forward)
      const monOf = m => { const key = m.ci + ',' + m.pi + ',' + stK + ',' + m.lv + ',' + evKey(m.ev); let v = mm.get(key);
        if (!v) { v = buildMember(m.c.slot, m.c.lv, m.c.stage, 0, stK, m.c.paths[m.pi], m.lv, m.ev); v.mem = m; mm.set(key, v); } return v; };
      // who can be on the team by now: catches once their spot is open; carried Pokémon once they arrive, and while they obey
      const joinable = m => { if (m.ci >= 0) { const c = candList[m.ci]; return c.stage <= stK && !(!['Gift', 'One-time encounter', 'Starter'].includes(c.info.method) && c.lv > bm[kNow][3] + 3); }
        const t = team0[-m.ci - 1]; if (!t.carry) return true; return t.stage <= stK && (o.obey === false || m.lv <= obeyCap(code, stK, nGyms)); };
      // bosses in the order of their strongest Pokémon (the engine's story order puts some late bosses early, e.g. Sun / Moon's
      // Elite Four right after the first Kahuna); the stage reached never goes back
      const order = bm.map((_, k) => k).sort((a, b) => bm[a][3] - bm[b][3] || a - b); let kNow = order[0];
      // like clears(): each foe goes to the member that beats it with the most HP left. mbHeal (default on): you heal with items
      // between the foe's Pokémon, as low-battle runs do, so each foe is a fresh 1-on-1
      const heal = o.mbHeal !== false;
      const fight = (who, k, foes) => {
        const us = who.map(m => monOf(m)), hp = us.map(u => u.st[0]), info = []; let worst = 1;
        for (let fi = 0; fi < foes.length; fi++) { const f = foes[fi]; let bj = -1, bf = -1, bl = null;
          if (heal) us.forEach((u, j) => { hp[j] = u.st[0]; });
          for (let j = 0; j < us.length; j++) { if (hp[j] <= 0) continue; const [win, left, n1, n2, mv] = duel(us[j], hp[j], f, gen);
            if (win && left / us[j].st[0] > bf) { bf = left / us[j].st[0]; bj = j; bl = [left, n1, n2, mv]; } }
          if (bj < 0) return { ok: false, fail: fi, info };
          const rk = !safeWins(us[bj], hp[bj], f, gen); hp[bj] = bl[0]; worst = Math.min(worst, bf); info.push({ f, m: who[bj], u: us[bj], n1: bl[1], n2: bl[2], mv: bl[3], fr: bf, rk });
        }
        return { ok: true, worst, info };
      };
      // Any% route (Oct 26 2026, speedrun idea 2): o.speed walks for the least play time instead of the fewest battles. Seconds per action,
      // the same table as the page's Splits card: a battle's worth is XP per second, and teams are ranked by the estimated run time.
      const SC = { turn: [9, 9, 11, 11, 12, 13, 13, 14, 14][Math.max(0, Math.min(8, gen - 1))], swap: 6, boss: 45, trainer: 38, trainerMon: 12, wild: 28, catchTry: 45, catchHunt: 60, gift: 60, item: 8,
        travel: [90, 95, 105, 120, 125, 150, 160, 150, 160][Math.max(0, Math.min(8, gen - 1))] };
      const speed = !!o.speed, tsec = t => SC.trainer + t.mons.length * SC.trainerMon;
      const stepSecs = st => (st.lines.length ? SC.boss + st.lines.reduce((a, l) => a + ((l.hko || 1) + (l.takes || 0)) * SC.turn + SC.swap, 0) : 0) + SC.travel
        + st.before.reduce((a, x) => a + (x.n || 1) * (x.t === 'catch' ? SC.catchTry + SC.catchHunt : x.t === 'gift' ? SC.gift : x.t === 'trainer' ? SC.trainer + (x.mons || 2) * SC.trainerMon : x.t === 'wild' ? SC.wild : x.t === 'item' ? SC.item : 0), 0);
      const evCap = gen >= 8 ? 252 : 100, noEv = code === 'LGPE' || code === 'PLA';   // Let's Go (Awakening Values from candies) and Legends: Arceus (Effort Levels) have no EVs
      const gain = (who, f, trainer) => {   // one beaten Pokémon: XP and EVs, by the Exp. Share rules of the generation
        const team_ = mem.filter(m => m.joined), n = f.slot.n, ey = evYield(n), bs = f.slot.s;
        for (const m of team_) {
          const share = m === who ? 1 : gen <= 5 ? 0 : 0.5;
          if (!share) continue;
          m.xp += Math.floor(xpGain(gen, n, f.lv, m.lv, trainer) * share); m.lv = Math.max(m.lv, lvAt(m.gr, m.xp));
          if (noEv) continue;
          if (gen <= 2) { for (let i = 0; i < 6; i++) m.ev[i] = Math.min(65535, m.ev[i] + bs[i]); if (gen === 2) m.ev[4] = m.ev[3]; }   // Gen 2: one Special stat exp (base Sp. Atk) for both Special stats
          else for (let i = 0; i < 6; i++) { const room = Math.min(252 - m.ev[i], 510 - m.ev.reduce((a, x) => a + x, 0)); m.ev[i] += Math.max(0, Math.min(ey[i], room)); }
        }
      };
      const plain = new Map(), plainMon = (n, lv) => { const key = n + '|' + lv; if (plain.has(key)) return plain.get(key);
        const sl = base(n); let v = null;
        if (sl) { const mids = (learnset(sl.id, sl.n, vg).L || []).slice().sort((a, b) => a[1] - b[1]).filter(z => z[1] <= lv).map(z => z[0]);
          v = mon(sl, lv, gen, [...new Set(mids)].slice(-4), '', '', gen <= 2 ? 9 : null); }
        plain.set(key, v); return v; };
      const used = new Set(), bag = []; let nextItem = 0;
      const tally = { trainers: 0, wild: 0, catches: 0, candies: 0, vitamins: 0 };
      const steps = []; let worstAll = 1, stuck = null;
      const skipK = new Set(), dblK = new Map(), at = k => bm[k][1].place + '|' + bm[k][3];
      for (const grp of BOSS_ONE_OF[code] || []) { const by = {}; bm.forEach(([, b], k) => { if (grp.includes(b.name)) (by[at(k)] ||= []).push(k); });
        for (const ks of Object.values(by)) { if (ks.length < 2) continue; const want = code === 'BW' ? STRIATON[sn] : grp[0], keep = ks.find(k => bm[k][1].name === want) ?? ks[0];
          ks.forEach(k => { if (k !== keep) skipK.add(k); }); } }
      for (const grp of BOSS_DOUBLE[code] || []) { const by = {}; bm.forEach(([, b], k) => { if (grp.includes(b.name)) (by[at(k)] ||= []).push(k); });
        for (const ks of Object.values(by)) ks.slice(1).forEach(k => dblK.set(k, bm[ks[0]][1].name)); }
      const counted = () => steps.filter(x => !x.double).length;   // a double battle's second trainer is the same battle
      const nBoss = bm.length - skipK.size - dblK.size;
      for (const [oi, k] of order.entries()) {
        if (skipK.has(k)) continue;
        kNow = k; stK = Math.max(stK, Math.min(bstage[k], stK + 1));   // at most one story stage per boss: a boss the story table puts late can't open late areas early
        const before = [], add = (t, text, x) => { const last = before[before.length - 1]; if (last && last.t === t && last.text === text) last.n++; else before.push(Object.assign({ t, text, n: 1 }, x || {}));
          // live view: what the walker just did, for the page to animate (the worker throttles these)
          if (o.onMb) o.onMb({ t, text, boss: bm[k][1].name, k: Math.max(0, Math.min(nBoss - 1, counted() - (dblK.has(k) ? 1 : 0) - (x && x.kDone ? 1 : 0))), bosses: nBoss, us: x && x.us, foe: x && x.foe, target: mbTarget,
            battles: counted() + tally.trainers + tally.wild + tally.catches, team: mem.filter(m => m.joined).map(m => [m.ci + ':' + m.pi, monOf(m).slot.id, m.lv]), ace: bm[k][3], teamNo: mbCtx.no, teams: mbCtx.of, starter: mbCtx.starter }); };
        for (const m of mem) if (!m.joined && joinable(m)) { m.joined = true;
          if (m.ci >= 0) { const inf = m.c.info; if (!CATCH_FREE.has(inf.method)) { tally.catches++; add('catch', `Catch ${m.c.slot.name} · ${inf.place} · Lv ${inf.lv}`, { foe: m.c.slot.id }); } else add('gift', `Get ${m.c.slot.name} · ${inf.place} (${inf.method})`, { free: 1 }); } }
        while (nextItem < itemsAt.length && itemsAt[nextItem][0] <= stK) { const [, it, q] = itemsAt[nextItem++]; for (let i = 0; i < q; i++) bag.push(it); }
        const team_ = () => mem.filter(m => m.joined);
        // one step that makes member tr stronger: a free item, else the best route trainer, else a wild battle. false = nothing left
        const strengthen = tr => {
          const ci = bag.findIndex(x => x === 'Rare Candy' || CANDY_XP[x]);
          if (ci >= 0) { const it = bag.splice(ci, 1)[0];
            if (it === 'Rare Candy') { tr.lv = Math.min(100, tr.lv + 1); tr.xp = Math.max(tr.xp, expAt(tr.gr, tr.lv)); } else { tr.xp += CANDY_XP[it]; tr.lv = Math.max(tr.lv, lvAt(tr.gr, tr.xp)); }
            tally.candies++; add('item', `${it} on ${monOf(tr).slot.name}`, { free: 1, us: monOf(tr).slot.id }); return true; }
          const evSum = () => tr.ev.reduce((a, x) => a + x, 0);
          const vi = noEv ? -1 : bag.findIndex(x => x in VITAMIN && (gen <= 2 ? tr.ev[VITAMIN[x]] < 25600 : tr.ev[VITAMIN[x]] < evCap && evSum() < 510));
          if (vi >= 0) { const it = bag.splice(vi, 1)[0], si = VITAMIN[it];
            // Gen 1-2: refused at 25600 stat exp, else the full 2560 (capped only by the 16-bit stat); Gen 3+: +10 to the per-stat cap and the 510 total
            if (gen <= 2) { tr.ev[si] = Math.min(65535, tr.ev[si] + 2560); if (gen === 2 && (si === 3 || si === 4)) tr.ev[3] = tr.ev[4] = tr.ev[si]; } else tr.ev[si] = Math.min(evCap, tr.ev[si] + 10, tr.ev[si] + 510 - evSum());
            tally.vitamins++; add('item', `${it} on ${monOf(tr).slot.name}`, { free: 1, us: monOf(tr).slot.id }); return true; }
          // the route trainer open by now worth the most XP to that member; in Gens 1-5 it fights alone if it can (no Exp. Share)
          const opts = rtList.map((t, i) => [t, i]).filter(([t, i]) => !used.has(i) && t.stage <= stK && t.top <= bm[k][3] + RT_CAP)   // far stronger than this boss: a post-game trainer in an early area
            .map(([t, i]) => [t, i, t.mons.reduce((a, [n, l]) => a + xpGain(gen, n, l, tr.lv, true), 0)]).sort((a, b) => speed ? b[2] / tsec(b[0]) - a[2] / tsec(a[0]) : b[2] - a[2]);
          let bt = null;
          for (const [t, i, x] of opts.slice(0, 12)) { const foes = t.mons.map(([n, l]) => plainMon(n, l)).filter(Boolean); if (!foes.length) { used.add(i); continue; }
            const solo = fight([tr], k, foes), r = solo.ok ? solo : fight(team_(), k, foes);
            if (r.ok) { bt = [t, i, r, solo.ok ? x : r.info.filter(l => l.m === tr).reduce((a, l) => a + xpGain(gen, l.f.slot.n, l.f.lv, tr.lv, true), 0)]; break; } }
          // or a wild battle that member wins alone, at the spot open by now worth the most XP to it: whichever battle gives it more
          let bw = null, bx = 0; const u = monOf(tr);
          for (const [st, n, l, pl] of grind) { if (st > stK || l >= tr.lv + 15) continue; const x = xpGain(gen, n, l, tr.lv, false); if (x <= bx) continue;   // 15+ levels above the member: not a grind target (post-game levels in a story area; gate 9, Oct 24 2026)
            const f = plainMon(n, l); if (!f || !duel(u, u.st[0], f, gen)[0]) continue; bw = [f, l, pl]; bx = x; }
          if (bt && (!bw || (speed ? bt[3] / tsec(bt[0]) >= bx / SC.wild : bt[3] >= bx))) { const [t, i, r] = bt;
            used.add(i); tally.trainers++; for (const l of r.info) gain(l.m, l.f, true);
            add('trainer', `${t.name} · ${t.place} (Lv ${t.top})`, { us: monOf(tr).slot.id, foe: (base(t.mons[t.mons.length - 1][0]) || {}).id, mons: t.mons.length, place: t.place }); return true; }
          if (!bw) return false;
          tally.wild++; gain(tr, bw[0], false); add('wild', `${code === 'LGPE' ? 'Catch encounter' : 'Wild'} ${bw[0].slot.name} Lv ${bw[1]} · ${bw[2]}`, { who: u.slot.name, us: u.slot.id, foe: bw[0].slot.id }); return true;
        };
        // the lowest level at which member m beats foe f alone at full HP (null: not even at 100)
        const lvToBeat = (m, f) => { const at = L => { const u = buildMember(m.c.slot, m.c.lv, m.c.stage, 0, stK, m.c.paths[m.pi], L, m.ev); return duel(u, u.st[0], f, gen)[0]; };
          if (at(m.lv)) return m.lv; if (!at(100)) return null; let lo = m.lv, hi = 100; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (at(mid)) hi = mid; else lo = mid; } return hi; };
        let res = fight(team_(), k, bm[k][2]), guard = 0, lastFail = -1, starved = false;
        while (!res.ok && guard < 20000) {   // a loop backstop only: the walk stops when nothing moves (error sweep, Oct 24 2026: 600 stalled Let's Go's Red)
          // who gets stronger: the member that needs the least XP to beat the foe the team can't get past; if that one can't win a single
          // battle open by now (a Lv 2 catch, say), the next one in line (bug sweep, Oct 23 2026: Black / White was stuck at Chili)
          const f = bm[k][2][res.fail], line = [];
          for (const m of team_()) { const L = lvToBeat(m, f); line.push(L == null ? { m, L: m.lv + 1, need: Infinity } : { m, L, need: expAt(m.gr, L) - m.xp }); }
          line.sort((a, b) => a.need - b.need || b.m.lv - a.m.lv);   // nobody can alone: the strongest first
          let moved = false;
          for (const { m: tr, L, need } of line) {
            let tL = L; if (tL <= tr.lv || res.fail === lastFail && need <= 0) tL = tr.lv + 1;   // it wins alone but not after the earlier foes: a level more
            mbTarget = [monOf(tr).slot.id, tL];
            while (tr.lv < tL && guard++ < 20000) { if (!strengthen(tr)) break; moved = true; }
            if (moved) break;
          }
          lastFail = res.fail;
          if (!moved) { starved = !before.some(b => b.t === 'trainer' || b.t === 'wild'); break; }   // starved: not a single battle was open before this boss (free items don't count)
          res = fight(team_(), k, bm[k][2]);
        }
        const lvls = team_().map(m => { const u = monOf(m); return { key: m.ci + ':' + m.pi, name: u.slot.name, id: u.slot.id, lv: m.lv }; });
        // the opening rival battles, with nothing to fight before them: the story goes on after a loss
        if (!res.ok && stK === 0 && starved && !/Leader|Kahuna|Captain|Elite|Champion|Totem/i.test(bm[k][1].cls || '')) { steps.push({ boss: bm[k][1].name, cls: bm[k][1].cls, place: bm[k][1].place, ace: bm[k][3], ok: false, lost: true, before, team: lvls, lines: [] }); continue; }
        if (!res.ok) { stuck = bm[k][1].name; steps.push({ boss: bm[k][1].name, place: bm[k][1].place, ace: bm[k][3], ok: false, before, team: lvls, lines: [] }); break; }
        worstAll = Math.min(worstAll, res.worst);
        steps.push({ boss: bm[k][1].name, cls: bm[k][1].cls, place: bm[k][1].place, ace: bm[k][3], ok: true, margin: r2(res.worst), before, team: lvls, double: dblK.get(k),
          lines: res.info.map(l => ({ foe: l.f.slot.name, flv: l.f.lv, us: l.u.slot.name, lv: l.u.lv, move: l.mv ? MOVES[l.mv][0] : '', left: r2(l.fr), key: l.m.ci + ':' + l.m.pi, hko: l.n1, takes: l.n2 < 99 ? l.n2 - 1 : 0, risky: !!l.rk })) });
        for (const l of res.info) gain(l.m, l.f, true);
        mbTarget = null; add('boss', `Beat ${bm[k][1].name}`, { us: res.info[0] && res.info[0].u.slot.id, foe: bm[k][2][bm[k][2].length - 1].slot.id, kDone: 1 }); before.pop();
      }
      // a double battle's second trainer joins its partner's step: one battle, one step ("Mars & Jupiter")
      for (let i = steps.length - 1; i >= 0; i--) { const d = steps[i]; if (!d.double) continue; const p = steps.slice(0, i).reverse().find(x => !x.double && x.boss === d.double);
        if (!p) { delete d.double; continue; }
        Object.assign(p, { boss: p.boss + ' & ' + d.boss, before: p.before.concat(d.before), lines: p.lines.concat(d.lines), team: d.team, margin: Math.min(p.margin, d.margin) }); steps.splice(i, 1); }
      const ok = !stuck, total = steps.length + tally.trainers + tally.wild + tally.catches, secs = Math.round(steps.reduce((a, st) => a + stepSecs(st), 0));
      return Object.assign({ ok, stuck, total, secs, speed, wildLabel: code === 'LGPE' ? 'catch encounters' : 'wild battles', bosses: nBoss, worst: r2(worstAll), steps, final: mem.filter(m => m.joined).map(m => ({ name: monOf(m).slot.name, id: monOf(m).slot.id, lv: m.lv, key: m.ci + ':' + m.pi, pkey: m.ci >= 0 ? candList[m.ci].slot.id : team0[-m.ci - 1].carry ? team0[-m.ci - 1].carry.key : 'starter' })) }, tally);
    }
    let found = null;
    if (soloOk) found = [[baseTeam.length, baseTeam, soloW]];
    else for (let depth = 1; depth <= MAXX; depth++) { sols.length = 0; seenT = new Set(); dfs(baseTeam, depth); if (sols.length) { found = sols.slice(); break; } }
    const entry = { starter: BYNUM[sn][0].name, n: sn, bosses: bm.length, solo_clears: soloClears };
    if (!found) entry.ok = false, entry.extra = null, entry.stuck_at = firstFail != null ? bm[firstFail][1].name : null;
    else {
      const totEff = t => t.filter(m => m[0] >= 0).reduce((a, m) => a + candList[m[0]].effort, 0);
      const maxSt = t => Math.max(0, ...t.filter(m => m[0] >= 0).map(m => candList[m[0]].stage));
      found.sort((a, b) => a[0] - b[0] || totEff(a[1]) - totEff(b[1]) || b[2] - a[2] || maxSt(a[1]) - maxSt(b[1]));
      const describe = (team) => {
        const catches = [];
        for (const m of team) {
          if (m[0] < 0) continue; const c = candList[m[0]], inf = c.info, handles = [];
          for (let k = 0; k < bm.length; k++) { if (!available(m[0], k)) continue;
            const info = clears(team.filter(x => available(x[0], k)), k, false, true)[2];
            if (info.some(x => x[2] === memberAt(m[0], m[1], k).slot.name)) handles.push(bm[k][1].name); }
          let fin = c.slot.name, finId = c.slot.id, tms = new Set();
          for (let k = 0; k < bm.length; k++) if (available(m[0], k)) { const s = memberAt(m[0], m[1], k).slot; fin = s.name; finId = s.id; }
          catches.push({ catch: c.slot.name, id: c.slot.id, n: c.slot.n, grows_to: fin, grows_id: finId, place: inf.place, method: inf.method, lv: inf.lv, rate: inf.rate,
            note: inf.note, stage: c.stage, effort: c.effort, before: handles[0] || '', handles: [...new Set(handles)] });
        }
        catches.sort((a, b) => a.stage - b.stage);
        return catches;
      };
      const [n_, team, w] = found[0];
      const fights = [];
      const hasCarry = team0.length > nOwn;
      for (let k = 0; k < bm.length; k++) {
        const mem = team.filter(x => available(x[0], k));
        let res = hasCarry ? clears(mem, k, true, true) : null;
        if (!res || !res[0]) res = clears(mem, k, false, true);
        const [ok, wk, info] = res;
        // route trainers between the previous boss and this one; a team far stronger than this boss is a post-game team in an early area
        const fightRt = rtBySec.filter(r => r.stage <= bstage[k] && (k === 0 || r.stage > bstage[k - 1])).map(r => { const ts = r.trainers.filter(t => Math.max(...t.t.map(m => m[1])) <= bm[k][3] + RT_CAP);
          const lv = ts.flatMap(t => t.t.map(m => m[1])); return Object.assign({}, r, { count: ts.length, mons: lv.length, lvMin: Math.min(...lv), lvMax: Math.max(...lv) }); }).filter(r => r.count);
        const rtCount = fightRt.reduce((a, r) => a + r.count, 0), rtMons = fightRt.reduce((a, r) => a + r.mons, 0);
        fights.push({ boss: bm[k][1].name, cls: bm[k][1].cls, place: bm[k][1].place, ace: bm[k][3], target_lv: bm[k][3] + delta, ok, margin: r2(wk),
          rt: rtCount, rtMons, rtSecs: fightRt.map(r => ({ name: r.name, count: r.count, mons: r.mons, lvMin: r.lvMin, lvMax: r.lvMax })),
          lines: info.map(([a, b, c_, d, e, n1, n2, fr, tm, rk]) => ({ foe: a, flv: b, us: c_, lv: d, move: e, hko: n1, takes: n2 < 99 ? n2 - 1 : 0, left: fr, tm: !!tm, risky: !!rk })),
          team: bm[k][2].map(f => ({ name: f.slot.name, id: f.slot.id, lv: f.lv })) });
      }
      const alts = []; const seenSets = new Set([describe(team).map(c => c.catch).sort().join()]);
      for (const s of found.slice(1)) { if (s[0] !== n_) break; const d = describe(s[1]); const sig = d.map(c => c.catch).sort().join();
        if (seenSets.has(sig)) continue; seenSets.add(sig); alts.push({ catches: d, margin: r2(s[2]), effort: totEff(s[1]) }); if (alts.length >= 2) break; }
      const usedTms = new Set(); for (const f of fights) for (const l of f.lines) if (l.tm) usedTms.add(l.move);
      // who actually fought: the starter's forms, and each carried Pokémon with the fights it took part in
      const fought = new Map(); fights.forEach(f => f.lines.forEach(l => { if (!fought.has(l.us)) fought.set(l.us, []); const a = fought.get(l.us); if (a[a.length - 1] !== f.boss) a.push(f.boss); }));
      const sNames = new Set(bm.map((_, k) => memberAt(baseTeam[0][0], baseTeam[0][1], k).slot.name));
      const carriedOut = team0.slice(nOwn).map((t, j) => { const ci = -(nOwn + j) - 1, ks = bm.map((_, k) => k).filter(k => available(ci, k));
        const forms = ks.map(k => memberAt(ci, 0, k).slot), last = forms.length ? forms[forms.length - 1] : t.slot;
        const fs = [...new Set(forms.map(s => s.name))].flatMap(nm => fought.get(nm) || []);
        return { id: t.slot.id, name: t.slot.name, final_id: last.id, final_name: last.name, lv: t.lv, at: t.stage, from: t.carry.from || '', key: t.carry.key || '',
          usable_from: ks.length ? bm[ks[0]][1].name : null, usable: ks.length, fights: [...new Set(fs)] }; });
      const sLast = memberAt(baseTeam[0][0], baseTeam[0][1], bm.length - 1).slot;
      Object.assign(entry, { ok: true, extra: n_ - baseTeam.length, margin: r2(w), effort: totEff(team), catches: describe(team), alts, fights, tms_used: [...usedTms],
        starter_path: [...sNames].join(' → '),
        starter_id: sslot.id, starter_final_id: sLast.id, starter_final: sLast.name, starter_used: [...sNames].some(nm => fought.has(nm)), carried: carriedOut,
        final_lv: Math.max(...fights.map(f => f.target_lv)) });
      if (o.minBattles) {
        // the fewest-catch teams, plus teams with one more catch (a strong catch can save more battles than it costs)
        const teams = found.map(x => x[1]), tk = new Set(teams.map(tkey));
        if (!soloOk && n_ - baseTeam.length < MAXX) { sols.length = 0; seenT = new Set(); dfs(baseTeam, n_ - baseTeam.length + 1);
          for (const s of sols) if (!tk.has(tkey(s[1]))) { tk.add(tkey(s[1])); teams.push(s[1]); } }
        let bestMb = null;
        const MBT = o.mbTeams || 30;   // teams walked per starter
        mbCtx.of = Math.min(MBT, teams.length); mbCtx.starter = BYNUM[sn][0].name;
        for (const [ti, t] of teams.slice(0, MBT).entries()) { mbCtx.no = ti + 1; const r = simTeam(t);
          if (!bestMb || (r.ok && !bestMb.ok) || (r.ok === bestMb.ok && ((o.speed ? r.secs - bestMb.secs : r.total - bestMb.total) || r.catches - bestMb.catches || bestMb.worst - r.worst) < 0)) bestMb = Object.assign(r, { team: t }); }
        entry.mb = Object.assign({}, bestMb, { team: undefined, catchList: describe(bestMb.team), teams: Math.min(MBT, teams.length) });
      }
    }
    results.starters.push(entry);
    prog++; entry.total = starterList.length; if (o.onProgress) o.onProgress(prog / starterList.length, entry);
  }
  const ok = results.starters.filter(s => s.ok).sort((a, b) => a.extra - b.extra || b.margin - a.margin || b.solo_clears - a.solo_clears || a.effort - b.effort);
  results.best = ok.length ? ok[0].starter : null;
  return results;
}
function gameList() { return GAMES.filter(g => STARTERS[g.code]).map(g => ({ code: g.code, name: g.name, gen: g.gen, vers: g.vers || [], starters: STARTERS[g.code].map(n => ({ n, name: BYNUM[n][0].name, id: base(n).id })) })); }

if (IS_NODE) module.exports = { init, planGame, gameList, STARTERS, obeyCap, load, SLOTS: () => SLOTS, DEX: () => DEX };
else if (typeof importScripts !== 'undefined' && !self.ENGINE_AS_LIB) {   // chain-engine.js loads this file as a library and answers messages itself
  self.onmessage = async e => {
    const { id, game, opts, base: b } = e.data;
    try {
      await init(b);
      if (game === '__list') { self.postMessage({ id, done: true, result: gameList() }); return; }
      let mbT = 0;   // Minimum battles' live view: at most one event per 60 ms (boss wins always)
      const onMb = opts.minBattles ? ev => { const now = Date.now(); if (ev.t !== 'boss' && now - mbT < 60) return; mbT = now; self.postMessage({ id, mb: ev }); } : null;
      const r = await planGame(game, Object.assign({}, opts, { onMb, onProgress: (p, entry) => self.postMessage({ id, progress: p, starter: entry.starter, ok: !!entry.ok, extra: entry.extra, margin: entry.margin, total: entry.total, fcodes: entry.ok ? entry.fights.map(f => !f.ok ? 'x' : f.margin >= .15 ? 'g' : 'y').join('') : '', mbTotal: entry.mb ? (entry.mb.ok ? entry.mb.total : null) : undefined }) }));
      self.postMessage({ id, done: true, result: r });
    } catch (err) { self.postMessage({ id, error: String(err && err.stack || err) }); }
  };
}
