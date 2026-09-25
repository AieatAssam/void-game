// City events (HANDOVER §5.1): one surprise per run - a parade, a marathon, a car show or a UFO landing.
// planEvent() runs during city layout (seeded) and parks the event's crowd as dormant instanced entities;
// the Events class wakes them at 60-150 s after a 5 s warning, runs the event for 45-60 s, then sends
// whatever is still standing away. Nothing here can hurt the player or wall off a road (PLAN.md rule 1).
import { makeEntity } from './entity.js';
import * as THREE from 'three/webgpu';
import { Fn, uv, vec3, vec4, sin, smoothstep, time, mx_noise_float, uniform } from 'three/tsl';

const TILE = 40;
export const EVENT_NAMES = { parade: 'Parade', marathon: 'City Marathon', carshow: 'Car Show', ufo: 'UFO Landing' };
const WARN = 5;

/** A polyline with rounded corners, sampled by distance: at(s) -> [x, z, tx, tz]. */
class Path {
  constructor(points, fillet = 7) {
    // round each corner with a quarter-ish arc (Chaikin on a dense resample keeps straights straight)
    let pts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / fillet));
      for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    pts.push(points.at(-1));
    for (let it = 0; it < 3; it++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
      }
      out.push(pts.at(-1));
      pts = out;
    }
    this.pts = pts;
    this.len = [0];
    for (let i = 1; i < pts.length; i++) this.len.push(this.len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.total = this.len.at(-1);
  }

  at(s) {
    s = Math.max(0, Math.min(this.total - 1e-3, s));
    let lo = 0, hi = this.len.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.len[mid] <= s) lo = mid; else hi = mid; }
    const [ax, az] = this.pts[lo], [bx, bz] = this.pts[hi];
    const seg = this.len[hi] - this.len[lo] || 1, k = (s - this.len[lo]) / seg;
    const tx = (bx - ax) / seg, tz = (bz - az) / seg;
    return [ax + (bx - ax) * k, az + (bz - az) * k, tx, tz];
  }
}

/** Which events this city can host (car show: a plaza or parking lot; UFO: a park or plaza; parades need long roads). */
function options(city) {
  const has = (...types) => city.tiles.some((t) => types.includes(t.type) && t.ring >= 1);
  const w = { parade: 1, marathon: 1 };
  if (has('plaza', 'parking') || city.tiles.some((t) => t.type === 'plaza')) w.carshow = 1;
  if (has('park', 'plaza')) w.ufo = 1;
  for (const [k, b] of Object.entries(city.mood.events || {})) if (w[k]) w[k] *= b;
  return w;
}

/** Park an entity that the event wakes later (instanced with its kind; costs nothing while asleep). */
function dormant(city, name, mover) {
  const a = city.assets[name];
  const e = makeEntity({ name, meta: a.meta, x: 0, z: 0, y: 0, rot: 0, tilt: 0, tiltDir: 0, s: 0, alive: false, falling: false, vy: 0,
    mover: { ...mover, t: 0, dormant: true }, grounded: true });
  city.entities.push(e);
  return e;
}

