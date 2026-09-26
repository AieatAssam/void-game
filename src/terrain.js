// Countryside terrain around the town: a heightfield that starts flat at the city limits and rolls out into
// hills, ridges and distant mountains, with carved lakes, a meandering river, a patchwork of farm fields
// behind hedgerows, forests and rocky outcrops. Materials height-blend scanned layers (grass, forest floor,
// dirt, rock, shore) by slope, altitude and painted splat masks. Scenery (trees, rocks, hedges, barns,
// windmills, cows) is placed on the surface by the city from `scatter()`.
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, vec4, float, int, attribute, positionWorld, normalWorldGeometry, normalViewGeometry, mix, smoothstep, max, pow,
  normalize, clamp, texture, sin, abs, length, uv, positionView, time, select, viewportDepthTexture, cameraNear, cameraFar,
  perspectiveDepthToViewZ, screenUV, If, Discard, uniformArray,
} from 'three/tsl';
import { pbrCol, pbrNrm, pbrRha, L, triplanar, waterGrad, macro } from './pbr.js';
import { positionGeometry, normalGeometry } from 'three/tsl';
import { surfaceOn, viewScale } from './surface.js';
import { Q } from './quality.js';
import { MAX_HOLES } from './hole.js';

// ---------- seeded value noise ----------
function makeNoise(seed) {
  const perm = new Uint8Array(512);
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => { const g = h & 7; const u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v); };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y) => { // Perlin, ~[-1, 1]
    const X = Math.floor(x), Y = Math.floor(y), xf = x - X, yf = y - Y, xi = X & 255, yi = Y & 255;
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1], ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
    const l1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const l2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    return (l1 + v * (l2 - l1)) * 0.5;
  };
  const fbm = (x, y, oct = 5) => { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += noise(x * f, y * f) * amp; f *= 2.03; amp *= 0.5; } return s; };
  const ridged = (x, y, oct = 4) => { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(noise(x * f, y * f) * 1.6); s += n * n * amp; f *= 2.1; amp *= 0.5; } return s; };
  return { noise, fbm, ridged, rnd };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Terrain {
  /**
   * region (Phase 2, docs/PHASE2.md): { bound, pads: [{ x, z, r }], roads: [[[x, z], ...], ...] } - a wider play area
   * with gentle hills (mountains only past the bound), flattened settlement pads and road corridors.
   */
  constructor(seed, half, { beach = false, farm = false, region = null, holes = null, noMesh = false, defer = false } = {}) {
    this.half = half;
    this.region = region;
    this.holes = holes;
    this.beach = beach;
    this.farm = farm; // County Fair: a denser patchwork of fields hugging the town
    this.nz = makeNoise(seed ^ 0x7e55a1);
    this.water = beach ? -0.02 : -0.9;
    const r = this.nz.rnd;
    // river: meanders past one side of town (not on the coast side)
    this.river = beach ? null : { side: Math.floor(r() * 4), off: half + 70 + r() * 50, amp: 30 + r() * 30, freq: 1 / (110 + r() * 80), ph: r() * 6.28 };
    this.rng = r;
    if (!defer) this.fields = this.layoutFields(r); // (defer: buildGen lays the fields out in slices first)
    if (region) this.prepRegion();
    this.group = new THREE.Group();
    if (!noMesh && !defer) this.build(); // (noMesh: a height probe for planning; defer: the caller runs buildGen in slices)
  }

  /** Signed distance outside the town square (negative inside). */
  outside(x, z) { return Math.max(Math.abs(x), Math.abs(z)) - this.half; }

  /** Region: pad heights (the land they sit on, above water) and road segments for the corridor test. */
  prepRegion() {
    const g = this.region;
    for (const p of g.pads) p.h = Math.max(this.water + 1.2, this.rawHeight(p.x, p.z));
    this.segs = [];
    for (const road of g.roads) for (let i = 1; i < road.length; i++) this.segs.push([...road[i - 1], ...road[i]]);
    // coarse bucket grid so the corridor test only visits nearby segments
    this.segGrid = new Map();
    const C = 120;
    for (const sg of this.segs) {
      const [x0, z0, x1, z1] = sg;
      for (let gx = Math.floor((Math.min(x0, x1) - 40) / C); gx <= Math.floor((Math.max(x0, x1) + 40) / C); gx++) {
        for (let gz = Math.floor((Math.min(z0, z1) - 40) / C); gz <= Math.floor((Math.max(z0, z1) + 40) / C); gz++) {
          const k = gx * 4096 + gz;
          if (!this.segGrid.has(k)) this.segGrid.set(k, []);
          this.segGrid.get(k).push(sg);
        }
      }
    }
    this.segC = C;
  }

  /** Region: distance to the nearest road centre line (Infinity when none is near). */
  roadDist(x, z) {
    if (!this.segGrid) return Infinity;
    const list = this.segGrid.get(Math.floor(x / this.segC) * 4096 + Math.floor(z / this.segC));
    if (!list) return Infinity;
    let best = Infinity;
    for (const [x0, z0, x1, z1] of list) {
      const dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - x0 - dx * t, z - z0 - dz * t));
    }
    return best;
  }

  riverDist(x, z) {
    const rv = this.river;
    if (!rv) return Infinity;
    // rotate world so the river runs along +x at z = off
    const [u, v] = [[x, z], [z, -x], [-x, -z], [-z, x]][rv.side];
    const c = rv.off + Math.sin(u * rv.freq + rv.ph) * rv.amp + Math.sin(u * rv.freq * 2.7 + 1.3) * rv.amp * 0.25;
    return Math.abs(v - c);
  }

  /** Farm patchwork: rotated rectangles in a band around town. */
  layoutFields(r) {
    const it = this.fieldsGen(r);
    let step;
    while (!(step = it.next()).done);
    return step.value;
  }

  *fieldsGen(r) {
    const out = [], self = this;
    const pass = function* (tries, want, spread, avoidPads) {
      for (let k = 0; k < tries && out.length < want; k++) {
        if (k % 60 === 59) yield;
        const a = r() * Math.PI * 2, d = self.half + 55 + r() * spread;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (self.beach && z > self.half - 20) continue;
        const f = { x, z, w: 30 + r() * 45, h: 25 + r() * 40, rot: Math.round(a / (Math.PI / 2)) * Math.PI / 2 + (r() - 0.5) * 0.35, crop: Math.floor(r() * 4) };
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (o.w + f.w) * 0.55)) continue;
        if (self.riverDist(x, z) < Math.max(f.w, f.h) * 0.6 + 12) continue;
        if (avoidPads && self.region.pads.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + Math.max(f.w, f.h) * 0.6 + 10)) continue;
        if (avoidPads && Math.max(Math.abs(x), Math.abs(z)) - Math.max(f.w, f.h) * 0.6 < self.half + 440) continue; // (the town's land stays as it was)
        if ([[0, 0], [f.w / 2, f.h / 2], [-f.w / 2, f.h / 2], [f.w / 2, -f.h / 2], [-f.w / 2, -f.h / 2]]
          .some(([u, v]) => self.nz.fbm((x + u) / 210 - 9.4, (z + v) / 210 + 2.2, 3) > 0.06)) continue; // no fields in lakes
        out.push(f);
      }
    };
    // the town's own fields first, with the same draws, so the region grows the very land the town sat in
    yield* pass(...(this.farm ? [140, 44, 200] : [60, 26, 260]), false);
    this.baseFields = out.length;
    if (this.region) yield* pass(1500, 280 + out.length, this.region.bound - this.half - 120, true);
    return out;
  }

  /** Which field (if any) covers (x, z), with the local coordinates inside it. */
  fieldAt(x, z) {
    if (!this.fields) return null; // (a deferred terrain before its fields are laid out; a planning probe)
    // 64 m bucket grid over the fields (rebuilt if the list changes): heights, splats and scatter all ask this
    if (this.fieldGridN !== this.fields.length) {
      this.fieldGridN = this.fields.length;
      this.fieldGrid = new Map();
      for (const f of this.fields) {
        const R = Math.hypot(f.w, f.h) / 2 + 1;
        for (let i = Math.floor((f.x - R) / 64); i <= Math.floor((f.x + R) / 64); i++) for (let j = Math.floor((f.z - R) / 64); j <= Math.floor((f.z + R) / 64); j++) {
          const k = i * 4096 + j;
          if (!this.fieldGrid.has(k)) this.fieldGrid.set(k, []);
          this.fieldGrid.get(k).push(f);
        }
      }
    }
    const list = this.fieldGrid.get(Math.floor(x / 64) * 4096 + Math.floor(z / 64));
    if (!list) return null;
    for (const f of list) {
      const c = Math.cos(f.rot), s = Math.sin(f.rot), dx = x - f.x, dz = z - f.z;
      const u = dx * c + dz * s, v = -dx * s + dz * c;
      if (Math.abs(u) < f.w / 2 && Math.abs(v) < f.h / 2) return { f, u, v, edge: Math.min(f.w / 2 - Math.abs(u), f.h / 2 - Math.abs(v)) };
    }
    return null;
  }

  /** Forest density 0..1 (clumps of woodland away from town, fields and water). */
  forest(x, z) {
    const d = this.outside(x, z);
    if (d < 45) return 0;
    const n = this.nz.fbm(x / 170 + 11.3, z / 170 - 4.1, 4);
    return smooth(-0.04, 0.1, n) * smooth(40, 80, d);
  }

  heightAt(x, z) {
    const h = this.rawHeight(x, z);
    const g = this.region;
    if (!g) return h;
    // settlement pads: level ground with a soft shoulder
    let out = h;
    for (const p of g.pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + 70) out = p.h + (out - p.h) * smooth(p.r, p.r + 70, d);
    }
    // roads: a levelled corridor; over water it becomes a causeway
    const rd = this.roadDist(x, z);
    if (rd < 30) {
      const bed = Math.max(out, this.water + 0.9);
      const k = 1 - smooth(9, 30, rd);
      out = out + (bed - out) * k;
    }
    return out;
  }

  rawHeight(x, z) {
    const { nz } = this;
    const d = this.outside(x, z);
    const w = smooth(3, 45, d); // flat apron at the city limits
    // hills swell into mountains toward the horizon; in the region the play area stays rolling and the
    // mountains rise only past its bound (the map edge)
    // (the region keeps the town's hills near it - the breakout swap must not move a lake - and eases into its own
    // gentler play area, with the mountains past the bound)
    const townGrow = 0.85 + smooth(60, 900, d) * 2.4;
    const grow = this.region
      ? townGrow + (0.8 + smooth(this.region.bound - 150, this.region.bound + 500, Math.max(Math.abs(x), Math.abs(z))) * 2.6 - townGrow) * smooth(260, 560, d)
      : townGrow;
    let h = nz.fbm(x / 240, z / 240, 5) * 30 * grow
      + nz.ridged(x / 170 + 3.7, z / 170 - 1.2, 4) * 14 * (grow - 0.55)
      + nz.fbm(x / 55 + 7.1, z / 55, 3) * 1.1
      + nz.noise(x / 9, z / 9) * 0.18;
    h = Math.max(h, -3) + 1.5;
    // lakes: low basins filled by the water plane
    const lake = nz.fbm(x / 210 - 9.4, z / 210 + 2.2, 3);
    h -= smooth(0.12, 0.3, lake) * (h + 3.8);
    // river channel with soft banks
    const rd = this.riverDist(x, z);
    if (rd < 30) h = h * smooth(4, 26, rd) + (-2.2 + rd * 0.12) * (1 - smooth(4, 26, rd));
    // fields are levelled
    const fa = this.fieldAt(x, z);
    if (fa) h = h * 0.35 + Math.max(0.3, h * 0.2) * 0.65 * smooth(0, 6, fa.edge) + h * 0.65 * (1 - smooth(0, 6, fa.edge));
    // coast: the land slides under the sea beyond the beach
    if (this.beach) h = h * (1 - smooth(this.half - 30, this.half + 5, z)) - smooth(this.half, this.half + 90, z) * 9;
    return h * w - 0.08;
  }

  /** Height from the built mesh grid (bilinear): cheap enough for every mover every frame, and matches what's drawn. */
  sampleH(x, z) {
    const cs = this.cs, n = cs.length;
    const idx = (v) => { // last index with cs[i] <= v
      let lo = 0, hi = n - 2;
      if (v <= cs[0]) return 0;
      if (v >= cs[n - 1]) return n - 2;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cs[m] <= v) lo = m; else hi = m - 1; }
      return lo;
    };
    const i = idx(x), j = idx(z);
    const u = Math.min(1, Math.max(0, (x - cs[i]) / (cs[i + 1] - cs[i]))), v = Math.min(1, Math.max(0, (z - cs[j]) / (cs[j + 1] - cs[j])));
    const H = this.H, a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.8;
    return out.set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e)).normalize();
  }

  // ---------- mesh ----------
  axisCoords() {
    const g = this.region;
    // region: a uniform grid over the whole play area (coarser: the camera is hundreds of metres up), then the falloff
    const st = g ? Q.terrainStep * 3 : Q.terrainStep, inner = g ? g.bound : this.half + 130, R = g ? g.bound + 1600 : 1700, cs = [];
    for (let c = -inner; c <= inner + 1e-6; c += st) cs.push(c);
    let step = st, c = inner;
    const outer = [];
    while (c < R) { step = Math.min(g ? 90 : 70, step * 1.09); c += step; outer.push(c); }
    return [...outer.map((v) => -v).reverse(), ...cs, ...outer];
  }

  build() { for (const _ of this.buildGen()); } // eslint-disable-line no-unused-vars

  /** The mesh build as a generator: it yields every few rows so Phase 2 can build the region between frames. */
  *buildGen() {
    if (!this.fields) this.fields = yield* this.fieldsGen(this.rng); // (deferred construction)
    const cs = this.axisCoords(), n = cs.length;
    const pos = new Float32Array(n * n * 3), nrm = new Float32Array(n * n * 3), splat = new Float32Array(n * n * 4), extra = new Float32Array(n * n * 2);
    // pass 1: heights (vertices buried under the town skip the noise entirely)
    const H = new Float32Array(n * n), under = this.half - 4;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = cs[i], z = cs[j];
        H[j * n + i] = Math.abs(x) < under && Math.abs(z) < under ? -0.08 : this.heightAt(x, z);
      }
      if (j % 2 === 1) yield;
    }
    this.cs = cs;
    this.H = H;
    // pass 2: normals and moisture straight from the grid (no extra noise evaluations)
    const at = (i, j) => H[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
    const cx = (i) => cs[Math.min(n - 1, Math.max(0, i))];
    const v = new THREE.Vector3();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = cs[i], z = cs[j], k = j * n + i, y = H[k];
        pos.set([x, y, z], k * 3);
        const dxs = cx(i + 1) - cx(i - 1) || 1, dzs = cx(j + 1) - cx(j - 1) || 1;
        v.set(-(at(i + 1, j) - at(i - 1, j)) / dxs, 1, -(at(i, j + 1) - at(i, j - 1)) / dzs).normalize();
        nrm.set([v.x, v.y, v.z], k * 3);
        if (Math.abs(x) < under && Math.abs(z) < under) continue; // under the town: nothing to paint
        const fa = this.fieldAt(x, z);
        // splat: x forest floor, y field (crop id + 1) / 4, z dirt tracks/erosion, w wet shore
        let dirt = Math.max(0, this.nz.fbm(x / 60 - 3, z / 60 + 5, 3) - 0.28) * 3 + (fa && fa.edge < 2.5 ? 0.6 : 0);
        // Phase 2: trodden earth - farmyards, the castle bailey, village lanes (region.js marks them)
        if (this.region?.dirt) for (const d of this.region.dirt) {
          const dd = Math.hypot(x - d.x, z - d.z);
          dirt += d.ring ? Math.max(0, 1 - Math.abs(dd - d.r) / d.w) * 1.2 : Math.max(0, 1 - dd / d.r) * 1.6;
        }
        // topographic moisture: hollows collect water (lush, dark), crests dry out; wildflower drifts in meadows
        const o = Math.max(1, Math.round(9 / Math.max(1, cx(i + 1) - x)));
        const avg = (at(i + o, j) + at(i - o, j) + at(i, j + o) + at(i, j - o)) / 4;
        extra.set([Math.max(-1, Math.min(1, (avg - y) * 0.6)), Math.max(0, this.nz.fbm(x / 25 + 40, z / 25 - 17, 3) - 0.12) * 4], k * 2);
        splat.set([this.forest(x, z), fa ? (fa.f.crop + 1) / 4 : 0, Math.min(1, dirt), 1 - smooth(0.1, 0.75, y - this.water)], k * 4);
      }
      if (j % 3 === 2) yield;
    }
    const idx = [];
    const h = this.half - 0.5;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const x0 = cs[i], x1 = cs[i + 1], z0 = cs[j], z1 = cs[j + 1];
        if (Math.max(Math.abs(x0), Math.abs(x1)) < h && Math.max(Math.abs(z0), Math.abs(z1)) < h) continue; // under the town
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      if (j % 16 === 15) yield;
    }
    yield;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
    g.setAttribute('aExtra', new THREE.BufferAttribute(extra, 2));
    g.setIndex(new THREE.BufferAttribute(n * n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
    g.computeBoundingSphere();
    yield;
    const mat = terrainMaterial(this.water);
    // region: the hole goes everywhere, so the land needs the cut too (switched per sector like the town's ground)
    yield;
    this.cutMat = this.holes ? terrainMaterial(this.water, this.holes) : null;
    this.solidMat = mat;
    // the whole countryside as one mesh: only the grass mask pass (a single top-down render at load) draws it
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.userData.grassMask = terrainMaskMaterial(this.water);
    // what the game draws: the same vertices cut into sectors, each with its own index and bounds, so the camera and
    // the shadow map (which only ever see a small part of the land) frustum-cull the rest. Detail is untouched.
    this.sectors = [];
    const S = this.region ? 192 : 96, buckets = new Map();
    yield;
    for (let t = 0; t < idx.length; t += 6) {
      if (t % 120000 === 119994) yield;
      const a0 = idx[t], d0 = idx[t + 5];
      const mx = (pos[a0 * 3] + pos[d0 * 3]) / 2, mz = (pos[a0 * 3 + 2] + pos[d0 * 3 + 2]) / 2;
      const k = `${Math.floor(mx / S)},${Math.floor(mz / S)}`;
      let bk = buckets.get(k);
      if (!bk) buckets.set(k, (bk = { idx: [], min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) }));
      for (let q = 0; q < 6; q++) {
        const vi = idx[t + q];
        bk.idx.push(vi);
        bk.min.min(v.set(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]));
        bk.max.max(v);
      }
    }
    for (const bk of buckets.values()) {
      const sg = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'aSplat', 'aExtra']) sg.setAttribute(name, g.getAttribute(name)); // shared buffers
      sg.setIndex(new THREE.BufferAttribute(n * n > 65535 ? new Uint32Array(bk.idx) : new Uint16Array(bk.idx), 1));
      sg.boundingBox = new THREE.Box3(bk.min.clone(), bk.max.clone());
      sg.boundingSphere = sg.boundingBox.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(sg, mat);
      m.receiveShadow = m.castShadow = true;
      this.sectors.push(m);
      this.group.add(m);
    }
    // water: one plane at the global level; the terrain decides where it shows
    const wg = new THREE.PlaneGeometry(3600, 3600, 1, 1).rotateX(-Math.PI / 2);
    if (this.region) wg.scale(3, 1, 3);
    this.waterMesh = new THREE.Mesh(wg, waterMaterial({ clipHalf: this.half, holes: this.holes && uniformArray(this.holes.value, 'vec3') }));
    this.waterMesh.position.y = this.water;
    this.waterMesh.renderOrder = 2;
    this.group.add(this.waterMesh);
  }

  /** Scenery placements for the city to instance: [{ name, x, y, z, rot, s }]. */
  scatter(assets) {
    const it = this.scatterGen(assets);
    let step;
    while (!(step = it.next()).done);
    return step.value;
  }

  /** scatter() as a generator (yields every few hundred placements); returns the list. */
  *scatterGen(assets) {
    const out = [], r = this.nz.rnd;
    // placed footprints in an 8 m hash grid: the overlap test only looks at neighbouring cells (was a scan of all)
    const C = 8, grid = new Map(), key = (i, j) => i * 65536 + j;
    let maxR = 0;
    const free = (x, z, rad) => {
      const reach = Math.ceil((rad + maxR) / C), ci = Math.floor(x / C), cj = Math.floor(z / C);
      for (let i = ci - reach; i <= ci + reach; i++) for (let j = cj - reach; j <= cj + reach; j++) {
        const list = grid.get(key(i, j));
        if (list) for (const t of list) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + rad) ** 2) return false;
      }
      return true;
    };
    const taken = { push(t) { const k = key(Math.floor(t.x / C), Math.floor(t.z / C)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); maxR = Math.max(maxR, t.r); } };
    const put = (name, x, z, s = 1, rot = r() * 6.28, sink = 0.15) => {
      const rad = (assets[name]?.meta.tier || 1) * 0.6 * s;
      if (!free(x, z, rad) || (g && !clear(x, z))) return false;
      const y = this.heightAt(x, z);
      if (y < this.water + 0.15 && !name.startsWith('rock')) return false;
      taken.push({ x, z, r: rad });
      out.push({ name, x, y: y - sink * s, z, rot, s });
      return true;
    };
    const g = this.region;
    const R = g ? g.bound : this.half + 420;
    const onPad = (x, z) => g && g.pads.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + 6) ** 2);
    const clear = (x, z) => !onPad(x, z) && !(g && this.roadDist(x, z) < 11);
    // The town's land is scattered exactly as in the town (same draws, same rules), then a region scatters the rest of
    // the map: the breakout swap must not move a tree near the town.
    const TR = this.half + 420;
    const fieldsPass = function* (fields, hedge) {
      // barns, windmills and cows on the farms; hedgerows around every field
      for (const f of fields) {
        yield;
        const c = Math.cos(f.rot), s = Math.sin(f.rot);
        const at = (u, v) => [f.x + u * c - v * s, f.z + u * s + v * c];
        if (r() < 0.45) { const [x, z] = at(f.w / 2 + 12, 0); put('barn', x, z, 1, -f.rot + Math.PI / 2, 0.3); }
        else if (r() < 0.35) { const [x, z] = at(-f.w / 2 - 14, f.h / 2); put('windmill', x, z, 1, r() * 6.28, 0.3); }
        for (const [u0, v0, u1, v1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
          const len = Math.hypot((u1 - u0) * f.w / 2, (v1 - v0) * f.h / 2), steps = Math.floor(len / 1.6);
          const gap = r() * steps;
          for (let k = 0; k < steps; k++) {
            if (Math.abs(k - gap) < 3) continue; // a gate
            const t = k / steps;
            const [x, z] = at((u0 + (u1 - u0) * t) * (f.w / 2 + 1), (v0 + (v1 - v0) * t) * (f.h / 2 + 1));
            if (r() < hedge) put('bush', x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6, 0.9 + r() * 0.9);
            if (r() < 0.06) put(r() < 0.5 ? 'tree_big' : 'tree_small', x, z, 0.9 + r() * 0.4);
          }
        }
        if (f.crop === 0) for (let k = 0; k < 4; k++) { const [x, z] = at((r() - 0.5) * f.w * 0.8, (r() - 0.5) * f.h * 0.8); put('cow', x, z, 1, r() * 6.28, 0); }
      }
    };
    const self = this;
    // forests, meadow trees, bushes and rocks. town: the town's rules; otherwise the region's (outside the town's square)
    const woodsPass = function* (R, tries, town) {
      for (let k = 0; k < tries; k++) {
        if (k % 120 === 119) yield;
        const x = (r() * 2 - 1) * R, z = (r() * 2 - 1) * R;
        const d = self.outside(x, z);
        if (d < 8 || (!town && (Math.max(Math.abs(x), Math.abs(z)) < TR || !clear(x, z)))) continue;
        if (self.fieldAt(x, z)) continue;
        const fo = self.forest(x, z);
        const slope = 1 - self.normalAt(x, z).y;
        const far = town ? smooth(250, 420, d) : 0;
        const near = !town || d < 220; // (the region's meadows are dressed everywhere, not only round the town)
        // Phase 2: boulder fields on noise patches - a few of them big enough to be a meal on their own
        const rocky = town ? -1 : self.nz.fbm(x / 130 + 21.7, z / 130 - 8.3, 3);
        if (r() < fo * 1.6 * (1 - far * 0.5)) {
          const pine = self.nz.noise(x / 90, z / 90) > -0.05;
          put(pine ? 'tree_pine' : r() < 0.6 ? 'tree_big' : 'tree_small', x, z, 0.8 + r() * 0.55);
          if (r() < (town ? 0.3 : 0.5)) put('bush', x + (r() - 0.5) * 4, z + (r() - 0.5) * 4, 0.9 + r() * 0.8); // undergrowth
        } else if (slope > 0.22 && r() < 0.35 && (town || self.heightAt(x, z) > self.water + 0.4)) put('rock', x, z, 0.6 + r() * 2.4, r() * 6.28, 0.35);
        else if (rocky > 0.28 && r() < 0.5 && self.heightAt(x, z) > self.water + 0.4) put('rock', x, z, r() < 0.08 ? 5 + r() * 5 : 1 + r() * 3, r() * 6.28, 0.4);
        else if (near && r() < 0.035) put(r() < 0.5 ? 'tree_big' : 'tree_small', x, z, 0.85 + r() * 0.5);
        else if (near && r() < 0.05) put('bush', x, z, 0.8 + r() * 1.2);
        else if (near && r() < 0.012) put('rock', x, z, 0.4 + r() * 1.0, r() * 6.28, 0.3);
      }
    };
    // river banks: reeds of bushes and stones
    const reedsPass = function* (R, n, town) {
      if (!self.river) return;
      for (let k = 0; k < n; k++) {
        const x = (r() * 2 - 1) * R, z = (r() * 2 - 1) * R, rd = self.riverDist(x, z);
        if (!town && Math.max(Math.abs(x), Math.abs(z)) < TR) continue;
        if (rd > 7 && rd < 13 && self.outside(x, z) > 20) put(r() < 0.6 ? 'bush' : 'rock', x, z, 0.5 + r() * 0.8, r() * 6.28, 0.25);
      }
    };
    const base = this.baseFields ?? this.fields.length;
    yield* fieldsPass(this.fields.slice(0, base), 0.9);
    yield* woodsPass(TR, 16000 * Q.trees, true);
    yield* reedsPass(TR, 700, true);
    if (g) {
      yield* fieldsPass(this.fields.slice(base), 0.7);
      yield* woodsPass(R, 16000 * Q.trees * ((2 * R) / (2 * TR)) ** 2 * 0.62, false);
      yield* reedsPass(R, 3000, false);
    }
    return out;
  }

  dispose() {
    for (const m of this.sectors) m.geometry.dispose(); // (shared attributes: three skips ones already freed)
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.waterMesh.geometry.dispose();
    this.waterMesh.material.dispose();
  }
}

