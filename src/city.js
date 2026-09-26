// Seeded Toybox Town: tile grid, buildings, street furniture, pedestrians, traffic.
// Static things are instanced per (asset, chunk) so off-screen chunks are culled;
// movers are instanced per asset; animated landmarks are cloned with a mixer.
import * as THREE from 'three/webgpu';
import { Fn, uniformArray, uv, vec4, length, smoothstep, pow, If, Discard, positionWorld } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundMaterial, groundMaskMaterial, crumbleMaterial } from './surface.js';
import { Terrain } from './terrain.js';
import { planEvent } from './events.js';
import { MAX_HOLES } from './hole.js';
import { Collider } from './collide.js';
import { makeEntity } from './entity.js';

export const TILE = 40;

/** Mark only the first `n` floats of a per-frame re-packed instance buffer for upload (not the whole capacity: WebGL
 * re-uploads the full array otherwise, into a buffer the GPU may still be reading). */
function upload(attr, n) {
  if (!n) return; // (nothing drawn: nothing to send; an empty range list would mean the whole array)
  attr.clearUpdateRanges();
  attr.addUpdateRange(0, n);
  attr.needsUpdate = true;
}
export const SHADOW_LAYER = 1; // shadow-only stand-in meshes: the sun's shadow camera sees this layer, the view camera doesn't
const CHUNK = 40;
const LOD_DIST = [15, 60]; // metres from camera to chunk edge: beyond [0] draw LOD1, beyond [1] LOD2
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _frustum = new THREE.Frustum(), _sphere = new THREE.Sphere(), _pm = new THREE.Matrix4();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(), _qt = new THREE.Quaternion();
const _cm = new THREE.Matrix4(), _fv = new THREE.Frustum(), _fs = new THREE.Frustum(), _sph = new THREE.Sphere();
const UP = new THREE.Vector3(0, 1, 0);
const WALK_DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // travel direction per side of a walk loop (v > 0)

/** Point + travel direction at distance s round a rectangle loop { cx, cz, hx, hz } (counter-clockwise on screen). */
function perimeter(m, s) {
  const P = 4 * (m.hx + m.hz);
  let u = ((s % P) + P) % P;
  if (u < 2 * m.hx) return [m.cx - m.hx + u, m.cz - m.hz, 1, 0];
  if ((u -= 2 * m.hx) < 2 * m.hz) return [m.cx + m.hx, m.cz - m.hz + u, 0, 1];
  if ((u -= 2 * m.hz) < 2 * m.hx) return [m.cx + m.hx - u, m.cz + m.hz, -1, 0];
  u -= 2 * m.hx;
  return [m.cx - m.hx, m.cz + m.hz - u, 0, -1];
}

export function rng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.range = (lo, hi) => lo + r() * (hi - lo);
  return r;
}

/** Bake a glTF scene (with quantized attributes + child nodes) into one float geometry. */
const flatCache = new Map();
const PART_CACHE = new Map(); // cloned model -> merged draw parts per animated node (City.cloneParts), shared by every run
export function flatGeometry(asset, lod = 0, variant = 0) {
  if (asset.flatVariants) return asset.flatVariants[variant % asset.flatVariants.length][lod]; // procedural vegetation
  const key = asset.name + '|' + lod;
  if (flatCache.has(key)) return flatCache.get(key);
  const src = [asset.scene, asset.lod, asset.lod2][lod];
  src.updateMatrixWorld(true);
  const parts = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const g = new THREE.BufferGeometry();
    for (const n of ['position', 'normal', 'uv', '_swing', '_pivot']) {
      const a = o.geometry.attributes[n];
      if (!a) continue;
      const arr = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) {
        arr[i * a.itemSize] = a.getX(i);
        arr[i * a.itemSize + 1] = a.getY(i);
        if (a.itemSize > 2) arr[i * a.itemSize + 2] = a.getZ(i);
      }
      g.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize));
    }
    g.setIndex(Array.from(o.geometry.index.array));
    g.applyMatrix4(o.matrixWorld);
    parts.push(g);
  });
  const geo = mergeGeometries(parts);
  geo.computeBoundingSphere();
  flatCache.set(key, geo);
  return geo;
}

// Soft contact shadow blobs: ground every small thing (GTAO handles the rest), one instanced draw call.
function aoMaterial(holeField) {
  const holes = uniformArray(holeField.value, 'vec3');
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  mat.colorNode = Fn(() => {
    for (let i = 0; i < MAX_HOLES; i++) { // never darken the inside of a hole
      const h = holes.element(i);
      If(h.z.greaterThan(0).and(length(positionWorld.xz.sub(h.xy)).lessThan(h.z)), () => { Discard(); });
    }
    const d = length(uv().sub(0.5)).mul(2);
    return vec4(0.1, 0.08, 0.12, pow(smoothstep(1, 0, d), 1.6).mul(0.42));
  })();
  return mat;
}

export { groundMaterial };

const SIDEWALK = ['lamp', 'tree_small', 'bench', 'hydrant', 'trashcan', 'mailbox', 'newsbox', 'vending', 'phone_booth',
  'planter', 'flower_pot', 'bicycle', 'scooter', 'cone', 'tree_small', 'bench', 'bush', 'tree_small'];
const PARK = ['tree_small', 'tree_big', 'bench', 'picnic_table', 'flower_pot', 'dog', 'bush', 'hotdog_cart', 'tree_small', 'gnome', 'bush', 'tree_big', 'bush'];
const TRAFFIC = ['car', 'car_b', 'car_c', 'taxi', 'car', 'car_b', 'icecream_van', 'bus'];
export const PEOPLE = ['ped_business', 'ped_jogger', 'ped_tourist', 'ped_granny', 'ped_student', 'ped_chef', 'ped_worker', 'ped_kid'];
const PEDS = PEOPLE;
const CLONED = new Set(['fountain', 'clock_tower', 'crane', 'swing', 'searchlight', 'windmill', 'wind_turbine']);
export const BUILDINGS = new Set(['house', 'shop', 'cafe', 'apartment', 'clock_tower', 'office', 'hotel', 'skyscraper', 'crane', 'arcade', 'karaoke',
  'gas_station', 'station', 'hangar', 'control_tower']);
// wanderers and bumping traffic bounce off these (buildings plus the big fair rides)
const SOLID = new Set([...BUILDINGS, 'ferris_wheel', 'carousel']);
/** Phase 2 region buildings (region.js counts these toward clearing a settlement). */
export const REGION_BUILDINGS = new Set(['cottage', 'farmhouse', 'grain_silo', 'village_church', 'village_inn', 'castle_wall', 'castle_tower',
  'castle_gate', 'castle_keep', 'townhouse_row', 'townhouse_row_b', 'market_hall', 'town_hall', 'cathedral', 'factory', 'chimney_stack', 'gasholder',
  'fuel_tank', 'cooling_tower', 'city_block', 'city_block_b', 'glass_tower', 'supertall', 'tv_tower', 'stadium', 'parliament', 'barn', 'windmill']);
/** What crumbles into the hole part by part instead of dropping whole (surface.js crumbleMaterial). */
const CRUMBLES = new Set([...BUILDINGS, ...REGION_BUILDINGS, 'gas_station', 'station', 'hangar', 'water_tower', 'control_tower', 'pier']);
let crumbleMat = null;

/** Per-vertex centre of the connected piece (modelled part) it belongs to, for the crumble. Cached per geometry. */
function partCentres(geo) {
  if (geo.userData.aPart) return geo.userData.aPart;
  const pos = geo.attributes.position, n = pos.count, idx = geo.index.array;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const sum = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let q = sum.get(r);
    if (!q) sum.set(r, (q = [0, 0, 0, 0]));
    q[0] += pos.getX(i); q[1] += pos.getY(i); q[2] += pos.getZ(i); q[3]++;
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const q = sum.get(find(i)); out[i * 3] = q[0] / q[3]; out[i * 3 + 1] = q[1] / q[3]; out[i * 3 + 2] = q[2] / q[3]; }
  return (geo.userData.aPart = new THREE.BufferAttribute(out, 3));
}
const ANIMALS = new Set(['pigeon', 'rainbow_pigeon', 'dog', 'crab', 'cow', 'sheep', 'pig', 'chicken', 'horse', 'goat', 'duck']);
const isTree = (n) => n.startsWith('tree') || n.startsWith('palm') || n.startsWith('pine') || n === 'bush' || n === 'hedge';
// movers that range across the whole town: never frustum-culled per chunk, mid LOD
const ROAMERS = new Set(['drive', 'wander', 'taxi', 'apron', 'field', 'rail', 'parade', 'jog', 'still', 'road']);
const RAIL_Y = 0.47; // top of the rails on tile_rail (manifest rail_top)
const WHEEL_V = 4.5; // wheel clips are authored for 4.5 m/s rolling
const FAIR_STALLS = ['hoopla_stall', 'balloon_stand', 'ticket_booth', 'hoopla_stall', 'balloon_stand', 'fireworks_stand'];
const SNACKS = [['ped_business', 4], ['ped_jogger', 4], ['ped_tourist', 4], ['ped_granny', 4], ['ped_student', 4], ['ped_chef', 3], ['ped_worker', 3], ['ped_kid', 4], ['pigeon', 8], ['dog', 6], ['scooter', 6], ['bicycle', 6], ['hotdog_cart', 5],
  ['car_b', 6], ['car', 6], ['car_c', 6], ['taxi', 6], ['icecream_van', 4], ['bus', 4]];
export const SNACK_NAMES = SNACKS.map(([n]) => n);

/** City moods: tile weights for the inner ring and the outskirts. Picked per run from the seed. */
export const MOODS = [
  { name: 'Old Town', inner: { lot: 6, plaza: 1, park: 1.5, canal: 0.5 }, outer: { lot: 3, park: 2, residential: 3, plaza: 0.6, parking: 0.5 }, canals: false },
  { name: 'Suburbia', inner: { lot: 5, park: 1.5, parking: 1 }, outer: { residential: 6, park: 2, lot: 1.5 }, canals: false },
  { name: 'Waterfront', inner: { lot: 5, plaza: 1, park: 1 }, outer: { lot: 2, park: 2, residential: 2, canal: 1, parking: 0.4 }, canals: true },
  { name: 'Seaside', inner: { lot: 5, plaza: 1, park: 1.2 }, outer: { lot: 2, park: 1.5, residential: 2.5, parking: 0.4 }, canals: false, beach: true },
  { name: 'Neon Nights', inner: { lot: 4, neon: 3, plaza: 0.5 }, outer: { neon: 2, lot: 3, parking: 1, residential: 1 }, canals: false, night: true },
  { name: 'Boomtown', inner: { lot: 6, construction: 1.5, parking: 1 }, outer: { construction: 2, parking: 1.5, lot: 3, residential: 1.5 }, canals: false },
  // Stage 11 districts (their models load per city: see packs.js)
  { name: 'Fun Fair', inner: { lot: 5, fair: 2, plaza: 0.6 }, outer: { fair: 2.2, lot: 2, park: 1, residential: 1.5 }, canals: false, events: { parade: 3 } },
  { name: 'Airport City', inner: { lot: 5, parking: 1.5, plaza: 0.6 }, outer: { lot: 3, parking: 1.2, residential: 2, park: 1 }, canals: false, airport: true },
  { name: 'Railway Town', inner: { lot: 5, plaza: 1, park: 1 }, outer: { residential: 4, lot: 2, park: 1.5 }, canals: false, rail: true },
  { name: 'County Fair', inner: { lot: 5, park: 2 }, outer: { residential: 3, park: 3, lot: 1 }, canals: false, county: true, events: { marathon: 3 } },
];

function weighted(r, weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (const [k, w] of Object.entries(weights)) if ((x -= w) < 0) return k;
  return Object.keys(weights)[0];
}

/** ?mood=fun (prefix, any case) forces a mood for screenshots, bots and debugging. */
export function forcedMood() {
  const force = typeof location !== 'undefined' && new URLSearchParams(location.search).get('mood');
  return force ? MOODS.find((m) => m.name.toLowerCase().startsWith(force.toLowerCase().replace(/[-_]/g, ' '))) : null;
}

/** The mood a seed rolls when none is chosen (same draws as the City constructor). */
export function moodFor(seed) {
  const r = rng(seed);
  r();
  return forcedMood() || r.pick(MOODS);
}

