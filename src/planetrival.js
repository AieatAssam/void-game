// Phase 3 rival holes on the sphere (docs/PHASE3-REVIEW.md B1): "the Maw" (1.3x the player, from T3) and "the World-Eater" (1.4x, from T4).
// A rival is a point on the planet (a unit direction + a heading tangent) that drives along great circles at 0.74 x the speed a hole of its size would have (so a player
// can always outrun it in a straight line), chews land through bite.chew (no tear flags, its own texel budget), grows from what it eats (x0.55: the player out-grows it),
// starves when it eats nothing, chases a smaller player, flees a bigger one and can be eaten (+60% of its area). Drawn as a spherical cap (globe uHoles 1..3, red rim while it
// is bigger than you), a minimap marker, a floating name label and a danger ring at its contact radius. The "something larger" of T3-T4.
import * as THREE from 'three/webgpu';
import { R } from './planetgen.js';
import { P3, T3 } from './phase3.js';
import { rnd } from './threat/kit.js';

const NAMES = { maw: 'THE MAW', eater: 'THE WORLD-EATER' };
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tg = new THREE.Vector3(), pv = new THREE.Vector3();
/** A tangent at unit vector `d` toward point (px, py, pz), into `out`; null when the point is straight above / below. */
const tangentToward = (d, px, py, pz, out) => { out.set(px, py, pz).addScaledVector(d, -(px * d.x + py * d.y + pz * d.z)); return out.lengthSq() < 1e-10 ? null : out.normalize(); };
const angle = (p, q) => Math.acos(Math.min(1, Math.max(-1, p.x * q.x + p.y * q.y + p.z * q.z)));
const CSS = `.rvl{position:fixed;left:0;top:0;z-index:4;pointer-events:none;font:800 12px system-ui,sans-serif;letter-spacing:.08em;color:#ffe6e0;background:#5a0a14d9;padding:3px 11px;border-radius:999px;box-shadow:0 0 0 1.5px #ff5a47aa,0 0 16px #ff2a1a66;white-space:nowrap}.rvl.small{background:#2a1260d9;color:#e8dcff;box-shadow:0 0 0 1.5px #c9a8ffaa,0 0 16px #8a5cff66}.rvl[hidden]{display:none}`;

