// The planet's interior and its fracture (docs/PHASE3.md 12.13, the finale): the globe as <= 64 shell shards (a warped Voronoi cut of a subdivided icosphere), each a wedge
// from the surface down to the outer core, with lit cross-section walls (crust strata over a convecting, glowing mantle) and an underside, plus the core sphere.
// Everything is one static geometry per part; a shard's motion is 4 vec4 uniforms (position + stretch, spin quaternion, stretch axis + scale, rest centroid + heat) read in the
// vertex shader by shard id, so shredding 44 chunks costs a handful of uniform writes a frame.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, uniformArray, attribute, positionGeometry, positionLocal, vec3, vec4, float, int, normalize, dot, cross, length, mix, smoothstep, clamp, max, min, abs, pow, exp, sin,
  mx_noise_float, mx_worley_noise_float, mx_fractal_noise_float,
} from 'three/tsl';
import { R, dirFace, decodeHeight } from './planetgen.js';
import { shardXform, xformWith, qInv } from './planetglobe.js';

export const NSH = 64;
export const R_IN = 0.55; // the mantle / outer-core boundary (the real one is 0.546)

/** The shard motion uniforms (shared by the top, the cut and the core): A = (position, stretch S), Q = spin quaternion, V = (stretch axis, scale), X = (rest centroid, heat). */
export function shardUniforms() {
  const mk = () => uniformArray(Array.from({ length: NSH }, () => new THREE.Vector4(0, 0, 0, 0)), 'vec4');
  const SU = { A: mk(), Q: mk(), V: mk(), X: mk() };
  for (let i = 0; i < NSH; i++) { SU.Q.array[i].set(0, 0, 0, 1); SU.V.array[i].set(0, 1, 0, 1); SU.A.array[i].w = 1; }
  return SU;
}

// ---------------------------------------------------------------- the geometry
const V0 = (() => { const t = (1 + Math.sqrt(5)) / 2; return [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]; })();
const F0 = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
const mulberry = (a) => () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hsh = (x, y, z, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483629) + Math.imul(s, 362437)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const sm = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
  const a = (i, j, k) => hsh(ix + i, iy + j, iz + k, s), l = (p, q, t) => p + (q - p) * t;
  return l(l(l(a(0, 0, 0), a(1, 0, 0), fx), l(a(0, 1, 0), a(1, 1, 0), fx), fy), l(l(a(0, 0, 1), a(1, 0, 1), fx), l(a(0, 1, 1), a(1, 1, 1), fx), fy), fz);
}

/**
 * Build the shards as a generator (yield every few ms; the caller drains it between frames). bake = { surf, N }; K shards (<= NSH), the first at `hdir` (the hole's); L = icosphere
 * level (6: 82k triangles; 5: 20k). Returns { top, cut, shards: [{ c: Vector3, n }] }: top = the surface (position = unit direction, aH, aSh, aEdge: hops to a fault line, 0..1),
 * cut = walls and undersides (position = unit direction, aH, aW 1 at the surface .. 0 at R_IN, aSh, aN, aKind 0 wall / 1 underside).
 */
