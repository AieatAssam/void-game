// The planet generator. Pure (no three, no DOM): the worker, the main-thread fallback and (later) gameplay share it.
// One fictional Earth-sized world per seed: R = 6371 km, ~29% land, mountain belts on plate seams, ice caps, deserts, forests.
// Directions are plain {x, y, z} unit vectors in PLANET space (+Y is the pole). Heights are metres above sea level.
import { makeNoise, smooth } from './noise.js';

export const R = 6371000;
export const LAND = 0.29;
// surf.R height byte, square-root coded so the coast keeps ~1 m precision and the 8.8 km summits still fit:
//   x = byte * SQ_STEP - SQ_MIN;  e = sign(x) * x^2   (range -5256 .. +8930 m; 0.4 m steps at the shore, 120 m at the summits)
export const SQ_MIN = 72.5, SQ_STEP = (72.5 + 94.5) / 255;
export const encodeHeight = (e) => Math.max(0, Math.min(255, Math.round(((e < 0 ? -Math.sqrt(-e) : Math.sqrt(e)) + SQ_MIN) / SQ_STEP)));
export const decodeHeight = (b) => { const x = b * SQ_STEP - SQ_MIN; return x * Math.abs(x); };

// ---------- tan-warped cube mapping ----------
// face f: dir = normalize(fwd + tan(pi/4 * s) * right + tan(pi/4 * t) * up), s,t in [-1, 1] (texture coordinates).
// Texel areas then vary ~1.4x instead of 5x. The same mapping is written in TSL in planetglobe.js (faceUV).
const FACES = [ // [fwd, right, up]
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const Q4 = Math.PI / 4;

/** Unit direction of face `f` at warped face coordinates (s, t), each in [-1, 1]. `out` is optional. */
export function faceDir(f, s, t, out = { x: 0, y: 0, z: 0 }) {
  const [F, Rt, U] = FACES[f], u = Math.tan(Q4 * s), v = Math.tan(Q4 * t);
  const x = F[0] + u * Rt[0] + v * U[0], y = F[1] + u * Rt[1] + v * U[1], z = F[2] + u * Rt[2] + v * U[2];
  const k = 1 / Math.hypot(x, y, z);
  out.x = x * k; out.y = y * k; out.z = z * k;
  return out;
}

/** Inverse: which face a direction lies on and its warped coordinates. Returns { f, s, t }. */
export function dirFace(d) {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  let f, u, v;
  if (ax >= ay && ax >= az) { f = d.x >= 0 ? 0 : 1; const s = d.x >= 0 ? 1 : -1; u = -s * d.z / ax; v = d.y / ax; }
  else if (ay >= az) { f = d.y >= 0 ? 2 : 3; const s = d.y >= 0 ? 1 : -1; u = d.x / ay; v = -s * d.z / ay; }
  else { f = d.z >= 0 ? 4 : 5; const s = d.z >= 0 ? 1 : -1; u = s * d.x / az; v = d.y / az; }
  return { f, s: Math.atan(u) / Q4, t: Math.atan(v) / Q4 };
}

/** Area of one texel of an N x N face (km^2), for the bite map later. */
export function texelArea(N, i, j) {
  const s = (i / (N - 1)) * 2 - 1, t = (j / (N - 1)) * 2 - 1, u = Math.tan(Q4 * s), v = Math.tan(Q4 * t);
  const du = Q4 * (1 + u * u), dv = Q4 * (1 + v * v), r2 = 1 + u * u + v * v;
  return (du * dv / (r2 * Math.sqrt(r2))) * (2 / (N - 1)) ** 2 * (R / 1000) ** 2;
}

// ---------- the world ----------
const NATION_A = ['Val', 'Kor', 'Ar', 'Ton', 'Mer', 'Sel', 'Dra', 'Ish', 'Nor', 'Zan', 'Lum', 'Ber', 'Ost', 'Quil', 'Tar', 'Vex', 'Hal', 'Bra'];
const NATION_B = ['oria', 'andia', 'esh', 'ova', 'ium', 'ara', 'ista', 'enne', 'oth', 'uvia', 'land', 'mark', 'ria', 'ana', 'ensk', 'ora'];

const smoothstep = (a, b, x) => smooth(a, b, x);
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * makePlanet(seed) -> { elevation(d, fine), climate(d, e), biome(d, e, T, M), habitability(d, e, T, M), nation(d), nationEdge(d), clouds(d),
 *                       lights(d, e, T, M), startDir, nations, seaThreshold }
 * elevation: metres (full function with `fine` extra detail octaves down to ~150 m wavelength; the bake uses 4).
 */
export function makePlanet(seed = 1) {
  const N = makeNoise((seed * 2654435761) ^ 0x51ab7e);
  const { noise3, fbm3, ridged3 } = N;
  const o = (i) => i * 17.31 + (seed % 97) * 0.37; // per-field offsets so the fields don't line up
  let thr = 0;

  // continent field: domain-warped fbm3 at ~1.3 cycles / R
  const cont = (x, y, z) => {
    const wx = noise3(x * 0.9 + o(1), y * 0.9, z * 0.9) * 0.55, wy = noise3(x * 0.9, y * 0.9 + o(2), z * 0.9) * 0.55, wz = noise3(x * 0.9, y * 0.9, z * 0.9 + o(3)) * 0.55;
    const px = x * 1.3 + wx, py = y * 1.3 + wy, pz = z * 1.3 + wz;
    return fbm3(px, py, pz, 5) + 0.12 * noise3(x * 4 + o(4), y * 4, z * 4);
  };
  // sea level: the field value with 29% of the sphere (Fibonacci sample) above it
  {
    const n = 6000, v = new Float32Array(n), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) { const y = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - y * y); v[i] = cont(Math.cos(i * ga) * r, y, Math.sin(i * ga) * r); }
    v.sort();
    thr = v[Math.floor(n * (1 - LAND))];
  }

  const P = { seaThreshold: thr, seed };

  P.elevation = (d, fine = 12) => {
    const { x, y, z } = d;
    const s = cont(x, y, z) - thr; // > 0 land
    let e;
    if (s <= 0) {
      const t = -s;
      e = -(Math.min(t, 0.02) / 0.02 * 20 + 180 * smoothstep(0.02, 0.09, t) + 4600 * smoothstep(0.09, 0.42, t));
      e += fbm3(x * 5 + o(5), y * 5, z * 5, 3) * 260 * smoothstep(0.1, 0.3, t); // abyssal plains and ridges
    } else {
      const inland = smoothstep(0.0, 0.1, s);
      e = Math.min(s, 0.02) / 0.02 * 30 + 900 * smoothstep(0.02, 0.4, s);
      e += (fbm3(x * 7 + o(6), y * 7, z * 7, 4) * 0.5 + 0.5) * (150 + 650 * smoothstep(0.05, 0.3, s)) * inland; // hills
      // mountain belts along the plate seams: |fbm3| small bands, ridged on top, up to ~8.8 km
      const seam = Math.abs(fbm3(x * 1.7 + o(7), y * 1.7, z * 1.7 + 3.3, 3));
      const belt = 1 - smoothstep(0.0, 0.085, seam), plateau = 1 - smoothstep(0.0, 0.2, seam);
      const ridge = ridged3(x * 5.5 + o(8), y * 5.5, z * 5.5, 4);
      const mount = smoothstep(0.0, 0.12, s);
      e += (plateau * 1500 + belt * (900 + 6400 * Math.min(1, ridge * 1.15))) * mount;
    }
    if (fine > 0) { // detail octaves: 160 km down to 150 m wavelengths at fine = 12
      let f = 40, a = 120, sum = 0;
      for (let i = 0; i < fine; i++) { sum += noise3(x * f + o(9), y * f, z * f) * a; f *= 2.03; a *= 0.52; }
      e += sum * smoothstep(-60, 120, e) * (0.35 + 0.65 * smoothstep(0, 1500, e));
    }
    if (P.islet) { // the Phase 3 start islet (radius 1.4 km) planted off the coast
      const q = P.islet, dd = Math.acos(Math.min(1, x * q.x + y * q.y + z * q.z)) * R;
      if (dd < 2200) e = Math.max(e, 70 * (1 - smoothstep(900, 1400, dd)) - 4 * smoothstep(1400, 2200, dd) * (e < 0));
    }
    return e;
  };

  /** Temperature (0 polar .. 1 hot, before altitude) and moisture (0 dry .. 1 wet). */
  P.climate = (d, e) => {
    const lat = Math.abs(d.y);
    let T = 1.02 - 1.07 * Math.pow(lat, 1.7);
    T = T + fbm3(d.x * 2.6 + o(10), d.y * 2.6, d.z * 2.6, 3) * 0.16;
    // wet at the equator and mid latitudes, dry in the subtropics (~25 deg) and at the poles
    const band = 0.8 + 0.3 * Math.cos(lat * Math.PI * 2.1 - 0.2);
    const M = Math.min(1, Math.max(0, band + fbm3(d.x * 3.1 + o(11), d.y * 3.1, d.z * 3.1, 4) * 1.15 - 0.04));
    return { T: Math.min(1, Math.max(0, T)), M };
  };

  /** Biome ids: 0 ocean, 1 ice, 2 tundra, 3 taiga, 4 temperate forest, 5 steppe, 6 desert, 7 savanna, 8 jungle, 9 alpine rock, 10 alpine snow. */
  P.biome = (d, e, T, M) => {
    if (T === undefined) ({ T, M } = P.climate(d, e));
    if (e < 0) return T < 0.1 ? 1 : 0;
    const Te = T - Math.max(0, e - 400) / 9000; // lapse rate
    if (e > 5200 || Te < 0.05) return e > 2500 ? 10 : 1;
    if (e > 3200) return 9;
    if (Te < 0.2) return 2;
    if (Te < 0.38) return M > 0.4 ? 3 : 2;
    if (Te < 0.66) return M > 0.55 ? 4 : M > 0.3 ? 5 : 6;
    return M > 0.62 ? 8 : M > 0.38 ? 7 : 6;
  };

  /** City density 0..1: low, coastal, temperate, wet enough. Feeds food.js and the night lights. */
  P.habitability = (d, e, T, M) => {
    if (e < 0) return 0;
    if (T === undefined) ({ T, M } = P.climate(d, e));
    const low = 1 - smoothstep(250, 1600, e), coast = 0.65 + 0.35 * (1 - smoothstep(0, 900, e));
    const temp = smoothstep(0.22, 0.45, T) * (1 - 0.7 * smoothstep(0.78, 0.98, T)), wet = smoothstep(0.12, 0.45, M) * 0.8 + 0.2;
    return low * coast * temp * wet;
  };

  /** Night light density 0..1: habitability x population noise (clumped, sparse in between). */
  P.lights = (d, e, T, M) => {
    const h = P.habitability(d, e, T, M);
    if (h <= 0.02) return 0;
    const pop = smoothstep(-0.05, 0.4, fbm3(d.x * 9 + o(12), d.y * 9, d.z * 9, 3) + 0.15);
    return Math.min(1, h * (0.45 + 1.3 * pop) * 1.25) * (e < 40 ? 1.15 : 1);
  };

  P.clouds = (d) => {
    const w = fbm3(d.x * 1.6 + o(13), d.y * 1.6, d.z * 1.6, 2) * 1.1;
    const c = fbm3(d.x * 5.5 + w + o(14), d.y * 5.5 + w * 0.5, d.z * 5.5 - w, 5) * (1.1 + 0.4 * Math.cos(Math.abs(d.y) * 9.5)) + 0.1 * Math.cos(Math.abs(d.y) * 9.5) + 0.07;
    return smoothstep(0.02, 0.5, c);
  };

  // ---- nations: ~40 seeded land points (Voronoi on the sphere) ----
  P.nations = [];
  {
    const rnd = N.rnd;
    for (let tries = 0; P.nations.length < 40 && tries < 4000; tries++) {
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      const d = { x: Math.cos(a) * r, y: z, z: Math.sin(a) * r };
      if (P.elevation(d, 0) < 20) continue;
      if (P.nations.some((n) => n.dir.x * d.x + n.dir.y * d.y + n.dir.z * d.z > 0.9925)) continue; // >= ~780 km apart
      const name = NATION_A[Math.floor(rnd() * NATION_A.length)] + NATION_B[Math.floor(rnd() * NATION_B.length)];
      P.nations.push({ id: P.nations.length, name, capital: d, dir: d });
    }
  }
  let _n1 = 0, _n2 = 0;
  const near2 = (d) => {
    let b1 = -2, b2 = -2, i1 = 0;
    const ns = P.nations;
    for (let i = 0; i < ns.length; i++) {
      const q = ns[i].dir, c = q.x * d.x + q.y * d.y + q.z * d.z;
      if (c > b1) { b2 = b1; b1 = c; i1 = i; } else if (c > b2) b2 = c;
    }
    _n1 = b1; _n2 = b2;
    return i1;
  };
  /** Nearest nation point: { id, name, capital }. */
  P.nation = (d) => P.nations[near2(d)];
  /** 0..1 border line strength (1 on the border between two nations). */
  P.nationEdge = (d) => { near2(d); return 1 - smoothstep(0, 0.0045, _n1 - _n2); };

  // ---- the start: a temperate shelf-sea point 12-20 km off a coast with a good city within 60 km ----
  const step = (d, bearing, dist) => { // great-circle step of `dist` metres along `bearing` (radians) from d
    const ref = Math.abs(d.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    let ex = ref.y * d.z - ref.z * d.y, ey = ref.z * d.x - ref.x * d.z, ez = ref.x * d.y - ref.y * d.x;
    let k = 1 / Math.hypot(ex, ey, ez); ex *= k; ey *= k; ez *= k; // east
    const nx = d.y * ez - d.z * ey, ny = d.z * ex - d.x * ez, nz = d.x * ey - d.y * ex; // north = d x east
    const tx = ex * Math.sin(bearing) + nx * Math.cos(bearing), ty = ey * Math.sin(bearing) + ny * Math.cos(bearing), tz = ez * Math.sin(bearing) + nz * Math.cos(bearing);
    const a = dist / R, c = Math.cos(a), s = Math.sin(a);
    return { x: d.x * c + tx * s, y: d.y * c + ty * s, z: d.z * c + tz * s };
  };
  P.step = step;
  function findStart() {
    const rnd = N.rnd;
    let best = null;
    for (let tries = 0; tries < 20000 && !best; tries++) {
      const z = (rnd() * 2 - 1) * 0.8, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      const d = { x: Math.cos(a) * r, y: z, z: Math.sin(a) * r };
      const e = P.elevation(d, 0);
      if (e < 5 || e > 500) continue;
      const { T, M } = P.climate(d, e);
      if (P.habitability(d, e, T, M) < 0.6) continue;
      for (let b = 0; b < 12 && !best; b++) { // walk out to the coast, then 12-20 km beyond
        const bearing = (b / 12) * Math.PI * 2 + rnd();
        let coast = -1;
        for (let m = 4000; m <= 60000; m += 4000) if (P.elevation(step(d, bearing, m), 0) < 0) { coast = m; break; }
        if (coast < 0) continue;
        const off = coast + 12000 + rnd() * 8000, q = step(d, bearing, off), eq = P.elevation(q, 0);
        if (eq < -190 || eq > -4) continue;
        if (P.climate(q, eq).T < 0.4 || P.climate(q, eq).T > 0.85) continue;
        best = q;
        P.city = d; // (the habitable city site the islet looks at)
      }
    }
    if (!best) best = { x: 0, y: 0, z: 1 };
    P.islet = best;
    P.startDir = best;
    return best;
  }
  findStart(); // eagerly: plants the islet, so every bake (worker or main thread) sees the same world
  return P;
}

