// Land is the meal (docs/PHASE3.md §12.3). The land is pre-cut into nested units on the bite-map grid; there is no per-texel label array:
// a texel's parcel is arithmetic on its coordinates (`pk`). Levels (0..4): parcel (warped 4x4 texels, ~1.5k km2) < district (4x4 parcels) <
// province (16x16 parcels) < nation (a nation's share of one landmass) < landmass (a connected component of land parcels).
// Clarification of the spec: every level's key carries the parcel's nation and landmass, so districts and provinces split at borders and straits
// and "every unit nests in its parent" holds by construction. Units never cross a cube-face edge below nation level.
// `left` (km2 of land still standing) is kept in Float64 for every unit; bite.chew() subtracts each texel's eaten area from the parcel and its
// four ancestors, so sum(left) == bite.sum at every level.
import { R, faceDir } from './planetgen.js';

// ---------------------------------------------------------------- hashing and names (moved here from food.js, which is deleted in R4)
export const H5 = (a, b, c, d, e) => {
  let h = (0x9e3779b9 ^ a) | 0;
  h = Math.imul(h ^ b, 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ c, 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h ^ d, 0x27d4eb2f); h ^= h >>> 15;
  h = Math.imul(h ^ e, 0x165667b1);
  return (h ^ (h >>> 16)) >>> 0;
};
export const rng = (h) => () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SYL_A = ['Ard', 'Bel', 'Cor', 'Dun', 'Eld', 'Fen', 'Gal', 'Har', 'Ist', 'Jor', 'Kes', 'Lor', 'Mar', 'Nev', 'Ost', 'Pel', 'Quen', 'Ros', 'Sal', 'Tor', 'Ul', 'Ver', 'Wyn', 'Yar', 'Zel', 'Bran', 'Cas', 'Dov'];
const SYL_B = ['ent', 'ora', 'ham', 'wick', 'port', 'mere', 'ton', 'ford', 'bury', 'ley', 'stad', 'dale', 'grad', 'ville', 'haven', 'by', 'ria', 'on', 'ash', 'more'];
export const nameOf = (rnd) => SYL_A[Math.floor(rnd() * SYL_A.length)] + SYL_B[Math.floor(rnd() * SYL_B.length)];
const SYL_C = ['a', 'ia', 'ora', 'ana', 'ica', 'ara']; // continents: Austra, Kesia ...

export const LEVELS = ['parcel', 'district', 'province', 'nation', 'landmass'];
const NPAR = 256, FACE_P = NPAR * NPAR, NP = 6 * FACE_P; // parcels per face side / face / planet
const LAT = 129; // 8-texel lattice nodes per face side
const SLICE = 3; // ms per generator slice

export class Landforms {
  constructor(bite, P, seed) {
    this.bite = bite; this.P = P; this.seed = seed; this.B = bite.B;
    this.lat = [];
    for (let f = 0; f < 6; f++) { // the border warp: +-1.5 texels at every lattice node (x and y interleaved)
      const rnd = rng(H5(seed, 4242, f, 0, 0)), a = new Float32Array(LAT * LAT * 2);
      for (let k = 0; k < a.length; k++) a[k] = (rnd() - 0.5) * 3;
      this.lat.push(a);
    }
    this.pArea0 = new Float64Array(NP); // km2 of land per parcel at the start
    this.pTot = new Float32Array(NP); // km2 of everything (land and sea) assigned to the parcel: coast = land share < 0.88
    this.sH = new Float32Array(NP); this.sN = new Float32Array(NP); this.sT = new Float32Array(NP); // area-weighted sums: height (m), night lights, temperature
    this.sS = new Float32Array(NP); this.sU = new Float32Array(NP); // area-weighted face coordinates of the land (centroid)
    this.ready = false;
  }