// ---------- materials ----------
const planar = (pw, layer, scale) => {
  const q = pw.xz.mul(scale);
  const l = int(layer);
  return {
    c: texture(pbrCol, q).depth(l).rgb,
    n: texture(pbrNrm, q).depth(l).xyz.mul(2).sub(1),
    r: texture(pbrRha, q).depth(l).xyz,
  };
};

function terrainMaterial(waterLevel, holeField = null) {
  const m = new THREE.MeshStandardNodeMaterial();
  const holes = holeField ? uniformArray(holeField.value, 'vec3') : null;
  const pw = positionWorld;
  const sp = attribute('aSplat', 'vec4');
  const nW = normalWorldGeometry;
  const slope = clamp(float(1).sub(nW.y).mul(3.2), 0, 1);
  const dist = length(positionView);
  const fade = smoothstep(viewScale.mul(260), viewScale.mul(40), dist).mul(surfaceOn);
  const lite = Q.surface === 'lite';
  const G = planar(pw, L.grass, 0.28), Gf = lite ? G : planar(pw, L.grass, 0.045); // near + far scale kills tiling
  // mobile: one scan, tinted per layer (the same texture reads serve every layer)
  const tintOf = (P, t) => ({ c: P.c.mul(t), n: P.n, r: P.r });
  const F = lite ? tintOf(G, vec3(0.9, 0.75, 0.6)) : planar(pw, L.forest, 0.22);
  const D = lite ? tintOf(G, vec3(1.25, 0.85, 0.55)) : planar(pw, L.dirt, 0.3);
  const S = lite ? tintOf(G, vec3(1.5, 1.3, 1.0)) : planar(pw, L.shore, 0.25);
  const R = triplanar(pw, nW, int(L.rock), float(0.09));
  const cropId = sp.y.mul(4).sub(1).round();
  const field = sp.y.greaterThan(0.1);
  const h = pw.y.sub(waterLevel);
  // splat weights, then height-blend using each scan's relief so edges look natural (stones poke through grass)
  const wRock = smoothstep(0.35, 0.75, slope.add(macro(pw, 0.02).sub(0.5).mul(0.4))).add(smoothstep(40, 90, h).mul(0.6));
  const wShore = sp.w.mul(float(1).sub(wRock));
  const wForest = sp.x.mul(float(1).sub(wRock));
  const wDirt = sp.z.mul(0.8).add(field.and(cropId.equal(1)).select(1, 0)).mul(float(1).sub(wRock)); // ploughed field
  const wGrass = max(float(1).sub(wRock).sub(wShore).sub(wForest).sub(wDirt), 0.02);
  const hb = (wgt, ht) => pow(wgt.mul(ht.add(0.6)), 4);
  const bG = hb(wGrass, G.r.y), bF = hb(wForest, F.r.y), bD = hb(wDirt, D.r.y), bS = hb(wShore, S.r.y), bR = hb(wRock, R.height.add(0.2));
  const sum = bG.add(bF).add(bD).add(bS).add(bR).add(1e-5);
  const blend = (a, b, c, d, e) => a.mul(bG).add(b.mul(bF)).add(c.mul(bD)).add(d.mul(bS)).add(e.mul(bR)).div(sum);

  m.colorNode = Fn(() => {
    if (holes) {
      for (let i = 0; i < MAX_HOLES; i++) {
        const hh = holes.element(i);
        If(hh.z.greaterThan(0).and(length(positionWorld.xz.sub(hh.xy)).lessThan(hh.z)), () => { Discard(); });
      }
    }
    // grass: scanned lawn pushed toward a lush meadow green, far sample mixed in with distance
    // meadow: the scan's luminance detail on a living green that drifts between lush and sun-dried patches
    const gscan = mix(G.c, Gf.c, smoothstep(viewScale.mul(30), viewScale.mul(140), dist).mul(0.6));
    const gl = gscan.dot(vec3(0.3, 0.59, 0.11)).div(0.14);
    const dry = smoothstep(0.5, 0.85, macro(pw, 0.011)), hue = macro(pw, 0.05);
    const meadow = mix(mix(vec3(0.05, 0.12, 0.022), vec3(0.075, 0.14, 0.03), hue), vec3(0.15, 0.15, 0.055), dry.mul(0.7));
    const ex = attribute('aExtra', 'vec2');
    const wet = ex.x; // + hollow, - crest
    const meadow2 = mix(meadow, vec3(0.035, 0.1, 0.02), smoothstep(0.0, 0.8, wet).mul(0.7)).mul(mix(1, 1.25, smoothstep(0, -0.8, wet)));
    let gcol = mix(meadow2.mul(gl), gscan.mul(0.8), 0.2).toVar();
    // wildflower drifts: specks of white, yellow and violet in the meadow texture
    const fl = smoothstep(0.2, 1.0, ex.y).mul(smoothstep(0.62, 0.8, G.r.y));
    const flc = select(macro(pw, 1.7).greaterThan(0.55), vec3(0.8, 0.72, 0.2), select(macro(pw, 2.3).greaterThan(0.5), vec3(0.75, 0.75, 0.8), vec3(0.45, 0.3, 0.6)));
    gcol.assign(mix(gcol, flc, fl.mul(0.8)));
    let col = blend(gcol, F.c.mul(vec3(0.45, 0.5, 0.36)), D.c, S.c, R.col).toVar();
    // crops: wheat stripes (gold), young green rows, fallow; rows follow the field
    const rows = sin(pw.x.add(pw.z.mul(0.37)).mul(5.5)).mul(0.5).add(0.5);
    const wheat = mix(vec3(0.38, 0.28, 0.1), vec3(0.62, 0.48, 0.2), rows.mul(0.6).add(macro(pw, 0.2).mul(0.4)));
    const young = mix(vec3(0.07, 0.12, 0.03), vec3(0.16, 0.26, 0.06), rows);
    const fallow = mix(vec3(0.3, 0.3, 0.12), vec3(0.22, 0.26, 0.1), rows);
    const crop = select(cropId.equal(0), col, select(cropId.equal(1), col.mul(rows.mul(0.35).add(0.75)), select(cropId.equal(2), wheat, select(cropId.equal(3), young, fallow))));
    col.assign(select(field, mix(col, crop, 0.85), col));
    // wet dark band at the waterline, macro brightness breakup
    col.mulAssign(mix(1, 0.55, smoothstep(0.6, 0.0, h)));
    col.mulAssign(mix(0.85, 1.12, macro(pw, 0.03)));
    // snow on the high peaks past the region's edge (drifts, thinner on steep faces)
    const snow = smoothstep(60, 80, pw.y.add(macro(pw, 0.02).mul(16))).mul(float(1).sub(smoothstep(0.5, 0.85, slope)));
    col.assign(mix(col, vec3(0.82, 0.85, 0.9).mul(mix(0.92, 1.05, macro(pw, 0.3))), snow));
    return vec4(col, 1);
  })();
  // vegetation and soil are near-perfectly rough; only wet banks and bare rock get any sheen
  const rough = blend(G.r.x.mul(0.1).add(0.9), F.r.x.mul(0.1).add(0.88), D.r.x.mul(0.2).add(0.8), S.r.x.mul(0.4).add(0.55), R.rough.mul(0.35).add(0.6));
  m.roughnessNode = clamp(mix(rough, 0.3, smoothstep(0.5, 0.0, h)), 0.25, 1);
  m.metalnessNode = float(0);
  const ao = blend(G.r.z, F.r.z, D.r.z, S.r.z, R.ao);
  m.aoNode = mix(float(1), ao, fade);
  // relief: planar layers share the XZ basis; rock brings its own triplanar gradient
  m.normalNode = Fn(() => {
    const dpx = positionView.dFdx(), dpy = positionView.dFdy(), n = normalViewGeometry;
    const r1 = dpy.cross(n), r2 = n.cross(dpx), det = dpx.dot(r1);
    const kk = det.sign().div(max(det.abs(), 1e-12));
    const dx = pw.dFdx(), dy = pw.dFdy();
    const gX = r1.mul(dx.x).add(r2.mul(dy.x)).mul(kk), gZ = r1.mul(dx.z).add(r2.mul(dy.z)).mul(kk);
    const sl = (t) => t.xy.div(max(t.z, 0.25)).negate();
    const flat = sl(G.n).mul(bG).add(sl(F.n).mul(bF)).add(sl(D.n).mul(bD)).add(sl(S.n).mul(bS)).div(sum);
    const grad = gX.mul(flat.x).add(gZ.mul(flat.y)).add(R.grad.mul(bR.div(sum)));
    return normalize(n.sub(grad.mul(fade)));
  })();
  return m;
}

