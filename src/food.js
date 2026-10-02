// Phase 3 food (docs/PHASE3.md §4.2-4.3, §5.3): the planet's settlements, ships, silos and woods, generated on the fly from the cube-face
// quadtree. Level L cells are QUARTER / 2^L wide and hold 0-3 items of radius log-uniform in [s/48, s/16], keyed hash(seed, face, L, i, j, k):
// the same cell always makes the same items, so `eaten` (a Set of item hashes) is all the persistence there is.
//   recs      every live item inside the active window (a few hundred): { dir, tier = radius (m), x/z local azimuthal-equidistant, ... }
//   pieces    items within ~10 r (the local patch) get instances: skyline boxes (one InstancedMesh), tree clumps (one), GLB units (one each)
//   goals     the tier goals (T1 towns + the coastal city, T2 the home nation's cities, T3 three capitals): `settlements` + `nextGoal()`
//   ladder    after each scan, fillers guarantee >= 3 meals (0.3-0.95 r) within 25 r and a "bigger" (1-1.6 r) within 15 r
// Everything is in planet space under planet.group; instance matrices ride the planet's curve (up = the item's direction).
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, int, uniform, attribute, positionGeometry, positionLocal, normalGeometry, mix, select, step, floor, fract,
  smoothstep, clamp, hash, dot, abs, max, uniformArray, fwidth, uv,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, faceDir } from './planetgen.js';
import { TRAIL } from './planetglobe.js';
import { flatGeometry } from './city.js';

const QUARTER = (Math.PI / 2) * R;
const Q4 = Math.PI / 4;
const SM = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const SLOTS = 8; // items per cell (the doc's 0-3, denser: the pacing needs a bite every ~3-8 s, see PHASE3.md §4.5 notes)
export const VIS = 10; // items closer than VIS * r get instances (the patch is 14 r wide; the hole drifts up to 4 r off its anchor)

// ---------------------------------------------------------------- deterministic hashing
const H5 = (a, b, c, d, e) => {
  let h = (0x9e3779b9 ^ a) | 0;
  h = Math.imul(h ^ b, 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ c, 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h ^ d, 0x27d4eb2f); h ^= h >>> 15;
  h = Math.imul(h ^ e, 0x165667b1);
  return (h ^ (h >>> 16)) >>> 0;
};
const rng = (h) => () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const SYL_A = ['Ard', 'Bel', 'Cor', 'Dun', 'Eld', 'Fen', 'Gal', 'Har', 'Ist', 'Jor', 'Kes', 'Lor', 'Mar', 'Nev', 'Ost', 'Pel', 'Quen', 'Ros', 'Sal', 'Tor', 'Ul', 'Ver', 'Wyn', 'Yar', 'Zel', 'Bran', 'Cas', 'Dov'];
const SYL_B = ['ent', 'ora', 'ham', 'wick', 'port', 'mere', 'ton', 'ford', 'bury', 'ley', 'stad', 'dale', 'grad', 'ville', 'haven', 'by', 'ria', 'on', 'ash', 'more'];
const nameOf = (rnd) => SYL_A[Math.floor(rnd() * SYL_A.length)] + SYL_B[Math.floor(rnd() * SYL_B.length)];

// ---------------------------------------------------------------- instance pools
class Pool { // contiguous chunks of an InstancedMesh
  constructor(chunk, n) { this.chunk = chunk; this.n = n; this.used = new Uint8Array(n); this.hi = 0; }
  alloc(count) {
    const k = Math.ceil(count / this.chunk);
    for (let i = 0, run = 0; i < this.n; i++) {
      if (this.used[i]) run = 0;
      else if (++run === k) { const s = i - k + 1; this.used.fill(1, s, i + 1); this.hi = Math.max(this.hi, i + 1); return s * this.chunk; }
    }
    return -1;
  }
  free(start, count) {
    const k = Math.ceil(count / this.chunk);
    this.used.fill(0, start / this.chunk, start / this.chunk + k);
    while (this.hi > 0 && !this.used[this.hi - 1]) this.hi--;
  }
  get count() { return this.hi * this.chunk; }
}

// ---------------------------------------------------------------- the skyline kit
/** A box in two stacked segments (podium + shaft; 20 tris): per-instance shape (aShape.x podium fraction, .y shaft width) makes tower / slab / setback. */
function boxGeometry() {
  const parts = [];
  for (let s = 0; s < 2; s++) {
    const b = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), keep = [];
    const idx = b.index.array;
    for (let i = 0; i < idx.length; i += 6) if (i !== 18) keep.push(idx[i], idx[i + 1], idx[i + 2], idx[i + 3], idx[i + 4], idx[i + 5]); // (no underside)
    b.setIndex(keep);
    b.setAttribute('aSeg', new THREE.BufferAttribute(new Float32Array(b.attributes.position.count).fill(s), 1));
    b.deleteAttribute('uv');
    parts.push(b);
  }
  const g = mergeGeometries(parts);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  return g;
}
/** A squat conifer / broadleaf crown: ring, wider ring, apex (18 tris, flat shaded; drawn double-sided). */
function treeGeometry() {
  const n = 6, pos = [], idx = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pos.push(Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34); }
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pos.push(Math.cos(a) * 0.5, 0.34, Math.sin(a) * 0.5); }
  pos.push(0, 1, 0);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    idx.push(k, k1, n + k, k1, n + k1, n + k, n + k, n + k1, 2 * n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const f = g.toNonIndexed(); f.computeVertexNormals();
  f.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  return f;
}

const lin = (c) => new THREE.Vector3(c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2);
const WALLS = [ // 4 palettes x 5 colours (sRGB): modern glass, old stone, whitewash, brick and industry (the first three: the tall ones)
  [[.42, .68, .88], [.2, .32, .5], [.26, .7, .68], [.92, .86, .74], [.96, .96, .94]],
  [[.9, .74, .5], [.94, .84, .58], [.78, .42, .3], [.86, .82, .74], [.96, .94, .9]],
  [[.97, .96, .92], [.97, .93, .84], [.93, .8, .55], [.88, .78, .62], [.84, .84, .82]],
  [[.7, .45, .35], [.84, .8, .72], [.64, .4, .32], [.34, .43, .54], [.88, .8, .6]],
].flat().map(lin);
const WALL_T = uniformArray(WALLS, 'vec3');

/** positionNode runs after instancing in three; the box morph has to run before (as surface.js's ToyNodeMaterial does). */
class PreMaterial extends THREE.MeshStandardNodeMaterial {
  setupPosition(builder) { if (this.preInstanceNode) positionLocal.assign(this.preInstanceNode); return super.setupPosition(builder); }
}
const TONE = uniform(0.52); // (albedo scale: the sun at 4.2 over a pale wall clips to white; ?tone=0.4 to tune)
function skylineMaterial(sunU) {
  const sh = attribute('aShape', 'vec4'), up = attribute('aUp', 'vec3'), seg = attribute('aSeg', 'float'); // (instanced attributes ride the geometry: they upload when marked)
  const m = new PreMaterial({ roughness: 0.78, metalness: 0 });
  // the box morph (podium + shaft), in the box's own space: run before instancing, and again for the fragment stage (positionLocal is the instanced position there)
  const morph = Fn(() => {
    const p = positionGeometry;
    const y = mix(p.y.mul(sh.x), sh.x.add(p.y.mul(float(1).sub(sh.x))), seg);
    const k = mix(float(1), sh.y, seg);
    return vec3(p.x.mul(k), y, p.z.mul(k));
  })();
  m.preInstanceNode = morph;
  // shared by colour and emission: the window grid (4 columns a wall, `floors` rows) and which windows are lit
  const zz = sh.z.mul(0.5), pal = floor(zz), s = sh.z.sub(pal.mul(2));
  const p = morph, n = normalGeometry;
  const top = step(0.5, n.y), side = float(1).sub(top);
  const u = select(abs(n.x).greaterThan(0.5), p.z, p.x).div(mix(float(1), sh.y, seg)).add(0.5);
  const fu = fract(u.mul(4)), fv = fract(p.y.mul(sh.w));
  const wAA = float(1).sub(smoothstep(0.35, 0.9, fwidth(u.mul(4)).max(fwidth(p.y.mul(sh.w))))); // (windows dissolve to a mean tint before they alias: no shimmer at T1-T2)
  const win = step(0.2, fu).mul(step(fu, 0.8)).mul(step(0.3, fv)).mul(step(fv, 0.76)).mul(side).mul(step(0.4, p.y.mul(sh.w))).mul(wAA);
  const cell = hash(floor(u.mul(4)).add(floor(p.y.mul(sh.w)).mul(17.13)).add(s.mul(91.7)).add(select(abs(n.x).greaterThan(0.5), float(0), float(41))));
  const lit = step(cell, 0.62);
  m.colorNode = Fn(() => {
    const hu = hash(s.mul(131.7).add(3.1)), tall = smoothstep(2.5, 9.0, sh.w), pick = floor(mix(hu.mul(4.999), hu.mul(2.999), tall)); // (the first three of each palette are the tall ones' colours)
    const wall = WALL_T.element(int(pal.mul(5).add(pick)));
    const tint = float(0.9).add(hash(s.mul(57.3)).mul(0.2));
    const low = step(sh.w, 2.5);
    const rh = hash(s.mul(7.7)), orange = low.mul(step(0.5, pal)).mul(step(0.3, rh)); // terracotta only on old / whitewashed / brick low-rise
    const slate = mix(vec3(0.3, 0.3, 0.32), vec3(0.66, 0.62, 0.56), hash(s.mul(3.3)));
    const roofK = hash(s.mul(5.9)), cell = floor(vec2(p.x.mul(7), p.z.mul(7)).add(s.mul(31))), speck = step(0.82, hash(cell.x.add(cell.y.mul(57.1)).add(s))); // (rooftop plant: dark boxes on the flat roofs)
    let roofA = mix(slate, vec3(0.12, 0.12, 0.13), step(0.6, roofK)); // tar
    roofA = mix(roofA, vec3(0.13, 0.25, 0.1), step(0.955, rh)); // green roof
    const roof = mix(roofA, vec3(0.4, 0.26, 0.19), orange).mul(float(1).sub(speck.mul(0.35))).mul(float(0.8).add(smoothstep(0.38, 0.5, abs(p.x).max(abs(p.z))).mul(-0.35).add(0.35))); // (a darker parapet rim)
    const base = mix(wall.mul(tint), roof, top);
    const ao = float(0.34).add(float(0.66).mul(smoothstep(0.0, 2.6, p.y.mul(sh.w))));
    const glass = mix(vec3(1), vec3(0.42, 0.5, 0.58), win.mul(0.7));
    return vec4(base.mul(ao).mul(glass).mul(TONE), 1);
  })();
  m.emissiveNode = Fn(() => {
    const night = smoothstep(0.1, -0.14, dot(up, sunU));
    return vec3(1.0, 0.66, 0.28).mul(win).mul(lit).mul(night).mul(3.4);
  })();
  return m;
}

