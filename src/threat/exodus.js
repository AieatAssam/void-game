// Sky life (docs/PHASE3-REVIEW.md B7, T2-T3): not hostile, FOOD. Evacuation rockets climb out of a Metro Belt (else the brightest district) 3-9 r from the hole in waves of two or
// three, each with a white contrail; swallow one while it is still low (within 0.8 r of its subpoint, altitude < 1.2 r): +0.3%. Later, a space station swings over on a
// low orbit 1.5-2.5 r to the side for 12 s (T3-T4): swallow it for +1%. Both make the planet feel inhabited, and both are "something small in space".
import * as THREE from 'three/webgpu';
import { R } from '../planetgen.js';
import { P3, T3 } from '../phase3.js';
import { C, FIRE, SMOKE1, rnd, smooth, aim, tangentAt, vel3, Ribbon } from './kit.js';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3(), f = new THREE.Vector3(), o = {};
const TRAIL = C(0xe8f2ff, 1.6), FLAME = C(0xffc070, 3);

export function makeExodus(th) {
  const T = T3.kinds.exodus, { W, hole, state } = th, lf = () => W.bite.lf;
  const rk = [0, 1, 2].map((i) => ({ i, on: false, mod: th.model('rocket'), trail: new Ribbon(18, th.root), dir: new THREE.Vector3(), pos: new THREE.Vector3(), mk: null }));
  const x = { i: 0, on: false, rk };
  const alt = (q, t) => 2.8 * q.r0 * Math.pow(Math.max(0, t) / 9, 1.5);
  const k = {
    name: 'exodus', cost: 0, cool: T.cool, cool0: 25, items: [x], friendly: true, window: (r, dc) => r >= 150e3 && r < 1200e3 && dc <= 3,
    live: () => false, age: (q) => q.t,
    spawn(opt = {}) {
      if (x.on) return false;
      const r = hole.r, v = lf()?.lv[1]; if (!v) return false; const h = W.hdir; let best = -1, bs = -1e9;
      for (let u = 0; u < v.n; u++) {
        if (!(v.left[u] > 0.4 * v.area0[u]) || v.torn[u] || v.area0[u] < 1) continue;
        const d = Math.acos(Math.min(1, v.c[u * 3] * h.x + v.c[u * 3 + 1] * h.y + v.c[u * 3 + 2] * h.z)) * R / r; if (d < 3 || d > (opt.far ?? 9)) continue;
        const nl = v.nsum[u] / v.area0[u], sc = nl * 100 - d * 4 + Math.random() * 6; if (sc > bs) { bs = sc; best = u; }
      }
      if (best < 0) return false;
      Object.assign(x, { on: true, t: 0, r0: r, n: 2 + Math.floor(Math.random() * 2), launched: 0, u: best, name: lf().name(1, best), mil: Math.round(rnd(12, 70)) });
      x.c = new THREE.Vector3(v.c[best * 3], v.c[best * 3 + 1], v.c[best * 3 + 2]);
      th.stats.rockets += x.n; th.news(`Exodus begins: ${x.mil} M flee to orbit from ${x.name}`); th.sfx.rocket?.();
      return true;
    },
    step(q, dt) {
      const r = q.r0, hr = hole.r, cd = th.game.camDist || R * 0.05; q.t += dt;
      if (q.launched < q.n && q.t >= q.launched * 0.7) { const m = rk[q.launched++]; const an = rnd(0, 6.283), d = rnd(0.2, 1.4) * r; tangentAt(q.c, an, a); m.dir.copy(q.c).multiplyScalar(Math.cos(d / R)).addScaledVector(a, Math.sin(d / R)).normalize(); Object.assign(m, { on: true, t: 0, r0: r, eaten: false, sink: 0, vis: true }); m.mod.visible = true; th.surf(m.dir, 0, m.pos, Math.max(0, W.P.elevation(m.dir, 3))); th.glow.spawn(m.pos, null, 1.2 * r, 2.4 * r, 0.8, FLAME, 1.4, 0); for (let i = 0; i < 6; i++) th.smoke.spawn(m.pos, vel3(m.dir, rnd(-1, 1) * 0.4 * r, rnd(-1, 1) * 0.4 * r, 0.1 * r, f), 0.5 * r, 1.4 * r, 3, SMOKE1, 0.45, 0.6); }
      let live = 0;
      for (const m of rk) if (m.on) { live++; this.rocket(q, m, dt); }
      if (q.launched >= q.n && !live) k.finish(q);
    },
    rocket(q, m, dt) {
      const r = m.r0; m.t += dt;
      if (m.eaten) { m.sink += dt / 0.8; const u = Math.min(1, m.sink), w = u * u; b.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); m.mod.position.lerpVectors(m.p0, b, w); m.mod.scale.multiplyScalar(1 - 0.06 * u); m.mod.rotateX(dt * 8); m.trail.hide(); if (u >= 1) { m.on = false; m.mod.visible = false; } return; }
      const al = alt(m, m.t), eph = Math.max(0, W.P.elevation(m.dir, 3));
      th.surf(m.dir, al, m.pos, eph); a.copy(m.pos).normalize();
      const al2 = alt(m, m.t + 0.2); th.surf(m.dir, al2, c, eph); c.sub(m.pos); if (c.lengthSq() < 1e-6) c.copy(tangentAt(m.dir, 0, f)); c.normalize();
      aim(m.mod, c, a, 'x'); m.mod.position.copy(m.pos); m.mod.scale.setScalar(0.45 * r / 118); m.mod.visible = true; m.p0 ??= new THREE.Vector3(); m.p0.copy(m.pos);
      // the contrail: where it has been
      let n = 0; for (let i = 0; i < 18; i++) { const tt = m.t - i * 0.32; if (tt < 0) break; th.surf(m.dir, alt(m, tt), e, eph); const fade = 1 - i / 18; m.trail.set(n++, e, 0.05 * r * (0.4 + 0.8 * fade), 0.9, 0.95, 1.0, 0.5 * fade); }
      m.trail.done(n, th.camP);
      if ((m.puff = (m.puff ?? 0) - dt) <= 0) { m.puff = 0.06; th.glow.spawn(m.pos, null, 0.4 * r, 0.5 * r, 0.1, FLAME, 1.5, 0); }
      if (!m.eaten && al < 1.2 * r && W.distTo(m.dir) < 0.8 * hole.r) { m.eaten = true; m.sink = 0.001; th.stats.rocketGulps++; th.gain(T.eat, 'rocketGulp'); state.belly = Math.min(1, state.belly + 0.04); th.glow.spawn(m.pos, null, 0.5 * hole.r, 1.6 * hole.r, 0.4, C(0xdff6ff, 3), 1.4, 0); th.sfx.tink?.(); th.trauma(0.05); th.notice(1); }
      if (m.t > 11) { m.on = false; m.mod.visible = false; m.trail.hide(); }
    },
    finish(q) { q.on = false; for (const m of rk) { m.on = false; m.mod.visible = false; m.trail.hide(); } },
    danger(q, out) { for (const m of rk) if (m.on && !m.eaten && alt(m, m.t) < 1.2 * m.r0) { th.offsetOf(m.dir, o); out.push({ kind: 'target', id: `x${m.i}`, x: o.x, z: o.z, R: 0.8 * hole.r, eta: Math.max(0, 1.2 - alt(m, m.t) / m.r0) * 3, what: 'rocket', reach: 6 }); } },
  };
  for (const m of rk) m.mod.visible = false;
  return k;
}