export function* buildShards(bake, { L = 6, K = 44, seed = 11, hdir = { x: 0, y: 1, z: 0 }, bias = 0, ms = 3 } = {}) {
  let t0 = performance.now();
  const slice = () => { const n = performance.now(); if (n - t0 > ms) { t0 = n; return true; } return false; };
  K = Math.min(K, NSH);
  // 1. the icosphere
  const pos = [];
  for (const v of V0) { const l = Math.hypot(v[0], v[1], v[2]); pos.push(v[0] / l, v[1] / l, v[2] / l); }
  let faces = F0.slice();
  for (let lv = 0; lv < L; lv++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const k = a < b ? a * 1048576 + b : b * 1048576 + a; let m = cache.get(k);
      if (m === undefined) { m = pos.length / 3; const x = pos[a * 3] + pos[b * 3], y = pos[a * 3 + 1] + pos[b * 3 + 1], z = pos[a * 3 + 2] + pos[b * 3 + 2], l = Math.hypot(x, y, z); pos.push(x / l, y / l, z / l); cache.set(k, m); }
      return m;
    };
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
      if ((i & 8191) === 0 && slice()) yield;
    }
    faces = nf; yield;
  }
  const nV = pos.length / 3, nF = faces.length / 3, N = bake.N, surf = bake.surf;
  // 2. heights from the bake
  const aHv = new Float32Array(nV), dd = { x: 0, y: 0, z: 0 };
  for (let v = 0; v < nV; v++) {
    dd.x = pos[v * 3]; dd.y = pos[v * 3 + 1]; dd.z = pos[v * 3 + 2];
    const { f, s, t } = dirFace(dd), x = (s * 0.5 + 0.5) * (N - 1), y = (t * 0.5 + 0.5) * (N - 1), x0 = Math.min(N - 2, Math.floor(x)), y0 = Math.min(N - 2, Math.floor(y)), fx = x - x0, fy = y - y0;
    const g = (i, j) => surf[((f * N + j) * N + i) * 4];
    aHv[v] = Math.max(0, decodeHeight(g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy));
    if ((v & 2047) === 0 && slice()) yield;
  }
  // 3. the seeds (farthest-point sampling over candidates thicker near the hole: smaller chunks where it bites first), and the warped Voronoi assignment of every triangle
  const rnd = mulberry(seed), cand = [];
  while (cand.length < 1800) {
    const z = rnd() * 2 - 1, a = rnd() * 6.2832, r = Math.sqrt(1 - z * z), c = [Math.cos(a) * r, z, Math.sin(a) * r];
    if (rnd() < 1 - bias + bias * (0.5 + 0.5 * (c[0] * hdir.x + c[1] * hdir.y + c[2] * hdir.z)) ** 1.5) cand.push(c);
  }
  const seeds = [[hdir.x, hdir.y, hdir.z]], minD = new Float32Array(cand.length).fill(9);
  while (seeds.length < K) {
    const s = seeds[seeds.length - 1]; let best = -1, bd = -1;
    for (let i = 0; i < cand.length; i++) { const c = cand[i], d = 1 - (c[0] * s[0] + c[1] * s[1] + c[2] * s[2]); if (d < minD[i]) minD[i] = d; if (minD[i] > bd) { bd = minD[i]; best = i; } }
    seeds.push(cand[best]);
  }
  const shOf = new Uint8Array(nF), cnt = new Int32Array(K), cs = new Float64Array(K * 3);
  for (let i = 0; i < nF; i++) {
    const a = faces[i * 3] * 3, b = faces[i * 3 + 1] * 3, c = faces[i * 3 + 2] * 3;
    let x = pos[a] + pos[b] + pos[c], y = pos[a + 1] + pos[b + 1] + pos[c + 1], z = pos[a + 2] + pos[b + 2] + pos[c + 2]; const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
    const wx = vnoise(x * 2.6, y * 2.6, z * 2.6, 1) - 0.5 + (vnoise(x * 6.5, y * 6.5, z * 6.5, 4) - 0.5) * 0.4, wy = vnoise(x * 2.6, y * 2.6, z * 2.6, 2) - 0.5 + (vnoise(x * 6.5, y * 6.5, z * 6.5, 5) - 0.5) * 0.4, wz = vnoise(x * 2.6, y * 2.6, z * 2.6, 3) - 0.5 + (vnoise(x * 6.5, y * 6.5, z * 6.5, 6) - 0.5) * 0.4;
    let px = x + wx * 0.34, py = y + wy * 0.34, pz = z + wz * 0.34; const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
    let best = 0, bd = -2; for (let k = 0; k < K; k++) { const s = seeds[k], d = px * s[0] + py * s[1] + pz * s[2]; if (d > bd) { bd = d; best = k; } }
    shOf[i] = best; cnt[best]++; cs[best * 3] += x; cs[best * 3 + 1] += y; cs[best * 3 + 2] += z;
    if ((i & 4095) === 0 && slice()) yield;
  }
  // 4. fault lines: the edges whose two triangles are different shards; hops from them
  const emap = new Map(), bA = [], bB = [], bS = [], hop = new Uint8Array(nV).fill(255);
  for (let i = 0; i < nF; i++) {
    for (let e = 0; e < 3; e++) {
      const a = faces[i * 3 + e], b = faces[i * 3 + (e + 1) % 3], key = a < b ? a * 1048576 + b : b * 1048576 + a, o = emap.get(key);
      if (o === undefined) emap.set(key, i);
      else if (shOf[o] !== shOf[i]) { // (the neighbour traverses the edge the other way round: a wall for each shard)
        bA.push(a, b); bB.push(b, a); bS.push(shOf[i], shOf[o]); hop[a] = hop[b] = 0;
      }
    }
    if ((i & 4095) === 0 && slice()) yield;
  }
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < nF; i++) for (let e = 0; e < 3; e++) {
      const a = faces[i * 3 + e], b = faces[i * 3 + (e + 1) % 3], m = Math.min(hop[a], hop[b]);
      if (m < 255) { if (hop[a] > m + 1) hop[a] = m + 1; if (hop[b] > m + 1) hop[b] = m + 1; }
    }
    yield;
  }
  // 5. the top: non-indexed (a vertex on a fault belongs to several shards)
  const tp = new Float32Array(nF * 9), th = new Float32Array(nF * 3), ts = new Float32Array(nF * 3), te = new Float32Array(nF * 3);
  for (let i = 0; i < nF; i++) {
    for (let e = 0; e < 3; e++) {
      const v = faces[i * 3 + e], o = i * 3 + e;
      tp[o * 3] = pos[v * 3]; tp[o * 3 + 1] = pos[v * 3 + 1]; tp[o * 3 + 2] = pos[v * 3 + 2]; th[o] = aHv[v]; ts[o] = shOf[i]; te[o] = Math.min(hop[v], 8) / 8;
    }
    if ((i & 8191) === 0 && slice()) yield;
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.BufferAttribute(tp, 3)); top.setAttribute('aH', new THREE.BufferAttribute(th, 1)); top.setAttribute('aSh', new THREE.BufferAttribute(ts, 1)); top.setAttribute('aEdge', new THREE.BufferAttribute(te, 1));
  top.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e3);
  yield;
  // 6. the cut: a wall quad under every fault edge of every shard (facing away from the shard), and an underside under every triangle
  const nW = bA.length, nTri = nW * 2 + nF, cp = new Float32Array(nTri * 9), ch = new Float32Array(nTri * 3), cw = new Float32Array(nTri * 3), csh = new Float32Array(nTri * 3), cn = new Float32Array(nTri * 9), ck = new Float32Array(nTri * 3);
  let q = 0;
  const put = (x, y, z, h, w, s, nx, ny, nz, kind) => { cp[q * 3] = x; cp[q * 3 + 1] = y; cp[q * 3 + 2] = z; ch[q] = h; cw[q] = w; csh[q] = s; cn[q * 3] = nx; cn[q * 3 + 1] = ny; cn[q * 3 + 2] = nz; ck[q] = kind; q++; };
  for (let w = 0; w < nW; w++) {
    const a = bA[w] * 3, b = bB[w] * 3, s = bS[w];
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2], bx = pos[b], by = pos[b + 1], bz = pos[b + 2], ha = aHv[bA[w]], hb = aHv[bB[w]];
    let ex = bx - ax, ey = by - ay, ez = bz - az; const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
    let mx = ax + bx, my = ay + by, mz = az + bz; const ml = Math.hypot(mx, my, mz) || 1; mx /= ml; my /= ml; mz /= ml;
    let nx = ey * mz - ez * my, ny = ez * mx - ex * mz, nz = ex * my - ey * mx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; // (e x up: away from the shard)
    put(ax, ay, az, ha, 1, s, nx, ny, nz, 0); put(ax, ay, az, ha, 0, s, nx, ny, nz, 0); put(bx, by, bz, hb, 1, s, nx, ny, nz, 0);
    put(bx, by, bz, hb, 1, s, nx, ny, nz, 0); put(ax, ay, az, ha, 0, s, nx, ny, nz, 0); put(bx, by, bz, hb, 0, s, nx, ny, nz, 0);
    if ((w & 2047) === 0 && slice()) yield;
  }
  for (let i = 0; i < nF; i++) {
    const s = shOf[i];
    for (const e of [0, 2, 1]) { const v = faces[i * 3 + e] * 3; put(pos[v], pos[v + 1], pos[v + 2], 0, 0, s, -pos[v], -pos[v + 1], -pos[v + 2], 1); } // (reversed: it faces the core)
    if ((i & 8191) === 0 && slice()) yield;
  }
  const cut = new THREE.BufferGeometry();
  cut.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cut.setAttribute('aH', new THREE.BufferAttribute(ch, 1)); cut.setAttribute('aW', new THREE.BufferAttribute(cw, 1));
  cut.setAttribute('aSh', new THREE.BufferAttribute(csh, 1)); cut.setAttribute('aN', new THREE.BufferAttribute(cn, 3)); cut.setAttribute('aKind', new THREE.BufferAttribute(ck, 1));
  cut.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e3);
  const shards = [];
  for (let k = 0; k < K; k++) { const l = Math.hypot(cs[k * 3], cs[k * 3 + 1], cs[k * 3 + 2]) || 1; shards.push({ c: new THREE.Vector3(cs[k * 3] / l, cs[k * 3 + 1] / l, cs[k * 3 + 2] / l), n: cnt[k] }); }
  const fault = new Float32Array(Math.min(3000, nW) * 3);
  for (let i = 0; i < fault.length / 3; i++) { const v = bA[Math.floor((i / (fault.length / 3)) * nW)] * 3; fault[i * 3] = pos[v]; fault[i * 3 + 1] = pos[v + 1]; fault[i * 3 + 2] = pos[v + 2]; }
  return { top, cut, shards, fault, faces: nF, walls: nW };
}

