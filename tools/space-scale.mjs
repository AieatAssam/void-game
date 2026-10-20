// Phase 4 scale check (docs/PHASE4.md §8), plain node, no browser: `node tools/space-scale.mjs`.
// 1. The hole's on-screen share (diameter / short side) from the camera maths in src/space/frame.js, for a Pixel 7 portrait (412x915) and a 1280x720 desktop,
//    at the start, middle and end of a tier. 2. What sits near the hole (within NEAR r) as multiples of r, for tiers 1, 3, 5 and 8 at tier start / middle / end,
//    from the raw field (as laid out at tier start) and after src/space/near.js has herded it (the game runs it every 0.25 s; this section passes no opt, so it only moves bodies, it does not reuse them).
// 3. Motion: top speed, crossing times, acceleration, the jets' boost. 4. Density: the streamed field (near.js) on a screen, then a deterministic run per tier (a seeking hole, real eat and pay rules, no nibbling):
//    edible (0.3-0.85 r), crumbs (0.1-0.3 r) and threats (1.5-4 r) on a portrait screen, and the tier time against its floor (0.9 x minTime: the log growth cap).
// Simplifications: the hole sits at the tier's start point; at the middle and end the nearest bodies that fit count as eaten until the eaten weight matches the progress (r = G^f: f x goal x total); "off screen" is approximated as more than 12 r away.
import { FOV, SHARE0, SHARE1, PITCH_DEG, AIM, shareAt, distFor, shareOf, speedAt, CROSS, ACCEL, BRAKE, JET_BOOST, FUEL_TAU, fuelGain, NIB_FUEL, jetK } from '../src/space/frame.js';
import { herd, NEAR, STREAM, WANT_E, WANT_T, WANT_C, EDIBLE, THREAT, CRUMB, MOVES, BURST, RECYCLE } from '../src/space/near.js';
import { TIERS, buildTier, rng, weight } from '../src/space/tiers.js';

const f3 = (x) => x.toFixed(3), pad = (s, n) => String(s).padStart(n);
console.log(`Camera: vertical fov ${FOV} deg, share ${SHARE0} -> ${SHARE1} of the short side through a tier (band 1/8 = 0.125 .. 1/6 = 0.167)\n`);
console.log('viewport     stage   rp    dist(r)  share  diameter px');
for (const [w, h] of [[412, 915], [1280, 720]]) {
  for (const [st, rp] of [['start', 0], ['middle', 0.5], ['end', 1]]) {
    const d = distFor(shareAt(rp), w / h), s = shareOf(d, w / h);
    console.log(`${pad(w + 'x' + h, 9)}  ${pad(st, 7)}  ${rp.toFixed(1)}  ${pad(d.toFixed(1), 7)}  ${f3(s)}  ${pad((s * Math.min(w, h)).toFixed(0), 5)}`);
  }
}
// the old camera for comparison: BASE_DIST 19 x LENS x portraitK, closing 36% through a tier
{ const LENS = Math.tan((19 * Math.PI) / 180) / Math.tan((13 * Math.PI) / 180), pk = (a) => Math.max(1, 1.2 / a) ** 0.45;
  console.log('\nbefore (BASE_DIST 19):'); for (const [w, h] of [[412, 915], [1280, 720]]) { const a = w / h, d0 = 19 * LENS * pk(a), s0 = shareOf(d0, a), s1 = shareOf(d0 * 0.64, a); console.log(`${pad(w + 'x' + h, 9)}  start ${f3(s0)} (${(s0 * Math.min(w, h)).toFixed(0)} px)  end ${f3(s1)} (${(s1 * Math.min(w, h)).toFixed(0)} px)`); } }

