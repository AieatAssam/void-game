// Phase 3 adversity (docs/PHASE3.md §5, §12.6): the DEFCON director and what it throws at a hole the size of a continent.
//   Everything is sized in hole radii (r) so it reads at any tier, and lives in PLANET space (a child of globe.group, or sprites re-projected every frame), so the
//   world turns under it while the hole drives at 24+ km/s. Ground rings, scars and the fallout tint are shader uniforms (planetglobe.js: uScar / uZone / uStrafe),
//   which hug the relief at any size. Every attack: telegraphed (locked >= 1.5 s, the lock time comes from the hole's speed in r/s, so it is dodgeable at every tier),
//   <= 25% damage, capped at 25% per 30 s (the mercy cap), never blocks movement, and avoidable. Bombers (T1-T2), ICBM nukes (T1-T3, silo fields are edible,
//   swallowing one is the best moment in the game) and kinetic lances (T2+, the satellite is edible from 420 km). Also the Sealed loss (lid warning, 14 s).
//   Debug: ?defcon=N (floor), ?noarmy / ?nothreat (off), window.__threat { force(kind, opts), state(), rings(), clear(), stats }.
import * as THREE from 'three/webgpu';
import { attribute, vec3, vec4, float, positionLocal, normalView, normalWorld, mx_noise_float, mix, smoothstep, pow, abs, exp, uniform } from 'three/tsl';
import { R } from './planetgen.js';
import { P3, TIERS, T3 } from './phase3.js';
import { sunDir } from './look.js';
import { Rivals } from './planetrival.js';
import { makeLaser } from './threat/laser.js';
import { makeFleet } from './threat/fleet.js';
import { makeTsunami, makeVolcano } from './threat/nature.js';
import { makeAegis } from './threat/aegis.js';
import { makeCracker } from './threat/cracker.js';
import { makeMoon } from './threat/moon.js';
import { makeExodus, makeStation } from './threat/exodus.js';
import { nukeCloudMaterial, cloudScale, cloudGeometry, domeMaterial, domeGeometry } from './threat/blast.js';
import { smooth, rnd, _Y, v1, v2, v3, v4, v5, v6, qa, C, FIRE, SMOKE0, SMOKE1, ASH, DUST, KMs, tangentAt, sv, aim, vel3, slerp, Ribbon, Pool } from './threat/kit.js';

const qs = new URLSearchParams(location.search);
const FORCE = qs.has('defcon') ? Math.min(5, Math.max(1, +qs.get('defcon') || 5)) : 0;

const dangerPool = [];
export const sealedCss = `#sealed{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(ellipse at center,#1a0c2ecc,#05020bf2);color:#fff3dd;font-family:system-ui,sans-serif;text-align:center;opacity:0;animation:sealin 1.2s ease-out forwards}
#sealed h1{font-size:clamp(40px,9vw,92px);letter-spacing:.14em;margin:0;color:#ff5a47;text-shadow:0 0 30px #ff2a1a88}#sealed p{max-width:34em;margin:0;opacity:.85;line-height:1.45}#sealed div{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
#sealed button{font:800 17px system-ui;padding:12px 26px;border-radius:999px;border:0;cursor:pointer;background:#c9a8ff;color:#1b0b3a;box-shadow:0 3px 0 #0006}#sealed button.alt{background:#fff3dd}
@keyframes sealin{to{opacity:1}}
#sealed.won h1{color:#c9a8ff;text-shadow:0 0 30px #8a5cffaa;font-size:clamp(32px,7vw,72px)}#sealed table{border-collapse:collapse;font-size:15px;opacity:.92}#sealed td{padding:3px 14px;text-align:left}#sealed td+td{text-align:right;font-weight:800;color:#e8dcff}
#threat{position:fixed;left:50%;transform:translateX(-50%);z-index:6;pointer-events:none;display:flex;gap:10px;align-items:center;padding:6px 16px;border-radius:999px;font:800 13px system-ui,sans-serif;letter-spacing:.07em;color:#fff3dd;background:#2a0a14e6;box-shadow:0 0 0 1.5px #ff5a4799,0 0 22px #ff2a1a55;transition:opacity .2s;white-space:nowrap}
#threat[hidden]{display:none}#threat b{color:#ffb27a}#threat.lock{background:#6a0612f0;box-shadow:0 0 0 2px #ff6a58,0 0 30px #ff2a1a99;animation:thr .5s infinite alternate}#threat.good{background:#2a1260ee;box-shadow:0 0 0 2px #c9a8ff,0 0 26px #8a5cff88}
@keyframes thr{to{transform:translateX(-50%) scale(1.04)}}
#fxflash{position:fixed;inset:0;z-index:5;pointer-events:none;opacity:0;background:#fff}`;

const NZ = 16; // threat zone slots (planetglobe uZone 0..15; 16..19 are the ripe rings)
const NS = 12; // scar slots (planetglobe uScar)
const STATS0 = { nukes: 0, swallowed: 0, hits: 0, near: 0, rods: 0, rodGulps: 0, sats: 0, strafes: 0, strafeHits: 0, mercy: 0, loss: 0, sites: 0, sealWarn: 0, surge: 0, locks: 0, unfair: 0,
  mirvs: 0, mirvGulps: 0, lasers: 0, laserHits: 0, laserEaten: 0, fleets: 0, fleetGulps: 0, fleetSunk: 0, salvos: 0, tsunamis: 0, volcanoes: 0, magma: 0, aegis: 0, aegisBroke: 0, aegisHits: 0, rockets: 0, rocketGulps: 0,
  cracker: 0, fizzles: 0, crackerHits: 0, moon: 0, moonGulps: 0, moonHits: 0, moonAll: 0, rivals: 0, rivalEaten: 0, rivalHits: 0, rivalKm2: 0, seen: 0 };