function terrainMaskMaterial(waterLevel) {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  const sp = attribute('aSplat', 'vec4');
  const slope = clamp(float(1).sub(normalWorldGeometry.y).mul(3.2), 0, 1);
  const grassy = float(1).sub(smoothstep(0.25, 0.5, slope)).mul(float(1).sub(sp.x.mul(0.7))).mul(float(1).sub(sp.z))
    .mul(float(1).sub(sp.w)).mul(sp.y.greaterThan(0.1).select(0, 1)).mul(smoothstep(0.3, 0.8, positionWorld.y.sub(waterLevel)));
  const ex = attribute('aExtra', 'vec2');
  const dry = clamp(smoothstep(0.5, 0.85, macro(positionWorld, 0.011)).mul(0.6).add(smoothstep(0, -0.8, ex.x).mul(0.5)).sub(smoothstep(0, 0.8, ex.x).mul(0.4)), 0, 1);
  m.colorNode = vec4(grassy.mul(0.85), positionWorld.y, 1, dry);
  return m;
}

/** Lakes, river and sea: wave normals, sky reflections, depth-tinted and soft where it meets the shore. */
/**
 * Lakes, river, sea and the beach tide: wave normals, sky reflections, depth tint, soft where it meets the shore.
 * clipHalf: hide under the town square; holes: uniformArray of open holes to cut; fade: opacity uniform (tide).
 */