export class City {
  /** opts.mood: a mood name (the city picker); otherwise the seed rolls one. opts.mutator: weekly twist (mutators.js). */
  constructor(assets, seed, holeField, opts = {}) {
    this.assets = assets;
    this.mutator = opts.mutator || null;
    this.scaleK = this.mutator === 'mini' ? 0.5 : 1; // Miniature: half-size props (and tiers), twice as many
    this.metaCache = new Map();
    this.r = rng(seed);
    const N = (this.N = 5 + Math.floor(this.r() * 3));
    this.mood = this.r.pick(MOODS);
    if (opts.mood) this.mood = MOODS.find((m) => m.name === opts.mood) || this.mood;
    this.mood = forcedMood() || this.mood;
    this.tileEntities = [];
    this.half = (N * TILE) / 2;
    this.group = new THREE.Group();
    this.entities = [];
    this.solids = []; // footprints of static props placed so far (layout only)
    this.mixers = [];
    this.dirty = new Set();
    this.holeField = holeField;
    this.groundMat = groundMaterial(holeField); // cuts the holes out (fragment discard)
    // ...and the same ground without the cut, for every chunk no hole touches: a shader that can discard switches off
    // hidden-surface removal on tile-based GPUs (Apple), and the ground covers most of the screen
    this.groundSolid = groundMaterial(null);
    this.chunk = CHUNK;
    if (opts.defer) return; // Region (Phase 2) lays itself out in stages
    this.layout();
    this.build();
    this.collide = new Collider(this, (e) => this.footprint(e));
  }

  // ---------- layout: a list of placements, no three.js objects yet ----------
  /** Manifest meta, scaled for the Miniature mutator (one shared copy per model). */
  metaOf(name) {
    const m = this.assets[name].meta;
    if (this.scaleK === 1) return m;
    if (!this.metaCache.has(name)) this.metaCache.set(name, { ...m, tier: m.tier * this.scaleK, height: m.height * this.scaleK, mass: m.mass * this.scaleK ** 3 });
    return this.metaCache.get(name);
  }

