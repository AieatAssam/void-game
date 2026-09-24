// Rival holes (item 13): bots that eat the same city. Bigger eats smaller — including you.
import * as THREE from 'three';
import { Hole } from './hole.js';
import { SKINS } from './skins.js';

const NAMES = [['Rusty', 'lava'], ['Bubblegum', 'candy'], ['Nebula', 'galaxy'], ['Eclipse', 'lensing']];
const _v = new THREE.Vector3();

export class Rivals {
  constructor(assets, field, city, scene, count, playerSkin) {
    this.city = city;
    this.scene = scene;
    this.list = [];
    const pool = NAMES.filter(([, s]) => s !== playerSkin).concat(NAMES.filter(([, s]) => s === playerSkin));
    for (let i = 0; i < count; i++) {
      const [name, skin] = pool[i % pool.length];
      const hole = new Hole(assets, field, i + 1, { r: 0.5, skin });
      const label = document.createElement('div');
      label.className = 'rival-tag';
      label.style.setProperty('--c', '#' + new THREE.Color(SKINS[skin].rim).getHexString());
      document.body.append(label);
      const rv = { name, hole, label, belly: 1, dead: true, respawn: 2 + i * 3, eaten: 0 };
      hole.hidden = true;
      scene.add(hole.group);
      this.list.push(rv);
    }
  }

  get holes() { return this.list.map((rv) => rv.hole); }

  dispose() {
    for (const rv of this.list) { this.scene.remove(rv.hole.group); rv.hole.dispose(); rv.label.remove(); }
  }

  spawn(rv, player) {
    const { city } = this;
    // somewhere open, away from the player
    const tiles = city.tiles.filter((t) => Math.hypot(t.cx - player.x, t.cz - player.z) > 60);
    const t = tiles.length ? tiles[Math.floor(Math.random() * tiles.length)] : city.tiles[0];
    const a = Math.random() * Math.PI * 2;
    Object.assign(rv.hole, { x: t.cx + Math.cos(a) * 13.5, z: t.cz + Math.sin(a) * 13.5, area: Math.PI * Math.max(0.35, player.r * 0.7) ** 2, hidden: false }); // always start smaller than you
    rv.dead = false;
    rv.belly = 1;
  }

  kill(rv) {
    rv.dead = true;
    rv.hole.hidden = true;
    rv.respawn = 20;
  }

  /** Steer, grow, starve. Returns 'eaten' if a rival swallowed the player, or a list of rivals the player ate. */
  update(dt, player, playing, time = 99) {
    const ate = [];
    for (const rv of this.list) {
      const h = rv.hole;
      if (rv.dead) {
        if ((rv.respawn -= dt) <= 0 && playing) this.spawn(rv, player);
        continue;
      }
      // steer: chase a smaller player, flee a bigger one, otherwise go for the best meal nearby
      const pdx = player.x - h.x, pdz = player.z - h.z, pd = Math.hypot(pdx, pdz) || 1;
      let tx = 0, tz = 0;
      if (h.r > player.r * 1.3 && pd < 40) { tx = pdx / pd; tz = pdz / pd; }
      else if (player.r > h.r * 1.12 && pd < player.r + 18) { tx = -pdx / pd; tz = -pdz / pd; }
      else {
        let best = null, score = 0;
        for (const e of this.city.entities) {
          if (!e.alive || e.falling || e.flying || e.noSwallow || e.meta.kind === 'poison' || e.meta.tier >= h.r * 0.9) continue;
          const dx = e.x - h.x, dz = e.z - h.z;
          if (Math.abs(dx) > 60 || Math.abs(dz) > 60) continue;
          const s = (e.meta.tier * e.meta.tier) / (Math.hypot(dx, dz) + 3);
          if (s > score) { score = s; best = e; }
        }
        if (best) { const dx = best.x - h.x, dz = best.z - h.z, d = Math.hypot(dx, dz) || 1; tx = dx / d; tz = dz / d; }
        else { tx = -h.x / (Math.hypot(h.x, h.z) || 1); tz = -h.z / (Math.hypot(h.x, h.z) || 1); }
      }
      const sp = (5 + h.r * 1.6) * 0.82, lim = Math.max(2, this.city.half - h.r * 0.95);
      h.x = THREE.MathUtils.clamp(h.x + tx * sp * dt, -lim, lim);
      h.z = THREE.MathUtils.clamp(h.z + tz * sp * dt, -lim, lim);
      // hunger, same rules as the player
      rv.belly = Math.max(0, rv.belly - dt / 7);
      h.area *= 1 - (rv.belly > 0 ? 0.02 / (1 + h.r * 0.15) : 0.1) * dt;
      if (h.r < 0.26) { this.kill(rv); continue; }
      // contact with the player
      if (playing) {
        if (time > 30 && player.r < h.r * 0.9 && pd < h.r - player.r * 0.5) return 'eaten'; // no ambush in the first 30s
        if (h.r < player.r * 0.9 && pd < player.r - h.r * 0.5) { ate.push(rv); this.kill(rv); }
      }
    }
    return ate;
  }

  fed(hole, before) {
    const rv = this.list.find((q) => q.hole === hole);
    if (!rv) return;
    rv.belly = Math.min(1, rv.belly + (hole.area - before) / (Math.min(before, Math.PI * 36) * 0.15));
    rv.eaten++;
  }

  /** Name tags that follow each rival on screen. */
  labels(camera) {
    for (const rv of this.list) {
      const h = rv.hole;
      if (rv.dead) { rv.label.hidden = true; continue; }
      _v.set(h.x, 0.5, h.z - h.r - 0.5).project(camera);
      rv.label.hidden = _v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1;
      rv.label.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
      rv.label.textContent = `${rv.name} · ${h.r.toFixed(1)} m`;
    }
  }

  hideLabels() { for (const rv of this.list) rv.label.hidden = true; }
}
