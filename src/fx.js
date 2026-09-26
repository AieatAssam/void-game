// Swallow sparks: lilac/white motes that burst out of the rim, sized by the bite. One Points draw call.
import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, vec4, uv, length, smoothstep, cameraProjectionMatrix, float, pow, abs, clamp, mix, atan, sin } from 'three/tsl';

/** Camera-facing instanced sprites (WebGPU has no sized points): position/colour/size/alpha per instance. */
function spriteCloud(n, { additive, world, bird = false }) {
  const pos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const size = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(0.3), 1).setUsage(THREE.DynamicDrawUsage);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
  const mat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
  mat.positionNode = instancedBufferAttribute(pos);
  // world: size is in metres (projection-scaled); otherwise it matches three's attenuated point size
  const s = instancedBufferAttribute(size);
  mat.sizeNode = world ? s.mul(cameraProjectionMatrix.element(1).element(1)) : s;
  const d = length(uv().sub(0.5));
  const a = instancedBufferAttribute(alpha);
  // bird: a soft wing "V" instead of a round puff
  const q = uv().sub(0.5), wing = abs(q.y.add(abs(q.x).mul(0.7)).sub(0.08));
  // puff: no flat opaque core (that reads as milk), a lumpy rim, and lit from above so it has volume
  const lump = sin(atan(q.y, q.x).mul(5).add(instancedBufferAttribute(pos).x.mul(0.37))).mul(0.06);
  const shape = bird ? smoothstep(0.09, 0.03, wing).mul(smoothstep(0.48, 0.38, abs(q.x))) : pow(clamp(float(1).sub(d.add(lump).mul(2.1)), 0, 1), float(1.7));
  const shade = bird ? float(1) : mix(float(0.68), float(1.08), uv().y);
  mat.colorNode = additive
    ? vec4(instancedBufferAttribute(col).mul(pow(smoothstep(0.5, 0.0, d), float(1.5))).mul(2.2), 1)
    : vec4(instancedBufferAttribute(col).mul(shade), a.mul(shape));
  const sprite = new THREE.Sprite(mat);
  sprite.count = n;
  sprite.frustumCulled = false;
  return { sprite, pos, col, size, alpha };
}

const MAX = 400;

export class Sparks {
  constructor() {
    this.cloud = spriteCloud(MAX, { additive: true, world: false });
    this.pos = this.cloud.pos.array;
    this.col = this.cloud.col.array;
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.pos.fill(-999);
    this.points = this.cloud.sprite;
    this.next = 0;
    this.lilac = new THREE.Color(0xb58cff);
    this.white = new THREE.Color(0xffffff);
  }

  burst(x, z, r, tier) {
    const n = Math.min(40, 6 + Math.round(tier * 10));
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 4) * (0.6 + r * 0.25);
      this.pos.set([x + Math.cos(a) * r, 0.3, z + Math.sin(a) * r], i * 3);
      this.vel.set([Math.cos(a) * sp * 0.4, sp, Math.sin(a) * sp * 0.4], i * 3);
      this.life[i] = 0.6 + Math.random() * 0.5;
      (Math.random() < 0.7 ? this.lilac : this.white).toArray(this.col, i * 3);
    }
    this.cloud.size.array.fill(0.45 + r * 0.1);
    this.cloud.size.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] -= 9 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.life[i] <= 0) this.pos[j + 1] = -999;
      const f = Math.max(0, this.life[i]);
      this.col[j] *= 0.97 + f * 0.03; this.col[j + 1] *= 0.97 + f * 0.03; this.col[j + 2] *= 0.97 + f * 0.03;
    }
    this.cloud.pos.needsUpdate = true;
    this.cloud.col.needsUpdate = true;
  }
}

// ---------- debris: collapse chunks + swallow confetti (one instanced draw), dust/smoke puffs (one points draw) ----------
const CHUNKS = 260, PUFFS = 900;
const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _p4 = new THREE.Vector3(), _s4 = new THREE.Vector3();
const COLLAPSE = [0xf3e6cf, 0xd9d2c4, 0xc86b4f, 0x9fb7c9, 0xe8d5b0, 0x8a8f99].map((c) => new THREE.Color(c));
const BALLOONS = [0xff4f6d, 0xffd166, 0x5ec8ff, 0x9dff7a, 0xc38bff, 0xff9f43].map((c) => new THREE.Color(c).multiplyScalar(1.6));
const CONFETTI = [0xb58cff, 0xffd166, 0xff8fab, 0x7ee0c3, 0xffffff, 0x8fc7ff].map((c) => new THREE.Color(c));

