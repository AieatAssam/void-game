// Phase 4: keep the bodies round the hole readable and plentiful for the hole's CURRENT size (docs/PHASE4.md §8). Plain JS, no three (tools/space-scale.mjs runs it).
// A tier's field is laid out once in r0 units, and r grows x4 .. x4000 inside the tier, so what sits round the hole drifts from "huge" to "dust"; and the hole now crosses a screen in 1.5 s,
// so it leaves any fixed field behind. herd() streams the field with the hole: inside a disc of STREAM r (a little beyond what a portrait phone sees ahead) it keeps WANT_E edible bodies
// (0.3-0.8 r), WANT_T threats (1.5-4 r) and WANT_C crumbs (0.1-0.3 r). Right-sized bodies anywhere outside the disc are moved in first (real sizes, real weights); when none are left, a body that is
// already eaten (or far off and far too small to matter) is reused at a right size (pooled: the same object, no new meshes, no new instances) and pays RECYCLE of a fresh body's weight.
// Spots are biased ahead of the hole's heading and are always off screen. Landmarks never move or get reused: keys, named bodies, props, comets, golden bodies, meteors.

export const NEAR = 16; // the old "near the hole" window, in hole radii (the tool still prints it)
export const STREAM = 48; // the streamed disc, in r, at the start of a tier (portrait 412x915 sees 43 r ahead, a landscape 1280x720 about 24 r to a corner); it shrinks with the camera (opt.view)
export const EDIBLE = [0.3, 0.8], THREAT = [1.5, 4], CRUMB = [0.1, 0.3], HUGE = 6; // (b / r; capture is at 0.85 r, so 0.8 still fits after a little growth)
export const WANT_E = 100, WANT_T = 12, WANT_C = 24; // what the disc should hold: 100 / (pi 48^2) = 0.0138 edible per r^2 is 12.8 on a Pixel 7 portrait screen (923 r^2) at a tier's start, and as the disc
// shrinks with the view the screen keeps that count to the end (610 r^2 of a 39 r disc); 12 threats are 1.5 on that screen, 24 crumbs 3.1 (was 40 + 5, no crumbs: 5.1 -> 3.4 edible, "space is empty")
export const RECYCLE = 0.4; // a reused body pays 0.4 of a fresh one of its size (2.5x the streamed food must not inflate the tier's weight; the growth cap, ln G / minTime a second, bounds the time anyway)
export const MOVES = 12, BURST = 60; // moves a pass (BURST: the first pass of a tier, opt.moves, fills the disc at once) (space.js runs a pass every 0.25 s: 48 a second, against ~20 a second leaving the 48 r disc at full speed with the jets on)
const OUT = [STREAM + 8, STREAM + 30], RING = [12, STREAM], TRIES = 10, AHEAD = 0.8, CONE = 1.1; // (4/5 of the spots go within +-63 deg of the heading)
const CLASS = [[EDIBLE, WANT_E], [THREAT, WANT_T], [CRUMB, WANT_C]]; // (filled in this order: food first, then threats, then crumbs)
const TAU = Math.PI * 2;
const landmark = (o) => o.key || o.k === 8 || o.k === 4 || o.gold || o.eph || o.storm || (o.name && !o.name.startsWith('a ')); // (props are 8, comets 4; proper names are the Sun, the planets, the galaxy...)
const free = (o) => !o.state && !landmark(o) && o.hp >= 1; // (movable now: not falling, not nibbled)
const reusable = (o) => o.state === 2 && !landmark(o); // (eaten spheres, galaxies and clouds: a sprite is drawn at its body's size, so a reused galaxy keeps its tile and tint at the new size; tiers 9-11 are all galaxies)

/**
 * One pass. bodies: the tier's bodies (tier units), (hx, hz) the hole, r its radius, rnd a seeded generator, off(x, z, b) true if a body there is off screen (space.js: the camera frustum).
 * opt (reused, no allocation): { hx: heading x, hz: heading z (unit, or 0 when still), w: (b, k) -> fresh weight of a body of size b, view: the camera's reach against a tier's start
 * (SHARE0 / shareAt(rp), 1 .. 0.81), moves: this pass's budget (0: MOVES), moved, reused (out) }. Returns the bodies moved or reused.
 */