export function waterMaterial({ clipHalf = null, holes = null, fade = null, front = false } = {}) {
  const m = new THREE.MeshPhysicalNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.05, metalness: 0 });
  const pw = positionWorld;
  let keep = clipHalf === null ? null : max(abs(pw.x), abs(pw.z)).greaterThan(clipHalf - 0.3); // the town is dry land
  if (holes) {
    for (let i = 0; i < MAX_HOLES; i++) {
      const h = holes.element(i);
      const out = h.z.lessThanEqual(0).or(length(pw.xz.sub(h.xy)).greaterThan(h.z));
      keep = keep ? keep.and(out) : out;
    }
  }
  if (keep) m.maskNode = keep;
  // how much water is between the surface and the ground behind it
  const lite = Q.surface === 'lite';
  const depthM = lite ? float(3) // mobile: skip the depth copy
    : positionView.z.sub(perspectiveDepthToViewZ(viewportDepthTexture(screenUV).r, cameraNear, cameraFar)).max(0);
  const shallow = smoothstep(0.0, 2.5, depthM);
  const deep = vec3(0.02, 0.06, 0.07), mid = vec3(0.06, 0.2, 0.19);
  const f = fade ?? float(1);
  // foam: where it laps the shore; on mobile (no depth) a drifting broken pattern instead
  const lap = sin(time.mul(1.6).add(pw.x.mul(0.9)).add(pw.z.mul(0.7))).mul(0.3).add(0.7);
  // fine drifting foam filaments (thin, sparse) rather than blobs
  const fil = abs(macro(pw.add(vec3(time.mul(0.35), 0, time.mul(0.2))), 2.6).sub(0.5));
  const streaks = smoothstep(0.035, 0.0, fil).mul(0.35);
  let foam = lite ? streaks : smoothstep(0.3, 0.0, depthM).mul(lap).add(streaks.mul(smoothstep(1.2, 0.2, depthM)));
  let alpha = lite ? float(0.72) : mix(0.2, 0.94, smoothstep(0.0, 0.9, depthM));
  let body = mix(mid, deep, shallow);
  if (front) {
    // the tide: a clear turquoise sheet whose inland edge (plane uv.y -> 1) laps in and out behind a foam line
    const wob = macro(pw, 0.35).sub(0.5).mul(0.12).add(sin(time.mul(1.3).add(pw.x.mul(0.45))).mul(0.03));
    const e = uv().y.add(wob);
    const edge = smoothstep(0.93, 0.86, e);
    const broken = smoothstep(0.3, 0.62, macro(pw.add(vec3(0, 0, time.mul(0.3))), 1.9)).mul(0.6).add(0.4);
    foam = foam.mul(0.6).add(smoothstep(0.845, 0.875, e).mul(smoothstep(0.915, 0.885, e)).mul(broken));
    alpha = mix(0.6, 0.88, smoothstep(0.85, 0.2, e)).mul(edge);
    body = mix(vec3(0.03, 0.26, 0.27), vec3(0.015, 0.1, 0.12), smoothstep(0.75, 0.0, e));
  }
  m.colorNode = vec4(mix(body, vec3(0.8, 0.83, 0.8), foam.min(1).mul(0.7)), alpha.add(foam.mul(0.35)).min(1).mul(f));
  m.normalNode = normalize(normalViewGeometry.sub(waterGrad(pw).mul(1.1)));
  m.emissiveNode = vec3(0.1, 0.11, 0.1).mul(foam).mul(f);
  m.specularIntensityNode = f;
  return m;
}

