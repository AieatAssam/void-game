// Chain reactions (HANDOVER §5.3): a swallowed gas station blasts its block apart, a fireworks stand lights up
// the sky, a water tower floods the street, a falling building knocks its neighbours over and a swallowed hydrant
// bursts the water main. Triggered by city 'fall' events. Nothing here ever hurts the player (PLAN.md rule 3),
// and each effect runs one instance at a time.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, uniformArray, instanceIndex, float, vec3, vec4, hash, sqrt, cos, sin, exp, select, max, uv, length,
  smoothstep, pow, cameraProjectionMatrix, clamp, mix, positionGeometry, time,
} from 'three/tsl';
import { waterMaterial } from './terrain.js';
import { BUILDINGS } from './city.js';

const ROCKETS = 16, PER = 240; // 3840 particles, one buffer, reused volley after volley
const RISE = 1.15, BURST = 2.4;
const COLORS = [0xff4f6d, 0xffd166, 0x5ec8ff, 0x9dff7a, 0xc38bff, 0xff9f43, 0xffffff, 0x7ee0c3];

/**
 * Fireworks as stateless GPU particles: every spark's position is an analytic function of (time since launch, its
 * index), evaluated in TSL - no per-frame CPU work and no compute dispatch, so it runs the same on WebGPU and on the
 * WebGL2 fallback. Launching a volley only writes 16 vec4 uniforms.
 */
class Fireworks {
  constructor() {
    this.now = uniform(0);
    this.rockets = Array.from({ length: ROCKETS }, () => new THREE.Vector4(0, 0, -99, 25)); // x, z, launch time, burst height
    this.tints = Array.from({ length: ROCKETS }, () => new THREE.Color(1, 1, 1));
    const R = uniformArray(this.rockets, 'vec4'), T = uniformArray(this.tints, 'color');
    const mat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
    const r = instanceIndex.div(PER), k = instanceIndex.mod(PER), kf = float(k);
    const rk = R.element(r);
    const t = this.now.sub(rk.z);
    const seed = kf.add(float(r).mul(977));
    const u = hash(seed).mul(2).sub(1), a = hash(seed.add(31.7)).mul(6.2832);
    const s2 = sqrt(max(float(0), float(1).sub(u.mul(u))));
    const dir = vec3(s2.mul(cos(a)), u.mul(0.8).add(0.15), s2.mul(sin(a)));
    const sp = hash(seed.add(7.3)).mul(0.35).add(0.8).mul(11);
    const tb = max(t.sub(RISE), 0);
    const burst = vec3(rk.x, rk.w, rk.y).add(dir.mul(sp).mul(float(1).sub(exp(tb.mul(-2.4)))).div(2.4)).add(vec3(0, tb.mul(tb).mul(-2.2), 0));
    // rising: the first 14 sparks of each rocket are its trail
    const f = clamp(t.div(RISE), 0, 1);
    const climb = vec3(rk.x, rk.w.mul(pow(f, 0.65)).sub(kf.mul(0.18)), rk.y);
    const rising = t.lessThan(RISE);
    mat.positionNode = select(rising, climb, burst);
    const alive = t.greaterThan(0).and(t.lessThan(RISE + BURST)).and(rising.not().or(k.lessThan(14)));
    const fade = select(rising, float(1).sub(kf.div(14)), pow(float(1).sub(tb.div(BURST)), 1.4));
    const twinkle = sin(time.mul(40).add(kf)).mul(0.25).add(0.75);
    mat.sizeNode = select(alive, float(0.45).mul(fade.mul(0.6).add(0.4)), float(0)).mul(cameraProjectionMatrix.element(1).element(1));
    const d = length(uv().sub(0.5));
    const col = select(rising, vec3(1, 0.8, 0.5), mix(vec3(1), T.element(r), smoothstep(0, 0.25, tb)));
    mat.colorNode = vec4(col.mul(pow(smoothstep(0.5, 0, d), 1.5)).mul(fade).mul(twinkle).mul(3.2), 1);
    this.points = new THREE.Sprite(mat);
    this.points.count = ROCKETS * PER;
    this.points.frustumCulled = false;
    this.next = 0;
  }

