// The Moon (docs/PHASE3.md 12.13, T4, once, from 90% of the land once the cracker is settled): the sky's impostor becomes a real body. It is pulled out of its orbit and falls over the horizon
// (16 s, its cracks heating up), breaks up at the Roche limit (a 6 s cinematic beat: hit-stop, slow-mo, a white flash, a ring of debris), and then rains fragments for ~40 s: nine
// rocks of 0.3-0.65 r, each telegraphed like a nuke (a tracking ring that locks, an inner swallow circle): dive into the circle and the fragment is EDIBLE (+3.5%, Frenzy), stay
// in the ring and it hits (a hard hit), leave it and it makes a crater. Swallow them all: "THE MOON FALLS INTO THE VOID" (+5%, slow-mo), and the moonlight goes out.
// While it lasts the director holds its fire (eventsHold). The bot sees the fragments as nukes (dangers of kind 'nuke').
import * as THREE from 'three/webgpu';
import { R } from '../planetgen.js';
import { P3, T3 } from '../phase3.js';
import { C, FIRE, SMOKE0, SMOKE1, ASH, DUST, rnd, smooth, tangentAt, vel3, slerp, Ribbon, sv, v1, v2, v3, v4 } from './kit.js';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d0 = new THREE.Vector3(), o = {}, q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), eul = new THREE.Euler();
const MOONR = 1737400, ROCHE = 2.5; // the Moon's radius (m) and the break-up distance from the planet's centre (planet radii)
const GLARE = C(0xfff4e0, 3), HOT = C(0xff8a40, 2.4), PALE = C(0xd8d4cc, 1.1);

/** A lumpy rock: an icosphere pushed about by a few octaves of sine noise (three variants). */
function rock(seed, detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 2.3 + seed) * Math.sin(y * 2.1 + seed * 1.7) * 0.22 + Math.sin(z * 2.9 + seed * 0.6 + x) * 0.1 + Math.sin(x * 6.3 + y * 5.1 + seed) * Math.sin(z * 5.7 + seed) * 0.07;
    const s = 1 + n; p.setXYZ(i, x * s, y * s, z * s);
  }
  g.computeVertexNormals(); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
  return g;
}