// ---------- the bake: surf (RGBA8) and night (RG8) face arrays ----------
// surf: R height (byte * 55 - 5200), G temperature, B moisture, A nation border (land only)
// night: R city light density, G cloud cover
// Texel (i, j) of an N x N face sits at warped coordinates (s, t) = (i/(N-1)*2-1, j/(N-1)*2-1): the edge texels lie ON the
// face edge, so neighbouring faces store identical values there and the sampled field is continuous across cube edges.
const _d = { x: 0, y: 0, z: 0 };
export function bakeRows(P, face, N, j0, j1, surf, night) {
  const q = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let j = j0; j < j1; j++) {
    for (let i = 0; i < N; i++) {
      faceDir(face, (i / (N - 1)) * 2 - 1, (j / (N - 1)) * 2 - 1, _d);
      const e = P.elevation(_d, 4), { T, M } = P.climate(_d, e);
      const k = j * N + i;
      surf[k * 4] = encodeHeight(e);
      surf[k * 4 + 1] = q(T);
      surf[k * 4 + 2] = q(M);
      surf[k * 4 + 3] = e > 0 ? q(P.nationEdge(_d)) : 0;
      night[k * 2] = q(P.lights(_d, e, T, M));
      night[k * 2 + 1] = q(P.clouds(_d));
    }
  }
}