  /** The parcel (0..NP-1) of texel (i, j) on face f: floor((i + wx) / 4), clamped. wx, wy: bilinear from the seeded 8-texel lattice. One function for init, chew and the tears. */
  pk(f, i, j) {
    const lat = this.lat[f], o = (((j >> 3) * LAT) + (i >> 3)) * 2, fx = (i & 7) * 0.125, fy = (j & 7) * 0.125;
    const ax = lat[o] + (lat[o + 2] - lat[o]) * fx, bx = lat[o + 2 * LAT] + (lat[o + 2 * LAT + 2] - lat[o + 2 * LAT]) * fx;
    const ay = lat[o + 1] + (lat[o + 3] - lat[o + 1]) * fx, by = lat[o + 2 * LAT + 1] + (lat[o + 2 * LAT + 3] - lat[o + 2 * LAT + 1]) * fx;
    let pi = ((i + ax + (bx - ax) * fy) * 0.25) | 0, pj = ((j + ay + (by - ay) * fy) * 0.25) | 0;
    if (pi < 0) pi = 0; else if (pi > 255) pi = 255;
    if (pj < 0) pj = 0; else if (pj > 255) pj = 255;
    return (f << 16) | (pj << 8) | pi;
  }

  /** Smooth value noise in 0..1 on face f at lattice coordinates (x, y): hashed integer nodes, smoothstep blend. */
  vnoise(f, x, y, salt) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), h = (a, b) => H5(this.seed, f, a, b, salt) / 4294967296;
    const a0 = h(x0, y0), a1 = h(x0 + 1, y0), b0 = h(x0, y0 + 1), b1 = h(x0 + 1, y0 + 1);
    return a0 + (a1 - a0) * sx + (b0 + (b1 - b0) * sx - a0 - (a1 - a0) * sx) * sy;
  }

  /** The neighbour of parcel (f, pi, pj) at step (di, dj), across a face edge if need be (a step just past the edge, mapped back through the cube). */
  nb(f, pi, pj, di, dj) {
    const ni = pi + di, nj = pj + dj;
    if (ni >= 0 && ni < NPAR && nj >= 0 && nj < NPAR) return (f << 16) | (nj << 8) | ni;
    const B = this.B, d = faceDir(f, ((4 * pi + 1.5 + 4 * di) / (B - 1)) * 2 - 1, ((4 * pj + 1.5 + 4 * dj) / (B - 1)) * 2 - 1, _d), t = this.bite.texel(d, _t);
    return this.pk(t.f, t.i, t.j);
  }

  /** After the texel pass: centroids, nations, landmasses, the unit tables of every level, CSR lists, names' raw data. A generator: yields every ~3 ms. */
  *build() {
    const { P } = this, B = this.B, vn = (f, x, y, salt) => this.vnoise(f, x, y, salt), cl = (v, m) => (v < 0 ? 0 : v > m ? m : v);
    let ts = performance.now();
    const due = () => performance.now() - ts > SLICE;
    const pDir = new Float32Array(NP * 3), pNat = new Uint8Array(NP), pComp = new Uint16Array(NP);
    const land = []; // land parcels
    for (let pk = 0; pk < NP; pk++) {
      const a = this.pArea0[pk];
      if (a > 0) {
        land.push(pk);
        const f = pk >> 16, s = (this.sS[pk] / a), t = (this.sU[pk] / a), d = faceDir(f, (s / (B - 1)) * 2 - 1, (t / (B - 1)) * 2 - 1, _d); // (mean texel coordinates)
        pDir[pk * 3] = d.x; pDir[pk * 3 + 1] = d.y; pDir[pk * 3 + 2] = d.z;
        pNat[pk] = P.nation(d).id;
      }
      if ((pk & 1023) === 0 && due()) { yield; ts = performance.now(); }
    }
    // landmasses: 8-connected components of land parcels (BFS; a neighbour across a face edge goes through the cube)
    const q = new Int32Array(land.length || 1);
    let ncomp = 0;
    for (let li = 0; li < land.length; li++) {
      const s0 = land[li];
      if (pComp[s0]) continue;
      ncomp++; pComp[s0] = ncomp;
      let h = 0, tl = 0;
      q[tl++] = s0;
      while (h < tl) {
        const c = q[h++], f = c >> 16, pj = (c >> 8) & 255, pi = c & 255;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const n = this.nb(f, pi, pj, di, dj);
          if (this.pArea0[n] > 0 && !pComp[n]) { pComp[n] = ncomp; q[tl++] = n; }
        }
        if ((h & 1023) === 0 && due()) { yield; ts = performance.now(); }
      }
    }
    this.pNat = pNat; this.pComp = pComp; this.pDir = pDir; this.land = Int32Array.from(land);
    // unit tables: keys (cell, nat, comp); level 3 = (nat, comp); level 4 = comp
    const pu = [null, new Int32Array(NP).fill(-1), new Int32Array(NP).fill(-1), new Int32Array(NP).fill(-1), new Int32Array(NP).fill(-1)];
    const maps = [null, new Map(), new Map(), new Map()], par = [null, [], [], []]; // parent unit per unit (level + 1)
    const cnt = [0, 0, 0, 0, ncomp + 1];
    for (let li = 0; li < land.length; li++) {
      const pk = land[li], f = pk >> 16, pj = (pk >> 8) & 255, pi = pk & 255, nat = pNat[pk], comp = pComp[pk];
      // organic cells: a district is a 4x4 block of parcels in a smoothly warped grid, a province a 4x4 block of districts in a second warp (province cell = a function of the district cell, so they nest)
      const dci = cl(((pi + (vn(f, pi / 7, pj / 7, 11) - 0.5) * 4.4) * 0.25) | 0, 63), dcj = cl(((pj + (vn(f, pi / 7, pj / 7, 12) - 0.5) * 4.4) * 0.25) | 0, 63);
      const pci = cl(((dci + (vn(f, dci / 3, dcj / 3, 21) - 0.5) * 3.6) * 0.25) | 0, 15), pcj = cl(((dcj + (vn(f, dci / 3, dcj / 3, 22) - 0.5) * 3.6) * 0.25) | 0, 15);
      const k1 = (((f << 12) | (dcj << 6) | dci) * 64 + nat) * 65536 + comp, k2 = (((f << 8) | (pcj << 4) | pci) * 64 + nat) * 65536 + comp, k3 = nat * 65536 + comp;
      let u3 = maps[3].get(k3); if (u3 === undefined) { u3 = cnt[3]++; maps[3].set(k3, u3); par[3].push(comp); }
      let u2 = maps[2].get(k2); if (u2 === undefined) { u2 = cnt[2]++; maps[2].set(k2, u2); par[2].push(u3); }
      let u1 = maps[1].get(k1); if (u1 === undefined) { u1 = cnt[1]++; maps[1].set(k1, u1); par[1].push(u2); }
      pu[1][pk] = u1; pu[2][pk] = u2; pu[3][pk] = u3; pu[4][pk] = comp;
      if ((li & 1023) === 0 && due()) { yield; ts = performance.now(); }
    }
    cnt[0] = NP;
    this.pu = pu;
    // the level records: area0, left, centroid, parent, CSR (parcels of each unit), a few stats for names
    const lv = [{ n: NP, area0: this.pArea0, left: Float64Array.from(this.pArea0), torn: new Uint8Array(NP), c: pDir, parent: pu[1] }];
    for (let L = 1; L <= 4; L++) {
      const n = cnt[L], area0 = new Float64Array(n), cx = new Float64Array(n * 3), start = new Int32Array(n + 1), np = new Int32Array(n);
      const nat = new Uint8Array(n), hsum = new Float64Array(n), nsum = new Float64Array(n), tsum = new Float64Array(n), coast = new Int32Array(n);
      for (let li = 0; li < land.length; li++) {
        const pk = land[li], u = pu[L][pk], a = this.pArea0[pk];
        area0[u] += a; cx[u * 3] += pDir[pk * 3] * a; cx[u * 3 + 1] += pDir[pk * 3 + 1] * a; cx[u * 3 + 2] += pDir[pk * 3 + 2] * a;
        hsum[u] += this.sH[pk]; nsum[u] += this.sN[pk]; tsum[u] += this.sT[pk]; np[u]++; nat[u] = pNat[pk];
        if (a < 0.88 * this.pTot[pk]) coast[u]++;
        if ((li & 2047) === 0 && due()) { yield; ts = performance.now(); }
      }
      const c = new Float32Array(n * 3);
      for (let u = 0; u < n; u++) { const k = Math.hypot(cx[u * 3], cx[u * 3 + 1], cx[u * 3 + 2]) || 1; c[u * 3] = cx[u * 3] / k; c[u * 3 + 1] = cx[u * 3 + 1] / k; c[u * 3 + 2] = cx[u * 3 + 2] / k; }
      for (let u = 0; u < n; u++) start[u + 1] = start[u] + np[u];
      const fill = start.slice(0, n), list = new Int32Array(land.length);
      for (let li = 0; li < land.length; li++) { const pk = land[li], u = pu[L][pk]; list[fill[u]++] = pk; }
      lv.push({ n, area0, left: Float64Array.from(area0), torn: new Uint8Array(n), c, parent: L < 4 ? Int32Array.from(par[L]) : null, start, list, np, nat, hsum, nsum, tsum, coast });
      yield; ts = performance.now();
    }
    this.lv = lv; this.ncomp = ncomp; this.names = lv.map(() => new Map());
    // a nation's main landmass (its largest unit): the rest are "Isles"
    this.main = new Int32Array(P.nations.length).fill(-1);
    for (let u = 0; u < lv[3].n; u++) { const n = lv[3].nat[u]; if (this.main[n] < 0 || lv[3].area0[u] > lv[3].area0[this.main[n]]) this.main[n] = u; }
    this.ready = true;
  }

  /** The unit index of a parcel at level L (0 = the parcel itself). */
  unitOf(L, pk) { return L === 0 ? pk : this.pu[L][pk]; }
  /** Equivalent radius (m) of a unit's starting land area. */
  rEq(L, u) { return Math.sqrt(this.lv[L].area0[u] / Math.PI) * 1000; }
  /** Parcel indices of a unit (a view into the CSR list; level 0: the parcel itself). */
  parcels(L, u) { const v = this.lv[L]; return L === 0 ? Int32Array.of(u) : v.list.subarray(v.start[u], v.start[u + 1]); }
  /** Unit direction of the unit's centroid. */
  dirOf(L, u, out = _d) { const c = this.lv[L].c; out.x = c[u * 3]; out.y = c[u * 3 + 1]; out.z = c[u * 3 + 2]; return out; }

  /** The name of a unit, made once: "Province of X" / "X Peninsula", "X Massif" ..., nations from planetgen, landmasses "Isle of X" / continents. */
  name(L, u) {
    const cache = this.names[L];
    let s = cache.get(u);
    if (s) return s;
    const v = this.lv[L], rnd = rng(H5(this.seed, 777 + L, u, 1, 2)), base = nameOf(rnd), a = v.area0[u] || 0, n = L > 0 ? v.np[u] || 1 : 1;
    if (L === 4) s = a < 3e5 ? `Isle of ${base}` : a < 2e6 ? `${base}land` : `Continent of ${base.replace(/[a-z]{0,4}$/, '')}${SYL_C[Math.floor(rnd() * SYL_C.length)]}`;
    else if (L === 3) { const nm = this.P.nations[v.nat[u]].name; s = this.main[v.nat[u]] === u ? nm : a < 3e5 ? `the ${nm} Isles` : `${nm} (${this.name(4, v.parent[u])})`; }
    else if (L === 2) s = v.coast[u] / n > 0.5 ? `${base} Peninsula` : `Province of ${base}`;
    else if (L === 1) {
      const h = v.hsum[u] / (a || 1), nl = v.nsum[u] / (a || 1), tt = v.tsum[u] / (a || 1) / 255;
      s = h > 2000 ? `${base} Massif` : tt < 0.17 ? `${base} Ice Sheet` : nl > 0.5 ? `${base} Metro Belt` : h > 700 ? `${base} Highlands` : v.coast[u] / n > 0.5 ? `${base} Coast` : `${base} Plain`;
    } else s = base;
    cache.set(u, s);
    return s;
  }

  /** Σ left == bite.sum per level (relative error), and the nesting check; for __planetUnits(). */
  check() {
    const out = { sum: this.bite.sum, levels: [] };
    this.lv.forEach((v, L) => {
      let s = 0; for (let u = 0; u < v.n; u++) s += v.left[u];
      out.levels.push({ L, name: LEVELS[L], units: L === 0 ? this.land.length : v.n - (L === 4 ? 1 : 0), left: s, err: s / (this.bite.sum || 1) - 1 });
    });
    let bad = 0;
    for (const pk of this.land) { // a parcel's four ancestors nest: same nation, same comp, the parent table agrees
      const u1 = this.pu[1][pk], u2 = this.lv[1].parent[u1], u3 = this.lv[2].parent[u2], u4 = this.lv[3].parent[u3];
      if (u2 !== this.pu[2][pk] || u3 !== this.pu[3][pk] || u4 !== this.pu[4][pk] || this.lv[3].nat[u3] !== this.pNat[pk] || this.pComp[pk] !== u4) bad++;
    }
    out.nestingBad = bad;
    return out;
  }
}
const _d = { x: 0, y: 0, z: 0 }, _t = {};
