import { P3 } from './phase3.js';
// Playtest bot + no-dead-end check (PLAN.md rule 2): a greedy player that never gets trapped
// should never starve. Load the game with ?bot, then call __runBot(seconds) (headless, via __tick).
// Set window.__sloppy = true for a careless player (no dodging, eats poison, stalls) who SHOULD sometimes die.
export function installBot() {
  window.__bot = (hole, city) => {
    const { director, state } = window.__game();
    const sloppy = window.__sloppy;
    if (sloppy && state.time % 10 < 1.5) return [0, 0]; // gets distracted
    let best = null, score = 0;
    // Phase 2: head for the nearest settlement that has something edible, like a player following the marker
    const town = city.target?.(hole) ?? null;
    for (const e of city.entities) {
      if (!e.alive || e.falling || e.flying || e.noSwallow || (!sloppy && e.meta.kind === 'poison') || e.meta.tier >= hole.r * 0.9) continue;
      if (town && e.home !== town && Math.hypot(e.x - hole.x, e.z - hole.z) > hole.r * 3) continue;
      const d = Math.hypot(e.x - hole.x, e.z - hole.z);
      const s = e.meta.mass / (d + 3);
      if (s > score) { score = s; best = e; }
    }
    if (state.starved2 && !sloppy && city.crumbGrid) { // Phase 2, nothing standing fits: do what the hint says, go to the woods
      if (!(state.time < (window.__woodsT || 0))) {
        window.__woodsT = state.time + 2;
        let bestN = 0;
        window.__woods = null;
        for (const [k, list] of city.crumbGrid) {
          const cx = Math.floor(k / 4096 + 0.5), x = cx * 64 + 32, z = (k - cx * 4096) * 64 + 32, d = Math.hypot(x - hole.x, z - hole.z);
          if (d > 500) continue;
          const n = list.filter((e) => e.alive && e.meta.tier < hole.r * 0.9).length / (1 + d / 150);
          if (n > bestN) { bestN = n; window.__woods = [x, z]; }
        }
      }
      const w = window.__woods;
      if (w && Math.hypot(w[0] - hole.x, w[1] - hole.z) > hole.r * 0.5) best = { x: w[0], z: w[1] };
    }
    const pu = !sloppy && window.__game().powerups?.nearest(hole.x, hole.z, 20); // grab capsules on the way
    if (pu) best = pu;
    window.__botTarget = best;
    let x = best ? best.x - hole.x : 0, z = best ? best.z - hole.z : 0;
    // dodge warning rings
    for (const d of sloppy ? [] : director.drops) {
      const dx = hole.x - d.x, dz = hole.z - d.z, dist = Math.hypot(dx, dz);
      if (dist < d.R + hole.r + 2) { x += (dx / (dist || 1)) * 50; z += (dz / (dist || 1)) * 50; }
    }
    const len = Math.hypot(x, z);
    return len > 0.3 ? [x / len, z / len] : [0, 0];
  };

  window.__runBot = (seconds = 60, dt = 1 / 30) => {
    const log = [];
    window.__headless = true;
    document.getElementById('play').click(); // always a fresh run
    for (let t = 0; t < seconds; t += dt) {
      window.__tick(dt);
      const { hole, state, director } = window.__game();
      if (Math.abs(t % 10) < dt) log.push(`${t.toFixed(0)}s r=${hole.r.toFixed(2)} ★${director.stars} eaten=${state.eaten} units=${director.units.map((u) => u.unit[0]).join('')} hits=${state.hits.length}`);
      if (state.over) { log.push(`${state.left === 0 ? 'CLEARED CITY' : 'DIED'} at ${t.toFixed(1)}s best r=${state.best.toFixed(2)}`); break; }
    }
    window.__headless = false;
    const hits = window.__game().state.hits;
    log.push('hits: ' + JSON.stringify(hits.reduce((m, h) => ({ ...m, [h]: (m[h] || 0) + 1 }), {})));
    return log;
  };

  /** Phase 2 balance: from the Phase 2 start (?region&bot), run the greedy bot for up to `seconds` of game time. */
  window.__regionBot = (seconds = 720, dt = 1 / 30) => {
    const log = [];
    window.__headless = true;
    for (let t = 0; t < seconds; t += dt) {
      window.__tick(dt);
      const { hole, state, director, city } = window.__game();
      if (Math.abs(t % 60) < dt) log.push(`${t.toFixed(0)}s r=${hole.r.toFixed(1)} ★${director.stars} cleared=${city.settlements.filter((q) => q.left === 0).map((q) => q.kind[0]).join('')} hits=${state.hits.length}`);
      if (state.over) { log.push(`${city.capital?.left === 0 ? 'WON' : 'DIED'} at ${t.toFixed(0)}s best r=${state.best.toFixed(1)}`); break; }
    }
    window.__headless = false;
    const { state } = window.__game();
    log.push('hits: ' + JSON.stringify(state.hits.reduce((m, h) => ({ ...m, [h]: (m[h] || 0) + 1 }), {})));
    log.push('dust: ' + JSON.stringify(window.__econ?.()));
    return log;
  };
}