export class Debris {
  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7 }), CHUNKS);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.c = Array.from({ length: CHUNKS }, () => ({ life: 0 }));
    for (let i = 0; i < CHUNKS; i++) { this.mesh.setMatrixAt(i, _m4.makeScale(0, 0, 0)); this.mesh.setColorAt(i, CONFETTI[0]); }
    this.next = 0;
    // puffs: soft round sprites with per-point size + alpha
    this.cloud = spriteCloud(PUFFS, { additive: false, world: true });
    this.pos = this.cloud.pos.array;
    this.size = this.cloud.size.array;
    this.alpha = this.cloud.alpha.array;
    this.col = this.cloud.col.array;
    this.alpha.fill(0);
    this.vel = new Float32Array(PUFFS * 3);
    this.plife = new Float32Array(PUFFS);
    this.pmax = new Float32Array(PUFFS);
    this.grow = new Float32Array(PUFFS);
    this.puffs = this.cloud.sprite;
    this.pnext = 0;
    this.group = new THREE.Group().add(this.mesh, this.puffs);
  }

  chunk(x, y, z, vx, vy, vz, size, color, hole, life = 2.5) {
    const i = this.next;
    this.next = (i + 1) % CHUNKS;
    Object.assign(this.c[i], { x, y, z, vx, vy, vz, size, hole, life, rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 14 });
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor.needsUpdate = true;
  }

  puff(x, y, z, vx, vy, vz, size, grow, life, color, alpha) {
    const i = this.pnext;
    this.pnext = (this.pnext + 1) % PUFFS;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.size[i] = size;
    this.grow[i] = grow;
    this.plife[i] = this.pmax[i] = life;
    this.alpha[i] = alpha;
    color.toArray(this.col, i * 3);
  }

  /** A building (or anything big) breaks up as it goes down: chunks, glass glints and a dust ring at its base. */
  collapse(e, hole, low) {
    const t = e.meta.tier, h = e.meta.height, n = low ? 8 : Math.min(40, 8 + Math.round(t * 3));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * t * 0.8;
      this.chunk(e.x + Math.cos(a) * d, 0.5 + Math.random() * h, e.z + Math.sin(a) * d,
        Math.cos(a) * 3, 2 + Math.random() * 4, Math.sin(a) * 3, 0.2 + Math.random() * t * 0.12,
        COLLAPSE[Math.floor(Math.random() * COLLAPSE.length)], hole, 3);
    }
    const dust = new THREE.Color(0xa89880);
    for (let k = 0; k < (low ? 6 : 18); k++) {
      const a = (k / 18) * Math.PI * 2 + Math.random() * 0.3, r = t * (0.7 + Math.random() * 0.4);
      this.puff(e.x + Math.cos(a) * r, 0.4, e.z + Math.sin(a) * r, Math.cos(a) * (1 + t * 0.4), 0.6 + Math.random(), Math.sin(a) * (1 + t * 0.4),
        t * 0.8, t * 0.8, 1.6 + Math.random(), dust, 0.55);
    }
  }

  /** A ring of dust rolling outward from (x, z): the ground giving way (Phase 2 breakout, collapses at scale). */
  dustRing(x, y, z, r0, speed, n, size, life, color, alpha = 0.6) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.2, v = speed * (0.8 + Math.random() * 0.4);
      // (centred well above the ground: a big soft sprite cutting into the pavement shows a hard edge)
      this.puff(x + Math.cos(a) * r0, y + size * (0.55 + Math.random() * 0.2), z + Math.sin(a) * r0, Math.cos(a) * v, size * 0.05 + Math.random() * 0.5, Math.sin(a) * v,
        size * (0.7 + Math.random() * 0.5), size * 0.35, life * (0.8 + Math.random() * 0.4), color, alpha);
    }
  }

  /** A swallowed balloon stand lets go: bright balloons drift up and away on the breeze. */
  balloons(x, y, z, n = 12) {
    for (let k = 0; k < n; k++) {
      const c = BALLOONS[k % BALLOONS.length];
      this.puff(x + (Math.random() - 0.5) * 1.5, y + Math.random() * 1.5, z + (Math.random() - 0.5) * 1.5,
        0.4 + Math.random() * 0.6, 1.4 + Math.random() * 1.2, 0.2 + Math.random() * 0.5, 0.45 + Math.random() * 0.15, 0, 6 + Math.random() * 2, c, 1);
    }
  }

  /** Confetti crumbs pop from the rim and get swept back in by the whirlpool. */
  crumbs(hole, tier) {
    const n = Math.min(6, 2 + Math.round(tier * 3));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, r = hole.r * (0.9 + Math.random() * 0.5);
      this.chunk(hole.x + Math.cos(a) * r, 0.3, hole.z + Math.sin(a) * r, Math.cos(a) * 2, 2 + Math.random() * 3, Math.sin(a) * 2,
        0.05 + Math.min(0.25, hole.r * 0.04), CONFETTI[Math.floor(Math.random() * CONFETTI.length)], hole, 1.6);
    }
  }

  update(dt) {
    for (let i = 0; i < CHUNKS; i++) {
      const c = this.c[i];
      if (c.life <= 0) continue;
      c.life -= dt;
      const h = c.hole, dx = h.x - c.x, dz = h.z - c.z, d = Math.hypot(dx, dz) || 1e-3;
      const over = d < h.r * 0.95;
      // swirl toward the hole; over the opening there is no floor
      const pull = 6 + h.r * 2;
      c.vx += ((dx * pull + dz * pull * 0.8) / d) * dt;
      c.vz += ((dz * pull - dx * pull * 0.8) / d) * dt;
      c.vx *= 1 - dt * 1.5; c.vz *= 1 - dt * 1.5;
      c.vy -= 16 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (!over && c.y < 0.2) { c.y = 0.2; c.vy = Math.abs(c.vy) * 0.3; }
      c.rx += c.spin * dt; c.ry += c.spin * 0.7 * dt;
      const s = c.y < -3 || c.life <= 0 ? 0 : c.size * Math.min(1, c.life * 2);
      if (!s) c.life = 0;
      _q4.setFromEuler(_e4.set(c.rx, c.ry, 0));
      this.mesh.setMatrixAt(i, _m4.compose(_p4.set(c.x, c.y, c.z), _q4, _s4.setScalar(s)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < PUFFS; i++) {
      if (this.plife[i] <= 0) { this.alpha[i] = 0; continue; }
      this.plife[i] -= dt;
      const j = i * 3, f = Math.max(0, this.plife[i] / this.pmax[i]);
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.vel[j] *= 1 - dt * 1.2; this.vel[j + 2] *= 1 - dt * 1.2;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] *= f > 0.02 ? 1 - dt * (0.6 / Math.max(0.2, this.pmax[i])) : 0;
    }
    const c = this.cloud;
    c.pos.needsUpdate = c.size.needsUpdate = c.alpha.needsUpdate = c.col.needsUpdate = true;
  }
}

