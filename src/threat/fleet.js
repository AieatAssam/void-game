// Carrier groups and cruise-missile salvos (docs/PHASE3-REVIEW.md B4, T1-T2, DEFCON <= 4): life on the sea. An aircraft carrier and two destroyers (readable scale: 1.5 r and
// 0.8 r long) sail 6-10 r off on open sea with white wakes. Every 12 s while the hole is within 15 r the carrier launches 3-5 cruise missiles: a small ring (0.55 r) per
// missile tracks the hole for 2 s, then locks for 1.5 s; 4% each, 10% per salvo. The ships are edible (within 0.7 r: +1.5% each; the carrier ends the salvos; all three inside
// 6 s: FLEET SUNK +3%).
import * as THREE from 'three/webgpu';
import { R } from '../planetgen.js';
import { P3, T3 } from '../phase3.js';
import { C, FIRE, SMOKE0, SMOKE1, rnd, aim, tangentAt, vel3 } from './kit.js';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3(), f = new THREE.Vector3(), o = {};
const WAKE = C(0xeaf6ff), SPLASH = C(0xcfeaff, 2.2);
const SHIPS = [{ m: 'aircraft_carrier', len: 348, L: 2.8, fx: 0, fy: 0 }, { m: 'destroyer', len: 150, L: 1.5, fx: -1.8, fy: 2.4 }, { m: 'destroyer', len: 150, L: 1.5, fx: -1.8, fy: -2.4 }];

