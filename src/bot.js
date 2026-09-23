// Playtest bot + no-dead-end check (PLAN.md rule 2): a greedy player that never gets trapped
// should never starve. Load the game with ?bot, then call __runBot(seconds) (headless, via __tick).
export function installBot() {
  window.__bot = (hole, city) => {
    const { director } = window.__game();
    let best = null, score = 0;
    for (const e of city.entities) {
      if (!e.alive || e.falling || e.flying || e.noSwallow || e.meta.kind === 'poison' || e.meta.tier >= hole.r * 0.9) continue;
      const d = Math.hypot(e.x - hole.x, e.z - hole.z);
      const s = e.meta.mass / (d + 3);
      if (s > score) { score = s; best = e; }
    }
    let x = best ? best.x - hole.x : 0, z = best ? best.z - hole.z : 0;
    // dodge warning rings
    for (const d of director.drops) {
      const dx = hole.x - d.x, dz = hole.z - d.z, dist = Math.hypot(dx, dz);
      if (dist < d.R + hole.r + 2) { x += (dx / (dist || 1)) * 50; z += (dz / (dist || 1)) * 50; }
    }
    const len = Math.hypot(x, z);
    return len > 0.3 ? [x / len, z / len] : [0, 0];
  };

  window.__runBot = (seconds = 60, dt = 1 / 30) => {
    const log = [];
    window.__headless = true;
    const g0 = window.__game();
    if (!g0.state.playing) document.getElementById('play').click();
    for (let t = 0; t < seconds; t += dt) {
      window.__tick(dt);
      const { hole, state, director } = window.__game();
      if (Math.abs(t % 10) < dt) log.push(`${t.toFixed(0)}s r=${hole.r.toFixed(2)} ★${director.stars} eaten=${state.eaten} units=${director.units.map((u) => u.unit[0]).join('')} hits=${state.hits.length}`);
      if (state.over) { log.push(`DIED at ${t.toFixed(1)}s r=${state.best.toFixed(2)} best`); break; }
    }
    window.__headless = false;
    const hits = window.__game().state.hits;
    log.push('hits: ' + JSON.stringify(hits.reduce((m, h) => ({ ...m, [h]: (m[h] || 0) + 1 }), {})));
    return log;
  };
}