export function makeMoon(th) {
  const T = T3.kinds.moon, { W, hole, state } = th, g = W.globe, NF = T.n, NR = 90;
  const geos = [rock(1.3, 4), rock(4.1, 4), rock(7.7, 4)], mat = g.moon.material, ringGeo = rock(2.2, 1); // (the fragments share the Moon's own material: one look, one heat)
  const x = {
    i: 0, on: false, done: false, phase: 'idle', t: 0, tb: 0, N: NF, swallowed: 0, resolved: 0, mk: null,
    frag: Array.from({ length: NF }, (_, i) => { const mesh = new THREE.Mesh(geos[i % 3], mat); mesh.visible = false; mesh.frustumCulled = false; th.root.add(mesh); return { i, mesh, trail: new Ribbon(26, th.root), zone: -1, mk: null, st: 'idle', p: new THREE.Vector3(), v: new THREE.Vector3(), to: new THREE.Vector3(), from: new THREE.Vector3(), spin: new THREE.Vector3(), rot: 0, age: 0 }; }),
    ring: new THREE.InstancedMesh(ringGeo, mat, NR), p0: new THREE.Vector3(), axis: new THREE.Vector3(), dir0: new THREE.Vector3(), dirR: new THREE.Vector3(), pb: new THREE.Vector3(), pos: new THREE.Vector3(),
  };
  x.ring.frustumCulled = false; x.ring.visible = false; th.root.add(x.ring);
  x.rp = Array.from({ length: NR }, () => ({ a: 0, r: 0, y: 0, s: 1, w: 0, spin: 0, rot: 0 }));
  const heat = mat.userData.uHeat, moon = g.moon;

  /** Put the Moon (a body in planet space, metres) at the point of the fall at u 0..1: the direction glides from where the impostor hung to over the horizon, the distance falls to the Roche limit. */
  const place = (u) => {
    const e = u * u * (3 - 2 * u), ed = Math.pow(u, 1.5);
    slerp(x.dir0, x.dirR, e, a).normalize();
    const dist = x.d0 + (ROCHE * R - x.d0) * ed, k = smooth(0, 1, u);
    moon.position.copy(a).multiplyScalar(dist); x.pos.copy(moon.position);
    moon.scale.setScalar(x.S0 + (MOONR - x.S0) * k); moon.rotation.y += 0.002;
  };
  const k = {
    name: 'moon', cost: 0, cool: [999, 999], cool0: 5, items: [x], set: true, zones: 1,
    window: (r) => !x.done && P3.tier(r) >= 4 && W.bite.landEaten >= T.land && (th.byName.cracker.items[0].done || W.bite.landEaten >= T.land + 0.04) && !th.byName.cracker.items[0].on, can: () => th.zonesFree() >= 2, live: () => true, age: (q2) => q2.t - T.fall,
    spawn() {
      if (x.on || x.done) return false;
      const r = hole.r;
      // take over from the sky's impostor: where it hangs now (planet space) and how big it is
      g.moonSky = false; x.p0.copy(moon.position); x.S0 = moon.scale.x; x.d0 = x.p0.length(); x.dir0.copy(x.p0).normalize();
      W.dirAt(0.05 * R * 0, -0.62 * R, x.dirR); x.dirR.normalize(); // (over the far horizon, ahead of the hole)
      Object.assign(x, { on: true, phase: 'fall', t: 0, tb: 0, swallowed: 0, resolved: 0, r0: r });
      x.axis.crossVectors(x.dirR, W.hdir).normalize(); if (x.axis.lengthSq() < 0.5) x.axis.set(0, 1, 0);
      th.eventsHold = true; heat.value = 0; moon.visible = true;
      th.ctx.card('THE MOON IS FALLING', 'pulled from its orbit — it will break up'); th.news('The Moon has left its orbit and is falling toward the void');
      th.sfx.lidWarn?.(); th.notice(0); th.stats.moon = (th.stats.moon || 0) + 1;
      x.mk = th.map?.addMarker({ kind: 'site', dir: x.dirR, label: 'THE MOON', color: '#d8d4cc', pulse: true });
      return true;
    },
    step(qq, dt) {
      qq.t += dt;
      if (qq.phase === 'fall') {
        const u = Math.min(1, qq.t / T.fall); place(u); heat.value = smooth(0.55, 1, u);
        if (qq.t > 2) th.trauma(0.02 + 0.06 * u);
        if (u >= 1) this.breakUp(qq);
        return;
      }
      if (qq.phase === 'break' || qq.phase === 'rain') {
        qq.tb += dt;
        this.ringStep(qq, dt);
        if (qq.phase === 'break' && qq.tb > T.brk) { qq.phase = 'rain'; th.ctx.hint?.('MOON FRAGMENTS — dive into the inner circle to swallow one'); }
        let left = 0;
        for (const f of qq.frag) { if (f.st !== 'gone') { left++; this.fragStep(qq, f, dt); } }
        heat.value = Math.max(0, heat.value - dt * 0.28);
        if (qq.phase === 'rain' && !left) this.end(qq);
      }
    },
    /** The Roche limit: the Moon's cracks go white, it bursts into rocks and a ring of debris. */
    breakUp(qq) {
      qq.phase = 'break'; qq.tb = 0; heat.value = 1; th.game.finaleCompile?.(); // (under the flash and the hit-stop: the finale's shaders build here)
      b.copy(moon.position); qq.pb.copy(b);
      moon.scale.setScalar(1e-3); // (hidden: globe.update would show the mesh again)
      for (const f of qq.frag) {
        f.st = 'float'; f.age = 0; f.tL = 4 + f.i * 3.35 + rnd(-0.3, 0.3); f.Tf = 8.5 + rnd(0, 3); f.rho = rnd(0.3, 0.65) * Math.max(hole.r, 600e3);
        a.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); f.p.copy(b).addScaledVector(a, rnd(0.2, 0.95) * MOONR); f.v.copy(a).multiplyScalar(rnd(0.02, 0.07) * R).add(c.copy(b).normalize().multiplyScalar(-0.02 * R));
        f.spin.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); f.rot = rnd(0, 6); f.mesh.scale.setScalar(f.rho); f.mesh.position.copy(f.p); f.mesh.visible = true; f.locked = false; f.eaten = false; f.zone = -1;
      }
      // the debris ring: lumps on slightly different orbits through the break point, drifting round the planet in the plane that holds it
      x.u0 = b.clone().normalize(); x.axis.addScaledVector(x.u0, -x.axis.dot(x.u0)).normalize(); x.orb = new THREE.Vector3().crossVectors(x.axis, x.u0).normalize();
      for (const p of x.rp) { p.a = rnd(-0.12, 0.12); p.r = ROCHE * R * rnd(0.93, 1.07); p.y = rnd(-0.1, 0.1) * R; p.s = rnd(0.04, 0.14) * MOONR; p.w = 0.1 + rnd(-0.02, 0.02) - p.y / R * 0.05; p.spin = rnd(-1, 1); p.rot = rnd(0, 6); }
      x.ring.visible = true;
      // the burst: the flash, a ring of dust the size of the Moon, hit-stop, slow-mo
      th.glow.spawn(b, null, 2.5 * MOONR, 6 * MOONR, 0.5, GLARE, 3.2, 0); th.glow.spawn(b, null, 1.4 * MOONR, 3.4 * MOONR, 1.6, HOT, 2.2, 0.2);
      for (let i = 0; i < 70; i++) { const an = rnd(0, 6.283), up = d0.copy(b).normalize(), tg = tangentAt(up, an, v4), sp = rnd(0.1, 0.45) * MOONR; v1.copy(b).addScaledVector(tg, rnd(0.2, 1) * MOONR); th.smoke.spawn(v1, sv.copy(tg).multiplyScalar(sp * 0.5).addScaledVector(up, rnd(-0.1, 0.1) * sp), 0.5 * MOONR, 1.5 * MOONR, rnd(4, 8), i % 3 ? PALE : SMOKE1, 0.5, 0.2); }
      th.beat(0.3, 0.35, 3); th.trauma(0.9); th.screenFlash(0.6, '#fff4e0', 600); th.fxBlast(0.45); th.sfx.boom?.(1); th.sfx.choir?.(1); th.sfx.swell?.();
      th.ctx.card('THE MOON BREAKS', 'Roche limit — the sky is falling'); th.news('The Moon has broken apart: nine fragments fall on the world'); th.notice(0);
      x.mk?.remove(); x.mk = null;
    },
    ringStep(qq, dt) {
      const fade = 1 - smooth(46, 62, qq.tb), t = qq.tb;
      for (let i = 0; i < NR; i++) {
        const p = x.rp[i], an = p.a + p.w * t;
        a.copy(x.u0).multiplyScalar(Math.cos(an)).addScaledVector(x.orb, Math.sin(an)).multiplyScalar(p.r).addScaledVector(x.axis, p.y);
        eul.set(p.rot + p.spin * t, p.rot * 0.7 + p.spin * 0.5 * t, 0); q.setFromEuler(eul); sc.setScalar(p.s * fade * smooth(0, 2, t)); m4.compose(a, q, sc); qq.ring.setMatrixAt(i, m4);
      }
      qq.ring.instanceMatrix.needsUpdate = true; qq.ring.visible = fade > 0.01;
    },
    fragStep(qq, f, dt) {
      const r = qq.r0, hr = hole.r; f.age += dt; const tf = qq.tb - f.tL;
      eul.set(f.rot + f.spin.x * f.age * 0.3, f.rot * 0.6 + f.spin.y * f.age * 0.3, f.spin.z * f.age * 0.3); f.mesh.quaternion.setFromEuler(eul);
      if (f.st === 'float') { // the rocks drift apart over the break-up point, glowing hot, until their turn
        f.p.addScaledVector(f.v, dt); f.mesh.position.copy(f.p); f.v.multiplyScalar(Math.max(0, 1 - 0.25 * dt));
        if (tf >= 0) { f.st = 'fly'; f.t0 = qq.tb; f.from.copy(f.p).normalize(); f.r0 = f.p.length(); f.zone = th.zoneAlloc(); f.to.copy(W.hdir); f.B = Math.max(1.0 * hr, 1.7 * f.rho); f.inner = 0.5 * hr; f.lock = th.lockFor(0.8, 2.0, 4); f.side = Math.random() < 0.5 ? -1 : 1; f.ox = f.oz = 0; f.ux = 0; f.uz = -1; f.lockAt = -1; f.hs = f.p.length();
          f.mk = th.map?.addMarker({ kind: 'nuke', from: f.from, dir: f.to, dur: f.Tf, eta: f.Tf, r: f.B, label: 'MOON ROCK', color: '#d8d4cc' }); th.sfx.nukeLaunch?.(0.8); }
        return;
      }
      if (f.st === 'fly') {
        const age = qq.tb - f.t0, eta = f.Tf - age, u = Math.min(1, age / f.Tf);
        if (eta > f.lock) { // tracking: the ring rides where the hole will be, offset so standing still is a hit and diving in is a choice
          const sp = Math.hypot(hole.vx, hole.vz); if (sp > 0.05 * P3.speed(hr)) { f.ux = hole.vx / sp; f.uz = hole.vz / sp; }
          const kk = Math.min(1, dt * 5); f.ox += (hole.vx * f.lock - f.uz * f.side * 0.5 * r - f.ox) * kk; f.oz += (hole.vz * f.lock + f.ux * f.side * 0.5 * r - f.oz) * kk; W.dirAt(f.ox, f.oz, f.to);
          f.elev = Math.max(0, W.P.elevation(f.to, 3));
        } else if (!f.locked) { f.locked = true; f.lockAt = th.t; th.stats.locks++; th.sfx.lockBeep?.(); th.ctx.hint?.('LOCKED — dive into the inner circle to swallow the rock, or leave the ring'); }
        th.zoneSet(f.zone, f.to, f.B, f.inner, Math.min(1, age * 1.5) * (f.locked ? 1 : 0.8), f.locked ? Math.min(1, (f.lock - eta) / f.lock) + 0.001 : 0, 0);
        if (f.mk) { f.mk.eta = eta; f.mk.dir = f.to; }
        // the arc: the direction glides from the break point to the target, the radius falls to the ground
        const e = Math.pow(u, 1.25); slerp(f.from, f.to, e, a).normalize();
        const rad = f.r0 + (R + (f.elev ?? 0) * W.E + f.rho * 0.6 - f.r0) * Math.pow(u, 1.5);
        f.p.copy(a).multiplyScalar(rad); f.mesh.position.copy(f.p);
        if (u > 0.5) th.glow.spawn(f.p, null, 1.3 * f.rho, 1.9 * f.rho, 0.12, HOT, 0.7 + 1.4 * u, 0); // (the entry glow)
        // the trail
        let n = 0; const cd = th.game.camDist || R * 0.05;
        for (let i = 0; i < 26; i++) { const uu = u - i * 0.012; if (uu < 0) break; const ee = Math.pow(uu, 1.25); slerp(f.from, f.to, ee, b).normalize(); b.multiplyScalar(f.r0 + (R + (f.elev ?? 0) * W.E + f.rho * 0.6 - f.r0) * Math.pow(uu, 1.5)); const fade = 1 - i / 26; f.trail.set(n++, b, f.rho * (0.12 + 0.55 * fade) * (0.4 + u), 1.0, 0.55 * fade + 0.2, 0.25 * fade + 0.1, 0.65 * fade * Math.min(1, age)); }
        f.trail.done(n, th.camP);
        if (eta <= 0) this.impact(qq, f);
        return;
      }
      if (f.st === 'sink') { // swallowed: pulled into the well and gone
        f.sink += dt / 1.0; const u = Math.min(1, f.sink), w = u * u; b.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); f.mesh.position.lerpVectors(f.p, b, w); f.mesh.scale.setScalar(f.rho * (1 - 0.97 * w));
        if (u >= 1) { f.st = 'gone'; f.mesh.visible = false; qq.resolved++; }
        return;
      }
      if (f.st === 'wreck') { f.sink += dt; if (f.sink > 0.4) { f.st = 'gone'; f.mesh.visible = false; qq.resolved++; } }
    },
    impact(qq, f) {
      const dist = W.distTo(f.to), hr = hole.r, up = v3.copy(f.to).normalize(), elev = Math.max(0, W.P.elevation(f.to, 3));
      f.trail.hide(); th.zoneFree(f.zone); f.zone = -1; f.mk?.remove(); f.mk = null;
      th.surf(f.to, 0, v1, elev); f.p.copy(v1);
      if (dist < f.inner) { // swallowed: the best moment of the finale's lead-in
        qq.swallowed++; th.stats.moonGulps = (th.stats.moonGulps || 0) + 1; f.st = 'sink'; f.sink = 0.001; f.eaten = true;
        th.glow.spawn(v1, null, 4 * hr, 5 * hr, 0.16, C(0xf0e4ff, 3.4), 3.2, 0); th.glow.spawn(v1, null, 1.6 * hr, 3.6 * hr, 0.9, C(0xa070ff, 2.4), 1.8, 0.2);
        th.scar(W.hdir, 5 * hr, 3.4 * hr, 3, 2); hole.shockwave(); W.shock(W.hdir, 0.6 * hr / R, 1.8 * hr / R, 1.1, 1);
        th.sfx.reverseGulp?.(); th.screenFlash(0.6, '#e8dcff', 380); th.beat(0.12, 0.5, 0.5); th.trauma(0.5);
        th.gain(T.gulp, 'moonGulp'); state.belly = Math.min(1, state.belly + 0.2); state.frenzy = Math.max(state.frenzy || 0, 5); th.notice(8);
        th.ctx.card('MOON ROCK SWALLOWED', `${qq.swallowed} of ${qq.N}: Frenzy`); th.news('The void swallowed a piece of the Moon');
        return;
      }
      // a real impact: fireball, dome, scorch, light, dust ring, the crater
      f.st = 'wreck'; f.sink = 0; f.mesh.visible = false;
      const near = Math.max(0.12, 1 - dist / (8 * hr));
      th.glow.spawn(v1, null, 3.5 * hr, 4.5 * hr, 0.12, FIRE[0], 3.2, 0); th.glow.spawn(v1, null, 0.5 * f.B, 2.2 * f.B, 0.9, FIRE[1], 2.0, 0.3); th.glow.spawn(v1, null, 0.3 * f.B, 1.6 * f.B, 1.5, FIRE[2], 1.6, 0.3);
      th.dome(f.to, elev, 0.3 * f.B, 0.9 * hr, 2.2 * f.B, 1);
      for (let i = 0; i < 18; i++) { const an = (i / 18) * 6.283 + rnd(0, 0.4), tg = tangentAt(up, an, v4); b.copy(v1).addScaledVector(tg, 0.25 * f.B); th.smoke.spawn(b, sv.copy(tg).multiplyScalar(0.9 * hr).addScaledVector(up, 0.06 * hr), 0.7 * hr, 1.5 * hr, 5, i % 2 ? ASH : DUST, 0.55, 0.45); }
      th.light(f.to, 7 * hr, 1.3, 7); th.scar(f.to, 2.0 * f.B, 0.9 * hr, 14, 0); th.scar(f.to, 1.2 * f.B, 0.2 * hr, 100, 0);
      th.sfx.nukeBoom?.(Math.min(1, 0.5 + 0.5 * near), Math.min(1.2, dist / (12 * hr))); th.fxBlast(0.3 * near); th.screenFlash(0.06 + 0.2 * near, '#fff4dc', 260); th.trauma(0.25 + 0.4 * near);
      if (dist < f.B) { th.stats.moonHits = (th.stats.moonHits || 0) + 1; th.hurt(T.hit, 'Moon rock!', 'moon', T.k, 0.2, f.locked ? th.t - f.lockAt : -1, f.to); th.news('A piece of the Moon strikes the void'); } else th.news('A piece of the Moon crashes harmlessly');
    },
    end(qq) {
      const all = qq.swallowed === qq.N;
      if (all) { th.gain(T.last, 'moonAll'); state.frenzy = Math.max(state.frenzy || 0, 8); th.beat(0.2, 0.3, 2); th.screenFlash(0.7, '#e8dcff', 700); th.sfx.fizzle?.(); th.ctx.card('THE MOON FALLS INTO THE VOID', 'the moonlight goes out'); th.news('The Moon is gone: the void swallowed every piece'); th.stats.moonAll = (th.stats.moonAll || 0) + 1; }
      else { th.ctx.card('THE MOON IS GONE', `${qq.swallowed} of ${qq.N} pieces swallowed`); th.news('The Moon is gone: only its dust remains'); }
      k.finish(qq); qq.done = true; th.game.moonGone = true;
    },
    finish(qq) {
      qq.on = false; qq.phase = 'idle'; moon.scale.setScalar(1e-3); heat.value = 0;
      for (const f of qq.frag) { f.st = 'gone'; f.mesh.visible = false; f.trail.hide(); if (f.zone >= 0) th.zoneFree(f.zone); f.zone = -1; f.mk?.remove(); f.mk = null; }
      qq.ring.visible = false; qq.mk?.remove(); qq.mk = null; th.eventsHold = false;
    },
    clear() { x.done = false; x.on = false; g.moonSky = true; th.game.moonGone = false; heat.value = 0; },
    danger(qq, out) {
      for (const f of qq.frag) if (f.st === 'fly') { th.offsetOf(f.to, o); out.push({ kind: 'nuke', id: `mo${f.i}`, x: o.x, z: o.z, R: f.B, inner: f.inner, eta: f.Tf - (qq.tb - f.t0), locked: f.locked, lock: f.lock }); }
    },
    line(qq, pick) {
      if (qq.phase === 'fall') pick(5, `THE MOON IS FALLING · breaks up in <b>${Math.max(0, T.fall - qq.t).toFixed(0)} s</b>`, 'lock');
      else { let eta = 99; for (const f of qq.frag) if (f.st === 'fly') eta = Math.min(eta, f.Tf - (qq.tb - f.t0)); pick(eta < 99 ? eta : 30, `MOON FRAGMENTS · swallowed <b>${qq.swallowed}/${qq.N}</b>${eta < 99 ? ` · next impact <b>${Math.max(0, eta).toFixed(1)} s</b>` : ''}`, eta < 4 ? 'lock' : 'good'); }
    },
  };
  return k;
}
