// Phase 4 camera framing (docs/PHASE4.md §8): how big the hole is on screen. Plain maths, no three, so tools/space-scale.mjs re-derives the same numbers.
// Render space is in hole radii (r = 1 at the origin), so the hole's screen share depends only on the camera: fov, pitch, distance and aspect.
// The share is measured on the screen's SHORT side (the width of a portrait phone, the height of a desktop): hole diameter / short side.

export const FOV = 26; // vertical fov in degrees (main.js FOV, handed over as ctx.baseFov)
export const PITCH_DEG = 56; // camera elevation over the plane
export const AIM = 0.16; // the camera looks this many distances ahead of the hole (the hole rides low in the frame)
// Hole diameter as a share of the short side, eased on log progress through a tier: 0.13 at the start, 0.16 at the end (a 1.23x swell),
// both inside the 1/8 .. 1/6 band (51 .. 69 px on a 412 px wide phone); the tier-up steps back out to SHARE0 through the sweep's camera pull.
export const SHARE0 = 0.13, SHARE1 = 0.16;

const rad = (d) => (d * Math.PI) / 180;
const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
/** Share at tier progress rp = log(r) / log(growth), in [0, 1]. */
export const shareAt = (rp) => SHARE0 * Math.pow(SHARE1 / SHARE0, ease(rp));
/** Depth of the hole along the view axis per unit camera distance (the camera aims AIM ahead, so the hole is a little off-axis). */
export function depthK(pitch = rad(PITCH_DEG)) {
  const cy = Math.sin(pitch), cz = Math.cos(pitch), fy = -cy, fz = -AIM - cz, fl = Math.hypot(fy, fz);
  return (cy * -fy + cz * -fz) / fl; // dot(origin - camera, forward) / distance
}
/** Camera distance (in r) that shows the hole at `share` of the short side, for this aspect (w / h) and vertical fov. */
export function distFor(share, aspect, fov = FOV, pitch = rad(PITCH_DEG)) {
  const t = share * Math.tan(rad(fov / 2)) * Math.min(1, aspect); // (portrait: the short side is the width, aspect times the height)
  return Math.sqrt(1 + t * t) / t / depthK(pitch);
}
/** The other way round: the share a camera at distance d shows (the check the tool prints). */
export function shareOf(d, aspect, fov = FOV, pitch = rad(PITCH_DEG)) {
  const z = d * depthK(pitch), t = 1 / Math.sqrt(z * z - 1);
  return t / Math.tan(rad(fov / 2)) / Math.min(1, aspect);
}

// Motion, from the framing: at full stick the hole crosses the screen's short side (2 / share hole radii at the hole's depth) in CROSS seconds, portrait or landscape, at every tier
// (render space is in r, so one number serves every scale). 2 / 0.13 / 1.5 = 10.3 r/s at the start of a tier, 2 / 0.16 / 1.5 = 8.3 r/s at its end (the hole is bigger on screen, the screen the same).
export const CROSS = 1.5;
export const speedAt = (rp) => 2 / shareAt(rp) / CROSS;
// Everything that was tuned against the old 0.95 r/s (creature flee speeds, the rival, suction, tidal pull) is scaled by speedAt(rp) / V_OLD, so "slower than you" still holds.
export const V_OLD = 0.95;
// Response: the stick's velocity approaches its target exponentially (frame-rate independent: 1 - exp(-dt / tau)). ACCEL 0.08 s: 90% of top speed in 2.3 tau = 0.18 s;
// BRAKE 0.05 s when the stick is let go: 95% stopped in 3 tau = 0.15 s.
export const ACCEL = 0.08, BRAKE = 0.05;

// The jets (docs/PHASE4.md §8): what the hole eats comes back out as two jets, and the one behind it pushes. `fuel` is in [0, 1): a gulp adds
// (1 - fuel) x fuelGain(size / r), so gulps stack with diminishing returns (one 0.5 r body: 0.4; three in a row: 0.78), and it decays with tau FUEL_TAU
// (down to a third in 1.4 s, a tenth in 3.0 s). Top speed is multiplied by 1 + JET_BOOST x fuel: +12% after one good gulp, +24% after three, +30% at most.
export const JET_BOOST = 0.3, FUEL_TAU = 1.3;
/** Fuel from one gulp of a body `q` hole radii across (radius / r): specks give almost nothing, a body of 0.5 r or more gives 0.4. */
export const fuelGain = (q) => 0.4 * Math.min(1, Math.max(0, q - 0.03) / 0.47);
/** Fuel from nibbling a body too big to swallow: it creeps toward NIB_FUEL while the rim is in it. */
export const NIB_FUEL = 0.35;
export const jetK = (fuel) => 1 + JET_BOOST * fuel;