/**
 * A human-like player, for balance (window.__human = true, or ?bot&human). Where the greedy bot knows every object on the
 * map, re-targets every frame and dodges perfectly, this one:
 *  - sees only what's on screen (camera frustum), and heads for the edge marker (Phase 2) when nothing edible is in view;
 *  - re-plans every 0.45-1.0 s and commits to its pick between plans; a new pick takes effect after a ~0.25 s reaction;
 *  - picks among the four best visible targets (not always the best), aims with a few degrees of wobble;
 *  - notices a warning ring only after ~0.4 s and dodges it 3 times in 4;
 *  - now and then stops for a moment (reading the HUD, looking around);
 *  - steers through the same rim magnet a player gets.
 */
export function humanBot() {
  const s = { next: 0, target: null, pending: null, pendAt: 0, wobble: 0, idleUntil: 0, seenRing: new Map() };
  const _v = { x: 0, y: 0, z: 0 };
  return (hole, city) => {
    const { director, state, camera, THREE } = window.__game();
    const t = state.time;
    const dbg = (window.__botDbg ??= { boss: 0, rival: 0, ring: 0, marker: 0, explore: 0 }); // (why a bot stalls: which push fired, per frame)
    if (t < s.idleUntil) return [0, 0];
    if (t >= s.next) { // re-plan from what's on screen
      s.next = t + 0.45 + Math.random() * 0.55;
      if (Math.random() < 0.05) { s.idleUntil = t + 0.3 + Math.random() * 0.5; return [0, 0]; }
      const v = new THREE.Vector3(), cands = [];
      const q0 = window.__nextSettlement?.() ?? city.target?.(hole), qd = q0 && Math.hypot(q0.x - hole.x, q0.z - hole.z);
      const goal = q0 && qd > q0.r ? { q: q0, x: (q0.x - hole.x) / qd, z: (q0.z - hole.z) / qd, far: qd > q0.r + 150 } : null;
      // (Phase 2: the woods, hedges and herds are edible too, and a player sees them: the nearby ones join the scan)
      const near = city.crumbs ? city.crumbs.filter((e) => Math.abs(e.x - hole.x) < 250 && Math.abs(e.z - hole.z) < 250) : [];
      for (const e of near.length ? [...city.entities, ...near] : city.entities) {
        if (!e.alive || e.falling || e.flying || e.noSwallow || e.meta.kind === 'poison' || e.meta.kind === 'tile') continue;
        if (e.meta.tier >= hole.r * 0.95 || e.meta.tier < hole.r * 0.04) continue;
        const dx = e.x - hole.x, dz = e.z - hole.z, d = Math.hypot(dx, dz);
        if (d > 400) continue;
        v.set(e.x, (e.gy || 0) + 0.5, e.z).project(camera);
        if (v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.9) continue; // off screen: a player doesn't know it's there
        const k = Math.min(1, Math.max(0, (e.meta.tier / hole.r - 0.1) / 0.4)); // (tiny crumbs barely grow you: players learn that)
        let sc = e.meta.mass * (0.1 + k) / (d + 3 + hole.r);
        if (goal) { // Phase 2: heading for the marked settlement, a player eats what's on the way and doesn't graze off course
          const along = (dx * goal.x + dz * goal.z) / (d || 1);
          sc *= 0.25 + 0.75 * Math.max(0, along);
          // a town ahead beats the wood beside you: woods only when they're on the way (it loitered 240 m from a town eating
          // pines, the town's houses off screen), and anything off the route while the town is still far
          if (e.mover?.crumb && (along < 0.85 || d > hole.r * 3)) continue;
          if (goal.far && (along < 0.8 || d > hole.r * 4)) continue;
          // close to the marked settlement: its own buildings first (it ate barns and windmills round the capital's edge)
          if (!goal.far) sc *= e.home === goal.q ? 4 : 0.3;
        }
        cands.push([sc * (human ? 0.85 + 0.3 * Math.random() : 1), e]); // (a little taste: not always the arithmetic best)
      }
      cands.sort((a, b) => b[0] - a[0]);
      const pick = cands.length ? cands[Math.min(cands.length - 1, Math.floor(Math.random() ** 2 * 4))][1] : null;
      if (pick !== s.target) { s.pending = pick; s.pendAt = t + 0.18 + Math.random() * 0.15; }
      s.wobble = (Math.random() - 0.5) * 0.35; // about +-10 degrees
    }
    if (s.pending !== undefined && t >= s.pendAt) { s.target = s.pending; s.pending = undefined; }
    window.__botTarget = s.target;
    let tx, tz;
    if (s.target && s.target.alive && !s.target.falling) { tx = s.target.x; tz = s.target.z; }
    else {
      const q = window.__lastBuilding ?? window.__nextSettlement?.() ?? city.target?.(hole); // follow the edge marker: a building to hunt (town, or inside a settlement), else the next settlement
      // at a settlement's middle with nothing on screen: look around it rather than park on the marker (it starved there)
      const parked = q && !q.meta && Math.hypot(q.x - hole.x, q.z - hole.z) < (q.r || 0) * 0.5;
      if (q && !parked) { dbg.marker++; tx = q.x; tz = q.z; } else { dbg.explore++; // nothing in view: go exploring like a player would (a heading that drifts,
        // turned back toward the middle near the edge of the town)
        s.head = (s.head ?? Math.random() * 6.28) + (Math.random() - 0.5) * 0.08;
        const lim = (city.half || 100) * 0.8;
        if (parked) { if (Math.hypot(q.x - hole.x, q.z - hole.z) > q.r * 0.4) s.head = Math.atan2(q.z - hole.z, q.x - hole.x) + 1.2; } // (circle it)
        else if (Math.abs(hole.x) > lim || Math.abs(hole.z) > lim) s.head = Math.atan2(-hole.z, -hole.x) + (Math.random() - 0.5) * 0.8;
        tx = hole.x + Math.cos(s.head) * 20; tz = hole.z + Math.sin(s.head) * 20;
      }
    }
    let x = tx - hole.x, z = tz - hole.z;
    const len = Math.hypot(x, z) || 1;
    const c = Math.cos(s.wobble), n = Math.sin(s.wobble);
    [x, z] = [(x * c - z * n) / len, (x * n + z * c) / len];
    // the Capper, while it can't be eaten: stay out of its reach (its warning ring shows it)
    const boss = director.boss;
    if (boss?.alive && boss.noSwallow) {
      const dx = hole.x - boss.x, dz = hole.z - boss.z, dist = Math.hypot(dx, dz);
      if (dist < hole.r + 60) { dbg.boss++; x += (dx / (dist || 1)) * 2; z += (dz / (dist || 1)) * 2; }
    }
    // a bigger rival close by (and on screen): keep away from it, the way a player would
    for (const rv of window.__game().rivals?.list || []) {
      const h = rv.hole;
      if (rv.dead || h.r < hole.r * 1.05) continue;
      const dx = hole.x - h.x, dz = hole.z - h.z, dist = Math.hypot(dx, dz);
      if (dist < h.r + hole.r + 6 + h.r * 2) { dbg.rival++; x += (dx / (dist || 1)) * 1.5; z += (dz / (dist || 1)) * 1.5; }
    }
    // warning rings: seen after a reaction, dodged 3 times in 4, by a sidestep that keeps the heading (backing straight
    // off every ring kept it 200 m outside the capital for minutes, the army dropping ring after ring on it)
    const hx = x, hz = z;
    for (const d of director.drops || []) {
      if (!s.seenRing.has(d)) s.seenRing.set(d, { at: t + 0.35 + Math.random() * 0.2, dodge: Math.random() < 0.75 });
      const r = s.seenRing.get(d);
      if (t < r.at || !r.dodge) continue;
      const dx = hole.x - d.x, dz = hole.z - d.z, dist = Math.hypot(dx, dz);
      if (dist < d.R + hole.r + 2) {
        dbg.ring++;
        const side = Math.sign(-hz * dx + hx * dz) || 1; // (the side of the heading the ring isn't on)
        x += -hz * side * 2 + (dx / (dist || 1)) * 0.4; z += hx * side * 2 + (dz / (dist || 1)) * 0.4;
      }
    }
    const l2 = Math.hypot(x, z);
    if (l2 < 1e-3) return [0, 0];
    [x, z] = window.__assist ? window.__assist(x / l2, z / l2) : [x / l2, z / l2];
    window.__botTarget = s.target;
    return [x, z];
  };
}

