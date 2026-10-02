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
const GRAMP = [[40 * KM, 0.035], [150 * KM, 0.04], [450 * KM, 0.055], [1000 * KM, 0.09], [1600 * KM, 0.2], [2600 * KM, 0.3]]; // (R3 interim: the doc's 0.06 / 0.065 at T1-T2 put the stand-in bot into T2 in 100 s)
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
  speed: (r) => 0.6 * r * (r / (40 * KM)) ** -0.22,
  turn: (r) => 0.45 * (r / (40 * KM)) ** 0.14, // steering smoothing time constant (s): the hole gets heavier (0.8 s at 2.4k km)
  pitch: (r) => ramp(VIEW, r, 1) * Math.PI / 180,
  relief: (r) => ramp(VIEW, r, 2),
  aim: (r) => ramp(VIEW, r, 3), // degrees
  gScale: 1, // global multiplier on the G ramp (balance knob)
  g: (r) => P3.gScale * ramp(GRAMP, r, 1),
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
  bellyDrain: 1 / 30, meal: 0.06, decayFed: 0.0010, decayStarving: 0.008,
  oceanSpeed: (tier) => (tier < 3 ? 0.85 : tier === 3 ? 0.92 : 1), // (§3: 0.6 / 0.85 felt like wading)
  oceanDrain: (tier) => (tier < 3 ? 1.1 : tier === 3 ? 1.05 : 1),
  feast: 1, // land-credit multiplier (?feast=N overrides: balance knob)
  // food.js knobs (food leaves in R4)
  growth: [0, 1.7, 1.1, 1.0, 0.8, 0.7], crumbGrowth: 0.4, crumb: 0.02, floorK: 0.7,
  collapseK: 0.35, // credit multiplier on torn-off land (§12.3; 1.0 gave a 60% tear share and a 9 min game)
  startR: 40 * KM,
};
