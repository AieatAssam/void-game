// Nature's turn (docs/PHASE3-REVIEW.md B5, T1-T2): the tsunami and the volcano.
//  TSUNAMI: caused by a nuke that goes off over the sea or by tearing off a coastal unit (class >= 2). A foam front (zone kind 3) races out from the cause at 0.45 r/s for 14 s
//  with a bank of white mist riding it; crossing the hole's centre it costs 3% and a kick along the outward normal (outrun it: you are faster). The land it crossed is rubble:
//  credit x1.5 for 30 s after.
//  VOLCANO: a district named Massif (else the highest in reach) 3-10 r away rumbles for 3 s, then erupts for ~22 s: a smoke column, an ash fall zone (speed x0.7), and three lava
//  bombs (a small ring tracking the hole for 2 s, locked 1.5 s, 3%). Swallow the district while it erupts: MAGMA SURGE (Frenzy, credit x1.5 for 8 s).
import * as THREE from 'three/webgpu';
import { R } from '../planetgen.js';
import { P3, T3 } from '../phase3.js';
import { C, FIRE, SMOKE0, SMOKE1, ASH, rnd, smooth, tangentAt, vel3 } from './kit.js';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3(), f = new THREE.Vector3(), o = {};
const MIST = C(0xeaf7ff), FOAM = C(0xbfe6ff, 2), LAVA = C(0xff5a14, 2.4), EMBER = C(0xffb050, 3);