/** Run the human-like bot from a fresh town (?bot) for `seconds`: size every 30 s, and how it ended. */
export function installHumanRun() {
  window.__humanRun = (seconds = 480, dt = 1 / 30) => {
    const log = [];
    window.__headless = true;
    window.__bot = humanBot();
    document.getElementById('play').click();
    let minR = Infinity;
    for (let t = 0; t < seconds; t += dt) {
      window.__tick(dt);
      const { hole, state, director } = window.__game();
      if (t > 20) minR = Math.min(minR, hole.r);
      if (Math.abs(t % 30) < dt) {
        const { city } = window.__game(), left = city.entities.filter((e) => e.alive && window.__BUILDINGS?.has(e.name)).map((e) => e.meta.tier).sort((a, b) => a - b);
        log.push(`${t.toFixed(0)}s r=${hole.r.toFixed(2)} belly=${state.belly.toFixed(2)} ★${director.stars} left=${state.left} (smallest ${left[0]?.toFixed(1) ?? '-'} · biggest ${left.at(-1)?.toFixed(1) ?? '-'}) eaten=${state.eaten}`);
      }
      if (state.over) { log.push(`${state.left === 0 ? 'CLEARED' : 'DIED'} at ${t.toFixed(1)}s best r=${state.best.toFixed(2)}`); break; }
    }
    window.__headless = false;
    const { state } = window.__game();
    if (!state.over) log.push(`time up: r=${window.__game().hole.r.toFixed(2)} best ${state.best.toFixed(2)} left=${state.left}`);
    log.push(`starved: ${!!state.stats.starved} · min r after 20 s: ${minR.toFixed(2)}`);
    return log;
  };
}

