// Swallow sparks: lilac/white motes that burst out of the rim, sized by the bite. One Points draw call.
import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, vec4, uv, length, smoothstep, cameraProjectionMatrix, float, pow } from 'three/tsl';

/** Camera-facing instanced sprites (WebGPU has no sized points): position/colour/size/alpha per instance. */
function spriteCloud(n, { additive, world }) {
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
  mat.colorNode = additive
    ? vec4(instancedBufferAttribute(col).mul(pow(smoothstep(0.5, 0.0, d), float(1.5))).mul(2.2), 1)
    : vec4(instancedBufferAttribute(col), a.mul(smoothstep(0.5, 0.15, d)));
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
const CHUNKS = 260, PUFFS = 520;
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
        t * 0.9, t * 1.1, 1.8 + Math.random(), dust, 0.7);
    }
  }

  /** A ring of dust rolling outward from (x, z): the ground giving way (Phase 2 breakout, collapses at scale). */
  dustRing(x, y, z, r0, speed, n, size, life, color, alpha = 0.75) {
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
  locomotive: [5.3, 4.2, 0, 0xe9e6e0, 2.4] };
