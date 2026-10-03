// The orbital laser platform (docs/PHASE3-REVIEW.md B2, T3-T4, DEFCON <= 2): a platform 0.8 r up warms a spot 6 r away for 2 s (a thin red ring and a flickering line),
// then a white-hot beam sweeps toward the hole at 0.3 x its speed for 12 s (outrunnable on a straight line at every tier). In the beam: 2%/s or 1.1 s of income per
// second, whichever is more, and the hole is jammed (speed x0.8). The platform then drops to 0.3 r to re-aim for 5 s: swallow it (within 0.8 r of its subpoint) for
// +2% and Frenzy. The beam lights the atmosphere (glow sprites down its length), burns the ground (scar kind 3, a hot zone kind 4).
import * as THREE from 'three/webgpu';
import { R } from '../planetgen.js';
import { P3, T3 } from '../phase3.js';
import { C, FIRE, SMOKE0, ASH, KMs, rnd, smooth, aim, tangentAt, Ribbon } from './kit.js';

const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3(), p4 = new THREE.Vector3(), o = {};
const WHITE = C(0xfff2dd, 3), RED = C(0xff3a1a, 2.4), HOT = C(0xff9a3c, 2.6);

export function makeLaser(th) {
  const T = T3.kinds.laser, { W, hole, state } = th;
  const model = th.model('laser_platform'), core = new Ribbon(10, th.root), glow = new Ribbon(10, th.root);
  const x = { i: 0, on: false, plat: new THREE.Vector3(), spot: new THREE.Vector3(), mod: model, core, glow, zone: -1, mk: null, phase: 'gone', age: 0, t: 0, eaten: false, hum: 0, puff: 0, scarT: 0 };
  const k = {
    name: 'laser', cost: T.cost, cool: T.cool, cool0: 40, items: [x], zones: 1,
    window: (r, dc) => r >= 450e3 && dc <= 2, can: () => th.zonesFree() >= 1,
    live: (q) => q.phase === 'warm' || q.phase === 'sweep',
    age: (q) => (q.phase === 'warm' ? q.t - 2 : q.phase === 'sweep' ? q.t : T.dur + q.t),
    spawn(opt = {}) {
      if (x.on || th.zonesFree() < 1) return false;
      const r = hole.r, sp = Math.hypot(hole.vx, hole.vz), side = Math.random() < 0.5 ? -1 : 1;
      let ux = sp > 0.05 * P3.speed(r) ? hole.vx / sp : 0, uz = sp > 0.05 * P3.speed(r) ? hole.vz / sp : -1;
      const a = side * rnd(0.5, 0.9), c = Math.cos(a), s = Math.sin(a), dx = (ux * c - uz * s) * 3.8 * r, dz = (ux * s + uz * c) * 3.8 * r;
      if (opt.at) { W.dirAt(opt.at[0] * r, opt.at[1] * r, x.spot); } else W.dirAt(dx, dz, x.spot);
      Object.assign(x, { on: true, phase: 'warm', t: 0, age: 0, r0: r, B: 0.65 * r, alt: 3.2 * r, eaten: false, sweeps: 1, hum: 0, scarT: 0, puff: 0, hadZone: true, fairT: 0, wasIn: false });
      x.zone = th.zoneAlloc(); x.plat.copy(x.spot);
      x.mk = th.map?.addMarker({ kind: 'ring', dir: x.spot, r: x.B, label: 'LASER', color: '#ff4a3a', eta: 2, pulse: true });
      th.stats.lasers++; th.sfx.laserCharge?.(2.4); th.sfx.klaxon(3);
      th.news('An orbital laser platform swings over the horizon'); th.ctx.hint(`ORBITAL LASER — keep out of the beam: it sweeps toward you, slower than you drive`);
      return true;
    },
    step(q, dt) {
      const r = q.r0, cd = th.game.camDist || R * 0.05, hr = hole.r;
      q.t += dt; q.age += dt;
      const dist = W.distTo(q.spot);
      if (q.phase === 'warm') {
        const w = Math.min(1, q.t / 2.0), e = smooth(0, 1, w);
        q.alt = (3.2 - 1.7 * e) * r; q.heat = 0;
        th.zoneSet(q.zone, q.spot, q.B, 0, Math.min(1, q.t * 1.5), 0, 4);
        if (q.t >= 2.0) { q.phase = 'sweep'; q.t = 0; th.stats.locks++; th.sfx.laserBeam?.(); }
      }
      if (q.phase === 'sweep') {
        q.heat = Math.min(1, q.heat + dt * 3);
        // the spot walks toward the hole at 0.3 of its speed (great-circle step), the platform trails 1.3 r behind it
        p0.copy(W.hdir).addScaledVector(q.spot, -W.hdir.dot(q.spot)); const l = p0.length();
        if (l > 1e-9) { p0.multiplyScalar(1 / l); const ang = Math.min(l > 0 ? Math.asin(Math.min(1, l)) : 0, T.sweep * P3.speed(hr) * dt / R), cs = Math.cos(ang), sn = Math.sin(ang); p1.copy(q.spot).multiplyScalar(cs).addScaledVector(p0, sn); q.spot.copy(p1).normalize(); }
        p0.copy(W.hdir).addScaledVector(q.spot, -W.hdir.dot(q.spot)).normalize().negate(); // (away from the hole)
        const lag = 1.3 * r / R; p1.copy(q.spot).multiplyScalar(Math.cos(lag)).addScaledVector(p0, Math.sin(lag)); q.plat.lerp(p1, Math.min(1, dt * 3)).normalize();
        th.zoneSet(q.zone, q.spot, q.B, 0, 1, q.heat, 4);
        if (q.mk) q.mk.eta = Math.max(0, T.dur - q.t);
        const d2 = W.distTo(q.spot);
        if (d2 < q.B) { // in the beam
          state.slow = Math.max(state.slow || 0, 0.15); state.slowK = T.jam;
          q.fairT = th.t;
          if (!q.wasIn) { q.wasIn = true; th.stats.laserHits++; th.ctx.hint('IN THE BEAM — run, it is slower than you'); }
          th.hurtCont(T.rate, dt, 'Laser!', 'laser', T.k, q.age, q.spot);
          th.notice(2 * dt * 10);
        } else q.wasIn = false;
        // sound: a hum, louder near
        if ((q.hum -= dt) <= 0) { q.hum = 1.1; th.sfx.laserBeam?.(Math.max(0.15, 1 - d2 / (14 * r))); }
        // the burn: scar decals along the path, smoke, sparks
        if ((q.scarT -= dt) <= 0) { q.scarT = 0.45; th.scar(q.spot, 0.6 * r, 0, 40, 3); }
        th.surf(q.spot, 0, p2, Math.max(0, W.P.elevation(q.spot, 3)));
        if ((q.puff -= dt) <= 0) {
          q.puff = 0.07; tangentAt(q.spot, rnd(0, 6.283), p3);
          th.smoke.spawn(p2, p4.copy(p3).multiplyScalar(0.5 * r).addScaledVector(q.spot, 0.45 * r), 0.35 * r, 1.0 * r, 2.2, Math.random() < 0.5 ? SMOKE0 : ASH, 0.55, 0.8);
          th.glow.spawn(p2, null, 0.25 * r, 0.8 * r, 0.25, FIRE[2], 1.4, 0);
        }
        th.glow.spawn(p2, null, 0.7 * r, 0.9 * r, 0.08, WHITE, 0.9 * q.heat, 0); th.glow.spawn(p2, null, 1.2 * r, 1.5 * r, 0.1, HOT, 0.22 * q.heat, 0);
        th.trauma(Math.max(0, 0.04 * (1 - d2 / (6 * r))) * dt * 20 * 0.1);
        if (d2 < 3.5 * hr && (q.lit = (q.lit ?? 0) - dt) <= 0) { q.lit = 0.35; th.screenFlash(0.05 + 0.08 * (1 - d2 / (3.5 * hr)), '#ff8a4a', 260); } // (the sky lights up)
        if (q.t >= T.dur) { q.phase = 'aim'; q.t = 0; th.zoneFree(q.zone); q.zone = -1; q.mk?.remove(); q.mk = th.map?.addMarker({ kind: 'site', dir: q.plat, label: 'PLATFORM', color: '#ffd36a', pulse: true }); th.sfx.laserOff?.(); th.news('The laser platform drops low to re-aim — it can be swallowed'); th.ctx.hint('The platform is low — swallow it (within 0.8 r)'); }
      } else if (q.phase === 'aim') {
        q.alt += (0.3 * r - q.alt) * Math.min(1, dt * 2); if (q.mk) q.mk.eta = Math.max(0, 5 - q.t);
        if (W.distTo(q.plat) < 0.8 * hr && !q.eaten) { this.eat(q); return; }
        if (q.t > 5) { if (--q.sweeps > 0) { // a second sweep from a new spot
          W.dirAt(rnd(-1, 1) * 5 * hr, -5 * hr * rnd(0.6, 1), q.spot); q.plat.copy(q.spot); Object.assign(q, { phase: 'warm', t: 0, alt: 3.2 * r, B: 0.65 * hole.r, r0: hole.r, hum: 0 }); q.zone = th.zoneAlloc(); q.mk?.remove(); q.mk = th.map?.addMarker({ kind: 'ring', dir: q.spot, r: q.B, label: 'LASER', color: '#ff4a3a', eta: 2, pulse: true }); th.sfx.laserCharge?.(2.4); }
          else { k.finish(q); return; } }
      } else if (q.phase === 'eaten') {
        const u = Math.min(1, q.t / 0.9), e = u * u; p0.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); q.mod.position.lerpVectors(q.pos0, p0, e); q.mod.scale.setScalar(q.sc * (1 - 0.92 * e)); q.mod.rotateY(dt * 8);
        if (u >= 1) k.finish(q);
        return;
      }
      // the platform and the beam
      if (q.phase === 'warm' || q.phase === 'sweep' || q.phase === 'aim') {
        const sc = 1.3 * r / 102;
        th.surf(q.plat, q.alt, q.mod.position, Math.max(0, W.P.elevation(q.plat, 3)));
        if (q.phase === 'warm') p3.copy(q.spot); else p3.copy(q.spot);
        p0.copy(p3).addScaledVector(q.plat, -p3.dot(q.plat)); if (p0.lengthSq() < 1e-12) p0.copy(tangentAt(q.plat, 0, p1)); p0.normalize();
        aim(q.mod, p0, q.plat, 'x'); q.mod.scale.setScalar(sc); q.mod.visible = true; q.sc = sc; q.pos0 = q.mod.position;
        if (q.phase !== 'aim') {
          th.surf(q.spot, 0, p2, Math.max(0, W.P.elevation(q.spot, 3)));
          const flick = q.phase === 'warm' ? 0.25 + 0.2 * Math.sin(q.t * 40) : 1, wc = (q.phase === 'warm' ? 0.012 : 0.07) * r * (0.85 + 0.15 * Math.sin(q.t * 31)), wg = 0.24 * r * q.heat * (0.85 + 0.15 * Math.sin(q.t * 23 + 1));
          p4.copy(q.mod.position).addScaledVector(p0, 0.35 * r).addScaledVector(q.plat, -0.12 * r); // (the emitter: the platform's nose)
          for (let i = 0; i < 10; i++) {
            const u = i / 9; p1.lerpVectors(p4, p2, u);
            core.set(i, p1, wc, 1.0 * flick, 0.86 * flick, 0.7 * flick, 1.0 * flick);
            glow.set(i, p1, wg + wc, 1.0, 0.28, 0.1, 0.5 * q.heat);
          }
          core.done(10, th.camP); glow.done(10, th.camP);
          if (q.phase === 'sweep' || q.t > 0.3) { for (let j = 0; j < 3; j++) { p1.lerpVectors(p4, p2, Math.random()); th.glow.spawn(p1, null, 0.4 * r, 0.7 * r, 0.12, q.phase === 'sweep' ? RED : HOT, 0.4 * Math.max(0.3, q.heat), 0); } }
          th.glow.spawn(p4, null, 0.35 * r, 0.5 * r, 0.06, WHITE, 1.1, 0);
        } else { core.hide(); glow.hide(); }
        if (q.mk) { q.mk.dir = q.phase === 'aim' ? q.plat : q.spot; }
      }
    },
    eat(q) {
      q.phase = 'eaten'; q.eaten = true; q.t = 0; th.stats.laserEaten++; th.gain(T.gulp, 'laserGulp'); state.frenzy = 6; state.belly = Math.min(1, state.belly + 0.2);
      core.hide(); glow.hide(); q.mk?.remove(); q.mk = null;
      p0.copy(q.mod.position).setLength(R + 1e3); th.glow.spawn(q.mod.position, null, 0.8 * hole.r, 3 * hole.r, 0.6, C(0xdff6ff, 3), 1.8, 0); th.glow.spawn(q.mod.position, null, 3 * hole.r, 3.4 * hole.r, 0.14, C(0xf0e4ff, 3.4), 3, 0);
      th.sfx.tink(); th.sfx.choir?.(0.6); th.beat(0.15); th.trauma(0.3); th.screenFlash(0.4, '#e8dcff', 300); th.notice(6);
      th.ctx.card('LASER PLATFORM SWALLOWED', `+${Math.round(T.gulp * 100)}% — Frenzy`); th.news('The void swallows an orbital laser platform');
    },
    finish(q) { q.on = false; q.phase = 'gone'; q.mod.visible = false; core.hide(); glow.hide(); if (q.zone >= 0) th.zoneFree(q.zone); q.zone = -1; q.mk?.remove(); q.mk = null; },
    danger(q, out) {
      if (q.phase === 'warm' || q.phase === 'sweep') { th.offsetOf(q.spot, o); out.push({ kind: 'beam', id: `b${q.i}`, x: o.x, z: o.z, R: q.B, eta: q.phase === 'warm' ? 2 - q.t : 0, locked: true, hot: q.phase === 'sweep' }); }
      else if (q.phase === 'aim' && !q.eaten) { th.offsetOf(q.plat, o); out.push({ kind: 'target', id: `p${th.stats.lasers}`, x: o.x, z: o.z, R: 0.8 * hole.r, eta: 5 - q.t, what: 'platform', grp: `lp${th.stats.lasers}` }); }
    },
    line(q, pick) {
      if (q.phase === 'warm') pick(2 - q.t, `ORBITAL LASER · warming · <b>${Math.max(0, 2 - q.t).toFixed(1)} s</b>`, 'lock');
      else if (q.phase === 'sweep') pick(0.5, `ORBITAL LASER · <b>${KMs(2 * q.B)}</b> beam sweeping · outrun it · <b>${Math.max(0, T.dur - q.t).toFixed(0)} s</b>`, 'lock');
      else if (q.phase === 'aim') pick(0.6, `LASER PLATFORM LOW · swallow it · <b>${Math.max(0, 5 - q.t).toFixed(1)} s</b>`, 'good');
    },
  };
  model.visible = false;
  return k;
}