/**
 * `await __humanSuite(6, 600)`: `n` fresh towns in a row (random seeds, so random moods) with the human-like bot; one line
 * each: mood, how it ended and when, best size, how small it got after the first 20 s, and whether it ever starved.
 * `__humanSuite(6, 600, 'greedy')` runs the greedy bot instead (the upper bound).
 */
window.__humanSuite = async (n = 6, seconds = 600, who = 'human', dt = 1 / 30) => {
  const out = [];
  for (let k = 0; k < n; k++) {
    window.__bot = who === 'human' ? humanBot() : null;
    if (who !== 'human') installBot();
    document.getElementById('play').click();
    for (let i = 0; i < 200 && !(window.__game().state.playing && window.__game().state.time === 0); i++) await new Promise((r) => setTimeout(r, 100));
    window.__headless = true;
    let minR = Infinity, t = 0;
    const { state } = window.__game();
    for (; t < seconds; t += dt) {
      window.__tick(dt);
      const { hole } = window.__game();
      if (t > 20) minR = Math.min(minR, hole.r);
      if (state.over) break;
      if (Math.floor(t) % 20 === 0 && Math.abs(t % 20) < dt) await new Promise((r) => setTimeout(r, 0)); // (let the page breathe)
    }
    window.__headless = false;
    const g = window.__game();
    const end = g.state.over ? (g.state.left === 0 ? 'CLEARED' : 'DIED') : 'time up';
    out.push(`${g.state.mood.padEnd(14)} ${end.padEnd(8)} ${t.toFixed(0).padStart(4)}s best ${g.state.best.toFixed(1).padStart(5)} m · low ${minR.toFixed(2)} · left ${g.state.left} · starved ${!!g.state.stats.starved}${g.state.why ? ' · ' + g.state.why : ''}`);
    if (!g.state.over) g.state.playing = false;
    await new Promise((r) => setTimeout(r, 1500)); // (results screen, next town's packs)
  }
  return out;
};
window.__humanBot = humanBot; // (Phase 2: window.__bot = __humanBot(); __regionBot(900))

/**
 * `await __regionSuite(4, 1200, 'human')`: Phase 2 runs back to back (?region&r=16&bot), one line each with the growth
 * ledger: m2 gained from settlement buildings and from crumbs, m2 lost to fed decay, starving and each kind of hit, and
 * the share of time spent travelling. 'greedy' runs the greedy bot (the upper bound); 'sloppy' the careless one.
 */
window.__regionSuite = async (n = 4, seconds = 1200, who = 'human', dt = 1 / 30, seeds = [4242, 77, 5, 99, 2024, 7, 31, 555]) => {
  const out = [], f = (v) => Math.round(v);
  for (let k = 0; k < n; k++) {
    window.__setNextSeed?.(seeds[k % seeds.length]);
    window.__sloppy = who === 'sloppy';
    if (who === 'human') window.__bot = humanBot(); else installBot();
    document.getElementById('play').click();
    for (let i = 0; i < 50 && window.__game().state.over; i++) await new Promise((r) => setTimeout(r, 100)); // (a run read the last one's result)
    for (let i = 0; i < 400 && window.__game().state.phase !== 2; i++) { window.__tick?.(dt); await new Promise((r) => setTimeout(r, 100)); }
    if (who === 'human') window.__bot = humanBot();
    window.__headless = true;
    const { state } = window.__game();
    let t = 0;
    for (; t < seconds && !state.over; t += dt) {
      window.__tick(dt);
      if (Math.abs(t % 20) < dt) await new Promise((r) => setTimeout(r, 0));
    }
    window.__headless = false;
    const { city } = window.__game(), L = state.ledger || { hit: {} };
    const cleared = city.settlements.filter((q) => q.left === 0).map((q) => q.kind[0]).join('') || '-';
    const hits = Object.entries(L.hit).filter(([, v]) => v < -1).map(([k2, v]) => `${k2} ${f(v)}`).join(', ');
    out.push(`${seeds[k % seeds.length]} ${who} ${(state.over ? (city.capital?.left === 0 ? 'WON' : 'DIED') : 'time up').padEnd(7)} ${f(t)}s best ${state.best.toFixed(1)} cleared ${cleared} | +build ${f(L.build)} +crumb ${f(L.crumb)} fed ${f(L.fed)} starve ${f(L.starve)} | ${hits} | travel ${f(100 * L.travel / ((L.travel + L.town) || 1))}%${state.why ? ' | ' + state.why : ''}`);
    if (!state.over) state.playing = false;
    await new Promise((r) => setTimeout(r, 1500));
  }
  window.__sloppy = false;
  return out;
};