// chimney / cooking-pot smoke sources in model space (three.js: x, up, z)
// optional 5th value: puff scale (the loco's steam is heavier and lingers)
export const SMOKE = { house: [-1.0, 5.9, -1.6, 0xd8d8d8], noodle_stall: [-0.4, 1.4, 0, 0xffffff], hotdog_cart: [0, 1.25, 0, 0xffffff],
  locomotive: [5.3, 4.2, 0, 0xe9e6e0, 2.4],
  // Phase 2: village chimneys, mill smoke and power-station steam (big plumes read as scale from the air)
  cottage: [-1.5, 6.3, -1.9, 0xd8d8d8, 1.3], farmhouse: [0, 9.6, -4.2, 0xd8d8d8, 1.4], village_inn: [0.3, 9.8, -4.8, 0xd8d8d8, 1.4],
  townhouse_row: [0, 11.6, 0, 0xcfcfcf, 1.5], townhouse_row_b: [0, 11.6, 0, 0xcfcfcf, 1.5],
  chimney_stack: [0, 46, 0, 0x57524d, 6], cooling_tower: [0, 55, 0, 0xe4e6ea, 11] };

// ---------- Phase 2 scale cues: low cloud wisps sliding between the camera and the ground ----------
const WISPS = 22, PER = 4;
const _wc = new THREE.Color();
/**
 * Soft cloud wisps at 35-65% of the camera's height, drifting on the wind and wrapping round the view. They only fade
 * in once the camera is high (a big hole): parallax against the ground far below is the strongest height cue there is.
 */
