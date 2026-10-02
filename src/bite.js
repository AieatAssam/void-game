// The bite map (docs/PHASE3.md §2.5): the one authoritative record of how much land is left. 6 cube faces x B x B texels
// (tan-warped, the same mapping as planetgen.js / planetglobe.js: texel i sits at s = i/(B-1)*2-1, edge texels on the face edge).
// Credit = the decrease of `rem`, so the total credit can never exceed the total land. The GPU only ever sees `rem8`
// (R8, 255 = untouched): the working precision is 16 bit because at r = 1.4 km a frame chews ~0.1% of a 96 km2 texel.
import { R, decodeHeight, texelArea } from './planetgen.js';
import { P3 } from './phase3.js';

const Q4 = Math.PI / 4;
const FACES = [ // [fwd, right, up] (planetgen.js FACES)
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const OCEAN = 65535;
const tick = () => new Promise((r) => setTimeout(r, 0));

export class BiteMap {
  /** bake = { surf, N } from bakePlanet; tex = the globe's biteTex (DataArrayTexture R8, B x B x 6): its data array is rem8. */
  constructor(bake, tex, B = 1024) {
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
  }

  /** Build the land mask and heights from the bake (async: a tick between faces so the loading screen stays alive). */
  async init() {
    const { B } = this, { surf, N } = this.bake, fl = N * N, H = new Float32Array(6 * fl);
    for (let k = 0; k < 6 * fl; k++) H[k] = decodeHeight(surf[k * 4]);
    let sum = 0;
    const sc = (N - 1) / (B - 1);
    for (let f = 0; f < 6; f++) {
      const base = f * B * B, hb = f * fl;
      for (let j = 0; j < B; j++) {
        const y = j * sc, y0 = Math.min(N - 2, Math.floor(y)), fy = y - y0;
        for (let i = 0; i < B; i++) {
          const x = i * sc, x0 = Math.min(N - 2, Math.floor(x)), fx = x - x0, o = hb + y0 * N + x0;
          const h = H[o] * (1 - fx) * (1 - fy) + H[o + 1] * fx * (1 - fy) + H[o + N] * (1 - fx) * fy + H[o + N + 1] * fx * fy;
          const k = base + j * B + i;
          if (h > 0) { this.hm[k] = Math.min(60000, Math.round(h)); this.rem[k] = 65535; this.rem8[k] = 255; sum += this.area[j * B + i]; } else { this.hm[k] = OCEAN; this.rem8[k] = 255; }
        }
      }
      await tick();
    }
    this.sum0 = this.sum = sum;
    this.tex.needsUpdate = true;
    this.ready = true;
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
    const t0 = performance.now(), { B, rem, ov, hm, area, tau: tauT, tanT, rem8 } = this;
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
        }
      }
      if (touched) this.dirty[f] = 1;
    }
    this.sum -= remArea;
    this.credit = credit;
    this.visited = n; this.ms = performance.now() - t0;
    return credit;
  }

  /** Snapshot / restore the whole bite state (calibration runs and the Sealed checkpoint, §12.7 R2). */
  save() { return { rem: this.rem.slice(), ov: this.ov.slice(), rem8: this.rem8.slice(), sum: this.sum }; }
  restore(sv) { this.rem.set(sv.rem); this.ov.set(sv.ov); this.rem8.set(sv.rem8); this.sum = sv.sum; this.tex.needsUpdate = true; }

  /** Push dirty faces to the GPU (<= 10 Hz). */
  upload(now = performance.now()) {
    if (now - this.lastUp < 100) return;
    let any = false;
    for (let f = 0; f < 6; f++) if (this.dirty[f]) { this.tex.addLayerUpdate(f); this.dirty[f] = 0; any = true; }
    if (any) { this.tex.needsUpdate = true; this.lastUp = now; }
  }
}
const _t = {};