/**
 * Phase 3 (docs/PHASE3.md §8, §12.7 R4): the planet bot. It sees the units, like the minimap does: districts (provinces, nations as the hole grows) within 8 r, scored
 * left / (distance + 2 r) x6 inside the current goal (what the arrow points at); it drives at the nearest standing parcel of the best one (a swath at a time), sidesteps
 * walls, and when nothing is within reach follows the goal arrow. From 97% land it hunts: the arrow's target, the biggest piece of land left. who = 'human'
 * (re-plans every 0.45-1 s, picks among the best 3, wobbles, now and then stops for a beat) or 'greedy' (re-plans every 0.2 s, always the best).
 */
export function planetSteer(who = 'human') {
  const s = { next: 0, heading: Math.random() * 6.283, idleUntil: 0, stuckAt: 0, stuckP: null, side: 0, sideUntil: 0, cur: null };
  let dir = null;
  const anc = (lf, L, u, to) => { while (L < to) { u = lf.lv[L].parent[u]; L++; } return u; }; // the ancestor of unit (L, u) at level `to`
  return (hole) => {
    const P = window.__planet;
    if (!P) return [0, 0];
    const W = P.W, B = W.bite, lf = B.lf, state = P.ctx.state, t = state.time, r = hole.r, human = who === 'human', G = P.game.goal, R = 6371000;
    const dbg = (window.__botDbg ??= { stuck: 0, unit: 0, goal: 0, hunt: 0, wall: 0, idle: 0, tgt: '' });
    // threats (src/threat.js): rings that have locked. Greedy dives into the inner circle (the swallow) whenever it can get there in time; human-like does so 1 time in 3 and reacts 0.35 s late; else it leaves the ring / the strafe band
    const th = window.__threat?.t;
    if (th && state.playing) {
      const ds = th.dangers(s.buf ??= []), v = P3.speed(r); s.pick ??= {};
      for (const d of ds) {
        if (d.kind === 'rival') { // a bigger rival: keep away (run until well clear: hysteresis); a smaller one: hunt it (greedy always, human 1 time in 2)
          const dist = Math.hypot(d.x, d.z) || 1; s.fear ??= {};
          if (d.big) { if (dist < d.R + (s.fear[d.id] ? 7 : 4) * r) { s.fear[d.id] = 1; dbg.flee = (dbg.flee || 0) + 1; return [-d.x / dist, -d.z / dist]; } s.fear[d.id] = 0; continue; }
          s.hunt ??= {}; if (s.hunt[d.id] === undefined) s.hunt[d.id] = who === 'greedy' || Math.random() < 0.5;
          if (s.hunt[d.id] && dist < 14 * r) { dbg.rival = (dbg.rival || 0) + 1; return [d.x / dist, d.z / dist]; }
          continue;
        }
        if (d.kind === 'beam') { const dist = Math.hypot(d.x, d.z) || 1; if (dist < d.R + 2.2 * r && !(human && Math.random() < 0.004)) { dbg.beam = (dbg.beam || 0) + 1; return [-d.x / dist, -d.z / dist]; } continue; } // (keep out of the beam: it is slower than the hole)
        if (d.kind === 'target') { // an edible set-piece part (the laser platform, an Aegis platform, a cracker station): greedy always, human 2 times in 3
          const dist = Math.hypot(d.x, d.z) || 1; s.tgt ??= {}; if (s.tgt[d.id] === undefined) s.tgt[d.id] = who === 'greedy' || Math.random() < 0.67;
          if (s.tgt[d.id] && dist < (d.reach ?? 10) * r && d.eta > 0.5) { dbg.target = (dbg.target || 0) + 1; return dist < 0.25 * r ? [0, 0] : [d.x / dist, d.z / dist]; }
          continue;
        }
        if (d.kind === 'sat') continue;
        if (d.kind === 'fall' || !d.locked || (human && d.eta > d.lock - 0.35)) continue;
        if (d.kind === 'line') { if (d.end > 0.3 && Math.abs(d.across) < d.hw + 0.35 * r) { dbg.dodge = (dbg.dodge || 0) + 1; return [Math.sign(d.across || 1) * d.nx, Math.sign(d.across || 1) * d.nz]; } continue; }
        if (!(d.eta > 0.05)) continue;
        const dist = Math.hypot(d.x, d.z) || 1;
        if (s.pick[d.id] === undefined) { s.pick[d.id] = who === 'greedy' || Math.random() < 1 / 3; if (s.pick[d.id]) dbg.dive = (dbg.dive || 0) + 1; }
        if (s.pick[d.id] && dist - 0.3 * d.inner <= v * d.eta * 1.5) { dbg.dodge = (dbg.dodge || 0) + 1; return dist < 0.3 * d.inner + v * 0.05 ? [0, 0] : [d.x / dist, d.z / dist]; } // (centre it, then sit still until it goes off)
        if (dist < d.R * 1.15) { dbg.dodge = (dbg.dodge || 0) + 1; return [-d.x / dist, -d.z / dist]; }
      }
    }
    if (th && state.playing) { // a satellite within reach (A8): a human goes for it half the time, greedy always; aim at where its subpoint will be when the hole gets there
      for (const d of s.buf) if (d.kind === 'sat') {
        s.sat ??= {}; if (s.sat[d.id] === undefined) s.sat[d.id] = who === 'greedy' || Math.random() < 0.5; if (!s.sat[d.id] || d.eta < 1.5) continue;
        const v = P3.speed(r); let px = d.x, pz = d.z, T = 0;
        for (let k = 0; k < 3; k++) { T = Math.hypot(px, pz) / v; px = d.x + d.vx * T; pz = d.z + d.vz * T; }
        const dist = Math.hypot(px, pz) || 1; dbg.sat = (dbg.sat || 0) + 1;
        if (T < d.eta + 4 && T < 14) return [px / dist, pz / dist];
      }
    }
    if (human && t < s.idleUntil) return [0, 0];
    if (t < s.sideUntil) return [Math.cos(s.side), Math.sin(s.side)];
    // stuck against a wall? every 3 s: moved < 0.4 r while steering => turn away for 2 s
    if (t > s.stuckAt) {
      const here = W.hdir;
      if (s.stuckP && Math.acos(Math.min(1, here.dot(s.stuckP))) * R < 0.4 * r) { dbg.stuck++; s.side = Math.random() * 6.283; s.sideUntil = t + 2; }
      s.stuckP = here.clone(); s.stuckAt = t + 3;
    }
    if (t >= s.next) {
      s.next = t + (human ? 0.45 + Math.random() * 0.55 : 0.2);
      if (human && Math.random() < 0.04) { s.idleUntil = t + 0.3 + Math.random() * 0.5; dbg.idle++; return [0, 0]; }
      dir ??= W.hdir.clone();
      const inv = W.holeQ.clone().invert(), h = W.hdir, hunt = !!G?.hunt;
      const bearingOf = (x, y, z) => { const q = new W.hdir.constructor(x, y, z).applyQuaternion(inv); return Math.atan2(q.z, q.x); };
      let aim = null, kind = '';
      const gt = G?.tgt, follow = !hunt && gt && G.g.kind !== 'world' && gt.d * R < 12 * r; // a player follows the arrow while the goal is within ~12 r
      if (follow) { aim = bearingOf(gt.dir.x, gt.dir.y, gt.dir.z); kind = 'goal'; dbg.tgt = gt.name; }
      if (!hunt && !follow) { // the units within 8 r: left / (d + 2 r), x6 inside the goal
        const L = r < 160e3 ? 1 : r < 520e3 ? 2 : 3, v = lf.lv[L], c = v.c, go = G?.g?.units ?? [];
        const cand = [];
        for (let u = 0; u < v.n; u++) {
          const left = v.left[u];
          if (!(left > 1e-3) || v.torn[u]) continue;
          const dist = Math.acos(Math.min(1, c[u * 3] * h.x + c[u * 3 + 1] * h.y + c[u * 3 + 2] * h.z)) * R, e = Math.max(0, dist - 0.6 * lf.rEq(L, u));
          if (e > 8 * r) continue;
          let sc = left * 1e6 / (e + 2 * r), inGoal = false;
          for (const [gl, gu] of go) if (gl >= L ? anc(lf, L, u, gl) === gu : u === anc(lf, gl, gu, L)) { inGoal = true; break; }
          if (inGoal) sc *= 6;
          if (s.cur && s.cur.L === L && s.cur.u === u) sc *= 1.3;
          if (P.game.ripe?.some((q) => q.L === L && q.u === u)) sc *= 2; // (a player chases the ripe rings)
          cand.push([sc, u]);
        }
        dbg.cand = cand.length;
        if (cand.length) {
          cand.sort((a, b) => b[0] - a[0]);
          const top = cand.slice(0, human ? 3 : 1), w = top.map((q, i) => q[0] * (i ? 0.6 : 1)), tot = w.reduce((a, b) => a + b, 0);
          let k = 0, pick = Math.random() * tot; while (k < top.length - 1 && (pick -= w[k]) > 0) k++;
          const u = top[k][1]; s.cur = { L, u };
          // the nearest standing parcel of that unit at least 0.9 r away (so a swath carries on through it), else the nearest of all
          const ps = lf.parcels(L, u), l0 = lf.lv[0].left, pd = lf.pDir; let bp = -1, bd = 1e12, bp2 = -1, bd2 = 1e12;
          for (let q = 0; q < ps.length; q++) { const pk = ps[q]; if (!(l0[pk] > 1e-3)) continue; const d = Math.acos(Math.min(1, pd[pk * 3] * h.x + pd[pk * 3 + 1] * h.y + pd[pk * 3 + 2] * h.z)) * R; if (d >= 0.9 * r && d < bd) { bd = d; bp = pk; } if (d < bd2) { bd2 = d; bp2 = pk; } }
          const pk = bp >= 0 ? bp : bp2;
          if (pk >= 0) { aim = bearingOf(pd[pk * 3], pd[pk * 3 + 1], pd[pk * 3 + 2]); kind = 'unit'; dbg.tgt = lf.name(L, u); }
        }
      }
      if (aim == null && G?.tgt) { aim = bearingOf(G.tgt.dir.x, G.tgt.dir.y, G.tgt.dir.z); kind = hunt ? 'hunt' : 'goal'; dbg.tgt = G.tgt.name; }
      if (aim == null) { aim = s.heading + (Math.random() - 0.5) * 0.4; kind = 'goal'; }
      dbg[kind]++;
      // walls: a column above wallK D within 3.5 r of the way ahead => try the nearest free bearing
      const Dw = P3.depth(r) * P3.wallK, blocked = (a) => { for (const m of [1, 2, 3.5]) { W.dirAt(Math.cos(a) * m * r, Math.sin(a) * m * r, dir); if (B.landAt(dir) > 0 && B.heightAt(dir) > Dw) return true; } return false; };
      if (blocked(aim)) { dbg.wall++; for (const da of [0.5, -0.5, 1, -1, 1.5, -1.5]) if (!blocked(aim + da)) { aim += da; break; } }
      s.heading = aim + (human ? (Math.random() - 0.5) * 0.17 : 0);
    }
    return [Math.cos(s.heading), Math.sin(s.heading)];
  };
}

