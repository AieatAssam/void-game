// Phase 4 content (docs/PHASE4.md): one tier = a freshly generated field of bodies in the tier's own unit (the hole's radius at the start of the tier, `unit` km).
// Positions are doubles in tier units; src/space.js draws them relative to the hole in units of the hole's radius, so nothing here ever meets a float32.
// A body: { k kind, x z, b radius, w weight, a ang om orbit (round cx, cz), vx vz drift, A B colours, p1 p2 shader params, name, key, ring, state }.

export const K = { rock: 0, world: 1, giant: 2, star: 3, comet: 4, cluster: 5, galaxy: 6, cloud: 7, prop: 8 };

/** Seeded generator (mulberry32). */
export const rng = (a) => () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const TAU = Math.PI * 2;
/** Weight of a body: what it pays toward the tier's progress. Sub-linear in size so the swarms of small things matter, comets pay extra. */
const weight = (b, k, a = 0.65) => Math.pow(b, a) * (k === K.comet ? 2.2 : 1) * (b < 0.05 ? 0.3 : 1);

const ROCK = [[0x8a8178, 0x5e564e], [0x9c8f7d, 0x6b5f52], [0x77716b, 0x4b4742], [0xa89c88, 0x7a6b58], [0x6f6a73, 0x45414a], [0xb08a68, 0x7d5b3f], [0x8b8f94, 0x575c63]];
const ICE = [[0xdfe8ee, 0xa9bccb], [0xcfd8e0, 0x8fa4b8], [0xe8e2d8, 0xb8aea0]];

/** A swarm of n rocks (some icy) orbiting between radii a0 and a1, sizes log-uniform in [lo, hi]. */
function swarm(rnd, B, n, lo, hi, a0, a1, ice = 0.15) {
  for (let i = 0; i < n; i++) {
    const a = a0 + rnd() * (a1 - a0), pal = rnd() < ice ? ICE : ROCK, c = pal[(rnd() * pal.length) | 0];
    B({ k: K.rock, a, ang: rnd() * TAU, om: 0.0042 / Math.sqrt(a / 40) * (0.8 + rnd() * 0.4), b: lo * Math.pow(hi / lo, rnd()), A: c[0], B: c[1], p1: 1 + rnd() * 3, p2: rnd() });
  }
}

/** Log-uniform size in [lo, hi]. */
const logU = (rnd, lo, hi) => lo * Math.pow(hi / lo, rnd());

/**
 * Tier table. growth = r1 / r0. `goal` = share of the weight that ends the tier (the rest is swept in by the tier-up).
 * `sun`: where the light comes from in tier units (null: a fixed direction). `hazards`: the hook for the adversity pass.
 */

const pick = (rnd, a) => a[(rnd() * a.length) | 0];
/** A point in a disc of radius f. */
const spot = (rnd, f) => { const a = rnd() * TAU, d = f * Math.sqrt(rnd()); return [Math.cos(a) * d, Math.sin(a) * d]; };
/**
 * A scale-aware field: n bodies with log-uniform sizes in [lo, hi]; a body of size s lives in a disc of radius max(14, 17 s) round the start (about four of its own sizes between neighbours), so there is always a neighbour of about the
 * hole's size at any stage of the tier. spec(s) returns the body's kind and look. They drift slowly (a tenth of their own size a second).
 */
let DENS = 1; // (set per tier by buildTier: how many times the listed body counts)
function field(rnd, B, n, lo, hi, spec) {
  n = Math.round(n * DENS);
  for (let i = 0; i < n; i++) {
    const s = lo * Math.pow(hi / lo, rnd()), [x, z] = spot(rnd, Math.max(18, 28 * s)), o = spec(s), v = 0.1 * s * (rnd() - 0.5) * 2, v2 = 0.1 * s * (rnd() - 0.5) * 2;
    B({ ...o, b: s, x, z, vx: v, vz: v2 });
  }
}
/** n hero props (a Blender model, art/space/build_props.py), sizes log-uniform in [lo, hi], placed like field() does. */
function props(rnd, B, model, name, n, lo, hi) {
  for (let i = 0; i < n; i++) {
    const s = lo * Math.pow(hi / lo, rnd()), [x, z] = spot(rnd, Math.max(18, 28 * s));
    B({ k: K.prop, model, name, b: s, x, z, vx: 0.05 * s * (rnd() - 0.5) * 2, vz: 0.05 * s * (rnd() - 0.5) * 2, A: 0xffffff, B: 0xffffff });
  }
}
/** A star of size s (units of the tier's unit): cool and small, or hot and huge; colour from a temperature drawn by size. */
function starBody(rnd, s, redBias) {
  const u = rnd(), cool = u < 0.28 * redBias + (s > 30 ? 0.2 : 0);
  const pal = cool ? [[0xff9a6a, 0xc8401e], [0xffb070, 0xe0742a]] : u < 0.55 ? [[0xffe8a0, 0xff9a38]] : u < 0.8 ? [[0xfff6e0, 0xffd080], [0xf2f6ff, 0xb8c8ff]] : [[0xb8d4ff, 0x5a80ff], [0xd0e0ff, 0x7aa0ff]];
  const c = pal[(rnd() * pal.length) | 0];
  return { k: K.star, A: c[0], B: c[1], p1: 3, p2: rnd() };
}