// ---------------------------------------------------------------- the interior's look
const heatRamp = (T) => { // a blackbody-ish ramp: 0 dark red-brown, .35 deep red, .6 orange, .8 yellow-white, 1 white (HDR)
  const t = clamp(T, 0, 1);
  return mix(mix(mix(vec3(0.05, 0.012, 0.01), vec3(0.55, 0.07, 0.015), smoothstep(0.0, 0.35, t)), vec3(1.6, 0.5, 0.07), smoothstep(0.3, 0.62, t)), mix(vec3(2.6, 1.5, 0.45), vec3(3.4, 2.9, 2.3), smoothstep(0.86, 1.0, t)), smoothstep(0.58, 0.88, t));
};

/** The walls and undersides of the shards: crust strata over a convecting, glowing mantle; the underside is the outer core's skin. Uniforms: the shard set, the globe's (uSun, uCam, uRelief, uTime). */
export function cutMaterial(u, SU) {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
  const aH = attribute('aH', 'float'), aW = attribute('aW', 'float'), aSh = attribute('aSh', 'float'), aKind = attribute('aKind', 'float'), aN = attribute('aN', 'vec3');
  const idx = int(aSh.add(0.5));
  m.positionNode = shardXform(positionGeometry.mul(mix(float(R_IN), float(1).add(max(aH, 0).mul(u.uRelief).div(R)), aW)), SU, idx);
  m.colorNode = Fn(() => {
    const Qs = SU.Q.element(idx), heat = SU.X.element(idx).w, L = qInv(Qs, u.uSun).toVar(), V = qInv(Qs, normalize(u.uCam.sub(positionLocal))).toVar();
    const rho = mix(float(R_IN), float(1), aW).toVar(), rest = positionGeometry.mul(rho).toVar(), under = aKind;
    const N = normalize(aN).toVar(); // (wound to face out: the faces are drawn on both sides for the shards that tumble)
    const dep = float(1).sub(rho), nA = mx_fractal_noise_float(rest.mul(42), 3, 2.1, 0.5, 1), nB = mx_noise_float(rest.mul(130)), nC = mx_noise_float(rest.mul(9));
    // layers by depth: crust (a thin top), lithosphere bands, then the mantle whose temperature climbs toward the core
    const crustK = float(1).sub(smoothstep(0.004, 0.012, dep)).toVar(), litho = float(1).sub(smoothstep(0.018, 0.06, dep)).mul(float(1).sub(crustK)).toVar();
    const T = clamp(smoothstep(0.03, 0.45, dep).mul(0.78).add(nA.mul(0.16)).add(nC.mul(0.07)).add(float(under).mul(0.35)), 0, 1).toVar();
    // convection: warped worley cells, bright at the cell borders (rising plumes), dim in the cell
    const cell = mx_worley_noise_float(rest.mul(11).add(vec3(nC.mul(1.4), nA.mul(1.1), nB.mul(0.3)))), vein = pow(float(1).sub(clamp(cell.mul(1.7), 0, 1)), 3);
    const hot = heatRamp(T.add(vein.mul(0.22)).add(heat.mul(0.2))).toVar();
    // the cooled crust: dark basalt, glowing in its cracks
    const crk = pow(float(1).sub(abs(mx_noise_float(rest.mul(70).add(vec3(0, 0, 3.7))))), 14);
    const bands = sin(dep.mul(2200).add(nA.mul(7))).mul(0.5).add(0.5);
    const strata = mix(vec3(0.17, 0.11, 0.075), vec3(0.34, 0.25, 0.17), bands).mul(nB.mul(0.25).add(0.9));
    const crustC = mix(vec3(0.075, 0.06, 0.05), vec3(0.2, 0.17, 0.12), nB.mul(0.5).add(0.5)), lit = max(dot(N, L), 0).mul(0.8).add(0.16);
    const rockC = mix(strata, crustC, crustK).mul(lit).mul(3.0);
    const emissive = hot.mul(float(0.38).add(vein.mul(0.75))).mul(float(1).sub(crustK.mul(0.85)).mul(float(1).sub(litho.mul(0.55)))).add(vec3(1.2, 0.35, 0.06).mul(crk).mul(crustK.mul(0.5).add(litho.mul(0.3)).add(0.15)).mul(heat.mul(0.8).add(0.55)));
    const col = mix(emissive.add(rockC.mul(0.5)), emissive.mul(1.25).add(rockC.mul(0.12)), smoothstep(0.1, 0.4, dep).mul(float(1).sub(float(under)))); // (deep walls: nearly all glow)
    const fres = pow(float(1).sub(max(dot(N, V), 0)), 2.0).mul(0.25);
    return vec4(mix(col, hot.mul(1.6), float(under).mul(0.65)).add(vec3(1.0, 0.4, 0.1).mul(fres).mul(T)), 1);
  })();
  return m;
}

