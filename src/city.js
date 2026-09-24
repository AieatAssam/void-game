// Seeded Toybox Town: tile grid, buildings, street furniture, pedestrians, traffic.
// Static things are instanced per (asset, chunk) so off-screen chunks are culled;
// movers are instanced per asset; animated landmarks are cloned with a mixer.
import * as THREE from 'three/webgpu';
import { Fn, uniformArray, uv, vec4, length, smoothstep, pow, If, Discard, positionWorld } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundMaterial, groundMaskMaterial } from './surface.js';
import { Terrain } from './terrain.js';

export const TILE = 40;
const CHUNK = 40;
const LOD_DIST = [15, 60]; // metres from camera to chunk edge: beyond [0] draw LOD1, beyond [1] LOD2
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(), _qt = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const WALK_DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // travel direction per side of a walk loop (v > 0)

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
    for (let i = 0; i < 4; i++) { // never darken the inside of a hole
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
const CLONED = new Set(['fountain', 'clock_tower', 'crane', 'swing', 'searchlight']);
export const BUILDINGS = new Set(['house', 'shop', 'cafe', 'apartment', 'clock_tower', 'office', 'hotel', 'skyscraper', 'crane', 'arcade', 'karaoke']);
const SNACKS = [['ped_business', 4], ['ped_jogger', 4], ['ped_tourist', 4], ['ped_granny', 4], ['ped_student', 4], ['ped_chef', 3], ['ped_worker', 3], ['ped_kid', 4], ['pigeon', 8], ['dog', 6], ['scooter', 6], ['bicycle', 6], ['hotdog_cart', 5],
  ['car_b', 6], ['car', 6], ['car_c', 6], ['taxi', 6], ['icecream_van', 4], ['bus', 4]];
export const SNACK_NAMES = SNACKS.map(([n]) => n);

/** City moods: tile weights for the inner ring and the outskirts. Picked per run from the seed. */
export const MOODS = [
  { name: 'Old Town', inner: { lot: 6, plaza: 1, park: 1.5, canal: 0.5 }, outer: { lot: 3, park: 2, residential: 3, plaza: 0.6 }, canals: false },
  { name: 'Suburbia', inner: { lot: 5, park: 1.5, parking: 1 }, outer: { residential: 6, park: 2, lot: 1.5 }, canals: false },
  { name: 'Waterfront', inner: { lot: 5, plaza: 1, park: 1 }, outer: { lot: 2, park: 2, residential: 2, canal: 1 }, canals: true },
  { name: 'Seaside', inner: { lot: 5, plaza: 1, park: 1.2 }, outer: { lot: 2, park: 1.5, residential: 2.5 }, canals: false, beach: true },
  { name: 'Neon Nights', inner: { lot: 4, neon: 3, plaza: 0.5 }, outer: { neon: 2, lot: 3, parking: 1, residential: 1 }, canals: false, night: true },
  { name: 'Boomtown', inner: { lot: 6, construction: 1.5, parking: 1 }, outer: { construction: 2, parking: 1.5, lot: 3, residential: 1.5 }, canals: false },
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
  /** opts.mood: a mood name (the city picker); otherwise the seed rolls one. */
  constructor(assets, seed, holeField, opts = {}) {
    this.assets = assets;
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
    this.groundMat = groundMaterial(holeField);
    this.layout();
    this.build();
  }

  // ---------- layout: a list of placements, no three.js objects yet ----------
  add(name, x, z, rot = 0, mover = null) {
    const a = this.assets[name];
    // static props never interpenetrate: a placement whose footprint overlaps one already standing is dropped
    if (!mover || mover.type === 'peck') {
      const rr = a.meta.tier * 0.6;
      for (const o of this.solids) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + rr) ** 2) return;
      this.solids.push({ x, z, r: rr });
    }
    if (mover) mover.t ??= 0;
    this.entities.push({ name, meta: a.meta, x, z, y: 0, rot, tilt: 0, tiltDir: 0, s: 1, alive: true, falling: false, vy: 0, mover });
  }

  layout() {
    const { r, N } = this;
    this.tiles = [];
    const mid = (N - 1) / 2, plazaAt = Math.floor(mid);
    const canalRow = this.mood.canals ? Math.floor(r() * (N - 1)) : -1;
    this.beach = this.mood.beach || r() < 0.25; // seafront along the +z edge
    const pierAt = Math.floor(r() * N);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const cx = (i - mid) * TILE, cz = (j - mid) * TILE;
        const ring = Math.max(Math.abs(i - mid), Math.abs(j - mid));
        let type;
        if (i === plazaAt && j === plazaAt) type = 'plaza';
        else if (this.beach && j === N - 1) type = 'beach';
        else if (j === canalRow && r() < 0.85) type = 'canal';
        else if (ring < 1) type = 'lot';
        else type = weighted(r, ring < 2 ? this.mood.inner : this.mood.outer);
        // Tiles whose props depend on orientation only turn by 180° (canals stay continuous along x).
        const rot = type === 'beach' ? 0 : type === 'canal' ? (r() < 0.5 ? 0 : Math.PI) : Math.floor(r() * 4) * Math.PI / 2;
        this.tiles.push({ type, cx, cz, ring, rot, pier: type === 'beach' && i === pierAt });
      }
    }
    for (const t of this.tiles) {
      this.tile(t);
      this.sidewalk(t);
    }
    this.traffic();
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
      e.meta = this.assets[rare].meta;
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
    if (t.type === 'lot') {
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
      if (r() < 0.5) this.add('swing', cx + 7, cz - 7, r() * 6.28);
      for (let k = 0; k < 6; k++) {
        const x = cx + r.range(-10, 10), z = cz + r.range(-10, 10);
        if (dry(x, z)) this.add('pigeon', x, z, r() * 6.28, { type: 'peck', t: r() * 10 });
      }
      for (let k = 0; k < 5; k++) this.walker(cx, cz, 12); // loop outside the pond (tile-local 7,7, r 4.2) at any rotation
    } else {
      this.add('fountain', cx, cz, 0);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        this.add('bench', cx + Math.cos(a) * 6, cz + Math.sin(a) * 6, -a);
      }
      this.add('kiosk', cx + 10, cz - 10, Math.PI / 2);
      this.add('hotdog_cart', cx - 10, cz + 9, r() * 6.28);
      if (ring > 0) this.add('spiky', cx - 9, cz - 9, 0);
      for (let k = 0; k < 14; k++) {
        const a = r() * 6.28, d = r.range(3.5, 11);
        this.add('pigeon', cx + Math.cos(a) * d, cz + Math.sin(a) * d, r() * 6.28, { type: 'peck', t: r() * 10 });
      }
      for (let k = 0; k < 8; k++) this.walker(cx, cz, 11);
    }
  }

  /** Countryside around the town: a real terrain (src/terrain.js) with its own scatter. Scenery only (never swallowed). */
  scenery() {
    this.terrain = new Terrain((this.r() * 2 ** 31) | 0, this.half, { beach: this.beach });
    this.sceneryList = this.terrain.scatter(this.assets);
    if (this.beach) for (let k = 0; k < 6; k++) {
      this.sceneryList.push({ name: 'sailboat', x: this.r.range(-this.half - 100, this.half + 100), y: this.terrain.water - 0.1, z: this.half + this.r.range(40, 260), rot: this.r() * 6.28 });
    }
  }

  /** Ground surface height at (x, z): blocks sit 18 cm above the road. */
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
    this.buildings ??= this.entities.filter((e) => BUILDINGS.has(e.name));
    for (const b of this.buildings) {
      if (b.alive && !b.falling && (b.x - x) ** 2 + (b.z - z) ** 2 < (b.meta.tier * 0.85 + pad) ** 2) return true;
    }
    return false;
  }

  /** Nothing within braking distance in this car's path? Same-axis traffic queues; north-south waits for east-west. */
  clearAhead(e) {
    const m = e.mover, fx = m.axis === 'x' ? m.dir : 0, fz = m.axis === 'x' ? 0 : -m.dir;
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
    const e = { name, meta: a.meta, x, z, y: 0, rot, tilt: 0, tiltDir: 0, s: 1, alive: true, falling: false, vy: 0, mover: null, ...extra };
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
      for (let d = -12; d <= 12; d += 3) {
        const x = cx + ox * 14.2 + tx * d, z = cz + oz * 14.2 + tz * d;
        if (t.type === 'beach' && z - cz > 9) continue; // past the waterline
        if (Math.abs(d) === 12) this.add('lamp', x, z, yaw);
        else if (r() < 0.55) this.add(r.pick(SIDEWALK), x, z, yaw + (r() < 0.5 ? 0 : Math.PI));
        if (r() < 0.04) this.add('toxic_barrel', x - ox * 1.2, z - oz * 1.2, 0);
      }
      for (let d = -10; d <= 10; d += 7) {
        if (t.type === 'beach' && oz * 16 + tz * d > 9) continue;
        if (r() < 0.4) this.add(r.pick(['car', 'car_b', 'taxi']), cx + ox * 16 + tx * d, cz + oz * 16 + tz * d, yaw + Math.PI / 2);
      }
    }
    for (let k = 0; k < 4; k++) this.walker(cx, cz, 13.2);
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
          const n = 1 + Math.floor(r() * 2);
          for (let c = 0; c < n; c++) {
            const lane = line + dir * 2.2;
            const along = r.range(-this.half, this.half);
            const x = axis === 'x' ? along : lane, z = axis === 'x' ? lane : along;
            this.add(r.pick(TRAFFIC), x, z, 0, { type: 'drive', axis, dir: axis === 'x' ? dir : -dir, v: r.range(5, 8) });
          }
        }
      }
    }
  }

  // ---------- build three.js objects ----------
  build() {
    const groups = new Map();
    const chunkKey = (x, z) => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
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
      const roams = e.mover?.type === 'drive' || e.mover?.type === 'wander';
      const reserve = !!e.mover?.reserve;
      const home = e.mover?.type === 'walk' ? chunkKey(e.mover.cx, e.mover.cz) : chunkKey(e.x, e.z);
      const k = roams ? `${e.name}|${reserve ? 'reserve' : 'roam'}` : `${e.name}|${home}|${e.mover ? 'm' : 's'}`;
      if (!groups.has(k)) groups.set(k, { name: e.name, list: [], mover: !!e.mover, roams, reserve });
      groups.get(k).list.push(e);
    }
    this.meshes = [];
    for (const g of groups.values()) {
      const a = this.assets[g.name];
      const variant = (this.groupCount = (this.groupCount || 0) + 1); // procedural trees differ chunk to chunk
      const full = flatGeometry(a, 0, variant), lod = flatGeometry(a, 1, variant), lod2 = flatGeometry(a, 2, variant);
      const mat = g.ground ? this.groundMat : a.material;
      const mesh = new THREE.InstancedMesh(full, mat, g.list.length);
      mesh.castShadow = !g.ground;
      mesh.receiveShadow = true;
      mesh.userData = { geos: [full, lod, lod2], full, tier: g.ground ? Infinity : a.meta.tier, ground: !!g.ground, roams: g.roams, list: g.reserve ? g.list : null, toyFlags: a.flags };
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
    this.buildScenery();
    // what the grass mask pass rasterises (src/grass.js)
    const lawnMask = groundMaskMaterial(0, 1);
    this.groundMeshes = this.meshes.filter((m) => m.userData.ground);
    for (const m of this.groundMeshes) m.userData.grassMask = lawnMask;
    this.groundMeshes.push(this.field); // terrain brings its own meadow mask
    // contact shadows under every small/medium thing (buildings already cast real shadows)
    const aoList = this.entities.filter((e) => e.meta.tier < 6);
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
    const near = lowSpec ? -1 : LOD_DIST[0]; // low-spec devices never draw LOD0
    for (const m of this.meshes) {
      const u = m.userData;
      if (u.ground) { m.geometry = u.full; continue; }
      if (u.scenery) {
        const d = camera.position.distanceTo(m.boundingSphere.center) - m.boundingSphere.radius;
        m.geometry = u.geos[d > LOD_DIST[1] ? 2 : d > near ? 1 : 0];
        m.castShadow = d < 35;
        continue;
      }
      m.visible = u.tier >= holeR * 0.03 && (!u.list || u.list.some((e) => e.alive)); // idle reserve pools cost nothing
      m.castShadow = u.tier >= holeR * 0.12;
      // roaming traffic spans the whole city, so it can't be distance-LOD'd per instance: mid detail, low when zoomed out
      const d = u.roams ? (holeR > 4 ? 999 : 30) : camera.position.distanceTo(m.boundingSphere.center) - m.boundingSphere.radius;
      m.geometry = u.geos[d > LOD_DIST[1] ? 2 : d > near ? 1 : 0];
      // Shadow pass budget: only near chunks cast; city-wide movers (never culled) cast only up close.
      if (u.roams ? holeR > 2.5 : d > 35) m.castShadow = false;
    }
  }

  dispose() {
    for (const m of this.meshes) m.dispose();
    this.clouds.dispose();
    this.ao.dispose();
    this.ao.material.dispose();
    this.terrain.dispose();
    for (const mx of this.mixers) mx.stopAllAction();
    this.groundMat.dispose();
  }

  /** Write an entity's transform to its instance slot or cloned object. */
  place(e) {
    _q.setFromAxisAngle(UP, e.rot);
    if (e.tilt) {
      // tip the top toward the hole center: axis = up x (direction to hole)
      _ax.set(-Math.sin(e.tiltDir), 0, Math.cos(e.tiltDir));
      _q.premultiply(_qt.setFromAxisAngle(_ax, e.tilt));
    }
    _p.set(e.x, e.y, e.z);
    _s.setScalar(e.s);
    if (e.obj) {
      e.obj.position.copy(_p);
      e.obj.quaternion.copy(_q);
      e.obj.scale.copy(_s);
      if (e.ao !== undefined) this.placeAO(e);
      return;
    }
    e.mesh.setMatrixAt(e.index, _m.compose(_p, _q, _s));
    this.dirty.add(e.mesh);
    if (e.ao !== undefined) this.placeAO(e);
  }

  /** Movers + falling + swallow checks. Returns list of entities consumed this frame. */
  /** holes[0] is the player (flee/clog react to it); every visible hole can swallow. jammed = player can't eat. */
  update(dt, holes, jammed = false) {
    const hole = holes[0];
    const eaten = [];
    this.events = [];
    const H = this.half;
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
        const dx = hole.x - e.x, dz = hole.z - e.z, d = Math.hypot(dx, dz) || 1e-3, reach = hole.r * (1.4 + hole.vac * 0.5) + 1.2;
        if (d < reach) {
          const f = Math.min(1, hole.vac) * Math.sqrt(1 - d / reach) / (1 + hole.r * 0.12), pull = (3 + hole.r * 2.5) * f, swirl = (4 + hole.r * 3) * f;
          e.x += ((dx * pull + dz * swirl) / d) * dt; // inward + tangential
          e.z += ((dz * pull - dx * swirl) / d) * dt;
          e.rot += (swirl / Math.max(0.3, tier0)) * dt * 0.6;
          e.tilt = Math.min(0.35, f * 0.45);
          e.tiltDir = Math.atan2(-dz, -dx);
          if (m && (m.type === 'walk' || m.type === 'drive')) e.mover = { type: 'wander', h: e.rot, v: m.type === 'walk' ? 1.4 : 4, t: m.t }; // no snapping back to a path
          e.sucked = 0.3;
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
        if (scared && alarm >= 2 && (m.type === 'walk' || m.type === 'wander') && e.meta.tier < 0.6 && !e.name.startsWith('pigeon')) {
          e.hideT = (e.hideT || 0) + dt;
          if (e.hideT > 1.2 && Math.random() < dt * (alarm - 1) * 0.35) { e.hiding = 0.5; this.events.push({ type: 'hid', e }); }
        }
        if (scared && !e.wasScared && m.type === 'walk') { // a shout, and the panic spreads to people close by
          if (Math.random() < 0.5) this.events.push({ type: 'scream', e });
          for (const o of this.walkers ??= this.entities.filter((q) => q.mover?.type === 'walk')) {
            if (o !== e && o.alive && !(o.panic > 0) && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 16) o.panic = 2.5;
          }
        }
        e.wasScared = scared;
        if (m.type === 'walk') {
          if (scared) {
            const [dx0, dz0] = WALK_DIR[Math.floor(m.s / (2 * m.h))];
            const away = dx0 * fdx + dz0 * fdz >= 0 ? 1 : -1; // run the way that leads away
            m.v = away * Math.max(Math.abs(m.v), 2.6);
          } else if (Math.abs(m.v) > 1.6) m.v *= 1 - dt * 0.5;
          m.s = (m.s + m.v * dt + 8 * m.h * 100) % (8 * m.h);
          const side = Math.floor(m.s / (2 * m.h)), u = (m.s % (2 * m.h)) - m.h;
          const P = [[m.h, u], [-u, m.h], [-m.h, -u], [u, -m.h]][side];
          e.x = m.cx + P[0];
          e.z = m.cz + P[1];
          const [dx, dz] = WALK_DIR[side], sg = Math.sign(m.v);
          e.rot = Math.atan2(-dz * sg, dx * sg);
          const w = m.t * 9 * Math.abs(m.v);
          e.y = Math.abs(Math.sin(w)) * 0.07; // the toy waddle-hop
          e.tilt = 0;
          e.rot += Math.sin(w) * 0.12;
        } else if (m.type === 'drive') {
          m.cur = Math.max(0, Math.min(m.v, (m.cur ?? m.v) + (this.clearAhead(e) ? 4 : -14) * dt)); // ease off / brake
          const d = m.cur * m.dir * dt;
          // the hole in the lane ahead: honk and swerve a little (eases back; stays inside clearAhead's lane width)
          m.lane ??= m.axis === 'x' ? e.z : e.x;
          const fwd = m.axis === 'x' ? (hole.x - e.x) * m.dir : (e.z - hole.z) * m.dir, lat = m.axis === 'x' ? hole.z - m.lane : hole.x - m.lane;
          const danger = !hole.hidden && fwd > 0 && fwd < 12 + hole.r && Math.abs(lat) < hole.r + 1.4;
          m.off = (m.off || 0) + ((danger ? -Math.sign(lat || 1) * 1.0 : 0) - (m.off || 0)) * Math.min(1, dt * 3);
          if (danger && !(m.honk > 0) && e.meta.tier >= 1) { m.honk = 4; this.events.push({ type: 'honk', e, d: fwd }); }
          m.honk = (m.honk || 0) - dt;
          if (m.axis === 'x') e.z = m.lane + m.off; else e.x = m.lane + m.off;
          if (m.axis === 'x') { e.x += d; if (e.x > H) e.x -= 2 * H; if (e.x < -H) e.x += 2 * H; e.rot = m.dir > 0 ? 0 : Math.PI; }
          else { // north-south roads stop at the shoreline on seaside maps
            const top = this.beach ? H - 10 : H;
            e.z -= d; if (e.z > top) e.z -= top + H; if (e.z < -H) e.z += top + H; e.rot = m.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
          e.y = Math.abs(Math.sin(m.t * 7)) * 0.03;
        } else if (m.type === 'wander') {
          if (scared) m.h = Math.atan2(-fdz, fdx) + Math.sin(m.t * 3) * 0.3; // run from the hole
          else m.h += Math.sin(m.t * 0.7 + e.x) * dt * 0.6;
          if (Math.abs(e.x) > H - 4 || Math.abs(e.z) > H - 4) m.h = Math.atan2(e.z, -e.x); // steer back to town
          const nx = e.x + Math.cos(m.h) * m.v * dt, nz = e.z - Math.sin(m.h) * m.v * dt;
          if (this.blocked(nx, nz, e.meta.tier)) m.h += Math.PI * (0.5 + this.r() * 0.5); // bounce off walls, never walk through
          else { e.x = nx; e.z = nz; }
          e.rot = m.h;
          const w = m.t * 9;
          e.y = e.meta.tier < 0.3 ? Math.abs(Math.sin(w)) * 0.07 : Math.abs(Math.sin(m.t * 7)) * 0.03;
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
        const dx = e.x - q.x, dz = e.z - q.z;
        if (tier < q.r * 0.95 && dx * dx + dz * dz < (q.r * (q.pull || 1) - tier * 0.5) ** 2) {
          e.falling = true;
          e.eater = q;
          this.events.push({ type: 'fall', e });
          e.vy = 0;
          e.tiltDir = Math.atan2(dz, dx);
          break;
        }
      }
    }
    for (const c of this.cloudList) {
      c.x += c.v * dt;
      if (c.x > 700) c.x = -700;
      this.place(c);
    }
    for (const mesh of this.dirty) mesh.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
    return eaten;
  }

  fall(e, dt, hole, eaten) {
    // Slide fully over the opening before sinking, and only tip as far as keeps the object inside the
    // well - nothing ever pokes through the ground outside the hole.
    const tier = e.meta.tier, h = Math.max(0.3, e.meta.height);
    const d = Math.hypot(e.x - hole.x, e.z - hole.z);
    e.fallT = (e.fallT || 0) + dt;
    const inside = d + tier * 0.9 <= hole.r || e.fallT > 1.2; // (timeout: a shrinking hole still finishes the job)
    const k = Math.min(1, dt * (inside ? 2.5 : 7));
    e.x += (hole.x - e.x) * k;
    e.z += (hole.z - e.z) * k;
    if (inside) {
      e.vy += 30 * dt;
      e.y -= e.vy * dt;
    }
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