export function herd(bodies, hx, hz, r, rnd, off = () => true, opt = null) {
  let ne = 0, nt = 0, nc = 0, moved = 0, reused = 0;
  const v = opt?.view || 1, near = STREAM * v * r, mx = opt?.moves || MOVES; // (the disc follows the view, the counts do not: the screen keeps its share as the camera closes in)
  for (const o of bodies) {
    if (o.state) continue;
    const d = Math.hypot(o.x - hx, o.z - hz), q = o.b / r;
    if (d > near + o.b) continue;
    if (q >= EDIBLE[0] && q <= EDIBLE[1]) ne++;
    else if (q >= THREAT[0] && q <= THREAT[1]) nt++;
    else if (q >= CRUMB[0] && q < CRUMB[1]) nc++;
    else if (q > HUGE && d < 0.5 * near && free(o) && moved < mx && off(o.x, o.z, o.b)) moved += place(o, hx, hz, r, OUT, v, rnd, off, opt); // (a wall of a body in your face: it waits further out until you are big enough for it)
  }
  for (let c = 0; c < 3; c++) {
    const [[lo, hi], want] = CLASS[c];
    for (let n = c === 0 ? ne : c === 1 ? nt : nc; n < want && moved < mx; n++) {
      const tq = lo * Math.pow(hi / lo, rnd()), lt = Math.log(tq); // a size to look for, log-uniform in the class
      let best = null, bd = Infinity;
      for (const o of bodies) {
        let e;
        if (o.state === 2) { if (!opt?.w || !reusable(o)) continue; e = 3 + Math.abs(Math.log(o.b0 / r) - lt) * 0.1; } // (reuse only when nothing real is left; the closest original size first)
        else {
          if (!free(o)) continue;
          const q = o.b / r, d = Math.hypot(o.x - hx, o.z - hz);
          if (d < near + o.b) continue; // (only what is outside the disc: behind you, or never reached)
          if (q >= lo && q <= hi) e = Math.abs(Math.log(q) - lt);
          else if (q < 0.05 && opt?.w) e = 2 + Math.abs(Math.log(q) - lt) * 0.1; // (a far speck the hole has outgrown: reusable)
          else continue;
        }
        if (e >= bd) continue;
        bd = e; best = o;
      }
      if (!best) break;
      const q = best.b / r;
      if (best.state === 2 || q < lo || q > hi) { // reuse: a fresh body of the wanted size, the same look
        if (!place(best, hx, hz, r, RING, v, rnd, off, opt)) break;
        best.b = best.b0 = tq * r; best.hp = 1; best.state = 0; best.f = 0; best.vx = best.vz = 0; best.orbit = false; best.w = opt.w(best.b, best.k) * RECYCLE; reused++;
      } else if (!place(best, hx, hz, r, RING, v, rnd, off, opt)) break;
      moved++;
    }
  }
  if (opt) { opt.moved = moved - reused; opt.reused = reused; }
  return moved;
}

/** Move o to a random off-screen spot in the ring [a0, a1 x v] r round the hole, mostly ahead of the heading. Orbiting bodies stop orbiting (the solar tiers' wrap would throw a drifting one across the field). */
function place(o, hx, hz, r, [a0, a1], v, rnd, off, opt) {
  a1 *= v;
  const h = opt && (opt.hx || opt.hz) ? Math.atan2(opt.hz, opt.hx) : null;
  for (let i = 0; i < TRIES; i++) {
    const a = h !== null && rnd() < AHEAD ? h + (rnd() - 0.5) * 2 * CONE : rnd() * TAU, d = (a0 + (a1 - a0) * Math.sqrt(rnd())) * r + o.b, x = hx + Math.cos(a) * d, z = hz + Math.sin(a) * d; // (sqrt: even over the ring's area)
    if (!off(x, z, o.b)) continue;
    if (o.orbit) { o.orbit = false; o.vx = o.vz = 0; }
    o.x = x; o.z = z; return 1;
  }
  return 0;
}