export const TIERS = [
  {
    id: 1, name: 'Rubble', unit: 2500, growth: 4, goal: 0.4, field: 80, sun: [0, 0], hazards: [],
    blurb: 'The outer dark: dwarf worlds, comets, rubble', sky: { a: [0.05, 0.07, 0.16], b: [0.14, 0.06, 0.2], k: 0.7 },
    start: [46, 0],
    make(rnd, B) {
      swarm(rnd, B, 120, 0.05, 0.6, 30, 52); swarm(rnd, B, 420, 0.012, 0.05, 30, 52);
      // what was left of Earth's orbit
      props(rnd, B, 'sat_comm', 'a satellite', 12, 0.18, 0.55); props(rnd, B, 'station', 'the station', 3, 0.5, 0.95); props(rnd, B, 'capsule', 'a capsule', 7, 0.14, 0.4); props(rnd, B, 'rocket_stage', 'a rocket stage', 9, 0.16, 0.5); props(rnd, B, 'telescope', 'the telescope', 2, 0.4, 0.7); props(rnd, B, 'probe', 'a probe', 4, 0.2, 0.5); // the belt: a torus of rocks round the sun, a fat tail of tiny ones
      // dwarf worlds and moonlets (the ladder up to Mars-size)
      const names = ['Ceres', 'Vesta', 'Pluto', 'Eris', 'Haumea', 'Makemake', 'Triton', 'Titan', 'Ganymede', 'Callisto', 'Io', 'Europa', 'Mercury', 'Mars'];
      const sizes = [0.19, 0.1, 0.47, 0.46, 0.3, 0.28, 0.54, 1.03, 1.05, 0.96, 0.73, 0.62, 0.98, 1.36];
      for (let i = 0; i < names.length; i++) {
        const a = 20 + rnd() * 40, big = sizes[i] > 0.9, ice = ['Pluto', 'Eris', 'Makemake', 'Triton', 'Europa', 'Haumea'].includes(names[i]);
        const c = ice ? ICE[i % 3] : big && names[i] !== 'Mercury' ? [0xc9966a, 0x7a4f35] : ROCK[i % ROCK.length];
        B({ k: names[i] === 'Mars' || names[i] === 'Titan' ? K.world : K.rock, a, ang: rnd() * TAU, om: 0.0035 / Math.sqrt(a / 40), b: sizes[i], A: c[0], B: c[1], p1: 2 + rnd() * 2, p2: rnd(), name: names[i] });
      }
      // comets: a head, a tail away from the sun, on a slow flyby (they wrap round the field)
      for (let i = 0; i < 9; i++) {
        const ang = rnd() * TAU, d = 30 + rnd() * 40, sp = 0.5 + rnd() * 0.7, tw = (rnd() - 0.5) * 1.2;
        B({ k: K.comet, x: Math.cos(ang) * d, z: Math.sin(ang) * d, vx: -Math.cos(ang + tw) * sp, vz: -Math.sin(ang + tw) * sp, b: 0.05 + rnd() * 0.09, A: 0x8d95a0, B: 0x5a606a, p1: 1, p2: rnd(), tail: 5 + rnd() * 5 });
      }
    },
  },
  {
    id: 2, name: 'Worlds', unit: 10000, growth: 4, goal: 0.4, field: 80, sun: [0, 0], hazards: ['flare'],
    blurb: 'Moons, the inner worlds, the ice giants', sky: { a: [0.04, 0.08, 0.15], b: [0.1, 0.09, 0.22], k: 0.8 },
    start: [-40, 14],
    make(rnd, B) {
      swarm(rnd, B, 120, 0.04, 0.3, 24, 58); swarm(rnd, B, 300, 0.012, 0.04, 24, 58);
      props(rnd, B, 'monolith', 'The Monolith', 1, 0.45, 0.45); props(rnd, B, 'sat_comm', 'a satellite', 5, 0.08, 0.25);
      const W = [
        ['Mercury', K.rock, 0.24, 0x9d9588, 0x655d54], ['Mars', K.world, 0.34, 0xc4673a, 0x7d3a22], ['Venus', K.world, 0.6, 0xe6c88a, 0xb8884a], ['Luna II', K.rock, 0.17, 0xb4b0aa, 0x7b7771],
        ['Ganymede', K.rock, 0.26, 0x9c8f7d, 0x5e564e], ['Titan', K.world, 0.26, 0xd9a55a, 0x8f5f26], ['Callisto', K.rock, 0.24, 0x6f6a73, 0x45414a], ['Io', K.rock, 0.18, 0xe4cc5a, 0xb4682a],
        ['Europa', K.rock, 0.16, 0xe8e2d8, 0xb08a68], ['Triton', K.rock, 0.14, 0xdfe8ee, 0xa9bccb], ['Charon', K.rock, 0.06, 0x9a9690, 0x6a6660], ['Phobos', K.rock, 0.012, 0x77716b, 0x4b4742],
        ['Uranus', K.giant, 2.54, 0x9ee6e0, 0x6fb8c4], ['Neptune', K.giant, 2.46, 0x4f76e8, 0x2c3fa8], ['Pluto', K.rock, 0.12, 0xd9c8b4, 0x9a8470],
      ];
      for (const [name, k, b, A, Bc] of W) {
        const a = 22 + rnd() * 36;
        B({ k, a, ang: rnd() * TAU, om: 0.0034 / Math.sqrt(a / 40), b, A, B: Bc, p1: k === K.giant ? 6 : 2 + rnd() * 2, p2: rnd(), name, ring: name === 'Uranus' });
      }
      for (let i = 0; i < 7; i++) {
        const ang = rnd() * TAU, d = 30 + rnd() * 40, sp = 0.5 + rnd() * 0.6;
        B({ k: K.comet, x: Math.cos(ang) * d, z: Math.sin(ang) * d, vx: -Math.cos(ang) * sp, vz: -Math.sin(ang) * sp, b: 0.03 + rnd() * 0.05, A: 0x8d95a0, B: 0x5a606a, p1: 1, p2: rnd(), tail: 5 + rnd() * 5 });
      }
    },
  },
  {
    id: 3, name: 'Giants', unit: 40000, growth: 8, goal: 0.6, field: 90, sun: 'key', hazards: ['flare', 'tidal'],
    blurb: 'Saturn, Jupiter and the Sun', sky: { a: [0.07, 0.06, 0.13], b: [0.2, 0.1, 0.12], k: 0.9 },
    start: [-34, 40],
    make(rnd, B) {
      // the Sun at the middle: a body 17 radii across that is nibbled, not swallowed
      B({ k: K.star, x: 0, z: 0, b: 17.4, A: 0xffd070, B: 0xff7a1a, p1: 3, p2: 0.3, name: 'The Sun', key: true });
      swarm(rnd, B, 120, 0.04, 0.5, 26, 66); swarm(rnd, B, 300, 0.01, 0.04, 26, 66);
      const W = [
        ['Jupiter', K.giant, 1.75, 0xe8c9a0, 0xb87c4a, 11, false], ['Saturn', K.giant, 1.45, 0xf0d9a4, 0xc9a566, 9, true], ['Uranus', K.giant, 0.63, 0x9ee6e0, 0x6fb8c4, 6, false], ['Neptune', K.giant, 0.62, 0x4f76e8, 0x2c3fa8, 6, false],
        ['Venus', K.world, 0.15, 0xe6c88a, 0xb8884a], ['Mars', K.world, 0.085, 0xc4673a, 0x7d3a22], ['Mercury', K.rock, 0.06, 0x9d9588, 0x655d54],
        ['Ganymede', K.rock, 0.066, 0x9c8f7d, 0x5e564e], ['Titan', K.world, 0.064, 0xd9a55a, 0x8f5f26], ['Callisto', K.rock, 0.06, 0x6f6a73, 0x45414a], ['Io', K.rock, 0.045, 0xe4cc5a, 0xb4682a], ['Europa', K.rock, 0.04, 0xe8e2d8, 0xb08a68],
      ];
      const orbit = [38, 52, 30, 62];
      for (let i = 0; i < W.length; i++) {
        const [name, k, b, A, Bc, bands, ring] = W[i], a = orbit[i] ?? 24 + rnd() * 44;
        B({ k, a, ang: rnd() * TAU, om: 0.0032 / Math.sqrt(a / 40), b, A, B: Bc, p1: bands || 2 + rnd() * 2, p2: rnd(), name, ring: !!ring });
      }
      for (let i = 0; i < 6; i++) {
        const ang = rnd() * TAU, d = 40 + rnd() * 30, sp = 0.5 + rnd() * 0.6;
        B({ k: K.comet, x: Math.cos(ang) * d, z: Math.sin(ang) * d, vx: -Math.cos(ang) * sp, vz: -Math.sin(ang) * sp, b: 0.02 + rnd() * 0.03, A: 0x8d95a0, B: 0x5a606a, p1: 1, p2: rnd(), tail: 5 + rnd() * 5 });
      }
    },
  },

  // ---- beyond the solar system: the field is laid out per size class (a body of size s lives in a disc of radius ~ 40 s), so there is always a neighbour of about the hole's size
  {
    id: 4, wexp: 0.3, name: 'Stars', unit: 320000, growth: 40, goal: 0.55, field: 0, sun: null, hazards: ['flare', 'tidal', 'supernova'], blurb: 'Dwarfs, giants, the neighbours', sky: { a: [0.04, 0.05, 0.14], b: [0.2, 0.08, 0.16], k: 1.0 }, start: [0, 0],
    make(rnd, B) {
      field(rnd, B, 190, 0.12, 60, (s) => starBody(rnd, s, 0.9));
      for (let i = 0; i < 120; i++) { const s = logU(rnd, 0.03, 0.12), [x, z] = spot(rnd, 14); const c = ROCK[(rnd() * ROCK.length) | 0]; B({ k: K.rock, x, z, b: s, A: c[0], B: c[1], p1: 1 + rnd() * 3, p2: rnd(), vx: (rnd() - 0.5) * 0.3, vz: (rnd() - 0.5) * 0.3 }); } // rogue planets and dust
    },
  },
  {
    id: 5, wexp: 0.25, name: 'Systems', unit: 12800000, growth: 60, goal: 0.55, field: 0, sun: null, hazards: ['flare', 'tidal', 'supernova'], blurb: 'Whole planetary systems, one gulp each', sky: { a: [0.05, 0.04, 0.16], b: [0.12, 0.14, 0.26], k: 1.1 }, start: [0, 0],
    make(rnd, B) {
      field(rnd, B, 170, 0.15, 80, (s) => ({ ...starBody(rnd, s, 0.7), ring: rnd() < 0.55, ringS: 2.2 + rnd() * 2 })); // a star and its disc: a system
      props(rnd, B, 'ringworld', 'a ringworld', 7, 0.8, 18);
      field(rnd, B, 40, 0.25, 40, (s) => ({ k: K.cluster, A: 0xb8d0ff, B: 0x6a8cff, p1: 2, p2: rnd(), name: '' })); // knots of young stars
    },
  },
  {
    id: 6, wexp: 0.1, name: 'Clusters', unit: 768000000, growth: 300, goal: 0.55, field: 0, sun: null, hazards: ['flare', 'tidal', 'supernova'], blurb: 'Star clusters and the nebulae that made them', sky: { a: [0.06, 0.04, 0.12], b: [0.22, 0.1, 0.2], k: 1.3 }, start: [0, 0],
    make(rnd, B) {
      field(rnd, B, 110, 0.2, 400, (s) => ({ k: K.cluster, A: pick(rnd, [0xffe2b0, 0xb8d0ff, 0xffc8a0]), B: 0xff8a50, p1: 2 + rnd() * 2, p2: rnd() }));
      field(rnd, B, 90, 0.4, 600, (s) => ({ k: K.cloud, tile: 3, tint: pick(rnd, [0xff6a9a, 0x6aa8ff, 0x7affc8, 0xffb060]), tilt: rnd() * 0.5, p1: rnd(), A: 0xff7ab0, B: 0x6aa8ff }));
      field(rnd, B, 60, 0.1, 40, (s) => starBody(rnd, s, 0.8));
      props(rnd, B, 'neutron_star', 'a neutron star', 14, 0.3, 60);
    },
  },
  {
    id: 7, wexp: 0, name: 'The Arm', unit: 230400000000, growth: 4000, goal: 0.55, field: 0, sun: null, hazards: ['flare', 'tidal', 'supernova'], blurb: 'Clouds, clusters and a spiral arm', sky: { a: [0.06, 0.05, 0.14], b: [0.18, 0.12, 0.28], k: 1.5 }, start: [0, 0],
    make(rnd, B) {
      field(rnd, B, 130, 0.12, 2400, (s) => ({ k: K.cluster, A: pick(rnd, [0xffe2b0, 0xb8d0ff, 0xffd8a0]), B: 0xff9a60, p1: 2 + rnd() * 2, p2: rnd() }));
      field(rnd, B, 110, 0.3, 3000, (s) => ({ k: K.cloud, tile: 3, tint: pick(rnd, [0xff6a9a, 0x6aa8ff, 0x7affc8, 0xffb060, 0xb88aff]), tilt: rnd() * 0.5, p1: rnd(), A: 0xff7ab0, B: 0x6aa8ff }));
      field(rnd, B, 40, 0.08, 40, (s) => starBody(rnd, s, 0.8));
      props(rnd, B, 'dyson', 'a Dyson shell', 12, 0.4, 600); props(rnd, B, 'neutron_star', 'a neutron star', 8, 0.3, 200);
    },
  },
  {
    id: 8, wexp: 0, name: 'The Galaxy', unit: 921600000000000, growth: 1500, goal: 0.6, field: 0, sun: null, hazards: ['flare', 'tidal', 'supernova'], blurb: 'The Milky Way, in one piece', sky: { a: [0.04, 0.04, 0.12], b: [0.12, 0.1, 0.24], k: 1.2 }, start: [0, 0],
    make(rnd, B) {
      B({ k: K.galaxy, tile: 0, tint: 0xffffff, x: 900, z: -700, b: 520, name: 'The Milky Way', key: true, tilt: 0.5, A: 0xffffff, B: 0xffffff });
      field(rnd, B, 150, 0.1, 2200, (s) => ({ k: K.cluster, A: pick(rnd, [0xffe2b0, 0xb8d0ff]), B: 0xff9a60, p1: 2 + rnd() * 2, p2: rnd() })); // globular clusters, the halo
      field(rnd, B, 90, 2.0, 3000, (s) => ({ k: K.galaxy, tile: (rnd() * 4) | 0, tint: pick(rnd, [0xffe8d0, 0xd0e0ff, 0xffffff]), tilt: rnd() * 1.1, A: 0xffffff, B: 0xffffff })); // satellite dwarfs
    },
  },
  {
    id: 9, wexp: 0, name: 'Local Group', unit: 1382400000000000000, growth: 300, goal: 0.55, field: 0, sun: null, hazards: ['flare', 'tidal', 'supernova'], blurb: 'Galaxies, a hundred thousand light-years each', sky: { a: [0.03, 0.04, 0.1], b: [0.1, 0.08, 0.2], k: 0.8 }, start: [0, 0],
    make(rnd, B) {
      field(rnd, B, 200, 0.04, 90, (s) => ({ k: K.galaxy, tile: (rnd() * 4) | 0, tint: pick(rnd, [0xffe8d0, 0xd0e0ff, 0xffffff, 0xffd0c0]), tilt: rnd() * 1.2, A: 0xffffff, B: 0xffffff }));
    },
  },
  {
    id: 10, wexp: 0, name: 'Superclusters', unit: 414720000000000000000, growth: 100, goal: 0.55, field: 0, sun: null, hazards: ['flare', 'tidal', 'supernova'], blurb: 'Clusters of galaxies, walls of clusters', sky: { a: [0.03, 0.03, 0.09], b: [0.1, 0.06, 0.18], k: 0.6 }, start: [0, 0],
    make(rnd, B) {
      field(rnd, B, 190, 0.05, 80, (s) => ({ k: K.galaxy, tile: (rnd() * 4) | 0, tint: pick(rnd, [0xffe8d0, 0xd0e0ff, 0xffffff, 0xffb8a0, 0xb8c8ff]), tilt: rnd() * 1.2, A: 0xffffff, B: 0xffffff }));
    },
  },
  {
    id: 11, wexp: 0, name: 'The Universe', unit: 41472000000000000000000, growth: 10, goal: 0.6, field: 0, sun: null, hazards: ['flare', 'tidal', 'supernova'], blurb: 'The cosmic web. The last meal.', sky: { a: [0.02, 0.02, 0.06], b: [0.08, 0.04, 0.14], k: 0.5 }, start: [0, 0],
    make(rnd, B) {
      field(rnd, B, 170, 0.05, 15, (s) => ({ k: K.galaxy, tile: (rnd() * 4) | 0, tint: pick(rnd, [0xffe8d0, 0xd0e0ff, 0xffffff, 0xb8a0ff]), tilt: rnd() * 1.2, A: 0xffffff, B: 0xffffff }));
    },
  },
];

