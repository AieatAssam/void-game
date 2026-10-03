// Shared kit for the Phase 3 attacks (threat.js and src/threat/*.js): colours, orientation helpers, camera-facing ribbons, planet-anchored sprite pools.
import * as THREE from 'three/webgpu';
import { attribute, vec4, float, pow, abs } from 'three/tsl';
import { spriteCloud } from '../fx.js';
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const rnd = (a, b) => a + Math.random() * (b - a);
export const _Y = new THREE.Vector3(0, 1, 0);
export const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3(), v6 = new THREE.Vector3();
export const m4 = new THREE.Matrix4(), qa = new THREE.Quaternion(), qi = new THREE.Quaternion();
export const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
export const FIRE = [C(0xfff4d6, 4), C(0xffc060, 3), C(0xff7a24, 2.2), C(0xc8340c, 1.4)], SMOKE0 = C(0x2a2522), SMOKE1 = C(0x7d7266), ASH = C(0x5a534b), DUST = C(0xb9a98f);
/** People as text: '2.4 M' (long: '2 million'); under 500 it is 'nobody' (long) or '0'. One copy for the HUD, the news, the cities, the finale card and the results. */
export const popStr = (p, long = false) => {
  const u = long ? [' billion', ' million', ' thousand'] : [' B', ' M', ' k'];
  if (p < 500) return long ? 'nobody' : '0';
  return p >= 1e9 ? `${(p / 1e9).toFixed(p >= 1e10 ? 1 : 2)}${u[0]}` : p >= 1e6 ? `${(p / 1e6).toFixed(p >= 1e7 || long ? 0 : 1)}${u[1]}` : `${Math.round(p / 1e3)}${u[2]}`;
};
export const KMs = (m) => (m >= 1e6 ? `${(m / 1e6).toFixed(1)} Mm` : `${Math.round(m / 1000)} km`);

/** Tangent unit vector at dir d with the given compass bearing (0 = toward +Y's north, clockwise), planet space. */
export function tangentAt(d, bearing, out) {
  const e = v6.crossVectors(_Y, d); if (e.lengthSq() < 1e-8) e.set(1, 0, 0); e.normalize();
  const n = out.crossVectors(d, e).normalize(); // (north)
  return out.copy(n).multiplyScalar(Math.cos(bearing)).addScaledVector(e, Math.sin(bearing)).normalize();
}
export const sv = new THREE.Vector3(), w1 = new THREE.Vector3(), w2 = new THREE.Vector3(), w3 = new THREE.Vector3(), wm = new THREE.Matrix4();
/** Orient a model (up = +y, length axis `axis` = +x or +z) so its length points along `fwd` and its up is as close to `up` as that allows. */
export function aim(obj, fwd, up, axis = 'x') {
  w1.copy(fwd).normalize(); w2.copy(up).addScaledVector(w1, -up.dot(w1)).normalize();
  if (axis === 'x') { w3.crossVectors(w1, w2); wm.makeBasis(w1, w2, w3); } else { w3.crossVectors(w2, w1); wm.makeBasis(w3, w2, w1); }
  obj.quaternion.setFromRotationMatrix(wm);
}
/** A velocity at planet point `up` (unit): east a, north b, up c (m/s). */
export function vel3(up, a, b, c, out) {
  const e = w1.crossVectors(_Y, up); if (e.lengthSq() < 1e-8) e.set(1, 0, 0); e.normalize(); const n = w2.crossVectors(up, e);
  return out.set(0, 0, 0).addScaledVector(e, a).addScaledVector(n, b).addScaledVector(up, c);
}
/** Great-circle interpolation of unit vectors. */
export function slerp(a, b, t, out) {
  const om = Math.acos(Math.min(1, Math.max(-1, a.dot(b)))), so = Math.sin(om);
  if (so < 1e-6) return out.copy(a);
  return out.set(0, 0, 0).addScaledVector(a, Math.sin((1 - t) * om) / so).addScaledVector(b, Math.sin(t * om) / so);
}