  /** A volley of n rockets from (x, z), staggered over ~2 s, bursting 20-30 m up. */
  volley(x, z, n = ROCKETS) {
    for (let i = 0; i < n; i++) {
      const j = this.next;
      this.next = (this.next + 1) % ROCKETS;
      const a = Math.random() * Math.PI * 2, d = Math.random() * 7;
      this.rockets[j].set(x + Math.cos(a) * d, z + Math.sin(a) * d, this.now.value + i * 0.13 + Math.random() * 0.1, 20 + Math.random() * 10);
      this.tints[j].setHex(COLORS[Math.floor(Math.random() * COLORS.length)]).multiplyScalar(1.3);
    }
  }

  update(dt) { this.now.value += dt; }
  dispose() { this.points.material.dispose(); }
}

// hop/scatter/drift helpers write entity movers that city.js animates ('tumble', 'domino')
function tumble(e, vx, vz, vy, spin, city) {
  if (e.obj || BUILDINGS.has(e.name)) return;
  e.mover = { type: 'tumble', vx, vz, vy, spin, y0: e.y || 0, t: 0, prev: e.mover };
  if (e.mover.prev?.type === 'tumble') e.mover.prev = e.mover.prev.prev;
  city.place(e);
}

export class Chains {
  /** hooks: { shake(k), boom(), notice(n), flash(text) } */
  constructor(city, scene, debris, sparks, hooks) {
    this.reach = 1; // perk "Chain Master": blast radius
    this.fireNoto = 1; // ... and how much fireworks get noticed
    this.city = city;
    this.scene = scene;
    this.debris = debris;
    this.sparks = sparks;
    this.hooks = hooks;
    this.fireworks = new Fireworks();
    scene.add(this.fireworks.points);
    this.active = {}; // effect -> seconds left (one instance each)
    this.bobbed = new Set(); // props lifted by water, set back down when it drains
    // flood + puddle: tide water on a disc, cut out where holes are open
    this.floodFade = uniform(0);
    this.flood = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2),
      waterMaterial({ holes: uniformArray(city.holeField.value, 'vec3'), fade: this.floodFade }));
    this.flood.visible = false;
    this.flood.renderOrder = 1;
    this.puddleFade = uniform(0);
    this.puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
      waterMaterial({ holes: uniformArray(city.holeField.value, 'vec3'), fade: this.puddleFade }));
    this.puddle.visible = false;
    this.puddle.renderOrder = 1;
    // blast flash: a hot additive ball that swells and fades
    this.flashMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.flashK = uniform(0);
    this.flashMat.colorNode = Fn(() => {
      const r = length(positionGeometry);
      return vec4(vec3(1.0, 0.55, 0.18).mul(smoothstep(1, 0.2, r)).mul(this.flashK).mul(4), 1);
    })();
    this.fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.flashMat);
    this.fireball.visible = false;
    scene.add(this.flood, this.puddle, this.fireball);
  }

  dispose() {
    this.scene.remove(this.fireworks.points, this.flood, this.puddle, this.fireball);
    this.fireworks.dispose();
    for (const m of [this.flood, this.puddle, this.fireball]) { m.geometry.dispose(); m.material.dispose(); }
  }

  /** A thing went down a hole (any hole). `hole` is its eater; `player` the player's hole. */
  onFall(e, hole, player) {
    const fx = e.meta.effect;
    if (hole === player && (fx === 'blast' || fx === 'fireworks' || fx === 'flood' || e.name === 'hydrant' || e.name === 'gold_hydrant')) this.hooks.chain?.();
    if (fx === 'blast') this.blast(e, player);
    else if (fx === 'fireworks') this.fire(e);
    else if (fx === 'flood') this.floodFrom(e, player);
    if (e.name === 'hydrant' || e.name === 'gold_hydrant') this.main(e);
    if (BUILDINGS.has(e.name) && e.meta.tier >= 1.5) this.dominoes(e, hole, player);
  }

  // ---------- gas station: a radial impulse over 12 m ----------
  blast(e, player) {
    if (this.active.blast > 0) return;
    this.active.blast = 2.5;
    const R = 12 * this.reach, city = this.city;
    for (const q of city.entities) {
      if (q === e || !q.alive || q.falling) continue;
      const dx = q.x - e.x, dz = q.z - e.z, d = Math.hypot(dx, dz);
      if (d > R) continue;
      const k = 1 - d / R, nx = dx / (d || 1), nz = dz / (d || 1);
      if (q.mover?.type === 'drive') { // cars panic
        q.mover = { type: 'wander', h: Math.atan2(-nz, nx), v: 7, t: q.mover.t, panicked: true };
        q.panic = 4;
      } else if (!q.mover && q.meta.kind !== 'tile' && q.meta.tier < 3 && !BUILDINGS.has(q.name)) {
        const v = (4 + 10 * k) / Math.max(0.6, Math.sqrt(q.meta.tier));
        tumble(q, nx * v, nz * v, 3 + 6 * k, (Math.random() - 0.5) * 14, city);
      } else if (q.mover?.type === 'walk' || q.mover?.type === 'loop' || q.mover?.type === 'peck') q.panic = 4;
    }
    this.fireball.position.set(e.x, 2, e.z);
    this.fireball.visible = true;
    this.fireT = 0;
    this.sparks.burst(e.x, e.z, 4, 3);
    const orange = new THREE.Color(0xff8a3d), smoke = new THREE.Color(0x3a3530);
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 8;
      this.debris.chunk(e.x, 1 + Math.random() * 3, e.z, Math.cos(a) * sp, 5 + Math.random() * 7, Math.sin(a) * sp, 0.2 + Math.random() * 0.5,
        k % 3 ? orange : smoke, { x: e.x + Math.cos(a) * 40, z: e.z + Math.sin(a) * 40, r: 0 }, 2.5);
    }
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      this.debris.puff(e.x + Math.cos(a) * 3, 1.5, e.z + Math.sin(a) * 3, Math.cos(a) * 5, 2 + Math.random() * 2, Math.sin(a) * 5, 2.5, 3.5, 2.6, smoke, 0.75);
    }
    this.hooks.shake?.(0.5);
    this.hooks.boom?.(1);
    this.hooks.flash?.('💥 Gas station blast!');
  }

  // ---------- fireworks stand: 16 rockets, hopping props, scattering pigeons, notoriety ----------
  fire(e) {
    if (this.active.fireworks > 0) return;
    this.active.fireworks = 4;
    this.fireworks.volley(e.x, e.z);
    for (const q of this.city.entities) {
      if (!q.alive || q.falling) continue;
      const d2 = (q.x - e.x) ** 2 + (q.z - e.z) ** 2;
      if (q.name === 'pigeon' || q.name === 'rainbow_pigeon') { if (d2 < 400) q.panic = 3; continue; }
      if (d2 < 64 && !q.mover && q.meta.tier < 3) tumble(q, 0, 0, 3.1, 0, this.city); // a 0.5 m hop
    }
    this.hooks.notice?.(10 * this.fireNoto);
    this.hooks.flash?.('🎆 Fireworks!');
    this.hooks.crackle?.(16);
  }

  // ---------- water tower: a wave front 0 -> 25 m over 3 s; slows units, drifts small props toward the hole ----------
  floodFrom(e) {
    if (this.active.flood > 0) return;
    this.active.flood = 11;
    this.floodAt = [e.x, e.z];
    this.floodT = 0;
    this.flood.visible = true;
    this.hooks.flash?.('🌊 Water tower flood!');
    this.hooks.boom?.(0.3);
  }

  // ---------- water main: a geyser column for 6 s and a puddle that bobs small props ----------
  main(e) {
    if (this.active.main > 0) return;
    this.active.main = 6;
    this.mainAt = [e.x, e.z];
    this.puddle.visible = true;
    this.puddle.position.set(e.x, 0.2, e.z);
  }

  // ---------- dominoes: neighbours rock, and some topple toward the hole ----------
  dominoes(b, hole, player) {
    const city = this.city, foot = b.meta.tier * 1.3;
    for (const q of city.entities) {
      if (q === b || !q.alive || q.falling || !BUILDINGS.has(q.name) || q.mover || q.obj) continue;
      const d = Math.hypot(q.x - b.x, q.z - b.z);
      if (d > foot + q.meta.tier || q.meta.tier >= player.r * 1.15) continue;
      const topple = Math.random() < 0.25;
      q.mover = { type: 'domino', t: 0, topple, dir: Math.atan2(hole.z - q.z, hole.x - q.x), x0: q.x, z0: q.z };
    }
  }

  update(dt, player, director) {
    const city = this.city;
    for (const k in this.active) this.active[k] -= dt;
    if (this.bobbed.size && !(this.active.main > 0) && !(this.active.flood > 3)) { // the water has drained
      for (const q of this.bobbed) if (q.alive && !q.falling && !q.mover) { q.y = 0; city.place(q); }
      this.bobbed.clear();
    }
    this.fireworks.update(dt);
    // blast fireball
    if (this.fireball.visible) {
      this.fireT += dt;
      const k = this.fireT / 0.7;
      this.fireball.scale.setScalar(2 + k * 9);
      this.flashK.value = Math.max(0, 1 - k);
      if (k >= 1) this.fireball.visible = false;
    }
    // flood
    if (this.flood.visible) {
      const t = (this.floodT += dt), R = 25 * Math.min(1, t / 3);
      const [fx, fz] = this.floodAt;
      this.flood.position.set(fx, 0.24, fz);
      this.flood.scale.setScalar(Math.max(0.1, R));
      this.floodFade.value = Math.min(1, t * 2) * Math.min(1, Math.max(0, (11 - t) / 2));
      if (t < 8) {
        for (const u of director.units) if (u.alive && Math.hypot(u.x - fx, u.z - fz) < R) u.slowT = 8;
        for (const q of city.entities) {
          if (!q.alive || q.falling || q.mover || q.obj || q.meta.tier > 1 || q.meta.kind !== 'prop') continue;
          const dx = q.x - fx, dz = q.z - fz;
          if (dx * dx + dz * dz > R * R) continue;
          const hx = player.x - q.x, hz = player.z - q.z, d = Math.hypot(hx, hz) || 1;
          if (d > 40) continue;
          q.x += (hx / d) * 1.5 * dt;
          q.z += (hz / d) * 1.5 * dt;
          q.y = Math.abs(Math.sin(t * 3 + q.x)) * 0.06;
          this.bobbed.add(q);
          city.place(q);
        }
      }
      if (t > 11) { this.flood.visible = false; this.floodFade.value = 0; }
    }
    // water main
    if (this.puddle.visible) {
      const left = this.active.main;
      const [mx, mz] = this.mainAt;
      this.puddle.scale.setScalar(3.2 * Math.min(1, (6 - left) * 1.5));
      this.puddleFade.value = Math.min(1, Math.max(0, left + 1.5) / 1.5);
      if (left > 0 && (this.geyT = (this.geyT || 0) - dt) <= 0) {
        this.geyT = 0.05;
        const c = new THREE.Color(0xdff4ff);
        this.debris.puff(mx + (Math.random() - 0.5) * 0.5, 0.3, mz + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 1.2, 9 + Math.random() * 4,
          (Math.random() - 0.5) * 1.2, 0.35, 0.9, 1.3, c, 0.6);
      }
      if (left > 0) for (const q of city.entities) {
        if (!q.alive || q.falling || q.mover || q.obj || q.meta.tier > 1.2 || (q.x - mx) ** 2 + (q.z - mz) ** 2 > 10) continue;
        q.y = 0.05 + Math.abs(Math.sin((6 - left) * 5 + q.x * 3)) * 0.12;
        this.bobbed.add(q);
        city.place(q);
      }
      if (left < -1.5) this.puddle.visible = false;
    }
  }
}