  add(name, x, z, rot = 0, mover = null) {
    const a = this.assets[name], meta = this.metaOf(name);
    // static props never interpenetrate: a placement whose footprint overlaps one already standing is dropped
    if (!mover || mover.type === 'peck') {
      const rr = meta.tier * 0.6;
      for (const o of this.solids) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + rr) ** 2) return;
      this.solids.push({ x, z, r: rr });
    }
    if (mover) mover.t ??= 0;
    this.entities.push(makeEntity({ name, meta, x, z, y: 0, rot, tilt: 0, tiltDir: 0, s: 1, gs: this.scaleK, alive: true, falling: false, vy: 0, mover, grounded: true }));
    if (this.scaleK !== 1 && !this.twinning && !BUILDINGS.has(name)) this.twin(name, x, z, rot, mover);
  }

  /** Miniature: every non-building placement gets a sibling nearby (2x count; overlaps are still dropped). */
  twin(name, x, z, rot, mover) {
    const { r } = this;
    this.twinning = true;
    const a = r() * Math.PI * 2, d = r.range(1.2, 2.6);
    if (!mover || mover.type === 'peck' || mover.type === 'wander' || mover.type === 'bob' || mover.type === 'scuttle') {
      this.add(name, x + Math.cos(a) * d, z + Math.sin(a) * d, rot + r.range(-0.5, 0.5), mover && { ...mover, t: r() * 10, x0: mover.x0 !== undefined ? mover.x0 + Math.cos(a) * d : undefined });
    } else if (mover.type === 'walk') this.add(name, x, z, rot, { ...mover, s: (mover.s + r.range(2, 6)) % (8 * mover.h), t: r() * 10 });
    else if (mover.type === 'loop') this.add(name, x, z, rot, { ...mover, a: mover.a + r.range(0.3, 0.8), t: r() * 10 });
    else if (mover.type === 'drive') this.add(name, mover.axis === 'x' ? x + 9 : x, mover.axis === 'x' ? z : z + 9, rot, { ...mover, t: r() * 10 });
    this.twinning = false;
  }

  layout() {
    const { r, N } = this;
    this.tiles = [];
    const mid = (N - 1) / 2, plazaAt = Math.floor(mid);
    const canalRow = this.mood.canals ? Math.floor(r() * (N - 1)) : -1;
    this.beach = this.mood.beach || r() < 0.25; // seafront along the +z edge
    const pierAt = Math.floor(r() * N);
    // airport: one full row of runway along the -z edge (the beach owns +z); railway: one full row inside town
    this.runwayRow = this.mood.airport ? 0 : -1;
    if (this.mood.rail) {
      const rows = Array.from({ length: N }, (_, j) => j).filter((j) => j > 0 && j !== plazaAt && !(this.beach && j >= N - 2));
      this.railRow = r.pick(rows);
    } else this.railRow = -1;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const cx = (i - mid) * TILE, cz = (j - mid) * TILE;
        const ring = Math.max(Math.abs(i - mid), Math.abs(j - mid));
        let type;
        if (i === plazaAt && j === plazaAt) type = 'plaza';
        else if (j === this.runwayRow) type = 'runway';
        else if (this.beach && j === N - 1) type = 'beach';
        else if (j === this.railRow) type = 'rail';
        else if (j === canalRow && r() < 0.85) type = 'canal';
        else if (ring < 1) type = 'lot';
        else type = weighted(r, ring < 2 ? this.mood.inner : this.mood.outer);
        // Tiles whose props depend on orientation only turn by 180° (canals stay continuous along x).
        const r180 = type === 'canal' || this.assets['tile_' + type]?.meta.rot180; // rows must join edge to edge
        const rot = type === 'beach' ? 0 : r180 ? (r() < 0.5 ? 0 : Math.PI) : Math.floor(r() * 4) * Math.PI / 2;
        this.tiles.push({ type, cx, cz, ring, rot, i, j, pier: type === 'beach' && i === pierAt, apron: this.mood.airport && j === 1 });
      }
    }
    for (const t of this.tiles) {
      this.tile(t);
      if (this.mutator === 'night' && t.type !== 'neon' && t.type !== 'runway' && (t.i + t.j) % 3 === 0) this.add('searchlight', t.cx + 11, t.cz - 11, 0);
      this.sidewalk(t);
    }
    this.traffic();
    this.districts();
    this.eventPlan = planEvent(this); // this run's city event, its crowd parked as dormant entities
    this.reserves();
    this.scenery();
    this.rares();
  }

  /** Collection-book rares: occasionally a common thing is swapped for its rare cousin. */
  rares() {
    const { r } = this;
    for (const [base, rare, p] of [['gnome', 'golden_gnome', 0.6], ['hydrant', 'gold_hydrant', 0.45], ['pigeon', 'rainbow_pigeon', 0.55], ['car', 'mayor_limo', 0.4]]) {
      if (r() > p) continue;
      const pool = this.entities.filter((e) => e.name === base && e.alive && (!e.mover || e.mover.type === 'peck'));
      if (!pool.length) continue;
      const e = r.pick(pool);
      e.name = rare;
      e.meta = this.metaOf(rare);
    }
  }

  /** Tile-local (x, z) -> world, honouring the tile's rotation. */
  at(t, x, z) {
    const c = Math.cos(t.rot), s = Math.sin(t.rot);
    return [t.cx + x * c + z * s, t.cz - x * s + z * c];
  }

  put(t, name, x, z, rot = 0, mover = null) {
    const [wx, wz] = this.at(t, x, z);
    this.add(name, wx, wz, rot + t.rot, mover);
  }

  tile(t) {
    const { r } = this;
    const { cx, cz, ring } = t;
    this.tileEntities.push({ name: 'tile_' + t.type, x: cx, z: cz, rot: t.rot });
    const quads = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    if (t.type === 'lot' && t.apron && (!this.towerDone || r() < 0.5)) {
      // next to the runway: a hangar with its doors (+x) turned to face the strip (-z), the control tower once
      this.add('hangar', cx - 3, cz - 2, Math.PI / 2);
      if (!this.towerDone) { this.towerDone = true; this.add('control_tower', cx + 10.5, cz + 9.5, r() * 6.28); }
      else this.add(r.pick(['shop', 'cafe']), cx + 10, cz + 9, 0);
      for (let k = 0; k < 4; k++) this.add('cone', cx + r.range(-12, 12), cz - 12.5, 0);
    } else if (t.type === 'lot') {
      const big = ring < 1 ? ['skyscraper', 'hotel', 'office'] : ring < 2 ? ['apartment', 'office', 'apartment', 'hotel'] : ['apartment'];
      const small = ring < 2 ? ['shop', 'cafe', 'clock_tower', 'shop'] : ['house', 'house', 'shop', 'cafe'];
      if (ring < 1 || (ring < 2 && r() < 0.6) || r() < 0.15) {
        this.add(r.pick(big), cx, cz, Math.floor(r() * 4) * Math.PI / 2);
      } else {
        let tower = false;
        for (const [sx, sz] of quads) {
          let n = r.pick(small);
          if (n === 'clock_tower') { if (tower) n = 'shop'; tower = true; }
          // Front (+x) faces the nearer street on x.
          this.add(n, cx + sx * 6, cz + sz * 6, sx > 0 ? 0 : Math.PI);
        }
      }
      if (r() < 0.35) this.add('gas_can', cx + r.range(-10, 10), cz + 11.5, 0);
    } else if (t.type === 'residential') {
      for (const [sx, sz] of quads) {
        this.put(t, 'house', sx * 5.5, sz * 6, sx > 0 ? 0 : Math.PI);
        if (r() < 0.7) this.put(t, r.pick(['car', 'car_b', 'car_c']), sx * 11.2, sz * 6, 0);
        for (const fz of [2.2, 10.2]) this.put(t, 'fence', sx * 12.6, sz * fz, Math.PI / 2);
        for (let k = 0; k < 2; k++) this.put(t, 'gnome', sx * r.range(9, 11.5), sz * r.range(1.5, 3.5), r() * 6.28);
        this.put(t, r() < 0.3 ? 'swing' : r.pick(['tree_small', 'tree_big', 'flower_pot', 'planter']), sx * 2.5, sz * 11, r() * 6.28);
        if (r() < 0.5) this.put(t, 'dog', sx * r.range(1, 3), sz * r.range(2, 4), r() * 6.28);
        this.put(t, 'mailbox', sx * 13.6, sz * 4.2, 0);
        if (this.mood.county) this.county(t, sx, sz);
        for (let k = 0; k < 3; k++) this.put(t, 'bush', sx * r.range(8.5, 12), sz * r.range(8, 13), r() * 6.28);
      }
      for (let k = 0; k < 3; k++) this.walker(cx, cz, 13.2);
    } else if (t.type === 'construction') {
      this.put(t, 'crane', -5, 5, r() * 6.28);
      for (const [x, z] of [[6, -6], [8, 5], [-9, -8]]) this.put(t, 'dirt_pile', x, z, r() * 6.28);
      for (let k = 0; k < 8; k++) this.put(t, 'cone', r.range(-11, 11), r.range(-11, 11), 0);
      for (let k = 0; k < 2; k++) this.put(t, 'toxic_barrel', r.range(0, 11), r.range(-11, 0), 0);
      this.put(t, 'gas_can', 3, 9, 0);
      for (let k = 0; k < 3; k++) this.put(t, r.pick(['bench', 'vending', 'trashcan']), -11, -10 + k * 3, 0);
    } else if (t.type === 'parking') {
      if (r() < 0.5) this.put(t, 'gas_station', 0, -6.5, r() < 0.5 ? 0 : Math.PI); // cars overlapping its forecourt are dropped
      for (const row of [-8, 0, 8]) {
        for (let k = 0; k < 10; k++) {
          if (r() < 0.65) this.put(t, r.pick(['car', 'car_b', 'car_c', 'taxi', 'car']), -11.25 + k * 2.5, row, r() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        }
      }
      if (r() < 0.5) this.put(t, 'icecream_van', 0, -12.5, 0);
    } else if (t.type === 'canal') {
      for (let k = 0; k < 3; k++) {
        const [x, z] = this.at(t, r.range(-12, 12), r() < 0.5 ? -1.8 : 1.8);
        this.add('rowboat', x, z, t.rot + (r() < 0.5 ? 0 : Math.PI), { type: 'bob', base: -0.35, t: r() * 10 });
      }
      for (const z of [-6.5, 6.5]) {
        for (let k = 0; k < 3; k++) this.put(t, r.pick(['bench', 'tree_small', 'planter', 'lamp']), -9 + k * 9, z, 0);
      }
      for (let k = 0; k < 6; k++) {
        const [x, z] = this.at(t, r.range(-12, 12), (r() < 0.5 ? -1 : 1) * r.range(5, 8));
        this.add('pigeon', x, z, r() * 6.28, { type: 'peck', t: r() * 10 });
      }
      for (let k = 0; k < 4; k++) this.walker(cx, cz, 9);
    } else if (t.type === 'beach') {
      // sand runs from the sea wall (z=-7) to the waterline (z=+9); promenade is inland (z<-8)
      for (let k = 0; k < 5; k++) {
        const x = -11 + k * 5.5 + r.range(-1, 1), z = r.range(-3, 5);
        this.put(t, 'beach_umbrella', x, z, r() * 6.28);
        this.put(t, 'deckchair', x + 1.4, z + 0.6, r.range(-0.4, 0.4) - Math.PI / 2);
      }
      for (let k = 0; k < 2; k++) this.put(t, 'sandcastle', r.range(-12, 12), r.range(5, 8), r() * 6.28);
      for (let k = 0; k < 3; k++) this.put(t, 'beach_ball', r.range(-12, 12), r.range(-4, 7), 0);
      for (let k = 0; k < 2; k++) this.put(t, 'surfboard', r.range(-12, 12), r.range(-5, 6), r() * 6.28);
      if (r() < 0.6) this.put(t, 'lifeguard_tower', r.range(-8, 8), 6.5, -Math.PI / 2);
      if (r() < 0.3) this.put(t, 'fireworks_stand', r.range(-10, 10), -5.5, r() * 6.28);
      for (let k = 0; k < 4; k++) {
        const [x, z] = this.at(t, r.range(-12, 12), r.range(8, 10));
        this.add('crab', x, z, r() * 6.28, { type: 'scuttle', x0: x, t: r() * 10 });
      }
      for (let k = 0; k < 3; k++) this.put(t, r.pick(['bench', 'lamp', 'icecream_van', 'kiosk']), -10 + k * 10, -10.5, 0);
      if (t.pier) this.pierAt = [cx + 9, cz - 6];
    } else if (t.type === 'neon') {
      this.put(t, 'arcade', -7.5, -7.5, 0);
      this.put(t, 'karaoke', 7.5, 7.5, Math.PI);
      for (let k = 0; k < 3; k++) this.put(t, 'noodle_stall', 6 + k * 2.4, -9, Math.PI / 2);
      for (let k = 0; k < 6; k++) this.put(t, 'neon_sign', r.range(-12, 12), r.range(-12, 12), r() * 6.28);
      for (let k = 0; k < 2; k++) this.put(t, 'vending', -12, 4 + k * 1.2, 0);
      this.put(t, 'searchlight', 11, 11, 0);
      for (let k = 0; k < 6; k++) this.walker(cx, cz, 11);
    } else if (t.type === 'park') {
      const [px, pz] = this.at(t, 7, -7); // the pond (tile_park.py puts it at Blender (7, 7))
      const dry = (x, z) => (x - px) ** 2 + (z - pz) ** 2 > 5.4 ** 2;
      for (let k = 0; k < 16; k++) {
        const x = cx + r.range(-12, 12), z = cz + r.range(-12, 12);
        if (Math.abs(x - cx) < 2 || Math.abs(z - cz) < 2 || !dry(x, z)) continue; // keep paths and the pond clear
        this.add(r.pick(PARK), x, z, r() * Math.PI * 2);
      }
      for (let k = 0; k < 6; k++) { // shrub clusters at the lawn corners
        const qx = r() < 0.5 ? -1 : 1, qz = r() < 0.5 ? -1 : 1;
        const x = cx + qx * r.range(4, 12.5), z = cz + qz * r.range(4, 12.5);
        if (dry(x, z)) this.add('bush', x, z, r() * 6.28);
      }
      if (r() < (this.mood.county ? 0.6 : 0.2)) this.put(t, 'water_tower', -8, 8, r() * 6.28);
      if (this.mood.county) this.county(t, 0, 0);
      if (r() < 0.5) this.add('swing', cx + 7, cz - 7, r() * 6.28);
      for (let k = 0; k < 6; k++) {
        const x = cx + r.range(-10, 10), z = cz + r.range(-10, 10);
        if (dry(x, z)) this.add('pigeon', x, z, r() * 6.28, { type: 'peck', t: r() * 10 });
      }
      for (let k = 0; k < 5; k++) this.walker(cx, cz, 12); // loop outside the pond (tile-local 7,7, r 4.2) at any rotation
    } else if (t.type === 'fair') {
      this.fair(t);
    } else if (t.type === 'rail') {
      for (const z of [-9, 9]) for (let k = 0; k < 3; k++) if (r() < 0.6) this.put(t, r.pick(['bench', 'lamp', 'bush', 'planter']), -9 + k * 9 + r.range(-2, 2), z + r.range(-1.5, 1.5), 0);
      for (let k = 0; k < 4; k++) { // pigeons on the verges, trainspotters on a loop between the fences
        const [x, z] = this.at(t, r.range(-12, 12), (r() < 0.5 ? -1 : 1) * r.range(6, 12));
        this.add('pigeon', x, z, r() * 6.28, { type: 'peck', t: r() * 10 });
      }
    } else if (t.type === 'runway') {
      for (let k = 0; k < 5; k++) this.put(t, 'cone', r.range(-13, 13), (r() < 0.5 ? -1 : 1) * r.range(9, 13), 0);
    } else {
      this.add('fountain', cx, cz, 0);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        this.add('bench', cx + Math.cos(a) * 6, cz + Math.sin(a) * 6, -a);
      }
      this.add('kiosk', cx + 10, cz - 10, Math.PI / 2);
      this.add('hotdog_cart', cx - 10, cz + 9, r() * 6.28);
      if (ring > 0) this.add('spiky', cx - 9, cz - 9, 0);
      if (r() < 0.4) this.add('fireworks_stand', cx + 10, cz + 10.5, r() * 6.28);
      for (let k = 0; k < 14; k++) {
        const a = r() * 6.28, d = r.range(3.5, 11);
        this.add('pigeon', cx + Math.cos(a) * d, cz + Math.sin(a) * d, r() * 6.28, { type: 'peck', t: r() * 10 });
      }
      for (let k = 0; k < 8; k++) this.walker(cx, cz, 11);
    }
  }

  /** Fairground tile: two rides on their pads, stalls round the promenade, a bumper-car rink and a crowd. */
  fair(t) {
    const { r } = this;
    this.put(t, 'ferris_wheel', -7.5, -7.5, 0);
    this.put(t, 'carousel', 7.5, 7.5, r() * 6.28);
    // stalls face the path round the promenade circle, away from the ride pads (the diagonal)
    const n = 5 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = Math.PI / 4 + (k + 0.5) * (Math.PI * 2 / n) + r.range(-0.15, 0.15);
      const d = r() < 0.5 ? 12.2 : 6.6; // outside or inside the loop
      this.put(t, FAIR_STALLS[k % FAIR_STALLS.length], Math.cos(a) * d, -Math.sin(a) * d, a + (d > 9 ? Math.PI : 0));
    }
    // bumper-car rink in a free quadrant
    const [rx, rz] = this.at(t, 8, -8); // clear of the festoon mast in the corner
    const cars = 4 + Math.floor(r() * 3);
    for (let k = 0; k < cars; k++) {
      const a = (k / cars) * Math.PI * 2;
      this.add('bumper_car', rx + Math.cos(a) * 2.2, rz + Math.sin(a) * 2.2, r() * 6.28, { type: 'rink', cx: rx, cz: rz, R: 3.8, h: r() * 6.28, v: r.range(1.8, 2.6), t: r() * 10 });
    }
    // the crowd: dense walkers on the promenade circle (three kinds of people per fair keeps it to three draw calls)
    const crowd = [r.pick(PEDS), r.pick(PEDS), r.pick(PEDS)];
    for (let k = 0; k < 12; k++) {
      this.add(crowd[k % 3], t.cx, t.cz, 0, { type: 'loop', cx: t.cx, cz: t.cz, R: r.range(8.6, 10.4), a: r() * 6.28, v: r.range(0.9, 1.5) * (r() < 0.5 ? 1 : -1), t: r() * 10 });
    }
    for (let k = 0; k < 5; k++) {
      const a = r() * 6.28, d = r.range(3, 7);
      this.add('pigeon', t.cx + Math.cos(a) * d, t.cz + Math.sin(a) * d, r() * 6.28, { type: 'peck', t: r() * 10 });
    }
  }

  /** County Fair dressing: prize pumpkins, hay-bale stacks and scarecrows (sx, sz: residential quadrant, or 0 for a park). */
  county(t, sx, sz) {
    const { r } = this;
    if (sx) {
      if (r() < 0.45) for (let k = 0; k < 3; k++) this.put(t, 'hay_bale', sx * (9 + k * 1.6), sz * 12.5, Math.PI / 2 + r.range(-0.2, 0.2));
      if (r() < 0.3) this.put(t, 'scarecrow', sx * 10, sz * 9.5, r() * 6.28);
      if (r() < 0.2) this.put(t, 'prize_pumpkin', sx * 2.5, sz * 3.5, 0);
      return;
    }
    for (let k = 0; k < 1 + Math.floor(r() * 2); k++) this.put(t, 'prize_pumpkin', r.range(-11, -3), r.range(-11, -3), r.range(-0.4, 0.4));
    for (let k = 0; k < 4; k++) this.put(t, 'hay_bale', r.range(-12, 12), r.range(3, 12), r() * 6.28);
    this.put(t, 'scarecrow', r.range(3, 11), r.range(3, 11), r() * 6.28);
  }

  /** Parade members follow the route polyline at their distance behind the head, offset sideways (drummer columns). */
  moveParade(e, dt) {
    const m = e.mover;
    m.t += dt;
    m.s += m.v * dt;
    if (m.s > m.path.total - 1) { e.alive = false; e.s = 0; this.place(e); return; } // marched out of town
    const [x, z, tx, tz] = m.path.at(Math.max(0, m.s));
    e.x = x - tz * m.lat;
    e.z = z + tx * m.lat;
    e.rot = Math.atan2(-tz, tx);
    e.y = e.name === 'drummer' ? Math.abs(Math.sin(m.t * 8)) * 0.05 : 0;
    this.place(e);
  }

  /** Row districts laid over the tile grid: the train on the railway, the airliner + baggage trains at the airport, tractors. */
  districts() {
    const { r } = this;
    const H = this.half;
    if (this.railRow >= 0) {
      const row = this.tiles.filter((t) => t.type === 'rail');
      const z = row[0].cz;
      this.railZ = z;
      // the station stands on the verge of one rail tile, its platform edge (+z local) facing the track
      const st = row[Math.floor(row.length / 2)];
      const side = r() < 0.5 ? -1 : 1;
      this.add('station', st.cx + r.range(-4, 4), z + side * 4.2, side < 0 ? 0 : Math.PI);
      this.stationX = this.entities.at(-1).x;
      this.trains = [];
      const dir = r() < 0.5 ? 1 : -1;
      const train = { x: r.range(-H, H), z, dir, v: 8, vmax: 8, stop: 0, stopped: false, loco: true, cars: [] };
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k <= n; k++) {
        const name = k ? 'carriage' : 'locomotive';
        // origins are mid-vehicle: loco+tender 13.2 m, carriages 10.3 m buffer to buffer, 0.4 m couplings
        const off = k ? 13.2 / 2 + 0.4 + 10.3 / 2 + (k - 1) * (10.3 + 0.4) : 0;
        const e = makeEntity({ name, meta: this.assets[name].meta, x: 0, z, y: RAIL_Y, rot: dir > 0 ? 0 : Math.PI, tilt: 0, tiltDir: 0, s: 1, alive: true, falling: false, vy: 0,
          mover: { type: 'rail', train, off, t: 0 } });
        train.cars.push(e);
        this.entities.push(e);
      }
      this.trains.push(train);
      this.placeTrain(train, 0);
    }
    if (this.runwayRow >= 0) {
      const row = this.tiles.filter((t) => t.type === 'runway');
      const z = row[0].cz;
      this.runwayZ = z;
      const mid = row[Math.floor(row.length / 2)];
      this.add('airliner', mid.cx, z, 0, { type: 'taxi', x0: -H + 26, x1: H - 26, z, v: 3, dir: 1, pause: 8 + r() * 10, t: 0 });
      for (let k = 0; k < 2 + Math.floor(r() * 2); k++) { // baggage trains loop the verges
        this.add('baggage_tug', 0, z, 0, { type: 'apron', cx: 0, cz: z, hx: H - 8, hz: 11.5, s: r() * 4 * (2 * H), v: r.range(3.5, 4.5), t: r() * 10 });
      }
    }
    if (this.mood.county) { // tractors trundle round the parks and gardens
      const fields = this.tiles.filter((t) => t.type === 'park' || t.type === 'residential');
      for (let k = 0; k < Math.min(fields.length, 2 + Math.floor(r() * 2)); k++) {
        const t = fields.splice(Math.floor(r() * fields.length), 1)[0];
        this.add('tractor', t.cx + r.range(-6, 6), t.cz + r.range(-6, 6), r() * 6.28, { type: 'field', cx: t.cx, cz: t.cz, h: r() * 6.28, v: r.range(1.2, 1.8), t: r() * 10 });
      }
    }
  }

  /** Move a train along its row: cars follow the head at fixed offsets and wrap edge to edge like traffic. */
  placeTrain(train, dt) {
    const H = this.half;
    const live = train.cars.filter((e) => e.alive && !e.falling);
    if (!live.length) return;
    if (train.loco) {
      // stop at the station for 6 s (once per pass), easing in and out
      const lead = train.cars[0];
      const toStation = ((this.stationX - train.x) * train.dir + 4 * H) % (2 * H);
      if (train.stop > 0) { train.stop -= dt; train.v = 0; if (train.stop <= 0) train.left = 30; }
      else {
        train.left = Math.max(0, (train.left || 0) - dt);
        const target = !train.left && toStation < 30 ? Math.min(train.vmax, Math.max(0.8, (toStation - 0.5) * 0.45)) : train.vmax;
        train.v += Math.max(-4 * dt, Math.min(1.5 * dt, target - train.v));
        if (!train.left && toStation < 0.6 && lead.alive) { train.stop = 6; train.v = 0; }
      }
    } else train.v = Math.max(0, train.v - 2.5 * dt); // decoupled: coasts to a halt
    train.x += train.v * train.dir * dt;
    if (train.x > H) train.x -= 2 * H;
    if (train.x < -H) train.x += 2 * H;
    for (const e of live) {
      let x = train.x - e.mover.off * train.dir;
      x = ((x + H) % (2 * H) + 2 * H) % (2 * H) - H;
      e.x = x;
      e.z = train.z;
      e.y = RAIL_Y;
      e.rot = train.dir > 0 ? 0 : Math.PI;
      if (e.actions) for (const act of Object.values(e.actions)) act.timeScale = train.v / WHEEL_V;
      if (e.mesh || e.obj) this.place(e);
    }
  }

  /** A car went down the hole: the ones behind it uncouple and roll to a stop. */
  decouple(e) {
    const train = e.mover.train;
    const i = train.cars.indexOf(e);
    const rest = train.cars.slice(i + 1).filter((q) => q.alive && !q.falling);
    train.cars = train.cars.slice(0, i);
    if (!train.cars.length) train.dead = true;
    if (!rest.length) return;
    const shift = rest[0].mover.off;
    const loose = { ...train, loco: false, cars: rest, x: train.x - shift * train.dir, stop: 0, dead: false };
    for (const q of rest) { q.mover.train = loose; q.mover.off -= shift; }
    this.trains.push(loose);
  }

  /** Countryside around the town: a real terrain (src/terrain.js) with its own scatter. Scenery only (never swallowed). */
  scenery() {
    this.terrainSeed = (this.r() * 2 ** 31) | 0; // Phase 2 grows the same land outward (region.js)
    this.terrain = new Terrain(this.terrainSeed, this.half, { beach: this.beach, farm: !!this.mood.county });
    this.sceneryList = this.terrain.scatter(this.assets);
    if (this.beach) for (let k = 0; k < 6; k++) {
      this.sceneryList.push({ name: 'sailboat', x: this.r.range(-this.half - 100, this.half + 100), y: this.terrain.water - 0.1, z: this.half + this.r.range(40, 260), rot: this.r() * 6.28 });
    }
  }

  /** Ground surface height at (x, z): blocks sit 18 cm above the road. */
  /**
   * Collision footprint of an entity's model (model space, metres at scale 1): { hx, hz, cx, cz, round }, cached per
   * model. Trees collide at the trunk only (people walk under the canopy); people and animals are circles.
   */
  footprint(e) {
    const ducks = this.mutator === 'ducks' && this.assets.rubber_duck && ['prop', 'poison', 'unit'].includes(e.meta.kind) && !SOLID.has(e.name) && !e.obj;
    const name = ducks ? 'rubber_duck' : e.name;
    this.feet ??= new Map();
    if (!this.feet.has(name)) this.feet.set(name, this.makeFoot(name));
    e.solid = SOLID.has(e.name) || isTree(e.name); // never gives way
    return this.feet.get(name);
  }

  makeFoot(name) {
    const a = this.assets[name];
    if (!a) return null;
    if (isTree(name)) return { hx: Math.min(0.35, a.meta.tier * 0.12), hz: Math.min(0.35, a.meta.tier * 0.12), cx: 0, cz: 0, round: true };
    const g = flatGeometry(a, 2);
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    let hx = (b.max.x - b.min.x) / 2, hz = (b.max.z - b.min.z) / 2;
    const cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
    if (PEDS.includes(name) || ANIMALS.has(name)) { const r = Math.max(0.12, Math.max(hx, hz) * 0.7); return { hx: r, hz: r, cx: 0, cz: 0, round: true }; }
    hx *= 0.9; hz *= 0.9; // mirrors, awnings and bumpers overhang: the solid body is a little smaller
    const round = Math.max(hx, hz) < 0.6 && Math.abs(hx - hz) < 0.25 * Math.max(hx, hz); // small, squat props: circles
    if (round) hx = hz = (hx + hz) / 2;
    return { hx, hz, cx, cz, round };
  }

  groundY(x, z) {
    const lx = ((x + this.half) % TILE + TILE) % TILE - TILE / 2, lz = ((z + this.half) % TILE + TILE) % TILE - TILE / 2;
    return Math.abs(lx) < 15.3 && Math.abs(lz) < 15.3 ? 0.18 : 0.0;
  }

  /** [lowest, highest] ground under a disc: the well opens at the lowest, the lip rests on the highest. */
  groundSpan(x, z, r) {
    let lo = Infinity, hi = -Infinity;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const y = this.groundY(x + dx, z + dz);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    return [lo, hi];
  }

  /** Is (x, z) inside a standing building (plus pad)? Vehicles and wanderers never go through houses. */
  blocked(x, z, pad = 1.2) {
    this.buildings ??= this.entities.filter((e) => SOLID.has(e.name));
    for (const b of this.buildings) {
      if (b.alive && !b.falling && (b.x - x) ** 2 + (b.z - z) ** 2 < (b.meta.tier * 0.85 + pad) ** 2) return true;
    }
    return false;
  }

  /** Nothing within braking distance in this car's path? Same-axis traffic queues; north-south waits for east-west. */
  clearAhead(e) {
    const m = e.mover, fx = m.axis === 'x' ? m.dir : 0, fz = m.axis === 'x' ? 0 : -m.dir;
    // level crossings: north-south traffic waits while a train is within 20 m of the crossing
    if (this.trains && m.axis !== 'x') {
      const ahead = (this.railZ - e.z) * fz;
      if (ahead > 3 && ahead < 9 + e.meta.tier) {
        for (const tr of this.trains) for (const c of tr.cars) {
          if (!c.alive || c.falling) continue;
          const dx = Math.abs(((c.x - e.x + 3 * this.half) % (2 * this.half)) - this.half);
          if (dx < 20 + (c.name === 'locomotive' ? 6.6 : 5.2)) return false;
        }
      }
    }
    this.drivers ??= this.entities.filter((q) => q.mover?.type === 'drive');
    for (const o of this.drivers) {
      if (o === e || !o.alive || o.falling || o.mover.type !== 'drive' || (m.axis === 'x' && o.mover.axis !== 'x')) continue;
      const dx = o.x - e.x, dz = o.z - e.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < e.meta.tier + o.meta.tier + 1.5 && side < (o.mover.axis === m.axis ? 1.2 : o.meta.tier + 0.6)) return false;
    }
    return true;
  }

  /** Win condition: buildings still standing. */
  buildingsLeft() {
    let n = 0;
    for (const e of this.entities) if (e.alive && BUILDINGS.has(e.name)) n++;
    return n;
  }

  /** Hidden wanderers the snack floor revives just off-screen (PLAN.md rule 2). */
  reserves() {
    for (const [name, n] of SNACKS) {
      for (let k = 0; k < n; k++) {
        this.add(name, 0, 0, 0, { type: 'wander', h: 0, v: 0, reserve: true });
        const e = this.entities.at(-1);
        e.alive = false;
        e.s = 0;
      }
    }
  }

  /** Revive a dead reserve of `name` at (x, z) heading roughly toward (tx, tz). */
  revive(name, x, z, tx, tz) {
    const e = this.entities.find((q) => !q.alive && q.name === name && q.mover?.reserve);
    if (!e || this.blocked(x, z, e.meta.tier)) return null; // never pop up inside a building
    const m = e.mover;
    Object.assign(e, { x, z, y: 0, s: 1, tilt: 0, alive: true, falling: false, vy: 0, eater: null, fallT: 0 });
    m.h = Math.atan2(-(tz - z), tx - x) + (this.r() - 0.5) * 1.2;
    m.v = name.startsWith('ped') || name === 'pigeon' || name === 'dog' ? this.r.range(1, 1.8) : this.r.range(3, 5);
    m.t = this.r() * 10;
    this.place(e);
    return e;
  }

  /** Spawn a cloned, animated entity (units, barricades, plugs). */
  spawn(name, x, z, rot = 0, extra = {}) {
    const a = this.assets[name];
    const e = makeEntity({ name, meta: a.meta, x, z, y: 0, rot, tilt: 0, tiltDir: 0, s: 1, alive: true, falling: false, vy: 0, mover: null, grounded: true, ...extra });
    e.obj = a.scene.clone();
    this.group.add(e.obj);
    e.actions = {};
    if (a.clips.length) {
      e.mixer = new THREE.AnimationMixer(e.obj);
      for (const c of a.clips) {
        const act = e.mixer.clipAction(c);
        e.actions[c.name] = act;
        if (c.name !== 'fire') act.play();
      }
      this.mixers.push(e.mixer);
    }
    if (this.aoFree?.length && a.meta.tier < 6) e.ao = this.aoFree.pop();
    this.entities.push(e);
    this.place(e);
    return e;
  }

  /**
   * Draw-call budget for animated landmarks: a ferris wheel clone is 26 meshes (wheel, gondolas, cabins) and each
   * would draw twice (colour + shadow). The clone graph stays for its AnimationMixer, but its meshes are hidden and
   * rendered through one InstancedMesh per unique geometry per model, fed from the animated world matrices.
   */
  batchClones() {
    const byKey = new Map();
    for (const e of this.entities) {
      if (!e.obj || e.unit || (e.mover && e.mover.type !== 'rail')) continue; // landmarks + trains (units etc. spawn later)
      e.batched = [];
      e.obj.updateMatrixWorld(true);
      const parts = this.cloneParts(e.name), objs = [];
      e.obj.traverse((o) => { objs.push(o); if (o.isMesh) o.visible = false; });
      // one batch per part per 40 m chunk (so batches still frustum-cull); a train is one group
      const where = e.mover ? 'train' : `${Math.floor(e.x / CHUNK)},${Math.floor(e.z / CHUNK)}`;
      for (const part of parts) {
        const key = `${e.name}|${part.key}|${where}`;
        if (!byKey.has(key)) byKey.set(key, { part, items: [] });
        byKey.get(key).items.push({ node: objs[part.node], e });
      }
    }
    // shadow side: one city-wide shadow-only batch per model part (LOD1, SHADOW_LAYER), so every ferris wheel in the
    // shadow map costs 8 draws in total instead of 8 each; owners too far away to reach the view are zeroed per frame
    const shadowKey = new Map();
    for (const { part, items } of byKey.values()) {
      const k = `${items[0].e.name}|${part.key}`;
      if (!shadowKey.has(k)) shadowKey.set(k, { part, items: [] });
      shadowKey.get(k).items.push(...items);
    }
    this.shadowBatches = [];
    for (const { part, items } of shadowKey.values()) {
      const mesh = new THREE.InstancedMesh(part.geos[1], part.mat, items.length);
      mesh.layers.set(SHADOW_LAYER);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.userData = { toyFlags: part.flags };
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      items.forEach((it, i) => { (it.e.shadowed ??= []).push({ mesh, i, o: it.node }); mesh.setMatrixAt(i, it.node.matrixWorld); });
      this.group.add(mesh);
      this.shadowBatches.push(mesh);
    }
    this.batches = [];
    for (const { part, items } of byKey.values()) {
      const mesh = new THREE.InstancedMesh(part.geos[0], part.mat, items.length);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { toyFlags: part.flags };
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      items.forEach((it, i) => { it.e.batched.push({ mesh, i, o: it.node }); mesh.setMatrixAt(i, it.node.matrixWorld); });
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.batches.push({ mesh, geos: part.geos });
    }
  }

  /**
   * A cloned model split into draw parts: every mesh hanging off the same node (a gondola, the wheel, the static
   * frame) is merged into one geometry in that node's space, per LOD. Cached per model.
   */
  cloneParts(name) {
    if (PART_CACHE.has(name)) return PART_CACHE.get(name);
    const a = this.assets[name];
    const scan = (root) => {
      root.updateMatrixWorld(true);
      const objs = [];
      root.traverse((o) => objs.push(o));
      const groups = new Map();
      for (const o of objs) {
        if (!o.isMesh) continue;
        const k = `${objs.indexOf(o.parent)}|${o.material.uuid}`;
        if (!groups.has(k)) groups.set(k, { node: objs.indexOf(o.parent), mat: o.material, flags: o.userData.toyFlags, meshes: [] });
        groups.get(k).meshes.push(o);
      }
      return groups;
    };
    const merge = (meshes) => mergeGeometries(meshes.map((o) => {
      const g = new THREE.BufferGeometry();
      for (const n of ['position', 'normal', 'uv']) if (o.geometry.attributes[n]) g.setAttribute(n, o.geometry.attributes[n].clone());
      g.setIndex(o.geometry.index ? Array.from(o.geometry.index.array) : null);
      return g.applyMatrix4(o.matrix);
    }));
    const L = [a.scene, a.lod, a.lod2].map(scan);
    const same = L.every((m) => m.size === L[0].size && [...m.keys()].every((k) => L[0].has(k)));
    const parts = [...L[0].entries()].map(([key, g]) => ({
      key, node: g.node, mat: g.mat, flags: g.flags,
      geos: same ? L.map((m) => merge(m.get(key).meshes)) : [0, 1, 2].map(() => merge(g.meshes)),
    }));
    PART_CACHE.set(name, parts);
    return parts;
  }

  /** Copy animated clone matrices into their batches (after the mixers have run). */
  syncBatches() {
    if (!this.batches) return;
    const zero = _m.makeScale(0, 0, 0), sc = this.shadowCam;
    if (sc) _frustum.setFromProjectionMatrix(_pm.multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse));
    // shadow batches are packed afresh every frame with just the owners whose (long, low-sun) shadow can reach the
    // view; the draw count shrinks to match, so far rides cost nothing in the shadow pass
    for (const m of this.shadowBatches) { m.count = 0; m.instanceMatrix.needsUpdate = true; }
    for (const e of this.batchOwners ??= this.entities.filter((q) => q.batched?.length)) {
      if (!e.batched.length) continue;
      if (!e.alive || !e.obj) {
        for (const b of e.batched) { b.mesh.setMatrixAt(b.i, zero); b.mesh.instanceMatrix.needsUpdate = true; }
        e.batched = e.shadowed = [];
        continue;
      }
      e.obj.updateMatrixWorld(true);
      for (const b of e.batched) { b.mesh.setMatrixAt(b.i, b.o.matrixWorld); b.mesh.instanceMatrix.needsUpdate = true; }
      // casts only where it always did (within 35 m of the camera, like the chunks) and only if the sun's shadow box
      // can see it at all
      const R = Math.max(e.meta.tier, e.meta.height * 0.6);
      _p.set(e.x, e.meta.height * 0.5, e.z);
      if (this.camPos && this.camPos.distanceTo(_p) - R > 35) continue;
      if (sc && !_frustum.intersectsSphere(_sphere.set(_p, R))) continue;
      for (const b of e.shadowed) b.mesh.setMatrixAt(b.mesh.count++, b.o.matrixWorld);
    }
    for (const m of this.shadowBatches) m.visible = m.count > 0;
  }

  remove(e) {
    e.alive = false;
    if (e.ao !== undefined && this.ao) { this.aoHide(e.ao); if (e.obj) this.aoFree.push(e.ao); e.ao = undefined; }
    if (e.obj) {
      this.group.remove(e.obj);
      if (e.mixer) { e.mixer.stopAllAction(); this.mixers.splice(this.mixers.indexOf(e.mixer), 1); }
      this.entities.splice(this.entities.indexOf(e), 1);
    }
  }

  /** Street furniture along the sidewalk ring + pedestrians + parked cars. */
  sidewalk(t) {
    const { r } = this;
    const { cx, cz } = t;
    for (let side = 0; side < 4; side++) {
      if (t.type === 'beach' && side === 3) continue; // the seaward (+z) edge is open water
      const yaw = side * Math.PI / 2; // side 0 = +x edge
      const ox = Math.cos(yaw), oz = -Math.sin(yaw); // outward normal
      const tx = -oz, tz = ox; // along the edge
      // rows that run edge to edge (track, runway) cross the +-x sides: keep that stretch clear
      const row = (t.type === 'rail' || t.type === 'runway') && side % 2 === 0 ? (t.type === 'rail' ? 3 : 8.5) : 0;
      for (let d = -12; d <= 12; d += 3) {
        const x = cx + ox * 14.2 + tx * d, z = cz + oz * 14.2 + tz * d;
        if (t.type === 'beach' && z - cz > 9) continue; // past the waterline
        if (Math.abs(d) < row) continue;
        if (Math.abs(d) === 12) this.add('lamp', x, z, yaw);
        else if (r() < 0.55) this.add(r.pick(SIDEWALK), x, z, yaw + (r() < 0.5 ? 0 : Math.PI));
        if (r() < 0.04) this.add('toxic_barrel', x - ox * 1.2, z - oz * 1.2, 0);
      }
      for (let d = -10; d <= 10; d += 7) {
        if (t.type === 'beach' && oz * 16 + tz * d > 9) continue;
        if (row && Math.abs(d) < row + 2) continue;
        if (r() < 0.4) this.add(r.pick(['car', 'car_b', 'taxi']), cx + ox * 16 + tx * d, cz + oz * 16 + tz * d, yaw + Math.PI / 2);
      }
    }
    if (t.type !== 'runway') for (let k = 0; k < 4; k++) this.walker(cx, cz, 13.2); // nobody strolls across a runway
  }

  walker(cx, cz, h) {
    const { r } = this;
    this.add(r.pick(PEDS), cx, cz, 0, { type: 'walk', cx, cz, h, s: r() * 8 * h, v: r.range(0.9, 1.6) * (r() < 0.5 ? 1 : -1), t: r() * 10 });
  }

  traffic() {
    const { r, N } = this;
    for (let k = 0; k <= N; k++) {
      const line = (k - N / 2) * TILE;
      for (const axis of ['x', 'z']) {
        if (this.beach && axis === 'x' && k === N) continue; // no coast road: it's sea
        for (const dir of [1, -1]) {
          const n = (1 + Math.floor(r() * 2)) * (this.mutator === 'rush' ? 2 : 1); // Rush Hour: twice the cars
          for (let c = 0; c < n; c++) {
            const lane = line + dir * 1.9; // clears the cars parked 4 m out (their bodies no longer brush)
            const along = r.range(-this.half, this.half);
            const x = axis === 'x' ? along : lane, z = axis === 'x' ? lane : along;
            this.add(r.pick(TRAFFIC), x, z, 0, { type: 'drive', axis, dir: axis === 'x' ? dir : -dir, v: r.range(5, 8) * (this.mutator === 'rush' ? 1.5 : 1) });
          }
        }
      }
    }
  }

  // ---------- build three.js objects ----------
  build() {
    const groups = new Map();
    const C = this.chunk;
    const chunkKey = (x, z) => `${Math.floor(x / C)},${Math.floor(z / C)}`;
    for (const t of this.tileEntities) {
      const k = `${t.name}|${chunkKey(t.x, t.z)}`;
      if (!groups.has(k)) groups.set(k, { name: t.name, list: [], ground: true });
      groups.get(k).list.push({ ...t, y: 0, tilt: 0, s: 1 });
    }
    for (const e of this.entities) {
      if (CLONED.has(e.name) || e.meta.clone) { // animated landmarks + pack models tagged clone=true
        const a = this.assets[e.name];
        e.obj = a.scene.clone();
        this.group.add(e.obj);
        if (a.clips.length) { // play every clip (the ferris wheel's gondolas, a loco's 16 wheels) at one timeScale
          const m = (e.mixer = new THREE.AnimationMixer(e.obj));
          e.actions = Object.fromEntries(a.clips.map((c) => [c.name, m.clipAction(c)]));
          for (const act of Object.values(e.actions)) act.play();
          this.mixers.push(m);
        }
        this.place(e);
        continue;
      }
      const roams = ROAMERS.has(e.mover?.type);
      const reserve = !!e.mover?.reserve;
      const home = e.mover?.type === 'walk' ? chunkKey(e.mover.cx, e.mover.cz) : chunkKey(e.x, e.z);
      // (Phase 2 crumbs - trees, hedges, rocks - are region-wide roaming groups, one per species variant)
      const k = roams ? `${e.name}|${reserve ? 'reserve' : 'roam'}${e.mover.v ?? ''}` : `${e.name}|${home}|${e.mover ? 'm' : 's'}`;
      if (!groups.has(k)) groups.set(k, { name: e.name, list: [], mover: !!e.mover, roams, reserve, crumb: !!e.mover?.crumb, v: e.mover?.v });
      groups.get(k).list.push(e);
    }
    this.meshes = [];
    const duckK = this.assets.rubber_duck?.meta.tier || 0.5;
    for (const g of groups.values()) {
      const a = this.assets[g.name];
      // Everything Is Ducks: every non-building prop wears the duck, sized tier / 0.5 (meta and gameplay untouched)
      const duck = this.mutator === 'ducks' && !g.ground && this.assets.rubber_duck && ['prop', 'poison', 'unit'].includes(a.meta.kind) && !SOLID.has(g.name);
      const src = duck ? this.assets.rubber_duck : a;
      if (duck) for (const e of g.list) e.gs = e.meta.tier / duckK;
      const variant = g.v ?? (this.groupCount = (this.groupCount || 0) + 1); // procedural trees differ chunk to chunk
      let full = flatGeometry(src, 0, variant), lod = flatGeometry(src, 1, variant), lod2 = flatGeometry(src, 2, variant);
      let mat = g.ground ? this.groundMat : src.material;
      // city-wide traffic can't be culled per group (it spans the whole map), so it's culled per instance: every frame
      // only what the camera or the shadow map can see is packed to the front (cullTraffic). A stable seed attribute
      // travels with each instance so its tint jitter and walk phase don't change as it's re-packed.
      let cull = null;
      if (g.roams && (src.seeded || g.crumb) && !g.ground) {
        const n = g.list.length;
        const seed = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
        if (!src.seeded || g.crumb) { // Phase 2 crumbs (vegetation, rocks, cows): keep their own material, just cull
          cull = { src: new Float32Array(n * 16), seed, reach: Math.max(a.meta.height || 1, a.meta.tier * 2) * 1.6 + 2 };
        } else {
        const wrap = (geo) => {
          const c = new THREE.BufferGeometry();
          for (const [k, v] of Object.entries(geo.attributes)) c.setAttribute(k, v); // shared buffers
          c.setIndex(geo.index);
          c.groups = geo.groups;
          c.boundingSphere = geo.boundingSphere;
          c.boundingBox = geo.boundingBox;
          c.setAttribute('iseed', seed);
          return c;
        };
        [full, lod, lod2] = [full, lod, lod2].map(wrap);
        mat = src.seeded;
        const reach = Math.max(a.meta.height || 1, a.meta.tier * 2) * 0.75 + 1.5; // generous: bounds + a frame of motion
        cull = { src: new Float32Array(n * 16), seed, reach };
        }
      }
      // buildings crumble: their own copy of the geometries carries part centres and a per-instance crumble slot
      let crumble = null;
      if (!g.roams && !g.ground && !duck && CRUMBLES.has(g.name) && !a.clips.length) {
        crumble = new THREE.InstancedBufferAttribute(new Float32Array(g.list.length * 4), 4).setUsage(THREE.DynamicDrawUsage);
        const wrap = (geo) => {
          const c = new THREE.BufferGeometry();
          for (const [k, v] of Object.entries(geo.attributes)) c.setAttribute(k, v);
          c.setAttribute('aPart', partCentres(geo));
          c.setAttribute('aCrumble', crumble);
          c.setIndex(geo.index);
          c.groups = geo.groups;
          c.boundingSphere = geo.boundingSphere;
          c.boundingBox = geo.boundingBox;
          return c;
        };
        [full, lod, lod2] = [full, lod, lod2].map(wrap);
        mat = crumbleMat ??= crumbleMaterial();
      }
      const mesh = new THREE.InstancedMesh(full, mat, g.list.length);
      mesh.castShadow = !g.ground;
      mesh.receiveShadow = true;
      // list: groups whose members can all be asleep or gone (snack reserves, dormant event crowds, eaten props) are
      // skipped entirely - zero-scale instances still cost their triangles and a shadow pass
      mesh.userData = { geos: [full, lod, lod2], full, tier: g.ground ? Infinity : a.meta.tier, ground: !!g.ground, roams: g.roams, list: g.ground ? null : g.list, toyFlags: a.flags, cull, crumb: g.crumb, crumble };
      g.list.forEach((e, i) => { e.mesh = mesh; e.index = i; this.place(e); });
      mesh.instanceMatrix.setUsage(g.mover ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
      if (g.roams) mesh.frustumCulled = false;
      else {
        mesh.computeBoundingSphere();
        if (g.mover) mesh.boundingSphere.radius += 16; // walkers loop around their tile
      }
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.batchClones();
    this.buildScenery();
    this.shadowProxies();
    // what the grass mask pass rasterises (src/grass.js)
    const lawnMask = groundMaskMaterial(0, 1);
    this.groundMeshes = this.meshes.filter((m) => m.userData.ground);
    for (const m of this.groundMeshes) m.userData.grassMask = lawnMask;
    this.groundMeshes.push(this.field); // terrain brings its own meadow mask
    // contact shadows under every small/medium thing (buildings already cast real shadows)
    const aoList = this.entities.filter((e) => e.meta.tier < 6 && !e.mover?.crumb); // (Phase 2 crumbs: too many, too small)
    this.ao = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), aoMaterial(this.holeField), aoList.length + 64);
    this.ao.frustumCulled = false;
    this.ao.renderOrder = 1;
    this.aoFree = [];
    aoList.forEach((e, i) => { e.ao = i; });
    for (let i = aoList.length; i < aoList.length + 64; i++) { this.aoFree.push(i); this.aoHide(i); }
    for (const e of aoList) this.placeAO(e);
    this.group.add(this.ao);
    this.dirty.clear();
  }

  aoHide(i) {
    this.ao.setMatrixAt(i, _m.makeScale(0, 0, 0));
    this.dirty.add(this.ao);
  }

  placeAO(e) {
    if (!this.ao) return;
    if (!e.alive || e.falling || !e.s || e.y > 1.5 || e.clog > 0) { this.aoHide(e.ao); return; }
    const r = e.meta.tier * 2.1 * e.s;
    _p.set(e.x, this.groundY(e.x, e.z) + 0.03, e.z);
    _s.set(r, 1, r);
    this.ao.setMatrixAt(e.ao, _m.compose(_p, _q.identity(), _s));
    this.dirty.add(this.ao);
  }

  buildScenery() {
    if (this.pierAt) this.sceneryList.push({ name: 'pier', x: this.pierAt[0], y: 0, z: this.pierAt[1], rot: 0 });
    const groups = new Map();
    for (const it of this.sceneryList) {
      const e = { ...it, tilt: 0, s: it.s ?? 1 };
      if (this.assets[it.name].clips.length) { // windmills turn
        e.obj = this.assets[it.name].scene.clone();
        const m = new THREE.AnimationMixer(e.obj);
        this.assets[it.name].clips.forEach((cl) => m.clipAction(cl).play());
        this.mixers.push(m);
        this.group.add(e.obj);
        this.place(e);
        continue;
      }
      const k = `${it.name}|${Math.floor(it.x / 120)},${Math.floor(it.z / 120)}`;
      if (!groups.has(k)) groups.set(k, { name: it.name, list: [] });
      groups.get(k).list.push(e);
    }
    for (const g of groups.values()) {
      const a = this.assets[g.name];
      const variant = (this.groupCount = (this.groupCount || 0) + 1);
      const geos = [0, 1, 2].map((l) => flatGeometry(a, l, variant));
      const mesh = new THREE.InstancedMesh(geos[0], a.material, g.list.length);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { geos, tier: Infinity, scenery: true, toyFlags: a.flags };
      g.list.forEach((e, i) => { e.mesh = mesh; e.index = i; this.place(e); });
      mesh.computeBoundingSphere();
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.group.add(this.terrain.group);
    this.field = this.terrain.mesh;
    // drifting clouds
    const n = 14;
    // clouds are never seen from the game camera, only their soft shadows drifting over town
    const cloudMat = new THREE.MeshBasicNodeMaterial({ colorWrite: false, depthWrite: false });
    this.clouds = new THREE.InstancedMesh(flatGeometry(this.assets.cloud, 2), cloudMat, n);
    this.clouds.frustumCulled = false;
    this.clouds.castShadow = true;
    this.cloudList = Array.from({ length: n }, (_, i) => ({
      x: this.r.range(-600, 600), z: this.r.range(-600, 600), y: this.r.range(70, 95), s: this.r.range(2.5, 4.5), rot: this.r() * 6.28, tilt: 0, v: this.r.range(1, 2.5),
      mesh: this.clouds, index: i,
    }));
    this.cloudList.forEach((c) => this.place(c));
    this.group.add(this.clouds);
  }

  /** Per-frame render budget: LOD by distance, drop shadows and hide what is too small to see. */
  budget(camera, holeR, lowSpec = false) {
    const K = this.lodScale ? this.lodScale(holeR) : 1; // Phase 2: distances grow with the hole (region.js)
    const near = lowSpec ? -1 : LOD_DIST[0] * K; // low-spec devices never draw LOD0
    // batched landmarks: LOD and shadows by distance like the chunks; bounds refit now and then (they spin, trains move)
    const refit = (this.batchT = (this.batchT || 0) + 1) % 15 === 1;
    const lodOf = (d) => (d > LOD_DIST[1] * K ? 2 : d > near ? 1 : 0);
    const castD = 35 * K;
    for (const b of this.batches || []) {
      const m = b.mesh;
      if (refit) m.computeBoundingSphere();
      const d = camera.position.distanceTo(m.boundingSphere.center) - m.boundingSphere.radius;
      m.geometry = b.geos[lodOf(d)];
      m.castShadow = false; // cast through the city-wide shadow batches (batchClones)
    }
    this.camPos = camera.position;

    for (const m of this.meshes) {
      const u = m.userData;
      if (u.ground) {
        m.geometry = u.full;
        // pick the cutting material only where an open hole overlaps this chunk (with a margin for its growth)
        let cut = false;
        const c = m.boundingSphere.center, R = m.boundingSphere.radius;
        for (const h of this.holeField.value) if (h.z > 0 && (h.x - c.x) ** 2 + (h.y - c.z) ** 2 < (R + h.z + 2) ** 2) { cut = true; break; }
        m.material = cut ? this.groundMat : this.groundSolid;
        continue;
      }
      if (u.scenery) {
        const d = camera.position.distanceTo(m.boundingSphere.center) - m.boundingSphere.radius;
        m.geometry = u.geos[lodOf(d)];
        this.caster(m, u.geos, lodOf(d), d < castD);
        continue;
      }
      m.visible = u.tier >= holeR * (this.tinyK ?? 0.03) && (!u.list || u.list.some((e) => e.alive)); // idle pools and eaten groups cost nothing
      // roaming traffic spans the whole city, so it can't be distance-LOD'd per instance: mid detail, low when zoomed out
      const d = u.crumb ? (holeR > 16 ? 999 : 30 * K) : u.roams ? (holeR > 4 ? 999 : 30) : camera.position.distanceTo(m.boundingSphere.center) - m.boundingSphere.radius;
      m.geometry = u.geos[lodOf(d)];
      // Shadow pass budget: only near chunks cast; city-wide movers (never culled) cast only up close; Phase 2 crumbs
      // (trees, hedges) keep casting while they're still a visible fraction of the hole
      const casts = u.crumb ? u.tier >= holeR * 0.07 : u.tier >= holeR * 0.12 && !(u.roams ? holeR > 2.5 : d > castD);
      this.caster(m, u.geos, lodOf(d), m.visible && casts);
    }
  }

  /**
   * Per-instance culling for city-wide traffic (after the shadow camera has moved this frame): each roaming group
   * draws only the members inside the view frustum, or inside the shadow frustum while its shadow stand-in casts.
   */
  cullTraffic(camera) {
    camera.updateMatrixWorld();
    _cm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _fv.setFromProjectionMatrix(_cm, camera.coordinateSystem);
    const sc = this.shadowCam;
    if (sc) {
      sc.updateMatrixWorld();
      _cm.multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse);
      _fs.setFromProjectionMatrix(_cm, sc.coordinateSystem);
    }
    this.cullCrumbs(sc);
    for (const m of this.meshes) {
      const u = m.userData, c = u.cull;
      if (!c || !m.visible || u.crumb) continue;
      const casts = !!(sc && u.proxy?.visible);
      const out = m.instanceMatrix.array, seeds = c.seed.array, list = u.list;
      let k = 0;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive || !e.s) continue;
        _sph.center.set(e.x, e.y + 1 + (e.gy || 0), e.z); // (gy: Phase 2 ground height, region.js)
        _sph.radius = c.reach;
        if (!_fv.intersectsSphere(_sph) && !(casts && _fs.intersectsSphere(_sph))) continue;
        out.set(c.src.subarray(i * 16, i * 16 + 16), k * 16);
        seeds[k++] = i;
      }
      m.count = k;
      if (u.proxy) u.proxy.count = k;
      upload(m.instanceMatrix, k * 16);
      upload(c.seed, k);
    }
  }

  /**
   * Phase 2 crumbs (tens of thousands of static trees, hedges, rocks): bucketed once into 128 m cells; each frame only
   * the cells in the view or shadow frustum are tested and packed (per-instance tests were 2+ ms a frame).
   */
  cullCrumbs(sc) {
    const groups = this.meshes.filter((m) => m.userData.crumb && m.userData.cull);
    if (!groups.length) return;
    if (!this.crumbCells) {
      const cells = new Map(), C = 128;
      for (const m of groups) {
        m.userData.list.forEach((e, i) => {
          const k = Math.floor(e.x / C) * 4096 + Math.floor(e.z / C);
          let cell = cells.get(k);
          if (!cell) cells.set(k, (cell = { box: new THREE.Box3(new THREE.Vector3(Math.floor(e.x / C) * C, Infinity, Math.floor(e.z / C) * C), new THREE.Vector3(Math.floor(e.x / C) * C + C, -Infinity, Math.floor(e.z / C) * C + C)), lists: new Map() }));
          cell.box.min.y = Math.min(cell.box.min.y, e.gy - 2);
          cell.box.max.y = Math.max(cell.box.max.y, e.gy + (e.meta.height || 5) + 2);
          if (!cell.lists.has(m)) cell.lists.set(m, []);
          cell.lists.get(m).push(i);
        });
      }
      for (const cell of cells.values()) cell.box.expandByScalar(4);
      this.crumbCells = [...cells.values()];
    }
    const vis = this.crumbCells.filter((cell) => _fv.intersectsBox(cell.box) || (sc && _fs.intersectsBox(cell.box)));
    for (const m of groups) {
      if (!m.visible) { m.count = 0; continue; }
      const u = m.userData, c = u.cull, out = m.instanceMatrix.array, seeds = c.seed.array, list = u.list;
      let k = 0;
      for (const cell of vis) {
        const idx = cell.lists.get(m);
        if (!idx) continue;
        for (const i of idx) {
          const e = list[i];
          if (!e.alive || !e.s) continue;
          out.set(c.src.subarray(i * 16, i * 16 + 16), k * 16);
          seeds[k++] = i;
        }
      }
      m.count = k;
      if (u.proxy) u.proxy.count = k;
      upload(m.instanceMatrix, k * 16);
      upload(c.seed, k);
    }
  }

  /**
   * Who casts, and from what: a mesh drawn at full detail (LOD0) casts through its shadow stand-in at LOD1 - same
   * silhouette at shadow-map resolution, a quarter of the triangles in the shadow pass. Farther LODs cast as drawn.
   */
  caster(m, geos, lod, cast) {
    const p = m.userData.proxy;
    if (!p) { m.castShadow = cast; return; }
    m.castShadow = false;
    p.visible = cast;
    if (cast) p.geometry = geos[p.userData.sameLod ? lod : Math.max(1, lod)];
  }

  /**
   * Shadow-only stand-ins: an InstancedMesh per group on SHADOW_LAYER that shares the group's instance matrices (one
   * buffer, no copies) so the shadow pass can use a coarser LOD than the view. Trees and bushes cast from the LOD
   * they are drawn at (leaf-card shadows would thin out), through their single shadow material (vegetation.js).
   */
  shadowProxies() {
    const make = (m, geos) => {
      const tree = Array.isArray(m.material);
      if ((tree && !m.material.shadow) || !geos || geos[0] === geos[1]) return;
      const p = new THREE.InstancedMesh(geos[1], tree ? m.material.shadow : m.material, m.count);
      p.userData.sameLod = tree;
      p.instanceMatrix = m.instanceMatrix;
      p.count = m.count;
      p.layers.set(SHADOW_LAYER);
      p.castShadow = true;
      p.receiveShadow = false;
      p.frustumCulled = m.frustumCulled;
      if (!m.boundingSphere) m.computeBoundingSphere();
      p.boundingSphere = m.boundingSphere;
      p.userData.toyFlags = m.userData.toyFlags;
      p.visible = false;
      m.userData.proxy = p;
      this.group.add(p);
    };
    for (const m of this.meshes) if (!m.userData.ground) make(m, m.userData.geos);
  }

  dispose() {
    for (const m of this.meshes) m.dispose();
    for (const b of this.batches || []) b.mesh.dispose();
    for (const m of this.meshes) m.userData.proxy?.dispose();
    for (const m of this.shadowBatches || []) m.dispose();
    this.clouds.dispose();
    this.ao.dispose();
    this.ao.material.dispose();
    this.terrain.dispose();
    for (const mx of this.mixers) mx.stopAllAction();
    this.groundMat.dispose();
    this.groundSolid.dispose();
  }

  /** Write an entity's transform to its instance slot or cloned object. */
  place(e) {
    _q.setFromAxisAngle(UP, e.rot);
    if (e.tilt) {
      // tip the top toward the hole center: axis = up x (direction to hole)
      _ax.set(-Math.sin(e.tiltDir), 0, Math.cos(e.tiltDir));
      _q.premultiply(_qt.setFromAxisAngle(_ax, e.tilt));
    }
    // city entities stand on the local surface: blocks and sidewalks are 0.18 m above the road (e.y is relative to it)
    e.gy = e.grounded ? this.groundY(e.x, e.z) : 0;
    _p.set(e.x, e.y + e.gy, e.z);
    _s.setScalar(e.s * (e.gs || 1));
    if (e.obj) {
      e.obj.position.copy(_p);
      e.obj.quaternion.copy(_q);
      e.obj.scale.copy(_s);
      if (e.ao !== undefined) this.placeAO(e);
      return;
    }
    const cull = e.mesh.userData.cull;
    if (cull) _m.compose(_p, _q, _s).toArray(cull.src, e.index * 16); // packed into the mesh by cullTraffic
    else {
      e.mesh.setMatrixAt(e.index, _m.compose(_p, _q, _s));
      this.dirty.add(e.mesh);
    }
    if (e.ao !== undefined) this.placeAO(e);
  }

  /** Movers + falling + swallow checks. Returns list of entities consumed this frame. */
  /** holes[0] is the player (flee/clog react to it); every visible hole can swallow. jammed = player can't eat. */
  update(dt, holes, jammed = false) {
    const hole = holes[0];
    const eaten = [];
    this.events = [];
    const H = this.half;
    if (this.trains) { for (const tr of this.trains) this.placeTrain(tr, dt); this.trains = this.trains.filter((tr) => !tr.dead); }
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (!e.alive) continue;
      const m = e.mover;
      if (e.falling) {
        this.fall(e, dt, e.eater || hole, eaten);
        continue;
      }
      if (e.clog > 0) { // stuck across the hole, rocking on the rim, then rolls off (PLAN.md rule 3: <=1.5s)
        e.clog -= dt;
        e.tilt = e.clog > 0 ? 0.08 + Math.sin(e.clog * 22) * 0.05 : 0; // rocks on top: never sinks into the ground
        e.y = e.clog > 0 ? Math.abs(Math.sin(e.clog * 22)) * 0.06 : 0;
        e.clogCool = 4;
        this.place(e);
        continue;
      }
      e.clogCool = Math.max(0, (e.clogCool || 0) - dt);
      const tier0 = e.meta.tier;
      if (hole.vac > 0 && !jammed && !hole.hidden && !e.noSwallow && !e.flying && e.meta.kind === 'prop' && tier0 < hole.r * 0.6) {
        // whirlpool: right after a swallow, small things nearby spiral into the player's hole
        // tuned to help small holes chain (fixed reach bonus) without snowballing big ones (weaker pull)
        const dx = hole.x - e.x, dz = hole.z - e.z, d = Math.hypot(dx, dz) || 1e-3, reach = (hole.r * (1.4 + hole.vac * 0.5) + 1.2) * (hole.reach || 1);
        if (d < reach) {
          const f = Math.min(1, hole.vac) * Math.sqrt(1 - d / reach) / (1 + hole.r * 0.12), pull = (3 + hole.r * 2.5) * f, swirl = (4 + hole.r * 3) * f;
          e.x += ((dx * pull + dz * swirl) / d) * dt; // inward + tangential
          e.z += ((dz * pull - dx * swirl) / d) * dt;
          e.rot += (swirl / Math.max(0.3, tier0)) * dt * 0.6;
          e.tilt = Math.min(0.35, f * 0.45);
          e.tiltDir = Math.atan2(-dz, -dx);
          if (m && (m.type === 'walk' || m.type === 'drive')) e.mover = { type: 'wander', h: e.rot, v: m.type === 'walk' ? 1.4 : 4, t: m.t }; // no snapping back to a path
          e.sucked = 0.3;
          e.looseT = 3; // dragged: collides with what it's dragged into for a while after
          this.place(e);
        }
      }
      if (e.sucked > 0) {
        e.sucked -= dt;
        if (e.sucked <= 0) { e.tilt = 0; this.place(e); }
      } else if (!e.mover && tier0 >= hole.r * 0.95 && tier0 < hole.r * 2.5 && !hole.hidden) {
        // too big: it trembles while the hole tugs at it (trees show their roots in the void)
        const under = (hole.x - e.x) ** 2 + (hole.z - e.z) ** 2 < (hole.r * 0.9) ** 2;
        if (under) {
          if (!e.tug) this.events.push({ type: 'tooBig', e });
          e.tug = (e.tug || 0) + dt;
          e.tilt = Math.abs(Math.sin(e.tug * 26)) * 0.03;
          e.tiltDir = Math.atan2(hole.z - e.z, hole.x - e.x);
          this.place(e);
        } else if (e.tug) { e.tug = 0; e.tilt = 0; this.place(e); }
      }
      if (e.hiding > 0) { // ducking into a building: gone (not eaten)
        e.hiding -= dt;
        e.s = Math.max(0, e.hiding / 0.5);
        if (e.hiding <= 0) { e.alive = false; e.s = 0; }
        this.place(e);
        continue;
      }
      if (m && !(e.sucked > 0)) {
        m.t += dt;
        // anything the hole could eat panics when it gets close; the hotter the city, the earlier they notice
        const alarm = this.alarm || 0;
        const fdx = e.x - hole.x, fdz = e.z - hole.z, near = fdx * fdx + fdz * fdz < ((hole.r * 2.2 + 3) * (1 + alarm * 0.3)) ** 2;
        e.panic = Math.max(0, (e.panic || 0) - dt);
        const scared = (near && e.meta.tier < hole.r * 0.95 && e.meta.tier < 0.8) || e.panic > 0;
        // evacuation (heat 2+): frightened people get off the street and into the nearest doorway
        if (scared && alarm >= 2 && (m.type === 'walk' || m.type === 'wander' || m.type === 'loop') && e.meta.tier < 0.6 && !e.name.startsWith('pigeon')) {
          e.hideT = (e.hideT || 0) + dt;
          if (e.hideT > 1.2 && Math.random() < dt * (alarm - 1) * 0.35) { e.hiding = 0.5; this.events.push({ type: 'hid', e }); }
        }
        if (scared && !e.wasScared && (m.type === 'walk' || m.type === 'loop')) { // a shout, and the panic spreads to people close by
          if (Math.random() < 0.5) this.events.push({ type: 'scream', e });
          for (const o of this.walkers ??= this.entities.filter((q) => q.mover?.type === 'walk' || q.mover?.type === 'loop')) {
            if (o !== e && o.alive && !(o.panic > 0) && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 16) o.panic = 2.5;
          }
        }
        e.wasScared = scared;
        if (e.cheer > 0 && !scared && (m.type === 'walk' || m.type === 'loop')) { // the parade goes by: stop and cheer
          e.cheer -= dt;
          e.y = Math.abs(Math.sin(m.t * 11)) * 0.22;
          e.tilt = 0;
        } else if (m.type === 'walk') {
          if (scared) {
            const [dx0, dz0] = WALK_DIR[Math.floor(m.s / (2 * m.h))];
            const away = dx0 * fdx + dz0 * fdz >= 0 ? 1 : -1; // run the way that leads away
            m.v = away * Math.max(Math.abs(m.v), 2.6);
          } else if (Math.abs(m.v) > 1.6) m.v *= 1 - dt * 0.5;
          m.s = (m.s + m.v * dt + 8 * m.h * 100) % (8 * m.h);
          const side = Math.floor(m.s / (2 * m.h)), u = (m.s % (2 * m.h)) - m.h;
          const P = [[m.h, u], [-u, m.h], [-m.h, -u], [u, -m.h]][side];
          e.x = m.cx + P[0] + (e.ox || 0); // (+ a side-step when something is in the way: src/collide.js)
          e.z = m.cz + P[1] + (e.oz || 0);
          const [dx, dz] = WALK_DIR[side], sg = Math.sign(m.v);
          e.rot = Math.atan2(-dz * sg, dx * sg);
          const w = m.t * 9 * Math.abs(m.v);
          e.y = Math.abs(Math.sin(w)) * 0.07; // the toy waddle-hop
          e.tilt = 0;
          e.rot += Math.sin(w) * 0.12;
        } else if (m.type === 'drive') {
          // stop for people, animals and loose things in the lane; after 3 s of waiting, creep on (they get nudged aside)
          const fx = m.axis === 'x' ? m.dir : 0, fz = m.axis === 'x' ? 0 : -m.dir;
          const someone = this.collide.obstacleAhead(e, fx, fz, e.meta.tier + 1.5 + (m.cur ?? m.v) * 0.35, e.shp ? e.shp.hz : e.meta.tier * 0.5);
          m.wait = someone ? (m.wait || 0) + dt : 0;
          const go = this.clearAhead(e) && !(someone && m.wait < 3);
          m.cur = Math.max(0, Math.min(someone && m.wait >= 3 ? 1.5 : m.v, (m.cur ?? m.v) + (go ? 4 : -14) * dt)); // ease off / brake
          const d = m.cur * m.dir * dt;
          // the hole in the lane ahead: honk and swerve a little (eases back; stays inside clearAhead's lane width)
          m.lane ??= m.axis === 'x' ? e.z : e.x;
          if (m.inset === undefined && e.shp) { // wide vehicles (buses, vans) ride nearer the centre line, clear of parked cars
            m.inset = Math.max(0, e.shp.hz - 0.85);
            const line = Math.round((m.lane + H) / TILE) * TILE - H;
            m.lane = line + Math.sign(m.lane - line) * (1.9 - m.inset);
          }
          const fwd = m.axis === 'x' ? (hole.x - e.x) * m.dir : (e.z - hole.z) * m.dir, lat = m.axis === 'x' ? hole.z - m.lane : hole.x - m.lane;
          const danger = !hole.hidden && fwd > 0 && fwd < 12 + hole.r && Math.abs(lat) < hole.r + 1.4;
          m.off = (m.off || 0) + ((danger ? -Math.sign(lat || 1) * 1.0 : 0) - (m.off || 0)) * Math.min(1, dt * 3);
          if (danger && !(m.honk > 0) && e.meta.tier >= 1) { m.honk = 4; this.events.push({ type: 'honk', e, d: fwd }); }
          m.honk = (m.honk || 0) - dt;
          if (m.axis === 'x') e.z = m.lane + m.off; else e.x = m.lane + m.off;
          if (m.axis === 'x') { e.x += d; if (e.x > H) e.x -= 2 * H; if (e.x < -H) e.x += 2 * H; e.rot = m.dir > 0 ? 0 : Math.PI; }
          else { // north-south roads stop at the shoreline on seaside maps and at the runway on airport maps
            const top = this.beach ? H - 10 : H, bot = this.runwayRow >= 0 ? -H + 35 : -H;
            e.z -= d; if (e.z > top) e.z -= top - bot; if (e.z < bot) e.z += top - bot; e.rot = m.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
          e.y = Math.abs(Math.sin(m.t * 7)) * 0.03;
        } else if (m.type === 'wander') {
          if (scared) m.h = Math.atan2(-fdz, fdx) + Math.sin(m.t * 3) * 0.3; // run from the hole
          else m.h += Math.sin(m.t * 0.7 + e.x) * dt * 0.6;
          const WB = this.bound || H; // (Phase 2: the whole region)
          if (Math.abs(e.x) > WB - 4 || Math.abs(e.z) > WB - 4) m.h = Math.atan2(e.z, -e.x); // steer back to town
          const nx = e.x + Math.cos(m.h) * m.v * dt, nz = e.z - Math.sin(m.h) * m.v * dt;
          if (this.blocked(nx, nz, e.meta.tier)) m.h += Math.PI * (0.5 + this.r() * 0.5); // bounce off walls, never walk through
          else { e.x = nx; e.z = nz; }
          e.rot = m.h;
          const w = m.t * 9;
          e.y = e.meta.tier < 0.3 ? Math.abs(Math.sin(w)) * 0.07 : Math.abs(Math.sin(m.t * 7)) * 0.03;
        } else if (m.type === 'loop') { // fairground crowd: a circle round the promenade
          if (scared) {
            const tang = -Math.sin(m.a) * fdx + Math.cos(m.a) * -fdz; // +v moves along (-sin a, cos a) in (x, -z)
            m.v = (tang >= 0 ? 1 : -1) * Math.max(Math.abs(m.v), 2.6);
          } else if (Math.abs(m.v) > 1.6) m.v *= 1 - dt * 0.5;
          m.a += (m.v / m.R) * dt;
          e.x = m.cx + Math.cos(m.a) * m.R + (e.ox || 0);
          e.z = m.cz - Math.sin(m.a) * m.R + (e.oz || 0);
          e.rot = m.a + Math.sign(m.v) * Math.PI / 2;
          const w = m.t * 9 * Math.abs(m.v);
          e.y = Math.abs(Math.sin(w)) * 0.07;
          e.rot += Math.sin(w) * 0.12;
        } else if (m.type === 'rink') { // bumper cars: bounce round a 4 m circle, never leave it
          m.h += Math.sin(m.t * 1.3 + e.x) * dt * 1.2;
          let nx = e.x + Math.cos(m.h) * m.v * dt, nz = e.z - Math.sin(m.h) * m.v * dt;
          const ox = nx - m.cx, oz = nz - m.cz;
          if (ox * ox + oz * oz > m.R * m.R) { m.h = Math.atan2(oz, -ox) + (this.r() - 0.5) * 0.8; m.bump = 0.25; nx = e.x; nz = e.z; }
          e.x = nx; e.z = nz;
          m.bump = Math.max(0, (m.bump || 0) - dt);
          e.rot = m.h + Math.sin(m.bump * 40) * 0.2;
          e.y = Math.abs(Math.sin(m.t * 9)) * 0.02;
        } else if (m.type === 'taxi') { // the airliner rolls up and down its runway, pausing and turning at the ends
          if (m.pause > 0) {
            m.pause -= dt;
            const want = m.dir > 0 ? 0 : Math.PI;
            e.rot += Math.atan2(Math.sin(want - e.rot), Math.cos(want - e.rot)) * Math.min(1, dt * 0.8);
          } else {
            e.x += m.v * m.dir * dt;
            if ((m.dir > 0 && e.x > m.x1) || (m.dir < 0 && e.x < m.x0)) { m.dir = -m.dir; m.pause = 10; }
          }
          e.z = m.z;
          e.y = 0;
        } else if (m.type === 'apron') { // baggage trains: a rectangle round the runway verges
          const P = 4 * (m.hx + m.hz);
          m.s = (m.s + m.v * dt + P) % P;
          let u = m.s, x, z, h;
          if (u < 2 * m.hx) { x = -m.hx + u; z = -m.hz; h = 0; }
          else if ((u -= 2 * m.hx) < 2 * m.hz) { x = m.hx; z = -m.hz + u; h = -Math.PI / 2; }
          else if ((u -= 2 * m.hz) < 2 * m.hx) { x = m.hx - u; z = m.hz; h = Math.PI; }
          else { u -= 2 * m.hx; x = -m.hx; z = m.hz - u; h = Math.PI / 2; }
          e.x = m.cx + x;
          e.z = m.cz + z;
          e.rot += Math.atan2(Math.sin(h - e.rot), Math.cos(h - e.rot)) * Math.min(1, dt * 4);
          e.y = Math.abs(Math.sin(m.t * 7)) * 0.02;
        } else if (m.type === 'field') { // tractors: slow wander that stays on its home tile
          m.h += Math.sin(m.t * 0.4 + e.z) * dt * 0.4;
          if (Math.abs(e.x - m.cx) > 12 || Math.abs(e.z - m.cz) > 12) m.h = Math.atan2(-(m.cz - e.z), m.cx - e.x);
          const nx = e.x + Math.cos(m.h) * m.v * dt, nz = e.z - Math.sin(m.h) * m.v * dt;
          if (this.blocked(nx, nz, e.meta.tier * 0.8)) m.h += Math.PI * (0.5 + this.r() * 0.5);
          else { e.x = nx; e.z = nz; }
          e.rot = m.h;
          e.y = Math.abs(Math.sin(m.t * 11)) * 0.03;
        } else if (m.type === 'parade') {
          this.moveParade(e, dt);
          continue;
        } else if (m.type === 'jog') { // marathon: a rectangle of roads, each runner in their own line
          if (scared) {
            const [, , dx, dz] = perimeter(m, m.s);
            m.v = (dx * fdx + dz * fdz >= 0 ? 1 : -1) * Math.max(Math.abs(m.v), 4.5); // run the way that leads away
          } else if (Math.abs(m.v) > 3.8) m.v *= 1 - dt * 0.4;
          m.s += m.v * dt;
          const [x, z, dx, dz] = perimeter(m, m.s);
          e.x = x + -dz * m.lat + (e.ox || 0);
          e.z = z + dx * m.lat + (e.oz || 0);
          e.rot = Math.atan2(-dz * Math.sign(m.v), dx * Math.sign(m.v));
          e.y = Math.abs(Math.sin(m.t * 11)) * 0.08;
        } else if (m.type === 'show') { // car show: ride the turntable's spinning plate
          const tt = m.tt;
          if (!tt.alive || tt.falling || !tt.obj) { e.mover = null; e.y = 0; }
          else {
            m.top ??= tt.obj.getObjectByName('turntable_top');
            if (m.top) { m.top.getWorldQuaternion(_qt); e.rot = 2 * Math.atan2(_qt.y, _qt.w); }
            e.x = tt.x; e.z = tt.z; e.y = tt.y + 0.36 * tt.s; e.s = tt.s;
          }
        } else if (m.type === 'tumble') { // knocked loose (blast, fireworks hop, quake): fly, bounce, settle
          e.x += m.vx * dt; e.z += m.vz * dt;
          const f = Math.max(0, 1 - dt * 2.5);
          m.vx *= f; m.vz *= f;
          m.vy -= 9.8 * dt;
          e.y += m.vy * dt;
          if (e.y <= m.y0) { e.y = m.y0; m.vy = m.vy < -2 ? -m.vy * 0.3 : 0; }
          e.rot += m.spin * dt;
          m.spin *= Math.max(0, 1 - dt * 2);
          e.tilt = Math.min(0.5, Math.abs(m.spin) * 0.03);
          if (m.t > 1.6 && e.y <= m.y0 + 1e-3 && Math.hypot(m.vx, m.vz) < 0.3) { e.mover = m.prev ?? null; e.tilt = 0; e.y = m.y0; e.looseT = 3; }
        } else if (m.type === 'domino') { // a neighbour fell: rock, and sometimes topple toward the hole and slide
          e.tiltDir = m.dir;
          if (!m.topple || m.t < 0.9) {
            e.tilt = Math.sin(m.t * 16) * 0.05 * Math.max(0, 1 - m.t / 0.9);
            if (m.t >= 0.9 && !m.topple) { e.tilt = 0; e.mover = null; }
          } else {
            const k = Math.min(1, (m.t - 0.9) / 0.8), sl = Math.min(1, Math.max(0, (m.t - 1.5) / 0.6));
            e.tilt = 1.22 * k * k; // 70 degrees over 0.8 s
            e.x = m.x0 + Math.cos(m.dir) * 1.5 * sl;
            e.z = m.z0 + Math.sin(m.dir) * 1.5 * sl;
            if (m.t > 2.2) m.type = 'fallen';
          }
        } else if (m.type === 'fallen') { // lies where it toppled (same tier, new pose)
        } else if (m.type === 'rail') { // placed by placeTrain before this loop
        } else if (m.type === 'scuttle') { // crabs: sideways dashes along the waterline
          e.x = m.x0 + Math.sin(m.t * 1.4) * 1.6 + (scared ? Math.sign(fdx || 1) * 2 : 0);
          e.y = Math.abs(Math.sin(m.t * 12)) * 0.02;
        } else if (m.type === 'bob') {
          e.y = m.base + Math.sin(m.t * 1.6) * 0.06;
          e.rot += Math.sin(m.t * 0.9) * 0.002;
        } else if (m.type === 'peck' && scared) { // pigeons scatter with little flapping hops
          const d = Math.hypot(fdx, fdz) || 1;
          e.x += (fdx / d) * 3.5 * dt;
          e.z += (fdz / d) * 3.5 * dt;
          e.rot = Math.atan2(-fdz, fdx);
          e.y = Math.abs(Math.sin(m.t * 14)) * 0.35;
        } else if (m.type === 'peck') {
          e.y = Math.max(0, Math.sin(m.t * 3)) * 0.02;
          e.s = 1;
          e.rot += Math.sin(m.t * 1.3) * 0.01;
        }
        this.place(e);
      }
      if (e.noSwallow) continue;
      // forgiving rim: something the player can swallow that overlaps the rim is drawn in toward the middle
      // (never poison, never things too big; static props and strollers only, traffic still has to be caught)
      if (!jammed && !hole.hidden && !e.flying && e.meta.kind !== 'poison' && tier0 < hole.r * 0.95 && (!m || m.type === 'walk' || m.type === 'wander' || m.type === 'peck' || m.type === 'loop')) {
        const rdx = hole.x - e.x, rdz = hole.z - e.z, rd = Math.hypot(rdx, rdz), edge = hole.r * (hole.pull || 1) + tier0 * 0.7;
        if (rd < edge && rd > 1e-3) {
          const step = Math.min(rd, (1.5 + hole.r * 1.6) * dt);
          e.x += (rdx / rd) * step;
          e.z += (rdz / rd) * step;
          if (m && m.type !== 'wander' && m.type !== 'peck') e.mover = { type: 'wander', h: e.rot, v: 1.2, t: m.t };
          e.looseT = 3;
          this.place(e);
        }
      }
      // clog: a vehicle a bit too big rolls over the middle of the hole and wedges in
      if (!jammed && (m?.type === 'drive' || m?.type === 'wander') && !e.clogCool && e.meta.tier >= hole.r * 0.95 && e.meta.tier < hole.r * 1.4
        && (e.x - hole.x) ** 2 + (e.z - hole.z) ** 2 < (hole.r * 0.5) ** 2) {
        e.clog = 1.5;
        e.tiltDir = Math.atan2(e.z - hole.z, e.x - hole.x);
        this.events.push({ type: 'clog', e });
        continue;
      }
      // swallow test: fits in a hole and mostly over it (flying things only when the vortex is big)
      const tier = e.meta.tier;
      for (let h = 0; h < holes.length; h++) {
        const q = holes[h];
        if (q.hidden || (h === 0 && jammed) || (e.flying && q.r < tier * 1.6)) continue;
        if (h > 0 && this.settlements && tier >= holes[0].r * 0.5) continue; // Phase 2 rivals take scraps, never your ladder
        const dx = e.x - q.x, dz = e.z - q.z;
        // fits, and its centre is well inside the rim (a quarter of its footprint may still overhang)
        if (tier < q.r * 0.95 && dx * dx + dz * dz < (q.r * (q.pull || 1) - tier * 0.25) ** 2) {
          e.falling = true;
          e.eater = q;
          this.events.push({ type: 'fall', e });
          if (e.mover?.type === 'rail') this.decouple(e);
          e.vy = 0;
          e.tiltDir = Math.atan2(dz, dx);
          if (e.mesh?.userData.crumble) this.startCrumble(e, q);
          break;
        }
      }
    }
    const ccx = this.camPos?.x ?? 0, ccz = this.camPos?.z ?? 0; // (clouds wrap round the view: Phase 2 goes far from town)
    for (const c of this.cloudList) {
      c.x += c.v * dt;
      if (c.x - ccx > 700) c.x -= 1400; else if (c.x - ccx < -700) c.x += 1400;
      if (c.z - ccz > 700) c.z -= 1400; else if (c.z - ccz < -700) c.z += 1400;
      this.place(c);
    }
    for (const mesh of this.dirty) mesh.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
    this.collide.step(dt, holes); // nothing overlaps: people step round cars, dragged things slide round obstacles
    return eaten;
  }

  /** A building starts to crumble: tell its instance where the hole is (object space) and start the clock. */
  startCrumble(e, q) {
    const c = Math.cos(e.rot), s = Math.sin(e.rot), k = e.s * (e.gs || 1), dx = q.x - e.x, dz = q.z - e.z;
    e.crumble = { t: 0.001, dur: 1.1 + e.meta.tier * 0.05 }; // (big things take longer to come down: scale)
    const a = e.mesh.userData.crumble;
    a.setXYZW(e.index, 0.001, (dx * c - dz * s) / k, (dx * s + dz * c) / k, e.meta.height / k);
    a.needsUpdate = true;
  }

  fall(e, dt, hole, eaten) {
    if (e.crumble) { // parts break away in the shader (surface.js crumbleMaterial); swallowed when the last one is down
      const cr = e.crumble, a = e.mesh.userData.crumble;
      cr.t += (dt / cr.dur) * 1.45;
      a.setX(e.index, cr.t);
      a.needsUpdate = true;
      if (cr.t < 1.45) return;
      a.setX(e.index, 0);
      e.crumble = null;
      e.s = 0;
      this.place(e);
      eaten.push(e);
      e.alive = false;
      return;
    }
    // Slide fully over the opening before sinking, and only tip as far as keeps the object inside the
    // well - nothing ever pokes through the ground outside the hole.
    const tier = e.meta.tier, h = Math.max(0.3, e.meta.height);
    const d = Math.hypot(e.x - hole.x, e.z - hole.z);
    e.fallT = (e.fallT || 0) + dt;
    const inside = d + tier * 0.9 <= hole.r || e.fallT > (this.mutator === 'lowgrav' ? 3 : 1.2); // (timeout: a shrinking hole still finishes the job)
    const low = this.mutator === 'lowgrav'; // Low Gravity: falls take 2.5x longer, things float up as they tip in
    const k = Math.min(1, dt * (inside ? 2.5 : 7) / (low ? 2.5 : 1));
    e.x += (hole.x - e.x) * k;
    e.z += (hole.z - e.z) * k;
    if (inside) {
      e.vy += (low ? 30 / 6.25 : 30) * dt;
      e.y -= e.vy * dt;
    } else if (low) e.y = Math.min(e.y + dt * 0.8, 0.9);
    const room = Math.max(0.02, hole.r - tier * 0.95);
    e.tilt = Math.min(e.tilt + dt * 3, 1.2, Math.atan2(room, h * 0.6));
    this.place(e);
    if (e.y < -(e.meta.height + 1.5)) {
      e.s = 0;
      this.place(e);
      eaten.push(e);
      if (e.obj) this.remove(e);
      else e.alive = false;
    }
  }
}