// ---------------------------------------------------------------- camera-facing ribbons (the arc, the contrail, the beam, the rod, the orbit)
const ribMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
ribMat.colorNode = vec4(attribute('aCol', 'vec4').xyz, attribute('aCol', 'vec4').w.mul(pow(float(1).sub(abs(attribute('aSide', 'float'))), 0.9)));
export class Ribbon {
  constructor(n, root) {
    this.n = n; this.cnt = 0;
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 6); this.col = new Float32Array(n * 8); this.pts = Array.from({ length: n }, () => new THREE.Vector3()); this.w = new Float32Array(n);
    const side = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n; i++) { side[2 * i] = -1; side[2 * i + 1] = 1; if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i, 2 * i - 1, 2 * i + 1); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.mesh = new THREE.Mesh(g, ribMat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9; this.mesh.visible = false;
    root.add(this.mesh);
  }
  /** Point i: planet-space position (copied), half width (m), rgba. */
  set(i, p, w, r, g, b, a) { this.pts[i].copy(p); this.w[i] = w; this.col.set([r, g, b, a, r, g, b, a], i * 8); }
  /** Finish: `cnt` points are drawn; sides are perpendicular to the tangent and the view ray. */
  done(cnt, camP) {
    this.cnt = cnt; this.mesh.visible = cnt > 1;
    if (cnt < 2) return;
    for (let i = 0; i < cnt; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(cnt - 1, i + 1)], p = this.pts[i];
      v1.subVectors(b, a); v2.subVectors(p, camP); v1.cross(v2).normalize().multiplyScalar(this.w[i]);
      this.pos[i * 6] = p.x - v1.x; this.pos[i * 6 + 1] = p.y - v1.y; this.pos[i * 6 + 2] = p.z - v1.z; this.pos[i * 6 + 3] = p.x + v1.x; this.pos[i * 6 + 4] = p.y + v1.y; this.pos[i * 6 + 5] = p.z + v1.z;
    }
    this.geo.setDrawRange(0, (cnt - 1) * 6);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aCol.needsUpdate = true;
  }
  hide() { this.mesh.visible = false; this.cnt = 0; }
}

// ---------------------------------------------------------------- planet-anchored sprite pools (additive glows, normal-blend smoke)
export class Pool {
  constructor(n, additive) {
    this.n = n; this.add = additive; this.cloud = spriteCloud(n, { additive, world: true }); this.sprite = this.cloud.sprite; this.sprite.renderOrder = additive ? 11 : 10;
    this.P = new Float32Array(n * 3); this.V = new Float32Array(n * 3); this.age = new Float32Array(n).fill(9); this.life = new Float32Array(n).fill(1);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n); this.C = new Float32Array(n * 3); this.drag = new Float32Array(n); this.next = 0;
    this.cloud.alpha.array.fill(0); this.cloud.size.array.fill(0);
  }
  /** pos = planet-space metres, vel = planet-space m/s. */
  spawn(p, vel, s0, s1, life, color, alpha, drag = 0.6) {
    const i = this.next; this.next = (i + 1) % this.n;
    const lift = 0.42 * Math.max(s0, s1) / (p.length() || 1); // (a sprite is a flat quad: its lower half would sink into the ground and be cut by the depth test, so it sits on it)
    this.P[i * 3] = p.x * (1 + lift); this.P[i * 3 + 1] = p.y * (1 + lift); this.P[i * 3 + 2] = p.z * (1 + lift); if (vel) { this.V[i * 3] = vel.x; this.V[i * 3 + 1] = vel.y; this.V[i * 3 + 2] = vel.z; } else this.V.fill(0, i * 3, i * 3 + 3);
    this.s0[i] = s0; this.s1[i] = s1; this.life[i] = life; this.age[i] = 0; this.a0[i] = alpha; this.drag[i] = drag; this.C[i * 3] = color.r; this.C[i * 3 + 1] = color.g; this.C[i * 3 + 2] = color.b;
  }
  step(dt) { for (let i = 0; i < this.n; i++) if (this.age[i] < this.life[i]) { this.age[i] += dt; const k = Math.max(0, 1 - this.drag[i] * dt), j = i * 3; this.V[j] *= k; this.V[j + 1] *= k; this.V[j + 2] *= k; this.P[j] += this.V[j] * dt; this.P[j + 1] += this.V[j + 1] * dt; this.P[j + 2] += this.V[j + 2] * dt; } }
  /** Write render-space positions, sizes and alphas (after the world's frame is placed): q = planet -> render rotation, off = the group's position. */
  flush(q, off) {
    const c = this.cloud, pos = c.pos.array, size = c.size.array, al = c.alpha.array, col = c.col.array;
    for (let i = 0; i < this.n; i++) {
      const t = this.age[i] / this.life[i];
      if (t >= 1) { size[i] = 0; al[i] = 0; if (this.add) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
      v1.set(this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]).applyQuaternion(q).add(off);
      pos[i * 3] = v1.x; pos[i * 3 + 1] = v1.y; pos[i * 3 + 2] = v1.z;
      size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      if (this.add) { const f = this.a0[i] * (1 - t) * (1 - t); col[i * 3] = this.C[i * 3] * f; col[i * 3 + 1] = this.C[i * 3 + 1] * f; col[i * 3 + 2] = this.C[i * 3 + 2] * f; }
      else { al[i] = this.a0[i] * Math.min(1, t * 12) * (1 - t * t); col[i * 3] = this.C[i * 3]; col[i * 3 + 1] = this.C[i * 3 + 1]; col[i * 3 + 2] = this.C[i * 3 + 2]; }
    }
    c.pos.needsUpdate = c.size.needsUpdate = c.alpha.needsUpdate = c.col.needsUpdate = true;
  }
}
