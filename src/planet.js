// Phase 3 world (docs/PHASE3.md §2): the hole stays at the render origin and the planet turns under it.
//   holeQ  maps the hole's local frame (x right, y up, z toward the camera) to planet space; moveHole() rotates it incrementally
//          (no lat/long, so no poles). planet.group.quaternion = holeQ^-1, position = (0, -(R + h0), 0).
//   patch  the local detail heightfield for r < 150 km: 129^2 vertices on the sphere, built in 3 ms slices and swapped in whole.
//   trail  a cosmetic fine map of where the hole has been (the wound is readable at 1.4 km because of it).
// Also: enter()/leave() = the §2.7 render fixes (far/near, sky, fog, AO, exposure) so Phase 3 can't regress Phase 1/2.
import * as THREE from 'three/webgpu';
import { makePlanet, R } from './planetgen.js';
import { bakePlanet, PlanetGlobe, TRAIL } from './planetglobe.js';
import { BiteMap } from './bite.js';
import { P3 } from './phase3.js';

const SM = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _v = new THREE.Vector3(), _qi = new THREE.Quaternion();
const STAMPS = 4096;

export class PlanetWorld {
  /** Bake + build everything (async: a tick between stages so the loading line stays alive). */
  static async create(seed, { quality = 'high', onStage = () => {}, workers = true } = {}) {
    onStage('Forming the world…');
    const bake = await bakePlanet(seed, 512, { workers });
    const P = makePlanet(seed);
    const globe = new PlanetGlobe(bake, { quality, relief: 1 });
    const bite = new BiteMap(bake, globe.biteTex, globe.B);
    await bite.init();
    return new PlanetWorld(P, globe, bite, bake, seed);
  }

  constructor(P, globe, bite, bake, seed) {
    Object.assign(this, { P, globe, bite, bake, seed });
    this.holeQ = new THREE.Quaternion();
    this.hdir = new THREE.Vector3(0, 1, 0); // the hole's direction in planet space
    this.h0 = 0; this.E = 1; this.r = P3.startR;
    this.capMode = false;
    this.stamps = new Float32Array(STAMPS * 4); this.nStamps = 0; this.lastStamp = new THREE.Vector3(); this.lastStampR = 0;
    this.job = null; this.patchInfo = null; // {A, X, Z, half, rB}
    this.builds = 0; this.buildMs = 0; this.slices = 0; this.maxSlice = 0;
    this.sunPlanet = new THREE.Vector3(0, 1, 0);
    this.trailAt = 0; this.trailDirty = false;
    this.scratch = null;
    this.span = [0, 0]; this.tilt = { y: 0, nx: 0, nz: 0 };
    this._d = { x: 0, y: 0, z: 0 }; this._f = {};
  }

