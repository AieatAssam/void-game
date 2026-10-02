// Phase 3 (docs/PHASE3.md): tuning and the size ladder. Pure data + small functions (no three, no DOM). Distances in metres.
// Starting values for the bot balance pass (docs/BALANCE.md).
const lerp = (a, b, k) => a + (b - a) * k;
const KM = 1000;

// scale tiers (§4.1): [floor r (m), name card]
export const TIERS = [
  { n: 1, r: 1400, name: 'COASTLANDS' },
  { n: 2, r: 6 * KM, name: 'NATIONS' },
  { n: 3, r: 25 * KM, name: 'CONTINENT' },
  { n: 4, r: 110 * KM, name: 'ORBIT' },
  { n: 5, r: 480 * KM, name: 'THE WORLD' },
];
// anchor points of the smooth ramps (pitch in degrees, relief exaggeration E): r in metres, linear in log r between anchors
const RAMP = [
  [1400, 55, 1.0], [6 * KM, 55, 1.5], [25 * KM, 47, 3.0], [110 * KM, 38, 6.0], [480 * KM, 33, 6.0], [1800 * KM, 33, 6.0],
];
function ramp(r, col) {
  if (r <= RAMP[0][0]) return RAMP[0][col];
  for (let i = 1; i < RAMP.length; i++) {
    if (r <= RAMP[i][0]) {
      const k = Math.log(r / RAMP[i - 1][0]) / Math.log(RAMP[i][0] / RAMP[i - 1][0]);
      return lerp(RAMP[i - 1][col], RAMP[i][col], k * k * (3 - 2 * k));
    }
  }
  return RAMP.at(-1)[col];
}

export const P3 = {
  // movement: 0.6 r/s keeps the screen scrolling at the speed of Phase 2 at 60 m (§4.5). The 40 m/s P2 cap does not apply.
  speed: (r) => 0.6 * r,
  turn: (r) => 0.45, // steering smoothing time constant (s), held at every size
  pitch: (r) => ramp(r, 1) * Math.PI / 180,
  relief: (r) => ramp(r, 2),
  tier: (r) => { let t = 1; for (const q of TIERS) if (r >= q.r * 0.999 || q.n === 1) t = q.n; return t; },
  tierName: (r) => TIERS[P3.tier(r) - 1].name,
  camDist: (r) => 14 + 8 * r, // x portrait x LENS in the game
  // credit (§2.5, §4.5)
  gLand: [0, 0.012, 0.018, 0.028, 0.038, 0.06], // by tier
  crust: 300, // C: m of crust under every land column (lowlands are not free)
  chewT: 1.2, // s to chew one bite depth
  depth: (r) => 0.5 * r, // D(r): bite depth
  wallK: 4, // a column taller than wallK * D(r) = 2 r is a wall
  texelBudget: 14000, // bite-map texels visited per frame (the doc's 40k measured ~6 ms in JS: 150 ns/texel; round robin keeps it exact on average)
  capR: 110 * KM, // patch -> globe only, rim -> shader cap (one-way)
  patchMax: 110 * KM,
  // belly / decay (stub until food.js): land credit tops the belly up 1:1 in area terms
  bellyDrain: 1 / 30, meal: 0.06, decayFed: 0.0010, decayStarving: 0.008,
  oceanSpeed: (tier) => (tier < 3 ? 0.6 : tier === 3 ? 0.85 : 1),
  oceanDrain: (tier) => (tier < 3 ? 1.4 : tier === 3 ? 1.15 : 1),
  // TEMP (until food.js lands): scales land credit so a terrain-only run grows the hole at a testable pace; ?feast=N overrides
  feast: 3,
  startR: 1400,
};