/** Build a tier's bodies (deterministic from the seed). Returns { bodies, total (weight), key } */
export function buildTier(tier, seed) {
  DENS = tier.dens ?? 1;
  const rnd = rng((seed * 2654435761 + tier.id * 40503) >>> 0), bodies = [];
  let total = 0, id = 0;
  tier.make(rnd, (s) => {
    const o = {
      id: id++, k: s.k, b: s.b, b0: s.b, hp: 1, A: hex(s.tint ?? s.A), B: hex(s.B ?? s.A), p1: s.p1 || 1, p2: s.p2 || 0, name: s.name || '', key: !!s.key, ring: !!s.ring, tail: s.tail || 0,
      a: s.a || 0, ang: s.ang || 0, om: s.om || 0, x: s.x || 0, z: s.z || 0, vx: s.vx || 0, vz: s.vz || 0, state: 0, t: 0, orbit: s.a != null, tile: s.tile || 0, model: s.model || '', tilt: s.tilt || 0, ringS: s.ringS || 2.25,
      w: weight(s.b, s.k, tier.wexp ?? 0.65), sx: 0, sz: 0, spin: rnd() * TAU, spinV: (rnd() - 0.5) * 0.6,
    };
    if (o.orbit) { o.x = Math.cos(o.ang) * o.a; o.z = Math.sin(o.ang) * o.a; }
    if (o.key) o.w *= 1.5;
    total += o.w; bodies.push(o);
  });
  // a few golden bodies: a rare, bright, fat meal worth five times its size (the arrow likes them)
  const cands = bodies.filter((b) => !b.key && b.k !== K.prop && b.k !== K.comet && b.b >= 0.15 && b.b <= 0.75);
  for (let i = 0; i < 4 && cands.length; i++) {
    const o = cands.splice((rnd() * cands.length) | 0, 1)[0];
    total += o.w * 4; o.w *= 5; o.gold = true; o.A = [1, 0.82, 0.3]; o.B = [0.9, 0.5, 0.1]; o.name = o.name ? `golden ${o.name}` : 'a golden body';
  }
  return { bodies, total, key: bodies.find((b) => b.key) || null };
}