/**
 * `__planetBot(seconds, who)`: from the ?planet start, run the bot for `seconds` of game time (headless), stopping at the win (land >= 99.5%)
 * or the time. Returns the log (every 30 s: tier, r, belly, land, income so far, the target), the tier-up and goal times and the ledger of growth by source.
 * `__planetBotAsync` is the same in slices (poll `window.__botRun`: { t, done, log }), for a page that has to stay alive for 30 game minutes.
 */
window.__planetSteer = planetSteer; // (real-time runs: window.__bot = __planetSteer('human'))
function* botLoop(seconds, who, dt, run) {
  const log = run.log, P = window.__planet, state = P.ctx.state, hole = P.ctx.hole, t0 = state.time;
  const was = window.__bot, wh = window.__headless;
  window.__bot = planetSteer(who); window.__headless = true; window.__botDbg = { stuck: 0, unit: 0, goal: 0, hunt: 0, wall: 0, idle: 0, tgt: '' };
  const f = (v) => Math.round(v), km = (m) => (m / 1000).toFixed(1);
  let last = -1, minBelly = 1, t = 0, n = 0;
  for (; t < seconds; t += dt) {
    window.__tick(dt);
    run.t = t;
    minBelly = Math.min(minBelly, state.belly);
    const k = Math.floor(t / 30);
    if (k !== last) { last = k; const L = state.ledger, d = window.__botDbg; log.push(`${f(t)}s T${state.tier} r=${km(hole.r)}km belly=${state.belly.toFixed(2)} land=${(state.land * 100).toFixed(2)}% pop=${((state.pop || 0) / 1e9).toFixed(2)}B +land ${f(L.land / 1e9)} +tear ${f((L.tear || 0) / 1e9)} +pull ${f((L.pull || 0) / 1e9)} fed ${f(L.fed / 1e9)} starve ${f(L.starve / 1e9)} (Gm2) | ${window.__planet.game.goal?.g.name ?? '-'} ${(100 * (window.__planet.game.goal?.frac ?? 0)).toFixed(0)}% | ${d.tgt} stuck ${d.stuck} wall ${d.wall}`); }
    if (state.land >= 0.995 || state.sealed) break;
    if (++n % 20 === 0) yield;
  }
  window.__bot = was; window.__headless = wh;
  const L = state.ledger, tierAt = Object.fromEntries(Object.entries(state.tierAt || {}).map(([k, v]) => [k, f(v - t0)])), goalAt = (state.goalDone || []).map((v) => f(v - t0));
  const ts = window.__threat?.state().stats;
  log.push(`${state.land >= 0.995 ? 'WON' : state.sealed ? 'SEALED' : 'time up'} ${f(t)}s tierAt ${JSON.stringify(tierAt)} goalAt ${JSON.stringify(goalAt)} dbg ${JSON.stringify(window.__botDbg)} minBelly ${minBelly.toFixed(2)} land ${(state.land * 100).toFixed(2)}% r ${km(hole.r)}km threats ${JSON.stringify(ts)}`);
  log.push(`ledger ${JSON.stringify(Object.fromEntries(Object.entries(L).map(([k, v]) => [k, f(v / 1e3) + 'k'])))}`);
  run.done = true; run.sealed = !!state.sealed; run.threat = ts; run.won = state.land >= 0.995; run.time = t; run.tierAt = tierAt; run.tierLand = Object.fromEntries(Object.entries(state.tierLand || {}).map(([k, v]) => [k, +(v * 100).toFixed(1)])); run.r = hole.r; run.goalAt = goalAt; run.ledger = { ...L };
}
window.__planetBot = (seconds = 600, who = 'human', dt = 1 / 30) => { const run = { log: [], done: false }; for (const _ of botLoop(seconds, who, dt, run)); return run.log; };
window.__planetBotAsync = (seconds = 1800, who = 'human', dt = 1 / 30) => {
  const run = window.__botRun = { log: [], done: false, t: 0 }, g = botLoop(seconds, who, dt, run);
  const go = () => { const t = performance.now(); let r; while (!(r = g.next()).done && performance.now() - t < 40); if (!r.done) setTimeout(go, 0); };
  go(); return run;
};

