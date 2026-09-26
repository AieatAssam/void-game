// Phase 2 (docs/PHASE2.md): the countryside around the emptied hometown becomes the map. Settlements of every size
// (farmsteads, villages, a castle, a market town, an industrial valley, the capital) sit on levelled pads joined by
// roads, on the same land the town was built on, grown outward. The Region is a City: the same entities, instancing,
// swallowing and falling; what's new is the layout, the ground (terrain everywhere, with the hole cut), road traffic,
// and "crumbs" - the thousands of trees, hedges, rocks and cows the hole mows through, kept out of the per-entity loop.
import * as THREE from 'three/webgpu';
import { City, TILE, rng, BUILDINGS, REGION_BUILDINGS, groundMaterial } from './city.js';

export { REGION_BUILDINGS };
import { Terrain } from './terrain.js';
import { makeEntity } from './entity.js';
import { Collider } from './collide.js';

export const REGION_BOUND = 1500; // metres from the hometown centre to the map edge (mountains beyond)


const COUNTS = (n) => BUILDINGS.has(n) || REGION_BUILDINGS.has(n);

const NAMES = ['Ashby', 'Little Puddle', 'Mudford', 'Nettlecombe', 'Bramblewick', 'Oakhollow', 'Thistledown', 'Pebbleton', 'Wickham Green',
  'Cobble End', 'Fernley', 'Hazelbury', 'Marrowdale', 'Plumstead', 'Quillhurst', 'Rookwood', 'Sallowmere', 'Tumbledown'];
const CAPITALS = ['Grand Metropole', 'Port Regal', 'Crownhaven', 'Castellan City'];
const TOWNS = ['Market Hollow', 'Kingsbridge', 'Upper Wendle'];
const CASTLES = ['Castle Gloam', 'Castle Ravensmoor', 'Castle Brightspur'];
const INDUSTRY = ['Smokestack Vale', 'Ironmouth', 'Cinderley Works'];

/**
 * What to build and where. r: pad radius; d: distance band from the hometown centre; need: the hole size its biggest
 * buildings ask for (for the marker: "can I eat this yet?").
 */
const KINDS = {
  farm: { r: 38, d: [220, 700], names: NAMES },
  village: { r: 72, d: [300, 720], names: NAMES },
  castle: { r: 62, d: [520, 950], names: CASTLES, hill: true },
  town: { r: 115, d: [640, 1050], names: TOWNS },
  industry: { r: 125, d: [760, 1180], names: INDUSTRY },
  capital: { r: 215, d: [1030, 1260], names: CAPITALS },
};
const PLAN = ['capital', 'industry', 'town', 'castle', 'village', 'village', 'farm', 'farm', 'farm', 'farm'];

/** Drive a generator, awaiting slice() at each yield (slice decides when to hand the frame back). */
async function run(gen, slice) {
  let step;
  while (!(step = gen.next()).done) await slice();
  return step.value;
}

/**
 * A time slicer for building in the background: at most one slice of `budget` ms per animation frame (so it never
 * stacks several between two frames), and none while `hold()` says the game is struggling (the fps watchdog must not
 * blame the GPU for our work). Set `.budget` higher when the result is needed now; set `.cancelled` to abandon it.
 */
export function slicer(budget = 3, hold = () => false) {
  let t0 = performance.now();
  const nextFrame = () => new Promise((r) => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => r())));
  const s = async () => {
    if (s.cancelled) throw new Error('region build cancelled');
    if (performance.now() - t0 < s.budget) return;
    await nextFrame();
    while (s.budget < 20 && hold() && !s.cancelled) await nextFrame();
    t0 = performance.now();
  };
  s.budget = budget;
  return s;
}

