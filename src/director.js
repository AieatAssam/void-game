// The city fights back (heat ★1-4) and feeds you (snack floor). See PLAN.md no-dead-end rules.
import * as THREE from 'three';
import { TILE, SNACK_NAMES } from './city.js';

// Heat follows the hole's current size (with hysteresis), so a shrinking hole also cools the city down:
// no death spiral where a tiny hole is stuck at high heat (PLAN.md no-dead-end rules).
export const HEAT_R = [0.8, 1.8, 3.2, 5];

const warnMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.5, depthWrite: false });
const warnGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
const shellGeo = new THREE.SphereGeometry(0.35, 14, 10);
const shellMat = new THREE.MeshStandardMaterial({ color: 0x22222a, emissive: 0xff8a3d, emissiveIntensity: 1.5 });

export class Director {
  constructor(city, scene, hooks) {
    this.city = city;
    this.scene = scene;
    this.hooks = hooks; // { hurt(frac, why), toll() }
    this.units = [];
    this.barricades = [];
    this.drops = []; // falling plugs + shells with ground warnings
    this.cool = { police: 2, cement: 4, heli: 4, tank: 4, barricade: 3, snack: 0 };
    this.stars = 0;
    this.lines = Array.from({ length: city.N + 1 }, (_, k) => -city.half + k * TILE);
  }

  dispose() {
    for (const d of this.drops) this.scene.remove(d.ring, d.mesh);
  }

  update(dt, hole, run) {
    const s = this.stars;
    if (s < 4 && hole.r >= HEAT_R[s]) this.stars++;
    else if (s > 0 && hole.r < HEAT_R[s - 1] * 0.75) this.stars--;
    this.tollCool = Math.max(0, (this.tollCool || 0) - dt);
    for (const k in this.cool) this.cool[k] -= dt;
    const view = (14 + hole.r * 8) * 1.3; // beyond the camera view (portrait screens see further)
    this.snackFloor(hole, view);
    this.spawnUnits(hole, view);
    for (const u of this.units) {
      if (!u.alive || u.falling) continue;
      if (u.leaving) this.leave(u, dt, hole, view);
      else this[u.unit](u, dt, hole, run);
    }
    this.units = this.units.filter((u) => u.alive);
    this.updateBarricades(dt, hole);
    this.updateDrops(dt, hole);
  }

