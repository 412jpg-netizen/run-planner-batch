/* Through Time engine v2 (Oct 22 2026, Hoss: "one team through time — least catches with transfer up and repeat"; then "full best runs
   like the Run Planner, it's ok if it takes a little"). Plans one game per generation in order with engine.js, carrying every Pokémon
   that can legally move forward into the next game as a free team member (Time Capsule, Pal Park, Poké Transfer, Poké Transporter +
   Bank, HOME, the 3DS Virtual Console bridge, FireRed / LeafGreen on Switch). A carried Pokémon only helps once the game lets it in
   (ARRIVE) and, unless obedience is off, once you hold the badges for its level (engine.js obeyCap). Count = distinct Pokémon that fought.

   A library, not a worker: the heavy work is engine.js planGame, handed in by the host, so the page can spread it over a pool of
   engine.js workers (every starter of a game runs as its own task, in parallel) and Node can call it directly. Results are cached by
   their exact inputs, so a search that reaches the same game with the same carried team plans it once.
     const CE = ChainEngine.create({ planGame(code, opts) -> Promise<result>, games: dex.games, avail: avail.json rows, starters: {code: [n…]} })
     await CE.planChain([{code, ver}], rules, onProg, start?) one chain; each game takes its best starter (start: games already played)
     await CE.bestChain([[{code, ver}…] per step], rules, { beam }, onProg)   one step per generation, or one per game where several are fixed
         beam search: after each generation keeps the `beam` best partial chains (fewest Pokémon so far, then fewest catches, then the
         safest fights), branching on every game of that generation and every starter that clears it
   rules: {delta, obey, vc, frlgSwitch, gifts, tms, trades, events, legends}. Browser: window.ChainEngine; Node: module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ChainEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* the story stage (badges held) from which Pokémon sent from older games can arrive; 99 = only after the story (Pal Park and
     the Poké Transfer Lab need the National Pokédex); null = this game can't receive them at all */
  const ARRIVE = { RB: null, Y: null, GS: 3, C: 3, RS: null, E: null, FRLG: null, DP: 99, PT: 99, HGSS: 99, BW: 99, B2W2: 99,
    XY: 0, ORAS: 0, SM: 0, USUM: 0, LGPE: null, SWSH: 0, BDSP: 0, PLA: 0, SV: 0, LZA: 0 };
  const HOW = { GS: 'Time Capsule (after meeting Bill in Ecruteak)', C: 'Time Capsule (after meeting Bill in Ecruteak)',
    DP: 'Pal Park (after the National Pokédex)', PT: 'Pal Park (after the National Pokédex)', HGSS: 'Pal Park (after the National Pokédex)',
    BW: 'Poké Transfer Lab (after the National Pokédex)', B2W2: 'Poké Transfer Lab (after the National Pokédex)',
    XY: 'Poké Transporter + Pokémon Bank', ORAS: 'Poké Transporter + Pokémon Bank', SM: 'Pokémon Bank', USUM: 'Pokémon Bank',
    SWSH: 'Pokémon HOME', BDSP: 'Pokémon HOME', PLA: 'Pokémon HOME', SV: 'Pokémon HOME', LZA: 'Pokémon HOME' };
  const rank = (a, b) => a.extra - b.extra || b.margin - a.margin || b.solo_clears - a.solo_clears || a.effort - b.effort;   // engine.js's own order
  /* Minimum battles (Oct 23 2026): each game's starter is the one with the fewest battles, and the team carries the levels its real XP
     reached into the next game (instead of the last boss's level + the margin) */
  const mbOk = s => !!(s && s.ok && s.mb && s.mb.ok);
  const rankMb = (a, b) => (mbOk(a) ? 0 : 1) - (mbOk(b) ? 0 : 1) || (a.mb ? a.mb.total : 1e9) - (b.mb ? b.mb.total : 1e9) || rank(a, b);
  const rankOf = R => R && R.minBattles ? rankMb : rank, okOf = R => s => s.ok && (!(R && R.minBattles) || mbOk(s));

  function create({ planGame, games, avail, starters }) {
    const GEN = {}, GI = {};
    games.forEach((g, i) => { GEN[g.code] = g.gen; GI[g.code] = i; });
    /* two games of one generation (Oct 22 2026, Hoss: several games per generation): a link trade from the start in Gens 1–7, HOME in
       Gens 8–9; FireRed / LeafGreen only take trades from Ruby, Sapphire and Emerald after the story (the Network Machine) and none when
       played on Switch; Let's Go trades with neither Sun / Moon nor Ultra Sun / Ultra Moon */
    const sameGen = (a, b, R) => a !== b && a !== 'LGPE' && b !== 'LGPE' && !(R.frlgSwitch && (a === 'FRLG' || b === 'FRLG'));
    const arriveAt = (a, b) => GEN[a] === GEN[b] ? (b === 'FRLG' ? 99 : 0) : ARRIVE[b];
    const reach = (a, b, R) => {                                         // can a Pokémon finished in game a ever be moved into game b?
      const ga = GEN[a], gb = GEN[b];
      if (ga === gb) return sameGen(a, b, R);
      if (!(gb > ga) || b === 'LGPE' || ARRIVE[b] === null) return false;
      if (ga <= 2) return (ga === 1 && (b === 'GS' || b === 'C')) || (R.vc && gb >= 7);   // Time Capsule; VC -> Transporter -> Bank / HOME
      if (a === 'FRLG' && R.frlgSwitch) return gb >= 8;                                    // FireRed / LeafGreen on Switch: straight to HOME
      return true;                                                                         // Pal Park -> Poké Transfer -> Transporter -> Bank -> HOME
    };
    const exists = (id, code) => !avail || !avail[id] || avail[id].includes(GI[code]);
    const via = (a, b, R) => {
      const ga = GEN[a], gb = GEN[b];
      if (ga === gb) return gb >= 8 ? 'Pokémon HOME' : b === 'FRLG' ? 'Link trade (Network Machine, after the story)' : 'Link trade';
      if (ga === 1 && (b === 'GS' || b === 'C')) return 'Time Capsule';
      if (ga <= 2) return 'Virtual Console → Poké Transporter → Bank' + (gb >= 8 ? ' → HOME' : '');
      if (a === 'FRLG' && R.frlgSwitch) return 'HOME (FireRed / LeafGreen on Switch)';
      return HOW[b] || 'transfer';
    };

    /* one game, every starter as its own task (they run side by side in a worker pool), merged like engine.js does; cached by input */
    const memo = new Map();
    let tasks = 0, tasksDone = 0;
    function planAll(code, o, onTask) {
      const k = JSON.stringify([code, o.delta, o.version, o.obey, o.gifts, o.tms, o.trades, o.events, o.legends, o.minBattles ? 1 : 0, o.mbHeal === false ? 0 : 1, (o.carry || []).map(c => [c.key, c.id, c.lv, c.at, c.used ? 1 : 0])]);
      if (memo.has(k)) return memo.get(k);
      const list = (starters[code] || []).length ? starters[code] : [null];
      tasks += list.length;
      const p = Promise.all(list.map(n => planGame(code, Object.assign({}, o, { starter: n })).then(r => { tasksDone++; if (onTask) onTask(code, r); return r; })))
        .then(parts => {
          const r = Object.assign({}, parts[0], { starters: parts.flatMap(x => x.starters) });
          const ok = r.starters.filter(okOf(o)).sort(rankOf(o));
          r.best = ok.length ? ok[0].starter : null;
          return r;
        });
      p.catch(() => memo.delete(k));
      memo.set(k, p);
      return p;
    }
    // what the pool can bring into this game, then the plan (a game with no plan at the margin is planned again 3 levels higher)
    async function prepare(pool, step, R, onTask) {
      const code = step.code;
      const can = pool.filter(p => reach(p.from, code, R));
      const fits = can.filter(p => exists(p.id, code)), noFit = can.filter(p => !exists(p.id, code));
      const carry = fits.filter(p => arriveAt(p.from, code) < 99).map(p => ({ id: p.id, lv: p.lv, at: arriveAt(p.from, code), from: p.from, key: p.key, used: p.used }));
      const later = fits.filter(p => arriveAt(p.from, code) >= 99);     // only after the story: they pass through on the way to later games
      const arrive = carry.length ? Math.min(...carry.map(c => c.at)) : ARRIVE[code];
      let r = null, delta = R.delta;
      for (const d of [R.delta, R.delta + 3]) {
        delta = d;
        r = await planAll(code, { delta: d, version: step.ver || 1, carry, obey: R.obey !== false,
          gifts: R.gifts !== false, tms: !!R.tms, trades: !!R.trades, events: !!R.events, legends: !!R.legends, minBattles: !!R.minBattles, mbHeal: R.mbHeal !== false }, onTask);
        if (r.best) break;
      }
      return { step, r, delta, later, fits, noFit, arrive };
    }
    // play one starter's plan: record the game, add its starter and catches to the pool (mutates pool)
    function apply(pool, prep, e, R) {
      const { step, r, delta, later, fits, noFit, arrive } = prep, code = step.code;
      const hows = [...new Set(fits.map(p => GEN[p.from] === GEN[code] ? via(p.from, code, R) : HOW[code]).filter(Boolean))];
      const mb = !!R.minBattles, g = { code, name: r.name, gen: r.gen, version: r.version, delta, ok: mb ? mbOk(e) : !!(e && e.ok), arrive, how: hows.join(' · ') || HOW[code] || '',
        incoming: [], postgame: [], blocked: noFit.map(p => ({ key: p.key, id: p.id, name: p.name, from: p.from })), starter: null, catches: [], fights: [],
        bosses: e ? e.bosses : 0, starters: r.starters.map(s => ({ name: s.starter, ok: !!s.ok, extra: s.ok ? s.extra : null, margin: s.ok ? s.margin : null })) };
      if (!g.ok) { g.stuck = mb && e && e.mb ? e.mb.stuck : (e || r.starters[0] || {}).stuck_at || null; g.newUsed = null; return g; }
      const lvEnd = e.final_lv;
      const fin = key => { if (!mb) return null; const f = e.mb.final.find(x => x.pkey === key); return f || null; };   // Minimum battles: the level its XP reached
      // Minimum battles: who fought comes from its own fights, by member identity (a carried Lapras and a caught Lapras are two
      // members; error sweep, Oct 24 2026), with a name fallback for results that predate the member key
      const memKey = pkey => { const f = mb && e.mb.final.find(x => x.pkey === pkey); return f && f.key; };
      const mbFought = mb ? new Set(e.mb.steps.flatMap(st => st.lines.map(l => l.key || l.us))) : null;
      const mbFights = (pkey, names) => { const k = memKey(pkey); return e.mb.steps.filter(st => st.lines.some(l => k && l.key ? l.key === k : names.includes(l.us))).map(st => st.boss); };
      const fought = (pkey, names) => { const k = memKey(pkey); return k && mbFought.has(k) || (!k && names.some(n => n && mbFought.has(n))); };
      for (const c of e.carried || []) {                                 // carried Pokémon: who fought, from when; those that could fight level up
        const p = pool.find(x => x.key === c.key); if (!p) continue;
        const fc = fin(c.key), fights = mb ? mbFights(c.key, [p.name, c.final_name, fc && fc.name].filter(Boolean)) : c.fights;
        g.incoming.push({ key: p.key, id: p.id, name: p.name, final_id: fc ? fc.id : c.final_id, final_name: fc ? fc.name : c.final_name, from: p.from, fromName: p.fromName, lv: c.lv,
          usable_from: c.usable_from, fights: [...new Set(fights)], via: via(p.from, code, R) });
        if (fc) { p.lv = Math.max(p.lv, fc.lv); p.id = fc.id || c.final_id; p.name = fc.name || c.final_name; }
        else if (c.usable && !mb) { p.lv = Math.max(p.lv, lvEnd); p.id = c.final_id; p.name = c.final_name; }
        if (fights.length) { p.used = true; p.usedIn.push(code); }
      }
      for (const p of later) g.postgame.push({ key: p.key, id: p.id, name: p.name, from: p.from, via: via(p.from, code, R) });
      const fs = fin('starter'), sNames = e.starter_path.split(' → ');
      const sUsed = mb ? fought('starter', sNames.concat(fs ? [fs.name] : [])) : !!e.starter_used;
      pool.push({ key: code + ':starter', id: fs ? fs.id : e.starter_final_id, name: fs ? fs.name : e.starter_final, lv: fs ? fs.lv : lvEnd, from: code, fromName: r.name, kind: 'starter',
        used: sUsed, usedIn: sUsed ? [code] : [], base: e.starter_id, baseName: e.starter });
      g.starter = { id: e.starter_id, name: e.starter, final_id: fs ? fs.id : e.starter_final_id, final: fs ? fs.name : e.starter_final, used: sUsed, solo: e.solo_clears };
      for (const c of mb ? e.mb.catchList : e.catches) {
        const fc = fin(c.id), cUsed = !mb || fought(c.id, [c.catch, c.grows_to, fc && fc.name]);
        pool.push({ key: code + ':' + c.id, id: fc ? fc.id : c.grows_id || c.id, name: fc ? fc.name : c.grows_to, lv: fc ? fc.lv : lvEnd, from: code, fromName: r.name,
          kind: c.method === 'Gift' || c.method === 'Egg' ? 'gift' : c.method === 'In-game trade' ? 'trade' : 'catch', used: cUsed, usedIn: cUsed ? [code] : [], base: c.id, baseName: c.catch });
        g.catches.push({ id: c.id, name: c.catch, grows_id: c.grows_id || c.id, grows_to: c.grows_to, place: c.place, method: c.method, lv: c.lv, before: c.before, handles: c.handles });
      }
      g.margin = e.margin; g.extra = e.extra;
      g.fights = mb ? e.mb.steps.map(st => ({ boss: st.boss, cls: st.cls, place: st.place, ace: st.ace, ok: st.ok || !!st.lost, lost: !!st.lost, margin: st.ok ? st.margin : 0,
          us: [...new Set(st.lines.map(l => l.us))], lines: st.lines.map(l => [l.us, l.foe, l.lv]), before: st.before.filter(b => !b.free).reduce((a, b) => a + b.n, 0) }))
        : e.fights.map(f => ({ boss: f.boss, cls: f.cls, place: f.place, ace: f.ace, ok: f.ok, margin: f.margin, us: [...new Set(f.lines.map(l => l.us))], lines: f.lines.map(l => [l.us, l.foe, l.lv]), rt: f.rt || 0, rtMons: f.rtMons || 0, rtSecs: f.rtSecs || [] }));
      if (mb) { const m = e.mb; g.battles = m.total; g.mb = { total: m.total, bosses: m.bosses, trainers: m.trainers, wild: m.wild, catches: m.catches, candies: m.candies, vitamins: m.vitamins }; }
      g.newUsed = pool.filter(p => p.usedIn[0] === code).length;
      return g;
    }
    const clonePool = pool => pool.map(p => Object.assign({}, p, { usedIn: p.usedIn.slice() }));
    const summary = (chain, R, games, pool, extra) => {
      const used = pool.filter(p => p.used);
      return Object.assign({
        chain: chain.map(s => s.code), versions: chain.map(s => s.ver || 1), rules: R, games,
        total: used.length, catches: used.filter(p => p.kind !== 'starter').length, starters: used.filter(p => p.kind === 'starter').length,
        cleared: games.filter(g => g.ok).length, battles: R.minBattles ? games.reduce((a, g) => a + (g.battles || 0), 0) : undefined,
        roster: pool.map(p => ({ key: p.key, id: p.id, name: p.name, base: p.base, baseName: p.baseName, from: p.from, fromName: p.fromName, kind: p.kind, used: p.used, usedIn: p.usedIn, lv: p.lv }))
      }, extra || {});
    };

    /* start (optional): {pool, games} for the games already played — the Through Time Planner's journey log — so only the rest is planned,
       around the team you really have */
    async function planChain(chain, R, onProg, start) {
      const pool = start ? clonePool(start.pool) : [], games = start ? start.games.slice() : [];
      for (const [n, step] of chain.entries()) {
        if (n < games.length) continue;
        if (onProg) onProg({ phase: 'game', game: step.code, index: n, total: chain.length, starters: (starters[step.code] || []).length });
        const prep = await prepare(pool, step, R, (code, part) => onProg && onProg({ phase: 'starter', game: code, index: n, total: chain.length, starter: part.starters[0] }));
        const pickS = step.starter && prep.r.starters.some(s => s.ok && s.starter === step.starter) ? step.starter : prep.r.best;   // step.starter: replay a chain found before
        const e = pickS ? prep.r.starters.find(s => s.starter === pickS) : null;
        const g = apply(pool, prep, e, R);
        games.push(g);
        if (onProg) onProg({ phase: 'done', game: step.code, index: n + 1, total: chain.length, done: g });
      }
      return summary(chain, R, games, pool);
    }

    /* beam search over games and starters; score = [games not cleared, Pokémon so far, catches so far, −worst fight] */
    async function bestChain(options, R, { beam = 3 } = {}, onProg) {
      tasks = 0; tasksDone = 0;
      const score = st => { const used = st.pool.filter(p => p.used);
        return [st.games.filter(g => !g.ok).length, R.minBattles ? st.games.reduce((x, g) => x + (g.battles || 0), 0) : used.length, used.filter(p => p.kind !== 'starter').length, -Math.min(1, ...st.games.filter(g => g.ok).map(g => g.margin))]; };
      const cmp = (a, b) => { for (let i = 0; i < a.sc.length; i++) if (a.sc[i] !== b.sc[i]) return a.sc[i] - b.sc[i]; return 0; };
      let states = [{ pool: [], games: [], chain: [], sc: [0, 0, 0, 0] }];
      for (const [gi, opts] of options.entries()) {
        if (onProg) onProg({ phase: 'gen', gen: gi + 1, gens: options.length, states: states.length, tasks, tasksDone });
        const tick = () => onProg && onProg({ phase: 'task', gen: gi + 1, gens: options.length, tasks, tasksDone });
        const preps = await Promise.all(states.flatMap(st => opts.map(step => prepare(st.pool, step, R, tick).then(prep => ({ st, prep })))));
        const next = [];
        for (const { st, prep } of preps) {
          const okStarters = prep.r.starters.filter(okOf(R)).sort(rankOf(R));
          for (const e of okStarters.length ? okStarters : [null]) {
            const pool = clonePool(st.pool), g = apply(pool, prep, e, R);
            const ns = { pool, games: st.games.concat([g]), chain: st.chain.concat([prep.step]) };
            ns.sc = score(ns); ns.sig = ns.chain.map((s, i) => s.code + ':' + (ns.games[i].starter ? ns.games[i].starter.name : 'x')).join(',');
            next.push(ns);
          }
        }
        next.sort(cmp);
        const seen = new Set(); states = [];
        for (const ns of next) { if (seen.has(ns.sig)) continue; seen.add(ns.sig); states.push(ns); if (states.length >= beam) break; }
        if (onProg) onProg({ phase: 'genDone', gen: gi + 1, gens: options.length, best: states[0] && { chain: states[0].chain.map(s => s.code), total: states[0].sc[1] }, tasks, tasksDone });
      }
      const top = states[0], codes = s => s.chain.map(x => x.code).join('-'), seenC = new Set([codes(top)]);
      const runnersUp = states.slice(1).filter(s => !seenC.has(codes(s)) && seenC.add(codes(s))).map(s => ({ chain: s.chain.map(x => x.code), total: s.sc[1], catches: s.sc[2] }));
      return summary(top.chain, R, top.games, top.pool, { search: { beam, runnersUp } });
    }
    return { planChain, bestChain, reach, ARRIVE };
  }
  return { create, ARRIVE, HOW };
});