export class Threat {
  constructor(game, ctx) {
    this.game = game; this.ctx = ctx; this.W = game.world; this.hole = ctx.hole; this.state = ctx.state; this.sfx = ctx.sfx;
    this.uid = 0; this.t = 0; this.budget = 3; this.noto = 0; this.quiet = 0; this.defcon = 5; this.base = 5; this.cool = {}; this.last = '';
    this.hT = new Float32Array(24).fill(-99); this.hF = new Float32Array(24); this.hN = 0; this.cont = {}; // (the mercy window: a preallocated ring of [time, fraction])
    this.tAdd = 0; this.slots = { z: 0, s: 0 }; this.eventsHold = false; this.disabled = qs.has('noarmy') || qs.has('nothreat'); this.sealOn = !this.disabled;
    this.stats = { ...STATS0 };
    this.K = []; this.byName = {}; this.cand = []; this.sites = []; this.nukes = []; this.lances = []; this.strafes = []; this.fall = []; this.seal = null; this.siteT = 4;
    this.zoneUsed = new Array(NZ).fill(false); this.lineT = 0; this.ready = false;
    this.camP = new THREE.Vector3(); this.off = new THREE.Vector3(); this.qiw = new THREE.Quaternion();
    if (!document.getElementById('threat-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'threat-css', textContent: sealedCss }));
    this.lineEl = Object.assign(document.createElement('div'), { id: 'threat', hidden: true }); document.body.append(this.lineEl);
    this.flashEl = Object.assign(document.createElement('div'), { id: 'fxflash' }); document.body.append(this.flashEl);
    this.flashA = 0; this.flashC = '#fff';
  }

  /** Build the pooled meshes and ribbons once (under the loading line) and compile them. */
  async init() {
    const { ctx, W } = this, assets = ctx.assets;
    this.root = new THREE.Group(); this.root.name = 'threats'; W.globe.group.add(this.root);
    this.glow = new Pool(260, true); this.smoke = new Pool(1200, false);
    ctx.scene.add(this.glow.sprite, this.smoke.sprite);
    this.glow.sprite.visible = this.smoke.sprite.visible = !!this.game.entered; // (prepared under Phase 2: the pools stay hidden until the swap, show())
    const model = this.model = (name) => { const o = assets[name].scene.clone(true); o.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = false; m.frustumCulled = false; } }); o.visible = false; this.root.add(o); return o; };
    for (let i = 0; i < 6; i++) { // (3 with a mushroom cloud; 3 "light" ones for the MIRV warheads: fireball and smoke only, no extra pipeline)
      let mush = null;
      if (i < 3) { const mat = nukeCloudMaterial(ctx.Q?.tier === 'low'), mesh = new THREE.Mesh(this.cloudGeo ??= cloudGeometry(), mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 8; this.root.add(mesh); mush = { mesh, mat }; }
      this.nukes.push({ i, on: false, arc: new Ribbon(48, this.root), trail: new Ribbon(28, this.root), mis: model('icbm'), mush, zone: -1, mk: null, pos: new THREE.Vector3(), to: new THREE.Vector3(), from: new THREE.Vector3() });
    }
    this.domes = Array.from({ length: 6 }, () => { const mat = domeMaterial(), mesh = new THREE.Mesh(this.domeGeo ??= domeGeometry(), mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 9; this.root.add(mesh); return { mesh, mat, t: 9, life: 1, r0: 0, speed: 0, rMax: 1, up: new THREE.Vector3() }; });
    this.lights = Array.from({ length: 2 }, () => ({ dir: new THREE.Vector3(0, 1, 0), t: 99, life: 1, I: 0, rad: 0.01, next: 0 })); this.fx = { w: 0, warm: 0, bloom: 0 };
    for (let i = 0; i < 2; i++) this.lances.push({ i, on: false, sat: model('kinetic_sat'), orbit: new Ribbon(97, this.root), beam: new Ribbon(10, this.root), rod: new Ribbon(14, this.root), zone: -1, a: new THREE.Vector3(), b: new THREE.Vector3(), n: new THREE.Vector3(), to: new THREE.Vector3(), pos: new THREE.Vector3(), mk: null, mkO: null });
    for (let i = 0; i < 2; i++) this.strafes.push({ i, on: false, jets: [0, 1, 2].map(() => model('bomber')), mk: null });
    this.siteMesh = Array.from({ length: 4 }, () => ({ on: false, parts: Array.from({ length: 5 }, () => model('missile_silo')) }));
    const lg = new THREE.CylinderGeometry(1, 1, 0.1, 6), lm = new THREE.MeshStandardNodeMaterial({ color: 0x2b2733, roughness: 0.45, metalness: 0.8, emissive: 0x4a0a08, emissiveIntensity: 1.2 });
    this.lid = new THREE.Mesh(lg, lm); this.lid.visible = false; this.lid.frustumCulled = false; this.root.add(this.lid);
    this.registerCore();
    this.rivals = new Rivals(this); this.register(this.rivals.kind());
    this.register(makeLaser(this));
    this.register(makeFleet(this));
    this.register(makeTsunami(this)); this.register(makeVolcano(this)); this.register(makeAegis(this)); this.register(makeCracker(this)); this.register(makeMoon(this)); this.register(makeExodus(this)); this.register(makeStation(this));
    window.__threat = this.api();
    for (const o of [this.glow.sprite, this.smoke.sprite]) o.frustumCulled = false;
    try { await ctx.post.precompile(this.root, 6000, this.game.around); await ctx.post.precompile({ traverse: (f) => { f(this.glow.sprite); f(this.smoke.sprite); } }, 3000, this.game.around); } catch (e) { console.warn('threat precompile', e); }
    this.ready = true;
  }

  show() { this.glow.sprite.visible = this.smoke.sprite.visible = true; }

  dispose() {
    this.rivals?.dispose(); this.lineEl.remove(); this.flashEl.remove(); document.getElementById('sealed')?.remove();
    this.ctx.scene.remove(this.glow.sprite, this.smoke.sprite); this.W.globe.group.remove(this.root);
    for (const m of this.map?.markers ?? []) m.remove?.();
    delete window.__threat;
  }

  get map() { return this.game.map; }
  floorR() { return TIERS[Math.max(this.state.tier || 1, P3.tier(this.hole.r)) - 1].r; }

  // ---------------------------------------------------------------- shared helpers
  /** Planet-space position of dir d at `h` m above the surface (the surface height here x E: the relief the camera sees). */
  surf(d, h, out, elev = null) { elev ??= Math.max(0, this.W.P.elevation(d, 3)); return out.copy(d).multiplyScalar(R + elev * this.W.E + h); }
  /** A render-space local offset (m) -> a planet direction, in the hole's current frame. */
  local(dx, dz, out) { return this.W.dirAt(dx, dz, out); }
  /** The local (x, z) of a planet direction in the hole's frame, as arc length (m). */
  offsetOf(d, out = {}) {
    const W = this.W; W.renderPos(d, 0, v5); const c = Math.hypot(v5.x, v5.z), a = W.distTo(d), k = c > 1e-6 ? a / c : 0;
    out.x = v5.x * k; out.z = v5.z * k; out.d = a; return out;
  }
  /** Lock time (s) so a ring of `need` extra metres... in radii: the hole must be able to leave `needR` r in lock - turn seconds at 0.9 v. */
  lockFor(needR, floor = 2.0, cap = 4.6) { const r = this.hole.r, v = P3.speed(r) / r; return Math.min(cap, Math.max(floor, P3.turn(r) + needR / (0.9 * v))); }
  notice(a) { if (a >= 1) this.quiet = 0; this.noto = Math.min(100, this.noto + a * (this.state.mods?.noto ?? 1)); }
  zoneAlloc() { for (let i = 0; i < NZ; i++) if (!this.zoneUsed[i]) { this.zoneUsed[i] = true; return i; } return -1; }
  zonesFree() { let n = 0; for (let i = 0; i < NZ; i++) if (!this.zoneUsed[i]) n++; return n; }
  zoneFree(i) { if (i >= 0) { this.zoneUsed[i] = false; this.W.globe.u.uZoneP[i].value.y = 0; } }
  zoneSet(i, d, outer, inner, alpha, lock, kind) { if (i < 0) return; const u = this.W.globe.u; u.uZone[i].value.set(d.x, d.y, d.z, outer / R); u.uZoneP[i].value.set(inner / R, alpha, lock, kind); }
  scar(d, reach, speed, life, kind) { const u = this.W.globe.u, i = this.slots.s = (this.slots.s + 1) % NS; u.uScar[i].value.set(d.x, d.y, d.z, reach / R); u.uScarP[i].value.set(u.uTime.value, life, speed / R, kind); }
  screenFlash(a, color = '#fff', ms = 260) { if (a > this.flashA) { this.flashA = a; this.flashC = color; this.flashDur = ms / 1000; this.flashT = 0; } }
  /** Trauma, budgeted: at most 0.6 added per 1.5 s (§5.3). */
  trauma(k) { const room = Math.max(0, 0.6 - this.tAdd), add = Math.min(k, room); this.tAdd += add; this.state.shake = Math.min(1, this.state.shake + add); }
  news(t) { this.ctx.news.say(t); }
  /** A tracked hitstop / slow-mo beat (budget: the max of what is asked; slowT ticks in scaled time). */
  beat(hitstop, slow = 1, secs = 0) { const st = this.state; st.hitstop = Math.max(st.hitstop || 0, hitstop); if (slow < 1) { st.slowmo = slow; st.slowT = secs * slow + 0.3; } }

  // the mercy window (§5.1): <= 25% of the area in any 30 s, kept in a preallocated ring of [time, fraction]
  mercySum() { let s = 0; for (let i = 0; i < 24; i++) if (this.t - this.hT[i] < 30) s += this.hF[i]; return s; }
  mercyPush(f) { const i = this.hN = (this.hN + 1) % 24; this.hT[i] = this.t; this.hF[i] = f; }
  /** The audit: every damaging event says how long its telegraph was visible and fixed; under 1.5 s (or not drawn at all) counts as unfair (stats.unfair, a column in the sweep). */
  fair(age, what = '') { if (!(age >= 1.45)) { this.stats.unfair++; (this.unfairLog ??= []).length < 12 && this.unfairLog.push(`${what}@${this.t.toFixed(0)}s ${Number.isFinite(age) ? age.toFixed(2) : 'undrawn'}`); } }
  /** A bonus (area x (1 + frac)): one place, so the sweep's "bonus" column sees every kind. */
  gain(frac, key) { const { hole, state } = this, a0 = hole.area; hole.area *= 1 + frac * (state.mods?.gulp ?? 1); const d = hole.area - a0, L = state.ledger; L[key] = (L[key] || 0) + d; L.bonus = (L.bonus || 0) + d; return d; }

  /** What a hit looks, sounds and feels like (src/pain.js): `from` = the planet-space direction of the cause (null = all around); `cont` = a beam's tick. */
  painHit(frac, why, from, cont = false) {
    const p = this.ctx.pain, { hole, state } = this; if (!p) { this.sfx.hurt(); return; }
    let dx = 0, dz = 0, src = null, l = 0;
    if (from) { const o = this.offsetOf(from, this._po ??= {}); l = Math.hypot(o.x, o.z); if (l > 0.08 * hole.r) { dx = o.x; dz = o.z; src = from; } else l = 0; }
    if (cont) { p.cont(frac, { dx: l ? dx / l : 0, dz: l ? dz / l : 0 }); return; }
    p.hit(frac, { src, dx, dz, why });
    this.beat(Math.min(0.2, 0.04 + 0.6 * frac), frac >= 0.08 ? 0.55 : 1, 0.45); // (hit-stop and a short slow-mo scale with the damage)
    const kick = state.kick || (state.kick = { x: 0, z: 0 });
    if (l && Math.abs(kick.x) + Math.abs(kick.z) < 60) { const kk = Math.min(360, 110 + 1400 * frac); kick.x = -dx / l * kk; kick.z = -dz / l * kk; } // (thrown away from the cause; the callers that know better overwrite it)
  }

  /** A damaging hit: capped at 25%, and at 25% in any 30 s (past it a hit is a near miss). Returns the fraction taken. fairAge: seconds the telegraph was visible and fixed. from: where it came from (planet direction), for the recoil. */
  hurt(frac, why, key, k = 0, cap = 0.25, fairAge = 9, from = null) {
    const { hole, state } = this;
    if (k) frac *= T3.tierHit[Math.max(0, P3.tier(hole.r) - 1)]; // (P0-1: the floors grow with the tier: a T4 nuke is 14%, not 7%)
    if (k) frac = Math.max(frac, Math.min(cap, k * (state.gRate || 0) / hole.area)); // (seconds of income: A9)
    frac = Math.min(frac, cap) * (state.mods?.hurt ?? 1) * (state.ng ? 1.3 : 1); // (a New World hits 30% harder)
    if (this.mercySum() + frac > 0.25 + 1e-9) { this.stats.mercy++; this.stats.near++; this.trauma(0.25); this.ctx.pain?.nearMiss(); this.ctx.hint('Near miss — the world blinks'); return 0; }
    this.mercyPush(frac); this.fair(fairAge, key);
    const a0 = hole.area; hole.area *= 1 - frac;
    const L = state.ledger; L[key] = (L[key] || 0) + (hole.area - a0); L.dmg = (L.dmg || 0) + (hole.area - a0); this.stats.loss += frac; this.stats.hits++; (this.stats.by ??= {})[key] = (this.stats.by[key] || 0) + 1; { const hb = state.hitsByTier ??= {}, tt = P3.tier(hole.r); hb[tt] = (hb[tt] || 0) + 1; }
    this.trauma(0.2 + 2 * frac);
    state.stun = Math.min(14, Math.max(state.stun || 0, T3.stunBase + T3.stunK * frac) + 0.5 * (state.stun || 0)); // (P0-1: a hit costs the land clock: seconds at 0.35x speed, compounding on a wound that is still open)
    if ((state.wound = Math.min(T3.woundMax, (state.wound || 0) + T3.woundAdd + T3.woundK * frac)) > 0.4 && !this.woundHint) { this.woundHint = 1; this.ctx.hint('Wounded — slower until it heals: dodge the next one'); } // (P0-1: the wounds stack, so a player who never dodges is permanently hobbled)
    this.ctx.flash(why);
    this.painHit(frac, why, from);
    return frac;
  }
  /** Damage over time (a beam): `rate` is the fraction per second at least, `k` seconds of income per second; applied every frame, booked into the mercy window every 0.4 s. */
  hurtCont(rate, dt, why, key, k = 0, fairAge = 9, from = null) {
    const { hole, state } = this, c = this.cont[key] ??= { acc: 0, t: -9, hint: -9, fxAcc: 0 };
    let f = Math.max(rate, k ? k * (state.gRate || 0) / hole.area : 0) * dt * (state.mods?.hurt ?? 1);
    if (this.mercySum() + c.acc + f > 0.25 + 1e-9) { if (this.t - c.hint > 2) { c.hint = this.t; this.stats.mercy++; this.stats.near++; this.ctx.pain?.nearMiss(); this.ctx.hint('Near miss — the world blinks'); } return 0; }
    const a0 = hole.area; hole.area *= 1 - f; c.acc += f; c.fxAcc += f; const L = state.ledger; L[key] = (L[key] || 0) + (hole.area - a0); L.dmg = (L.dmg || 0) + (hole.area - a0); this.stats.loss += f; state.stun = Math.max(state.stun || 0, T3.stunBase * 0.4);
    if (this.t - c.t > 0.4) { this.mercyPush(c.acc); c.acc = 0; c.t = this.t; this.fair(fairAge, key); }
    if (this.t - (c.fx ?? -9) > 0.9) { c.fx = this.t; this.trauma(0.12); this.ctx.flash(why); this.stats.hits++; (this.stats.by ??= {})[key] = (this.stats.by[key] || 0) + 1; { const hb = state.hitsByTier ??= {}, tt = P3.tier(hole.r); hb[tt] = (hb[tt] || 0) + 1; } this.painHit(c.fxAcc, why, from, true); c.fxAcc = 0; }
    return f;
  }

  // ---------------------------------------------------------------- the director
  update(dt, ctx) {
    if (!this.ready) return;
    const { hole, state } = this, t0 = performance.now();
    this.t += dt; this.tAdd = Math.max(0, this.tAdd - dt * 0.4);
    if (this.t > 1e-3 && !this.disabled) { this.moonCheck(); this.direct(dt); }
    this.updateSites(dt);
    for (const k of this.K) for (const x of k.items) if (x.on) k.step(x, dt);
    this.rivals?.update(dt);
    this.updateFallout(dt);
    this.glow.step(dt); this.smoke.step(dt); this.domeStep(dt); this.fxStep(dt);
    this.sealWatch(dt);
    state.frenzy = Math.max(0, (state.frenzy || 0) - dt); state.slow = Math.max(0, (state.slow || 0) - dt); state.stun = Math.max(0, (state.stun || 0) - dt); state.wound = Math.max(0, (state.wound || 0) - dt / T3.woundHeal); state.magma = Math.max(0, (state.magma || 0) - dt);
    state.rubble = !!state.rubbleNow; state.rubbleNow = false; state.ash = !!state.ashNow; state.ashNow = false; // (flags the kinds raise each frame: the game reads them next frame)
    this.updateLine(dt);
    if (this.flashA > 0) { this.flashT += dt; const k = Math.max(0, 1 - this.flashT / this.flashDur); this.flashEl.style.background = this.flashC; this.flashEl.style.opacity = (this.flashA * k * k).toFixed(3); if (k <= 0) this.flashA = 0; }
    this.ms = (this.ms ?? 0) * 0.95 + (performance.now() - t0) * 0.05;
  }

  /** Register an attack kind: { name, cost, cool [min, max], items (pooled objects with .on), window(r, dc), can?(), set?, spawn(o), step(x, dt), finish(x), live(x), danger(x, out), line(x, pick), age(x), clear?() }. */
  register(k) { k.items ??= []; k.live ??= () => true; k.finish ??= (x) => { x.on = false; }; this.K.push(k); this.byName[k.name] = k; this.cool[k.name] = k.cool0 ?? 8; return k; }
  liveCount() { let n = 0; for (const k of this.K) { if (k.passive) continue; for (const x of k.items) if (x.on && k.live(x)) n++; } return n; }

  /** The Moon is a scripted beat, not a budgeted attack: from 90% of the land (once the cracker has settled) it comes, whatever else is live. */
  moonCheck() {
    const k = this.byName.moon, x = k?.items[0]; if (!k || x.on || x.done || this.seal || !this.state.playing || (this.moonT = (this.moonT || 0) + 1) % 30) return;
    if (k.window(this.hole.r) && k.can()) this.spawn('moon', { force: true });
  }

  direct(dt) {
    const { hole, state } = this, r = hole.r;
    const fl = r < 60e3 ? 5 : r < 150e3 ? 4 : r < 450e3 ? 3 : r < 1200e3 ? 2 : 1;
    this.quiet += dt; if (this.quiet > 6) this.noto = Math.max(0, this.noto - 3 * dt);
    const nl = this.noto >= 88 ? 1 : this.noto >= 65 ? 2 : this.noto >= 40 ? 3 : this.noto >= 15 ? 4 : 5;
    const dc = FORCE || Math.min(fl, nl);
    if (dc !== this.defcon) {
      const up = dc < this.defcon; this.defcon = dc;
      if (up && this.t > 2) { this.sfx.klaxon(dc); if (dc <= 2) this.ctx.card(`DEFCON ${dc}`, dc === 1 ? 'the world answers with everything it has' : 'orbital weapons are armed'); this.news(['', 'DEFCON 1: the world answers with everything it has', 'DEFCON 2: orbital weapons are being armed', 'DEFCON 3: the World Defense Council authorises a nuclear response', 'DEFCON 4: air forces scrambled', ''][dc]); this.ctx.hint(`DEFCON ${dc}`); }
    }
    state.defcon = dc;
    // tension cycle (75 s): build 45 / peak 15 / relax 15 (§5.1); comeback and the lid relax it
    const ph = this.t % 75, phase = ph < 45 ? 'build' : ph < 60 ? 'peak' : 'relax', fl0 = this.floorR();
    this.phase = phase;
    const surge = hole.r < 0.85 * fl0 || (state.surge && hole.r < fl0);
    if (surge && !state.surge) { state.surge = true; this.stats.surge++; this.ctx.card('Hunger Surge', 'land in view grows you ×1.5'); this.news('The void is starving: hunger surge — every bite counts for more'); }
    if (state.surge && hole.r >= fl0) state.surge = false;
    const tier = P3.tier(r), calm = surge || this.seal, mul = calm ? 0 : phase === 'build' ? 1 : phase === 'peak' ? 2 : 0, hard = dc <= 2 ? 1 : 0, cap = calm ? 0 : T3.cap[phase] + (phase === 'relax' ? 0 : hard);
    this.budget = Math.min(14, this.budget + (T3.refill[0] + T3.refill[1] * (5 - dc)) * mul * dt);
    for (const k in this.cool) this.cool[k] -= dt;
    const grace = FORCE ? 3 : T3.grace;
    if (this.t < grace || this.eventsHold || !state.playing) return;
    if (!this.firstNuke && !FORCE && this.t < 70) { // the minute-one hook (A11): one ICBM aimed at the hole at any DEFCON, so the best moment in the game is guaranteed
      for (let i = 0; i < 20 && !this.sites.length; i++) this.makeSite();
      if (this.spawnNuke({ at: 'hole', first: true })) { this.firstNuke = true; this.ctx.hint('ICBM launched — dive into the inner circle to swallow it'); }
      return;
    }
    this.rivals?.direct(dt, tier);
    const live = this.liveCount(), cand = this.cand; cand.length = 0;
    for (const k of this.K) { // set pieces (the Aegis, the cracker) go first and alone; everything else competes for the budget
      if (!k.set || k.passive || this.cool[k.name] > 0 || !k.window(r, dc, this) || (k.can && !k.can())) continue;
      if (live === 0 && phase !== 'relax' && !calm && this.spawn(k.name)) return;
    }
    for (const k of this.K) if (k.friendly && this.cool[k.name] <= 0 && k.window(r, dc, this) && !calm) this.spawn(k.name); // (the sky's own life: rockets, stations; not budgeted)
    if (live >= cap) return;
    for (const k of this.K) if (!k.set && !k.passive && !k.friendly && this.cool[k.name] <= 0 && this.budget >= k.cost && k.window(r, dc, this) && (!k.can || k.can())) cand.push(k);
    if (!cand.length) return;
    let k = cand[Math.floor(Math.random() * cand.length)];
    if (cand.length > 1 && k.name === this.last) k = cand[(cand.indexOf(k) + 1) % cand.length];
    this.spawn(k.name);
  }

  spawn(kind, opts = {}) {
    const k = this.byName[kind]; if (!k) return false;
    const ok = k.spawn(opts);
    if (ok && !opts.force) { this.budget -= k.cost; this.cool[kind] = rnd(k.cool[0], k.cool[1]) * (kind === 'rod' ? 1 : T3.coolK[P3.tier(this.hole.r) - 1] ?? 1); this.last = kind; }
    if (ok) this.noteSeen();
    return ok;
  }
  /** A coastal unit (class >= 2) was torn off: its sea throws a wave (T1-T2). */
  coastTear(ev) { const v = this.W.bite.lf?.lv[ev.L]; if (v && v.np[ev.u] && v.coast[ev.u] / v.np[ev.u] > 0.5) this.byName.tsunami.at(ev.dir, { cause: 'coast' }); }
  noteSeen() { const S = this.stats; S.seen = (S.strafes > 0) + (S.nukes > 0) + (S.rods > 0) + (S.mirvs > 0) + (S.lasers > 0) + (S.fleets > 0) + (S.tsunamis > 0) + (S.volcanoes > 0) + (S.aegis > 0) + (S.rockets > 0) + (S.cracker > 0) + (S.rivals > 0); }

  /** The three Phase 3 kinds as table entries (their logic is below); the WP-B kinds are src/threat/*.js. */
  registerCore() {
    const T = T3.kinds, th = this;
    this.register({ name: 'bomber', cost: T.bomber.cost, cool: T.bomber.cool, cool0: 6, items: this.strafes, window: (r) => r < 450e3, spawn: (o) => th.spawnStrafe(o), step: (x, dt) => th.strafeStep(x, dt), finish: (x) => th.finishStrafe(x),
      age: (x) => x.age - x.tel,
      danger: (x, out) => { if (x.age < x.tel + x.run) {
        const hd = th.W.hdir, across = Math.asin(Math.max(-1, Math.min(1, hd.dot(x.n)))) * R; th.W.normalAt(x.n, v3); const ln = Math.hypot(v3.x, v3.z) || 1;
        out.push({ kind: 'line', id: `s${x.i}`, across, nx: v3.x / ln, nz: v3.z / ln, hw: x.hw, eta: Math.max(0, x.tel - x.age), end: x.tel + x.run - x.age, locked: true, lock: x.tel }); } },
      line: (x, pick) => { if (x.age < x.tel + x.run) pick(Math.max(0, x.tel - x.age), `AIR STRIKE · line ${KMs(2 * x.hw)} wide · <b>${Math.max(0, x.tel - x.age).toFixed(1)} s</b>`, x.age > x.tel * 0.5 ? 'lock' : ''); } });
    this.register({ name: 'nuke', cost: T.nuke.cost, cool: T.nuke.cool, cool0: 12, items: this.nukes, window: (r, dc) => r < 1200e3 && dc <= 3, can: () => th.sites.length > 0, spawn: (o) => th.spawnNuke(o), step: (x, dt) => th.nukeStep(x, dt), finish: (x) => th.finish(x),
      live: (x) => x.phase === 'fly' && !x.child, age: (x) => (x.phase === 'fly' ? x.age - x.T : x.age - x.boomT),
      danger: (x, out) => { if (x.phase === 'fly' && !x.mirv) { th.offsetOf(x.to, th._o ??= {}); out.push({ kind: 'nuke', id: `n${x.uid}`, x: th._o.x, z: th._o.z, R: x.B, inner: x.inner, eta: x.T - x.age, locked: x.locked, lock: x.lock }); } },
      line: (x, pick) => { if (x.phase === 'fly') { if (x.mirv) pick(x.splitAt - x.age + 2, `MIRV BUS · splits into ${T3.kinds.mirv.children} warheads in <b>${Math.max(0, x.splitAt - x.age).toFixed(1)} s</b>`, ''); else pick(x.T - x.age, `${x.child ? 'MIRV WARHEAD' : 'ICBM'} · <b>${KMs(x.B)}</b> blast · impact <b>${Math.max(0, x.T - x.age).toFixed(1)} s</b>${x.locked ? ' · LOCKED' : ''}`, x.locked ? 'lock' : ''); } } });
    const mk = this.register({ name: 'mirv', cost: T.mirv.cost, cool: T.mirv.cool, cool0: 60, items: this.nukes, step() {}, live: () => false, window: (r, dc) => r >= 150e3 && dc <= 2, can: () => th.sites.length > 0 && th.zonesFree() >= 4 && th.freeNukes() >= 5,
      spawn: (o) => { mk.t0 = th.t; return th.spawnNuke({ ...o, mirv: true }); }, age: () => th.t - mk.t0, finish() {} });
    this.register({ name: 'rod', cost: T.rod.cost, cool: T.rod.cool, cool0: 10, items: this.lances, window: (r, dc) => r >= 150e3 && dc <= 2, spawn: (o) => th.spawnLance(o), step: (x, dt) => th.lanceStep(x, dt), finish: (x) => th.finishLance(x),
      live: (x) => x.phase !== 'gone' && !x.past, age: (x) => x.age - x.Tfire,
      danger: (x, out) => {
        const o = th._o ??= {};
        if (x.phase === 'orbit' && x.Tfire - x.age < x.lock + 1.3) { th.offsetOf(x.to, o); out.push({ kind: 'rod', id: `l${x.uid}`, x: o.x, z: o.z, R: x.B, inner: x.inner, eta: x.Tfire - x.age, locked: x.locked, lock: x.lock }); }
        if (x.phase === 'orbit' && !x.eaten && th.hole.r >= 420e3 && x.gd < 8 * th.hole.r) { // a catchable satellite: its subpoint now and its ground velocity (m/s)
          const tt = x.th0 + x.om * x.age; th.offsetOf(v3.copy(x.pos).normalize(), o); const px = o.x, pz = o.z;
          th.satAt(x, tt + x.om, v4); th.offsetOf(v4.normalize(), o);
          out.push({ kind: 'sat', id: `t${x.uid}`, x: px, z: pz, vx: o.x - px, vz: o.z - pz, R: T3.satEat * th.hole.r, eta: x.Tfire - x.age, locked: false });
        } },
      line: (x, pick) => {
        if (x.phase === 'orbit' && x.Tfire - x.age < x.lock + 1.3) pick(x.Tfire - x.age, `ORBITAL LANCE · <b>${KMs(x.B)}</b> impact · <b>${Math.max(0, x.Tfire - x.age).toFixed(1)} s</b>${x.locked ? ' · LOCKED' : ''}`, x.locked ? 'lock' : '');
        if (x.phase === 'orbit' && !x.eaten && th.hole.r >= 420e3 && x.gd < 4 * th.hole.r) pick(x.Tfire - x.age + 3, 'SATELLITE OVERHEAD · swallow it for a bonus', 'good'); } });
  }

  freeNukes() { let n = 0; for (const q of this.nukes) if (!q.on) n++; return n; }
  /** The MIRV bus (a nuke item with `mirv`) splits at its apex into `children` warheads, each on its own ring 1.2-2 r around where the hole will be (docs B3). */
  splitMirv(p) {
    const { hole, W } = this, r = p.r0, M = T3.kinds.mirv, u = p.splitAt / p.T, salvo = { sum: 0, gulps: 0 };
    slerp(p.from, p.to, u, v5).normalize(); const hs = p.apex * 4 * u * (1 - u) + p.site.elev * W.E * (1 - u), base = rnd(0, 6.283);
    this.finish(p);
    this.surf(v5, hs, v1, 0); this.glow.spawn(v1, null, 3 * r, 7 * r, 0.9, C(0xff7ab8, 3), 1.6, 0); this.glow.spawn(v1, null, 4 * r, 5 * r, 0.14, FIRE[0], 3, 0);
    for (let i = 0; i < 4; i++) this.glow.spawn(v1, vel3(v5, rnd(-1, 1) * 2 * r, rnd(-1, 1) * 2 * r, rnd(-1, 1) * r, sv), 1.2 * r, 0.3 * r, 0.9, FIRE[1], 1.2, 1.2);
    let made = 0;
    for (let k = 0; k < M.children; k++) {
      const c = this.nukes.find((q) => !q.on && q.mush) ?? this.nukes.find((q) => !q.on), z = c ? this.zoneAlloc() : -1; if (!c || z < 0) { if (z >= 0) this.zoneFree(z); break; }
      const lock = this.lockFor(0.5, 2.0), a = base + k * 1.5708 + rnd(-0.35, 0.35), d = rnd(1.2, 2.0) * r;
      Object.assign(c, { child: true, mirv: false, salvo, hs, cx: Math.cos(a) * d, cz: Math.sin(a) * d, uid: ++this.uid, on: true, phase: 'fly', age: 0, r0: r, B: 1.0 * r, inner: 0.4 * r, lock, T: lock + 1.6 + 0.12 * k, locked: false, ox: 0, oz: 0, side: 1, off0: 0, ux: 0, uz: -1, boomT: 0, out: '', puffT: 0, ashT: 0, ashN: 0, elevT: 0, capT: 0, core: false, first: false, apex: 0, site: { elev: 0 }, pulled: false });
      c.from.copy(v5); c.to.copy(W.hdir); c.zone = z; c.hadZone = true;
      c.mk = this.map?.addMarker({ kind: 'nuke', from: c.from, dir: c.to, dur: c.T, eta: c.T, r: c.B, label: 'MIRV', color: '#ff3a8a' });
      made++;
    }
    this.sfx.mirvSplit?.(); this.trauma(0.2); this.screenFlash(0.2, '#ffd0ea', 260);
    this.news(`The MIRV bus splits: ${made} warheads, each on its own ring`); this.ctx.hint(`MIRV SPLIT — ${made} rings: slip between them, or dive into one`);
  }
  /** Swallowing 2+ of one salvo's warheads: the card. */
  mirvGulp(n) { const s = n.salvo; if (!s) return; this.stats.mirvGulps++; if (++s.gulps >= 2) { this.ctx.card('MIRV GULP', `${s.gulps} warheads swallowed: +${Math.round(T3.kinds.mirv.gulp * 100)}% each`); } }

  // ---------------------------------------------------------------- silo fields (edible launch sites)
  updateSites(dt) {
    const { hole, W } = this, r = hole.r;
    if ((this.siteT -= dt) <= 0 && this.sites.length < 3 && !this.disabled && r < 1500e3) { this.siteT = 14 + rnd(0, 8); this.makeSite(); }
    for (let i = this.sites.length - 1; i >= 0; i--) {
      const s = this.sites[i], d = W.distTo(s.dir);
      if (d < 0.8 * r) { this.eatSite(s); this.sites.splice(i, 1); continue; }
      if (d > 70 * r) { this.dropSite(s); this.sites.splice(i, 1); continue; }
      s.age += dt;
      if (d < 18 * r) { // the field: silos at readable size, a blinking launch light
        const k = r * 0.12 / 20; this.surf(s.dir, 0, v1, s.elev); // (silo model: 20 m wide, 9.5 m tall; P2-1: each is 0.12 r wide, the field about 0.6 r across, so a silo complex is no longer half the hole)
        const east = v3.crossVectors(_Y, s.dir).normalize(), north = v4.crossVectors(s.dir, east);
        s.mesh.parts.forEach((o, j) => {
          const a = j * 1.2566 + 0.3, rad = j ? 0.3 * r : 0;
          o.position.copy(v1).addScaledVector(east, Math.cos(a) * rad).addScaledVector(north, Math.sin(a) * rad); o.position.setLength(R + s.elev * W.E + 0);
          aim(o, east, s.dir, 'x'); o.scale.setScalar(k * (j ? 0.7 : 1)); o.visible = true;
        });
        if (Math.sin(s.age * 5) > 0.7 && Math.random() < 0.3) this.glow.spawn(v1, null, 0.5 * r, 0.7 * r, 0.35, FIRE[2], 0.9, 0);
      } else s.mesh.parts.forEach((o) => { o.visible = false; });
    }
    if (this.map) {
      for (const s of this.sites) if (!s.mk) s.mk = this.map.addMarker({ kind: 'site', dir: s.dir, label: 'SILOS', color: '#ff9f5d', pulse: true });
    }
  }
  makeSite() {
    const { hole, W } = this, r = hole.r, P = W.P;
    for (let k = 0; k < 40; k++) {
      const a = rnd(0, 6.283), dist = r * rnd(7, 24);
      const d = W.dirAt(Math.cos(a) * dist, Math.sin(a) * dist, new THREE.Vector3()), e = P.elevation(d, 4);
      if (e < 20 || e > 2200 || W.bite.remAt(d) < 0.9) continue;
      const cl = P.climate(d, e); if (cl.T < 0.28 || cl.T > 0.95) continue; // (habitable or arid land: no ice, no peaks)
      if (this.sites.some((s) => s.dir.angleTo(d) * R < 6 * r)) continue;
      const mesh = this.siteMesh.find((m) => !m.on); if (!mesh) return;
      mesh.on = true; this.sites.push({ dir: d, elev: e, age: 0, mesh, mk: null }); this.stats.sites++;
      return;
    }
  }
  dropSite(s) { s.mesh.on = false; s.mesh.parts.forEach((o) => { o.visible = false; }); s.mk?.remove(); }
  eatSite(s) {
    const { hole, state } = this, r = hole.r; this.dropSite(s);
    this.surf(s.dir, 0, v1, s.elev); this.glow.spawn(v1, null, 2 * r, 3 * r, 0.5, FIRE[1], 1.2, 0);
    for (let i = 0; i < 6; i++) { v2.copy(s.dir); this.smoke.spawn(v1, vel3(v2, rnd(-1, 1) * 0.3 * r, rnd(-1, 1) * 0.3 * r, rnd(0.2, 0.8) * r, sv), 0.5 * r, 1.2 * r, 3, SMOKE1, 0.6, 0.8); }
    this.gain(0.01, 'site'); state.belly = Math.min(1, state.belly + 0.05); this.sfx.tink?.();
    this.news('Silo field swallowed: its missiles never fly'); this.ctx.hint('Silo field swallowed');
  }

  // ---------------------------------------------------------------- ICBM nukes
  spawnNuke(o = {}) {
    const { hole, W } = this, r = hole.r, n = this.nukes.find((q) => !q.on); if (!n) return false;
    let site = null, best = 1e30;
    for (const s of this.sites) { const d = W.distTo(s.dir); if (d < 5 * r || d > 40 * r) continue; const sc = Math.abs(d - 14 * r) + Math.random() * 6 * r; if (sc < best) { best = sc; site = s; } }
    if (!site) return false;
    const lock = this.lockFor(0.8, 2.0);
    Object.assign(n, { child: false, mirv: false, hs: undefined, salvo: null, cx: 0, cz: 0, uid: ++this.uid, on: true, phase: 'fly', age: 0, r0: r, B: 1.4 * r, inner: 0.5 * r, lock, T: lock + rnd(3.4, 4.6), locked: false, ox: 0, oz: 0, side: Math.random() < 0.5 ? -1 : 1, off0: o.at === 'hole' ? 0 : 0.6 * r, ux: 0, uz: -1, boomT: 0, out: '', site, puffT: 0, ashT: 0, ashN: 0, elevT: 0, capT: 0, core: false, first: !!o.first });
    
    n.from.copy(site.dir); n.to.copy(W.hdir);
    n.chord = W.distTo(site.dir); n.apex = Math.min(1.5e6, 0.18 * n.chord + 0.5 * r);
    if (o.mirv) { Object.assign(n, { mirv: true, lock: 0.1, T: 8.6, splitAt: 4.7, B: 0, inner: 0, off0: 0 }); n.apex = Math.min(2.2e6, 0.3 * n.chord + 1.2 * r); n.zone = -1; n.hadZone = false; } // (the bus: no ring; it splits at 4.7 s)
    else { n.zone = this.zoneAlloc(); n.hadZone = n.zone >= 0; }
    n.mk = this.map?.addMarker({ kind: 'nuke', from: n.from, dir: n.to, dur: n.T, eta: n.T, r: n.mirv ? 1.5 * r : n.B, label: n.mirv ? 'MIRV' : 'ICBM', color: n.mirv ? '#ff3a8a' : '#ff5d5d' });
    if (n.mirv) this.stats.mirvs++; else this.stats.nukes++;
    this.sfx.nukeLaunch(Math.max(0.2, 1 - W.distTo(site.dir) / (40 * r)));
    if (n.mirv) { this.news('Launch detected: a MIRV bus leaves a silo field — it will split into warheads'); this.ctx.hint('MIRV launched — it splits over the horizon into four warheads'); }
    else { this.news('Launch detected: an ICBM leaves a silo field'); this.ctx.hint('ICBM launched — the ring is the blast: dive into the inner circle to swallow it'); }
    this.glow.spawn(this.surf(site.dir, 0, v1, site.elev), null, 1.4 * r, 4 * r, 1.1, FIRE[1], 1.6, 0);
    return true;
  }
  /** Ballistic point of nuke n at t (0..1): the great circle from the silo to the target, a parabola over it. */
  arcAt(n, t, out) {
    slerp(n.from, n.to, t, v3).normalize();
    { const sd = (this._sd ??= new THREE.Vector3()).crossVectors(n.from, n.to); if (sd.lengthSq() > 1e-12) v3.addScaledVector(sd.normalize(), 0.15 * Math.acos(Math.min(1, n.from.dot(n.to))) * 4 * t * (1 - t)).normalize(); } // (a lateral bias: from the T1 camera the arc reads as an arc, not a line toward you)
    const e0 = n.site.elev, e1 = n.elevT ?? 0, h = n.hs !== undefined ? n.hs * Math.pow(1 - t, 1.4) + e1 * this.W.E * t + n.r0 * 0.4 * t * t * t * t : (e0 * (1 - t) + e1 * t) * this.W.E + n.apex * 4 * t * (1 - t) + n.r0 * 0.4 * t * t * t * t; // (the last quarter drops to the airburst height)
    return out.copy(v3).multiplyScalar(R + h);
  }
  nukeStep(n, dt) {
    const { hole, W, state } = this;
    n.age += dt;
    const camP = this.camP;
    if (n.phase === 'fly') {
      if (n.mirv && n.age >= n.splitAt) { this.splitMirv(n); return; }
      const eta = n.T - n.age;
      if (eta > n.lock) { // tracking: the ring rides the spot the hole will reach, offset to the side so doing nothing is a hit and escaping or diving is a choice
        const sp = Math.hypot(hole.vx, hole.vz);
        if (sp > 0.05 * P3.speed(hole.r)) { n.ux = hole.vx / sp; n.uz = hole.vz / sp; }
        const wx = hole.vx * n.lock - n.uz * n.side * n.off0 + n.cx, wz = hole.vz * n.lock + n.ux * n.side * n.off0 + n.cz, k = Math.min(1, dt * 5);
        n.ox += (wx - n.ox) * k; n.oz += (wz - n.oz) * k;
        W.dirAt(n.ox, n.oz, n.to);
        n.elevT = Math.max(0, W.P.elevation(n.to, 3));
      } else if (!n.locked) { n.locked = true; n.lockAt = this.t; this.stats.locks++; this.sfx.lockBeep(); this.ctx.hint(`LOCKED — ${KMs(n.B)} blast: leave the ring, or dive into the inner circle`); }
      const lockP = n.locked ? Math.min(1, (n.lock - eta) / n.lock) + 0.001 : 0;
      this.zoneSet(n.zone, n.to, n.B, n.inner, Math.min(1, n.age * 1.5) * (n.locked ? 1 : 0.8), lockP, 0);
      if (n.mk) { n.mk.eta = eta; n.mk.r = n.B; }
      const u = n.age / n.T, th = Math.pow(u, 1.28), cd = this.game.camDist || R * 0.05, wA = cd * 0.0035;
      // the faint arc (the future), the contrail (the past), the missile
      let c = 0;
      for (let i = 0; i <= 47; i++) { const t = th + (1 - th) * (i / 47); this.arcAt(n, t, v1); n.arc.set(c++, v1, wA, 1.0, 0.32, 0.15, 0.28 * (i % 4 < 2 ? 1 : 0.4)); }
      n.arc.done(c, camP);
      c = 0; const span = Math.min(th, 0.3);
      for (let i = 0; i <= 27; i++) { const k = i / 27, t = th - span * (1 - k); this.arcAt(n, Math.max(0, t), v1); const f = Math.pow(k, 1.6); n.trail.set(c++, v1, cd * (0.0035 + 0.011 * f), 1.0 * f + 0.3, 0.6 * f + 0.25, 0.3 * f + 0.2, 0.9 * f * Math.min(1, n.age * 2)); }
      n.trail.done(c, camP);
      this.arcAt(n, th, n.pos); this.arcAt(n, Math.min(1, th + 0.01), v2); v2.sub(n.pos).normalize();
      aim(n.mis, v2, v4.copy(n.pos).normalize(), 'x'); n.mis.position.copy(n.pos); n.mis.scale.setScalar(cd * 0.03 / 35.3); n.mis.visible = true;
      if (n.age > 0.25) this.glow.spawn(n.pos, null, cd * 0.012, cd * 0.022, 0.2, FIRE[1], 1.3, 0); // the motor
      if (eta <= 0) this.detonate(n);
      return;
    }
    // after the boom: the mushroom, the fall into the well
    n.arc.hide(); n.trail.hide(); n.mis.visible = false;
    const m = n.mush, mt = n.age - n.boomT;
    if (!m) { // a light MIRV warhead: the fireball is spawned at the detonation; here a short smoke column
      if (n.out !== 'swallow' && mt < 2.6 && (n.puffT = (n.puffT ?? 0) - dt) <= 0) { n.puffT = 0.14; const r = n.r0; v1.copy(n.pg).setLength(R + n.elev * W.E + rnd(0.1, 1.8) * r); this.smoke.spawn(v1, vel3(v2.copy(n.to).normalize(), rnd(-0.1, 0.1) * r, rnd(-0.1, 0.1) * r, 0.2 * r, sv), 0.5 * r, 1.0 * r, 3.2, mt < 0.8 ? SMOKE1 : SMOKE0, 0.4, 0.5); }
      if (mt > (n.out === 'swallow' ? 1.0 : 3.4)) this.finish(n);
      return;
    }
    if (n.out === 'swallow') {
      const u = Math.min(1, Math.max(0, (mt - 0.28) / 1.0)), grow = Math.min(1, mt / 0.28), e = u * u * (3 - 2 * u), f = n.H * 0.62 * (0.35 + 0.65 * grow);
      v1.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); v2.lerpVectors(n.pg, v1, e * e);
      m.mesh.position.copy(v2); m.mesh.scale.set(f * (1 - 0.8 * e) * (1 + 0.3 * Math.sin(u * 9)), f * (1 - 2.3 * e), f * (1 - 0.8 * e) * (1 + 0.3 * Math.sin(u * 9)));
      m.mesh.quaternion.copy(n.qUp).multiply(qa.setFromAxisAngle(_Y, u * 14));
      { const U = m.mat.userData; U.uA.value = 1 - 0.3 * u; U.uHeat.value = 1 - 0.4 * u; U.uAge.value = 0.5 + 2.2 * Math.min(1, mt / 0.6); U.uS.value = 1; U.uTint.value = Math.min(1, u * 1.6); } // (swallowed: the young cloud turns lilac and is sucked down)
      m.mesh.visible = u < 1;
      if (mt > 0.3 && mt < 1.3 && Math.random() < 0.5) { v3.copy(W.hdir).multiplyScalar(R + 200); this.glow.spawn(v2, null, 0.5 * n.r0, 0.1 * n.r0, 0.4, C(0xb58cff, 3), 0.9, 0); }
      if (mt > 1.4) this.finish(n);
      return;
    }
    // a real airburst: the volume (src/threat/blast.js) is the fireball, the rising cap and its own dissolve; here its clock, the dust skirt, the embers and the ash column
    const r = n.r0, up = v3.copy(n.to).normalize();
    { const U = m.mat.userData, sc = cloudScale(mt); m.mesh.scale.setScalar(n.H * sc); U.uS.value = sc; } m.mesh.position.copy(n.pg);
    { const U = m.mat.userData; U.uAge.value = mt; U.uA.value = 1 - smooth(11, 19, mt); U.uHeat.value = 1; U.uTint.value = 0; }
    if (mt < 3.4 && (n.ringT = (n.ringT ?? 0) - dt) <= 0) { // the ground-scouring skirt rides the shock front: a ring of dust that rolls out with the dome
      n.ringT = 0.07; const rad = 0.3 * n.B + 0.8 * r * mt;
      for (let i = 0; i < 4; i++) { const an = rnd(0, 6.283), tg = tangentAt(up, an, v4); v1.copy(n.pg).setLength(R + n.elev * W.E + 0.04 * r).addScaledVector(tg, rad); this.smoke.spawn(v1, sv.copy(tg).multiplyScalar(0.55 * r).addScaledVector(up, 0.05 * r), 0.55 * r, 1.3 * r, 4.2, DUST, 0.55 * (1 - mt / 3.6), 0.5); }
    }
    if (mt > 2.2 && mt < 12 && n.ashN < 26 && (n.ashT = (n.ashT ?? 0) - dt) <= 0) { // (the ash plume drifts downwind from the cap)
      n.ashT = 0.28; n.ashN++; const w = tangentAt(up, 1.9, v2);
      v1.copy(n.pg).setLength(R + n.elev * W.E + n.H * rnd(0.5, 0.95)); this.smoke.spawn(v1, sv.copy(w).multiplyScalar(0.35 * r).addScaledVector(up, 0.04 * r), 0.7 * r, 1.8 * r, 12, ASH, 0.3, 0.2);
    }
    if (mt > 1.6 && mt < 24 && (n.emT = (n.emT ?? 0) - dt) <= 0) { // the scar burns: embers flicker over the wound, and a thin ash column keeps rising off it
      n.emT = 0.22; const an = rnd(0, 6.283), tg = tangentAt(up, an, v4);
      v1.copy(n.pg).setLength(R + n.elev * W.E + 0.04 * r).addScaledVector(tg, rnd(0.1, 1.0) * n.B); this.glow.spawn(v1, null, 0.14 * r, 0.3 * r, rnd(0.8, 1.6), FIRE[Math.random() < 0.5 ? 2 : 3], 0.9, 0);
      if (mt > 4) { v1.copy(n.pg).setLength(R + n.elev * W.E + 0.2 * r); this.smoke.spawn(v1, vel3(up, rnd(-0.03, 0.03) * r, rnd(-0.03, 0.03) * r, 0.22 * r, sv), 0.3 * r, 1.3 * r, 8, mt < 12 ? SMOKE0 : ASH, 0.3 * (1 - smooth(14, 24, mt)), 0.1); }
    }
    if (mt > 26) this.finish(n);
  }
  /** A ground shock dome at planet dir `d` (elev in unit heights): starts at radius r0 (m) and grows `speed` m/s up to rMax, fading as it nears it. */
  dome(d, elev, r0, speed, rMax, hot = 1) {
    let q = this.domes[0]; for (const o of this.domes) if (o.t >= o.life) { q = o; break; } else if (o.t > q.t) q = o; // (a free one, else the oldest)
    q.t = 0; q.life = (rMax - r0) / speed + 0.5; q.r0 = r0; q.speed = speed; q.rMax = rMax; this.surf(d, 0, q.mesh.position, elev); q.up.copy(d).normalize();
    q.mesh.quaternion.setFromUnitVectors(_Y, q.up); q.mat.userData.uHot.value = hot; q.mesh.visible = true;
  }
  domeStep(dt) {
    for (const q of this.domes) {
      if (!q.mesh.visible) continue; q.t += dt;
      if (q.t >= q.life) { q.mesh.visible = false; continue; }
      const rad = Math.min(q.rMax, q.r0 + q.speed * q.t), k = q.t / q.life; q.mesh.scale.set(rad, rad * 0.2, rad);
      q.mat.userData.uA.value = Math.min(1, q.t * 14) * (1 - k) * (1 - k) * (0.4 + 0.6 * (1 - rad / q.rMax * 0.5));
    }
  }
  /** Warm light thrown over the land around a blast (two slots in the planet shader): dir, radius (m), intensity, life (s). */
  light(d, radM, I, life) {
    const q = this.lights[this.lights[0].t > this.lights[1].t ? 0 : 1]; q.dir.copy(d).normalize(); q.rad = radM / R; q.I = I; q.life = life; q.t = 0;
  }
  /** The flash of a blast on the picture (post.fxu): a white-out added in HDR (bloom bursts), a warm grade that fades slowly, a bloom boost; k 0..1 by nearness. */
  fxBlast(k) { const f = this.fx; f.w = Math.max(f.w, 0.1 + 0.28 * k); f.warm = Math.max(f.warm, 0.3 + 0.45 * k); f.bloom = Math.max(f.bloom, 0.25 + 0.55 * k); }
  fxStep(dt) {
    const f = this.fx, u = this.W.globe.u;
    f.w *= Math.exp(-dt * 3.6); f.warm *= Math.exp(-dt * 0.32); f.bloom *= Math.exp(-dt * 1.8);
    if (this.ctx.post?.fxu) this.ctx.post.fxu.value.set(f.w < 0.003 ? 0 : f.w, f.warm < 0.003 ? 0 : f.warm, f.bloom < 0.003 ? 0 : f.bloom, 0);
    for (let i = 0; i < 2; i++) {
      const q = this.lights[i]; q.t += dt;
      const k = q.t < q.life ? Math.exp(-q.t * 0.5) * (1 - smooth(q.life * 0.6, q.life, q.t)) * Math.min(1, q.t * 20 + 0.3) : 0;
      u.uBlast[i].value.set(q.dir.x, q.dir.y, q.dir.z, q.rad); u.uBlastP[i].value.x = q.I * k;
    }
  }