/** `__planetSweep(n, seconds, who)`: n runs back to back in one page (reset() between); rows in `window.__sweep` (minutes per tier, land % at the tier-ups, goal times, ledger shares, decay share). */
window.__planetSweep = async (n = 3, secs = 3000, who = 'human') => {
  const rows = window.__sweep = [], m = (v) => +(v / 60).toFixed(1);
  window.__sweepDone = false;
  for (let i = 0; i < n; i++) {
    window.__planet.reset();
    const run = window.__planetBotAsync(secs, who);
    while (!run.done) await new Promise((r) => setTimeout(r, 300));
    const L = run.ledger, tot = L.land + L.tear + L.pull;
    rows.push({ won: run.won, sealed: run.sealed, threat: run.threat, min: m(run.time), tierMin: Object.fromEntries(Object.entries(run.tierAt).map(([k, v]) => [k, m(v)])), tierLand: run.tierLand, goalMin: run.goalAt.map(m), rEnd: Math.round(run.r / 1000), share: [L.land, L.tear, L.pull].map((v) => Math.round((100 * v) / tot)), decay: Math.round((100 * (L.fed + L.starve)) / -tot), dmg: +((100 * -(L.dmg || 0)) / tot).toFixed(1), bonus: +((100 * (L.bonus || 0)) / tot).toFixed(1), sat: +((100 * (L.sat || 0)) / tot).toFixed(1), kinds: Object.fromEntries(Object.entries(L).filter(([k]) => !['land', 'tear', 'pull', 'fed', 'starve', 'dmg', 'bonus'].includes(k)).map(([k, v]) => [k, +((100 * v) / tot).toFixed(1)])), walls: window.__planet.ctx.state.walls || 0, thr: { ...window.__threat?.stats } });
  }
  window.__sweepDone = true;
  return rows;
};

