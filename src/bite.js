// The bite map (docs/PHASE3.md §2.5): the one authoritative record of how much land is left. 6 cube faces x B x B texels
// (tan-warped, the same mapping as planetgen.js / planetglobe.js: texel i sits at s = i/(B-1)*2-1, edge texels on the face edge).
// Credit = the decrease of `rem`, so the total credit can never exceed the total land. The GPU only ever sees `rem8`
// (R8, 255 = untouched): the working precision is 16 bit because at r = 1.4 km a frame chews ~0.1% of a 96 km2 texel.
import { R, decodeHeight, texelArea } from './planetgen.js';
import { P3 } from './phase3.js';
import { Landforms } from './landforms.js';

const Q4 = Math.PI / 4;
const FACES = [ // [fwd, right, up] (planetgen.js FACES)
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const OCEAN = 65535;
const tick = () => new Promise((r) => setTimeout(r, 0));
const SLICE = 3; // ms: the init generator's slice (§12.7 R2: no slice > 4 ms)
const POP = 8.1e9; // the world's people (the counter ends at exactly this)
const MAXT = 16384; // parcels touched in one chew

export class BiteMap {
  /** bake = { surf, N } from bakePlanet; tex = the globe's biteTex (DataArrayTexture R8, B x B x 6): its data array is rem8. */
  constructor(bake, tex, B = 1024, P = null, seed = 1) {
    this.B = B; this.tex = tex; this.rem8 = tex.image.data;
    const n = 6 * B * B;
    this.rem = new Uint16Array(n); // working remaining fraction of land (65535 = untouched); ocean: 0 and never visited
    this.ov = new Uint16Array(n); // fraction of the texel the hole has ever overlapped (only grows)
    this.hm = new Uint16Array(n); // land height (m, rounded); OCEAN (65535) = never counts
    this.area = new Float32Array(B * B); // km2 per texel, the same on every face
    this.tanT = new Float32Array(B);
    for (let i = 0; i < B; i++) this.tanT[i] = Math.tan(Q4 * ((i / (B - 1)) * 2 - 1));
    this.tau = new Float32Array(B * B); // angular size of a texel (rad)
    for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) { const a = texelArea(B, i, j); this.area[j * B + i] = a; this.tau[j * B + i] = Math.sqrt(a) * 1000 / R; }
    this.bake = bake;
    this.dirty = new Uint8Array(6); this.lastUp = 0;
    this.frame = 0;
    this.sum0 = 0; this.sum = 0; // km2 of land at the start / now
    this.credit = 0; // m2 of credit from the last chew()
    this.visited = 0; this.ms = 0;
    this.ready = false;
    this.lf = P ? new Landforms(this, P, seed) : null; // the units (§12.3)
    this.pop = 0; this.popK = 0; this.initMs = 0; this.initSlice = 0; // people swallowed (counter), people per (km2 x night light), init timing
    this.touched = new Int32Array(MAXT); this.nTouched = 0; this.tflag = new Uint8Array(6 * 256 * 256); // parcels the last chew() ate from
    this.ptear = new Uint8Array(6 * 256 * 256); // parcels already inside a tear job (1)
    this.jobs = []; this.events = []; this.tearOn = true; this.texBudget = 15000; this.tearMs = 0; this.cTear = 0; this.cPull = 0; // tear jobs, events for the game, per-frame credit (m2)
    this.pullAt = 0; this.stat = { tears: 0, pulls: 0, parcelTears: 0 };
    const N = bake.N; this.nIdx = new Int32Array(B); this.nRow = new Int32Array(B); const sc = (N - 1) / (B - 1);
    for (let i = 0; i < B; i++) { this.nIdx[i] = Math.round(i * sc); this.nRow[i] = Math.round(i * sc) * N; } // bake texel of a bite texel (rows pre-multiplied)
  }

  /** Build the land mask, heights, parcels and units from the bake as a generator that yields every ~3 ms (§12.7 R2). Drain it with init(). */
  *gen() {
    const t00 = performance.now();
    let ts = t00, worst = 0;
    const { B, lf } = this, { surf, night, N } = this.bake, fl = N * N, H = new Float32Array(6 * fl);
    for (let k = 0; k < 6 * fl; k++) { H[k] = decodeHeight(surf[k * 4]); if ((k & 65535) === 0) if (performance.now() - ts > SLICE) { worst = Math.max(worst, performance.now() - ts); yield; ts = performance.now(); } }
    let sum = 0, sumN = 0;
    const sc = (N - 1) / (B - 1), { nIdx, nRow } = this;
    for (let f = 0; f < 6; f++) {
      const base = f * B * B, hb = f * fl;
      for (let j = 0; j < B; j++) {
        const y = j * sc, y0 = Math.min(N - 2, Math.floor(y)), fy = y - y0;
        for (let i = 0; i < B; i++) {
          const x = i * sc, x0 = Math.min(N - 2, Math.floor(x)), fx = x - x0, o = hb + y0 * N + x0;
          const h = H[o] * (1 - fx) * (1 - fy) + H[o + 1] * fx * (1 - fy) + H[o + N] * (1 - fx) * fy + H[o + N + 1] * fx * fy;
          const k = base + j * B + i, ar = this.area[j * B + i];
          if (lf) lf.pTot[lf.pk(f, i, j)] += ar;
          if (h > 0) {
            this.hm[k] = Math.min(60000, Math.round(h)); this.rem[k] = 65535; this.rem8[k] = 255; sum += ar;
            if (lf) {
              const pk = lf.pk(f, i, j), ni = hb + nRow[j] + nIdx[i], nr = night[ni * 2] / 255;
              lf.pArea0[pk] += ar; lf.sH[pk] += ar * h; lf.sN[pk] += ar * nr; lf.sT[pk] += ar * surf[ni * 4 + 1]; lf.sS[pk] += ar * i; lf.sU[pk] += ar * j; sumN += ar * nr;
            }
          } else { this.hm[k] = OCEAN; this.rem8[k] = 255; }
        }
        if (performance.now() - ts > SLICE) { worst = Math.max(worst, performance.now() - ts); yield; ts = performance.now(); }
      }
    }
    this.sum0 = this.sum = sum;
    this.popK = sumN > 0 ? POP / sumN : 0; // people per (km2 x night light): the counter ends at exactly 8.1 B
    this.tex.needsUpdate = true;
    if (lf) { ts = performance.now(); for (const _ of lf.build()) { worst = Math.max(worst, performance.now() - ts); yield; ts = performance.now(); } }
    this.initMs = performance.now() - t00; this.initSlice = worst;
    this.ready = true;
  }
  /** Drain gen() in ~10 ms bursts between timer ticks (the loading line stays alive). */
  async init() {
    let t = performance.now();
    for (const _ of this.gen()) { if (performance.now() - t > 10) { await tick(); t = performance.now(); } }
    return this;
  }

  /** Land eaten, 0..1 (by area). */
  get landEaten() { return this.sum0 > 0 ? 1 - this.sum / this.sum0 : 0; }

  /** The texel under a planet-space unit direction: { k, f, i, j }. */
  texel(d, out = {}) {
    const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z), B = this.B;
    let f, u, v;
    if (ax >= ay && ax >= az) { f = d.x >= 0 ? 0 : 1; const s = d.x >= 0 ? 1 : -1; u = -s * d.z / ax; v = d.y / ax; }
    else if (ay >= az) { f = d.y >= 0 ? 2 : 3; const s = d.y >= 0 ? 1 : -1; u = d.x / ay; v = -s * d.z / ay; }
    else { f = d.z >= 0 ? 4 : 5; const s = d.z >= 0 ? 1 : -1; u = s * d.x / az; v = d.y / az; }
    out.f = f;
    out.i = Math.max(0, Math.min(B - 1, Math.round((Math.atan(u) / Q4 * 0.5 + 0.5) * (B - 1))));
    out.j = Math.max(0, Math.min(B - 1, Math.round((Math.atan(v) / Q4 * 0.5 + 0.5) * (B - 1))));
    out.k = f * B * B + out.j * B + out.i;
    return out;
  }
  /** Land left under a direction: remaining fraction 0..1 for land, -1 for the sea; `h` (m) is the land height. */
  landAt(d) { const t = this.texel(d, _t); return this.hm[t.k] === OCEAN ? -1 : this.rem[t.k] / 65535; }
  heightAt(d) { const t = this.texel(d, _t); return this.hm[t.k] === OCEAN ? 0 : this.hm[t.k]; }
  /** Remaining land fraction under a direction (1 = untouched, ocean = 1). */
  remAt(d) { const t = this.texel(d, _t); return this.hm[t.k] === OCEAN ? 1 : this.rem[t.k] / 65535; }

  /**
   * Chew the land under a hole disc for dt seconds. c = unit direction (planet space), r = radius (m), moved = metres travelled
   * this frame. Returns the credit in m2 (already x land share, not x G). Visits at most P3.texelBudget texels, round robin.
   */
  chew(c, r, dt, moved) {
    const t0 = performance.now(), { B, rem, ov, hm, area, tau: tauT, tanT, rem8, lf } = this;
    const lv = lf?.lv, l0 = lv?.[0].left, l1 = lv?.[1].left, l2 = lv?.[2].left, l3 = lv?.[3].left, l4 = lv?.[4].left, pu1 = lf?.pu[1], pu2 = lf?.pu[2], pu3 = lf?.pu[3], pu4 = lf?.pu[4];
    const { tflag, touched: tlist, nIdx, nRow } = this, night = this.bake.night, fl = this.bake.N * this.bake.N;
    let nT = 0, popAcc = 0;
    const rho = r / R, cosIn = Math.cos(Math.max(0, rho - 0.0016)), cosOuter = Math.cos(Math.min(3, rho * 1.0 + 0.012)); // (a generous outer bound: a texel is <= ~1.7e-3 rad at B = 1024)
    // boundary points of the disc -> a bounding box per face (gnomonic, conservative)
    const ax = Math.abs(c.y) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    let t1x = ax[1] * c.z - ax[2] * c.y, t1y = ax[2] * c.x - ax[0] * c.z, t1z = ax[0] * c.y - ax[1] * c.x;
    let k = 1 / Math.hypot(t1x, t1y, t1z); t1x *= k; t1y *= k; t1z *= k;
    const t2x = c.y * t1z - c.z * t1y, t2y = c.z * t1x - c.x * t1z, t2z = c.x * t1y - c.y * t1x;
    const cr = Math.cos(rho), sr = Math.sin(rho), box = [];
    let total = 0;
    for (let f = 0; f < 6; f++) {
      const [F, Rt, U] = FACES[f];
      let smin = 9, smax = -9, tmin = 9, tmax = -9;
      for (let q = -1; q < 16; q++) {
        let px = c.x, py = c.y, pz = c.z;
        if (q >= 0) { const a = (q / 16) * Math.PI * 2, ca = Math.cos(a) * sr, sa = Math.sin(a) * sr; px = c.x * cr + t1x * ca + t2x * sa; py = c.y * cr + t1y * ca + t2y * sa; pz = c.z * cr + t1z * ca + t2z * sa; }
        const w = px * F[0] + py * F[1] + pz * F[2];
        if (w < 0.08) continue;
        const s = Math.atan((px * Rt[0] + py * Rt[1] + pz * Rt[2]) / w) / Q4, t = Math.atan((px * U[0] + py * U[1] + pz * U[2]) / w) / Q4;
        if (s < smin) smin = s; if (s > smax) smax = s; if (t < tmin) tmin = t; if (t > tmax) tmax = t;
      }
      if (smin > smax || smax < -1.02 || smin > 1.02 || tmax < -1.02 || tmin > 1.02) { box.push(null); continue; }
      const pad = 2.5 / (B - 1) * 2;
      const i0 = Math.max(0, Math.floor((Math.max(-1, smin - pad) * 0.5 + 0.5) * (B - 1))), i1 = Math.min(B - 1, Math.ceil((Math.min(1, smax + pad) * 0.5 + 0.5) * (B - 1)));
      const j0 = Math.max(0, Math.floor((Math.max(-1, tmin - pad) * 0.5 + 0.5) * (B - 1))), j1 = Math.min(B - 1, Math.ceil((Math.min(1, tmax + pad) * 0.5 + 0.5) * (B - 1)));
      box.push([i0, i1, j0, j1]);
      total += (i1 - i0 + 1) * (j1 - j0 + 1);
    }
    const stride = Math.max(1, Math.ceil(total / P3.texelBudget)), phase = this.frame++ % stride;
    const dtE = dt * stride, mvE = moved * stride, D = P3.depth(r), sweep = r > 0 ? Math.min(1, (2 * mvE) / (Math.PI * r)) : 0;
    const crust = P3.crust, chewK = D / P3.chewT;
    let credit = 0, remArea = 0, n = 0;
    for (let f = 0; f < 6; f++) {
      const b = box[f];
      if (!b) continue;
      const [F, Rt, U] = FACES[f], base = f * B * B;
      let touched = false;
      for (let j = b[2] + ((phase - b[2]) % stride + stride) % stride; j <= b[3]; j += stride) {
        const tj = tanT[j], vx = F[0] + tj * U[0], vy = F[1] + tj * U[1], vz = F[2] + tj * U[2];
        for (let i = b[0]; i <= b[1]; i++) {
          const ti = tanT[i], dx0 = vx + ti * Rt[0], dy0 = vy + ti * Rt[1], dz0 = vz + ti * Rt[2], il = 1 / Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0);
          const dx = dx0 * il, dy = dy0 * il, dz = dz0 * il, cs = dx * c.x + dy * c.y + dz * c.z;
          if (cs < cosOuter) continue;
          const kk = base + j * B + i;
          if (hm[kk] === OCEAN) continue;
          n++;
          const ar = area[j * B + i], tau = tauT[j * B + i];
          let cov;
          if (rho < 1.5 * tau) { // a small disc: 4x4 supersampling across the texel (planar, chord distances)
            const ip = Math.min(B - 1, i + 1), im = Math.max(0, i - 1), jp = Math.min(B - 1, j + 1), jm = Math.max(0, j - 1);
            const ux = (tanT[ip] - tanT[im]) * Rt[0], uy = (tanT[ip] - tanT[im]) * Rt[1], uz = (tanT[ip] - tanT[im]) * Rt[2];
            const wx = (tanT[jp] - tanT[jm]) * U[0], wy = (tanT[jp] - tanT[jm]) * U[1], wz = (tanT[jp] - tanT[jm]) * U[2];
            const ul = Math.hypot(ux, uy, uz) || 1, wl = Math.hypot(wx, wy, wz) || 1;
            // unit tangents scaled to the texel's angular size
            const e1x = (ux / ul) * tau, e1y = (uy / ul) * tau, e1z = (uz / ul) * tau, e2x = (wx / wl) * tau, e2y = (wy / wl) * tau, e2z = (wz / wl) * tau;
            let hit = 0;
            for (let a = 0; a < 4; a++) for (let bb = 0; bb < 4; bb++) {
              const sa = (a + 0.5) / 4 - 0.5, sb = (bb + 0.5) / 4 - 0.5;
              const qx = dx + e1x * sa + e2x * sb - c.x, qy = dy + e1y * sa + e2y * sb - c.y, qz = dz + e1z * sa + e2z * sb - c.z;
              if (qx * qx + qy * qy + qz * qz <= rho * rho) hit++;
            }
            cov = hit / 16;
          } else if (cs > cosIn) cov = 1; // (well inside: no acos)
          else cov = Math.min(1, Math.max(0, (rho - Math.acos(Math.min(1, cs))) / tau + 0.5));
          if (cov <= 0) continue;
          const hcol = hm[kk] + crust;
          let o = ov[kk] / 65535;
          o = Math.min(1, Math.max(o, cov) + cov * sweep);
          ov[kk] = o * 65535;
          const rn = rem[kk] / 65535, room = rn - (1 - o);
          if (room <= 0) continue;
          const d = Math.min(cov * dtE * chewK / hcol, room);
          if (d <= 0) continue;
          const nr = rn - d;
          rem[kk] = Math.round(nr * 65535);
          const r8 = Math.round(nr * 255);
          if (r8 !== rem8[kk]) { rem8[kk] = r8; touched = true; }
          const da = d * ar;
          remArea += da;
          credit += da * 1e6 * Math.sqrt(hcol / 1000);
          if (lf) { // the units (§12.3): the parcel and its four ancestors lose da; the parcel is marked for the tear check
            const pk = lf.pk(f, i, j);
            l0[pk] -= da; l1[pu1[pk]] -= da; l2[pu2[pk]] -= da; l3[pu3[pk]] -= da; l4[pu4[pk]] -= da;
            if (!tflag[pk] && nT < MAXT) { tflag[pk] = 1; tlist[nT++] = pk; }
            popAcc += da * night[(f * fl + nRow[j] + nIdx[i]) * 2];
          }
        }
      }
      if (touched) this.dirty[f] = 1;
    }
    this.sum -= remArea; this.pop += popAcc * this.popK / 255; this.nTouched = nT;
    this.credit = credit;
    this.visited = n; this.ms = performance.now() - t0;
    return credit;
  }

  // ------------------------------------------------------------------ tear-off and pull-in (§12.3)
  /** After chew(): every unit the disc touched this frame with 0 < left < min(0.5 area0, 0.6 pi r^2) tears off (the highest qualifying ancestor wins). c = hole direction (planet space), r in m. */
  tearCheck(c, r) {
    const lf = this.lf, n = this.nTouched;
    if (lf && this.tearOn) {
      const lim = 0.6 * Math.PI * (r / 1000) ** 2, { lv, pu } = lf;
      for (let k = 0; k < n; k++) {
        const pk = this.touched[k];
        if (this.ptear[pk]) continue;
        for (let L = 4; L >= 0; L--) {
          const u = L ? pu[L][pk] : pk, v = lv[L], left = v.left[u];
          if (left > 1e-6 && left < Math.min(0.5 * v.area0[u], lim) && !v.torn[u]) { this.startTear(L, u, c, 'tear'); break; }
        }
      }
    }
    for (let k = 0; k < n; k++) this.tflag[this.touched[k]] = 0;
    this.nTouched = 0;
  }

  /** Every ~0.35 s: remnants (left < 0.5 area0 and < 0.08 pi r^2) and whole isles (area0 < 0.08 pi r^2) with their centroid within 2.5 r tear off untouched. */
  pullCheck(c, r, now) {
    const lf = this.lf;
    if (!lf || !this.tearOn || now < this.pullAt) return;
    this.pullAt = now + 0.35;
    const lim = 0.08 * Math.PI * (r / 1000) ** 2, cosR = Math.cos(Math.min(3, (2.5 * r) / R));
    for (let L = 4; L >= 1; L--) {
      const v = lf.lv[L], cc = v.c;
      for (let u = 0; u < v.n; u++) {
        const left = v.left[u];
        if (left <= 1e-6 || v.torn[u]) continue;
        if (L === 4 ? v.area0[u] >= lim : !(left < 0.5 * v.area0[u] && left < lim)) continue;
        if (cc[u * 3] * c.x + cc[u * 3 + 1] * c.y + cc[u * 3 + 2] * c.z > cosR) this.startTear(L, u, c, 'pull');
      }
    }
  }

  /** Start a tear job for a unit: its standing parcels sorted nearest-first to c, sunk as a wave of 0.8-2.5 s (log of the area). Returns the job. */
  startTear(L, u, c, kind) {
    const lf = this.lf, v = lf.lv[L], left = v.left[u], ps = lf.parcels(L, u), pd = lf.pDir, l0 = lf.lv[0].left;
    v.torn[u] = 1;
    const cand = [];
    for (let k = 0; k < ps.length; k++) { const pk = ps[k]; if (!this.ptear[pk] && l0[pk] > 1e-6) { this.ptear[pk] = 1; cand.push(pk); } }
    if (!cand.length) return null;
    const dist = new Float32Array(cand.length), idx = cand.map((_, k) => k);
    cand.forEach((pk, k) => { dist[k] = Math.acos(Math.min(1, Math.max(-1, pd[pk * 3] * c.x + pd[pk * 3 + 1] * c.y + pd[pk * 3 + 2] * c.z))); });
    idx.sort((a, b) => dist[a] - dist[b]);
    const list = Int32Array.from(idx, (k) => cand[k]), ds = Float32Array.from(idx, (k) => dist[k]);
    const T = 0.8 + 1.7 * Math.min(1, Math.max(0, Math.log(Math.max(left, 1) / 1500) / Math.log(8e6 / 1500)));
    const d = lf.dirOf(L, u, {});
    const job = { L, u, kind, list, dist: ds, n: list.length, next: 0, t: 0, T, dmax: ds[ds.length - 1] || 1e-6, act: [], credit: 0, area: left, name: lf.name(L, u) };
    this.jobs.push(job);
    const popLeft = (L === 0 ? lf.sN[u] : v.nsum[u]) * this.popK * (left / (v.area0[u] || 1));
    this.stat[L === 0 ? 'parcelTears' : kind === 'pull' ? 'pulls' : 'tears']++;
    this.events.push({ type: 'start', kind, L, u, name: job.name, area0: v.area0[u], left, T, dir: d, rEq: lf.rEq(L, u), parcels: job.n, pop: popLeft });
    return job;
  }

  /** Advance the tear jobs: <= texBudget texel visits across all jobs per frame. Credit lands in cTear / cPull (m2). */
  stepTears(dt) {
    this.cTear = this.cPull = 0;
    if (!this.jobs.length) { this.tearMs = 0; return; }
    const t0 = performance.now(), STAGE = [0.55, 0.36, 0], GAP = 0.11;
    let budget = this.texBudget;
    for (let ji = this.jobs.length - 1; ji >= 0; ji--) {
      const J = this.jobs[ji];
      J.t += dt;
      const reach = Math.min(1, J.t / J.T) * J.dmax * 1.0001;
      while (J.next < J.n && budget > 0 && J.dist[J.next] <= reach) {
        const pk = J.list[J.next++], tx = this.parcelTexels(pk);
        budget -= 64;
        if (tx.length) { const a = { tx, pk, t0: J.t, stage: 1 }; J.act.push(a); budget -= this.shrinkAll(a, STAGE[0], J); }
      }
      for (let k = J.act.length - 1; k >= 0; k--) {
        const a = J.act[k], st = Math.min(3, 1 + Math.floor((J.t - a.t0) / GAP));
        if (st > a.stage) { budget -= this.shrinkAll(a, STAGE[st - 1], J); a.stage = st; }
        if (a.stage >= 3) { J.act[k] = J.act[J.act.length - 1]; J.act.pop(); }
      }
      if (J.next >= J.n && !J.act.length) {
        this.jobs.splice(ji, 1);
        this.events.push({ type: 'done', kind: J.kind, L: J.L, u: J.u, name: J.name, area: J.area, credit: J.credit });
      }
    }
    this.tearMs = performance.now() - t0;
  }

  /** The standing land texels (flat indices) of a parcel: the 8x8 window around its nominal block, filtered through pk(). */
  parcelTexels(pk) {
    const { B, lf, hm, rem } = this, f = pk >> 16, pj = (pk >> 8) & 255, pi = pk & 255, out = [], base = f * B * B;
    const i0 = Math.max(0, 4 * pi - 2), i1 = Math.min(B - 1, 4 * pi + 5), j0 = Math.max(0, 4 * pj - 2), j1 = Math.min(B - 1, 4 * pj + 5);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const kk = base + j * B + i;
      if (hm[kk] !== OCEAN && rem[kk] > 0 && lf.pk(f, i, j) === pk) out.push(kk);
    }
    return Int32Array.from(out);
  }

  /** Multiply the remaining fraction of every texel of a sinking parcel by `frac` (0 = gone): the one take-texel path for tears (left, pop, credit, ledger stay in sync). Returns the texel count. */
  shrinkAll(a, frac, J) {
    const { B, lf, rem, rem8, ov, hm, area, bake } = this, lv = lf.lv, BB = B * B, night = bake.night, fl = bake.N * bake.N, crust = P3.crust, K = P3.collapseK;
    const { nIdx, nRow } = this, pk = a.pk, u1 = lf.pu[1][pk], u2 = lf.pu[2][pk], u3 = lf.pu[3][pk], u4 = lf.pu[4][pk];
    let credit = 0, da = 0, pop = 0;
    for (const kk of a.tx) {
      const rn = rem[kk] / 65535;
      if (rn <= 0) continue;
      const nr = rn * frac, d = rn - nr, f = (kk / BB) | 0, j = ((kk - f * BB) / B) | 0, i = kk - f * BB - j * B;
      rem[kk] = Math.round(nr * 65535); ov[kk] = 65535;
      const r8 = Math.round(nr * 255);
      if (r8 !== rem8[kk]) { rem8[kk] = r8; this.dirty[f] = 1; }
      const dd = d * area[j * B + i];
      da += dd; credit += dd * 1e6 * Math.sqrt((hm[kk] + crust) / 1000); pop += dd * night[(f * fl + nRow[j] + nIdx[i]) * 2];
    }
    if (da > 0) {
      lv[0].left[pk] -= da; lv[1].left[u1] -= da; lv[2].left[u2] -= da; lv[3].left[u3] -= da; lv[4].left[u4] -= da;
      this.sum -= da; this.pop += pop * this.popK / 255;
      credit *= K; J.credit += credit;
      if (J.kind === 'pull') this.cPull += credit; else this.cTear += credit;
    }
    return a.tx.length;
  }

  /** Snapshot / restore the whole bite state (calibration runs and the Sealed checkpoint, §12.7 R2). */
  save() {
    const lf = this.lf;
    return { rem: this.rem.slice(), ov: this.ov.slice(), rem8: this.rem8.slice(), sum: this.sum, pop: this.pop, ptear: this.ptear.slice(), lv: lf?.lv.map((v) => ({ left: v.left.slice(), torn: v.torn?.slice() })) };
  }
  restore(sv) {
    this.rem.set(sv.rem); this.ov.set(sv.ov); this.rem8.set(sv.rem8); this.sum = sv.sum; this.pop = sv.pop; this.ptear.set(sv.ptear); this.jobs.length = 0; this.events.length = 0;
    sv.lv?.forEach((s, L) => { this.lf.lv[L].left.set(s.left); if (s.torn) this.lf.lv[L].torn.set(s.torn); });
    this.tex.needsUpdate = true;
  }

  /** Push dirty faces to the GPU (<= 10 Hz). */
  upload(now = performance.now()) {
    if (now - this.lastUp < (this.jobs.length ? 33 : 100)) return; // (a tear is a wave: 30 Hz while one runs)
    let any = false;
    for (let f = 0; f < 6; f++) if (this.dirty[f]) { this.tex.addLayerUpdate(f); this.dirty[f] = 0; any = true; }
    if (any) { this.tex.needsUpdate = true; this.lastUp = now; }
  }
}
const _t = {};