export class Wisps {
  constructor() {
    this.cloud = spriteCloud(WISPS * PER, { additive: false, world: true });
    this.sprite = this.cloud.sprite;
    this.sprite.renderOrder = 5;
    this.w = Array.from({ length: WISPS }, () => ({ u: Math.random() * 2 - 1, v: Math.random() * 2 - 1, h: 0.35 + Math.random() * 0.3, s: 0.7 + Math.random() * 0.6,
      parts: Array.from({ length: PER }, () => [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.9, 0.5 + Math.random() * 0.6]) }));
    this.drift = 0;
  }

  update(dt, target, camDist, sun) {
    const k = THREE.MathUtils.smoothstep(camDist, 260, 520); // invisible for a town-sized hole
    this.sprite.visible = k > 0.01;
    if (!this.sprite.visible) return;
    this.drift += dt * 6;
    const span = camDist * 1.1, camH = camDist * 0.82;
    _wc.copy(sun).multiplyScalar(0.25).addScalar(0.78);
    let i = 0;
    for (const w of this.w) {
      // position in a box that travels with the view; wrap on the wind axis
      let u = w.u * span + this.drift;
      u = ((u + span) % (2 * span) + 2 * span) % (2 * span) - span;
      const edge = 1 - Math.abs(u) / span; // fade at the wrap
      // keep the middle of the view clear: the hole and what it's about to eat must always read
      const off = Math.hypot(u, w.v * span) / span, clearMid = THREE.MathUtils.smoothstep(off, 0.45, 0.75);
      const size = camDist * 0.18 * w.s;
      for (const [px, py, pz, ps] of w.parts) {
        this.cloud.pos.array.set([target.x + u + px * size, camH * w.h + py * size, target.z + w.v * span + pz * size], i * 3);
        this.cloud.size.array[i] = size * ps;
        this.cloud.alpha.array[i] = 0.16 * k * Math.min(1, edge * 4) * clearMid;
        _wc.toArray(this.cloud.col.array, i * 3);
        i++;
      }
    }
    const c = this.cloud;
    c.pos.needsUpdate = c.size.needsUpdate = c.alpha.needsUpdate = c.col.needsUpdate = true;
  }
}

// ---------- Phase 2 ambient life: flocks of birds over the countryside ----------
const FLOCKS = 4, PERF = 14;
const _bc = new THREE.Color(0x2a2a30);
/**
 * Loose flocks wheeling over the land near the view, wings flickering (sprite size); they scatter up and away when
 * the hole passes under them. Dark specks against the fields: another thing to measure the drop against.
 */
