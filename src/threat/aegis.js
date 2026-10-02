// The Aegis (docs/PHASE3-REVIEW.md B6): the T3 boss, once at r >= 800 km. Six platforms (aegis_platform, modelled small: sized from r) descend over 8 s into a hexagon of
// radius 2.6 r around where the hole stood, joined by a red net. A lid ring forms at 3.6 r; at 6 s it locks and closes to 0.6 r, and it closes slower for every platform that is
// gone (full speed 34 s: each swallowed platform stalls it by a sixth). A hole inside the ring at the close: 12% and an eject kick. Swallow a platform (within 0.9 r of its
// subpoint, once it is below 2 r): +0.8%; all six: AEGIS BROKEN, +8%, a free perk draft, slow-mo. Not broken: it lifts away and comes back after 90 s, up to 3 times.
import * as THREE from 'three/webgpu';
import { R } from '../planetgen.js';
import { P3, T3 } from '../phase3.js';
import { C, FIRE, rnd, smooth, aim, tangentAt, Ribbon } from './kit.js';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3(), f = new THREE.Vector3(), o = {};
const NET = C(0xff5a3c, 2), BLUE = C(0xcfe8ff, 2.4);

export function makeAegis(th) {
  const T = T3.kinds.aegis, { W, hole, state } = th, HEX = 2.6, CLOSE = 34;
  const net = new Ribbon(8, th.root), x = { i: 0, on: false, c: new THREE.Vector3(), zone: -1, mk: null, mk2: null, tries: 0, done: false, pl: [] };
  for (let i = 0; i < 6; i++) x.pl.push({ i, mod: th.model('aegis_platform'), dir: new THREE.Vector3(), alive: false, sink: 0, p0: new THREE.Vector3() });
  const k = {
    name: 'aegis', cost: 0, cool: [T.retry, T.retry], cool0: 5, items: [x], set: true, zones: 1,
    window: (r) => !x.done && x.tries < T.tries && r >= T.r && r < 1500e3, can: () => th.zonesFree() >= 2, live: () => true, age: (q) => q.t - 6,
    spawn(opt = {}) {
      if (x.on || th.zonesFree() < 2) return false;
      const r = hole.r; x.tries++; x.c.copy(W.hdir); const a0 = rnd(0, 6.283);
      Object.assign(x, { on: true, phase: 'descend', t: 0, r0: r, p: 0, ringR: 3.6 * r, hit: false, lockAt: -1, alive: 6, broke: false, fx: 0 });
      x.pl.forEach((q, i) => { tangentAt(x.c, a0 + i * 1.0472, a); q.dir.copy(x.c).multiplyScalar(Math.cos(HEX * r / R)).addScaledVector(a, Math.sin(HEX * r / R)).normalize(); q.alive = true; q.sink = 0; q.mod.visible = true; });
      x.zone = th.zoneAlloc();
      x.mk = th.map?.addMarker({ kind: 'aegis', dir: x.c, r: HEX * r, label: 'AEGIS', color: '#ff5a3c', pulse: true });
      x.mk2 = th.map?.addMarker({ kind: 'ring', dir: x.c, r: x.ringR, color: '#ff8a5a' });
      th.stats.aegis++; th.sfx.aegisDescend?.(); th.sfx.klaxon(1); th.trauma(0.3); th.screenFlash(0.2, '#ff6a4a', 500);
      th.ctx.card('THE AEGIS', 'six platforms are sealing the sky: swallow them to break the lid'); th.news('The Aegis: six orbital platforms descend to seal the world over you');
      return true;
    },
    step(q, dt) {
      const r = q.r0, hr = hole.r; q.t += dt;
      const tt = q.t, e8 = smooth(0, 8, tt);
      if (q.phase === 'descend' || q.phase === 'closing') {
        let al = 0; for (const p of q.pl) if (p.alive) al++; q.alive = al;
        // the lid ring: forms at 3.4 r, locks at 6 s, closes at (alive / 6) of full speed
        if (tt >= 6) { q.p = Math.min(1, q.p + dt * (al / 6) / CLOSE); q.phase = 'closing'; if (q.lockAt < 0) { q.lockAt = th.t; th.stats.locks++; th.sfx.lockBeep?.(); th.ctx.hint('THE LID IS CLOSING — swallow the platforms, or get out of the ring'); } }
        q.ringR = (3.6 - 3.0 * q.p) * r;
        th.zoneSet(q.zone, q.c, q.ringR, 0, Math.min(1, tt) * 0.9, tt >= 6 ? 0.999 : 0, 0);
        if (q.mk2) { q.mk2.r = q.ringR; q.mk2.eta = tt < 6 ? 6 - tt : CLOSE * (1 - q.p) / Math.max(0.1, al / 6); }
        // the platforms: down from 5 r to 0.45 r, joined by the net; swallow when low and close
        let n = 0, first = null;
        for (const p of q.pl) {
          if (p.alive) {
            const alt = (5 - 4.55 * e8) * r; th.surf(p.dir, alt, p.mod.position, Math.max(0, W.P.elevation(p.dir, 3)));
            e.copy(q.c).addScaledVector(p.dir, -q.c.dot(p.dir)); if (e.lengthSq() < 1e-10) e.copy(tangentAt(p.dir, 0, f)); e.normalize();
            aim(p.mod, e, p.dir, 'x'); p.mod.scale.setScalar(1.15 * r / 68); p.mod.visible = true; p.p0.copy(p.mod.position);
            first ??= p.mod.position; net.set(n++, p.mod.position, 0.035 * r, 1.0, 0.3, 0.2, 0.55 + 0.35 * Math.sin(tt * 7 + p.i));
            th.glow.spawn(p.mod.position, null, 0.5 * r, 0.7 * r, 0.07, tt < 8 ? FIRE[2] : NET, 0.9, 0);
            if (tt > 4.5 && alt < 2.2 * r && W.distTo(p.dir) < 0.95 * hr) this.eat(q, p);
          } else if (p.sink > 0 && p.sink < 1) {
            p.sink += dt / 0.9; const u = Math.min(1, p.sink), w = u * u; b.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); p.mod.position.lerpVectors(p.p0, b, w); p.mod.scale.multiplyScalar(1 - 0.06 * u); p.mod.rotateY(dt * 6);
            if (p.sink >= 1) { p.mod.visible = false; p.sink = 2; }
          }
        }
        if (n >= 2) { net.set(n, first, 0.035 * r, 1.0, 0.3, 0.2, 0.55); net.done(n + 1, th.camP); } else net.hide();
        if (q.broke) return;
        if (q.p >= 1 && al > 0) this.close(q);
      } else if (q.phase === 'lift') { // the platforms leave (or the broken lid dissolves)
        q.fx += dt; const u = smooth(0, 2.5, q.fx);
        for (const p of q.pl) if (p.alive) { th.surf(p.dir, (0.45 + 7 * u) * r, p.mod.position, Math.max(0, W.P.elevation(p.dir, 3))); }
        if (q.fx > 2.5) { k.finish(q); }
      } else if (q.phase === 'broken') {
        q.fx += dt; if (q.fx > 1.6) k.finish(q);
      }
    },
    close(q) {
      const r = q.r0, dist = W.distTo(q.c); q.phase = 'lift'; q.fx = 0;
      th.zoneFree(q.zone); q.zone = -1; q.mk2?.remove(); q.mk2 = null; net.hide();
      th.surf(q.c, 0.4 * r, a, Math.max(0, W.P.elevation(q.c, 3))); th.glow.spawn(a, null, 4 * r, 5 * r, 0.16, FIRE[0], 3, 0); th.glow.spawn(a, null, 0.8 * r, 3.0 * r, 0.9, FIRE[2], 2, 0.3);
      th.scar(q.c, 3 * r, 3 * r, 12, 0); th.sfx.nukeBoom(0.9, 0); th.trauma(0.5); th.screenFlash(0.55, '#ffd0b0', 400);
      if (dist < 0.62 * r + 0.0 * hole.r) { // inside the closed lid: the hit and the eject
        q.hit = true; th.stats.aegisHits++; th.offsetOf(q.c, o); const l = Math.hypot(o.x, o.z) || 1, kick = state.kick || (state.kick = { x: 0, z: 0 }); kick.x = -o.x / l * 520; kick.z = -o.z / l * 520;
        th.hurt(T.hit, 'The lid closes!', 'aegis', 40, 0.25, q.lockAt >= 0 ? th.t - q.lockAt : -1); th.notice(10);
        th.news('The Aegis closes on the void and throws it out');
      } else { th.news('The Aegis closes on empty ground: the lid lifts'); th.ctx.hint('The lid closed — it will be back in 90 s'); }
    },
    eat(q, p) {
      p.alive = false; p.sink = 0.001; q.alive--; th.gain(0.008, 'aegisGulp'); state.belly = Math.min(1, state.belly + 0.1);
      th.glow.spawn(p.mod.position, null, 0.8 * hole.r, 2.6 * hole.r, 0.6, BLUE, 1.6, 0); th.glow.spawn(p.mod.position, null, 2.6 * hole.r, 3 * hole.r, 0.12, FIRE[0], 2.4, 0);
      th.sfx.aegisEat?.(); th.beat(0.08); th.trauma(0.25); th.notice(3);
      let al = 0; for (const z of q.pl) if (z.alive) al++;
      if (al > 0) th.ctx.hint(`Platform swallowed — ${al} left, the lid slows`);
      else this.broken(q);
    },
    broken(q) {
      q.broke = true; q.done = x.done = true; q.phase = 'broken'; q.fx = 0; th.stats.aegisBroke++; th.gain(T.gulp, 'aegisBroken'); state.frenzy = 8; state.belly = 1;
      th.zoneFree(q.zone); q.zone = -1; q.mk2?.remove(); q.mk2 = null; q.mk?.remove(); q.mk = null; net.hide();
      for (let i = 0; i < 28; i++) { const an = (i / 28) * 6.283; tangentAt(q.c, an, c); a.copy(q.c).multiplyScalar(Math.cos(q.ringR / R)).addScaledVector(c, Math.sin(q.ringR / R)).normalize(); th.surf(a, 0.5 * q.r0, b, Math.max(0, W.P.elevation(a, 3))); th.glow.spawn(b, null, 0.5 * q.r0, 0.1 * q.r0, 1.4, NET, 1.4, 1.5); }
      th.sfx.aegisBreak?.(); th.beat(0.2, 0.4, 1.0); th.trauma(0.6); th.screenFlash(0.7, '#e8dcff', 600); th.notice(15);
      th.ctx.card('AEGIS BROKEN', `+${Math.round(T.gulp * 100)}% — a free perk`); th.news('The Aegis is broken: its platforms are gone, the sky is open'); state.draftsDue = (state.draftsDue || 0) + 1; th.ctx.draft?.();
    },
    finish(q) { q.on = false; q.phase = 'gone'; for (const p of q.pl) { p.mod.visible = false; p.alive = false; p.sink = 0; } net.hide(); if (q.zone >= 0) th.zoneFree(q.zone); q.zone = -1; q.mk?.remove(); q.mk = null; q.mk2?.remove(); q.mk2 = null; },
    clear() { x.tries = 0; x.done = false; },
    danger(q, out) {
      if (q.phase !== 'descend' && q.phase !== 'closing') return;
      th.offsetOf(q.c, o); out.push({ kind: 'lid', id: `a${q.i}`, x: o.x, z: o.z, R: q.ringR, alive: q.alive, p: q.p, eta: CLOSE * (1 - q.p) });
      if (q.t > 4.5) for (const p of q.pl) if (p.alive) { th.offsetOf(p.dir, o); out.push({ kind: 'target', id: `ap${p.i}`, x: o.x, z: o.z, R: 0.95 * hole.r, eta: CLOSE * (1 - q.p), what: 'aegis', reach: 7 }); }
    },
    line(q, pick) {
      if (q.phase === 'descend') pick(6 - q.t, `THE AEGIS · descending · <b>${q.alive}</b> platforms · lid locks in <b>${Math.max(0, 6 - q.t).toFixed(1)} s</b>`, 'lock');
      else if (q.phase === 'closing') pick(0.2, `THE AEGIS · lid closing · swallow the platforms (<b>${6 - q.alive}/6</b>) · <b>${(CLOSE * (1 - q.p) / Math.max(0.1, q.alive / 6)).toFixed(0)} s</b>`, 'lock');
    },
  };
  for (const p of x.pl) p.mod.visible = false;
  return k;
}