/** `__planetSum()`: the last sweep as one line per run: total min, minutes in T1/T2/T3/T4, land % at the tier-ups, end r, shares (swath/tear/pull), decay %, threat damage / bonus / satellite % of gains, W/S, threat counts (nukes, swallowed, hits, rods, rod gulps, sats, seal warnings, mercy). */
window.__planetSum = () => window.__sweep.map((r) => { const t = Object.values(r.tierMin); return { m: r.min, T: [t[1], +(t[2] - t[1]).toFixed(1), +(t[3] - t[2]).toFixed(1), +(r.min - t[3]).toFixed(1)].join('/'), land: Object.values(r.tierLand).join('/'), rEnd: r.rEnd, sh: r.share.join('/'), dec: r.decay, dmg: r.dmg, bon: r.bonus, sat: r.sat, w: r.won ? 'W' : r.sealed ? 'S' : 'x', th: [r.thr.nukes, r.thr.swallowed, r.thr.hits, r.thr.rods, r.thr.rodGulps, r.thr.sats, r.thr.sealWarn, r.thr.mercy].join(','), seen: r.thr.seen, unfair: r.thr.unfair, walls: r.walls }; });

/**
 * Phase 3 test helpers (docs/PHASE3.md §12.7 R3): `await __planetTT.tear(L, maxKm2, minKm2, off, bearing, r, frames)` stands the hole beside the nearest unit of level L
 * (area in the range) and starts its tear, then renders `frames` frames; `__planetTT.step(n)` renders n more (1/30 s each); `__planetTT.hud(false)` hides the HUD for screenshots.
 */
window.__planetTT = {
  async tear(L, hi, lo, off = 1.5, brg = 2.0, r = null, frames = 14) {
    const U = window.__planetUnits(), P = window.__planet, st = P.ctx.state;
    st.playing = true; window.__bot = () => [0, 0];
    if (r) P.ctx.hole.area = Math.PI * r * r;
    const un = U.nearest(L, hi, lo);
    U.goto(L, un.u, off, brg);
    await new Promise((res) => setTimeout(res, 600));
    P.bite.startTear(L, un.u, P.W.hdir, 'tear');
    for (let i = 0; i < frames; i++) window.__tick(1 / 30);
    return { un, jobs: U.jobs().length };
  },
  step(n) { for (let i = 0; i < n; i++) window.__tick(1 / 30); return window.__planetUnits().jobs().length; },
  hud(v) { for (const id of ['hud']) { const e = document.getElementById(id); if (e) e.style.display = v ? '' : 'none'; } },
};