export function makeFleet(th) {
  const T = T3.kinds.fleet, { W, hole, state } = th;
  const x = { i: 0, on: false, c: new THREE.Vector3(), hv: new THREE.Vector3(), ships: SHIPS.map((s) => ({ ...s, mod: th.model(s.m), dir: new THREE.Vector3(), alive: false, sink: 0, p0: new THREE.Vector3() })), mk: null, missiles: [] };
  for (let i = 0; i < 5; i++) x.missiles.push({ i, on: false, mod: th.model('icbm'), from: new THREE.Vector3(), to: new THREE.Vector3(), pos: new THREE.Vector3(), zone: -1, mk: null });
  const sea = (d) => W.bite.landAt(d) < 0 && W.P.elevation(d, 3) < -150;
  const place = (q, r) => {
    for (const s of q.ships) { // the ships in the fleet's frame: fx along the heading, fy to the side (in radii)
      a.crossVectors(q.c, q.hv); b.copy(q.c).addScaledVector(q.hv, s.fx * r / R).addScaledVector(a, s.fy * r / R).normalize(); s.dir.copy(b);
    }
  };
  const k = {
    name: 'fleet', cost: T.cost, cool: T.cool, cool0: 20, items: [x], zones: 5,
    window: (r, dc) => r < 450e3 && dc <= 4, can: () => th.zonesFree() >= 5,
    live: (q) => q.ships[0].alive && q.missiles.some((m) => m.on),
    age: (q) => q.age - 4,
    spawn(opt = {}) {
      if (x.on || th.zonesFree() < 4) return false;
      const r = hole.r, sp = Math.hypot(hole.vx, hole.vz), hd = sp > 0.05 * P3.speed(r) ? Math.atan2(hole.vx, -hole.vz) : 0;
      for (let t = 0; t < 60; t++) {
        const ang = hd + rnd(-1.1, 1.1), dist = (opt.near ?? rnd(4.5, 7.5)) * r;
        W.dirAt(Math.sin(ang) * dist, -Math.cos(ang) * dist, x.c);
        if (!sea(x.c)) continue;
        // heading: a random bearing, then every ship's spot must be open sea
        const br = rnd(0, 6.283); tangentAt(x.c, br, x.hv); place(x, r);
        if (!x.ships.every((s) => sea(s.dir))) continue;
        Object.assign(x, { on: true, nSalvo: 0, uid: (x.uid || 0) + 1, age: 0, r0: r, salvoT: 4, eatT: -99, eaten: 0, sunk: false, wake: 0, nxt: 0, ang: br });
        for (const s of x.ships) { s.alive = true; s.sink = 0; s.mod.visible = true; }
        x.mk = th.map?.addMarker({ kind: 'site', dir: x.ships[0].dir, label: 'FLEET', color: '#5dc8ff', pulse: true });
        th.stats.fleets++; th.news('A carrier group is at sea: cruise missiles incoming when it is in range'); th.ctx.hint('FLEET sighted — swallow the carrier to stop its missiles');
        return true;
      }
      return false;
    },
    step(q, dt) {
      const r = q.r0, hr = hole.r, cd = th.game.camDist || R * 0.05, dist = W.distTo(q.ships[0].dir);
      q.age += dt;
      let live = 0, up = false; for (const s of q.ships) if (s.alive) live++; for (const m of q.missiles) if (m.on) up = true;
      // sailing: slowly, along the heading; turn away from land
      const v = 0.12 * P3.speed(hr), ang = v * dt / R;
      if ((q.nxt -= dt) <= 0) { q.nxt = 0.6; c.copy(q.hv).multiplyScalar(Math.cos(0.9 * r / R)).addScaledVector(q.c, -Math.sin(0.9 * r / R)); e.copy(q.c).multiplyScalar(Math.cos(0.9 * r / R)).addScaledVector(q.hv, Math.sin(0.9 * r / R)); if (!sea(e.normalize())) { q.ang += 0.9; tangentAt(q.c, q.ang, q.hv); } }
      if (live) { a.copy(q.c).multiplyScalar(Math.cos(ang)).addScaledVector(q.hv, Math.sin(ang)); b.copy(q.hv).multiplyScalar(Math.cos(ang)).addScaledVector(q.c, -Math.sin(ang)); q.c.copy(a).normalize(); q.hv.copy(b).addScaledVector(q.c, -b.dot(q.c)).normalize(); place(q, r); }
      // the ships, their wakes, being eaten
      q.wake -= dt;
      for (const s of q.ships) {
        if (s.alive) {
          th.surf(s.dir, 0, s.mod.position, 0);
          a.copy(q.hv).addScaledVector(s.dir, -q.hv.dot(s.dir)); if (a.lengthSq() < 1e-10) a.copy(tangentAt(s.dir, 0, f)); a.normalize();
          aim(s.mod, a, s.dir, 'x'); s.mod.scale.setScalar(s.L * r / s.len); s.mod.visible = true; s.p0.copy(s.mod.position);
          if (q.wake <= 0) { th.surf(s.dir, 0, b, 0); b.addScaledVector(a, -0.45 * s.L * r); th.smoke.spawn(b, null, 0.14 * s.L * r, 0.45 * s.L * r, 3.6, WAKE, 0.5, 0.4); b.addScaledVector(a, 0.9 * s.L * r); th.smoke.spawn(b, null, 0.1 * s.L * r, 0.2 * s.L * r, 1.2, WAKE, 0.55, 0.4); }
          if (W.distTo(s.dir) < 0.9 * hr) this.eat(q, s);
        } else if (s.sink > 0 && s.sink < 1) { // sinking into the well
          s.sink += dt / 0.9; const u = Math.min(1, s.sink), w = u * u; b.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); s.mod.position.lerpVectors(s.p0, b, w); s.mod.scale.multiplyScalar(1 - 0.05 * u); s.mod.rotateZ(dt * 3);
          if (s.sink >= 1) { s.mod.visible = false; s.sink = 2; }
        }
      }
      if (q.wake <= 0) q.wake = 0.22;
      if (q.mk && q.ships[0].alive) q.mk.dir = q.ships[0].dir;
      // the salvo
      const carrier = q.ships[0];
      if (carrier.alive && dist < 15 * hr && q.age < 40 && q.nSalvo < 2 && (q.salvoT -= dt) <= 0) { q.salvoT = T.salvo; q.nSalvo++; this.salvo(q); }
      for (const m of q.missiles) if (m.on) this.missile(q, m, dt);
      // gone: far away, or sunk and every missile landed
      if ((dist > 45 * hr && !up) || q.age > 60 || (!live && !up && q.ships[0].sink >= 1 && q.ships[1].sink >= 1 && q.ships[2].sink >= 1)) k.finish(q);
    },
    salvo(q) {
      const r = hole.r, n = Math.min(3 + Math.floor(Math.random() * 2), th.zonesFree());
      if (n < 3) return;
      const lock = th.lockFor(0.9, 2.0, 3.2), sp = Math.hypot(hole.vx, hole.vz), ux = sp > 0.05 * P3.speed(r) ? hole.vx / sp : 0, uz = sp > 0.05 * P3.speed(r) ? hole.vz / sp : -1, base = rnd(0, 6.283), salvo = { sum: 0 };
      let made = 0;
      for (const m of q.missiles) {
        if (made >= n) break; if (m.on) continue;
        const aa = base + made * (6.283 / n) + rnd(-0.3, 0.3), d = (made === 0 ? rnd(0.15, 0.45) : rnd(0.7, 1.9)) * r;
        Object.assign(m, { on: true, age: 0, lock, T: lock + 2.0, locked: false, ox: 0, oz: 0, cx: Math.cos(aa) * d, cz: Math.sin(aa) * d, ux, uz, B: 0.55 * r, r0: r, salvo, boom: false, puff: 0, hadZone: true });
        m.from.copy(q.ships[0].dir); m.to.copy(W.hdir); m.chord = W.distTo(m.from); m.apex = Math.min(0.12 * m.chord, 6 * r) + 0.3 * r;
        m.zone = th.zoneAlloc(); m.mod.visible = true;
        m.mk = th.map?.addMarker({ kind: 'ring', dir: m.to, r: m.B, label: 'CRUISE', color: '#5dc8ff', eta: m.T });
        made++;
      }
      if (made) { th.stats.salvos++; th.sfx.cruise?.(); th.news(`The carrier launches a salvo: ${made} cruise missiles`); th.ctx.hint(`CRUISE SALVO — ${made} small rings: step out of them`); }
    },
    missile(q, m, dt) {
      const r = m.r0, cd = th.game.camDist || R * 0.05;
      m.age += dt; const eta = m.T - m.age;
      if (m.boom) { m.t += dt; if (m.t > 3.5) k.endMissile(m); return; }
      if (eta > m.lock) { // tracking: the ring rides where the hole will be, spread around by the missile's own offset
        const wx = hole.vx * m.lock + m.cx, wz = hole.vz * m.lock + m.cz, kk = Math.min(1, dt * 5); m.ox += (wx - m.ox) * kk; m.oz += (wz - m.oz) * kk; W.dirAt(m.ox, m.oz, m.to);
      } else if (!m.locked) { m.locked = true; m.lockAt = th.t; th.sfx.lockBeep?.(); }
      th.zoneSet(m.zone, m.to, m.B, 0, Math.min(1, m.age * 2) * (m.locked ? 1 : 0.8), m.locked ? Math.min(1, (m.lock - eta) / m.lock) + 0.001 : 0, 0);
      if (m.mk) { m.mk.eta = eta; m.mk.dir = m.to; }
      // flight: a low arc from the ship to the ring
      const u = Math.min(1, m.age / m.T), t = Math.pow(u, 1.15);
      a.copy(m.from).lerp(m.to, t).normalize();
      const h = m.apex * 4 * t * (1 - t) + 0.12 * r * (1 - t);
      m.pos.copy(a).multiplyScalar(R + h);
      const t2 = Math.min(1, t + 0.02); b.copy(m.from).lerp(m.to, t2).normalize().multiplyScalar(R + m.apex * 4 * t2 * (1 - t2) + 0.12 * r * (1 - t2)); b.sub(m.pos).normalize();
      aim(m.mod, b, a, 'x'); m.mod.position.copy(m.pos); m.mod.scale.setScalar(0.5 * r / 35.3); m.mod.visible = true;
      if ((m.puff -= dt) <= 0) { m.puff = 0.04; th.smoke.spawn(m.pos, null, 0.14 * r, 0.5 * r, 1.4, SMOKE1, 0.3, 0.5); th.glow.spawn(m.pos, null, 0.18 * r, 0.3 * r, 0.12, FIRE[1], 1.3, 0); }
      if (eta <= 0) this.impact(q, m);
    },
    impact(q, m) {
      const r = m.r0, dist = W.distTo(m.to); m.boom = true; m.t = 0; m.mod.visible = false;
      th.surf(m.to, 0, a, Math.max(0, W.P.elevation(m.to, 3))); b.copy(a).setLength(R + Math.max(0, W.P.elevation(m.to, 3)) * W.E + 0.3 * r);
      th.glow.spawn(b, null, 1.6 * r, 1.8 * r, 0.12, FIRE[0], 3, 0); th.glow.spawn(b, null, 0.3 * m.B, 2.0 * m.B, 0.7, FIRE[1], 2.0, 0.3); th.glow.spawn(b, null, 0.2 * m.B, 1.4 * m.B, 1.2, FIRE[2], 1.5, 0.3);
      for (let i = 0; i < 8; i++) { const an = (i / 8) * 6.283; tangentAt(m.to, an, c); e.copy(a).addScaledVector(c, 0.25 * m.B); th.smoke.spawn(e, vel3(m.to, c.x * 0.6 * r, c.y * 0.6 * r, 0.1 * r, f), 0.4 * r, 1.0 * r, 3, SMOKE0, 0.5, 0.6); }
      th.scar(m.to, 1.3 * m.B, 0.8 * r, 12, 0); th.scar(m.to, 0.8 * m.B, 0.2 * r, 40, 3);
      const near = Math.max(0.1, 1 - dist / (6 * r)); th.sfx.nukeBoom(0.3 + 0.3 * near, Math.min(1, dist / (12 * r))); th.trauma(0.08 + 0.12 * near);
      if (m.zone >= 0) { th.zoneFree(m.zone); m.zone = -1; } m.mk?.remove(); m.mk = null;
      if (dist < m.B) {
        const room = Math.max(0, 0.10 - m.salvo.sum), got = room > 0.003 ? th.hurt(T.hit, 'Cruise missile!', 'fleet', T.k, room, m.locked ? th.t - m.lockAt : -1) : 0; m.salvo.sum += got; th.notice(3);
      }
    },
    endMissile(m) { m.on = false; m.mod.visible = false; if (m.zone >= 0) th.zoneFree(m.zone); m.zone = -1; m.mk?.remove(); m.mk = null; },
    eat(q, s) {
      s.alive = false; s.sink = 0.001; q.eaten++; th.stats.fleetGulps++; th.gain(T.eat, 'fleetGulp'); state.belly = Math.min(1, state.belly + 0.08);
      th.glow.spawn(s.mod.position, null, 0.8 * s.L * hole.r, 1.6 * s.L * hole.r, 0.5, SPLASH, 1.2, 0); th.sfx.tink?.(); th.sfx.gulpShip?.(); th.beat(0.06); th.trauma(0.1); th.notice(2);
      if (s === q.ships[0]) { th.news('The void swallows the carrier: its salvos stop'); th.ctx.hint('Carrier swallowed — no more cruise missiles'); }
      if (q.eaten === 1) q.eatT = th.t;
      if (q.eaten >= 3 && th.t - q.eatT <= 6 && !q.sunk) { q.sunk = true; th.stats.fleetSunk++; th.gain(T.all, 'fleetSunk'); th.ctx.card('FLEET SUNK', `+${Math.round(T.all * 100)}%`); th.sfx.choir?.(0.5); th.beat(0.12); th.screenFlash(0.3, '#cfeaff', 300); th.news('An entire carrier group vanishes into the void'); }
    },
    finish(q) {
      q.on = false; for (const s of q.ships) { s.mod.visible = false; s.alive = false; s.sink = 0; } for (const m of q.missiles) if (m.on) this.endMissile(m); q.mk?.remove(); q.mk = null;
    },
    danger(q, out) {
      for (const m of q.missiles) if (m.on && !m.boom) { th.offsetOf(m.to, o); out.push({ kind: 'cruise', id: `c${q.i}_${m.i}`, x: o.x, z: o.z, R: m.B, inner: 0, eta: m.T - m.age, locked: m.locked, lock: m.lock }); }
      for (const s of q.ships) if (s.alive) { th.offsetOf(s.dir, o); out.push({ kind: 'target', id: `s${q.uid}${s.m}${s.fy}`, x: o.x, z: o.z, R: 0.9 * hole.r, eta: 99, what: 'ship', reach: 9 }); }
    },
    line(q, pick) {
      let best = 1e9, mm = null; for (const m of q.missiles) if (m.on && !m.boom && m.T - m.age < best) { best = m.T - m.age; mm = m; }
      if (mm) pick(best, `CRUISE SALVO · <b>${q.missiles.filter((m) => m.on && !m.boom).length}</b> rings · impact <b>${Math.max(0, best).toFixed(1)} s</b>${mm.locked ? ' · LOCKED' : ''}`, mm.locked ? 'lock' : '');
      else if (q.ships[0].alive && W.distTo(q.ships[0].dir) < 15 * hole.r) pick(40 + q.salvoT, `FLEET · next salvo <b>${Math.max(0, q.salvoT).toFixed(0)} s</b> · swallow the carrier`, 'good');
    },
  };
  for (const s of x.ships) s.mod.visible = false;
  return k;
}