  /** The warhead goes off (or falls into the void). */
  detonate(n) {
    const { hole, W, state } = this, r = n.r0, dist = W.distTo(n.to);
    n.phase = 'burn'; n.boomT = n.age; n.ashN = 0; n.elev = Math.max(0, W.P.elevation(n.to, 3)); n.H = (n.child ? 2.0 : 3.2) * r;
    n.pg = this.surf(n.to, 0, new THREE.Vector3(), n.elev); n.qUp = n.qUp ?? new THREE.Quaternion();
    n.qUp.setFromUnitVectors(_Y, v1.copy(n.to).normalize());
    n.zone >= 0 && this.zoneFree(n.zone); n.zone = -1; n.mk?.remove(); n.mk = null;
    if (n.mush) { n.mush.mesh.position.copy(n.pg); n.mush.mesh.quaternion.copy(n.qUp); { const sc = cloudScale(0); n.mush.mesh.scale.setScalar(n.H * sc); n.mush.mat.userData.uS.value = sc; } n.mush.mesh.visible = true; { const U = n.mush.mat.userData; U.uA.value = 1; U.uHeat.value = 1; U.uAge.value = 0; U.uTint.value = 0; } }
    const delay = Math.min(1.2, dist / (12 * r));
    if (dist < n.inner) return this.swallowNuke(n, dist);
    n.out = dist < n.B ? 'hit' : 'miss';
    if (!n.child && !n.first && r < 450e3 && W.bite.landAt(n.to) < 0) this.byName.tsunami.at(n.to, { cause: 'nuke' }); // (a blast over the sea throws up a wave)
    // layered detonation (docs 12.12): the flash (HDR white-out in the post pass, a hot sprite) -> the volume (fireball -> rising vortex cap, src/threat/blast.js) -> the shock dome and its dust skirt -> warm light over the land -> scorch, embers, an ash column
    v2.copy(n.pg).setLength(R + n.elev * W.E + 0.3 * n.B);
    const fk = n.child ? 0.5 : 1; // (a MIRV warhead: half the flash and fireball; four of them at once would white the screen out)
    this.glow.spawn(v2, null, 3.5 * r * fk, 4.5 * r * fk, 0.12, FIRE[0], 3.2 * (n.child ? 0.7 : 1), 0);
    if (!n.mush) { // (the light MIRV warheads have no volume: sprites carry their fireball)
      this.glow.spawn(v2, null, 0.5 * n.B * fk, 2.4 * n.B * fk, 0.8, FIRE[1], 2.0, 0.3); this.glow.spawn(v2, null, 0.3 * n.B * fk, 1.7 * n.B * fk, 1.4, FIRE[2], 1.6, 0.3);
    }
    this.dome(n.to, n.elev, 0.3 * n.B, 0.8 * r, 2.0 * n.B, n.child ? 0.5 : 1);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283 + rnd(0, 0.4), tg = tangentAt(v3.copy(n.to).normalize(), a, v4); v1.copy(n.pg).setLength(R + n.elev * W.E + 0.05 * r).addScaledVector(tg, 0.2 * n.B); this.smoke.spawn(v1, sv.copy(tg).multiplyScalar(0.8 * r).addScaledVector(v3, 0.05 * r), 0.6 * r, 1.4 * r, 4.5, DUST, 0.6, 0.45); } // (the rolling base ring)
    this.light(n.to, (n.child ? 4 : 7) * r, n.child ? 0.8 : 1.4, 7);
    this.scar(n.to, 2.0 * n.B, 0.8 * r, 14, 0);
    this.scar(n.to, 1.2 * n.B, 0.2 * r, 90, 0); // (the scorch stays: its ring is short)
    if (!n.child) { this.fall.push({ dir: n.to.clone(), R: 2 * r, t: 0, life: T3.falloutLife, zone: this.zoneAlloc() }); if (this.fall.length > 2) { const o = this.fall.shift(); this.zoneFree(o.zone); } }
    const near = Math.max(0.12, 1 - dist / (8 * r));
    this.sfx.nukeBoom(Math.min(1, (n.child ? 0.35 : 0.5) + 0.5 * near), delay, this.pan(n.to));
    this.fxBlast((n.child ? 0.35 : 1) * near); this.screenFlash((n.child ? 0.05 : 0.08) + 0.2 * near, '#fff4dc', 260);
    this.trauma((n.child ? 0.1 : 0.2) + 0.4 * near);
    if (n.out === 'hit') {
      const M = T3.kinds.mirv, room = n.child ? Math.max(0, M.cap - n.salvo.sum) : 0.25, fa = n.hadZone && n.locked ? this.t - n.lockAt : -1;
      const got = room > 0.003 ? this.hurt(n.child ? M.hit : T3.nukeHit, n.child ? 'MIRV warhead!' : 'Nuclear airburst!', n.child ? 'mirv' : 'nuke', n.first ? 0 : n.child ? M.k : T3.nukeK, n.first ? T3.firstHit : room, fa, n.to) : 0;
      if (n.child) { n.salvo.sum += got; if (!got) { this.stats.near++; } } this.notice(6); this.news('An ICBM detonates over the void: the blast rim scorches it'); }
    else this.news('An ICBM detonates harmlessly — you slipped the ring');
  }
  /** THE moment: the warhead drops into the well, the mushroom inverts and is sucked down; a lilac ring, a choir, Frenzy. */
  swallowNuke(n, dist) {
    const { hole, W, state } = this, r = n.r0;
    n.out = 'swallow'; this.stats.swallowed++; state.nukesSwallowed = (state.nukesSwallowed || 0) + 1;
    v1.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E + 0.1 * r);
    this.glow.spawn(v1, null, 5 * r, 6 * r, 0.16, C(0xf0e4ff, 3.4), 3.2, 0); // the white flash inside the well
    this.glow.spawn(v1, null, 1.6 * r, 3.6 * r, 0.9, C(0xa070ff, 2.4), 1.8, 0.2);
    this.scar(W.hdir, 5.5 * r, 3.8 * r, 3, 2); hole.shockwave(); W.shock(W.hdir, 0.6 * r / R, 1.8 * r / R, 1.1, 1);
    for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283; v2.copy(v1).addScaledVector(tangentAt(W.hdir, a, v3), 1.1 * r); this.glow.spawn(v2, null, 0.3 * r, 0.08 * r, 0.7, C(0xc9a8ff, 2.4), 1.0, 1.5); }
    this.sfx.reverseGulp(); this.screenFlash(0.7, '#e8dcff', 420);
    state.hitstop = Math.max(state.hitstop || 0, 0.15); state.slowmo = 0.5; state.slowT = 0.6 * 0.5 + 0.3; this.trauma(0.5);
    this.gain(n.child ? T3.kinds.mirv.gulp : T3.nukeGulp, n.child ? 'mirvGulp' : 'nukeGulp'); state.belly = Math.min(1, state.belly + 0.25);
    state.frenzy = 6; this.notice(10);
    this.ctx.card('NUKE SWALLOWED', 'the void eats the bomb: Frenzy'); this.news('The void swallowed an ICBM whole'); this.ctx.hint('FRENZY — speed up, bite deeper');
    n.pulled = true; if (n.child) this.mirvGulp(n);
  }
  finish(n) { n.on = false; if (n.mush) n.mush.mesh.visible = false; n.mis.visible = false; n.arc.hide(); n.trail.hide(); if (n.zone >= 0) this.zoneFree(n.zone); n.zone = -1; n.mk?.remove(); n.mk = null; }

  // ---------------------------------------------------------------- fallout
  updateFallout(dt) {
    const { W, hole, state } = this; let inside = false;
    for (let i = this.fall.length - 1; i >= 0; i--) {
      const f = this.fall[i]; f.t += dt;
      if (f.t > f.life) { this.zoneFree(f.zone); this.fall.splice(i, 1); continue; }
      const a = Math.min(1, f.t * 1.5) * (1 - smooth(f.life - 6, f.life, f.t)) * 0.8;
      this.zoneSet(f.zone, f.dir, f.R, 0, a, 0, 1);
      if (W.distTo(f.dir) < f.R + 0.3 * hole.r) inside = true;
      if (!f.mk && this.map) f.mk = this.map.addMarker({ kind: 'ring', dir: f.dir, r: f.R, color: '#c8e04a', label: 'FALLOUT' });
      if (f.mk) f.mk.r = f.R;
    }
    for (const f of this.fall) if (f.t > f.life - 0.01 && f.mk) { f.mk.remove(); f.mk = null; }
    if (inside && !state.fallout) this.ctx.hint('Fallout: hunger ×1.8, land counts ×0.5 — leave the zone');
    state.fallout = inside;
  }

  // ---------------------------------------------------------------- kinetic lances ("rods from god")
  spawnLance(o = {}) {
    const { hole, W } = this, r = hole.r, l = this.lances.find((q) => !q.on); if (!l) return false;
    const lock = this.lockFor(0.5, 2.0), Tfire = Math.max(12, lock + 3.2), om = 0.034; // (12 s in orbit: a satellite 1.5-2.5 r to the side is a 5-9 s detour at the hole's speed)
    Object.assign(l, { uid: ++this.uid, on: true, phase: 'orbit', age: 0, r0: r, B: 1.0 * r, inner: 0.3 * r, lock, Tfire, om, th0: -om * Tfire, locked: false, past: false, ox: 0, oz: 0, side: Math.random() < 0.5 ? -1 : 1, off0: o.at === 'hole' ? 0 : 0.55 * r, ux: 0, uz: -1, rodT: -1, eaten: 0, alt: Math.max(260e3, 0.8 * r), out: '' });
    // the orbit plane holds the hole's position and the screen's top: the satellite comes down the frame toward you
    // the ground track runs 1.5-2.5 r to the side of the hole (A8): swallowing the satellite is a detour, not a free ride; the designator still aims at the hole
    const br = rnd(-0.9, 0.9), ox = l.side * rnd(1.5, 2.5) * r; W.dirAt(ox, 0, l.a); W.dirAt(ox + Math.sin(br) * 2e4, -Math.cos(br) * 2e4, v1); v1.addScaledVector(l.a, -v1.dot(l.a)).normalize();
    l.b.copy(v1).negate(); l.n.crossVectors(l.a, l.b).normalize(); l.to.copy(W.hdir); l.gd = 9;
    l.zone = this.zoneAlloc(); l.hadZone = l.zone >= 0;
    l.mk = this.map?.addMarker({ kind: 'sat', dir: l.a, track: l.n, label: 'LANCE', color: '#9fe8ff' });
    this.stats.rods++; this.news('A kinetic-strike satellite swings into position'); this.ctx.hint(`Orbital strike incoming — ${KMs(l.B)} impact zone`);
    return true;
  }
  satAt(l, th, out) { return out.copy(l.a).multiplyScalar(Math.cos(th)).addScaledVector(l.b, Math.sin(th)).setLength(R + l.alt); }
  lanceStep(l, dt) {
    const { hole, W, state } = this, camP = this.camP, cd = this.game.camDist || R * 0.05;
    l.age += dt;
    const th = l.th0 + l.om * l.age;
    if (l.phase === 'eaten') { // the satellite spirals into the well
      const u = Math.min(1, (l.age - l.eatT) / 0.9), e = u * u;
      v1.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); l.sat.position.lerpVectors(l.pos, v1, e); l.sat.scale.setScalar(cd * 0.05 / 42 * (1 - 0.92 * e)); l.sat.rotateZ(dt * 9);
      l.orbit.hide(); if (u >= 1) this.finishLance(l);
      return;
    }
    if (l.phase === 'orbit') {
      this.satAt(l, th, l.pos);
      const eta = l.Tfire - l.age;
      // eat the satellite (r > 420 km) as it passes overhead
      v3.copy(l.pos).normalize(); const gd = l.gd = W.distTo(v3);
      if (hole.r >= 420e3 && gd < T3.satEat * hole.r && !l.eaten) { this.eatSat(l); return; }
      if (eta < l.lock + 1.3) { // designator: tracking, then locked
        if (eta > l.lock) {
          const sp = Math.hypot(hole.vx, hole.vz); if (sp > 0.05 * P3.speed(hole.r)) { l.ux = hole.vx / sp; l.uz = hole.vz / sp; }
          const wx = hole.vx * l.lock - l.uz * l.side * l.off0, wz = hole.vz * l.lock + l.ux * l.side * l.off0, k = Math.min(1, dt * 5);
          l.ox += (wx - l.ox) * k; l.oz += (wz - l.oz) * k; W.dirAt(l.ox, l.oz, l.to);
        } else if (!l.locked) { l.locked = true; l.lockAt = this.t; this.stats.locks++; this.sfx.lockBeep(); this.ctx.hint(`LOCKED — ${KMs(l.B)} impact: leave the ring, or dive into the inner circle`); }
        const lockP = l.locked ? Math.min(1, (l.lock - eta) / l.lock) + 0.001 : 0;
        this.zoneSet(l.zone, l.to, l.B, l.inner, Math.min(1, (l.lock + 1.3 - eta) * 2) * (l.locked ? 1 : 0.8), lockP, 0);
        l.elev = Math.max(0, W.P.elevation(l.to, 3)); this.surf(l.to, 0, v1, l.elev);
        // the red designator: sat -> ground; thin while tracking, a hard bright line once locked
        const w = cd * (l.locked ? 0.0042 : 0.0022), a = l.locked ? 1.0 : 0.55 + 0.25 * Math.sin(l.age * 20);
        for (let i = 0; i < 10; i++) { v2.lerpVectors(l.pos, v1, i / 9); l.beam.set(i, v2, w, 1.0, l.locked ? 0.1 : 0.2, 0.08, a); }
        l.beam.done(10, camP);
        if (l.mk) { l.mk.eta = eta; }
      } else l.beam.hide();
      this.placeSat(l, th, cd);
      this.orbitRibbon(l, th, cd, camP);
      if (eta <= 0) this.fireRod(l);
      return;
    }
    this.satAt(l, th, l.pos); this.placeSat(l, th, cd); this.orbitRibbon(l, th, cd, camP);
    if (l.phase === 'rod') {
      l.rodT += dt; const p = Math.min(1, l.rodT / 0.34), e = p * p;
      l.elev = Math.max(0, W.P.elevation(l.to, 3)); this.surf(l.to, 0, v1, l.elev);
      v4.copy(v1); if (l.out === 'swallow') { v5.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); v4.lerp(v5, smooth(0.5, 1, p)); }
      let c = 0;
      for (let i = 0; i <= 13; i++) { const k = i / 13, pp = Math.max(0, e - 0.4 * (1 - k)); v2.lerpVectors(l.satFire, v4, pp); if (l.out === 'swallow') { v3.copy(v2).normalize().multiplyScalar(0); } l.rod.set(c++, v2, cd * (0.002 + 0.0055 * k), 1.0 * (0.4 + 2.2 * k), 0.8 * (0.2 + 1.6 * k * k), 0.5 * (0.1 + 1.2 * k * k * k), 0.95 * (0.15 + 0.85 * k)); }
      l.rod.done(c, camP);
      v2.lerpVectors(l.satFire, v4, e); this.glow.spawn(v2, null, cd * 0.05, cd * 0.07, 0.12, FIRE[0], 2.4, 0);
      l.beam.hide();
      if (p >= 1) this.rodImpact(l);
    } else if (l.phase === 'gone') { l.rod.hide(); }
    if (l.rodT > 0.34 && l.rodT < 0.7) l.rod.hide();
    if (th > 0.4) this.finishLance(l);
  }
  placeSat(l, th, cd) {
    this.satAt(l, th, v1); v2.copy(l.a).multiplyScalar(-Math.sin(th)).addScaledVector(l.b, Math.cos(th)).normalize();
    aim(l.sat, v2, v3.copy(v1).normalize(), 'z'); l.sat.position.copy(v1); l.sat.scale.setScalar(cd * 0.05 / 42); l.sat.visible = true;
    if ((l.sparkT = (l.sparkT ?? 0) - 0.016) < 0) { l.sparkT = 0.5; this.glow.spawn(v1, null, cd * 0.012, cd * 0.02, 0.6, C(0x9fe8ff, 2), 1.2, 0); }
  }
  orbitRibbon(l, th, cd, camP) {
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * 6.2832, d = a - th, dd = Math.atan2(Math.sin(d), Math.cos(d)); v1.copy(l.a).multiplyScalar(Math.cos(a)).addScaledVector(l.b, Math.sin(a)).setLength(R + l.alt); const f = 0.012 + 0.5 * Math.exp(-(dd * dd) / 0.05); l.orbit.set(i, v1, cd * 0.0011, 0.45, 0.85, 1.0, f); }
    l.orbit.done(97, camP);
  }
  /** Stereo position (-0.85..0.85) of a planet direction: its screen x, for the booms. */
  pan(dir) { const p = this.W.renderPos(dir, 0, this._pv ??= new THREE.Vector3()).project(this.ctx.camera); return Math.max(-0.85, Math.min(0.85, p.x * 0.8)); }
  fireRod(l) {
    const { W, hole } = this, dist = W.distTo(l.to);
    l.phase = 'rod'; l.rodT = 0; l.satFire = l.pos.clone(); l.out = dist < l.inner ? 'swallow' : dist < l.B ? 'hit' : 'miss';
    l.mk?.remove(); l.mk = null; l.beam.hide();
    this.sfx.rodStrike(0.8, 0.34 + Math.min(1.2, dist / (12 * l.r0)), this.pan(l.to));
  }
  rodImpact(l) {
    const { W, hole, state } = this, r = l.r0, dist = W.distTo(l.to), cd = this.game.camDist || 1;
    l.phase = 'gone'; l.rod.hide(); if (l.zone >= 0) this.zoneFree(l.zone); l.zone = -1; l.past = true;
    if (l.out === 'swallow' && dist < l.inner * 1.6) {
      this.stats.rodGulps++; v1.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E + 0.1 * r);
      this.glow.spawn(v1, null, 3 * r, 4 * r, 0.14, C(0xf0e4ff, 3), 3, 0); this.glow.spawn(v1, null, 1.2 * r, 2.8 * r, 0.7, C(0xa070ff, 2.2), 1.6, 0.2);
      this.scar(W.hdir, 3.4 * r, 3.2 * r, 3, 2); hole.shockwave(); this.sfx.tink(); this.sfx.choir(0.5); this.screenFlash(0.45, '#e8dcff', 320);
      state.hitstop = Math.max(state.hitstop || 0, 0.12); this.trauma(0.3); this.gain(T3.rodGulp, 'rodGulp'); state.belly = Math.min(1, state.belly + 0.15); state.frenzy = 6;
      this.ctx.card('ROD CAUGHT', 'the void swallowed a lance: Frenzy'); this.news('The void swallowed an orbital rod'); this.notice(6);
      return;
    }
    l.out = dist < l.B ? 'hit' : 'miss';
    this.surf(l.to, 0, v1, l.elev); const hi = v2.copy(v1).setLength(R + l.elev * W.E + 0.3 * r);
    this.glow.spawn(hi, null, 3 * r, 4 * r, 0.12, FIRE[0], 3.4, 0); this.glow.spawn(hi, null, 0.4 * r, 2.4 * r, 0.6, FIRE[1], 2.2, 0.3); this.glow.spawn(hi, null, 0.3 * r, 1.6 * r, 1.2, FIRE[2], 1.6, 0.3);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283 + rnd(0, 0.4), tg = tangentAt(v3.copy(l.to).normalize(), a, v4); this.smoke.spawn(v1, sv.copy(tg).multiplyScalar(1.4 * r).addScaledVector(v3, 0.1 * r), 0.5 * r, 1.3 * r, 3.5, DUST, 0.65, 0.6); }
    for (let i = 0; i < 7; i++) { v3.copy(v1).setLength(R + l.elev * W.E + r * (0.2 + i * 0.35)); this.smoke.spawn(v3, vel3(v2.copy(l.to).normalize(), rnd(-0.2, 0.2) * r, rnd(-0.2, 0.2) * r, 0.12 * r, sv), 0.7 * r, 1.4 * r, 5, i < 3 ? SMOKE0 : ASH, 0.5, 0.5); }
    this.scar(l.to, 1.6 * r, 3.0 * r, 14, 1); this.scar(l.to, 0.9 * r, 0.2 * r, 80, 1);
    this.dome(l.to, l.elev, 0.3 * r, 3.0 * r, 1.8 * r, 1); this.light(l.to, 5 * r, 1.0, 5); this.fxBlast(Math.max(0.12, 1 - dist / (8 * r)) * 0.8); // (the rod: a flat white dome out of the crater, the same family as the nuke)
    for (let q = 0; q < 3; q++) { v4.copy(v1).setLength(R + l.elev * W.E + r * (0.3 + q * 0.6)); this.glow.spawn(v4, null, 0.8 * r, 2.0 * r, 0.5 + 0.2 * q, FIRE[1 + (q > 0)], 1.4, 0); }
    const near = Math.max(0.12, 1 - dist / (8 * r)); this.sfx.nukeBoom(0.35 + 0.4 * near, Math.min(1.2, dist / (12 * r)), this.pan(l.to)); this.screenFlash(0.04 + 0.12 * near, '#fff', 220); this.trauma(0.2 + 0.4 * near);
    if (l.out === 'hit') { this.hurt(T3.rodHit, 'Orbital strike!', 'rod', T3.rodK, 0.25, l.hadZone && l.locked ? this.t - l.lockAt : -1, l.to); this.notice(5); }
  }
  eatSat(l) {
    const { hole, state } = this, r = hole.r; l.eaten = 1; l.phase = 'eaten'; l.eatT = l.age; this.stats.sats++;
    if (l.zone >= 0) this.zoneFree(l.zone); l.zone = -1; l.beam.hide(); l.mk?.remove(); l.mk = null; l.past = true;
    this.glow.spawn(l.pos, null, 0.3 * r, 1.4 * r, 0.5, C(0xdff6ff, 3), 1.6, 0); this.sfx.tink(); state.hitstop = Math.max(state.hitstop || 0, 0.08); this.trauma(0.15);
    this.gain(T3.satGulp, 'sat'); state.belly = Math.min(1, state.belly + 0.1);
    this.news('The void swallows a kinetic-strike satellite as it passes overhead'); this.ctx.hint('Satellite swallowed'); this.notice(4);
  }
  finishLance(l) { l.on = false; l.sat.visible = false; l.orbit.hide(); l.beam.hide(); l.rod.hide(); if (l.zone >= 0) this.zoneFree(l.zone); l.zone = -1; l.mk?.remove(); l.mk = null; }

  // ---------------------------------------------------------------- bomber wings (T1-T2): a strafe line across the view, then a carpet of blasts
  spawnStrafe(o = {}) {
    const { hole, W } = this, r = hole.r, s = this.strafes.find((q) => !q.on); if (!s) return false;
    const tel = this.lockFor(1.1, 2.6), run = 3.0, sp = Math.hypot(hole.vx, hole.vz), vang = sp > 1 ? Math.atan2(hole.vx, -hole.vz) : rnd(0, 6.283), brg = vang + (Math.random() < 0.5 ? 1 : -1) * rnd(1.0, 1.9);
    const lead = Math.min(tel + run * 0.5, 4.5), cx = hole.vx * lead + rnd(-0.3, 0.3) * r, cz = hole.vz * lead + rnd(-0.3, 0.3) * r, step = Math.max(2e4, 0.3 * r);
    const c = W.dirAt(cx, cz, new THREE.Vector3()), c2 = W.dirAt(cx + Math.sin(brg) * step, cz - Math.cos(brg) * step, v1);
    const t = v2.copy(c2).addScaledVector(c, -c2.dot(c)).normalize(), len = 12 * r, h = len / 2 / R; // (the line's heading at its centre, as seen from the hole)
    Object.assign(s, { on: true, age: 0, tel, run, r0: r, hw: 1.1 * r, len, hit: false, bombT: 0, horn: false });
    s.c = c; s.e1 = new THREE.Vector3().copy(c).multiplyScalar(Math.cos(h)).addScaledVector(t, -Math.sin(h)); s.e2 = new THREE.Vector3().copy(c).multiplyScalar(Math.sin(h)).addScaledVector(t, Math.cos(h)); s.n = new THREE.Vector3().crossVectors(s.e1, s.e2).normalize();
    s.mk = this.map?.addMarker({ kind: 'ring', dir: c, r: len / 2, label: 'AIR STRIKE', color: '#ffb04a', eta: tel });
    this.stats.strafes++; this.sfx.klaxon(5); this.news('Bomber wings scramble: carpet bombing along the line'); this.ctx.hint('AIR STRIKE — get off the line');
    return true;
  }
  strafeStep(s, dt) {
    const { hole, W } = this, r = s.r0, u = W.globe.u; s.age += dt;
    const lockP = s.age > s.tel * 0.5 ? Math.min(1, (s.age - s.tel * 0.5) / (s.tel * 0.5)) + 0.001 : 0, head = s.age > s.tel ? Math.min(1, (s.age - s.tel) / s.run) : 0;
    u.uStrafe.value.set(s.n.x, s.n.y, s.n.z, s.hw / R); u.uStrafeA.value.set(s.e1.x, s.e1.y, s.e1.z, s.len / R);
    u.uStrafeP.value.set(Math.min(1, s.age * 2) * (1 - smooth(s.tel + s.run + 0.2, s.tel + s.run + 1.6, s.age)), head > 0 ? head + 1e-4 : 0, lockP, 0);
    if (s.mk) s.mk.eta = Math.max(0, s.tel - s.age);
    if (s.age > s.tel - 0.6 && !s.horn) { s.horn = true; this.sfx.strafe(); }
    const angPer = s.len / R; // the wings: in from 4 r before the line, across it in `run` s
    if (s.age > s.tel - 1.0 && s.age < s.tel + s.run + 0.8) {
      const a0 = ((s.age - s.tel) / s.run) * angPer;
      s.jets.forEach((o, j) => {
        const ang = a0 - (j === 1 ? 0 : 0.05 * angPer), lat = (j - 1) * 0.55 * s.hw;
        v1.copy(s.e1).multiplyScalar(Math.cos(ang)).addScaledVector(s.e2, Math.sin(ang)).addScaledVector(s.n, lat / R).normalize();
        v2.copy(s.e1).multiplyScalar(-Math.sin(ang)).addScaledVector(s.e2, Math.cos(ang)).normalize();
        this.surf(v1, 0.55 * r, o.position); aim(o, v2, v1, 'x'); o.scale.setScalar(r / 50.5); o.visible = true;
      });
    } else s.jets.forEach((o) => { o.visible = false; });
    if (head > 0 && head < 1) {
      const a = head * angPer;
      if ((s.bombT -= dt) <= 0) {
        s.bombT = 0.06;
        for (let b = 0; b < 2; b++) {
          const ang = a - rnd(0, 0.5) * r / R, lat = rnd(-0.9, 0.9) * s.hw;
          v1.copy(s.e1).multiplyScalar(Math.cos(ang)).addScaledVector(s.e2, Math.sin(ang)).addScaledVector(s.n, lat / R).normalize();
          this.surf(v1, 0.1 * r, v3);
          this.glow.spawn(v3, null, 0.3 * r, 0.9 * r, 0.45, FIRE[b ? 1 : 2], 0.8, 0.3);
          this.smoke.spawn(v3, vel3(v1, rnd(-0.2, 0.2) * r, rnd(-0.2, 0.2) * r, 0.5 * r, sv), 0.7 * r, 1.7 * r, 2.4, b ? SMOKE1 : SMOKE0, 0.5, 0.7);
          if (Math.random() < 0.2) this.scar(v1, 0.9 * r, 0, 30, 3);
        }
        this.trauma(0.05);
      }
      if (!s.hit) { // the hole under the sweep
        const hd = W.hdir, across = Math.asin(Math.max(-1, Math.min(1, hd.dot(s.n)))) * R, along = Math.atan2(hd.dot(s.e2), hd.dot(s.e1)) * R;
        if (Math.abs(across) < s.hw && Math.abs(along - head * s.len) < 1.2 * r) { s.hit = true; this.stats.strafeHits++; this.hurt(T3.bomberHit, 'Carpet bombed!', 'bomber', T3.bomberK, 0.25, s.age, v1.copy(s.e1).multiplyScalar(Math.cos(head * angPer + 1.6 * r / R)).addScaledVector(s.e2, Math.sin(head * angPer + 1.6 * r / R)).normalize()); this.notice(4); }
      }
    }
    if (s.age > s.tel + s.run + 1.8) this.finishStrafe(s);
  }
  finishStrafe(s) { s.on = false; s.jets.forEach((o) => { o.visible = false; }); this.W.globe.u.uStrafeP.value.x = 0; s.mk?.remove(); s.mk = null; s.horn = false; }

  // ---------------------------------------------------------------- the loss: the Void Lid
  /** Starve below 0.7 x the tier floor: a lid descends (14 s); grow past 0.75 x to call it off, else Sealed (Retry tier N / New run). */
  sealWatch(dt) {
    const { hole, state } = this;
    if (!this.sealOn || state.over || !state.playing) { if (!state.playing && this.lid.visible && !state.sealed) this.lid.visible = false; return; }
    const fl = Math.max(this.floorR(), 0.75 * (state.best || 0)), r = hole.r; // (P0-1c: the lid follows your peak: a run that bleeds a third of its best is warned)
    if (!this.seal && r < 0.7 * fl && this.t > 8) {
      this.seal = { t: 0, zone: this.zoneAlloc() }; this.stats.sealWarn++; this.sfx.lidWarn(); this.sfx.klaxon(1); this.news('Too weak: the Void Lid is coming down — eat, or be sealed for good');
      this.ctx.card('SEALING', `grow past ${KMs(0.75 * fl)} in 14 s`);
    }
    const s = this.seal; if (!s) return;
    s.t += dt;
    const left = Math.max(0, 14 - s.t), p = Math.min(1, s.t / 14);
    this.zoneSet(s.zone, this.W.hdir, 1.6 * r, 0, 0.9, p + 0.001, 0);
    this.lid.visible = true; v1.copy(this.W.hdir).multiplyScalar(R + Math.max(0, this.W.P.elevation(this.W.hdir, 3)) * this.W.E + r * (0.1 + 9 * (1 - p) * (1 - p)));
    this.lid.position.copy(v1); aim(this.lid, v2.crossVectors(_Y, this.W.hdir).normalize(), this.W.hdir, 'x'); this.lid.scale.set(1.7 * r, r * 0.8, 1.7 * r);
    s.left = left;
    if (r > 0.75 * fl) { this.zoneFree(s.zone); this.seal = null; this.lid.visible = false; this.ctx.hint('Sealing called off — keep eating'); this.news('The Void Lid is called off: the hole is growing again'); return; }
    if (left <= 0 || r < 0.55 * fl) this.doSeal();
  }
  doSeal() {
    const { state, hole } = this, s = this.seal; if (!s || state.sealed) return;
    state.sealed = true; state.playing = false; state.over = true; this.zoneFree(s.zone);
    const r = hole.r; v1.copy(this.W.hdir).multiplyScalar(R); this.glow.spawn(v1, null, 4 * r, 6 * r, 0.3, FIRE[0], 2, 0); this.screenFlash(0.8, '#fff', 500); this.trauma(0.6); this.sfx.seal();
    this.lid.position.setLength(R + Math.max(0, this.W.P.elevation(this.W.hdir, 3)) * this.W.E + r * 0.1);
    setTimeout(() => this.sealedUi(), window.__headless || window.__bot ? 0 : 1300);
  }
  sealedUi() {
    const { state } = this, g = this.game, tier = Math.max(1, state.tier || 1);
    const el = Object.assign(document.createElement('div'), { id: 'sealed' });
    el.innerHTML = `<h1>SEALED</h1><p>The Void Lid dropped. You swallowed <b>${((state.pop || 0) / 1e9).toFixed(2)} B</b> people and <b>${(100 * (state.land || 0)).toFixed(1)}%</b> of the land, and reached <b>${TIERS[tier - 1].name}</b> (${KMs(this.hole.r)}).</p><div><button id="sl-retry">Retry tier ${tier}</button><button class="alt" id="sl-new">New run</button></div>`;
    document.body.append(el);
    el.querySelector('#sl-retry').onclick = () => { el.remove(); g.restoreCheckpoint(this.ctx); };
    el.querySelector('#sl-new').onclick = () => { location.reload(); };
  }

  /** Director and Void Lid back on (a reset() after a win). */
  arm() { this.disabled = qs.has('noarmy') || qs.has('nothreat'); this.sealOn = !this.disabled; this.eventsHold = false; }
  /** The world is eaten (A3): the director stops, the weapons go. */
  stand() { this.clear(); this.disabled = true; this.sealOn = false; }

  /** Back to calm (a retry from a checkpoint, or reset()). */
  clear() {
    for (const k of this.K) { for (const x of k.items) if (x.on) k.finish(x); k.clear?.(); }
    for (const f of this.fall) { this.zoneFree(f.zone); f.mk?.remove(); }
    this.fall.length = 0;
    for (const s of this.sites) this.dropSite(s);
    this.sites.length = 0;
    if (this.seal) this.zoneFree(this.seal.zone); this.seal = null; this.lid.visible = false; document.getElementById('sealed')?.remove();
    this.hT.fill(-99); this.hF.fill(0); this.cont = {}; this.budget = 3; this.noto = 0; for (const k of this.K) this.cool[k.name] = k.cool0 ?? 8; this.siteT = 4; this.t = 0; this.tAdd = 0; this.unfairLog = null;
    this.state.frenzy = 0; this.state.fallout = false; this.state.surge = false; this.state.magma = 0; this.state.rubble = false; this.state.ash = false;
    const u = this.W.globe.u; for (let i = 0; i < 20; i++) u.uZoneP[i].value.y = 0; for (let i = 0; i < NS; i++) u.uScarP[i].value.y = 0; for (let i = 0; i < NZ; i++) this.zoneUsed[i] = false; u.uStrafeP.value.x = 0;
    this.glow.age.fill(9); this.smoke.age.fill(9); for (const q of this.domes) { q.t = q.life; q.mesh.visible = false; } for (const q of this.lights) q.t = 99; Object.assign(this.fx, { w: 0, warm: 0, bloom: 0 });
  }

  // ---------------------------------------------------------------- HUD, the bot's view, the debug API
  updateLine(dt) {
    if ((this.lineT -= dt) > 0) return;
    this.lineT = 0.1;
    const { state } = this; let txt = '', cls = '', k = 1e9;
    const pick = (eta, s, c) => { if (eta < k) { k = eta; txt = s; cls = c; } };
    for (const kd of this.K) if (kd.line) for (const x of kd.items) if (x.on) kd.line(x, pick);
    if (this.seal) { txt = `SEALING · grow past <b>${KMs(0.75 * Math.max(this.floorR(), 0.75 * (this.state.best || 0)))}</b> · <b>${this.seal.left.toFixed(0)} s</b>`; cls = 'lock'; }
    else if (!txt && state.frenzy > 0) { txt = `FRENZY · <b>${state.frenzy.toFixed(0)} s</b>`; cls = 'good'; }
    else if (!txt && state.magma > 0) { txt = `MAGMA SURGE · land counts ×${T3.kinds.volcano.surge} · <b>${state.magma.toFixed(0)} s</b>`; cls = 'good'; }
    else if (!txt && state.fallout) { txt = 'FALLOUT · hunger ×1.8 · land ×0.5'; }
    else if (!txt && state.surge) { txt = 'HUNGER SURGE · land counts ×1.5'; cls = 'good'; }
    const el = this.lineEl; el.hidden = !txt || !state.playing && !this.seal;
    if (!el.hidden) { if (el.dataset.t !== txt) { el.innerHTML = txt; el.dataset.t = txt; } if (el.className !== cls) el.className = cls; const hud = document.getElementById('hud'); el.style.top = `${(hud ? hud.getBoundingClientRect().bottom : 44) + 8}px`; }
  }
  /** Dangers for the bots (local frame, metres): circles { x, z, R, inner, eta, locked, kind }, strafe lines, beams, rivals, targets. */
  dangers(out = []) {
    out.length = 0; const o = this._o ??= {};
    for (const k of this.K) if (k.danger) for (const x of k.items) if (x.on) k.danger(x, out);
    for (const f of this.fall) { this.offsetOf(f.dir, o); out.push({ kind: 'fall', id: `f${this.fall.indexOf(f)}`, x: o.x, z: o.z, R: f.R, inner: 0, eta: f.life - f.t, locked: true }); }
    return out;
  }
  api() {
    const self = this;
    return {
      t: self, force: (kind = 'nuke', o = {}) => { if (kind === 'nuke') { for (let i = 0; i < 20 && !self.sites.length; i++) self.makeSite(); } return self.spawn(kind === 'bomber' || self.byName[kind] ? kind : 'nuke', { force: true, ...o }); },
      state: () => ({ defcon: self.defcon, budget: +self.budget.toFixed(1), phase: self.phase, noto: +self.noto.toFixed(1), live: Object.fromEntries(self.K.map((k) => [k.name, k.items.filter((x) => x.on).length])), sites: self.sites.length, fall: self.fall.length, mercy: +self.mercySum().toFixed(3), ms: +(self.ms ?? 0).toFixed(3), stats: { ...self.stats }, unfair: self.unfairLog, seal: self.seal && { t: self.seal.t, left: self.seal.left }, rivals: self.rivals?.list.map((q) => ({ name: q.name, km: Math.round(q.r / 1000), area: Math.round(q.area / 1e9) })) }),
      rings: () => self.dangers([]), clear: () => self.clear(), stats: self.stats,
      /** Debug: spawn `kind` and snapshot (.shots/<prefix><mark>.jpg) at each mark (s relative to impact / fire / the sweep start); the hole stands still. */
      async seq(kind = 'nuke', o = {}, marks = [0.5], prefix = 'th', bot = () => [0, 0]) {
        self.eventsHold = true; self.clear(); window.__bot = bot; self.state.shake = 0; if (kind === 'nuke') { while (!self.sites.length) self.makeSite(); } self.spawn(kind, { force: true, ...o });
        const k = self.byName[kind], ob = k.items.find((q) => q.on), age = () => k.age(ob), out = [];
        for (const m of marks) { let g = 0; while (age() < m && g++ < 4000) window.__tick(1 / 60, 1); await window.__snap(prefix + String(m).replace('.', '_').replace('-', 'm'), 1); out.push([m, +age().toFixed(2), ob.phase, ob.out]); }
        return out;
      },
      /** Debug: a hit of `frac` of the area from a bearing (deg, 0 = up the screen) with the real feedback (no mercy cap, no ledger). */
      pain(frac = 0.08, bearing = 90, why = 'Test hit!') { const r = self.hole.r, b = bearing * Math.PI / 180, d = self.W.dirAt(Math.sin(b) * 3 * r, -Math.cos(b) * 3 * r, new THREE.Vector3()); self.hole.area *= 1 - frac; self.painHit(frac, why, bearing === null ? null : d); self.trauma(0.2 + 2 * frac); return 'ok'; },
      hold: (v = true) => { self.eventsHold = v; }, site: () => { self.makeSite(); return self.sites.length; },
    };
  }

  /** Called after the world's frame is placed: write the sprite pools in render space, aim the ribbons. */
  post(ctx) {
    if (!this.ready) return;
    const W = this.W, u = W.globe.u.uCam.value;
    this.camP.set(u.x * R, u.y * R, u.z * R);
    this.qiw.copy(W.holeQ).invert(); this.off.copy(W.globe.group.position);
    this.glow.flush(this.qiw, this.off); this.smoke.flush(this.qiw, this.off);
  }
}