export function makeTsunami(th) {
  const T = T3.kinds.tsunami, { W, hole, state } = th;
  const items = [0, 1].map((i) => ({ i, on: false, dir: new THREE.Vector3(), zone: -1, mk: null }));
  const k = {
    name: 'tsunami', cost: 0, cool: T.cool, cool0: 30, items, passive: true, window: () => false, live: () => false, age: (q) => q.age,
    spawn(opt = {}) { // force: the cause 2.6 r ahead of the hole, or opt.at = [dx, dz] in r
      const r = hole.r; if (opt.at) W.dirAt(opt.at[0] * r, opt.at[1] * r, a); else W.dirAt(0.6 * r, -2.6 * r, a);
      return !!k.at(a, { force: true, ...opt });
    },
    /** A wave from planet direction d (opt.cause: 'nuke' | 'coast'). One at a time (cooldown), and only T1-T2. */
    at(d, opt = {}) {
      const r = hole.r, q = items.find((i) => !i.on); if (!q || (r >= 450e3 && !opt.force)) return null;
      if (th.cool.tsunami > 0 && !opt.force) return null;
      const zone = th.zoneAlloc(); if (zone < 0) return null;
      th.cool.tsunami = rnd(T.cool[0], T.cool[1]);
      Object.assign(q, { on: true, age: 0, r0: r, v: 0.45 * r, band: 0.24 * r, life: 14, zone, hit: false, mist: 0, inside: W.distTo(d) < 1.2 * r });
      q.dir.copy(d); q.mk = th.map?.addMarker({ kind: 'ring', dir: q.dir, r: 0.5 * r, label: 'TSUNAMI', color: '#6fd8ff', pulse: true });
      th.stats.tsunamis++; th.sfx.tsunami?.(); th.trauma(0.2); th.notice(3);
      th.surf(q.dir, 0, a, 0); // the splash column at the cause
      th.glow.spawn(a, null, 2 * r, 3 * r, 0.5, FOAM, 1.4, 0); for (let i = 0; i < 10; i++) th.smoke.spawn(a, vel3(q.dir, rnd(-1, 1) * r, rnd(-1, 1) * r, rnd(0.6, 1.8) * r, f), 0.6 * r, 1.6 * r, 3.5, MIST, 0.5, 0.5);
      th.news(opt.cause === 'coast' ? 'A coastline falls into the void: a tsunami races across the sea' : 'The blast throws up a tsunami over the sea');
      th.ctx.hint('TSUNAMI — step away from the wave front, you are faster than it');
      return q;
    },
    step(q, dt) {
      const r = q.r0, hr = hole.r; q.age += dt;
      const front = 0.5 * r + q.v * Math.min(q.age, q.life), dist = W.distTo(q.dir), fade = 1 - smooth(q.life - 3, q.life, q.age);
      if (q.age < q.life) {
        th.zoneSet(q.zone, q.dir, front, Math.min(q.band, 0.07 * front), Math.min(1, q.age * 1.5) * fade * 0.9, 0, 3);
        if (q.mk) { q.mk.r = front; q.mk.eta = Math.max(0, (dist - front) / q.v); }
        if ((q.mist -= dt) <= 0) { // the mist bank riding the front, and spray
          q.mist = 0.07;
          for (let i = 0; i < 3; i++) {
            const an = rnd(0, 6.283), ang = front / R; tangentAt(q.dir, an, c); a.copy(q.dir).multiplyScalar(Math.cos(ang)).addScaledVector(c, Math.sin(ang)); th.surf(a, 0.02 * r, b, Math.max(0, W.P.elevation(a, 2)));
            th.smoke.spawn(b, vel3(a, c.x * 0.2 * r, c.y * 0.2 * r, 0.25 * r, f), 0.4 * r, 1.2 * r, 2.4, MIST, 0.4, 0.6);
          }
        }
        if (!q.hit) { // the front passes the hole's centre: once (a hole already inside the start disc has to be left first)
          if (dist < front - 0.05 * r) { q.hit = true; if (!q.inside) this.cross(q); }
          else if (q.inside && dist > front) q.inside = false;
        }
      }
      // the land the wave crossed is rubble for 30 s after it spends itself
      if (q.age > q.life * 0.4 && dist < front - 0.3 * hr) state.rubbleNow = true;
      if (q.age > q.life + T.rubbleT) k.finish(q);
      else if (q.age >= q.life && q.zone >= 0) { th.zoneFree(q.zone); q.zone = -1; q.mk?.remove(); q.mk = null; }
    },
    cross(q) {
      th.offsetOf(q.dir, o); const l = Math.hypot(o.x, o.z) || 1, kick = state.kick || (state.kick = { x: 0, z: 0 });
      kick.x = -o.x / l * 300; kick.z = -o.z / l * 300; // (the cause is at (o.x, o.z): pushed away from it, with the water)
      th.hurt(T.hit, 'Tsunami!', 'tsunami', T.k, 0.25, q.age); th.sfx.surf?.(); th.beat(0.05); th.notice(2);
    },
    finish(q) { q.on = false; if (q.zone >= 0) th.zoneFree(q.zone); q.zone = -1; q.mk?.remove(); q.mk = null; },
    line(q, pick) {
      if (q.age < q.life && !q.hit && W.distTo(q.dir) < 0.5 * q.r0 + q.v * q.life) { const eta = Math.max(0, (W.distTo(q.dir) - 0.5 * q.r0 - q.v * q.age) / q.v); pick(eta + 0.5, `TSUNAMI · front arrives in <b>${eta.toFixed(1)} s</b> · outrun it`, eta < 2.5 ? 'lock' : ''); }
    },
    danger(q, out) {
      if (q.age < q.life && !q.hit) { th.offsetOf(q.dir, o); out.push({ kind: 'wave', id: `w${q.i}`, x: o.x, z: o.z, R: 0.5 * q.r0 + q.v * q.age, v: q.v, eta: 0, locked: true }); }
    },
  };
  return k;
}