const BINS = [['<0.05', 0, 0.05], ['0.05-0.3', 0.05, 0.3], ['0.3-0.9', 0.3, 0.9], ['0.9-1.5', 0.9, 1.5], ['1.5-4', 1.5, 4], ['4-10', 4, 10], ['>10', 10, Infinity]];
function hist(bodies, hx, hz, r) {
  const n = BINS.map(() => 0);
  for (const o of bodies) { if (o.state || Math.hypot(o.x - hx, o.z - hz) > NEAR * r + o.b) continue; const q = o.b / r; n[BINS.findIndex(([, lo, hi]) => q >= lo && q < hi)]++; }
  return n;
}
console.log(`\nBodies within ${NEAR} r of the hole, by size / r (raw = the field as laid out; herded = after near.js)`);
console.log('tier  stage    r/r0     ' + BINS.map(([l]) => pad(l, 9)).join(''));
for (const id of [1, 3, 5, 8]) {
  const tier = TIERS[id - 1], f = buildTier(tier, 7), [hx, hz] = tier.start;
  console.log(`  (tier ${id} ${tier.name}: ${f.bodies.length} bodies, total weight ${f.total.toFixed(1)}, growth x${tier.growth})`);
  for (const [st, p] of [['start', 0], ['middle', 0.5], ['end', 0.95]]) {
    const r = Math.pow(tier.growth, p), B = f.bodies.map((o) => ({ ...o })), rnd = rng(53 + id);
    { // what the hole ate on its way here: r = G^f means f of the tier's goal weight is paid, so the nearest bodies that fit are marked eaten until it is
      const need = p * tier.goal * f.total; let w = 0;
      for (const o of B.filter((o) => o.b < 0.85 * r).sort((a, b) => Math.hypot(a.x - hx, a.z - hz) - Math.hypot(b.x - hx, b.z - hz))) { if (w >= need) break; o.state = 2; w += o.w; }
    }
    const raw = hist(B, hx, hz, r);
    for (let i = 0; i < 30; i++) herd(B, hx, hz, r, rnd, (x, z) => Math.hypot(x - hx, z - hz) > 12 * r);
    const hd = hist(B, hx, hz, r);
    console.log(`${pad(id, 4)}  ${pad(st, 6)}  ${pad(r.toPrecision(3), 7)}  raw    ${raw.map((v) => pad(v, 9)).join('')}`);
    console.log(`                     herded ${hd.map((v) => pad(v, 9)).join('')}`);
  }
}

// ---- 3. motion (src/space/frame.js): speed from the framing, the same at every tier (render space is in r); it varies only with progress through a tier (the hole swells on screen)
const rad = (d) => (d * Math.PI) / 180;
/** The ground footprint of the screen in r round the hole (camera fixed, screen-up = -z): bottom z, top z, half-widths at the bottom and top. */
function foot(w, h, rp) {
  const a = w / h, d = distFor(shareAt(rp), a), p = rad(PITCH_DEG), cy = Math.sin(p) * d, cz = Math.cos(p) * d, th = Math.tan(rad(FOV / 2)), tw = th * a;
  let fy = -cy, fz = -AIM * d - cz; const fl = Math.hypot(fy, fz); fy /= fl; fz /= fl; const uy = -fz, uz = fy; // (up = right x forward, right = +x)
  const hit = (u, v) => { const dy = fy + uy * v * th, dz = fz + uz * v * th, t = -cy / dy; return [u * tw * t, cz + dz * t]; };
  const [xb, zb] = hit(1, -1), [xt, zt] = hit(1, 1);
  return { zb, zt, wb: xb, wt: xt, area: (xb + xt) * (zb - zt) };
}
console.log(`\nMotion: CROSS ${CROSS} s across the short side; top speed = 2 / share / CROSS (r/s, the same at every tier: render units are r)`);
console.log('viewport     tier  stage   share  short side(r)  top speed(r/s)  cross short(s)  cross long(s)  sees ahead(r)');
for (const [w, h] of [[412, 915], [1280, 720]]) for (const id of [1, 3, 5, 8]) for (const [st, rp] of [['start', 0], ['middle', 0.5], ['end', 1]]) {
  const sh = shareAt(rp), side = 2 / sh, v = speedAt(rp), F = foot(w, h, rp);
  console.log(`${pad(w + 'x' + h, 9)}  ${pad(id, 4)}  ${pad(st, 6)}  ${f3(sh)}  ${pad(side.toFixed(1), 13)}  ${pad(v.toFixed(2), 14)}  ${pad((side / v).toFixed(2), 14)}  ${pad(((F.zb - F.zt) / v).toFixed(2), 13)}  ${pad((-F.zt).toFixed(1), 12)}`);
}
console.log(`before: 0.95 r/s across ${(2 / shareOf(19 * Math.tan(rad(19)) / Math.tan(rad(13)) * Math.max(1, 1.2 / (412 / 915)) ** 0.45, 412 / 915)).toFixed(1)} r (portrait start) = ${(2 / shareOf(19 * Math.tan(rad(19)) / Math.tan(rad(13)) * Math.max(1, 1.2 / (412 / 915)) ** 0.45, 412 / 915) / 0.95).toFixed(1)} s`);
{ // acceleration: exponential approach, stepped at 60 and 30 fps (frame-rate independent)
  const run = (dt, tau, from, to, until) => { let v = from, t = 0; while (!until(v)) { v += (to - v) * (1 - Math.exp(-dt / tau)); t += dt; } return t; };
  console.log(`Acceleration: ACCEL tau ${ACCEL} s -> 90% of top speed in ${(ACCEL * Math.log(10)).toFixed(3)} s (stepped: ${run(1 / 60, ACCEL, 0, 1, (v) => v >= 0.9).toFixed(3)} s at 60 fps, ${run(1 / 30, ACCEL, 0, 1, (v) => v >= 0.9).toFixed(3)} s at 30 fps)`);
  console.log(`Braking:      BRAKE tau ${BRAKE} s -> 95% stopped in ${(3 * BRAKE).toFixed(3)} s (stepped: ${run(1 / 60, BRAKE, 1, 0, (v) => v <= 0.05).toFixed(3)} s at 60 fps, ${run(1 / 30, BRAKE, 1, 0, (v) => v <= 0.05).toFixed(3)} s at 30 fps); coasting distance ${(BRAKE * speedAt(0)).toFixed(2)} r at the start of a tier`);
}