// ---------- rocks: displaced, flattened icosahedra with scanned rock, moss on their upper faces ----------
function rockGeometry(seed, detail) {
  const nz = makeNoise(seed);
  const g = new THREE.IcosahedronGeometry(1, [3, 2, 1][detail]);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + nz.fbm(x * 1.3 + 5, y * 1.3 + z * 0.7, 4) * 0.55 + nz.ridged(x * 2.5, z * 2.5 + y, 2) * 0.12;
    p.setXYZ(i, x * k * 1.15, Math.max(-0.35, y * k * 0.62) + 0.25, z * k * 0.95);
  }
  g.computeVertexNormals();
  return g;
}

function rockMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const tri = triplanar(positionGeometry.mul(1.0), normalGeometry, int(L.rock), float(0.45));
  const up = smoothstep(0.45, 0.85, normalWorldGeometry.y);
  const moss = macro(positionWorld, 0.6);
  m.colorNode = vec4(mix(tri.col.mul(0.9), vec3(0.09, 0.14, 0.05).mul(moss.add(0.6)), up.mul(smoothstep(0.35, 0.65, moss))), 1);
  m.roughnessNode = clamp(tri.rough.mul(0.5).add(0.5), 0.5, 1);
  m.aoNode = tri.ao;
  m.normalNode = normalize(normalViewGeometry.sub(tri.grad.mul(1.4)));
  return m;
}

/** Scenery-only procedural assets the terrain scatters (rocks). */
export function installTerrainAssets(assets) {
  const mat = rockMaterial();
  const variants = [0, 1, 2].map((v) => [0, 1, 2].map((d) => rockGeometry(911 + v * 37, d)));
  const scene = new THREE.Group().add(new THREE.Mesh(variants[0][0], mat));
  assets.rock = { name: 'rock', clips: [], meta: { tier: 1.1, mass: 20, kind: 'scenery', height: 1.2, tris: 1280 }, material: mat,
    flags: new THREE.Vector4(), flatVariants: variants, scene, lod: scene, lod2: scene };
}