export class Birds {
  constructor() {
    this.cloud = spriteCloud(FLOCKS * PERF, { additive: false, world: true, bird: true });
    this.sprite = this.cloud.sprite;
    this.sprite.visible = false;
    this.flocks = Array.from({ length: FLOCKS }, (_, i) => ({ x: 0, z: 0, y: 40, h: Math.random() * 6.28, t: Math.random() * 10, panic: 0, i,
      birds: Array.from({ length: PERF }, () => [(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 30, Math.random() * 6.28]) }));
    this.placed = false;
  }

  update(dt, on, target, camDist, hole) {
    this.sprite.visible = on;
    if (!on) { this.placed = false; return; }
    const span = camDist * 0.9;
    let i = 0;
    for (const f of this.flocks) {
      if (!this.placed || Math.hypot(f.x - target.x, f.z - target.z) > span * 1.6) { // (re)enter at the edge of the view
        const a = Math.random() * 6.28;
        f.x = target.x + Math.cos(a) * span; f.z = target.z + Math.sin(a) * span; f.h = a + Math.PI + (Math.random() - 0.5);
        f.y = camDist * (0.12 + Math.random() * 0.1);
      }
      f.t += dt;
      const dh = Math.hypot(hole.x - f.x, hole.z - f.z);
      if (dh < hole.r * 3 + 30) f.panic = 3; // the ground opens below: scatter
      f.panic = Math.max(0, f.panic - dt);
      f.h += Math.sin(f.t * 0.3 + f.i) * dt * 0.25 + (f.panic ? Math.sign(Math.sin(f.h - Math.atan2(f.z - hole.z, f.x - hole.x))) * dt : 0);
      const v = (9 + camDist * 0.02) * (f.panic ? 2 : 1);
      f.x += Math.cos(f.h) * v * dt; f.z += Math.sin(f.h) * v * dt;
      f.y += ((f.panic ? camDist * 0.3 : camDist * 0.15) - f.y) * dt * 0.3;
      const size = Math.max(1.6, camDist * 0.008);
      for (const b of f.birds) {
        const flap = 0.7 + 0.3 * Math.abs(Math.sin(f.t * 9 + b[3]));
        const sp = f.panic ? 1.8 : 1;
        this.cloud.pos.array.set([f.x + b[0] * sp + Math.sin(f.t * 0.7 + b[3]) * 3, f.y + b[1], f.z + b[2] * sp + Math.cos(f.t * 0.6 + b[3]) * 3], i * 3);
        this.cloud.size.array[i] = size * flap;
        this.cloud.alpha.array[i] = 0.75;
        _bc.toArray(this.cloud.col.array, i * 3);
        i++;
      }
    }
    this.placed = true;
    const c = this.cloud;
    c.pos.needsUpdate = c.size.needsUpdate = c.alpha.needsUpdate = c.col.needsUpdate = true;
  }
}

/**
 * Phase 2 rubble: when a building crumbles, chunks spill over the rim and lie there (concrete, brick, sandstone) until a
 * hole passes over them. One instanced draw; a ring buffer recycles the oldest pieces.
 */
export class Rubble {
  constructor(n = 700) {
    const geo = new THREE.IcosahedronGeometry(1, 0).scale(1, 0.55, 0.85).toNonIndexed();
    geo.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardNodeMaterial({ roughness: 0.95, flatShading: true }), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.bits = Array.from({ length: n }, () => ({ live: false, x: 0, z: 0, s: 0 }));
    this.next = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.c = new THREE.Color();
    this.clear();
  }

  clear() {
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.bits.length; i++) { this.bits[i].live = false; this.mesh.setMatrixAt(i, this.m); this.mesh.setColorAt(i, this.c.set(0x999999)); }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = 0; // (nothing to draw until the first spill)
  }

  /** Building e crumbles into hole q: spill chunks over the rim on its side. groundY(x, z) for the land height. */
  spill(e, q, groundY) {
    const t = e.meta.tier, n = Math.min(12, 4 + Math.floor(t * 0.4)), a0 = Math.atan2(e.z - q.z, e.x - q.x);
    const tint = [0xa89f92, 0xb0604a, 0xcdb48c, 0x7a7166][Math.floor(Math.random() * 4)];
    for (let k = 0; k < n; k++) {
      const i = this.next, b = this.bits[i];
      this.next = (i + 1) % this.bits.length;
      const s = Math.min(q.r * 0.14, t * (0.1 + Math.random() * 0.14)), a = a0 + (Math.random() - 0.5) * 1.1, d = q.r * (1.04 + Math.random() * 0.3) + s;
      Object.assign(b, { live: true, x: q.x + Math.cos(a) * d, z: q.z + Math.sin(a) * d, s });
      this.q.setFromEuler(this.e.set(Math.random() * 0.6, Math.random() * 6.28, Math.random() * 0.6));
      this.m.compose(new THREE.Vector3(b.x, groundY(b.x, b.z) + s * 0.2, b.z), this.q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.set(Math.random() < 0.7 ? tint : 0x8c877f).multiplyScalar(0.8 + Math.random() * 0.35));
      this.mesh.count = Math.max(this.mesh.count, i + 1);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  /** Chunks under a hole go in with everything else. */
  update(holes) {
    let dirty = false;
    for (let i = 0; i < this.mesh.count; i++) {
      const b = this.bits[i];
      if (!b.live) continue;
      for (const h of holes) {
        if (h.hidden) continue;
        const dx = b.x - h.x, dz = b.z - h.z;
        if (dx * dx + dz * dz < (h.r * 0.95 - b.s) ** 2) {
          b.live = false;
          this.m.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this.m);
          dirty = true;
          break;
        }
      }
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