/** Seeded plan for this run's event (called from City.layout before any three.js objects exist). */
export function planEvent(city) {
  const { r } = city;
  const H = city.half;
  const force = typeof location !== 'undefined' && new URLSearchParams(location.search).get('event');
  const w = options(city);
  let kind = null;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (const [k, v] of Object.entries(w)) if (kind === null && (x -= v) < 0) kind = k;
  kind ??= 'parade';
  if (force && EVENT_NAMES[force]) kind = force;
  const forceAt = typeof location !== 'undefined' && new URLSearchParams(location.search).get('eventAt');
  const plan = { kind, at: forceAt ? +forceAt : r.range(60, 150), dur: r.range(45, 60), members: [] };
  const lines = Array.from({ length: city.N + 1 }, (_, k) => -H + k * TILE);
  const inner = lines.slice(1, -1);
  if (kind === 'parade') {
    // along an east-west road, turning onto a north-south road partway: one gentle corner
    const zl = r.pick(inner) + 2.2, xl = r.pick(inner) - 2.2, down = r() < 0.5 ? 1 : -1;
    const west = r() < 0.5;
    const pts = west ? [[-H - 12, zl], [xl, zl], [xl, down * (H + 12)]] : [[H + 12, zl], [xl, zl], [xl, down * (H + 12)]];
    plan.path = new Path(pts);
    const floats = 1 + (r() < 0.55 ? 1 : 0);
    let back = 0;
    for (let f = 0; f < floats; f++) {
      plan.members.push(dormant(city, 'parade_float', { type: 'parade', back, lat: 0 }));
      for (let k = 0; k < 10; k++) { // a 2 x 5 block of drummers behind each float
        plan.members.push(dormant(city, 'drummer', { type: 'parade', back: back + 4.5 + Math.floor(k / 2) * 1.4, lat: (k % 2 ? 1 : -1) * 0.95 }));
      }
      back += 16;
    }
    const balloon = dormant(city, 'balloon_float', { type: 'parade', back: back + 2, lat: 0 });
    balloon.flying = true;
    plan.members.push(balloon);
    plan.length = back + 8;
    plan.start = Math.min(plan.path.total * 0.25, 40); // the head appears a little way into town
  } else if (kind === 'marathon') {
    // a closed 2 x 2 block circuit of roads; the finish arch spans its west side
    const k0 = 1 + Math.floor(r() * Math.max(1, city.N - 3)), j0 = 1 + Math.floor(r() * Math.max(1, city.N - 3));
    const x0 = lines[Math.min(k0, city.N - 2)], z0 = lines[Math.min(j0, city.N - 2)];
    const rect = { cx: x0 + TILE, cz: z0 + TILE, hx: TILE - 2.2, hz: TILE - 2.2 };
    plan.rect = rect;
    plan.arch = { x: rect.cx - rect.hx, z: rect.cz };
    plan.members.push(dormant(city, 'finish_arch', { type: 'still' }));
    const n = 24 + Math.floor(r() * 17), P = 4 * (rect.hx + rect.hz);
    for (let k = 0; k < n; k++) {
      plan.members.push(dormant(city, 'marathon_runner', { type: 'jog', ...rect, s: (k / n) * P + r.range(-2, 2), v: r.range(3.1, 3.7), lat: r.range(-1.6, 1.6) }));
    }
  } else if (kind === 'carshow') {
    const pool = city.tiles.filter((t) => t.type === 'parking' || t.type === 'plaza');
    const t = r.pick(pool);
    plan.tile = t;
    plan.site = [[-9.5, -6], [9.5, -6], [0, 9.5]].map(([x, z]) => city.at(t, x, z));
    const rare = ['supercar', 'classic_car', 'mayor_limo'];
    plan.cars = [0, 1, 2].map((i) => rare[(i + Math.floor(r() * 3)) % 3]);
  } else {
    const pool = city.tiles.filter((t) => (t.type === 'park' || t.type === 'plaza') && t.ring >= 1);
    const t = r.pick(pool.length ? pool : city.tiles.filter((t) => t.type === 'park' || t.type === 'plaza'));
    plan.tile = t;
    plan.site = city.at(t, -5, 5);
    for (let k = 0; k < 6; k++) plan.members.push(dormant(city, 'alien', { type: 'wander', h: r() * 6.28, v: r.range(0.9, 1.4) }));
  }
  return plan;
}

// ---------- UFO tractor beam: soft additive cone with scrolling noise ----------
function beamMaterial(fade) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  m.colorNode = Fn(() => {
    const v = uv();
    const n = mx_noise_float(vec3(v.x.mul(14), v.y.mul(3).sub(time.mul(1.6)), time.mul(0.3))).mul(0.5).add(0.5);
    const rings = sin(v.y.mul(40).add(time.mul(9))).mul(0.25).add(0.75);
    const a = smoothstep(0, 0.25, v.y).mul(smoothstep(1, 0.7, v.y)).mul(n.mul(0.6).add(0.4)).mul(rings).mul(fade);
    return vec4(vec3(0.45, 1.0, 0.7).mul(a).mul(1.6), 1);
  })();
  return m;
}

