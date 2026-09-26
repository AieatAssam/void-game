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