  // ---------- snack floor: keep tier-appropriate food near the hole ----------
  snackFloor(hole, view) {
    if (this.cool.snack > 0) return;
    this.cool.snack = 1;
    const r = hole.r, R2 = (view * 0.9) ** 2;
    let food = 0;
    for (const e of this.city.entities) {
      // only count food that is worth eating at this size, or tiny crumbs mask a famine
      if (!e.alive || e.meta.tier >= r * 0.95 || e.meta.tier < r * 0.3 || e.meta.kind === 'poison') continue;
      if ((e.x - hole.x) ** 2 + (e.z - hole.z) ** 2 < R2) food += Math.PI * e.meta.tier ** 2 * 0.25;
    }
    if (food > hole.area * 0.6) return;
    const fits = SNACK_NAMES.filter((n) => {
      const t = this.city.assets[n].meta.tier;
      return t < r * 0.9 && t > r * 0.3;
    });
    const pool = fits.length ? fits : [SNACK_NAMES.at(-1)];
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * Math.PI * 2, d = view * (1.05 + Math.random() * 0.3);
      const lim = this.city.half - 6;
      const x = THREE.MathUtils.clamp(hole.x + Math.cos(a) * d, -lim, lim), z = THREE.MathUtils.clamp(hole.z + Math.sin(a) * d, -lim, lim);
      this.city.revive(pool[Math.floor(Math.random() * pool.length)], x, z, hole.x, hole.z);
    }
  }

  // ---------- units ----------
  spawnUnits(hole, view) {
    const s = this.stars, count = (u) => this.units.filter((q) => q.unit === u).length;
    const want = { police: s >= 1 ? Math.min(s, 3) : 0, cement: s >= 2 ? (s >= 4 ? 2 : 1) : 0, heli: s >= 3 ? 1 : 0, tank: s >= 4 ? 2 : 0 };
    // heat dropped: surplus units stand down and leave (no death spiral for a shrinking hole)
    for (const unit in want) {
      const mine = this.units.filter((q) => q.unit === unit && !q.leaving);
      for (const u of mine.slice(want[unit])) u.leaving = true;
    }
    for (const unit in want) {
      if (count(unit) >= want[unit] || this.cool[unit] > 0) continue;
      this.cool[unit] = 7;
      const name = { police: 'police_car', cement: 'cement_truck', heli: 'heli', tank: 'tank' }[unit];
      const a = Math.random() * Math.PI * 2;
      const lim = this.city.half - 2;
      let x = THREE.MathUtils.clamp(hole.x + Math.cos(a) * view * 1.2, -lim, lim);
      let z = THREE.MathUtils.clamp(hole.z + Math.sin(a) * view * 1.2, -lim, lim);
      if (unit !== 'heli') [x, z] = this.snap(x, z);
      const u = this.city.spawn(name, x, z, 0, { unit, t: 0, flying: unit === 'heli', axis: 'x', dir: 1 });
      if (unit === 'heli') u.y = 16;
      this.units.push(u);
    }
  }

  snap(x, z) {
    const near = (v) => this.lines.reduce((b, l) => (Math.abs(l - v) < Math.abs(b - v) ? l : b));
    return Math.abs(near(x) - x) < Math.abs(near(z) - z) ? [near(x), z] : [x, near(z)];
  }

  /** Move along the road grid toward (tx, tz); beeline once close. */
  drive(u, dt, speed, tx, tz) {
    const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
    if (d < 26) {
      u.x += (dx / d) * speed * dt;
      u.z += (dz / d) * speed * dt;
      u.rot = Math.atan2(-dz, dx);
    } else {
      const onX = this.lines.some((l) => Math.abs(l - u.z) < 0.5), onZ = this.lines.some((l) => Math.abs(l - u.x) < 0.5);
      if (onX && onZ || (!onX && !onZ)) {
        u.axis = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z';
        [u.x, u.z] = this.snap(u.x, u.z);
      } else u.axis = onX ? 'x' : 'z';
      u.dir = Math.sign(u.axis === 'x' ? dx : dz) || 1;
      if (u.axis === 'x') { u.x += u.dir * speed * dt; u.rot = u.dir > 0 ? 0 : Math.PI; }
      else { u.z += u.dir * speed * dt; u.rot = u.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
    }
    u.y = Math.abs(Math.sin((u.t += dt) * 8)) * 0.04;
    this.city.place(u);
  }

  leave(u, dt, hole, view) {
    const dx = u.x - hole.x, dz = u.z - hole.z, d = Math.hypot(dx, dz) || 1;
    if (d > view * 1.3) { this.city.remove(u); return; }
    const sp = u.unit === 'heli' ? 14 : 8;
    u.x += (dx / d) * sp * dt;
    u.z += (dz / d) * sp * dt;
    if (u.unit === 'heli') u.y += dt * 4;
    u.rot = Math.atan2(-dz, dx);
    this.city.place(u);
  }

  police(u, dt, hole) {
    const d = Math.hypot(hole.x - u.x, hole.z - u.z);
    if (d > hole.r + 7) this.drive(u, dt, 9, hole.x, hole.z);
    if (d < 40 && this.cool.barricade <= 0 && this.barricades.length < 6) {
      this.cool.barricade = 4.5;
      const lead = 1.4, bx = hole.x + hole.vx * lead, bz = hole.z + hole.vz * lead;
      const moving = Math.hypot(hole.vx, hole.vz) > 0.5;
      const a = moving ? Math.atan2(-hole.vz, hole.vx) + Math.PI / 2 : Math.random() * Math.PI;
      const off = moving ? 0 : hole.r + 2.5;
      const b = this.city.spawn('barricade', bx + Math.cos(a) * off, bz - Math.sin(a) * off, a, { life: 20 });
      this.barricades.push(b);
    }
  }

  cement(u, dt, hole) {
    u.back = Math.max(0, (u.back || 0) - dt);
    const d = Math.hypot(hole.x - u.x, hole.z - u.z);
    if (u.back > 0) {
      u.x -= Math.cos(u.rot) * 5 * dt;
      u.z += Math.sin(u.rot) * 5 * dt;
      this.city.place(u);
      return;
    }
    this.drive(u, dt, 7, hole.x, hole.z);
    if (d < hole.r + 2 && hole.r < u.meta.tier * 0.95) {
      this.hooks.hurt(0.2, 'Concrete pour!');
      this.plug(hole.x, hole.z, hole.r * 1.05, 0.01);
      u.back = 3;
    }
  }

  heli(u, dt, hole) {
    u.t += dt;
    const vortex = hole.r > u.meta.tier * 1.6;
    const tx = hole.x + (vortex ? 0 : Math.cos(u.t * 0.4) * (hole.r + 6)), tz = hole.z + (vortex ? 0 : Math.sin(u.t * 0.4) * (hole.r + 6));
    const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz) || 1;
    const sp = Math.min(d, vortex ? 6 : 10 + hole.r) * dt;
    u.x += (dx / d) * sp;
    u.z += (dz / d) * sp;
    u.y += ((vortex ? 3 : 14 + hole.r) - u.y) * dt;
    u.rot = Math.atan2(-(hole.z - u.z), hole.x - u.x);
    u.tilt = 0;
    this.city.place(u);
    u.cool = (u.cool ?? 3) - dt;
    if (!vortex && u.cool <= 0) {
      u.cool = 5;
      this.plug(hole.x + hole.vx * 1.2, hole.z + hole.vz * 1.2, Math.max(1.6, hole.r * 0.9), 1.3, u.y);
    }
  }

  tank(u, dt, hole) {
    const d = Math.hypot(hole.x - u.x, hole.z - u.z);
    const range = hole.r * 2.5 + 14;
    if (d > range) this.drive(u, dt, 5, hole.x, hole.z);
    const turret = u.obj.getObjectByName('turret');
    const aim = Math.atan2(-(hole.z - u.z), hole.x - u.x);
    if (turret) turret.rotation.y = aim - u.rot;
    u.cool = (u.cool ?? 2) - dt;
    if (d < range + 10 && u.cool <= 0) {
      u.cool = 3.2;
      const act = u.actions.fire;
      if (act) { act.reset().setLoop(THREE.LoopOnce, 1).play(); }
      const from = new THREE.Vector3(u.x, 3, u.z);
      const tx = hole.x + hole.vx * 1.1, tz = hole.z + hole.vz * 1.1;
      this.shell(from, tx, tz, hole.r * 0.8 + 0.8);
    }
  }

  // ---------- barricades: toll zones, never walls (rule 1), gone in 20s (rule 3) ----------
  updateBarricades(dt, hole) {
    for (const b of this.barricades) {
      if (!b.alive || b.falling) continue;
      b.life -= dt;
      if (b.life < 1) { b.y = (b.life - 1) * 1.5; this.city.place(b); }
      if (b.life <= 0) { this.city.remove(b); continue; }
      const d = Math.hypot(hole.x - b.x, hole.z - b.z);
      if (!b.tolled && !this.tollCool && hole.r < b.meta.tier * 0.95 && d < hole.r + 0.9) {
        b.tolled = true;
        this.tollCool = 3;
        this.hooks.toll();
      }
    }
    this.barricades = this.barricades.filter((b) => b.alive);
  }

  // ---------- falling concrete + shells with ground warnings ----------
  plug(x, z, R, fallTime, from = 14) {
    const mesh = this.city.spawn('concrete_plug', x, z, Math.random() * 6, { noSwallow: true });
    mesh.s = R;
    mesh.y = fallTime > 0.05 ? from : 0;
    const ring = new THREE.Mesh(warnGeo, warnMat);
    ring.position.set(x, 0.25, z);
    ring.scale.setScalar(R);
    this.scene.add(ring);
    this.drops.push({ kind: 'plug', e: mesh, ring, x, z, R, t: 0, T: fallTime, from, landed: fallTime <= 0.05 });
  }

  shell(from, x, z, R) {
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.position.copy(from);
    const ring = new THREE.Mesh(warnGeo, warnMat);
    ring.position.set(x, 0.25, z);
    ring.scale.setScalar(R);
    this.scene.add(mesh, ring);
    this.drops.push({ kind: 'shell', mesh, ring, from, x, z, R, t: 0, T: 1.1 });
  }

  updateDrops(dt, hole) {
    for (const d of this.drops) {
      d.t += dt;
      const k = Math.min(1, d.t / d.T);
      d.ring.material.opacity = 0.3 + 0.3 * Math.sin(d.t * 20);
      if (d.kind === 'shell') {
        d.mesh.position.set(THREE.MathUtils.lerp(d.from.x, d.x, k), d.from.y * (1 - k) + Math.sin(k * Math.PI) * 6, THREE.MathUtils.lerp(d.from.z, d.z, k));
        if (k >= 1 && !d.done) {
          d.done = true;
          if (Math.hypot(hole.x - d.x, hole.z - d.z) < d.R + hole.r * 0.2) this.hooks.hurt(0.15, 'Shell hit!');
        }
        if (k >= 1) d.gone = true;
        continue;
      }
      // concrete plug
      if (!d.landed) {
        d.e.y = d.from * (1 - k * k);
        if (k >= 1) {
          d.landed = true;
          d.e.y = 0;
          if (Math.hypot(hole.x - d.x, hole.z - d.z) < d.R * 0.8 + hole.r * 0.3) this.hooks.hurt(0.2, 'Concrete drop!');
        }
      } else if (d.t > d.T + 1.5) {
        d.e.y -= dt * 2;
        if (d.t > d.T + 2.5) { d.gone = true; this.city.remove(d.e); }
      }
      this.city.place(d.e);
      d.ring.visible = !d.landed;
    }
    for (const d of this.drops) if (d.gone) this.scene.remove(d.ring, d.mesh ?? d.ring);
    this.drops = this.drops.filter((d) => !d.gone);
  }
}