export class Events {
  constructor(city, scene, hooks) {
    this.city = city;
    this.scene = scene;
    this.hooks = hooks; // { warn(text), shake(k), boom() }
    this.plan = city.eventPlan;
    this.kind = this.plan?.kind;
    this.t = 0;
    this.phase = 'wait';
    this.spawned = [];
  }

  get name() { return EVENT_NAMES[this.kind]; }
  get live() { return this.phase === 'live'; }

  /** Where the arrow should point during the warning / the first seconds (null when there is nothing to show). */
  get focus() {
    if (!this.plan || (this.phase !== 'warn' && !(this.phase === 'live' && this.t - this.plan.at < 12))) return null;
    const p = this.plan;
    if (p.kind === 'parade') { const [x, z] = p.path.at(p.start); return [x, z]; }
    if (p.kind === 'marathon') return [p.arch.x, p.arch.z];
    if (p.kind === 'carshow') return [p.tile.cx, p.tile.cz];
    return p.site;
  }

  dispose() {
    if (this.beam) { this.scene.remove(this.beam); this.beam.geometry.dispose(); this.beam.material.dispose(); }
  }

  update(dt, hole, state) {
    if (!this.plan) return;
    const p = this.plan;
    this.t += dt;
    if (this.phase === 'wait' && this.t >= p.at - WARN) {
      this.phase = 'warn';
      this.hooks.warn?.(`${{ parade: '🎺', marathon: '🏃', carshow: '🏎️', ufo: '🛸' }[p.kind]} ${this.name} in 5 s!`);
    }
    if (this.phase === 'warn' && this.t >= p.at) { this.phase = 'live'; this.begin(); }
    if (this.phase === 'live') {
      this.run(dt, hole, state);
      if (this.t >= p.at + p.dur) { this.phase = 'leave'; this.end(); }
    }
    if (this.phase === 'leave') this.leave(dt);
  }

  /** Clear small street props from a footprint so a set piece never lands on a bench (quietly: not eaten). */
  clearSpot(x, z, R) {
    for (const e of this.city.entities) {
      if (!e.alive || e.mover || e.meta.tier > 2.5 || e.meta.kind !== 'prop' || e.obj || (e.x - x) ** 2 + (e.z - z) ** 2 > R * R) continue;
      e.alive = false;
      e.s = 0;
      this.city.place(e);
    }
  }

  wake(e, x, z, rot = 0) {
    Object.assign(e, { x, z, y: 0, rot, s: 1, alive: true, falling: false, tilt: 0, vy: 0, fallT: 0, eater: null });
    e.mover.dormant = false;
    if (e.mover.type === 'still') e.mover = null;
    this.city.place(e);
  }