export class Rivals {
  constructor(th) {
    this.th = th; this.uid = 0; this.list = []; this.slots = [false, false, false]; this.did = { maw: false, eater: false }; this.t3 = null; this.t4 = null; this.dT = 0;
    if (!document.getElementById('rival-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'rival-css', textContent: CSS }));
    this.labels = [0, 1, 2].map(() => document.body.appendChild(Object.assign(document.createElement('div'), { className: 'rvl', hidden: true })));
  }

  /** The table entry (the pill, the bot's dangers); the stepping is update() below. */
  kind() {
    const me = this, th = this.th;
    return { name: 'rival', cost: 0, cool: [1e9, 1e9], cool0: 1e9, passive: true, items: this.list, window: () => false, clear: () => me.clear(), spawn: (o) => !!me.spawn(o.kind || 'maw', o), step() {}, finish: (x) => me.kill(x), age: () => 0,
      danger: (x, out) => { const o = th._o ??= {}; th.offsetOf(x.dir, o); out.push({ kind: 'rival', id: `r${x.id}`, x: o.x, z: o.z, R: x.r, big: x.r > th.hole.r * 1.04, eta: 99, locked: true, name: x.name, vx: 0, vz: 0, dist: x.dp, cd: x.cd }); },
      line: (x, pick) => {
        const big = x.r > th.hole.r * 1.04, rP = th.hole.r;
        if (big && x.dp < 7 * x.r + 6 * rP) pick(Math.max(0, (x.dp - x.r) / Math.max(1, P3.speed(rP) * 1.6)), `${x.name} · <b>${(x.r / rP).toFixed(1)}×</b> you · ${x.mood === 'chase' ? 'CLOSING' : 'wandering'} · <b>${(x.dp / rP).toFixed(0)} r</b> away`, x.mood === 'chase' && x.dp < 3 * x.r ? 'lock' : '');
        else if (!big && x.dp < 9 * rP) pick(9, `${x.name} · <b>${(x.r / rP).toFixed(2)}×</b> · fleeing — eat it for +${Math.round(T3.kinds.rival.eat * 100)}% of its area`, 'good');
      } };
  }

  /** Put a rival on the far side (95-135 degrees from the hole, on a standing parcel); o.near = place it that many hole radii ahead (debug / screenshots). */
  spawn(kind, o = {}) {
    const { th } = this, { W, hole } = th, lf = W.bite.lf, T = T3.kinds.rival, slot = this.slots.indexOf(false);
    if (slot < 0 || !lf?.ready) return null;
    const d = new THREE.Vector3();
    if (o.near) W.dirAt(0, -o.near * hole.r, d);
    else {
      let pk = -1; const pd = lf.pDir, l0 = lf.lv[0].left;
      for (let i = 0; i < 600 && pk < 0; i++) { const q = lf.land[(Math.random() * lf.land.length) | 0]; if (!(l0[q] > 1e-3)) continue; const an = Math.acos(Math.min(1, pd[q * 3] * W.hdir.x + pd[q * 3 + 1] * W.hdir.y + pd[q * 3 + 2] * W.hdir.z)); if (an > 1.65 && an < 2.35) pk = q; }
      if (pk < 0) pk = lf.land[(Math.random() * lf.land.length) | 0];
      d.set(pd[pk * 3], pd[pk * 3 + 1], pd[pk * 3 + 2]);
    }
    const r = hole.r * (kind === 'maw' ? T.maw : T.eater), hv = new THREE.Vector3().copy(W.hdir).addScaledVector(d, -d.dot(W.hdir)); if (hv.lengthSq() < 1e-8) hv.set(1, 0, 0).addScaledVector(d, -d.x); hv.normalize();
    const x = { on: true, id: ++this.uid, kind, name: NAMES[kind], slot, dir: d, hv, area: Math.PI * r * r, r, mood: 'hunt', tgt: null, tgtT: rnd(0, 1), cd: 0, age: 0, feed: 1, starve: 0, dp: 99e6, zone: th.zoneAlloc(), near: 0, pct0: 0, k: 0, opts: { budget: 2400, fr: { n: 0 }, pop: 0, area: 0, credit: 0 }, mk: null, ate: 0 };
    this.slots[slot] = true; this.list.push(x);
    x.mk = th.map?.addMarker({ kind: 'rival', dir: x.dir, r: x.r, big: true, label: x.name, color: '#ff5d5d' });
    th.stats.rivals++; th.sfx.rivalGrowl?.(); th.screenFlash(0.18, '#ff5a47', 500); th.trauma(0.25);
    th.ctx.card(x.name, `${(r / hole.r).toFixed(1)}× your size — it hunts you. Out-grow it, then eat it`);
    th.news(kind === 'maw' ? `Another void rises on the far side of the world: the Maw, ${(r / hole.r).toFixed(1)}× your size` : `Something larger stirs: the World-Eater, ${(r / hole.r).toFixed(1)}× your size`);
    return x;
  }

  kill(x) {
    x.on = false; if (this.slots[x.slot]) { this.slots[x.slot] = false; this.th.W.globe.setHole(1 + x.slot, x.dir, 0); this.th.W.globe.u.uRivalK[x.slot].value = 0; }
    x.mk?.remove(); x.mk = null; this.th.zoneFree(x.zone); x.zone = -1; this.labels[x.slot].hidden = true;
  }

  clear() { for (const x of this.list) if (x.on) this.kill(x); this.list.length = 0; this.did.maw = this.did.eater = false; this.t3 = this.t4 = null; }
  dispose() { this.clear(); for (const l of this.labels) l.remove(); }

  /** The events: the Maw 25 s after T3 begins, the World-Eater 20 s after T4 begins. */
  direct(dt, tier) {
    const th = this.th;
    if (tier >= 3 && this.t3 == null) this.t3 = th.t; if (tier >= 4 && this.t4 == null) this.t4 = th.t;
    if (!this.did.maw && this.t3 != null && th.t - this.t3 > 25 && th.phase !== 'relax') { this.did.maw = true; this.spawn('maw'); }
    if (!this.did.eater && this.t4 != null && th.t - this.t4 > 20) { this.did.eater = true; this.spawn('eater'); }
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) if (!L[i].on) L.splice(i, 1);
    for (let i = 0; i < L.length; i++) this.step(L[i], dt);
    this.placeLabels();
  }

  step(x, dt) {
    const th = this.th, { W, hole, state } = th, T = T3.kinds.rival, rP = hole.r, lf = W.bite.lf;
    x.age += dt; x.cd -= dt; x.r = Math.sqrt(x.area / Math.PI);
    if (x.age > T.ttl[x.kind]) { // its hunger is spent: it collapses into the void (a rival lives 2.8 min / 3.5 min)
      x.area *= 1 - 0.3 * dt; if (!x.fade) { x.fade = true; th.news(`${x.name} starves: its hunger is spent and it folds into the void`); }
      if (x.area < 0.03 * hole.area) { this.kill(x); return; }
    }
    const bigger = x.r > rP * 1.04, dp = x.dp = angle(x.dir, W.hdir) * R;
    // the mood: a bigger rival hunts the player in 30 s spells with 12 s of grazing between; a smaller one flees when close, else it grazes
    x.mood = x.cd > 0 ? 'retreat' : bigger ? ((x.age % 45) < 14 ? 'chase' : 'hunt') : dp < 9 * rP ? 'flee' : 'hunt';
    if ((x.tgtT -= dt) <= 0) { // a land target at ~1 Hz (staggered): the nearest district with land worth a pass
      x.tgtT = 1 + Math.random() * 0.6;
      const goal = th.game.worldGoal ?? (th.game.worldGoal = lf.makeGoal('world', W.hdir)), t = lf.target(goal, x.dir, x.r, false);
      x.tgt = t ? t.dir : null;
    }
    // the heading wanted: a tangent at x.dir toward a point
    let w = null;
    const speed0 = P3.speed(x.r) * T.speed;
    if (x.mood === 'chase') { const Tl = Math.min(4, dp / Math.max(1, speed0)) * 0.7; W.dirAt(hole.vx * Tl, hole.vz * Tl, pv); w = tangentToward(x.dir, pv.x, pv.y, pv.z, tg); }
    else if (x.mood === 'flee' || x.mood === 'retreat') { // away from the player, bent toward food so it does not just circle the planet
      const aw = tangentToward(x.dir, -W.hdir.x, -W.hdir.y, -W.hdir.z, tg); if (aw) { c.copy(aw); if (x.tgt) { const lw = tangentToward(x.dir, x.tgt.x, x.tgt.y, x.tgt.z, tg); if (lw) c.addScaledVector(lw, 0.5); } w = c.normalize(); }
    } else if (x.tgt) w = tangentToward(x.dir, x.tgt.x, x.tgt.y, x.tgt.z, tg);
    if (w) x.hv.lerp(w, 1 - Math.exp(-dt / (P3.turn(x.r) * 1.3))).addScaledVector(x.dir, -x.hv.dot(x.dir)).normalize();
    // grazing slows it (as ridge drag and the feast do the player): a fleeing rival that stops to eat can be caught
    const sp = speed0 * (x.feed > 0.3 ? (x.mood === 'chase' ? 0.25 : 0.04) : 1) * (x.mood === 'retreat' ? 1.1 : 1), ang = sp * dt / R, cs = Math.cos(ang), sn = Math.sin(ang);
    a.copy(x.dir).multiplyScalar(cs).addScaledVector(x.hv, sn); b.copy(x.hv).multiplyScalar(cs).addScaledVector(x.dir, -sn);
    x.dir.copy(a).normalize(); x.hv.copy(b).addScaledVector(x.dir, -b.dot(x.dir)).normalize();
    // chew (bite.chew with opts: no tear flags, its own phase and budget, and its own people count: the player's counters stay the player's)
    const credit = W.bite.chew(x.dir, x.r, dt, sp * dt, 0.5, x.opts), ate = x.opts.area;
    if (ate > 0) { x.area += credit * P3.g(x.r) * P3.feast * T.grow; th.stats.rivalKm2 += ate; x.ate += ate; x.starve = 0; } else if ((x.starve += dt) > 2) x.area *= 1 - T.starve * dt;
    x.feed += ((ate > 1e-3 ? 1 : 0) - x.feed) * Math.min(1, dt * 1.5);
    if (x.ate > 0.01 * W.bite.sum0 && x.ate - x.pct0 > 0.01 * W.bite.sum0) { x.pct0 = x.ate; if (th.map || true) th.news(`${x.name} has devoured ${(100 * x.ate / W.bite.sum0).toFixed(0)}% of the world's land`); }
    // the draw: the cap, its rim (red while it is bigger), the minimap
    W.globe.setHole(1 + x.slot, x.dir, x.r / R);
    const u = W.globe.u.uRivalK[x.slot]; u.value += ((bigger ? 1 : 0) - u.value) * Math.min(1, dt * 3);
    if (x.mk) { x.mk.r = x.r; x.mk.big = bigger; x.mk.color = bigger ? '#ff5d5d' : '#c9a8ff'; }
    // the danger ring: the contact radius (a bigger rival eats the player when its centre is within r_rival - 0.5 r_player of the player's), shown from 5 r_rival out
    const reach = x.r - 0.5 * rP;
    if (bigger && dp < reach + 5 * x.r && x.zone >= 0) { x.near += dt; th.zoneSet(x.zone, x.dir, Math.max(reach, 0.2 * rP), 0, Math.min(1, x.near * 1.5) * 0.9, 0.001, 0); } else { x.near = 0; if (x.zone >= 0) W.globe.u.uZoneP[x.zone].value.y = 0; }
    // contact
    if (x.cd > 0) return;
    if (bigger) {
      if (dp < reach) this.bitePlayer(x, dp);
    } else if (rP > x.r && dp < rP - 0.5 * x.r) this.eat(x);
  }

  bitePlayer(x, dp) {
    const th = this.th, { W, state } = th, o = th._o ??= {};
    th.offsetOf(x.dir, o); const l = Math.hypot(o.x, o.z) || 1;
    x.cd = 12; th.stats.rivalHits++;
    const f = th.hurt(T3.kinds.rival.hit, `${x.name} bites!`, 'rival', 40, T3.kinds.rival.cap, x.near);
    const kick = state.kick || (state.kick = { x: 0, z: 0 }); kick.x = -o.x / l * 320; kick.z = -o.z / l * 320; // (thrown clear: ~1 r)
    th.glow.spawn(W.hdir.clone().multiplyScalar(R), null, 3 * x.r * 0.15, 6 * x.r * 0.15, 0.5, new THREE.Color(0xff4a33).multiplyScalar(2.5), 1.4, 0);
    th.sfx.rivalBite?.(); th.screenFlash(0.35, '#ff3a2a', 380); th.beat(0.1); th.notice(8);
    th.news(`${x.name} takes a bite out of the void`);
  }

  eat(x) {
    const th = this.th, { W, hole, state } = th, T = T3.kinds.rival, r = hole.r;
    const frac = Math.min(T.eat * x.area, 0.25 * hole.area) / hole.area; th.gain(frac, 'rival'); th.stats.rivalEaten++;
    state.belly = Math.min(1, state.belly + 0.4); state.frenzy = 8;
    W.shock(x.dir, 0.4 * x.r / R, 2.4 * x.r / R, 1.8, 1); hole.shockwave();
    th.glow.spawn(a.copy(x.dir).multiplyScalar(R + 3000), null, 2 * x.r, 3 * x.r, 0.18, new THREE.Color(0xf0e4ff).multiplyScalar(3.4), 3.2, 0);
    th.glow.spawn(a.copy(x.dir).multiplyScalar(R + 3000), null, 1.2 * x.r, 2.8 * x.r, 1.1, new THREE.Color(0xa070ff).multiplyScalar(2.4), 1.8, 0.2);
    th.scar(x.dir, 4 * x.r, 3.2 * x.r, 4, 2);
    th.sfx.rivalEaten?.(); th.screenFlash(0.75, '#e8dcff', 500); th.beat(0.2, 0.4, 1.5); th.trauma(0.6); th.notice(12);
    th.ctx.card(`${x.name} IS FED TO THE VOID`, `+${(100 * frac).toFixed(0)}% — Frenzy`);
    th.news(`${x.name} is gone: the void swallowed its rival whole`);
    this.kill(x);
  }

  /** Floating names above the rivals that are on screen and over the horizon (three pooled elements). */
  placeLabels() {
    const th = this.th, cam = th.ctx.camera, cp = th.camP, cl = cp.length() || 1;
    for (const x of this.list) {
      const el = this.labels[x.slot]; if (!x.on || !th.state.playing) { el.hidden = true; continue; }
      const vis = (x.dir.x * cp.x + x.dir.y * cp.y + x.dir.z * cp.z) > R * R / cl;
      th.W.renderPos(x.dir, 0, pv).project(cam);
      if (!vis || pv.z > 1 || Math.abs(pv.x) > 0.94 || Math.abs(pv.y) > 0.92) { el.hidden = true; continue; }
      const big = x.r > th.hole.r * 1.04;
      if ((x.lt = (x.lt ?? 0) - 1) <= 0) { x.lt = 15; el.textContent = `${x.name} · ${(x.r / th.hole.r).toFixed(1)}×`; el.className = big ? 'rvl' : 'rvl small'; } // (the label text is rebuilt 4 times a second, not every frame)
      el.hidden = false; el.style.transform = `translate(${((pv.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px,${((-pv.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px) translate(-50%,-190%)`;
    }
    for (let i = 0; i < 3; i++) if (!this.slots[i]) this.labels[i].hidden = true;
  }
}
