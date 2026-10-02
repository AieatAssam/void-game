// Phase 3 (docs/PHASE3.md): tuning and the size ladder. Pure data + small functions (no three, no DOM). Distances in metres.
// Starting values for the bot balance pass (docs/BALANCE.md).
const lerp = (a, b, k) => a + (b - a) * k;
const KM = 1000;

// scale tiers (docs/PHASE3.md §12.1): [floor r (m), name card]
export const TIERS = [
  { n: 1, r: 40 * KM, name: 'REGIONS' },
  { n: 2, r: 150 * KM, name: 'NATIONS' },
  { n: 3, r: 450 * KM, name: 'CONTINENTS' },
  { n: 4, r: 1200 * KM, name: 'THE WORLD' },
];
// smooth ramps: r in metres, smoothstep in log r between anchors. VIEW = [r, pitch (deg), relief exaggeration E, aim (deg: the camera looks this far above the hole, so the limb is in frame)]
const VIEW = [
  [40 * KM, 25, 3, 7], [150 * KM, 36, 4, 4], [450 * KM, 40, 6, 0], [1200 * KM, 36, 7, 0], [2400 * KM, 32, 7, 0],
];
// land credit G(r): the §12.1 anchors (swath-only sim values)
const GRAMP = [[40 * KM, 0.035], [150 * KM, 0.05], [450 * KM, 0.08], [1000 * KM, 0.13], [1600 * KM, 0.2], [2600 * KM, 0.3]]; // (R4 balance, docs/BALANCE.md: the doc's anchors 0.06 / 0.065 / 0.09 put the bot into T2 in 100 s; these give 4.5-6 min a tier on the unit bot)
function ramp(tab, r, col) {
  if (r <= tab[0][0]) return tab[0][col];
  for (let i = 1; i < tab.length; i++) {
    if (r <= tab[i][0]) {
      const k = Math.log(r / tab[i - 1][0]) / Math.log(tab[i][0] / tab[i - 1][0]);
      return lerp(tab[i - 1][col], tab[i][col], k * k * (3 - 2 * k));
    }
  }
  return tab.at(-1)[col];
}

export const P3 = {
  // movement (§12.1): 24 km/s at the start, 585 km/s at 2.4k km. NOT a constant 0.6 r/s: the sweep (2 r v) grows with r^2 and the slowing screen speed is the "mass" cue.
  speedExp: -0.30, // (balance knob: a more negative exponent slows the big hole down)
  speed: (r) => 0.6 * r * (r / (40 * KM)) ** P3.speedExp,
  turn: (r) => 0.45 * (r / (40 * KM)) ** 0.14, // steering smoothing time constant (s): the hole gets heavier (0.8 s at 2.4k km)
  pitch: (r) => ramp(VIEW, r, 1) * Math.PI / 180,
  relief: (r) => ramp(VIEW, r, 2),
  aim: (r) => ramp(VIEW, r, 3), // degrees
  gScale: 1.06, // global multiplier on the G ramp (balance knob)
  gRamp: GRAMP, // (mutable for sweeps: __P3.gRamp[0][1] = ...)
  g: (r) => P3.gScale * ramp(P3.gRamp, r, 1),
  tier: (r) => { let t = 1; for (const q of TIERS) if (r >= q.r * 0.999 || q.n === 1) t = q.n; return t; },
  tierName: (r) => TIERS[P3.tier(r) - 1].name,
  camDist: (r) => 14 + 8 * r, // x portrait x LENS in the game
  crust: 300, // C: m of crust under every land column (lowlands are not free)
  chewT: 1.2, // s to chew one bite depth
  depth: (r) => 0.03 * r, // D(r): bite depth (§12.2)
  wallK: 4, // a column taller than wallK * D(r) = 0.12 r is a wall
  texelBudget: 14000, // bite-map texels visited per frame (the doc's 40k measured ~6 ms in JS: 150 ns/texel; round robin keeps it exact on average)
  capR: 150 * KM, // patch -> globe only, rim -> shader cap (one-way)
  patchMax: 150 * KM,
  // belly / decay: land credit tops the belly up 1:1 in area terms
  bellyDrain: 1 / 30, meal: 0.06, decayFed: 0.0010, decayStarving: 0.005, huntSoft: 0.3, // decay fades out between 67% and 97% of the land eaten (then none: the hunt)
  oceanSpeed: (tier) => (tier < 3 ? 0.85 : tier === 3 ? 0.92 : 1), // (§3: 0.6 / 0.85 felt like wading)
  oceanDrain: (tier) => (tier < 3 ? 1.1 : tier === 3 ? 1.05 : 1),
  feast: 1, // land-credit multiplier (?feast=N overrides: balance knob)
  floorK: 0.7, // the hole never shrinks below floorK x the floor of the highest tier reached (stand-in for the Sealed loss)
  heightK: 1, // how much of the relief exaggeration E the walls and ridge drag see past T1 (A10; 0 = the raw heights)
  collapseK: 0.3, // credit multiplier on torn-off land (§12.3; 1.0 gave a 60% tear share and a 9 min game; 0.3 -> ~35%, 0.2 -> ~23% but 29 min games)
  startR: 40 * KM,
};