// ---- 4. density: the streamed field (src/space/near.js)
const area = Math.PI * STREAM * STREAM, dens = WANT_E / area, densT = WANT_T / area, densC = WANT_C / area;
{ // the jets: fuel per gulp, its decay, and what it does to top speed
  console.log(`Jets: speed x (1 + ${JET_BOOST} x fuel); a gulp of a body q r across adds (1 - fuel) x fuelGain(q), fuelGain = 0.4 x clamp((q - 0.03) / 0.47); fuel decays with tau ${FUEL_TAU} s; nibbling creeps toward ${NIB_FUEL}`);
  for (const q of [0.05, 0.1, 0.3, 0.5, 0.8]) console.log(`  one gulp of ${q} r: fuel ${fuelGain(q).toFixed(3)} -> x${jetK(fuelGain(q)).toFixed(3)} (x${jetK(fuelGain(q) * Math.exp(-1 / FUEL_TAU)).toFixed(3)} 1 s later, x${jetK(fuelGain(q) * Math.exp(-2 / FUEL_TAU)).toFixed(3)} 2 s later)`);
  let f = 0; const st = []; for (let i = 1; i <= 6; i++) { f += (1 - f) * fuelGain(0.5); st.push(`${i}: x${jetK(f).toFixed(3)}`); } console.log(`  0.5 r gulps back to back: ${st.join(', ')} (limit x${jetK(1).toFixed(2)})`);
  console.log(`  third of a boost left after ${(FUEL_TAU * Math.log(3)).toFixed(2)} s, a tenth after ${(FUEL_TAU * Math.log(10)).toFixed(2)} s; at the start of a tier top speed ${speedAt(0).toFixed(2)} r/s becomes up to ${(speedAt(0) * jetK(1)).toFixed(2)} r/s`);
}
console.log(`\nDensity: stream disc ${STREAM} r (recycle distance: anything outside it is fair game), want ${WANT_E} edible (${EDIBLE.join('-')} r) + ${WANT_T} threats (${THREAT.join('-')} r) + ${WANT_C} crumbs (${CRUMB.join('-')} r) in it, ${MOVES} moves a pass, ${BURST} on a tier's first pass, a pass every 0.25 s, reused bodies pay ${RECYCLE}; the disc shrinks with the view (x SHARE0 / share: 1 -> ${(SHARE0 / SHARE1).toFixed(3)}), the counts do not`);
console.log(`  target density at a tier's start ${dens.toFixed(4)} edible / r^2 (was 40 in the disc: 0.0055), ${densT.toFixed(4)} threats, ${densC.toFixed(4)} crumbs; x${((SHARE1 / SHARE0) ** 2).toFixed(2)} at its end`);
for (const [w, h] of [[412, 915], [1280, 720]]) for (const rp of [0, 1]) { const F = foot(w, h, rp), vk = (shareAt(rp) / SHARE0) ** 2, dens = WANT_E / area * vk, densT = WANT_T / area * vk, densC = WANT_C / area * vk; console.log(`  ${pad(w + 'x' + h, 9)} rp ${rp}: visible ${F.area.toFixed(0)} r^2 (${(-F.zt).toFixed(1)} r ahead, ${F.zb.toFixed(1)} r behind) -> ${(dens * F.area).toFixed(1)} edible, ${(densT * F.area).toFixed(1)} threats, ${(densC * F.area).toFixed(1)} crumbs on screen at the target density`); }