function treeMaterial() {
  const sh = attribute('aShape', 'vec4');
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  const zz = sh.z.mul(0.5), pal = floor(zz), s = sh.z.sub(pal.mul(2));
  m.colorNode = Fn(() => {
    const k = hash(s.mul(311.3));
    const greens = mix(vec3(0.03, 0.085, 0.04), vec3(0.08, 0.2, 0.05), k); // conifer .. broadleaf
    const dry = mix(vec3(0.13, 0.15, 0.05), vec3(0.2, 0.15, 0.05), k); // savanna / autumn
    const jungle = mix(vec3(0.02, 0.1, 0.04), vec3(0.05, 0.17, 0.05), k);
    const c = mix(mix(greens, dry, step(0.5, pal)), jungle, step(1.5, pal));
    return vec4(c.mul(float(0.6).add(positionGeometry.y.mul(0.8))), 1);
  })();
  return m;
}

// ---------------------------------------------------------------- ground units (GLB)
const UNITS = { // key -> model, per-unit radius = model's tier (m)
  cargo: 'cargo_ship', carrier: 'aircraft_carrier', destroyer: 'destroyer', rig: 'oil_rig', silo: 'missile_silo', pad: 'launch_pad',
};
const MODEL_CAP = 200;
const WAKE = { cargo: 0, carrier: 1, destroyer: 2 }, WAKE_BOW = 0.9; // (ships with a wake; how far past the model's centre the foam starts, in radii; flip the sign of the keel in writeUnits if a model's bow is -X)

// ---------------------------------------------------------------- Food
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
let _id = 1;