/** A road's centre line with its corners rounded (Chaikin x2) and resampled every ~5 m: ribbons and traffic share it. */
function smoothPath(pts) {
  let q = pts;
  for (let it = 0; it < 2; it++) { // Chaikin: round the corners
    const o = [q[0]];
    for (let i = 0; i < q.length - 1; i++) {
      const [ax, az] = q[i], [bx, bz] = q[i + 1];
      o.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    o.push(q.at(-1));
    q = o;
  }
  const out = [q[0]];
  for (let i = 1; i < q.length; i++) {
    const [ax, az] = out.at(-1), [bx, bz] = q[i], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 5);
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / (n + 1), az + ((bz - az) * k) / (n + 1)]);
    out.push([bx, bz]);
  }
  return out;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Region extends City {
  /**
   * Build the region grown from `from` (the Phase 1 city, emptied) in stages; `step(label)` is awaited between stages so
   * the breakout cinematic keeps rendering. The hometown's ground tiles stay where they were.
   */
  static async create(assets, from, holeField, slice = async () => {}, finish = true) {
    const step = slice;
    const times = {}, t = (k, t0) => { times[k] = Math.round(performance.now() - t0); };
    let t0 = performance.now();
    // (the weekly mutator stays in town: ducks, miniature twins and low gravity aren't built for the region's ladder)
    const g = new Region(assets, from.terrainSeed ^ 0x2e61, holeField, { defer: true, mood: from.mood.name, mutator: null });
    Object.assign(g, { N: from.N, half: from.half, mood: from.mood, beach: from.beach, runwayRow: -1, railRow: -1, tiles: from.tiles });
    g.bound = REGION_BOUND;
    g.chunk = 400; // one instanced mesh per model per settlement (first-sight shader builds: PERFORMANCE.md)
    g.tinyK = 0.012; // people stay visible as specks much longer: crowds and convoys carry the scale
    g.tileEntities = from.tileEntities.slice();
    g.sceneryList = [];
    g.terrainSeed = from.terrainSeed;
    g.plan();
    t('plan', t0);
    await step('Surveying the country…');
    t0 = performance.now();
    // trodden earth painted into the land: farmyards, the castle bailey, the lane round each village green
    const dirt = [];
    for (const q of g.settlements) {
      if (q.kind === 'farm') dirt.push({ x: q.x, z: q.z, r: 26 });
      if (q.kind === 'castle') dirt.push({ x: q.x, z: q.z, r: 34 });
      if (q.kind === 'village') dirt.push({ x: q.x, z: q.z, r: 20, w: 3.5, ring: true }, { x: q.x, z: q.z, r: 44, w: 3, ring: true });
    }
    g.terrain = new Terrain(from.terrainSeed, g.half, { beach: g.beach, farm: !!g.mood.county, region: { bound: g.bound, pads: g.pads, roads: g.roads.map((r) => r.pts), dirt }, holes: holeField, defer: true });
    await run(g.terrain.buildGen(), slice);
    t('terrain', t0);
    await step('Raising the villages…');
    t0 = performance.now();
    for (const s of g.settlements) { g.settle(s); await slice(); }
    g.windFarm();
    g.pylonLine();
    await slice();
    g.traffic();
    t('settle', t0);
    await step('Planting the forests…');
    t0 = performance.now();
    await g.plantCrumbs(slice);
    t('crumbs', t0);
    g.times = times;
    if (finish) g.finish();
    return g;
  }

  /** The part that can't be sliced (instanced meshes, the road ribbon, bookkeeping): run at the breakout. */
  finish() {
    const g = this, times = this.times, t = (k, t0) => { times[k] = Math.round(performance.now() - t0); };
    let t0 = performance.now();
    g.build();
    t('build', t0);
    t0 = performance.now();
    g.roadMesh();
    // crumbs leave the per-entity loop: they're only tested near a hole (update)
    g.crumbs = g.entities.filter((e) => e.mover?.crumb);
    g.entities = g.entities.filter((e) => !e.mover?.crumb);
    g.crumbGrid = new Map();
    for (const e of g.crumbs) {
      const k = g.cellKey(e.x, e.z);
      if (!g.crumbGrid.has(k)) g.crumbGrid.set(k, []);
      g.crumbGrid.get(k).push(e);
    }
    g.fallingCrumbs = [];
    g.collide = new Collider(g, (e) => g.footprint(e));
    for (const s of g.settlements) s.list = g.entities.filter((e) => e.home === s && COUNTS(e.name));
    for (const s of g.settlements) s.total = s.list.length;
    t('roads', t0);
    g.finished = true;
    return g;
  }

  // ---------- plan: settlements, pads, roads ----------
  plan() {
    const r = this.r, B = this.bound;
    this.settlements = [];
    // the land before levelling: same noise the region terrain will use, no mesh
    const probe = new Terrain(this.terrainSeed, this.half, { beach: this.beach, farm: !!this.mood.county, region: { bound: B, pads: [], roads: [] }, noMesh: true, defer: true });
    this.probe = probe;
    const used = new Set();
    for (const kind of PLAN) {
      const K = KINDS[kind];
      let best = null;
      for (let t = 0; t < 160; t++) {
        const a = r() * Math.PI * 2, d = r.range(K.d[0], K.d[1]);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (probe.coastR(x, z) - Math.hypot(x, z) < K.r + 150 || [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([u, v]) => probe.mountain(x + u * (K.r + 60), z + v * (K.r + 60)) > 0.05)) continue; // well inland, clear of the mountains
        if (this.beach && z > this.half - K.r - 40) continue; // the sea is that way
        if (this.settlements.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + K.r + 90)) continue;
        // dry land: sample the pad
        let wet = 0, hsum = 0, lo = Infinity, hi = -Infinity;
        for (let k = 0; k < 9; k++) {
          const b = (k / 9) * Math.PI * 2, rr = k ? K.r * 0.8 : 0;
          const hh = probe.rawHeight(x + Math.cos(b) * rr, z + Math.sin(b) * rr);
          if (hh < probe.water + 0.8) wet++;
          hsum += hh; lo = Math.min(lo, hh); hi = Math.max(hi, hh);
        }
        if (hi > 34 || hi - lo > (K.hill ? 26 : 16)) continue; // not up in the mountains, not on a cliff
        if (probe.river && probe.riverDist(x, z) < K.r + 35) continue;
        if (wet > 1) continue;
        const score = (K.hill ? hsum : 0) + r() * 5;
        if (!best || score > best.score) best = { x, z, score };
        if (!K.hill) break;
      }
      if (!best) continue;
      let name = r.pick(K.names);
      for (let k = 0; used.has(name) && k < 20; k++) name = r.pick(K.names);
      used.add(name);
      this.settlements.push({ kind, name, x: best.x, z: best.z, r: K.r, a: 0 });
    }
    this.pads = this.settlements.map((s) => ({ x: s.x, z: s.z, r: s.r }));
    // roads: a tree grown outward from the hometown, each settlement joined to the nearest node already on it
    const nodes = [{ x: 0, z: 0, home: true }];
    this.roads = [];
    const order = [...this.settlements].sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
    for (const s of order) {
      let from = nodes[0], bd = Infinity;
      for (const n of nodes) { const d = Math.hypot(n.x - s.x, n.z - s.z); if (d < bd) { bd = d; from = n; } }
      let ax = from.x, az = from.z;
      if (!from.home) { // leave a settlement from the edge of its pad, not through its middle
        const d = Math.hypot(s.x - from.x, s.z - from.z);
        ax = from.x + ((s.x - from.x) / d) * from.r * 0.95;
        az = from.z + ((s.z - from.z) / d) * from.r * 0.95;
      }
      if (from.home) { // leave town at the edge of the square, on a street line
        const ang = Math.atan2(s.z, s.x), h = this.half;
        const k = h / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
        ax = Math.cos(ang) * k; az = Math.sin(ang) * k;
        if (Math.abs(ax) >= h - 1) az = Math.round((az + h) / TILE) * TILE - h; else ax = Math.round((ax + h) / TILE) * TILE - h;
      }
      s.a = Math.atan2(az - s.z, ax - s.x); // the main street runs along the road in (local +u points back up it)
      // the castle's road stops at its gate; everywhere else it runs into the middle (the main street)
      const stop = s.kind === 'castle' ? s.r * 0.85 : 0;
      this.roads.push({ pts: this.meander(ax, az, s.x + Math.cos(s.a) * stop, s.z + Math.sin(s.a) * stop), a: from, b: s });
      nodes.push(s);
    }
    // a ring road round the capital's outskirts joins it to its neighbours
  }

  /** Gentle S-bends between two points, sampled every ~20 m. */
  meander(x0, z0, x1, z1) {
    const r = this.r, L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 20));
    const nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
    const amp = Math.min(60, L * 0.08) * (r() < 0.5 ? -1 : 1), f = 1 + Math.floor(r() * 2), ph = r() * 0.5;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = Math.sin(t * Math.PI) ** 2 * Math.sin((t * f + ph) * Math.PI);
      pts.push([x0 + (x1 - x0) * t + nx * amp * w, z0 + (z1 - z0) * t + nz * amp * w]);
    }
    return pts;
  }

  // ---------- settlements ----------
  /** Local (u, v) in settlement s -> world [x, z]. u runs along the road in (toward it: -u). */
  at(s, u, v) {
    const c = Math.cos(s.a), n = Math.sin(s.a);
    return [s.x + u * c - v * n, s.z + u * n + v * c];
  }

  /** Place `name` at local (u, v) with its front (+x) facing local angle phi. */
  place2(s, name, u, v, phi = 0, mover = null, frontZ = false, force = false) {
    if (!this.assets[name]) return null;
    const [x, z] = this.at(s, u, v);
    const tier = this.assets[name].meta.tier;
    if (this.terrain.roadDist(x, z) < tier * 0.75 + 6 && !mover) return null; // roads stay open
    if (this.terrain.heightAt(x, z) < this.terrain.water + 0.4) return null;
    const psi = s.a + phi;
    const n = this.entities.length, rot = frontZ ? Math.PI / 2 - psi : -psi;
    if (force) this.entities.push(makeEntity({ name, meta: this.metaOf(name), x, z, y: 0, rot, s: 1, alive: true, grounded: true, mover }));
    else this.add(name, x, z, rot, mover);
    if (this.entities.length === n) return null;
    const e = this.entities[n];
    e.home = s;
    return e;
  }

  settle(s) {
    const r = this.r;
    const P = (name, u, v, phi, extra) => this.place2(s, name, u, v, phi, extra);
    const F = (name, u, v, phi, frontZ = false) => this.place2(s, name, u, v, phi, null, frontZ, true); // curated: no overlap test
    const face = (u, v) => Math.atan2(-v, -u); // front toward the settlement centre
    const trees = (n, rad0, rad1) => {
      for (let k = 0; k < n; k++) { const b = r() * 6.28, d = r.range(rad0, rad1); P(r.pick(['tree_big', 'tree_small', 'tree_big']), Math.cos(b) * d, Math.sin(b) * d, r() * 6.28); }
    };
    if (s.kind === 'farm') {
      // the lane ends in the yard: buildings round it
      P('farmhouse', 4, 20, -Math.PI / 2);
      P('barn', 20, -18, Math.PI / 2);
      P('grain_silo', -16, 22, r() * 6.28);
      for (let k = 0; k < 5; k++) P('cow', r.range(-30, 30), r.range(-34, -18), r() * 6.28);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) P('tree_small', 24 + i * 5.5 + r.range(-0.6, 0.6), 6 + j * 6 + r.range(-0.6, 0.6), r() * 6.28); // orchard rows
      trees(6, 30, 38);
    } else if (s.kind === 'village') {
      P('village_church', 0, -30, Math.PI / 2);
      P('village_inn', 24, 14, face(24, 14));
      for (let k = 0; k < 3; k++) { const b = k * 2.1 + 0.4; P('tree_big', Math.cos(b) * 7, Math.sin(b) * 7, r() * 6.28); }
      P('bench', 0, 10, -Math.PI / 2);
      for (let k = 0; k < 18; k++) {
        const b = (k / 18) * Math.PI * 2 + r() * 0.1, d = r.range(30, 52);
        const u = Math.cos(b) * d, v = Math.sin(b) * d;
        P(r() < 0.62 ? 'cottage' : r() < 0.6 ? 'house' : r.pick(['shop', 'cafe']), u, v, face(u, v));
      }
      P('farmhouse', -58, 22, 0);
      P('barn', -60, -8, 0.3);
      P('windmill', 58, -30, 0);
      for (let k = 0; k < 4; k++) P('cow', r.range(-66, -46), r.range(30, 50), r() * 6.28);
      trees(12, 55, 70);
    } else if (s.kind === 'castle') {
      const S = 23; // half side: corner towers, a wall each side of the middle, the gate facing the road (-u)
      for (const [cu, cv] of [[-S, -S], [S, -S], [S, S], [-S, S]]) F('castle_tower', cu, cv, 0);
      const sides = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // outward normals (u, v); the first faces the road in
      sides.forEach(([nu, nv], i) => {
        const phi = Math.atan2(nv, nu);
        for (const t of i === 0 ? [-14.5, 14.5] : [-11.5, 11.5]) F('castle_wall', nu * S - nv * t, nv * S + nu * t, phi, true); // (clear of the gate's drums)
        if (i === 0) F('castle_gate', S + 1, 0, 0);
        else F('castle_tower', nu * S, nv * S, 0);
      });
      F('castle_keep', -4, 0, 0);
      for (let k = 0; k < 6; k++) P('pavilion', r.range(40, 62), (r() < 0.5 ? -1 : 1) * r.range(14, 42), r() * 6.28);
      for (let k = 0; k < 3; k++) P('cannon', 36 + r.range(-3, 3), -14 + k * 14, 0, { type: 'still', role: 'cannon' });
      trees(10, 45, 60);
    } else if (s.kind === 'town') {
      // main street along u, a cross street along v; terraces face the streets, a market square off the crossing
      for (let u = -96; u <= 96; u += 24) {
        if (Math.abs(u) < 14) continue;
        for (const sv of [-1, 1]) P(r() < 0.5 ? 'townhouse_row' : 'townhouse_row_b', u, sv * 17, sv > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      for (let v = 44; v <= 100; v += 24) for (const su of [-1, 1]) P(r() < 0.5 ? 'townhouse_row' : 'townhouse_row_b', su * 17, -v, su > 0 ? Math.PI : 0);
      P('market_hall', 0, 38, 0);
      P('town_hall', 0, 72, -Math.PI / 2);
      P('cathedral', 52, 62, Math.PI);
      for (let k = 0; k < 16; k++) { // back streets: shops, cafes, houses, a few flats
        const u = r.range(-100, 100), v = (r() < 0.5 ? -1 : 1) * r.range(40, 95);
        P(r.pick(['shop', 'cafe', 'house', 'house', 'apartment']), u, v, v > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      for (let k = 0; k < 10; k++) P(r.pick(['car', 'car_b', 'car_c', 'taxi']), r.range(-90, 90), (r() < 0.5 ? -1 : 1) * 9, r() < 0.5 ? 0 : Math.PI);
      trees(14, 100, 115);
    } else if (s.kind === 'industry') {
      for (const [u, v] of [[-60, -40], [-10, -40], [40, -40], [-60, 40], [-10, 40]]) {
        P('factory', u, v, v > 0 ? -Math.PI / 2 : Math.PI / 2);
        P('chimney_stack', u + 20, v + (v > 0 ? 18 : -18), 0);
      }
      P('gasholder', 60, 42, 0);
      P('gasholder', 92, 10, 0);
      for (const [u, v] of [[-100, -8], [-100, 14], [-84, -8], [-84, 14]]) P('fuel_tank', u, v, 0);
      P('cooling_tower', 70, -70, 0);
      P('cooling_tower', 110, -30, 0);
      for (let k = 0; k < 6; k++) P('army_truck', r.range(-80, 80), (r() < 0.5 ? -1 : 1) * r.range(8, 12), r() < 0.5 ? 0 : Math.PI);
    } else if (s.kind === 'capital') {
      // avenues every 50 m (one along the road in), lots between them
      const lots = [];
      for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) lots.push([(i + 0.5) * 50, (j + 0.5) * 50]);
      const take = (u, v) => { const k = lots.findIndex(([a, b]) => a === u && b === v); if (k >= 0) lots.splice(k, 1); };
      P('parliament', -12, 50, Math.PI / 2);
      for (const [u, v] of [[-25, 25], [25, 25], [-25, 75], [25, 75]]) take(u, v);
      P('stadium', 150, -150, 0);
      for (const [u, v] of [[125, -125], [175, -125], [125, -175], [175, -175]]) take(u, v);
      const specials = [['supertall', 25, -25], ['supertall', -75, -75], ['tv_tower', -175, 125], ['glass_tower', 75, -25], ['glass_tower', -25, -25],
        ['glass_tower', 75, 25], ['glass_tower', -75, -25], ['glass_tower', 25, -75], ['glass_tower', 125, 25]];
      for (const [n, u, v] of specials) { P(n, u, v, r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2])); take(u, v); }
      for (const [u, v] of lots) {
        const dist = Math.hypot(u, v);
        if (dist > 205) continue;
        // (no small towers here: the capital is the final meal and opens at ~16 m - the towns on the way feed you up to it)
        P(u + v > 0 ? 'city_block' : 'city_block_b', u, v, r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
      }
      for (let k = 0; k < 24; k++) P(r.pick(['car', 'car_b', 'car_c', 'taxi', 'bus']), (r() < 0.5 ? r.range(-190, 190) : Math.round(r.range(-4, 4)) * 50 + 3), (r() < 0.5 ? Math.round(r.range(-4, 4)) * 50 - 3 : r.range(-190, 190)), r() * 6.28);
    }
  }

  /** A wind farm on the highest open ground. */
  windFarm() {
    const r = this.r, pr = this.probe;
    let best = null;
    for (let t = 0; t < 80; t++) {
      const a = r() * 6.28, d = r.range(350, this.bound - 200), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.settlements.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 140)) continue;
      if (pr.coastR(x, z) - Math.hypot(x, z) < 220 || pr.mountain(x, z) > 0.15) continue;
      const h = pr.rawHeight(x, z);
      if (h > 40) continue; // (a breezy hill, not a mountain top)
      if (!best || h > best.h) best = { x, z, h };
    }
    if (!best) return;
    for (let k = 0; k < 7; k++) {
      const x = best.x + (k % 3 - 1) * 75 + r.range(-10, 10), z = best.z + (Math.floor(k / 3) - 1) * 75 + r.range(-10, 10);
      if (this.terrain.roadDist(x, z) < 14 || this.terrain.heightAt(x, z) < this.terrain.water + 0.5) continue;
      this.add('wind_turbine', x, z, r() * 6.28);
    }
  }

  /** A power line from the industrial valley to the capital: pylons every 110 m (they zap: poison). */
  pylonLine() {
    const a = this.settlements.find((s) => s.kind === 'industry'), b = this.settlements.find((s) => s.kind === 'capital');
    if (!a || !b) return;
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.floor(L / 110);
    this.pylons = [];
    for (let k = 1; k < n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t + 30, z = a.z + (b.z - a.z) * t + 30;
      if (this.terrain.roadDist(x, z) < 10 || this.terrain.heightAt(x, z) < this.terrain.water + 0.3) continue;
      if (this.settlements.some((s) => Math.hypot(s.x - x, s.z - z) < s.r)) continue;
      this.add('pylon', x, z, -Math.atan2(b.z - a.z, b.x - a.x) + Math.PI / 2);
      this.pylons.push(this.entities.at(-1));
    }
  }

  // ---------- roads: ribbons, traffic ----------
  /** Arc-length tables so traffic can ride the roads. */
  roadTables() {
    for (const rd of this.roads) {
      rd.path = smoothPath(rd.pts);
      const P = rd.path, L = [0];
      for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      rd.len = L;
      rd.total = L.at(-1);
    }
  }

  /** Point and heading at distance s along road rd. */
  roadAt(rd, s) {
    const L = rd.len;
    s = Math.max(0, Math.min(rd.total - 1e-3, s));
    let lo = 1, hi = L.length - 1; // first index with L[i] >= s
    while (lo < hi) { const m = (lo + hi) >> 1; if (L[m] < s) lo = m + 1; else hi = m; }
    const i = lo;
    const [x0, z0] = rd.path[i - 1], [x1, z1] = rd.path[i], t = (s - L[i - 1]) / (L[i] - L[i - 1] || 1);
    return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, Math.atan2(z1 - z0, x1 - x0)];
  }

  traffic() {
    this.roadTables();
    this.evacuees();
    const r = this.r;
    for (const [ri, rd] of this.roads.entries()) {
      const n = Math.round(rd.total / 90);
      for (let k = 0; k < n; k++) {
        const name = r.pick(['car', 'car_b', 'car_c', 'car', 'taxi', 'bus', 'icecream_van', 'army_truck']);
        const s = r() * rd.total, dir = r() < 0.5 ? 1 : -1;
        const [x, z] = this.roadAt(rd, s);
        this.entities.push(makeEntity({ name, meta: this.metaOf(name), x, z, y: 0, rot: 0, s: 1, gs: 1, alive: true, grounded: true,
          mover: { type: 'road', road: ri, s, dir, v: r.range(9, 15), t: r() * 10 } }));
      }
    }
  }

  /** Dormant evacuees per settlement: cars on its road out and a crowd, woken by evacuate(). */
  evacuees() {
    const r = this.r, PEOPLE = ['ped_business', 'ped_granny', 'ped_kid', 'ped_tourist', 'ped_worker', 'ped_student', 'ped_jogger', 'ped_chef'];
    for (const q of this.settlements) {
      q.evac = [];
      const ri = this.roads.findIndex((rd) => rd.b === q);
      if (ri >= 0) for (let k = 0; k < (q.kind === 'farm' ? 3 : 12); k++) {
        const name = r.pick(['car', 'car_b', 'car_c', 'taxi', 'bus', 'car', 'icecream_van']);
        const e = makeEntity({ name, meta: this.metaOf(name), x: q.x, z: q.z, y: 0, rot: 0, s: 0, gs: 1, alive: false, grounded: true,
          mover: { type: 'road', road: ri, s: 0, dir: -1, v: r.range(11, 17), t: r() * 10, evac: true } });
        this.entities.push(e);
        q.evac.push(e);
      }
      const n = { farm: 6, village: 40, castle: 30, town: 60, industry: 30, capital: 90 }[q.kind];
      for (let k = 0; k < n; k++) {
        const name = r.pick(PEOPLE);
        const e = makeEntity({ name, meta: this.metaOf(name), x: q.x, z: q.z, y: 0, rot: 0, s: 0, gs: 1, alive: false, grounded: true,
          mover: { type: 'wander', h: 0, v: 0, t: r() * 10, reserve: true } });
        this.entities.push(e);
        q.evac.push(e);
      }
    }
  }

  /** The hole is coming: cars pour out along the road, people stream out of the houses and run. */
  evacuate(q) {
    const rd = this.roads.find((x) => x.b === q);
    let k = 0;
    for (const e of q.evac || []) {
      const m = e.mover;
      if (m.type === 'road') {
        m.s = Math.max(2, rd.total - 12 - k++ * 16); // queued out of town
        m.dir = -1;
        Object.assign(e, { alive: true, s: 1 });
        this.place(e);
      } else {
        const b = this.r() * 6.28, d = this.r() * q.r * 0.8;
        Object.assign(e, { x: q.x + Math.cos(b) * d, z: q.z + Math.sin(b) * d, alive: true, s: 1 });
        m.h = b; // outward
        m.v = this.r.range(2.2, 3.4);
        e.panic = 6;
        this.place(e);
      }
    }
  }

  moveRoads(dt, hole) {
    for (const e of this.drivers ??= this.entities.filter((q) => q.mover?.type === 'road')) {
      if (!e.alive || e.falling || e.clog > 0) continue;
      const m = e.mover, rd = this.roads[m.road];
      // flee: drive away from the hole when it's on this road near them
      const dh = Math.hypot(hole.x - e.x, hole.z - e.z);
      m.t += dt;
      if (dh < hole.r * 3 + 40 && !hole.hidden) {
        const [ax, az] = this.roadAt(rd, m.s + m.dir * 5);
        if (Math.hypot(hole.x - ax, hole.z - az) < dh) m.dir = -m.dir; // heading into it: turn round
        m.boost = 1.6;
      } else m.boost = Math.max(1, (m.boost || 1) - dt * 0.3);
      m.s += m.dir * m.v * m.boost * dt;
      if (m.s > rd.total - 2 || m.s < 2) { m.dir = -m.dir; m.s = Math.max(2, Math.min(rd.total - 2, m.s)); }
      const [x, z, h] = this.roadAt(rd, m.s);
      const lane = 2.6 * m.dir; // keep right
      e.x = x - Math.sin(h) * -lane;
      e.z = z + Math.cos(h) * -lane;
      e.rot = -(h + (m.dir < 0 ? Math.PI : 0));
      e.y = Math.abs(Math.sin(m.t * 7)) * 0.03;
      this.place(e);
    }
  }

  /** The road network as one ribbon mesh (asphalt, white edge lines, a dashed centre line), laid on the terrain. */
  roadMesh() {
    const pos = [], uvs = [], idx = [];
    // palette swatch centres (ground material: asphalt, paving, concrete and dirt scans by swatch - surface.js GROUND)
    const UV = { asphalt: [6.5 / 8, 0.5 / 6], white: [1.5 / 8, 0.5 / 6], butter: [5.5 / 8, 1.5 / 6], pave: [0.5 / 8, 0.5 / 6], pave2: [4.5 / 8, 0.5 / 6],
      concrete: [4.5 / 8, 2.5 / 6], dirt: [5.5 / 8, 5.5 / 6], asphalt_lt: [7.5 / 8, 0.5 / 6] };
    // a continuous strip along a smoothed, resampled centre line (mitred: no overlapping quads to z-fight at bends),
    // flat across its width and lifted clear of the land under either edge
    const strip = (pts, off0, off1, lift, sw, dash = 0) => {
      let run = 0, prev = -1;
      for (let i = 0; i < pts.length; i++) {
        const [x, z] = pts[i], [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
        const L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L, nz = (bx - ax) / L;
        if (i) run += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
        const y = Math.max(this.groundY(x + nx * 5.5, z + nz * 5.5), this.groundY(x, z), this.groundY(x - nx * 5.5, z - nz * 5.5)) + lift;
        const b = pos.length / 3;
        pos.push(x + nx * off0, y, z + nz * off0, x + nx * off1, y, z + nz * off1);
        uvs.push(...UV[sw], ...UV[sw]);
        const on = !dash || Math.floor(run / dash) % 2 === 0;
        if (prev >= 0 && on) idx.push(prev, b, prev + 1, prev + 1, b, b + 1);
        prev = b;
      }
    };
    // settlement paving in each settlement's own frame: [u0, u1, v0, v1, swatch, lift]
    const rect = (q, u0, u1, v0, v1, sw, lift) => {
      const nu = Math.max(1, Math.round((u1 - u0) / 10)), nv = Math.max(1, Math.round((v1 - v0) / 10));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const cs = [[i, j], [i, j + 1], [i + 1, j], [i + 1, j + 1]].map(([a, b]) => {
          const [x, z] = this.at(q, u0 + ((u1 - u0) * a) / nu, v0 + ((v1 - v0) * b) / nv);
          return [x, this.groundY(x, z) + lift, z];
        });
        const b = pos.length / 3;
        for (const c of cs) { pos.push(...c); uvs.push(...UV[sw]); }
        idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
      }
    };
    for (const q of this.settlements) {
      if (q.kind === 'capital') {
        rect(q, -205, 205, -205, 205, 'concrete', 0.05);
        for (let k = -4; k <= 4; k++) { // avenues every 50 m, with dashed centre lines
          rect(q, -205, 205, k * 50 - 6, k * 50 + 6, 'asphalt', 0.1);
          rect(q, k * 50 - 6, k * 50 + 6, -205, 205, 'asphalt', 0.1);
          for (let d = -200; d < 200; d += 8) {
            rect(q, d, d + 4, k * 50 - 0.2, k * 50 + 0.2, 'white', 0.13);
            rect(q, k * 50 - 0.2, k * 50 + 0.2, d, d + 4, 'white', 0.13);
          }
        }
      } else if (q.kind === 'town') {
        rect(q, -110, 110, -30, 30, 'concrete', 0.05);
        rect(q, -30, 30, -110, 110, 'concrete', 0.05);
        rect(q, -110, 110, -6, 6, 'asphalt', 0.1);
        rect(q, -6, 6, -110, 110, 'asphalt', 0.1);
        rect(q, -24, 24, 24, 56, 'pave', 0.1); // market square
      } else if (q.kind === 'industry') {
        rect(q, -125, 125, -95, 95, 'asphalt_lt', 0.05); // tarmac yards
        rect(q, -125, 125, -6, 6, 'asphalt', 0.1);
      }
    }
    const insideTown = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < this.half - 1;
    for (const rd of this.roads) {
      const pts = rd.path.filter(([x, z]) => !insideTown(x, z));
      strip(pts, -5.5, 5.5, 0.2, 'asphalt');
      strip(pts, -5.0, -4.7, 0.24, 'white');
      strip(pts, 4.7, 5.0, 0.24, 'white');
      strip(pts, -0.15, 0.15, 0.24, 'butter', 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); // laid flat
    geo.computeBoundingSphere();
    this.roadMat = groundMaterial(this.holeField);
    this.roadMat.side = THREE.DoubleSide; // (strips are wound whichever way their settlement faces)
    this.roadsMesh = new THREE.Mesh(geo, this.roadMat);
    this.roadsMesh.receiveShadow = true;
    this.group.add(this.roadsMesh);
  }

  // ---------- crumbs ----------
  /** Terrain scatter (forests, hedges, rocks, cows, barns, windmills) as edible entities. */
  async plantCrumbs(slice) {
    const cache = new Map();
    const metaS = (name, s) => {
      const k = name + '|' + s.toFixed(2);
      if (!cache.has(k)) { const m = this.assets[name].meta; cache.set(k, { ...m, tier: m.tier * s, height: m.height * s, mass: m.mass * s ** 3 }); }
      return cache.get(k);
    };
    let n = 0;
    const t = this.terrain, deep = (x, z) => [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9]].every(([a, b]) => t.heightAt(x + a, z + b) < t.water - 1.2);
    for (let k = 0, boats = 0; k < 1500 && boats < 26; k++) { // sailboats and rowboats on the lakes (they float: not grounded)
      const x = this.r.range(-this.bound, this.bound), z = this.r.range(-this.bound, this.bound);
      if (Math.max(Math.abs(x), Math.abs(z)) < this.half + 40 || !deep(x, z)) continue;
      const name = this.r() < 0.6 ? 'sailboat' : 'rowboat';
      if (!this.assets[name]) continue;
      boats++;
      this.entities.push(makeEntity({ name, meta: metaS(name, 1), x, z, y: t.water - 0.05, rot: this.r() * 6.28, s: 1, gs: 1, alive: true, grounded: false,
        mover: { type: 'still', crumb: true } }));
    }
    let i = 0;
    for (const it of await run(this.terrain.scatterGen(this.assets), slice)) {
      if (++i % 800 === 0) await slice();
      if (Math.max(Math.abs(it.x), Math.abs(it.z)) < this.half + 4) continue; // not on the hometown's tiles
      if (it.name === 'barn' || it.name === 'windmill') { this.add(it.name, it.x, it.z, it.rot); continue; } // real buildings
      const s = Math.round(it.s * 20) / 20;
      this.entities.push(makeEntity({ name: it.name, meta: metaS(it.name, s), x: it.x, z: it.z, y: it.y - this.terrain.heightAt(it.x, it.z), rot: it.rot,
        s: 1, gs: s, alive: true, grounded: true, mover: { type: 'still', crumb: true, v: this.assets[it.name].flatVariants ? n++ % 3 : undefined } }));
    }
  }

  cellKey(x, z) { return Math.floor(x / 64) * 4096 + Math.floor(z / 64); }

  // ---------- ground ----------
  groundY(x, z) {
    if (Math.abs(x) < this.half && Math.abs(z) < this.half) return super.groundY(x, z);
    return this.terrain.sampleH(x, z);
  }

  /**
   * What the ground under the hole does to it (docs/PHASE2.md §6): roads are fast lanes, soft farmland a little quicker,
   * woods and marsh slower, open water much slower (the hole drains it). Returns a speed factor; .surface names it.
   */
  surfaceSpeed(x, z) {
    const t = this.terrain;
    let k = 1, name = null;
    if (Math.max(Math.abs(x), Math.abs(z)) < this.half) return 1; // the hometown
    if (t.roadDist(x, z) < 7) { k = 1.35; name = 'Road: full speed'; }
    else if (this.groundY(x, z) < t.water + 0.2) { k = 0.55; name = 'Draining the water: slow'; }
    else if (t.river && t.riverDist(x, z) < 14) { k = 0.7; name = 'Marsh: slow'; }
    else if (t.forest(x, z) > 0.5) { k = 0.88; name = 'Woodland'; }
    else if (t.fieldAt(x, z)) { k = 1.1; name = 'Soft farmland'; }
    this.surface = name;
    return k;
  }

  /** The ground plane under a hole's disc (for its rim on the hills): mean height and slope, capped at ~25 degrees. */
  groundTilt(x, z, r) {
    if (Math.abs(x) < this.half + r && Math.abs(z) < this.half + r) return null; // the town's flat tiles
    const t = this.terrain, e = Math.max(4, r * 0.8);
    const hx0 = t.sampleH(x - e, z), hx1 = t.sampleH(x + e, z), hz0 = t.sampleH(x, z - e), hz1 = t.sampleH(x, z + e);
    const k = Math.min(1, 0.47 / (Math.hypot(hx1 - hx0, hz1 - hz0) / (2 * e) || 1));
    return { y: Math.max(t.water, (hx0 + hx1 + hz0 + hz1) / 4), nx: ((hx1 - hx0) / (2 * e)) * k, nz: ((hz1 - hz0) / (2 * e)) * k };
  }

  /** LOD and shadow distances grow with the hole: the camera is hundreds of metres up. */
  lodScale(holeR) { return Math.max(1, holeR / 3); }

  budget(camera, holeR, lowSpec) {
    super.budget(camera, holeR, lowSpec);
    // just swapped in: new meshes join a few per frame, so their first-sight shader builds spread out under the dust
    if (this.reveal !== undefined && this.reveal < this.meshes.length) {
      this.reveal += 5;
      for (let i = this.reveal; i < this.meshes.length; i++) {
        const m = this.meshes[i];
        if (m.userData.ground) continue; // (the town's own ground stays: no holes in it)
        m.visible = false;
        if (m.userData.proxy) m.userData.proxy.visible = false;
      }
    }
    // the land: the cutting material only on sectors an open hole overlaps (tile GPUs keep hidden-surface removal elsewhere)
    const t = this.terrain;
    for (const m of t.sectors) {
      const sp = m.geometry.boundingSphere;
      let cut = false;
      for (const h of this.holeField.value) if (h.z > 0 && (h.x - sp.center.x) ** 2 + (h.y - sp.center.z) ** 2 < (sp.radius + h.z + 2) ** 2) { cut = true; break; }
      m.material = cut ? t.cutMat : t.solidMat;
    }
  }

  /**
   * Where a hole should head next (the HUD marker, the bot): the settlement with the most growth it can eat now, per
   * metre of travel. Settlements with nothing it can eat yet don't count.
   */
  target(hole) {
    let best = null, bs = 0;
    for (const q of this.settlements) {
      let v = 0;
      for (const e of q.list) {
        if (!e.alive || e.meta.tier >= hole.r * 0.9) continue;
        v += e.meta.tier * e.meta.tier * (0.06 + 0.94 * smooth(0.1, 0.5, e.meta.tier / hole.r));
      }
      if (!v) continue;
      const sc = v / (Math.max(0, Math.hypot(q.x - hole.x, q.z - hole.z) - q.r) + 250);
      if (sc > bs) { bs = sc; best = q; }
    }
    return best;
  }

  buildingsLeft() {
    let n = 0;
    for (const s of this.settlements) n += s.left ?? s.total;
    return n;
  }

  /** Per-settlement progress (called a few times a second). */
  tally() {
    for (const s of this.settlements) {
      let n = 0;
      for (const e of s.list) if (e.alive) n++;
      s.left = n;
      s.big = 0;
      for (const e of s.list) if (e.alive && e.meta.tier > s.big) s.big = e.meta.tier;
    }
  }

  update(dt, holes, jammed = false) {
    this.moveRoads(dt, holes[0]);
    const eaten = super.update(dt, holes, jammed);
    // crumbs: only the ones in grid cells under a hole are tested
    for (let h = 0; h < holes.length; h++) {
      const q = holes[h];
      if (q.hidden || (h === 0 && jammed) || !(q.r > 0)) continue;
      const R = q.r * (q.pull || 1);
      for (let cx = Math.floor((q.x - R) / 64); cx <= Math.floor((q.x + R) / 64); cx++) {
        for (let cz = Math.floor((q.z - R) / 64); cz <= Math.floor((q.z + R) / 64); cz++) {
          const list = this.crumbGrid.get(cx * 4096 + cz);
          if (!list) continue;
          for (const e of list) {
            if (!e.alive || e.falling) continue;
            const tier = e.meta.tier, dx = e.x - q.x, dz = e.z - q.z;
            if (tier < q.r * 0.95 && dx * dx + dz * dz < (R - tier * 0.25) ** 2) {
              e.falling = true;
              e.eater = q;
              e.vy = 0;
              e.tiltDir = Math.atan2(dz, dx);
              this.fallingCrumbs.push(e);
              this.events.push({ type: 'fall', e, crumb: true });
            }
          }
        }
      }
    }
    for (const e of this.fallingCrumbs) this.fall(e, dt, e.eater, eaten);
    this.fallingCrumbs = this.fallingCrumbs.filter((e) => e.alive);
    for (const mesh of this.dirty) mesh.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
    if ((this.tallyT = (this.tallyT || 0) - dt) <= 0) { this.tallyT = 0.4; this.tally(); }
    return eaten;
  }

  dispose() {
    super.dispose();
    this.roadsMesh.geometry.dispose();
    this.roadMat.dispose();
    this.terrain.cutMat?.dispose();
  }
}