  begin() {
    const p = this.plan, city = this.city;
    if (p.kind === 'parade') {
      this.head = p.start;
      for (const e of p.members) { e.mover.path = p.path; e.mover.s = this.head - e.mover.back; e.mover.v = 2; this.wake(e, 0, 0); }
      for (const e of p.members) city.moveParade(e, 0);
    } else if (p.kind === 'marathon') {
      const [arch, ...runners] = p.members;
      this.clearSpot(p.arch.x, p.arch.z, 5);
      this.wake(arch, p.arch.x, p.arch.z, 0);
      for (const e of runners) this.wake(e, p.rect.cx, p.rect.cz);
    } else if (p.kind === 'carshow') {
      this.clearSpot(p.tile.cx, p.tile.cz, 13);
      p.site.forEach(([x, z], i) => {
        const tt = city.spawn('show_turntable', x, z, Math.random() * 6.28);
        const car = city.spawn(p.cars[i], x, z, 0, { mover: { type: 'show', tt, t: 0 } });
        this.spawned.push(tt, car);
      });
      this.hooks.boom?.(0.2);
    } else {
      const [x, z] = p.site;
      this.clearSpot(x, z, 7);
      this.ufo = city.spawn('ufo', x, z, 0, { y: 22, noSwallow: true, flying: true });
      this.ufoT = 0;
      this.spawned.push(this.ufo);
      const fade = (this.beamU = uniform(1));
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 4.2, 1, 40, 1, true).translate(0, -0.5, 0), beamMaterial(fade));
      this.beam.renderOrder = 3;
      this.scene.add(this.beam);
    }
  }

  run(dt, hole) {
    const p = this.plan, city = this.city;
    if (p.kind === 'parade') {
      this.head += 2 * dt;
      // walkers along the route stop and cheer
      if ((this.cheerT = (this.cheerT || 0) - dt) <= 0) {
        this.cheerT = 0.5;
        const heads = p.members.filter((e) => e.alive && e.name !== 'drummer');
        for (const w of city.walkers ??= city.entities.filter((q) => q.mover?.type === 'walk' || q.mover?.type === 'loop')) {
          if (w.alive && heads.some((f) => (f.x - w.x) ** 2 + (f.z - w.z) ** 2 < 18 * 18)) w.cheer = 0.8;
        }
      }
    } else if (p.kind === 'ufo' && this.ufo?.alive) {
      const u = this.ufo;
      this.ufoT += dt;
      if (this.ufoT < 3) u.y = 22 * (1 - smooth(this.ufoT / 3)); // descend in its beam
      else if (u.y > 0 || u.flying) { u.y = 0; u.flying = false; u.noSwallow = false; }
      if (this.ufoT > 2.7 && !this.crew) { // the crew beams down
        this.crew = true;
        p.members.forEach((e, k) => { const a = (k / 6) * Math.PI * 2; this.wake(e, u.x + Math.cos(a) * 4.5, u.z + Math.sin(a) * 4.5, -a); });
      }
      if (this.ufoT >= 40 && !this.lift) this.takeOff();
      this.updateUfo(dt);
      city.place(u);
    }
  }

  takeOff() {
    this.lift = 0;
    this.ufo.flying = true;
    this.ufo.noSwallow = true;
    this.hooks.warn?.('🛸 The UFO is leaving!');
  }

  updateUfo(dt) {
    const u = this.ufo;
    if (!u || !u.alive) { if (this.beam) this.beam.visible = false; return; }
    if (this.lift !== undefined) {
      this.lift += dt;
      u.y = 12 * smooth(Math.min(1, this.lift / 4));
      if (this.lift > 4) { u.x += dt * 26; u.y += dt * 8; }
      if (this.lift > 9) { this.city.remove(u); this.ufo = null; }
    }
    if (this.beam && u) {
      const on = this.ufoT < 3 ? 1 : this.ufoT < 4 ? 4 - this.ufoT : this.lift !== undefined && this.lift < 4 ? Math.sin(this.lift / 4 * Math.PI) : 0;
      this.beamU.value = on;
      this.beam.visible = on > 0.01;
      this.beam.position.set(u.x, u.y + 0.55, u.z);
      this.beam.scale.set(1, Math.max(0.5, u.y + 0.55), 1);
    }
  }

  end() {
    this.leaveT = 0;
    const p = this.plan;
    if (p.kind === 'ufo' && this.ufo?.alive && this.lift === undefined) this.takeOff();
    // floats roll on out of town along their route; everything else packs up (aliens beam back, runners finish, cars go home)
    const packs = p.kind === 'parade' ? [] : [...p.members, ...this.spawned];
    for (const e of packs) if (e.alive && !e.falling && e !== this.ufo) e.leaving = true;
  }

  leave(dt) {
    this.leaveT += dt;
    const p = this.plan, city = this.city;
    if (p.kind === 'parade') this.head += 2 * dt; // floats keep rolling; the city removes them at the end of the route
    if (p.kind === 'ufo') this.updateUfo(dt);
    for (const e of [...p.members, ...this.spawned]) {
      if (!e.leaving || !e.alive || e.falling) continue;
      // pack up: shrink away over 1.5 s, staggered (a puff covers it in main)
      const k = Math.max(0, 1 - (this.leaveT - ((e.index ?? 0) % 7) * 0.25) / 1.5);
      e.s = Math.min(e.s, k);
      if (e.s <= 0.01) { if (e.obj) city.remove(e); else { e.alive = false; e.s = 0; } }
      city.place(e);
    }
    if (this.leaveT > 30) this.phase = 'done';
  }
}

const smooth = (x) => x * x * (3 - 2 * x);
export { Path };