export function makeVolcano(th) {
  const T = T3.kinds.volcano, { W, hole, state } = th, lf = () => W.bite.lf;
  const bombs = [0, 1, 2].map((i) => ({ i, on: false, zone: -1, mk: null, to: new THREE.Vector3(), pos: new THREE.Vector3() }));
  const x = { i: 0, on: false, dir: new THREE.Vector3(), u: -1, mk: null, bombs, zoneAsh: -1, name: '' };
  const k = {
    name: 'volcano', cost: T.cost, cool: T.cool, cool0: 60, items: [x], zones: 4,
    window: (r) => r < 450e3, can: () => th.zonesFree() >= 4, live: (q) => q.phase === 'rumble' || (q.phase === 'erupt' && q.age < 14), age: (q) => q.age - 3,
    spawn(opt = {}) {
      if (x.on || th.zonesFree() < 4 || !lf()?.ready) return false;
      const r = hole.r, v = lf().lv[1], h = W.hdir; let best = -1, bs = -1e9;
      const lo = opt.near ? 0 : 3 * r / R, hi = (opt.near ?? 10) * r / R + (opt.near ? 0 : 0);
      for (let u = 0; u < v.n; u++) {
        if (!(v.left[u] > 0.4 * v.area0[u]) || v.torn[u] || v.area0[u] < 1) continue;
        const d = Math.acos(Math.min(1, v.c[u * 3] * h.x + v.c[u * 3 + 1] * h.y + v.c[u * 3 + 2] * h.z)); if (d < lo || d > hi) continue;
        const ht = v.hsum[u] / v.area0[u], sc = ht + (ht > 2000 ? 3000 : 0) - d * R / r * 30 + Math.random() * 200; if (sc > bs) { bs = sc; best = u; }
      }
      if (best < 0) return false;
      x.u = best; x.dir.set(v.c[best * 3], v.c[best * 3 + 1], v.c[best * 3 + 2]); x.name = lf().name(1, best);
      Object.assign(x, { on: true, phase: 'rumble', age: 0, r0: r, sm: 0, gl: 0, magma: false, bi: 0, ashA: 0 });
      x.zoneAsh = th.zoneAlloc(); for (const bm of bombs) { bm.on = false; bm.zone = -1; }
      x.mk = th.map?.addMarker({ kind: 'site', dir: x.dir, label: 'ERUPTION', color: '#ff7a3c', pulse: true });
      th.stats.volcanoes++; th.sfx.volcano?.(); th.news(`${x.name} is rumbling: the mountain is about to blow`); th.ctx.hint(`${x.name} erupts in 3 s — swallow it while it burns for MAGMA SURGE`);
      return true;
    },
    step(q, dt) {
      const r = q.r0, hr = hole.r; q.age += dt;
      const dist = W.distTo(q.dir); th.surf(q.dir, 0, a, Math.max(0, W.P.elevation(q.dir, 3)));
      if (q.phase === 'rumble') {
        if ((q.sm -= dt) <= 0) { q.sm = 0.2; th.smoke.spawn(a, vel3(q.dir, rnd(-1, 1) * 0.2 * r, rnd(-1, 1) * 0.2 * r, 0.4 * r, f), 0.3 * r, 0.8 * r, 3, ASH, 0.3, 0.4); }
        th.trauma(0.015); if (q.age >= 3) { q.phase = 'erupt'; th.sfx.volcano?.(true); th.scar(q.dir, 2.2 * r, 0, 70, 3); th.scar(q.dir, 1.2 * r, 0, 60, 3); th.trauma(0.3); th.screenFlash(0.2, '#ff9a4a', 300); th.beat(0.05); }
      }
      if (q.phase === 'erupt') {
        const t = q.age - 3;
        // the column: dark smoke rising and spreading, embers thrown out, a glowing crater
        if ((q.sm -= dt) <= 0) { q.sm = 0.035; th.smoke.spawn(a, vel3(q.dir, rnd(-1, 1) * 0.3 * r, rnd(-1, 1) * 0.3 * r, rnd(1.0, 1.9) * r, f), 0.7 * r, 2.8 * r, 7, Math.random() < 0.6 ? SMOKE0 : ASH, 0.6, 0.3); }
        if ((q.gl -= dt) <= 0) {
          q.gl = 0.1; th.glow.spawn(a, null, 0.9 * r, 1.5 * r, 0.3, FIRE[2], 1.5, 0);
          th.glow.spawn(a, vel3(q.dir, rnd(-1, 1) * 1.4 * r, rnd(-1, 1) * 1.4 * r, rnd(1.2, 2.6) * r, f), 0.16 * r, 0.05 * r, 1.2, EMBER, 1.0, 0.9);
        }
        // the ash fall: a zone, speed x0.7 while inside
        q.ashA = Math.min(1, q.ashA + dt * 0.5) * (1 - smooth(21, 25, t)); const ashR = 2.8 * r + 0.6 * r * Math.min(1, t / 6);
        th.zoneSet(q.zoneAsh, q.dir, ashR, 0, q.ashA * 0.9, 0, 5); if (dist < ashR) state.ashNow = true;
        // the lava bombs
        const when = [0.6, 4.6, 8.6];
        if (q.bi < 3 && t >= when[q.bi]) this.bomb(q, bombs[q.bi++]);
        for (const bm of bombs) if (bm.on) this.bombStep(q, bm, dt);
        // MAGMA SURGE: the district is gone while it burns
        if (!q.magma && t > 0.5 && lf().done(1, q.u)) { q.magma = true; th.stats.magma++; state.magma = T.surgeT; state.frenzy = 6; th.beat(0.15, 0.5, 0.8); th.screenFlash(0.45, '#ffb060', 360); th.sfx.choir?.(0.7); th.ctx.card('MAGMA SURGE', `${q.name} swallowed mid-eruption: land ×${T.surge}`); th.news('The void drinks the volcano: magma surge'); th.notice(8); }
        if (t > 25) { k.finish(q); return; }
      }
      if (q.mk) q.mk.eta = Math.max(0, 3 - q.age);
    },
    bomb(q, bm) {
      const r = q.r0, hr = hole.r, lock = th.lockFor(0.4, 1.5), sp = Math.hypot(hole.vx, hole.vz), ux = sp > 0.05 * P3.speed(hr) ? hole.vx / sp : 0, uz = sp > 0.05 * P3.speed(hr) ? hole.vz / sp : -1, aa = rnd(0, 6.283), d = rnd(0.3, 1.4) * hr;
      Object.assign(bm, { on: true, age: 0, lock, T: lock + 2.0, locked: false, ox: 0, oz: 0, cx: Math.cos(aa) * d, cz: Math.sin(aa) * d, ux, uz, B: 0.7 * hr, r0: hr, boom: false, bt: 0, hadZone: true, puff: 0 });
      bm.zone = th.zoneAlloc(); bm.to.copy(W.hdir);
      bm.mk = th.map?.addMarker({ kind: 'ring', dir: bm.to, r: bm.B, label: 'LAVA', color: '#ff7a3c', eta: bm.T });
      th.sfx.rumble?.(0.6, 0.1); th.trauma(0.15); th.ctx.hint('LAVA BOMB — step out of the ring');
    },
    bombStep(q, bm, dt) {
      const r = bm.r0; bm.age += dt; const eta = bm.T - bm.age;
      if (bm.boom) { bm.bt += dt; if (bm.bt > 0.5) { bm.on = false; if (bm.zone >= 0) th.zoneFree(bm.zone); bm.zone = -1; bm.mk?.remove(); bm.mk = null; } return; }
      if (eta > bm.lock) { const wx = hole.vx * bm.lock + bm.cx, wz = hole.vz * bm.lock + bm.cz, kk = Math.min(1, dt * 5); bm.ox += (wx - bm.ox) * kk; bm.oz += (wz - bm.oz) * kk; W.dirAt(bm.ox, bm.oz, bm.to); }
      else if (!bm.locked) { bm.locked = true; bm.lockAt = th.t; th.sfx.lockBeep?.(); }
      th.zoneSet(bm.zone, bm.to, bm.B, 0, Math.min(1, bm.age * 2) * (bm.locked ? 1 : 0.8), bm.locked ? Math.min(1, (bm.lock - eta) / bm.lock) + 0.001 : 0, 0);
      if (bm.mk) { bm.mk.eta = eta; bm.mk.dir = bm.to; }
      const u = Math.min(1, bm.age / bm.T), t = Math.pow(u, 1.1), apex = Math.min(2.5e6, 0.35 * W.distTo(q.dir) + 1.5 * r);
      a.copy(q.dir).lerp(bm.to, t).normalize(); bm.pos.copy(a).multiplyScalar(R + apex * 4 * t * (1 - t) + 0.1 * r);
      th.glow.spawn(bm.pos, null, 0.3 * r, 0.5 * r, 0.25, LAVA, 1.6, 0); if ((bm.puff -= dt) <= 0) { bm.puff = 0.05; th.smoke.spawn(bm.pos, null, 0.22 * r, 0.7 * r, 1.6, SMOKE0, 0.35, 0.5); }
      if (eta <= 0) this.land(q, bm);
    },
    land(q, bm) {
      const r = bm.r0, dist = W.distTo(bm.to); bm.boom = true; bm.bt = 0; if (bm.mk) { bm.mk.remove(); bm.mk = null; }
      th.surf(bm.to, 0, a, Math.max(0, W.P.elevation(bm.to, 3))); b.copy(a).setLength(R + Math.max(0, W.P.elevation(bm.to, 3)) * W.E + 0.3 * r);
      th.glow.spawn(b, null, 1.6 * r, 1.8 * r, 0.12, FIRE[0], 3, 0); th.glow.spawn(b, null, 0.4 * bm.B, 2.2 * bm.B, 0.8, FIRE[2], 1.9, 0.3); th.glow.spawn(b, null, 0.3 * bm.B, 1.5 * bm.B, 1.6, LAVA, 1.4, 0.2);
      for (let i = 0; i < 8; i++) { const an = (i / 8) * 6.283; tangentAt(bm.to, an, c); e.copy(a).addScaledVector(c, 0.25 * bm.B); th.smoke.spawn(e, vel3(bm.to, c.x * 0.7 * r, c.y * 0.7 * r, 0.15 * r, f), 0.4 * r, 1.1 * r, 3, SMOKE0, 0.55, 0.6); }
      th.scar(bm.to, 1.4 * bm.B, 0.8 * r, 12, 0); th.scar(bm.to, 0.9 * bm.B, 0.2 * r, 50, 3);
      const near = Math.max(0.1, 1 - dist / (6 * r)); th.sfx.nukeBoom(0.3 + 0.3 * near, Math.min(1, dist / (12 * r))); th.trauma(0.08 + 0.12 * near);
      if (dist < bm.B) { th.hurt(T.hit, 'Lava bomb!', 'volcano', T.k, 0.25, bm.locked ? th.t - bm.lockAt : -1); th.notice(3); }
    },
    finish(q) { q.on = false; if (q.zoneAsh >= 0) th.zoneFree(q.zoneAsh); q.zoneAsh = -1; for (const bm of bombs) { bm.on = false; if (bm.zone >= 0) th.zoneFree(bm.zone); bm.zone = -1; bm.mk?.remove(); bm.mk = null; } q.mk?.remove(); q.mk = null; },
    danger(q, out) { for (const bm of bombs) if (bm.on && !bm.boom) { th.offsetOf(bm.to, o); out.push({ kind: 'lava', id: `v${bm.i}`, x: o.x, z: o.z, R: bm.B, inner: 0, eta: bm.T - bm.age, locked: bm.locked, lock: bm.lock }); } },
    line(q, pick) {
      if (q.phase === 'rumble') pick(3 - q.age, `${q.name.toUpperCase()} · erupting in <b>${Math.max(0, 3 - q.age).toFixed(1)} s</b>`, 'lock');
      let best = 1e9, mm = null; for (const bm of bombs) if (bm.on && !bm.boom && bm.T - bm.age < best) { best = bm.T - bm.age; mm = bm; }
      if (mm) pick(best, `LAVA BOMB · impact <b>${Math.max(0, best).toFixed(1)} s</b>${mm.locked ? ' · LOCKED' : ''}`, mm.locked ? 'lock' : '');
      else if (q.phase === 'erupt' && !q.magma) pick(60, `${q.name.toUpperCase()} ERUPTING · swallow it for MAGMA SURGE`, 'good');
    },
  };
  return k;
}
