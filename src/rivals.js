// Rival holes (item 13): bots that eat the same city. Bigger eats smaller — including you.
import * as THREE from 'three/webgpu';
import { Hole } from './hole.js';
import { SKINS } from './skins.js';
import { P2 } from './phase2.js';

const NAMES = [['Rusty', 'lava'], ['Bubblegum', 'candy'], ['Nebula', 'galaxy'], ['Eclipse', 'lensing']];
const _v = new THREE.Vector3();

export class Rivals {
  /** news(text): Phase 2 only; there the rivals are other breakout holes roaming the island (docs/PHASE2.md). */
  constructor(assets, field, city, scene, count, playerSkin, news = null) {
    this.region = !!city.settlements;
    this.news = news;
    this.sizeK = 1; // Heat "Bold Rivals": spawn size vs the player
    this.hungerK = 1; // perk "Rival Bane": how fast they starve
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
    if (this.region) { // breaks out of a settlement far from you, always smaller than you
      const far = city.settlements.filter((q) => q.left > 0 && Math.hypot(q.x - player.x, q.z - player.z) > 500);
      const q = far[Math.floor(Math.random() * far.length)];
      if (!q) { rv.respawn = 20; return; }
      Object.assign(rv.hole, { x: q.x, z: q.z, area: Math.PI * Math.max(P2.critical, player.r * 0.8 * this.sizeK) ** 2, hidden: false });
      rv.dead = false;
      rv.belly = 1;
      this.news?.(`A second hole, ${rv.name}, breaks out under ${q.name}`);
      return;
    }
    // somewhere open, away from the player
    const tiles = city.tiles.filter((t) => Math.hypot(t.cx - player.x, t.cz - player.z) > 60);
    const t = tiles.length ? tiles[Math.floor(Math.random() * tiles.length)] : city.tiles[0];
    const a = Math.random() * Math.PI * 2;
    Object.assign(rv.hole, { x: t.cx + Math.cos(a) * 13.5, z: t.cz + Math.sin(a) * 13.5, area: Math.PI * Math.max(0.35, player.r * 0.7 * this.sizeK) ** 2, hidden: false }); // always start smaller than you
    rv.dead = false;
    rv.belly = 1;
  }

  kill(rv) {
    rv.dead = true;
    rv.hole.hidden = true;
    rv.respawn = this.region ? 60 : 20;
  }

  /** Steer, grow, starve. Returns 'eaten' if a rival swallowed the player, or a list of rivals the player ate. */
  update(dt, player, playing, time = 99, pickups = null) {
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
      const reach = this.region ? h.r * 5 : 60; // how far it looks for food
      if (h.r > player.r * 1.3 && pd < (this.region ? h.r * 4 : 40)) { tx = pdx / pd; tz = pdz / pd; }
      else if (player.r > h.r * 1.12 && pd < player.r + (this.region ? h.r * 2 : 18)) { tx = -pdx / pd; tz = -pdz / pd; }
      else if (pickups?.nearest(h.x, h.z, 20)) { // a power-up capsule close by: grab it first
        const c = pickups.nearest(h.x, h.z, 20), dx = c.x - h.x, dz = c.z - h.z, d = Math.hypot(dx, dz) || 1;
        tx = dx / d; tz = dz / d;
      } else if (this.region && rv.goal?.alive && !rv.goal.falling && (rv.think -= dt) > 0) { // (the island is big: re-plan twice a second)
        const dx = rv.goal.x - h.x, dz = rv.goal.z - h.z, d = Math.hypot(dx, dz) || 1;
        tx = dx / d; tz = dz / d;
      } else {
        let best = null, score = 0;
        rv.think = 0.5;
        for (const e of this.city.entities) {
          if (!e.alive || e.falling || e.flying || e.noSwallow || e.meta.kind === 'poison' || e.meta.tier >= h.r * 0.9) continue;
          const dx = e.x - h.x, dz = e.z - h.z;
          if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
          const s = (e.meta.tier * e.meta.tier) / (Math.hypot(dx, dz) + 3);
          if (s > score) { score = s; best = e; }
        }
        rv.goal = best;
        if (best) { const dx = best.x - h.x, dz = best.z - h.z, d = Math.hypot(dx, dz) || 1; tx = dx / d; tz = dz / d; }
        else if (this.region) { // nothing near: head for the nearest settlement with food that fits
          const q = this.city.settlements.filter((s) => s.left > 0 && s.list.some((e) => e.alive && e.meta.tier < h.r * 0.9))
            .sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
          if (q) { const dx = q.x - h.x, dz = q.z - h.z, d = Math.hypot(dx, dz) || 1; tx = dx / d; tz = dz / d; }
        } else { tx = -h.x / (Math.hypot(h.x, h.z) || 1); tz = -h.z / (Math.hypot(h.x, h.z) || 1); }
      }
      if (rv.power && (rv.power.t -= dt) <= 0) rv.power = null;
      if (this.region) {
        const T = this.city.terrain, px = h.x, pz = h.z, sp = P2.speed(h.r) * 0.8;
        h.x += tx * sp * dt; h.z += tz * sp * dt;
        const rr = Math.hypot(h.x, h.z), cr = T.coastR(h.x, h.z) - h.r * 0.5;
        if (rr > cr) { h.x *= cr / rr; h.z *= cr / rr; }
        if (T.mountain(h.x, h.z) > 0.22) { h.x = px; h.z = pz; rv.goal = null; rv.think = 0; }
        rv.belly = Math.max(0, rv.belly - dt * P2.bellyDrain * this.hungerK);
        h.area *= 1 - (rv.belly > 0 ? P2.decayFed : P2.decayStarving) * dt;
        if (h.r < P2.dead) { this.news?.(`The army caps ${rv.name}: one hole fewer`); this.kill(rv); continue; }
      } else {
        const sp = (5 + h.r * 1.6) * 0.82 * (rv.power ? 1.35 : 1), lim = Math.max(2, this.city.half - h.r * 0.95);
        h.x = THREE.MathUtils.clamp(h.x + tx * sp * dt, -lim, lim);
        h.z = THREE.MathUtils.clamp(h.z + tz * sp * dt, -lim, lim);
        // hunger, same rules as the player
        rv.belly = Math.max(0, rv.belly - dt / 7 * this.hungerK);
        h.area *= 1 - (rv.belly > 0 ? 0.02 / (1 + h.r * 0.15) : 0.1) * dt;
        if (h.r < 0.26) { this.kill(rv); continue; }
      }
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
    rv.belly = Math.min(1, rv.belly + (hole.area - before) / (this.region ? before * P2.meal * P2.growth : Math.min(before, Math.PI * 36) * 0.15));
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