export function makeStation(th) {
  const { W, hole, state } = th;
  const x = { i: 0, on: false, mod: th.model('space_station'), a: new THREE.Vector3(), b: new THREE.Vector3(), n: new THREE.Vector3(), pos: new THREE.Vector3(), mk: null };
  const at = (q, t, out) => out.copy(q.a).multiplyScalar(Math.cos(t)).addScaledVector(q.b, Math.sin(t)).setLength(R + q.alt);
  const k = {
    name: 'station', cost: 0, cool: [90, 130], cool0: 40, items: [x], friendly: true, window: (r, dc) => r >= 450e3 && r < 2000e3, can: () => true, live: () => false, age: (q) => q.t,
    spawn() {
      if (x.on) return false;
      const r = hole.r, side = Math.random() < 0.5 ? -1 : 1, ox = side * rnd(1.5, 2.5) * r, br = rnd(-0.9, 0.9), om = 0.034;
      W.dirAt(ox, 0, x.a); W.dirAt(ox + Math.sin(br) * 2e4, -Math.cos(br) * 2e4, a); a.addScaledVector(x.a, -a.dot(x.a)).normalize(); x.b.copy(a).negate(); x.n.crossVectors(x.a, x.b).normalize();
      Object.assign(x, { on: true, t: 0, r0: r, om, th0: -om * 12, alt: Math.max(0.6 * r, 160e3), eaten: false, sink: 0 });
      x.mk = th.map?.addMarker({ kind: 'sat', dir: x.a, track: x.n, label: 'STATION', color: '#9fe8ff' });
      th.news('A space station swings over the sky'); return true;
    },
    step(q, dt) {
      const r = q.r0; q.t += dt; const t = q.th0 + q.om * q.t;
      if (q.eaten) { q.sink += dt / 0.9; const u = Math.min(1, q.sink), w = u * u; a.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); q.mod.position.lerpVectors(q.p0, a, w); q.mod.scale.multiplyScalar(1 - 0.05 * u); q.mod.rotateY(dt * 6); if (u >= 1) k.finish(q); return; }
      at(q, t, q.pos); b.copy(q.pos).normalize();
      f.copy(q.a).multiplyScalar(-Math.sin(t)).addScaledVector(q.b, Math.cos(t)).normalize(); aim(q.mod, f, b, 'x'); q.mod.position.copy(q.pos); q.mod.scale.setScalar(1.3 * r / 110); q.mod.visible = true; q.p0 ??= new THREE.Vector3(); q.p0.copy(q.pos);
      if (q.mk) q.mk.dir = b;
      const gd = W.distTo(b);
      if (gd < 0.8 * hole.r) { q.eaten = true; q.sink = 0.001; th.stats.rocketGulps++; th.gain(0.01, 'stationGulp'); state.belly = Math.min(1, state.belly + 0.1); th.glow.spawn(q.pos, null, 0.6 * hole.r, 2 * hole.r, 0.5, C(0xdff6ff, 3), 1.6, 0); th.sfx.tink?.(); th.sfx.choir?.(0.3); th.beat(0.08); th.trauma(0.15); th.notice(3); th.ctx.card('SPACE STATION SWALLOWED', '+1%'); th.news('The void swallows a space station'); q.mk?.remove(); q.mk = null; return; }
      if (q.t > 24) k.finish(q);
    },
    finish(q) { q.on = false; q.mod.visible = false; q.mk?.remove(); q.mk = null; },
    danger(q, out) {
      if (q.eaten) return; const t = q.th0 + q.om * q.t, hr = hole.r;
      at(q, t, a); b.copy(a).normalize(); th.offsetOf(b, o); const x0 = o.x, z0 = o.z; at(q, t + q.om, a); b.copy(a).normalize(); th.offsetOf(b, o);
      out.push({ kind: 'sat', id: `st${q.i}`, x: x0, z: z0, vx: o.x - x0, vz: o.z - z0, R: 0.8 * hr, eta: 24 - q.t, locked: false });
    },
  };
  x.mod.visible = false;
  return k;
}