// Threat tuning (docs/PHASE3-REVIEW.md A9): damage is the larger of the old fixed fraction and `k` seconds of current income (state.gRate), so a hit costs the same
// number of seconds of progress at every tier. Bonuses are the area multipliers for swallowing the weapons (x mods.gulp).
export const T3 = {
  nukeK: 25, rodK: 25, bomberK: 12, // seconds of income lost to a hit
  nukeHit: 0.07, rodHit: 0.08, bomberHit: 0.06, firstHit: 0.07, // floors (the scripted first ICBM is capped at firstHit)
  nukeGulp: 0.03, rodGulp: 0.02, satGulp: 0.01,
  falloutLife: 45, falloutLand: 0.5, grace: 14,
  satEat: 0.7, // a satellite is swallowed when its subpoint passes within this x r of the hole
  // WP-B (docs/PHASE3-REVIEW.md B0): the director's numbers per kind. cost = budget points, cool = [min, max] s between spawns of the kind.
  cap: { build: 2, peak: 3, relax: 1 }, // live telegraphs by tension phase; +1 at DEFCON <= 2 (build / peak)
  refill: [0.6, 0.2], // budget per s = a + b x (5 - DEFCON)
  coolK: [1, 1, 1, 0.85, 0.7], // cooldown multiplier by tier 1..5 (T1-T2 gentle, T4 extinction-level)
  kinds: {
    bomber: { cost: 3, cool: [42, 56] }, nuke: { cost: 6, cool: [48, 68] }, rod: { cost: 5, cool: [55, 75] },
    mirv: { cost: 10, cool: [90, 120], hit: 0.04, k: 14, cap: 0.15, gulp: 0.02, children: 4 },
    laser: { cost: 8, cool: [80, 105], rate: 0.02, k: 1.1, sweep: 0.3, dur: 12, jam: 0.8, gulp: 0.02 },
    fleet: { cost: 3, cool: [60, 85], hit: 0.04, k: 8, eat: 0.015, all: 0.03, salvo: 12 },
    tsunami: { cost: 0, cool: [60, 80], hit: 0.03, k: 8, rubble: 1.5 },
    volcano: { cost: 0, cool: [150, 200], hit: 0.03, k: 8, surge: 1.5 },
    aegis: { hit: 0.12, gulp: 0.08, retry: 90, tries: 3, r: 800e3 },
    exodus: { cost: 0, cool: [70, 95], eat: 0.003 },
    cracker: { hit: 0.2, gulp: 0.05, land: 0.9 },
    rival: { maw: 1.3, eater: 1.4, speed: 0.74, hit: 0.25, eat: 0.6, cap: 0.25, starve: 0.0015, grow: 0.55 },
  },
};
