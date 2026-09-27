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
        cands.push([sc, e]);
      }
      cands.sort((a, b) => b[0] - a[0]);
      const pick = cands.length ? cands[Math.min(cands.length - 1, Math.floor(Math.random() ** 2 * 4))][1] : null;
      if (pick !== s.target) { s.pending = pick; s.pendAt = t + 0.18 + Math.random() * 0.15; }
      s.wobble = (Math.random() - 0.5) * 0.35; // about +-10 degrees
    }
    if (s.pending !== undefined && t >= s.pendAt) { s.target = s.pending; s.pending = undefined; }
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