  // ------------------------------------------------------------------ frames and moving
  /** Put the hole at `dir` (planet space), screen-up (-z) pointing toward `toward` (a planet direction) if given. */
  placeAt(dir, toward = null) {
    const up = _v.set(dir.x, dir.y, dir.z).normalize().clone();
    let n;
    if (toward) { n = new THREE.Vector3(toward.x, toward.y, toward.z).addScaledVector(up, -up.dot(toward)); }
    if (!n || n.lengthSq() < 1e-12) n = Math.abs(up.y) < 0.95 ? new THREE.Vector3(0, 1, 0).addScaledVector(up, -up.y) : new THREE.Vector3(0, 0, -1).addScaledVector(up, up.z);
    n.normalize(); // north = screen-up
    const z = n.clone().negate(), x = new THREE.Vector3().crossVectors(up, z); // x = up x z (x right, y up, z toward the camera)
    this.holeQ.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z)).normalize();
    this.hdir.copy(up);
  }

  /** Move the hole by the local tangent step (dx, dz) metres: rotate the frame about the local axis (dz, 0, -dx) by |d| / R. */
  moveHole(dx, dz) {
    const d = Math.hypot(dx, dz);
    if (d < 1e-9) return;
    _ax.set(dz / d, 0, -dx / d);
    this.holeQ.multiply(_q.setFromAxisAngle(_ax, d / R)).normalize();
    this.hdir.set(0, 1, 0).applyQuaternion(this.holeQ);
  }

  /** The planet-space unit direction of local point (dx, dz) (azimuthal equidistant about the hole). */
  dirAt(dx, dz, out = new THREE.Vector3()) {
    const d = Math.hypot(dx, dz), a = d / R;
    if (d < 1e-6) return out.set(0, 1, 0).applyQuaternion(this.holeQ);
    const s = Math.sin(a) / d;
    return out.set(dx * s, Math.cos(a), dz * s).applyQuaternion(this.holeQ);
  }
  /** Live terrain height (m above sea level) at a local point: the full generator function. */
  elevation(dx, dz) { return this.P.elevation(this.dirAt(dx, dz, _v), 12); }
  /** Height times what is left of the land under it (e_eff, §3) and the remaining fraction. */
  eff(dx, dz) {
    const d = this.dirAt(dx, dz, _v), h = this.P.elevation(d, 12), rem = this.bite.remAt(d);
    return { h, rem, e: Math.max(0, h) * rem };
  }
  /** Where the surface is in render space under a local point (E, the eased base height and the planet's curve included). */
  groundY(dx, dz) {
    const h = Math.max(0, this.elevation(dx, dz));
    return h * this.E - this.h0 - (dx * dx + dz * dz) / (2 * R);
  }

  // ------------------------------------------------------------------ the sun
  setSunRender(v) { this.sunPlanet.copy(v).normalize().applyQuaternion(this.holeQ); this.globe.setSun(this.sunPlanet); }
  sunRender(out) { return out.copy(this.sunPlanet).applyQuaternion(_qi.copy(this.holeQ).invert()); }

  // ------------------------------------------------------------------ per frame
  /**
   * Place the group, ease the base height, pick E, manage the patch (3 ms of slices), stamp the trail, cap mode, uploads.
   * hole: the Hole (r read). camera: for the globe's uCam. Returns the hole's span/tilt for Hole.update.
   */
  update(dt, hole, camera, viewH) {
    const r = hole.r, g = this.globe;
    this.r = r;
    this.E = P3.relief(r);
    g.setRelief(this.E);
    const hc = Math.max(0, this.P.elevation(this.hdir, 12)) * this.E;
    this.h0 += (hc - this.h0) * Math.min(1, dt * 4);
    if (!this.h0Set) { this.h0 = hc; this.h0Set = true; }
    g.group.quaternion.copy(this.holeQ).invert();
    g.group.position.set(0, -(R + this.h0), 0);
    // ground under the disc for the rim / well
    const k = 0.75 * r, ys = [this.groundY(0, 0), this.groundY(k, 0), this.groundY(-k, 0), this.groundY(0, k), this.groundY(0, -k)];
    this.span[0] = Math.min(...ys); this.span[1] = Math.max(...ys);
    this.tilt.y = ys[0]; this.tilt.nx = (ys[1] - ys[2]) / (2 * k); this.tilt.nz = (ys[3] - ys[4]) / (2 * k);
    // hole cut: flat disc of the hole's radius in render space (T1-T3); caps (T4+) are angular
    if (!this.capMode && r >= P3.capR) this.toCapMode(hole);
    g.u.uCut.value = this.capMode ? 0 : r;
    g.u.uHoleD.value.set(this.hdir.x, this.hdir.y, this.hdir.z, r / R);
    g.u.uClouds.value = 0.5 + 0.5 * SM(8000, 100000, r);
    if (this.capMode) g.setHole(0, this.hdir, r / R); else g.setHole(0, this.hdir, 0);
    // wound depth: the patch's trail sinks ~0.6 r_build; the bite map 3 km (x E applied by the shader's own height)
    const wg = this.patchInfo && !this.capMode ? 0.6 * this.patchInfo.rB : Math.min(60000, Math.max(3000, 0.08 * r)); // (§12.1: while the patch exists tears sink as deep as the swath)
    this.woundG = this.woundG === undefined ? wg : this.woundG + (wg - this.woundG) * Math.min(1, dt * 2);
    g.u.uWoundG.value = this.woundG;
    g.u.uBiteWp.value = SM(1, 3, r / 9800);
    // close-ground pattern scale: ~0.6 r per field, in cross-fading octaves (so it never swims as r grows)
    const lam = Math.max(2, 0.6 * r), lg = Math.log2(lam), L0 = Math.floor(lg);
    g.u.uGcellA.value = 5.0e6 / 2 ** L0; g.u.uGfr.value = lg - L0;
    g.u.uGroundK.value = 1 - SM(1500, 14000, r); // (§12: fields, hedges, canopy and street grids are gone by 14 km: a landmass is read as biomes and relief)
    this.updatePatch(dt, hole);
    g.update(camera, dt, viewH);
  }

  toCapMode(hole) {
    this.capMode = true;
    hole.capMode = true;
    this.globe.hidePatch();
    this.job = null;
  }

  // ------------------------------------------------------------------ the patch
  needPatch(r) {
    if (this.capMode || r >= P3.patchMax) return false;
    const p = this.patchInfo;
    if (!p) return true;
    const ang = Math.acos(Math.min(1, p.A.dot(this.hdir)));
    return ang * R > 4 * r || r > 1.25 * p.rB || r < 0.7 * p.rB;
  }

  updatePatch(dt, hole) {
    const r = hole.r;
    if (!this.job && this.needPatch(r)) this.job = this.patchGen(r);
    if (this.job) {
      const t0 = performance.now();
      let done = false;
      while (performance.now() - t0 < 3) { if (this.job.next().done) { done = true; break; } }
      const ms = performance.now() - t0;
      this.buildMs += ms; this.slices++; this.maxSlice = Math.max(this.maxSlice, ms);
      if (done) this.job = null;
    }
    // trail: stamp the disc where the hole is (whenever it has moved a bit), upload at 20 Hz
    if (this.patchInfo && !this.capMode) {
      if (this.lastStamp.distanceToSquared(this.hdir) * R * R > (0.12 * r) ** 2 || r > this.lastStampR * 1.08 || !this.nStamps) {
        this.lastStamp.copy(this.hdir); this.lastStampR = r;
        const i = this.nStamps++ % STAMPS;
        this.stamps.set([this.hdir.x, this.hdir.y, this.hdir.z, r], i * 4);
        this.stampInto(this.globe.trailData, this.patchInfo, this.hdir.x, this.hdir.y, this.hdir.z, r);
        this.trailDirty = true;
      }
      this.trailAt += dt;
      if (this.trailDirty && this.trailAt > 0.05) { this.globe.trailTex.needsUpdate = true; this.trailDirty = false; this.trailAt = 0; }
    }
  }

  /** Synchronous full build (the first patch, under the loading line). */
  buildPatchNow(r) { const gen = this.patchGen(r); while (!gen.next().done); }

  /** Write a smooth disc of the hole's radius into a patch-space map `arr` (one byte per texel, or `stride` with channel `off`) for patch `p` (A, X, Z, half).
   *  ewK: the soft edge as a share of r (0.1 = the trail's crisp rim; 0.5 = a settlement fading out into the fields). */
  stampInto(arr, p, x, y, z, r, stride = 1, off = 0, ewK = 0.1) {
    const dot = Math.min(1, p.A.x * x + p.A.y * y + p.A.z * z), ang = Math.acos(dot);
    const k = ang < 1e-7 ? R : (R * ang) / Math.sin(ang);
    const gx = k * (p.X.x * x + p.X.y * y + p.X.z * z), gz = k * (p.Z.x * x + p.Z.y * y + p.Z.z * z);
    const L = p.half * 2, ts = L / TRAIL, cx = (gx / L + 0.5) * TRAIL - 0.5, cz = (gz / L + 0.5) * TRAIL - 0.5;
    const rad = r / ts, ew = Math.max(1.5, ewK * r / ts), ext = rad + ew;
    const i0 = Math.max(0, Math.floor(cx - ext)), i1 = Math.min(TRAIL - 1, Math.ceil(cx + ext)), j0 = Math.max(0, Math.floor(cz - ext)), j1 = Math.min(TRAIL - 1, Math.ceil(cz + ext));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i - cx, j - cz), v = Math.min(1, Math.max(0, (rad + ew * 0.5 - d) / ew));
      if (v > 0) { const b = Math.round(v * 255), o = (j * TRAIL + i) * stride + off; if (b > arr[o]) arr[o] = b; }
    }
  }

  /** Patch-space texel (fractional) of a planet direction, for the maps; { u, v } in texels or null. */
  texelOf(p, x, y, z, out = {}) {
    const dot = Math.min(1, p.A.x * x + p.A.y * y + p.A.z * z), ang = Math.acos(dot), k = ang < 1e-7 ? R : (R * ang) / Math.sin(ang), L = p.half * 2;
    out.u = ((k * (p.X.x * x + p.X.y * y + p.X.z * z)) / L + 0.5) * TRAIL - 0.5; out.v = ((k * (p.Z.x * x + p.Z.y * y + p.Z.z * z)) / L + 0.5) * TRAIL - 0.5;
    return out;
  }

  /**
   * Build the next patch in slices (a generator: the caller times it). Anchor = where the hole is now; L = 28 r_build, warped so the
   * middle is dense. Vertex = base position relative to the anchor in float64 (so the GPU never sees planet-sized numbers), the unit
   * direction, the real height, the slope vector, and the rim morphed into the globe's own facet. Ends with the trail re-rasterised from
   * the stamp ring buffer, then commits atomically (attribute rewrite + uniform changes in one frame).
   */
  *patchGen(rB) {
    const t0 = performance.now(), { P, globe } = this, n = globe.PN, lay = globe.layout;
    const A = this.hdir.clone(), X = new THREE.Vector3(1, 0, 0).applyQuaternion(this.holeQ), Z = new THREE.Vector3(0, 0, 1).applyQuaternion(this.holeQ);
    const half = 14 * rB, aW = 1.9, sh = Math.sinh(aW);
    const cs = new Float64Array(n);
    for (let k = 0; k < n; k++) cs[k] = (half * Math.sinh(aW * ((k / (n - 1)) * 2 - 1))) / sh;
    const spacing = cs[(n >> 1) + 1] - cs[n >> 1];
    const fine = Math.max(2, Math.min(12, Math.floor(Math.log(159000 / (2 * spacing)) / Math.log(2.03))));
    const cnt = lay.count, pos = new Float32Array(cnt * 3), dir = new Float32Array(cnt * 3), aH = new Float32Array(cnt), aHm = new Float32Array(cnt), aG = new Float32Array(cnt * 3), aS = new Float32Array(cnt * 2), aUV = new Float32Array(cnt * 2);
    const hs = new Float32Array(n * n), skirt = half * 0.012, d = { x: 0, y: 0, z: 0 }, f = {};
    const L = half * 2;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const gx = cs[i], gz = cs[j], dd = Math.hypot(gx, gz), a = dd / R, c = Math.cos(a), s = dd < 1e-6 ? 0 : Math.sin(a) / dd;
        d.x = A.x * c + (X.x * gx + Z.x * gz) * s; d.y = A.y * c + (X.y * gx + Z.y * gz) * s; d.z = A.z * c + (X.z * gx + Z.z * gz) * s;
        const h = P.elevation(d, fine), hp = Math.max(h, 0), w = SM(0.7, 0.92, dd / half);
        let radial = hp, hm = hp;
        if (w > 0) { globe.facet(d, f); radial = hp * (1 - w) + (f.sag + f.h) * w; hm = hp * (1 - w) + f.h * w; }
        const k = j * n + i;
        hs[k] = hp;
        pos[k * 3] = d.x * (R + radial) - A.x * R; pos[k * 3 + 1] = d.y * (R + radial) - A.y * R; pos[k * 3 + 2] = d.z * (R + radial) - A.z * R;
        dir[k * 3] = d.x; dir[k * 3 + 1] = d.y; dir[k * 3 + 2] = d.z;
        aH[k] = h; aHm[k] = hm; aUV[k * 2] = gx / L + 0.5; aUV[k * 2 + 1] = gz / L + 0.5;
      }
      if (j % 6 === 5) yield;
    }
    // slope vectors (dimensionless) from central differences of the clamped heights in the anchor's metre grid
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
      const sx = (hs[j * n + i1] - hs[j * n + i0]) / (cs[i1] - cs[i0]), sz = (hs[j1 * n + i] - hs[j0 * n + i]) / (cs[j1] - cs[j0]), k = j * n + i;
      aG[k * 3] = X.x * sx + Z.x * sz; aG[k * 3 + 1] = X.y * sx + Z.y * sz; aG[k * 3 + 2] = X.z * sx + Z.z * sz;
    }
    // terrain occlusion (curvature of the heights, two scales) and the sun's cast shadow, per vertex, in the build's relief E: soft, ~100-2000 m
    // (the ground shader multiplies the sky fill and the sun by them: valleys sit in shade, ridges throw it, with no shadow map)
    const Eb = P3.relief(rB), Sp = this.sunPlanet, sx = Sp.dot(X), sz = Sp.dot(Z), sy = Sp.dot(A), hl = Math.hypot(sx, sz) || 1;
    const hdx = sx / hl, hdz = sz / hl, tanP = sy / hl, shadowsOn = sy > 0.03 && tanP < 3;
    const idxOf = (x) => (Math.asinh((x * sh) / half) / aW * 0.5 + 0.5) * (n - 1);
    const hAt = (x, z) => { // bilinear height (m) at anchor-plane metres, NaN outside the grid
      const fi = idxOf(x), fj = idxOf(z);
      if (!(fi >= 0 && fj >= 0 && fi <= n - 1 && fj <= n - 1)) return NaN;
      const i0 = Math.min(n - 2, Math.floor(fi)), j0 = Math.min(n - 2, Math.floor(fj)), ax = fi - i0, ay = fj - j0, o = j0 * n + i0;
      return (hs[o] * (1 - ax) + hs[o + 1] * ax) * (1 - ay) + (hs[o + n] * (1 - ax) + hs[o + n + 1] * ax) * ay;
    };
    let hMax = 0; for (let k = 0; k < n * n; k++) if (hs[k] > hMax) hMax = hs[k];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i, h = hs[k];
        let ao = 1;
        if (h > 0.5 || hMax > 0) {
          let c = 0;
          for (const s of [1, 3]) {
            const ia = Math.max(0, i - s), ib = Math.min(n - 1, i + s), ja = Math.max(0, j - s), jb = Math.min(n - 1, j + s);
            const cx = ((hs[j * n + ia] + hs[j * n + ib]) / 2 - h) / ((cs[ib] - cs[ia]) / 2 || 1), cz = ((hs[ja * n + i] + hs[jb * n + i]) / 2 - h) / ((cs[jb] - cs[ja]) / 2 || 1);
            c += (cx + cz) * 0.5 * (s === 1 ? 0.6 : 1.0);
          }
          ao = 1 - Math.min(0.55, Math.max(0, c * Eb * 3.2)) + Math.min(0.12, Math.max(0, -c * Eb * 1.4));
        }
        let sh2 = 1;
        if (shadowsOn && h > 0 && hMax > 0) {
          const gx0 = cs[i], gz0 = cs[j], v0 = h * Eb - (gx0 * gx0 + gz0 * gz0) / (2 * R), sp = Math.max(60, (cs[Math.min(n - 1, i + 1)] - cs[Math.max(0, i - 1)]) * 0.5);
          let occ = 0;
          for (let q = 0, t = sp * 1.2; q < 20 && t < 40000 && occ < 0.98; q++, t *= 1.32) {
            const px = gx0 + hdx * t, pz = gz0 + hdz * t, hh = hAt(px, pz);
            if (hh !== hh) break;
            const ray = v0 + t * tanP, terr = hh * Eb - (px * px + pz * pz) / (2 * R), w = 0.04 * t + 6, d = (terr - ray) / w;
            if (d > -1) occ = Math.max(occ, Math.min(1, Math.max(0, d * 0.5 + 0.5)));
            if (ray > hMax * Eb + 50) break;
          }
          sh2 = 1 - occ;
        }
        aS[k * 2] = ao; aS[k * 2 + 1] = sh2;
      }
      if (j % 8 === 7) yield;
    }
    // skirt: the border vertices again, lowered
    for (let s = 0; s < 4; s++) for (let k = 0; k < n; k++) {
      const b = lay.border(s, k), o = lay.grid + s * n + k;
      pos[o * 3] = pos[b * 3] - dir[b * 3] * skirt; pos[o * 3 + 1] = pos[b * 3 + 1] - dir[b * 3 + 1] * skirt; pos[o * 3 + 2] = pos[b * 3 + 2] - dir[b * 3 + 2] * skirt;
      dir.copyWithin(o * 3, b * 3, b * 3 + 3); aH[o] = aH[b]; aHm[o] = aHm[b]; aG.copyWithin(o * 3, b * 3, b * 3 + 3); aS.copyWithin(o * 2, b * 2, b * 2 + 2); aUV.copyWithin(o * 2, b * 2, b * 2 + 2);
    }
    yield;
    // the trail, re-rasterised from the ring buffer into a scratch map (only stamps that fall inside)
    const info = { A, X, Z, half, rB }, tr = new Uint8Array(TRAIL * TRAIL), have = Math.min(this.nStamps, STAMPS), start = this.nStamps;
    const raster = (from, to) => {
      for (let q = from; q < to; q++) {
        const i = ((q % STAMPS) + STAMPS) % STAMPS * 4, st = this.stamps;
        if (st[i] * A.x + st[i + 1] * A.y + st[i + 2] * A.z < Math.cos((half * 1.3) / R)) continue;
        this.stampInto(tr, info, st[i], st[i + 1], st[i + 2], st[i + 3]);
      }
    };
    for (let q = start - have; q < start; q += 96) { raster(q, Math.min(start, q + 96)); yield; }
    raster(start, this.nStamps); // (stamps made while the build ran)
    // commit
    const g = globe.patch.geometry.attributes;
    g.position.array.set(pos); g.aDir.array.set(dir); g.aH.array.set(aH); g.aHm.array.set(aHm); g.aG.array.set(aG); g.aS.array.set(aS); g.aUV.array.set(aUV);
    globe.trailData.set(tr); globe.trailTex.needsUpdate = true;
    globe.commitPatch(A, half);
    globe.u.uWoundP.value = 0.6 * rB;
    globe.u.uRoadW.value = 3 * ((half * 2) / TRAIL); // (3 texels: the road distance field's reach, see food.paintUrban)
    this.patchInfo = info;
    this.onPatch?.(info); // (food.js repaints its footprint maps into the new patch space)
    this.builds++;
    this.lastBuild = { ms: performance.now() - t0, rB, spacing, fine };
  }

  // ------------------------------------------------------------------ §2.7: what Phase 3 needs from the shared scene
  enter({ scene, camera, look, post, renderer, sun }) {
    this.saved = { envI: scene.environmentIntensity, fog: scene.fogNode, bg: scene.background, sky: look.sky.visible, exposure: renderer.toneMappingExposure, ao: post.opts.ao, shafts: post.opts.shafts, near: camera.near, far: camera.far };
    scene.environmentIntensity = 0.14; // (the town's daylight IBL washes the food's dark albedo out to mint; the sun carries the planet)
    scene.fogNode = null; // (aerialFog uses max(y, 0) and would fog the globe at y = -R solid; haze lives in planetMaterial)
    scene.background = new THREE.Color(0x000000);
    look.sky.visible = false; look.envSky.visible = false; // (the dome + stars in globe.sky replace them)
    renderer.toneMappingExposure = 1.0;
    post.opts.ao = false; post.opts.shafts = false; post.build(); // (no AO on a planet; one rebuild, under the loading line)
    post.setPreset({ lut: { shadow: [0.99, 1.0, 1.03], high: [1.03, 1.0, 0.97], sat: 1.06, con: 1.05 }, shafts: 0 });
    scene.add(this.globe.group, this.globe.sky);
    this.scene = scene; this.ctx = { camera, look, post, renderer, sun };
    sun.shadow.autoUpdate = false; // (never toggle castShadow at runtime: it breaks ShadowNode)
    sun.intensity = 4.2;
  }

  leave() {
    const c = this.ctx, s = this.saved;
    if (!c) return;
    this.scene.remove(this.globe.group, this.globe.sky);
    this.scene.environmentIntensity = s.envI; this.scene.fogNode = s.fog; this.scene.background = s.bg; c.look.sky.visible = s.sky; c.renderer.toneMappingExposure = s.exposure;
    c.post.opts.ao = s.ao; c.post.opts.shafts = s.shafts; c.post.build();
    c.camera.near = s.near; c.camera.far = s.far; c.camera.updateProjectionMatrix();
    this.globe.dispose();
  }
}