let uid = 100000;
/** A loose rock for events (a meteor storm): radius b in tier units, flying at (vx, vz). */
export function looseRock(rnd, b, x, z, vx, vz, ttl = 16) {
  const c = ROCK[(rnd() * ROCK.length) | 0];
  return { id: uid++, k: K.rock, b, b0: b, hp: 1, A: hex(c[0]), B: hex(c[1]), p1: 1 + rnd() * 3, p2: rnd(), name: '', key: false, ring: false, tail: 0, a: 0, ang: 0, om: 0, x, z, vx, vz, state: 0, t: 0, orbit: false,
    w: weight(b, K.rock), sx: 0, sz: 0, spin: rnd() * TAU, spinV: (rnd() - 0.5) * 1.4, eph: ttl };
}
export { rng as _rng };

/** A prop made on the spot (a supernova's neutron star), worth a bit more than its size says. */
export function looseProp(tier, model, b, x, z, A = 0xcfe4ff) {
  return { id: uid++, k: K.prop, model, b, b0: b, hp: 1, A: hex(A), B: hex(A), p1: 1, p2: 0, name: 'a neutron star', key: false, ring: false, tail: 0, a: 0, ang: 0, om: 0, x, z, vx: 0, vz: 0, state: 0, t: 0, orbit: false, tile: 0, tilt: 0, ringS: 2, w: 2 * weight(b, K.prop, tier.wexp ?? 0.65), sx: 0, sz: 0, spin: 0, spinV: 0.4 };
}

// Balance (human-like bot suites, docs/PHASE4.md section 5): the scale-aware tiers got denser and longer so each takes minutes, not seconds.
for (const t of TIERS) if (t.id >= 4) { t.dens = t.id === 7 || t.id === 9 || t.id === 10 ? 2.4 : t.id === 11 ? 1.9 : 1.6; t.goal = t.id === 8 ? 0.75 : t.id === 11 ? 0.85 : 0.88; t.minTime = 100; } // (the hole may not swell faster than ln(growth) / minTime a second: a tier lasts at least a hundred seconds)