/** The core sphere (R_IN): the outer core's skin, white-orange convective cells with dark rafts, a hot rim. Its own motion uniforms (it is stretched and swallowed last). */
export function coreMaterial(u) {
  const U = { A: uniform(new THREE.Vector4(0, 0, 0, 1)), Q: uniform(new THREE.Vector4(0, 0, 0, 1)), V: uniform(new THREE.Vector4(0, 1, 0, 1)), X: uniform(new THREE.Vector4(0, 0, 0, 0)), uHeat: uniform(0.4) };
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  m.positionNode = xformWith(positionGeometry.mul(R_IN * 0.99), U.A, U.Q, U.V, U.X);
  m.colorNode = Fn(() => {
    const d = normalize(positionGeometry), V = qInv(U.Q, normalize(u.uCam.sub(positionLocal))), t = u.uTime.mul(0.05);
    const w1 = mx_noise_float(d.mul(3.1).add(vec3(t, 0, 1.7))), w2 = mx_noise_float(d.mul(7.3).add(vec3(0, t.mul(1.4), 4.1)));
    const cell = mx_worley_noise_float(d.mul(5.5).add(vec3(w1, w2, w1.mul(w2)).mul(0.45)).add(vec3(0, t, 0))), fine = mx_worley_noise_float(d.mul(17).add(vec3(w2, w1, 0).mul(0.6)));
    const vein = pow(float(1).sub(clamp(cell.mul(1.55), 0, 1)), 2.2), tex = clamp(vein.mul(0.8).add(fine.mul(-0.22).add(0.28)).add(U.uHeat.mul(0.5)), 0, 1);
    const fres = pow(float(1).sub(max(dot(d, V), 0)), 2.5);
    return vec4(heatRamp(tex.mul(0.9).add(0.12)).mul(float(0.8).add(vein.mul(0.9))).add(vec3(1.0, 0.5, 0.15).mul(fres).mul(0.9)), 1);
  })();
  m.userData.U = U;
  return m;
}