console.log('\nDeterministic run per tier (portrait 412x915 view, a hole that seeks the nearest edible body on screen, else cruises; 20 fps; suction approximated as capture within 1.6 r; no nibbling, no power-ups; the jets are on)');
console.log('tier  time(s)  floor(s)  done  edible on screen: mean  p10  p90  min  max wait for one(s)  crumbs  threats  moved  reused  paid by reused  jet x mean  jet x max');
for (const id of [1, 2, 3, 5, 8, 11]) {
  const tier = TIERS[id - 1], f0 = buildTier(tier, 7), B = f0.bodies, rnd = rng(91 + id), rh = rng(53 + id), G = tier.growth, goal = tier.goal * f0.total;
  let [hx, hz] = tier.start, r = 1, paid = 0, paidR = 0, t = 0, hd = rnd() * Math.PI * 2, sumE = 0, minE = 1e9, n = 0, has = 0, sumC = 0, sumT = 0, hist = [], wait = 0, maxWait = 0, herdT = 0, mv = 0, ru = 0, fuel = 0, jk = 0, jmax = 1, js = 0;
  const O = { hx: 0, hz: 0, w: (b, k) => weight(b, k, tier.wexp ?? 0.65), view: 1, moves: BURST, moved: 0, reused: 0 };
  for (const o of B) o.orbit = false; // (orbits frozen: a simplification)
  const dt = 0.05;
  while (t < 900) {
    const rp = Math.log(r) / Math.log(G), F = foot(412, 915, Math.min(1, rp)), v = speedAt(Math.min(1, rp)) * r * jetK(fuel);
    fuel *= Math.exp(-dt / FUEL_TAU); jk += jetK(fuel); js++; jmax = Math.max(jmax, jetK(fuel));
    const vis = (x, z, b) => { const dx = (x - hx) / r, dz = (z - hz) / r, bb = b / r; if (dz < F.zt - bb || dz > F.zb + bb) return false; const u = (F.zb - dz) / (F.zb - F.zt); return Math.abs(dx) < F.wb + (F.wt - F.wb) * u + bb; };
    let tgt = null, bd = Infinity, ne = 0, nc = 0, nt = 0;
    for (const o of B) {
      if (o.state) continue;
      const q = o.b / r;
      if (q >= 1.5 && q <= 4 && vis(o.x, o.z, o.b)) nt++;
      if (q > 0.85) continue;
      if (q >= 0.3 && vis(o.x, o.z, o.b)) ne++;
      else if (q >= 0.1 && q < 0.3 && vis(o.x, o.z, o.b)) nc++;
      if (q < 0.1) continue;
      const d = Math.hypot(o.x - hx, o.z - hz); if (d < bd && vis(o.x, o.z, o.b)) { bd = d; tgt = o; }
    }
    if (tgt) hd = Math.atan2(tgt.z - hz, tgt.x - hx); else hd += (rnd() - 0.5) * 0.3;
    hx += Math.cos(hd) * v * dt; hz += Math.sin(hd) * v * dt;
    for (const o of B) { if (o.state || o.b > 0.85 * r) continue; if (Math.hypot(o.x - hx, o.z - hz) < 1.6 * r + 0.15 * o.b) { o.state = 2; fuel += (1 - fuel) * fuelGain(o.b / r); const c = o.w * Math.max(0.1, Math.min(1, o.b0 / r / 0.1)) ** 0.8; paid += c; if (o.rec) paidR += c; } }
    const f = Math.min(1, paid / goal), lr = Math.log(r), lt = Math.log(Math.pow(G, f)); r = Math.exp(lr + Math.min((lt - lr) * (1 - Math.exp(-dt * 2.2)), Math.log(G) / tier.minTime * dt));
    if ((herdT -= dt) <= 0) {
      herdT = 0.25; O.hx = Math.cos(hd); O.hz = Math.sin(hd); O.view = SHARE0 / shareAt(Math.min(1, rp));
      const before = B.map((o) => o.b0); herd(B, hx, hz, r, rh, (x, z, b) => !vis(x, z, b), O); O.moves = 0; mv += O.moved; ru += O.reused;
      B.forEach((o, i) => { if (before[i] !== o.b0) o.rec = true; }); // (a reused body gets a new size: eaten ones and far specks alike)
      sumE += ne; sumC += nc; sumT += nt; hist.push(ne); n++; minE = Math.min(minE, ne); if (ne) { has++; wait = 0; } else { wait += 0.25; maxWait = Math.max(maxWait, wait); }
    }
    t += dt;
    if (f >= 0.95 && r >= Math.pow(G, 0.9)) break;
  }
  const f = paid / goal; hist.sort((a, b) => a - b);
  console.log(`${pad(id, 4)}  ${pad(t.toFixed(0), 7)}  ${pad((0.9 * tier.minTime).toFixed(0), 8)}  ${pad(f >= 0.95 ? 'yes' : (f * 100).toFixed(0) + '%', 4)}  ${pad((sumE / n).toFixed(1), 22)}  ${pad(hist[(n * 0.1) | 0], 3)}  ${pad(hist[(n * 0.9) | 0], 3)}  ${pad(minE, 3)}  ${pad(maxWait.toFixed(2), 19)}  ${pad((sumC / n).toFixed(1), 6)}  ${pad((sumT / n).toFixed(1), 7)}  ${pad(mv, 5)}  ${pad(ru, 6)}  ${pad((100 * paidR / Math.max(1e-9, paid)).toFixed(0) + '%', 14)}  ${pad((jk / js).toFixed(3), 10)}  ${pad(jmax.toFixed(3), 9)}`);
}
