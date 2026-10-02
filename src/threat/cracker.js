// The planet-cracker, "the Last Resort" (docs/PHASE3-REVIEW.md B8, T4, once, from 90% of the land eaten): a megastructure hangs over the limb charging a beam fed by
// three power stations on the land that is left (blue feed lines, minimap triangles, a world countdown in the threat pill). Swallow all three in time and it FIZZLES (+5%);
// otherwise a 2 r ring tracks the hole, locks for 4 s, and the beam comes down: 20% (cap 25%), a crater scar and shock rings across the continents. The countdown is
// 30 s plus the time the route needs (the stations are placed on the nearest standing land, which at 90% is far apart), at most 75 s.
import * as THREE from 'three/webgpu';
import { R } from '../planetgen.js';
import { P3, T3 } from '../phase3.js';
import { C, FIRE, SMOKE0, ASH, rnd, smooth, aim, tangentAt, vel3, slerp, Ribbon } from './kit.js';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3(), f = new THREE.Vector3(), g = new THREE.Vector3(), o = {};
const CYAN = C(0x7fe8ff, 2.2), WHITE = C(0xfff4e0, 3.4), HOT = C(0xff9a50, 2.6), BLUE = C(0xcfe8ff, 2.6);

export function makeCracker(th) {
  const T = T3.kinds.cracker, { W, hole, state } = th;
  const x = { i: 0, on: false, done: false, mod: th.model('cracker'), core: new Ribbon(12, th.root), glow: new Ribbon(12, th.root), halo: new Ribbon(40, th.root), zone: -1, mk: null, st: [], pos: new THREE.Vector3(), dirP: new THREE.Vector3(), to: new THREE.Vector3(), mod2: null };
  for (let i = 0; i < 3; i++) x.st.push({ i, mod: th.model('launch_pad'), feed: new Ribbon(14, th.root), dir: new THREE.Vector3(), alive: false, sink: 0, p0: new THREE.Vector3(), mk: null });
  const stationSpots = (r) => { // three standing-land spots near the hole, 2.5+ r apart, nearest first
    const lf = W.bite.lf, pd = lf.pDir, l0 = lf.lv[0].left, h = W.hdir, list = [];
    for (let q = 0; q < lf.land.length; q += 3) { const pk = lf.land[q]; if (!(l0[pk] > 1e-3 * 0 + 1e-4)) continue; const d = Math.acos(Math.min(1, pd[pk * 3] * h.x + pd[pk * 3 + 1] * h.y + pd[pk * 3 + 2] * h.z)) * R; if (d > 2.5 * r) list.push([d, pk]); }
    list.sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const [d, pk] of list) { a.set(pd[pk * 3], pd[pk * 3 + 1], pd[pk * 3 + 2]); if (out.every((s) => Math.acos(Math.min(1, s.dot(a))) * R > 2.5 * r)) out.push(a.clone()); if (out.length === 3) break; }
    return out;
  };
  const k = {
    name: 'cracker', cost: 0, cool: [30, 30], cool0: 10, items: [x], set: true, zones: 1,
    window: (r) => !x.done && P3.tier(r) >= 4 && W.bite.landEaten >= T.land, can: () => th.zonesFree() >= 1, live: () => true, age: (q) => q.t - q.T,
    spawn(opt = {}) {
      if (x.on || th.zonesFree() < 1) return false;
      const r = hole.r, spots = stationSpots(r); if (spots.length < 1) return false;
      let len = 0, prev = W.hdir; for (const s of spots) { len += Math.acos(Math.min(1, prev.dot(s))) * R; prev = s; }
      const v = P3.speed(r), T0 = Math.min(75, Math.max(30, 30 + (len - 0.9 * r * spots.length) / (0.8 * v) * 0.8 + 6 * (spots.length - 1)));
      Object.assign(x, { on: true, phase: 'charge', t: 0, T: opt.T ?? T0, r0: r, ox: 0, oz: 0, B: 1.8 * r, lock: th.lockFor(1.3, 4.5, 8), side: Math.random() < 0.5 ? -1 : 1, ux: 0, uz: -1, locked: false, lockAt: -1, fx: 0, eaten: 0, n: spots.length });
      x.st.forEach((s, i) => { s.alive = i < spots.length; s.sink = 0; s.mod.visible = s.alive; if (s.alive) { s.dir.copy(spots[i]); s.mk = th.map?.addMarker({ kind: 'site', dir: s.dir, label: 'POWER', color: '#7fe8ff', pulse: true }); } });
      // the megastructure: ~62 degrees ahead of the hole, 0.45 R up, facing the hole
      W.dirAt(0.4 * R * 0.0, -1.08 * R, x.dirP); x.dirP.normalize();
      x.zone = th.zoneAlloc(); x.to.copy(W.hdir);
      x.mk = th.map?.addMarker({ kind: 'ring', dir: x.to, r: x.B, label: 'CRACKER', color: '#ff3a2a', eta: x.T, pulse: true });
      th.stats.cracker++; th.sfx.crackerCharge?.(Math.min(x.T, 40)); th.sfx.klaxon(1); th.screenFlash(0.25, '#ff4a3a', 700); th.trauma(0.4);
      th.ctx.card('THE LAST RESORT', `a planet-cracker is charging: swallow its ${spots.length} power stations in ${Math.round(x.T)} s`); th.news(`The Last Resort: a planet-cracker charges over the limb — ${spots.length} power stations feed it`);
      return true;
    },
    step(q, dt) {
      const r = q.r0, hr = hole.r, cd = th.game.camDist || R * 0.05; q.t += dt;
      const left = q.T - q.t, E = hr * 0 + R; // E: the megastructure's own scale unit (planet radii)
      // the megastructure: far above the limb, a dark hull whose core glows
      th.surf(q.dirP, 0.5 * R, q.pos, 0); aim(q.mod, g.copy(W.hdir).addScaledVector(q.dirP, -W.hdir.dot(q.dirP)).normalize(), q.dirP, 'z'); q.mod.position.copy(q.pos); q.mod.scale.setScalar(0.95 * R / 283); q.mod.visible = true;
      let al = 0; for (const s of q.st) if (s.alive) al++;
      const charge = q.phase === 'charge' ? al / Math.max(1, q.n) : 0;
      if (q.phase === 'charge') {
        // the target ring: tracks the hole until 4 s before, then locks
        if (left > q.lock) { const sp = Math.hypot(hole.vx, hole.vz), kk = Math.min(1, dt * 5); if (sp > 0.05 * P3.speed(hr)) { q.ux = hole.vx / sp; q.uz = hole.vz / sp; } q.ox += (hole.vx * q.lock - q.uz * q.side * 0.9 * r - q.ox) * kk; q.oz += (hole.vz * q.lock + q.ux * q.side * 0.9 * r - q.oz) * kk; W.dirAt(q.ox, q.oz, q.to); }
        else if (!q.locked) { q.locked = true; q.lockAt = th.t; th.stats.locks++; th.sfx.lockBeep?.(); th.ctx.hint('THE RING IS LOCKED — leave it, or swallow the last station'); }
        th.zoneSet(q.zone, q.to, q.B, 0, Math.min(1, q.t * 0.5) * 0.9, q.locked ? Math.min(1, (q.lock - left) / q.lock) + 0.001 : 0, 0);
        if (q.mk) { q.mk.eta = left; q.mk.dir = q.to; }
        // the targeting line and the charge glow at the nose
        th.surf(q.to, 0, e, Math.max(0, W.P.elevation(q.to, 3))); b.copy(q.pos).addScaledVector(g, 0.2 * R);
        const wd = (0.02 + 0.03 * smooth(0, q.T, q.t)) * r;
        for (let i = 0; i < 12; i++) { f.lerpVectors(b, e, i / 11); q.core.set(i, f, wd, 1.0, 0.4, 0.25, q.locked ? 0.9 : 0.25 + 0.15 * Math.sin(q.t * 9)); q.glow.set(i, f, 3 * wd, 1.0, 0.2, 0.1, 0.12 * (q.locked ? 2 : 1)); }
        q.core.done(12, th.camP); q.glow.done(12, th.camP); this.halo(q, b, e, 0.25 + 0.6 * smooth(0, q.T, q.t), 1 + 0.08 * Math.sin(q.t * 6));
        th.glow.spawn(b, null, 0.12 * R * (0.4 + 0.6 * charge), 0.15 * R * (0.4 + 0.6 * charge), 0.07, HOT, 1.2, 0);
        // the stations: power lines to the megastructure, being swallowed
        for (const s of q.st) {
          if (s.alive) {
            th.surf(s.dir, 0, s.mod.position, Math.max(0, W.P.elevation(s.dir, 3))); a.copy(s.dir); e.copy(q.dirP).addScaledVector(s.dir, -q.dirP.dot(s.dir)).normalize(); aim(s.mod, e, s.dir, 'x'); s.mod.scale.setScalar(0.62 * r / 400); s.p0.copy(s.mod.position);
            th.glow.spawn(s.mod.position, null, 0.3 * r, 0.42 * r, 0.1, CYAN, 0.9, 0);
            for (let i = 0; i < 14; i++) { const u = i / 13; slerp(s.dir, q.dirP, u, f).normalize().multiplyScalar(R + 0.5 * R * u * u + 0.14 * R * Math.sin(u * 3.1416)); s.feed.set(i, f, 0.05 * r * (1 + 0.5 * Math.sin(q.t * 9 + u * 20)), 0.4, 0.9, 1.0, 0.35 + 0.25 * Math.sin(q.t * 6 + s.i)); }
            s.feed.done(14, th.camP);
            if (W.distTo(s.dir) < 0.95 * hr) this.eat(q, s);
          } else { s.feed.hide(); if (s.sink > 0 && s.sink < 1) { s.sink += dt / 0.9; const u = Math.min(1, s.sink), w = u * u; c.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); s.mod.position.lerpVectors(s.p0, c, w); s.mod.scale.multiplyScalar(1 - 0.06 * u); s.mod.rotateY(dt * 5); if (s.sink >= 1) { s.mod.visible = false; s.sink = 2; } } }
        }
        if (q.phase !== 'charge') return;
        if (al === 0) { this.fizzle(q); return; }
        if (left <= 0) this.fire(q);
      } else if (q.phase === 'fire') {
        q.fx += dt; const u = Math.min(1, q.fx / 0.6), fade = 1 - smooth(1.6, 3.2, q.fx);
        th.surf(q.to, 0, e, Math.max(0, W.P.elevation(q.to, 3))); b.copy(q.pos).addScaledVector(g, 0.2 * R);
        const w = (0.45 + 0.1 * Math.sin(q.fx * 40)) * r * fade * u;
        for (let i = 0; i < 12; i++) { f.lerpVectors(b, e, i / 11); q.core.set(i, f, w, 1.0, 0.95, 0.85, fade); q.glow.set(i, f, w * 3.2, 1.0, 0.45, 0.15, 0.7 * fade); }
        q.core.done(12, th.camP); q.glow.done(12, th.camP); this.halo(q, b, e, fade, 1 + 0.9 * q.fx);
        if (q.fx < 1.5) { th.glow.spawn(e, null, 1.6 * r, 2 * r, 0.08, WHITE, 1.6 * fade, 0); for (let j = 0; j < 4; j++) { f.lerpVectors(b, e, Math.random()); th.glow.spawn(f, null, 0.8 * r, 1.6 * r, 0.1, HOT, 0.5 * fade, 0); } }
        if (q.fx > 3.4) { q.phase = 'gone'; k.finish(q); }
      } else if (q.phase === 'fizzle') {
        q.fx += dt; const fade = 1 - smooth(0, 2.0, q.fx); q.mod.scale.multiplyScalar(1 - 0.3 * dt * 0 ); if (q.fx > 2.4) k.finish(q);
        if (Math.random() < 0.5) th.glow.spawn(b.copy(q.pos).addScaledVector(g, 0.2 * R), null, 0.05 * R, 0.14 * R, 0.4, BLUE, 1.6 * fade, 0);
      }
    },
    /** The charging ring around the megastructure's nose: perpendicular to the beam, breathing; a flash of it when the beam fires. */
    halo(q, nose, target, alpha, sz) {
      f.subVectors(target, nose).normalize(); c.set(0, 1, 0); if (Math.abs(f.y) > 0.9) c.set(1, 0, 0); c.crossVectors(f, c).normalize(); g.crossVectors(f, c);
      for (let i = 0; i < 40; i++) { const an = (i / 39) * 6.2832; a.copy(nose).addScaledVector(f, 0.08 * R).addScaledVector(c, Math.cos(an) * 0.11 * R * sz).addScaledVector(g, Math.sin(an) * 0.11 * R * sz); q.halo.set(i, a, 0.01 * R * sz, 1.0, 0.55, 0.22, alpha); }
      q.halo.done(40, th.camP);
    },
    eat(q, s) {
      s.alive = false; s.sink = 0.001; q.eaten++; th.gain(0.006, 'crackerGulp'); state.belly = Math.min(1, state.belly + 0.1); s.mk?.remove(); s.mk = null;
      th.glow.spawn(s.mod.position, null, 1.4 * hole.r, 3 * hole.r, 0.6, BLUE, 1.6, 0); th.glow.spawn(s.mod.position, null, 3 * hole.r, 3.4 * hole.r, 0.12, WHITE, 2.4, 0);
      th.sfx.aegisEat?.(); th.beat(0.08); th.trauma(0.3); th.notice(3);
      const al = q.st.filter((z) => z.alive).length; if (al) th.ctx.hint(`Power station swallowed — ${al} left, the beam weakens`);
    },
    fizzle(q) {
      q.phase = 'fizzle'; q.fx = 0; q.done = x.done = true; th.stats.fizzles++; th.gain(T.gulp, 'crackerFizzle'); state.frenzy = 8; state.belly = 1;
      th.zoneFree(q.zone); q.zone = -1; q.mk?.remove(); q.mk = null; q.core.hide(); q.glow.hide(); q.halo.hide();
      th.sfx.fizzle?.(); th.beat(0.2, 0.4, 1.2); th.trauma(0.6); th.screenFlash(0.7, '#cfe8ff', 600); th.notice(15);
      W.shock(W.hdir, 0.6 * hole.r / R, 3 * hole.r / R, 2.0, 1);
      th.ctx.card('THE CRACKER FIZZLES', `all power stations swallowed: +${Math.round(T.gulp * 100)}%`); th.news('The Last Resort fizzles: the cracker, starved of power, goes dark');
    },
    fire(q) {
      const r = q.r0, dist = W.distTo(q.to); q.phase = 'fire'; q.fx = 0; q.done = x.done = true;
      th.zoneFree(q.zone); q.zone = -1; q.mk?.remove(); q.mk = null; for (const s of q.st) { s.feed.hide(); s.mk?.remove(); s.mk = null; }
      th.surf(q.to, 0, a, Math.max(0, W.P.elevation(q.to, 3))); b.copy(a).setLength(R + Math.max(0, W.P.elevation(q.to, 3)) * W.E + 0.4 * r);
      th.glow.spawn(b, null, 6 * r, 7 * r, 0.16, WHITE, 2.6, 0); th.glow.spawn(b, null, 1.0 * q.B, 4.4 * q.B, 1.0, HOT, 2.4, 0.3); th.glow.spawn(b, null, 0.6 * q.B, 3.2 * q.B, 2.2, FIRE[2], 1.8, 0.3); th.glow.spawn(b, null, 0.4 * q.B, 2.4 * q.B, 3.2, FIRE[3], 1.4, 0.2);
      for (let i = 0; i < 24; i++) { const an = (i / 24) * 6.283; tangentAt(q.to, an, c); e.copy(a).addScaledVector(c, 0.3 * q.B); th.smoke.spawn(e, vel3(q.to, c.x * 1.4 * r, c.y * 1.4 * r, 0.2 * r, f), 0.9 * r, 2.4 * r, 5, i % 2 ? SMOKE0 : ASH, 0.65, 0.5); }
      th.scar(q.to, 2.4 * q.B, 1.6 * r, 16, 0); th.scar(q.to, 1.3 * q.B, 0.3 * r, 120, 0); W.shock(q.to, 0.5 * q.B / R, 6 * r / R, 3, 0.9);
      th.dome(q.to, Math.max(0, W.P.elevation(q.to, 3)), 0.3 * q.B, 3 * r, 2.6 * q.B, 1); th.light(q.to, 6 * q.B, 1.8, 9); th.fxBlast(Math.max(0.3, 1 - dist / (8 * r))); th.sfx.crackerFire?.(); th.screenFlash(0.3, '#fff4e0', 600); th.trauma(0.8); th.beat(0.2, 0.5, 1.0); th.notice(20);
      if (dist < q.B) { th.stats.crackerHits++; th.hurt(T.hit, 'THE LAST RESORT!', 'cracker', 45, 0.25, q.locked ? th.t - q.lockAt : -1, q.to); } else { th.ctx.hint('The beam missed: you left the ring'); th.news('The Last Resort fires — and hits empty land'); }
      th.news('The cracker fires: a crater the size of a province');
    },
    finish(q) { q.on = false; q.phase = 'gone'; q.mod.visible = false; q.core.hide(); q.glow.hide(); q.halo.hide(); if (q.zone >= 0) th.zoneFree(q.zone); q.zone = -1; q.mk?.remove(); q.mk = null; for (const s of q.st) { s.mod.visible = false; s.alive = false; s.feed.hide(); s.mk?.remove(); s.mk = null; } },
    clear() { x.done = false; },
    danger(q, out) {
      if (q.phase !== 'charge') return;
      th.offsetOf(q.to, o); out.push({ kind: 'cracker', id: `k${q.i}`, x: o.x, z: o.z, R: q.B, inner: 0, eta: q.T - q.t, locked: q.locked, lock: q.lock });
      for (const s of q.st) if (s.alive) { th.offsetOf(s.dir, o); out.push({ kind: 'target', id: `ks${s.i}`, x: o.x, z: o.z, R: 0.95 * hole.r, eta: q.T - q.t, what: 'station', reach: 40, grp: 'ck', p: 0.8, maxT: 80 }); }
    },
    line(q, pick) {
      if (q.phase === 'charge') { let al = 0; for (const s of q.st) if (s.alive) al++; const left = Math.max(0, q.T - q.t); pick(left * 0.1 - 5, `THE LAST RESORT · <b>${left.toFixed(0)} s</b> · power stations <b>${q.n - al}/${q.n}</b> swallowed${q.locked ? ' · RING LOCKED' : ' · or dodge the ring'}`, left < 8 ? 'lock' : ''); }
    },
  };
  x.mod.visible = false; for (const s of x.st) s.mod.visible = false;
  return k;
}