export class Food {
  /** W: PlanetWorld; assets: the loaded asset table (planet pack); opts.quality. */
  constructor(W, assets, { quality = 'high', seed = W.seed } = {}) {
    this.W = W; this.P = W.P; this.seed = seed | 0; this.low = quality === 'low';
    this.group = new THREE.Group();
    W.globe.group.add(this.group);
    this.cells = new Map(); // key -> { f, L, i, j, c: Vector3, recs: [] }
    this.recs = new Set();
    this.fixed = []; // goal items (always present)
    this.eaten = new Set();
    this.events = []; // { type: 'eat' | 'tooBig', e }
    this.live = []; // recs sorted for the game (rebuilt each frame)
    this.t = 0; this.scanT = 0; this.lastScan = new THREE.Vector3(); this.lastScanR = 0; this.needScan = true;
    this.dens = 1; this.rich = 6; this.curR = W.r;
    this.vx = 0; this.vz = 0; // heading (local), for fillers
    this.stats = { scan: 0, gen: 0, cells: 0, boxes: 0, shows: 0, fillers: 0, ladderMs: 0, writes: 0 };
    this.E = 1;
    this.goalsByTier = {};
    this.settlements = []; this.tier = 1;
    // skyline kit
    const CB = this.low ? 12000 : 26000, chunk = 25;
    this.cityPool = new Pool(chunk, CB / chunk);
    this.shapeA = new THREE.InstancedBufferAttribute(new Float32Array(CB * 4), 4); this.upA = new THREE.InstancedBufferAttribute(new Float32Array(CB * 3), 3);
    this.shapeA.setUsage(THREE.DynamicDrawUsage); this.upA.setUsage(THREE.DynamicDrawUsage);
    const cg = boxGeometry(); cg.setAttribute('aShape', this.shapeA); cg.setAttribute('aUp', this.upA);
    this.city = new THREE.InstancedMesh(cg, skylineMaterial(W.globe.u.uSun), CB);
    this.city.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // woods
    const CT = this.low ? 6000 : 16000;
    this.treePool = new Pool(25, CT / 25);
    this.tshapeA = new THREE.InstancedBufferAttribute(new Float32Array(CT * 4), 4); this.tshapeA.setUsage(THREE.DynamicDrawUsage);
    const tg = treeGeometry(); tg.setAttribute('aShape', this.tshapeA);
    this.trees = new THREE.InstancedMesh(tg, treeMaterial(), CT);
    this.trees.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // contact shadow + AO blobs: one flat soft quad per box, stretched away from the sun, sharing the box slots (alpha-blended, no depth write)
    const dgeo = new THREE.PlaneGeometry(1, 1); dgeo.rotateX(-Math.PI / 2); dgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    const dmat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const dq = uv().sub(0.5).mul(2), dr = dq.length();
    dmat.colorNode = vec4(0.02, 0.015, 0.03, float(1).sub(smoothstep(0.15, 1.0, dr)).pow(1.6).mul(0.36));
    this.decals = new THREE.InstancedMesh(dgeo, dmat, CB);
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.decals.renderOrder = 1;
    for (const mm of [this.city, this.trees, this.decals]) { mm.frustumCulled = false; mm.count = 0; mm.castShadow = mm.receiveShadow = false; mm.matrixAutoUpdate = false; this.group.add(mm); }
    // GLB units
    this.units = {};
    const pal = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'palette.png');
    pal.magFilter = pal.minFilter = THREE.NearestFilter; pal.generateMipmaps = false; pal.flipY = false; pal.colorSpace = THREE.SRGBColorSpace;
    this.unitMat = new THREE.MeshStandardNodeMaterial({ map: pal, roughness: 0.55, metalness: 0.12 });
    for (const [k, name] of Object.entries(UNITS)) {
      const a = assets[name];
      if (!a) continue;
      const geo = flatGeometry(a, this.low ? 1 : 0);
      geo.computeBoundingBox();
      let umat = this.unitMat;
      if (k === 'carrier') { umat = this.unitMat.clone(); umat.color = new THREE.Color(2.4, 2.4, 2.4); } // (its navy palette read as a hole in the sea: lifted)
      const mesh = new THREE.InstancedMesh(geo, umat, MODEL_CAP);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.count = 0; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.units[k] = { mesh, name, rad: a.meta.tier, lift: -geo.boundingBox.min.y, free: Array.from({ length: MODEL_CAP }, (_, i) => MODEL_CAP - 1 - i), hi: 0 };
    }
    // wakes: a flat foam V trailing every ship (slot = unit key block + instance index, so a unit's slot never moves)
    const wg = new THREE.PlaneGeometry(1, 1); wg.rotateX(-Math.PI / 2); wg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    const wm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const wq = uv(), wd = float(1).sub(wq.x), wy = wq.y.sub(0.5).abs().mul(2); // d: 0 at the bow .. 1 at the tail end; y: 0 on the keel line .. 1 at the edge
    const wa = wd.mul(0.62).add(0.07), arm = float(1).sub(smoothstep(0.0, 0.07, wy.sub(wa).abs())).mul(float(1).sub(wd).pow(1.3));
    const core = float(1).sub(smoothstep(0.0, wd.mul(0.12).add(0.07), wy)).mul(float(1).sub(wd).pow(0.8)), brk = hash(floor(wq.x.mul(46)).add(floor(wq.y.mul(14)).mul(7.3))).mul(0.5).add(0.5);
    wm.colorNode = vec4(0.86, 0.95, 0.98, arm.mul(0.7).add(core.mul(0.55)).mul(brk).mul(smoothstep(0.0, 0.04, wd)).clamp(0, 0.85));
    this.wakes = new THREE.InstancedMesh(wg, wm, MODEL_CAP * 3); this.wakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wakes.frustumCulled = false; this.wakes.matrixAutoUpdate = false; this.wakes.renderOrder = 1; this.wakes.castShadow = this.wakes.receiveShadow = false; this.wakes.count = MODEL_CAP * 3;
    this.group.add(this.wakes);
    this.assets = assets; this.toneU = TONE;
    this.urbanDirty = true; this.urbanAt = 0;
    W.onPatch = (info) => this.paintUrban(info);
  }

  // ------------------------------------------------------------------ geometry helpers
  /** Planet-space direction -> local azimuthal-equidistant (x, z) about the hole, written into out (x, z). */
  toLocal(d, out) {
    _v.set(d.x, d.y, d.z).applyQuaternion(_qi);
    const c = Math.min(1, Math.max(-1, _v.y)), a = Math.acos(c), s = Math.sqrt(Math.max(0, 1 - c * c)), k = s > 1e-9 ? (R * a) / s : R;
    out.x = _v.x * k; out.z = _v.z * k;
    return a * R;
  }
  frameOf(rec) { // tangent basis of an item
    if (rec.e1) return;
    const u = rec.dir, ref = Math.abs(u.y) < 0.95 ? _w.set(0, 1, 0) : _w.set(1, 0, 0);
    rec.e1 = new THREE.Vector3().crossVectors(ref, u).normalize();
    rec.e2 = new THREE.Vector3().crossVectors(u, rec.e1);
  }
  fineNow() { return this.W.lastBuild?.fine ?? 8; }
  heightAt(d, fine) { return Math.max(0, this.P.elevation(d, fine)); }

  // ------------------------------------------------------------------ records
  makeRec(h, kind, dir, rho, extra = {}) {
    const rnd = rng(h ^ 0x5bd1e995);
    const rec = {
      id: h, kind, dir: new THREE.Vector3(dir.x, dir.y, dir.z).normalize(), tier: rho, x: 0, z: 0, d: 1e12, alive: true, falling: false, fallT: 0, fallDur: 2, fallRank: 0,
      vis: false, pieces: null, lay: null, goal: 0, fixed: false, filler: false, cell: null, name: '', label: '', hab: 0, coastal: false, pal: 0, seed: rnd(),
      e1: null, e2: null, meta: null, Eat: 1, rnd, hx: 0, hz: 0, pop: 0, flying: false, noSwallow: false, home: null, ...extra,
    };
    rec.pal = rho > 2500 || rec.goal ? (rnd() < 0.75 ? 0 : 2) : Math.floor(rnd() * 4);
    rec.meta = { tier: rho, kind: 'prop', mass: Math.PI * rho * rho, height: 0, name: rec.kind };
    return rec;
  }
  describe(rec, e, coastal) {
    const rho = rec.tier, rnd = rec.rnd;
    if (rec.kind === 'settle') {
      rec.label = rho < 250 ? 'Village' : rho < 3000 ? 'Town' : rho < 20000 ? 'City' : 'Metro';
      rec.name = (coastal && rho > 700 ? 'Port ' : '') + nameOf(rnd);
      rec.pop = Math.round(Math.PI * (rho / 1000) ** 2 * 2500 * (0.4 + rec.hab));
    } else if (rec.kind === 'forest') { rec.label = 'Woods'; rec.name = 'Woods'; }
    else if (rec.kind === 'ship') { rec.label = 'Convoy'; rec.name = 'Cargo convoy'; }
    else if (rec.kind === 'fleet') { rec.label = 'Fleet'; rec.name = 'Carrier fleet'; }
    else if (rec.kind === 'rig') { rec.label = 'Rig'; rec.name = 'Oil rig'; }
    else if (rec.kind === 'silo') { rec.label = 'Silos'; rec.name = 'Silo field'; }
    rec.meta.name = rec.name;
    return rec;
  }

  /** Decide what an item is from its place: null = nothing here. */
  decide(h, dir, rho, rnd, rem) {
    const P = this.P, e = P.elevation(dir, 3);
    const u = rnd(), u2 = rnd(), u3 = rnd();
    if (e < -6) { // the sea: ships, fleets, rigs
      if (u > 0.5 * this.dens) return null;
      if (e > -260 && rho < 1400 && u2 < 0.2) return this.describe(this.makeRec(h, 'rig', dir, rho), e, false);
      if (rho > 450 && u3 < 0.4) return this.describe(this.makeRec(h, 'fleet', dir, rho), e, false);
      return this.describe(this.makeRec(h, 'ship', dir, rho), e, false);
    }
    if (e < 8 || rem < 0.5) return null; // beach, or eaten ground
    const { T, M } = P.climate(dir, e), hab = P.habitability(dir, e, T, M), bio = P.biome(dir, e, T, M);
    if ((bio === 3 || bio === 4 || bio === 8) && u2 < 0.34 * this.dens && rho < 60000) return this.describe(this.makeRec(h, 'forest', dir, rho, { hab, biome: bio }), e, false); // (woods compete with towns on wet ground)
    if (e < 1500 && hab > 0.1 && u < (0.1 + 0.85 * hab ** 0.8) * this.dens) {
      const r = this.makeRec(h, 'settle', dir, rho, { hab, coastal: e < 70 });
      return this.describe(r, e, e < 70);
    }
    if ((bio === 3 || bio === 4 || bio === 8) && u < 0.5 * this.dens && rho < 60000) return this.describe(this.makeRec(h, 'forest', dir, rho, { hab, biome: bio }), e, false);
    if ((bio === 5 || bio === 6 || bio === 7) && e > 40 && rho > 60 && rho < 2500 && u < 0.32 * this.dens && hab < 0.3) return this.describe(this.makeRec(h, 'silo', dir, rho), e, false);
    return null;
  }

  nearFixed(dir, rho) {
    for (const f of this.fixed) if (Math.acos(Math.min(1, f.dir.x * dir.x + f.dir.y * dir.y + f.dir.z * dir.z)) * R < (f.tier + rho) * 1.25) return true;
    return false;
  }

  genCell(f, L, i, j, c) {
    const n = 1 << L, s = QUARTER / n, cell = { f, L, i, j, c, recs: [] };
    for (let k = 0; k < SLOTS; k++) {
      const h = H5(this.seed, f * 64 + L, i, j, k), rnd = rng(h);
      if (this.eaten.has(h)) continue;
      const sx = ((i + 0.1 + 0.8 * rnd()) / n) * 2 - 1, sy = ((j + 0.1 + 0.8 * rnd()) / n) * 2 - 1;
      const d = faceDir(f, sx, sy), rho = (s / 48) * 3 ** (rnd() ** 0.6);
      if (this.nearFixed(d, rho)) continue;
      const rec = this.decide(h, d, rho, rnd, this.W.bite.remAt(d));
      if (!rec) continue;
      rec.cell = cell; cell.recs.push(rec); this.recs.add(rec);
    }
    this.stats.gen++;
    return cell;
  }

  // ------------------------------------------------------------------ scanning the quadtree around the hole
  levels(r) {
    const lo = Math.ceil(Math.log2(QUARTER / (48 * r))), hi = Math.floor(Math.log2(QUARTER / (3.2 * r)));
    return [Math.max(2, lo), Math.min(14, hi)];
  }
  window(L, r) { return Math.min(40 * r, 10 * r + (2 * QUARTER) / (1 << L)); }

  /** Face boxes (warped s/t) of the disc of angular radius th about c, per face (or null). */
  faceBoxes(c, th) {
    const ax = Math.abs(c.y) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    let t1x = ax[1] * c.z - ax[2] * c.y, t1y = ax[2] * c.x - ax[0] * c.z, t1z = ax[0] * c.y - ax[1] * c.x;
    const k = 1 / Math.hypot(t1x, t1y, t1z); t1x *= k; t1y *= k; t1z *= k;
    const t2x = c.y * t1z - c.z * t1y, t2y = c.z * t1x - c.x * t1z, t2z = c.x * t1y - c.y * t1x;
    const cr = Math.cos(th), sr = Math.sin(th), out = [];
    for (let f = 0; f < 6; f++) {
      const [F, Rt, U] = FACES[f];
      let smin = 9, smax = -9, tmin = 9, tmax = -9;
      for (let q = -1; q < 24; q++) {
        let px = c.x, py = c.y, pz = c.z;
        if (q >= 0) { const a = (q / 24) * Math.PI * 2, ca = Math.cos(a) * sr, sa = Math.sin(a) * sr; px = c.x * cr + t1x * ca + t2x * sa; py = c.y * cr + t1y * ca + t2y * sa; pz = c.z * cr + t1z * ca + t2z * sa; }
        const w = px * F[0] + py * F[1] + pz * F[2];
        if (w < 0.08) continue;
        const s = Math.atan((px * Rt[0] + py * Rt[1] + pz * Rt[2]) / w) / Q4, t = Math.atan((px * U[0] + py * U[1] + pz * U[2]) / w) / Q4;
        if (s < smin) smin = s; if (s > smax) smax = s; if (t < tmin) tmin = t; if (t > tmax) tmax = t;
      }
      if (smin > smax || smax < -1.02 || smin > 1.02 || tmax < -1.02 || tmin > 1.02) { out.push(null); continue; }
      out.push([Math.max(-1, smin), Math.min(1, smax), Math.max(-1, tmin), Math.min(1, tmax)]);
    }
    return out;
  }

  /** Make sure every cell near the hole exists (budgeted: nearest first), drop the far ones, then run the ladder. */
  scan(r, budgetMs = 1.2) {
    const t0 = performance.now(), c = this.W.hdir, [L0, L1] = this.levels(r), want = [];
    this.stats.cells = this.cells.size;
    for (let L = L0; L <= L1; L++) {
      const n = 1 << L, s = QUARTER / n, V = this.window(L, r), th = Math.min(1.35, (V + s) / R);
      this.faceBoxes(c, th).forEach((b, f) => {
        if (!b) return;
        const i0 = Math.max(0, Math.floor((b[0] * 0.5 + 0.5) * n)), i1 = Math.min(n - 1, Math.floor((b[1] * 0.5 + 0.5) * n));
        const j0 = Math.max(0, Math.floor((b[2] * 0.5 + 0.5) * n)), j1 = Math.min(n - 1, Math.floor((b[3] * 0.5 + 0.5) * n));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const key = ((f * 16 + L) * n + i) * n + j;
          if (this.cells.has(key)) continue;
          const cd = faceDir(f, ((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1), ang = Math.acos(Math.min(1, cd.x * c.x + cd.y * c.y + cd.z * c.z)) * R;
          if (ang < V + 0.7 * s) want.push({ key, f, L, i, j, cd, ang });
        }
      });
    }
    want.sort((a, b) => a.ang - b.ang);
    let k = 0;
    for (; k < want.length; k++) {
      if (budgetMs !== Infinity && performance.now() - t0 > budgetMs) break;
      const w = want[k];
      this.cells.set(w.key, this.genCell(w.f, w.L, w.i, w.j, new THREE.Vector3(w.cd.x, w.cd.y, w.cd.z)));
    }
    this.needScan = k < want.length; // (the rest next frame)
    // prune: inactive levels and far cells
    for (const [key, cell] of this.cells) {
      const ang = Math.acos(Math.min(1, cell.c.dot(c))) * R, s = QUARTER / (1 << cell.L);
      if (cell.L < L0 || cell.L > L1 || ang > (this.window(cell.L, r) + s) * 1.35) { for (const e of cell.recs) this.drop(e); this.cells.delete(key); }
    }
    this.stats.scan = performance.now() - t0;
    this.lastScan.copy(c); this.lastScanR = r;
  }
  drop(e) { this.hide(e); this.recs.delete(e); e.alive = false; e.dropped = true; }

  // ------------------------------------------------------------------ the ladder (§4.2): always something smaller and something bigger
  /** Counts what is on offer (meals 0.3-0.95 r within 25 r, bigger 1-1.6 r within 15 r) and fills the gap with filler items. */
  ladder(r, hole, force = false) {
    const t0 = performance.now();
    let meals = 0, bigger = 0, near = 0, rich = 0;
    for (const e of this.recs) {
      if (!e.alive || e.falling) continue;
      const k = e.tier / r;
      if (e.d < 25 * r && k >= 0.3 && k < 0.95) { meals++; if (e.d < 9 * r) near++; }
      if (e.d < 14 * r && k >= 0.4 && k < 0.95) rich++;
      if (e.d < 15 * r && k >= 1 && k <= 1.6) bigger++;
    }
    let made = 0;
    // the doc's floor (3 meals within 25 r, a bigger within 15 r) plus the pacing's: a meal within 9 r (a full belly lasts ~28 r of travel)
    // and `rich` real meals (0.4-0.95 r) within 14 r (§4.5 wants a bite every few seconds; the fractal alone gave 4)
    while ((meals < 3 || bigger < 1 || near < 1 || rich < this.rich) && made < 8) {
      const wantBig = bigger < 1 && (meals >= 3 && near >= 1 || made % 2 === 1);
      const e = this.filler(r, wantBig, near < 1 && !wantBig);
      if (e && !wantBig) rich++;
      if (!e) break;
      made++;
      if (wantBig) bigger++; else { meals++; near++; } // (fillers are placed inside the counting radii: 6-14 r for bigger, 7-20 r for meals)
    }
    this.lastMade = made; this.stats.fillers += made; this.stats.ladderMs = performance.now() - t0;
    return made;
  }

  /** One filler item at the nearest suitable spot ahead (heading = the hole's local velocity, else toward the goal, else anywhere). */
  filler(r, big, close = false) {
    const W = this.W, rnd = Math.random;
    let hx = this.vx, hz = this.vz;
    if (Math.hypot(hx, hz) < 1e-6) { const g = this.nextGoal?.(); if (g) { hx = g.x; hz = g.z; } }
    const base = Math.hypot(hx, hz) > 1e-6 ? Math.atan2(hx, -hz) : rnd() * 6.283;
    const rho = r * (big ? 1.05 + 0.4 * rnd() : 0.42 + 0.48 * rnd());
    for (let k = 0; k < 90; k++) {
      const wide = k < 20 ? 0.9 : 3.14, b = base + (rnd() - 0.5) * 2 * wide, dist = (big ? 6 + 8 * rnd() : close ? 3 + 5.5 * rnd() : 4 + 14 * rnd()) * r * (k > 40 ? 0.55 : 1);
      const lx = Math.sin(b) * dist, lz = -Math.cos(b) * dist, d = W.dirAt(lx, lz, new THREE.Vector3()), e = this.P.elevation(d, 3);
      if (W.bite.remAt(d) < 0.5 && e > 0) continue;
      let overlap = false;
      const kill = []; // (a filler city swallows the small things inside its footprint: they go, so nothing overlaps on screen)
      for (const o of this.recs) if (o.alive && o.d < 1e11 && Math.hypot(o.x - lx, o.z - lz) < (o.tier + rho) * 1.05) { if (o.tier < 0.3 * rho && !o.fixed && !o.falling) kill.push(o); else { overlap = true; break; } }
      if (overlap) continue;
      const h = (0x7f000000 + _id++) >>> 0, r2 = rng(h);
      let rec = null;
      if (e < -6) {
        rec = this.makeRec(h, e > -250 && rho < 1400 && r2() < 0.2 ? 'rig' : rho > 450 && r2() < 0.45 ? 'fleet' : 'ship', d, rho);
        this.describe(rec, e, false);
      } else if (e > 8 && e < 5200) {
        const { T, M } = this.P.climate(d, e), hab = this.P.habitability(d, e, T, M), bio = this.P.biome(d, e, T, M);
        if (hab > 0.08 || e > 1800) rec = this.describe(this.makeRec(h, 'settle', d, rho, { hab: Math.max(0.15, hab), coastal: e < 70 }), e, e < 70);
        else if (bio === 3 || bio === 4 || bio === 8) rec = this.describe(this.makeRec(h, 'forest', d, rho, { hab, biome: bio }), e, false);
        else if (rho > 60 && rho < 2500) rec = this.describe(this.makeRec(h, 'silo', d, rho), e, false);
        else rec = this.describe(this.makeRec(h, 'settle', d, rho, { hab: 0.2 }), e, false);
      }
      if (!rec) continue;
      for (const o of kill) this.drop(o);
      rec.filler = true; rec.x = lx; rec.z = lz; rec.d = Math.hypot(lx, lz);
      this.recs.add(rec);
      return rec;
    }
    return null;
  }

  // ------------------------------------------------------------------ goals (§4.3)
  /** The fixed goal items per tier, from the world (call once, after the planet exists). */
  buildGoals(r0 = 1400) {
    const P = this.P, W = this.W, rnd = rng(H5(this.seed, 99, 1, 2, 3)), city = P.city ?? P.startDir, start = P.startDir;
    const mk = (tier, kind, dir, rho, name, label) => {
      const h = (0x7e000000 + _id++) >>> 0;
      const e = this.makeRec(h, kind, dir, rho, { fixed: true, goal: tier, hab: 0.8, coastal: kind === 'settle' });
      e.name = name; e.label = label ?? (rho < 3000 ? 'Town' : 'City'); e.meta.name = name; e.pop = Math.round(Math.PI * (rho / 1000) ** 2 * 3000);
      this.fixed.push(e); this.recs.add(e);
      (this.goalsByTier[tier] ??= []).push(e);
      return e;
    };
    const land = (d, lo = 6, hi = 900) => { const e = P.elevation(d, 3); return e > lo && e < hi; };
    // T1: four towns between the landing and the coast city, then the city (Port ...)
    const toC = new THREE.Vector3(city.x, city.y, city.z), toS = new THREE.Vector3(start.x, start.y, start.z), mid = new THREE.Vector3();
    const towns = [], rhoT = [0.55, 0.7, 0.9, 1.2].map((k) => k * 1000);
    for (let tries = 0; tries < 3000 && towns.length < 4; tries++) {
      const t = 0.25 + 0.75 * rnd(); mid.copy(toS).lerp(toC, t).normalize();
      const ang = rnd() * 6.283, off = (1500 + 9000 * rnd()), d = P.step({ x: mid.x, y: mid.y, z: mid.z }, ang, off);
      if (!land(d)) continue;
      const { T, M } = P.climate(d, P.elevation(d, 3));
      if (P.habitability(d, P.elevation(d, 3), T, M) < 0.35) continue;
      if (towns.some((q) => q.dir.angleTo(_w.set(d.x, d.y, d.z)) * R < 7000) || toC.angleTo(_w.set(d.x, d.y, d.z)) * R < 8000) continue;
      towns.push({ dir: new THREE.Vector3(d.x, d.y, d.z) });
    }
    towns.sort((a, b) => toS.angleTo(a.dir) - toS.angleTo(b.dir));
    towns.forEach((q, i) => { const e = mk(1, 'settle', q.dir, rhoT[i] * (0.9 + 0.2 * rnd()), nameOf(rnd)); e.label = 'Town'; q.e = e; });
    const port = mk(1, 'settle', city, 4200, 'Port ' + nameOf(rnd), 'City');
    // T2: the home nation's cities (60-450 km around the coast city) and its capital
    const nat = P.nation(city), cities = [], rhoC = [4800, 6500, 8800, 11500];
    for (let tries = 0; tries < 4000 && cities.length < 4; tries++) {
      const d = P.step(city, rnd() * 6.283, 60000 + rnd() * 400000);
      if (!land(d, 8, 700)) continue;
      const e = P.elevation(d, 3), { T, M } = P.climate(d, e);
      if (P.habitability(d, e, T, M) < 0.45) continue;
      const dv = _w.set(d.x, d.y, d.z);
      if (cities.some((q) => q.dir.angleTo(dv) * R < 70000) || toC.angleTo(dv) * R < 40000) continue;
      if (P.nation(d).id !== nat.id && tries < 3000) continue;
      cities.push({ dir: new THREE.Vector3(d.x, d.y, d.z) });
    }
    cities.forEach((q, i) => mk(2, 'settle', q.dir, rhoC[i] * (0.9 + 0.2 * rnd()), nameOf(rnd), 'City'));
    mk(2, 'settle', nat.capital, 17000, nat.name + ' City', 'Capital').label = 'Capital';
    this.goalNames = { 1: `${port.name} region`, 2: `Nation of ${nat.name}`, 3: 'Three capitals' };
    // T3: the three nearest other capitals
    const hc = new THREE.Vector3(nat.capital.x, nat.capital.y, nat.capital.z);
    const others = P.nations.filter((n) => n.id !== nat.id).map((n) => ({ n, a: hc.angleTo(_w.set(n.capital.x, n.capital.y, n.capital.z)) })).sort((a, b) => a.a - b.a).slice(0, 3);
    others.forEach((o, i) => mk(3, 'settle', o.n.capital, [26000, 36000, 50000][i], o.n.name + ' City', 'Capital'));
    this.goalNames[3] = 'Capitals of ' + others.map((o) => o.n.name).join(', ');
  }

  /** Goal clusters of the current tier (the shape Phase 2's arrow wants: list, left, total, name, kind, x/z local, r). */
  refreshGoals(tier) {
    this.tier = tier;
    const list = this.goalsByTier[tier] ?? [];
    this.settlements = list.map((e) => ({ name: e.name, kind: e.label, list: [e], left: e.alive ? 1 : 0, total: 1, x: e.x, z: e.z, r: e.tier, e }));
    this.goalLeft = list.filter((e) => e.alive).length; this.goalTotal = list.length;
  }
  /** The goal to head for: the nearest alive item that fits now, else the nearest alive one (the arrow says "grow to X"). */
  nextGoal(hole) {
    const list = this.goalsByTier[this.tier] ?? [], r = hole ? hole.r : this.lastScanR || 1400;
    let best = null, bs = Infinity;
    for (const e of list) {
      if (!e.alive || e.falling) continue;
      const fits = e.tier < 0.95 * r, s = e.d * (fits ? 1 : 3) + (fits ? 0 : 1e9);
      if (s < bs) { bs = s; best = e; }
    }
    if (!best) return null;
    return { e: best, name: best.name, label: best.label, x: best.x, z: best.z, d: best.d, r: best.tier, fits: best.tier < 0.95 * r, need: best.tier / 0.95 };
  }

  // ------------------------------------------------------------------ layout (the pieces of an item, built once per item)
  /** Skyline kit: boxes on a jittered grid in an organic disc, tall in the middle. stride 11. */
  layCity(e) {
    const rho = e.tier, rnd = rng(e.id ^ 0x1234567), W = this.W;
    const fine = this.fineNow();
    const rNow = this.curR, N = Math.round(lerp(22, 520, SM(100, 2600, rho))), c = Math.max(rho * Math.sqrt(Math.PI / N), 0.03 * rNow), tallK = SM(250, 7000, rho); // (blocks never thinner than ~2 px)
    const yaw0 = rnd() * 3.14159, cy = Math.cos(yaw0), sy = Math.sin(yaw0), wob = rnd() * 6.283, wob2 = rnd() * 6.283;
    this.frameOf(e);
    const out = [], _d = new THREE.Vector3(), g = Math.ceil((rho * 1.25) / c);
    for (let jj = -g; jj <= g && out.length < 520 * 11; jj++) for (let ii = -g; ii <= g && out.length < 520 * 11; ii++) {
      const gx = (ii + 0.5 + (rnd() - 0.5) * 0.35) * c, gz = (jj + 0.5 + (rnd() - 0.5) * 0.35) * c, dd = Math.hypot(gx, gz), an = Math.atan2(gz, gx);
      const lim = rho * (0.86 + 0.16 * Math.sin(an * 3 + wob) + 0.08 * Math.sin(an * 5 + wob2));
      if (dd > lim) continue;
      const cr = rnd(); if (cr < 0.05) continue; // (parks and plazas)
      const ox = gx * cy - gz * sy, oz = gx * sy + gz * cy;
      _d.set(e.dir.x + (e.e1.x * ox + e.e2.x * oz) / R, e.dir.y + (e.e1.y * ox + e.e2.y * oz) / R, e.dir.z + (e.e1.z * ox + e.e2.z * oz) / R).normalize();
      const gh = this.P.elevation(_d, fine);
      if (gh < 3) continue; // water: the coastline cuts the city
      const core = Math.max(0, 1 - dd / lim), q = rnd();
      let f = c * (0.8 + 0.22 * rnd()), fx = f, fz = f;
      const slab = rnd() < 0.3 * (1 - core * 0.6);
      if (slab) { fx = f * (1.25 + 0.6 * rnd()); fz = f * (0.6 + 0.2 * rnd()); }
      let H = f * (0.22 + (0.9 + 1.9 * tallK) * Math.pow(core, 1.25) * Math.pow(q, 0.8) + 0.45 * rnd() * (1 - core));
      if (core > 0.62 && rnd() < 0.3 + 0.4 * tallK) H *= 1.35 + 0.5 * rnd(); // downtown: a few much taller cores
      H = Math.min(Math.max(H, 0.2 * f), (3 + 1.8 * tallK) * f);
      let a = 0, w = 1;
      if (H > 1.5 * f && rnd() < 0.55) { a = 0.16 + 0.26 * rnd(); w = 0.5 + 0.28 * rnd(); }
      else if (H > 0.9 * f && rnd() < 0.25) { a = 0.3 + 0.2 * rnd(); w = 0.7 + 0.15 * rnd(); }
      const floors = Math.max(1, Math.round(H / (f * 0.36)));
      out.push(ox, oz, yaw0 + (rnd() < 0.12 ? (rnd() - 0.5) * 0.6 : 0), fx, H + f * 0.22, fz, gh - f * 0.22, a, w, e.pal * 2 + rnd() * 0.999, floors);
    }
    return { n: out.length / 11, d: new Float32Array(out), kind: 'city', r: rNow };
  }
  layForest(e) {
    const rho = e.tier, rnd = rng(e.id ^ 0x7777), fine = this.fineNow();
    const rNow = this.curR, N = Math.round(lerp(14, 200, SM(80, 1500, rho))), c = Math.max(rho * Math.sqrt(Math.PI / N), 0.026 * rNow), g = Math.ceil((rho * 1.2) / c);
    this.frameOf(e);
    const out = [], _d = new THREE.Vector3(), wob = rnd() * 6.283, pal = e.biome === 8 ? 2 : e.biome === 7 ? 1 : 0;
    for (let jj = -g; jj <= g && out.length < 200 * 11; jj++) for (let ii = -g; ii <= g && out.length < 200 * 11; ii++) {
      const ox = (ii + 0.5 + (rnd() - 0.5) * 0.9) * c, oz = (jj + 0.5 + (rnd() - 0.5) * 0.9) * c, dd = Math.hypot(ox, oz), an = Math.atan2(oz, ox);
      if (dd > rho * (0.88 + 0.2 * Math.sin(an * 4 + wob))) continue;
      _d.set(e.dir.x + (e.e1.x * ox + e.e2.x * oz) / R, e.dir.y + (e.e1.y * ox + e.e2.y * oz) / R, e.dir.z + (e.e1.z * ox + e.e2.z * oz) / R).normalize();
      const gh = this.P.elevation(_d, fine);
      if (gh < 3) continue;
      const f = c * (0.8 + 0.5 * rnd()), conifer = rnd() < (pal === 0 ? 0.7 : 0.25), H = f * (conifer ? 1.3 + 0.8 * rnd() : 0.8 + 0.5 * rnd());
      out.push(ox, oz, rnd() * 6.283, f, H, f, gh - H * 0.06, 0, 1, pal * 2 + rnd() * 0.999, 1);
    }
    return { n: out.length / 11, d: new Float32Array(out), kind: 'trees', r: rNow };
  }
  /** GLB units: [ox, oz, yaw, scale, lift, unitKey] stride 6 in lay.d, units in lay.u. */
  layUnits(e) {
    const rho = e.tier, rnd = rng(e.id ^ 0x2468), us = [];
    const gh = e.kind === 'silo' ? this.heightAt(e.dir, this.fineNow()) : 0;
    const u = (key, ox, oz, rad) => { const m = this.units[key]; if (m) us.push({ key, ox, oz, yaw: rnd() * 6.283, s: rad / m.rad, gh }); };
    if (e.kind === 'ship') {
      const n = rho > 500 ? 2 + Math.floor(rnd() * 3) : 1, rad = n > 1 ? rho / (1 + 0.55 * Math.sqrt(n)) : rho, yaw = rnd() * 6.283;
      for (let k = 0; k < n; k++) { const t = n > 1 ? (k / (n - 1) - 0.5) * 2 : 0; u('cargo', Math.cos(yaw) * t * (rho - rad) + (rnd() - 0.5) * rad * 0.3, Math.sin(yaw) * t * (rho - rad) + (rnd() - 0.5) * rad * 0.3, rad); us[us.length - 1].yaw = yaw + 1.5708; }
    } else if (e.kind === 'fleet') {
      const n = 3 + Math.floor(rnd() * 4), cr = rho * 0.4, dr = cr * 0.5;
      u('carrier', 0, 0, cr);
      for (let k = 1; k < n; k++) { const a = (k / (n - 1)) * 6.283 + rnd(), rr = rho * 0.62; u('destroyer', Math.cos(a) * rr, Math.sin(a) * rr, dr); }
    } else if (e.kind === 'rig') u('rig', 0, 0, rho);
    else if (e.kind === 'silo') {
      const n = 3 + Math.floor(rnd() * 7), rad = rho / (1 + 1.2 * Math.sqrt(n)), g = Math.ceil(Math.sqrt(n));
      for (let k = 0; k < n; k++) { const gx = (k % g) - (g - 1) / 2, gz = Math.floor(k / g) - (g - 1) / 2; u('silo', gx * rad * 2.4, gz * rad * 2.4, rad); }
    }
    return { n: us.length, units: us, kind: 'units' };
  }

  // ------------------------------------------------------------------ pieces on screen
  /** Matrix of a piece into an Float32Array at index i: base point of item e's tangent frame (ox, oz), yaw, scale, sunk by `sink`. */
  put(arr, i, e, ox, oz, yaw, sx, sy, sz, gh, sink) {
    const R1 = R + gh * e.Eat - sink;
    let dx = e.dir.x + (e.e1.x * ox + e.e2.x * oz) / R, dy = e.dir.y + (e.e1.y * ox + e.e2.y * oz) / R, dz = e.dir.z + (e.e1.z * ox + e.e2.z * oz) / R;
    const l = 1 / Math.hypot(dx, dy, dz); dx *= l; dy *= l; dz *= l;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let bx = e.e1.x * c + e.e2.x * s, by = e.e1.y * c + e.e2.y * s, bz = e.e1.z * c + e.e2.z * s;
    const k = bx * dx + by * dy + bz * dz; bx -= dx * k; by -= dy * k; bz -= dz * k;
    const bl = 1 / Math.hypot(bx, by, bz); bx *= bl; by *= bl; bz *= bl;
    const zx = by * dz - bz * dy, zy = bz * dx - bx * dz, zz = bx * dy - by * dx; // Z = X x Y
    const o = i * 16;
    arr[o] = bx * sx; arr[o + 1] = by * sx; arr[o + 2] = bz * sx; arr[o + 3] = 0;
    arr[o + 4] = dx * sy; arr[o + 5] = dy * sy; arr[o + 6] = dz * sy; arr[o + 7] = 0;
    arr[o + 8] = zx * sz; arr[o + 9] = zy * sz; arr[o + 10] = zz * sz; arr[o + 11] = 0;
    arr[o + 12] = dx * R1; arr[o + 13] = dy * R1; arr[o + 14] = dz * R1; arr[o + 15] = 1;
    return dx;
  }
  zero(arr, i, n) { arr.fill(0, i * 16, (i + n) * 16); }

  show(e) {
    if (e.vis || e.dropped || this.noShow) return;
    this.frameOf(e);
    e.Eat = this.E;
    if (e.kind === 'settle' || e.kind === 'forest') {
      e.lay ??= e.kind === 'settle' ? this.layCity(e) : this.layForest(e);
      const lay = e.lay, tr = lay.kind === 'trees', pool = tr ? this.treePool : this.cityPool, mesh = tr ? this.trees : this.city;
      if (!lay.n) { e.vis = true; e.pieces = { none: true }; return; }
      let at = pool.alloc(lay.n);
      if (at < 0) { // out of instances: the farthest drawn item makes room (only if it is farther than this one)
        let far = null;
        for (const o of this.recs) if (o.vis && !o.falling && o.pieces?.pool === pool && (!far || o.d > far.d)) far = o;
        if (far && far.d > e.d) { this.hide(far); at = pool.alloc(lay.n); }
        if (at < 0) return;
      }
      const arr = mesh.instanceMatrix.array, shape = tr ? this.tshapeA.array : this.shapeA.array, d = lay.d, cnt = Math.ceil(lay.n / pool.chunk) * pool.chunk;
      this.zero(arr, at, cnt);
      for (let k = 0; k < lay.n; k++) {
        const o = k * 11;
        this.put(arr, at + k, e, d[o], d[o + 1], d[o + 2], d[o + 3], d[o + 4], d[o + 5], d[o + 6], 0);
        shape[(at + k) * 4] = d[o + 7]; shape[(at + k) * 4 + 1] = d[o + 8]; shape[(at + k) * 4 + 2] = d[o + 9]; shape[(at + k) * 4 + 3] = d[o + 10];
        if (!tr) { this.upA.array[(at + k) * 3] = arr[(at + k) * 16 + 12]; this.upA.array[(at + k) * 3 + 1] = arr[(at + k) * 16 + 13]; this.upA.array[(at + k) * 3 + 2] = arr[(at + k) * 16 + 14]; }
      }
      if (!tr) for (let k = 0; k < lay.n; k++) { const o = (at + k) * 3, l = 1 / Math.hypot(this.upA.array[o], this.upA.array[o + 1], this.upA.array[o + 2]); this.upA.array[o] *= l; this.upA.array[o + 1] *= l; this.upA.array[o + 2] *= l; }
      if (!tr) this.writeDecals(e, at, lay);
      mesh.count = pool.count;
      mesh.instanceMatrix.needsUpdate = true; (tr ? this.tshapeA : this.shapeA).needsUpdate = true; if (!tr) this.upA.needsUpdate = true;
      e.pieces = { mesh, pool, at, n: lay.n, tr };
      this.stats.boxes += lay.n;
    } else {
      e.lay ??= this.layUnits(e);
      const lay = e.lay, got = [];
      for (const u of lay.units) {
        const m = this.units[u.key];
        if (!m.free.length) continue;
        const idx = m.free.pop(); m.hi = Math.max(m.hi, idx + 1); m.mesh.count = m.hi;
        got.push({ m, idx, u });
      }
      e.pieces = { units: got };
      this.writeUnits(e, 0, null);
    }
    e.vis = true; this.urbanDirty = true; this.stats.shows++;
  }
  /** The contact-shadow blob of every box of item e (slots [at, at + n)): a soft ellipse stretched away from the sun by the box's height. */
  writeDecals(e, at, lay) {
    const arr = this.decals.instanceMatrix.array, d = lay.d, S = this.W.sunPlanet, sE = S.x * e.e1.x + S.y * e.e1.y + S.z * e.e1.z, sZ = S.x * e.e2.x + S.y * e.e2.y + S.z * e.e2.z;
    const sU = Math.max(0.18, S.x * e.dir.x + S.y * e.dir.y + S.z * e.dir.z), hl = Math.hypot(sE, sZ) || 1, ax = -sE / hl, az = -sZ / hl, yaw = Math.atan2(az, ax);
    this.zero(arr, at, Math.ceil(lay.n / this.cityPool.chunk) * this.cityPool.chunk);
    for (let k = 0; k < lay.n; k++) {
      const o = k * 11, fx = d[o + 3], fz = d[o + 5], H = d[o + 4], len = Math.min(3.2 * H, (H * hl) / sU), f = Math.max(fx, fz);
      if (f < 0.012 * this.curR) continue; // (under ~2 px a blob is a black speck: the box alone will do)
      const cx = d[o] + ax * len * 0.5, cz = d[o + 1] + az * len * 0.5;
      this.put(arr, at + k, e, cx, cz, yaw, len + f * 1.5, 1, f * 1.45, d[o + 6] + d[o + 4] * 0 + f * 0.22 + 0.4, -f * 0.03 - 0.3); // (the box's gh - 0.22 f + 0.22 f: the ground, a hair above)
    }
    this.decals.instanceMatrix.needsUpdate = true; this.decals.count = this.cityPool.count;
  }
  writeUnits(e, q, hole) {
    for (const p of e.pieces.units) {
      const u = p.u, m = p.m, arr = m.mesh.instanceMatrix.array;
      let ox = u.ox, oz = u.oz, s = u.s, sink = 0;
      if (q > 0) {
        const k = Math.min(1, Math.max(0, q * 1.3 - (Math.abs(ox) + Math.abs(oz)) / (e.tier * 4))), sl = k * k * (3 - 2 * k) * 0.9;
        ox += (hole.hx - ox) * sl; oz += (hole.hz - oz) * sl; sink = k * k * m.rad * s * 3.2; s *= 1 - 0.55 * k * k;
      }
      this.put(arr, p.idx, e, ox, oz, u.yaw + q * 0.8, s, s, s, u.gh, sink - m.lift * s);
      m.mesh.instanceMatrix.needsUpdate = true;
      const wk = WAKE[u.key];
      if (wk !== undefined) { // the wake: stern-ward of the hull along its keel (the model's +X), 5 radii long, gone once the ship is going down
        const slot = wk * MODEL_CAP + p.idx, wr = m.rad * s, ca = Math.cos(u.yaw), sa = Math.sin(u.yaw), L = 4.4 * wr;
        if (q > 0) this.zero(this.wakes.instanceMatrix.array, slot, 1);
        else this.put(this.wakes.instanceMatrix.array, slot, e, ox - ca * (L * 0.5 - wr * WAKE_BOW), oz - sa * (L * 0.5 - wr * WAKE_BOW), u.yaw, L, 1, wr * 2.4, u.gh, -2 - wr * 0.12);
        this.wakes.instanceMatrix.needsUpdate = true;
      }
    }
  }
  hide(e) {
    if (!e.vis) return;
    const p = e.pieces;
    if (p?.mesh) { if (!p.tr) { this.zero(this.decals.instanceMatrix.array, p.at, Math.ceil(p.n / p.pool.chunk) * p.pool.chunk); this.decals.instanceMatrix.needsUpdate = true; } this.zero(p.mesh.instanceMatrix.array, p.at, Math.ceil(p.n / p.pool.chunk) * p.pool.chunk); p.pool.free(p.at, p.n); p.mesh.count = p.pool.count; p.mesh.instanceMatrix.needsUpdate = true; this.stats.boxes -= p.n; }
    else if (p?.units) for (const g of p.units) { if (WAKE[g.u.key] !== undefined) { this.zero(this.wakes.instanceMatrix.array, WAKE[g.u.key] * MODEL_CAP + g.idx, 1); this.wakes.instanceMatrix.needsUpdate = true; } this.zero(g.m.mesh.instanceMatrix.array, g.idx, 1); g.m.free.push(g.idx); g.m.mesh.instanceMatrix.needsUpdate = true; let hi = g.m.hi; while (hi > 0 && g.m.free.includes(hi - 1)) hi--; g.m.hi = hi; g.m.mesh.count = hi; }
    e.pieces = null; e.vis = false; this.urbanDirty = true;
  }

  /** Crumble (§4.2): boxes sink, pancake and slide toward the hole over e.fallDur. Returns false when done. */
  crumble(e, dt) {
    e.fallT += dt;
    const p = e.pieces, T = e.fallT / e.fallDur;
    if (!p || p.none) return T < 1;
    if (p.units) { this.writeUnits(e, Math.min(1, T), e); return T < 1; }
    const lay = e.lay, d = lay.d, arr = p.mesh.instanceMatrix.array, hx = e.hx, hz = e.hz, reach = e.tier + (e.holeR || 0);
    for (let k = 0; k < lay.n; k++) {
      const o = k * 11, ox = d[o], oz = d[o + 1], H = d[o + 4], fx = d[o + 3], fz = d[o + 5], rr = ((k * 2654435761) >>> 0) / 4294967296;
      const delay = Math.min(0.55, 0.42 * Math.min(1, Math.hypot(hx - ox, hz - oz) / reach) + 0.1 * rr + 0.1 * (1 - Math.min(1, H / (fx * 3))));
      const q = Math.min(1, Math.max(0, (T - delay) / 0.45));
      let x = ox, z = oz, sink = 0, sy = H, sx = fx, sz = fz, yaw = d[o + 2];
      if (q > 0) {
        const sl = q * q * (3 - 2 * q) * 0.9;
        x = ox + (hx - ox) * sl; z = oz + (hz - oz) * sl;
        const inK = Math.max(0, 1 - Math.hypot(x - hx, z - hz) / Math.max(1, e.holeR || 1)); // (over the void: drop, don't hover)
        sink = q * q * (H * 0.8 + fx * 1.2) + inK * inK * q * (H + fx * 1.5) * 1.1; sy = H * (1 - 0.7 * q * q); sx = fx * (1 - 0.3 * q); sz = fz * (1 - 0.3 * q);
        yaw += (rr - 0.5) * 2.5 * q;
      } else if (T > 0.04) { x += Math.sin(T * 90 + k) * fx * 0.04; z += Math.cos(T * 80 + k) * fz * 0.04; } // tremble
      this.put(arr, p.at + k, e, x, z, yaw, sx, sy, sz, d[o + 6], sink);
    }
    p.mesh.instanceMatrix.needsUpdate = true;
    this.stats.writes += lay.n;
    return T < 1;
  }

  /** Re-seat every item's instances when the relief exaggeration E has moved (a few items a frame). */
  reE(budget = 1500) {
    this.E = this.W.E;
    let n = 0;
    for (const e of this.recs) {
      if (!e.vis || !e.pieces?.mesh || e.falling || Math.abs(e.Eat - this.E) < 0.004 * this.E) continue;
      const p = e.pieces, lay = e.lay, arr = p.mesh.instanceMatrix.array, d = lay.d;
      e.Eat = this.E;
      for (let k = 0; k < lay.n; k++) { const o = k * 11; this.put(arr, p.at + k, e, d[o], d[o + 1], d[o + 2], d[o + 3], d[o + 4], d[o + 5], d[o + 6], 0); }
      p.mesh.instanceMatrix.needsUpdate = true;
      if (!p.tr) this.writeDecals(e, p.at, lay);
      if ((n += lay.n) > budget) return;
    }
  }

  // ------------------------------------------------------------------ the footprints in the patch's RGBA map
  // R settlement density (soft edge: the suburbs fray into the fields), G woods, B road distance field (3 texels = uRoadW metres: the shader draws a
  // line of any width from it), A spare. Roads are re-rasterised only when the patch or the set of towns changes.
  paintUrban(info = this.W.patchInfo) {
    if (!info) return;
    const g = this.W.globe, m = g.mapData, W = this.W;
    const A = info.A, cosR = Math.cos((info.half * 1.4) / R);
    for (let i = 0; i < m.length; i += 4) { m[i] = 0; m[i + 1] = 0; }
    const towns = [];
    for (const e of this.recs) {
      if (!e.alive || e.pieces?.units || e.dir.x * A.x + e.dir.y * A.y + e.dir.z * A.z < cosR) continue;
      if (e.kind === 'settle' && e.tier >= 0.16 * this.curR) towns.push(e);
      if (!e.vis || e.falling || e.pieces?.none || e.tier < 0.16 * this.curR) continue; // (under ~0.16 r a footprint is a stain: the boxes carry it)
      if (e.kind === 'forest') W.stampInto(m, info, e.dir.x, e.dir.y, e.dir.z, e.tier * 0.95, 4, 1, 0.3);
      else W.stampInto(m, info, e.dir.x, e.dir.y, e.dir.z, e.tier * 0.95, 4, 0, 0.38);
    }
    const sig = towns.length + ':' + towns.reduce((s, e) => (s * 31 + (e.id | 0)) | 0, info.half | 0);
    if (sig !== this.roadSig || info !== this.roadInfo) { this.roadSig = sig; this.roadInfo = info; this.paintRoads(towns, info); }
    const rd = this.roadData;
    for (let i = 0, k = 2; i < rd.length; i++, k += 4) m[k] = rd[i];
    g.mapTex.needsUpdate = true;
    this.urbanDirty = false;
  }

  /** Roads: each town to its two nearest neighbours (within 45 r), a gently bent polyline, a tent distance field (255 on the line .. 0 at 3 texels). */
  paintRoads(towns, info) {
    const rd = this.roadData ??= new Uint8Array(TRAIL * TRAIL);
    rd.fill(0);
    if (towns.length < 2) return;
    const W = this.W, tx = towns.map((e) => W.texelOf(info, e.dir.x, e.dir.y, e.dir.z, {})), maxD = 45 * this.curR, seen = new Set(), segs = [];
    for (let a = 0; a < towns.length; a++) {
      const near = [];
      for (let b = 0; b < towns.length; b++) if (b !== a) { const d = Math.acos(Math.min(1, towns[a].dir.x * towns[b].dir.x + towns[a].dir.y * towns[b].dir.y + towns[a].dir.z * towns[b].dir.z)) * R; if (d < maxD) near.push([d, b]); }
      near.sort((p, q) => p[0] - q[0]);
      for (const [, b] of near.slice(0, 2)) { const key = a < b ? a * 4096 + b : b * 4096 + a; if (!seen.has(key)) { seen.add(key); segs.push([a, b]); } }
    }
    const texM = (info.half * 2) / TRAIL, W3 = 3;
    const seg = (x0, y0, x1, y1) => {
      const i0 = Math.max(0, Math.floor(Math.min(x0, x1) - W3)), i1 = Math.min(TRAIL - 1, Math.ceil(Math.max(x0, x1) + W3)), j0 = Math.max(0, Math.floor(Math.min(y0, y1) - W3)), j1 = Math.min(TRAIL - 1, Math.ceil(Math.max(y0, y1) + W3));
      if (i1 < i0 || j1 < j0) return;
      const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const t = Math.min(1, Math.max(0, ((i - x0) * dx + (j - y0) * dy) / l2)), d = Math.hypot(i - (x0 + dx * t), j - (y0 + dy * t));
        if (d < W3) { const v = Math.round((1 - d / W3) * 255), o = j * TRAIL + i; if (v > rd[o]) rd[o] = v; }
      }
    };
    for (const [a, b] of segs) {
      const p = tx[a], q = tx[b], len = Math.hypot(q.u - p.u, q.v - p.v);
      if (len / (1 / texM) > 1e9 || len < 1.5) continue;
      if (Math.max(p.u, q.u) < -50 || Math.min(p.u, q.u) > TRAIL + 50 || Math.max(p.v, q.v) < -50 || Math.min(p.v, q.v) > TRAIL + 50) continue;
      const rnd = rng((towns[a].id ^ towns[b].id) | 0), nx = -(q.v - p.v) / len, ny = (q.u - p.u) / len, n = Math.max(2, Math.min(5, Math.round(len / 40)));
      let px = p.u, py = p.v;
      for (let k = 1; k <= n; k++) {
        const f = k / n, bend = k < n ? (rnd() - 0.5) * len * 0.05 : 0, cx = p.u + (q.u - p.u) * f + nx * bend, cy = p.v + (q.v - p.v) * f + ny * bend;
        seg(px, py, cx, cy); px = cx; py = cy;
      }
    }
  }

  // ------------------------------------------------------------------ per frame
  /** After W.moveHole: local coordinates, the window, show/hide, the ladder, falls. Returns events for the game. */
  update(dt, hole, sync = false) {
    const W = this.W, r = hole.r, t0 = performance.now();
    this.t += dt; this.curR = r;
    _qi.copy(W.holeQ).invert();
    this.vx += (hole.vx - this.vx) * Math.min(1, dt * 2); this.vz += (hole.vz - this.vz) * Math.min(1, dt * 2);
    if (sync || this.needScan || (this.scanT += dt) > 0.25 && (W.hdir.angleTo(this.lastScan) * R > 0.3 * r || Math.abs(Math.log(r / this.lastScanR)) > 0.08)) {
      this.scanT = 0;
      this.scan(r, sync ? Infinity : 1.2);
      this.locals(r); // (distances for the ladder)
      if (!this.needScan) { this.ladder(r, hole); }
      if (sync) { this.locals(r); }
    } else this.locals(r);
    // show / hide / eat
    let shows = 0, showOk = true;
    const rr = r * VIS;
    this.events.length = 0;
    for (const e of this.recs) {
      if (!e.alive) continue;
      if (e.falling) continue;
      if (e.d < rr) { if (!e.vis && !this.noShow && showOk && (sync || shows < 2) && e.tier > 0.04 * r) { this.show(e); shows++; if (!sync && performance.now() - t0 > 3.5) showOk = false; } }
      else if (e.vis && e.d > rr * 1.12) this.hide(e);
      else if (e.vis && e.lay?.r && r > e.lay.r * 1.8 && showOk && shows < 2 && !this.noShow) { this.hide(e); e.lay = null; this.show(e); shows++; } // (the hole grew: re-lay the blocks coarser)
      if (e.tier < 0.95 * r) {
        if (e.d < r - 0.5 * e.tier) { // (eaten whether or not it got instances: out of pool or too small to draw, it just goes)
          if (!e.vis && !this.noShow) this.show(e);
          this.startFall(e, hole); this.events.push({ type: 'eat', e });
        }
      } else if (e.d < r + e.tier * 0.4) this.events.push({ type: 'tooBig', e });
    }
    // falls
    let writes = 0;
    for (const e of this.recs) {
      if (!e.falling) continue;
      this.holeIn(e, hole);
      if (writes < 2000 || e.fallT === 0) { writes += e.lay?.n ?? 4; if (!this.crumble(e, dt)) this.finish(e); } else e.fallT += dt;
    }
    this.reE();
    if (Math.abs(Math.log(r / (this.urbanR || r))) > 0.1) this.urbanDirty = true;
    if (this.urbanDirty && this.t - this.urbanAt > 0.2) { this.urbanAt = this.t; this.urbanR = r; this.paintUrban(); }
    this.stats.ms = performance.now() - t0;
    return this.events;
  }

  locals(r) {
    for (const e of this.recs) e.d = this.toLocal(e.dir, e);
  }
  holeIn(e, hole) { // the hole's centre in the item's tangent frame (metres)
    this.frameOf(e);
    const hd = this.W.hdir, k = hd.x * e.dir.x + hd.y * e.dir.y + hd.z * e.dir.z;
    const vx = hd.x - e.dir.x * k, vy = hd.y - e.dir.y * k, vz = hd.z - e.dir.z * k;
    e.hx = (vx * e.e1.x + vy * e.e1.y + vz * e.e1.z) * R; e.hz = (vx * e.e2.x + vy * e.e2.y + vz * e.e2.z) * R; e.holeR = hole.r;
  }
  startFall(e, hole) {
    e.falling = true; e.fallT = 0; e.alive = true;
    if (e.pieces?.mesh && !e.pieces.tr) { this.zero(this.decals.instanceMatrix.array, e.pieces.at, Math.ceil(e.pieces.n / e.pieces.pool.chunk) * e.pieces.pool.chunk); this.decals.instanceMatrix.needsUpdate = true; } // (the shadow goes first: the boxes are on the move)
    const k = Math.min(1, e.tier / hole.r);
    e.fallDur = e.tier < 0.12 * hole.r ? 0.7 : 1.5 + 1.5 * k;
    this.holeIn(e, hole);
    this.eaten.add(e.id);
  }
  finish(e) {
    e.alive = false; e.falling = false;
    this.hide(e); this.recs.delete(e); e.dropped = true;
    if (e.cell) e.cell.recs = e.cell.recs.filter((q) => q !== e);
    this.urbanDirty = true;
    if (e.goal) this.refreshGoals(this.tier);
  }

  /** Drop everything procedural (a teleport / test): fixed items stay. */
  reset() {
    for (const e of [...this.recs]) if (!e.fixed) { this.hide(e); this.recs.delete(e); e.dropped = true; } else { this.hide(e); }
    this.cells.clear(); this.needScan = true; this.urbanDirty = true;
  }
  /** Debug: bring the goal items back (they were eaten in a test). */
  revive() {
    for (const e of this.fixed) { e.alive = true; e.falling = false; e.dropped = false; e.fallT = 0; this.hide(e); this.recs.add(e); this.eaten.delete(e.id); }
    this.refreshGoals(this.tier);
  }
  dispose() {
    this.W.globe.group.remove(this.group);
    for (const m of [this.city, this.trees, ...Object.values(this.units).map((u) => u.mesh)]) m.dispose?.();
    this.W.onPatch = null;
  }
}
