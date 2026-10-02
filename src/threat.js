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
import { P3, TIERS } from './phase3.js';
import { spriteCloud } from './fx.js';
import { sunDir } from './look.js';

const qs = new URLSearchParams(location.search);
const FORCE = qs.has('defcon') ? Math.min(5, Math.max(1, +qs.get('defcon') || 5)) : 0;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const _Y = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3(), v6 = new THREE.Vector3();
const m4 = new THREE.Matrix4(), qa = new THREE.Quaternion(), qi = new THREE.Quaternion();
const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const FIRE = [C(0xfff4d6, 4), C(0xffc060, 3), C(0xff7a24, 2.2), C(0xc8340c, 1.4)], SMOKE0 = C(0x2a2522), SMOKE1 = C(0x7d7266), ASH = C(0x5a534b), DUST = C(0xb9a98f);
const KMs = (m) => (m >= 1e6 ? `${(m / 1e6).toFixed(1)} Mm` : `${Math.round(m / 1000)} km`);

/** Tangent unit vector at dir d with the given compass bearing (0 = toward +Y's north, clockwise), planet space. */
function tangentAt(d, bearing, out) {
  const e = v6.crossVectors(_Y, d); if (e.lengthSq() < 1e-8) e.set(1, 0, 0); e.normalize();
  const n = out.crossVectors(d, e).normalize(); // (north)
  return out.copy(n).multiplyScalar(Math.cos(bearing)).addScaledVector(e, Math.sin(bearing)).normalize();
}
const sv = new THREE.Vector3(), w1 = new THREE.Vector3(), w2 = new THREE.Vector3(), w3 = new THREE.Vector3(), wm = new THREE.Matrix4();
/** Orient a model (up = +y, length axis `axis` = +x or +z) so its length points along `fwd` and its up is as close to `up` as that allows. */
function aim(obj, fwd, up, axis = 'x') {
  w1.copy(fwd).normalize(); w2.copy(up).addScaledVector(w1, -up.dot(w1)).normalize();
  if (axis === 'x') { w3.crossVectors(w1, w2); wm.makeBasis(w1, w2, w3); } else { w3.crossVectors(w2, w1); wm.makeBasis(w3, w2, w1); }
  obj.quaternion.setFromRotationMatrix(wm);
}
/** A velocity at planet point `up` (unit): east a, north b, up c (m/s). */
function vel3(up, a, b, c, out) {
  const e = w1.crossVectors(_Y, up); if (e.lengthSq() < 1e-8) e.set(1, 0, 0); e.normalize(); const n = w2.crossVectors(up, e);
  return out.set(0, 0, 0).addScaledVector(e, a).addScaledVector(n, b).addScaledVector(up, c);
}
/** Great-circle interpolation of unit vectors. */
function slerp(a, b, t, out) {
  const om = Math.acos(Math.min(1, Math.max(-1, a.dot(b)))), so = Math.sin(om);
  if (so < 1e-6) return out.copy(a);
  return out.set(0, 0, 0).addScaledVector(a, Math.sin((1 - t) * om) / so).addScaledVector(b, Math.sin(t * om) / so);
}

// ---------------------------------------------------------------- camera-facing ribbons (the arc, the contrail, the beam, the rod, the orbit)
const ribMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
ribMat.colorNode = vec4(attribute('aCol', 'vec4').xyz, attribute('aCol', 'vec4').w.mul(pow(float(1).sub(abs(attribute('aSide', 'float'))), 0.9)));
class Ribbon {
  constructor(n, root) {
    this.n = n; this.cnt = 0;
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 6); this.col = new Float32Array(n * 8); this.pts = Array.from({ length: n }, () => new THREE.Vector3()); this.w = new Float32Array(n);
    const side = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n; i++) { side[2 * i] = -1; side[2 * i + 1] = 1; if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i, 2 * i - 1, 2 * i + 1); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.mesh = new THREE.Mesh(g, ribMat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9; this.mesh.visible = false;
    root.add(this.mesh);
  }
  /** Point i: planet-space position (copied), half width (m), rgba. */
  set(i, p, w, r, g, b, a) { this.pts[i].copy(p); this.w[i] = w; this.col.set([r, g, b, a, r, g, b, a], i * 8); }
  /** Finish: `cnt` points are drawn; sides are perpendicular to the tangent and the view ray. */
  done(cnt, camP) {
    this.cnt = cnt; this.mesh.visible = cnt > 1;
    if (cnt < 2) return;
    for (let i = 0; i < cnt; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(cnt - 1, i + 1)], p = this.pts[i];
      v1.subVectors(b, a); v2.subVectors(p, camP); v1.cross(v2).normalize().multiplyScalar(this.w[i]);
      this.pos[i * 6] = p.x - v1.x; this.pos[i * 6 + 1] = p.y - v1.y; this.pos[i * 6 + 2] = p.z - v1.z; this.pos[i * 6 + 3] = p.x + v1.x; this.pos[i * 6 + 4] = p.y + v1.y; this.pos[i * 6 + 5] = p.z + v1.z;
    }
    this.geo.setDrawRange(0, (cnt - 1) * 6);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aCol.needsUpdate = true;
  }
  hide() { this.mesh.visible = false; this.cnt = 0; }
}

// ---------------------------------------------------------------- planet-anchored sprite pools (additive glows, normal-blend smoke)
class Pool {
  constructor(n, additive) {
    this.n = n; this.add = additive; this.cloud = spriteCloud(n, { additive, world: true }); this.sprite = this.cloud.sprite; this.sprite.renderOrder = additive ? 11 : 10;
    this.P = new Float32Array(n * 3); this.V = new Float32Array(n * 3); this.age = new Float32Array(n).fill(9); this.life = new Float32Array(n).fill(1);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n); this.C = new Float32Array(n * 3); this.drag = new Float32Array(n); this.next = 0;
    this.cloud.alpha.array.fill(0); this.cloud.size.array.fill(0);
  }
  /** pos = planet-space metres, vel = planet-space m/s. */
  spawn(p, vel, s0, s1, life, color, alpha, drag = 0.6) {
    const i = this.next; this.next = (i + 1) % this.n;
    const lift = 0.42 * Math.max(s0, s1) / (p.length() || 1); // (a sprite is a flat quad: its lower half would sink into the ground and be cut by the depth test, so it sits on it)
    this.P[i * 3] = p.x * (1 + lift); this.P[i * 3 + 1] = p.y * (1 + lift); this.P[i * 3 + 2] = p.z * (1 + lift); if (vel) { this.V[i * 3] = vel.x; this.V[i * 3 + 1] = vel.y; this.V[i * 3 + 2] = vel.z; } else this.V.fill(0, i * 3, i * 3 + 3);
    this.s0[i] = s0; this.s1[i] = s1; this.life[i] = life; this.age[i] = 0; this.a0[i] = alpha; this.drag[i] = drag; this.C[i * 3] = color.r; this.C[i * 3 + 1] = color.g; this.C[i * 3 + 2] = color.b;
  }
  step(dt) { for (let i = 0; i < this.n; i++) if (this.age[i] < this.life[i]) { this.age[i] += dt; const k = Math.max(0, 1 - this.drag[i] * dt), j = i * 3; this.V[j] *= k; this.V[j + 1] *= k; this.V[j + 2] *= k; this.P[j] += this.V[j] * dt; this.P[j + 1] += this.V[j + 1] * dt; this.P[j + 2] += this.V[j + 2] * dt; } }
  /** Write render-space positions, sizes and alphas (after the world's frame is placed): q = planet -> render rotation, off = the group's position. */
  flush(q, off) {
    const c = this.cloud, pos = c.pos.array, size = c.size.array, al = c.alpha.array, col = c.col.array;
    for (let i = 0; i < this.n; i++) {
      const t = this.age[i] / this.life[i];
      if (t >= 1) { size[i] = 0; al[i] = 0; if (this.add) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
      v1.set(this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]).applyQuaternion(q).add(off);
      pos[i * 3] = v1.x; pos[i * 3 + 1] = v1.y; pos[i * 3 + 2] = v1.z;
      size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      if (this.add) { const f = this.a0[i] * (1 - t) * (1 - t); col[i * 3] = this.C[i * 3] * f; col[i * 3 + 1] = this.C[i * 3 + 1] * f; col[i * 3 + 2] = this.C[i * 3 + 2] * f; }
      else { al[i] = this.a0[i] * Math.min(1, t * 12) * (1 - t * t); col[i * 3] = this.C[i * 3]; col[i * 3 + 1] = this.C[i * 3 + 1]; col[i * 3 + 2] = this.C[i * 3 + 2]; }
    }
    c.pos.needsUpdate = c.size.needsUpdate = c.alpha.needsUpdate = c.col.needsUpdate = true;
  }
}

/** The mushroom cloud's own material: opaque, sun-lit like the rest of the toy world (flat facets, dirty by noise), a hot core burning in the stem and under the cap; it dissolves (alpha test) as uA falls. */
function mushroomMaterial() {
  const uHeat = uniform(1), uA = uniform(1), uT = uniform(0), m = new THREE.MeshBasicNodeMaterial({ transparent: false, alphaTest: 0.5, fog: false });
  const y = positionLocal.y.div(1.16), p = positionLocal.mul(6).add(vec3(0, uT.mul(0.5), 0)), n = mx_noise_float(p).mul(0.5).add(0.5), n2 = mx_noise_float(p.mul(2.9)).mul(0.5).add(0.5), br = n.mul(0.6).add(n2.mul(0.4));
  const lam = pow(normalWorld.dot(sunDir).mul(0.5).add(0.5).clamp(0, 1), 1.6), fres = pow(float(1).sub(abs(normalView.z)), 2.0);
  const smoke = mix(vec3(0.035, 0.03, 0.028), vec3(0.5, 0.36, 0.26), lam.mul(0.8).add(y.mul(0.1)).mul(br.mul(0.5).add(0.6)).clamp(0, 1));
  const core = exp(pow(y.sub(0.4).mul(2.6), 2).negate()).mul(1.2).add(float(1).sub(y).mul(0.4)).mul(br.mul(1.1).add(0.3));
  const hot = vec3(1.0, 0.34, 0.05).mul(core).mul(uHeat).mul(1.9).add(vec3(1.0, 0.5, 0.12).mul(fres).mul(uHeat).mul(0.9));
  m.colorNode = vec4(smoke.add(hot), uA.mul(1.7).sub(float(1).sub(br).mul(0.9)).add(0.12));
  m.userData = { uHeat, uA, uT };
  return m;
}

const dangerPool = [];
const sealedCss = `#sealed{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(ellipse at center,#1a0c2ecc,#05020bf2);color:#fff3dd;font-family:system-ui,sans-serif;text-align:center;opacity:0;animation:sealin 1.2s ease-out forwards}
#sealed h1{font-size:clamp(40px,9vw,92px);letter-spacing:.14em;margin:0;color:#ff5a47;text-shadow:0 0 30px #ff2a1a88}#sealed p{max-width:34em;margin:0;opacity:.85;line-height:1.45}#sealed div{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
#sealed button{font:800 17px system-ui;padding:12px 26px;border-radius:999px;border:0;cursor:pointer;background:#c9a8ff;color:#1b0b3a;box-shadow:0 3px 0 #0006}#sealed button.alt{background:#fff3dd}
@keyframes sealin{to{opacity:1}}
#threat{position:fixed;left:50%;transform:translateX(-50%);z-index:6;pointer-events:none;display:flex;gap:10px;align-items:center;padding:6px 16px;border-radius:999px;font:800 13px system-ui,sans-serif;letter-spacing:.07em;color:#fff3dd;background:#2a0a14e6;box-shadow:0 0 0 1.5px #ff5a4799,0 0 22px #ff2a1a55;transition:opacity .2s;white-space:nowrap}
#threat[hidden]{display:none}#threat b{color:#ffb27a}#threat.lock{background:#6a0612f0;box-shadow:0 0 0 2px #ff6a58,0 0 30px #ff2a1a99;animation:thr .5s infinite alternate}#threat.good{background:#2a1260ee;box-shadow:0 0 0 2px #c9a8ff,0 0 26px #8a5cff88}
@keyframes thr{to{transform:translateX(-50%) scale(1.04)}}
#fxflash{position:fixed;inset:0;z-index:5;pointer-events:none;opacity:0;background:#fff}`;

export class Threat {
  constructor(game, ctx) {
    this.game = game; this.ctx = ctx; this.W = game.world; this.hole = ctx.hole; this.state = ctx.state; this.sfx = ctx.sfx;
    this.uid = 0; this.t = 0; this.budget = 3; this.noto = 0; this.quiet = 0; this.defcon = 5; this.base = 5; this.cool = { bomber: 6, nuke: 12, rod: 10 }; this.last = '';
    this.hits = []; this.tAdd = 0; this.slots = { z: 0, s: 0 }; this.eventsHold = false; this.disabled = qs.has('noarmy') || qs.has('nothreat'); this.sealOn = !this.disabled;
    this.stats = { nukes: 0, swallowed: 0, hits: 0, near: 0, rods: 0, rodGulps: 0, sats: 0, strafes: 0, strafeHits: 0, mercy: 0, loss: 0, sites: 0, sealWarn: 0, surge: 0, locks: 0 };
    this.sites = []; this.nukes = []; this.lances = []; this.strafes = []; this.fall = []; this.seal = null; this.siteT = 4;
    this.zoneUsed = new Array(8).fill(false); this.lineT = 0; this.ready = false;
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
    this.glow = new Pool(110, true); this.smoke = new Pool(760, false);
    ctx.scene.add(this.glow.sprite, this.smoke.sprite);
    this.glow.sprite.visible = this.smoke.sprite.visible = !!this.game.entered; // (prepared under Phase 2: the pools stay hidden until the swap, show())
    const model = (name) => { const o = assets[name].scene.clone(true); o.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = false; m.frustumCulled = false; } }); o.visible = false; this.root.add(o); return o; };
    for (let i = 0; i < 3; i++) {
      const mat = mushroomMaterial(), mesh = model('mushroom_cloud');
      mesh.traverse((m) => { if (m.isMesh) m.material = mat; });
      this.nukes.push({ i, on: false, arc: new Ribbon(48, this.root), trail: new Ribbon(28, this.root), mis: model('icbm'), mush: { mesh, mat }, zone: -1, mk: null, pos: new THREE.Vector3(), to: new THREE.Vector3(), from: new THREE.Vector3() });
    }
    for (let i = 0; i < 2; i++) this.lances.push({ i, on: false, sat: model('kinetic_sat'), orbit: new Ribbon(97, this.root), beam: new Ribbon(10, this.root), rod: new Ribbon(14, this.root), zone: -1, a: new THREE.Vector3(), b: new THREE.Vector3(), n: new THREE.Vector3(), to: new THREE.Vector3(), pos: new THREE.Vector3(), mk: null, mkO: null });
    for (let i = 0; i < 2; i++) this.strafes.push({ i, on: false, jets: [0, 1, 2].map(() => model('bomber')), mk: null });
    this.siteMesh = Array.from({ length: 4 }, () => ({ on: false, parts: Array.from({ length: 5 }, () => model('missile_silo')) }));
    const lg = new THREE.CylinderGeometry(1, 1, 0.1, 6), lm = new THREE.MeshStandardNodeMaterial({ color: 0x2b2733, roughness: 0.45, metalness: 0.8, emissive: 0x4a0a08, emissiveIntensity: 1.2 });
    this.lid = new THREE.Mesh(lg, lm); this.lid.visible = false; this.lid.frustumCulled = false; this.root.add(this.lid);
    window.__threat = this.api();
    for (const o of [this.glow.sprite, this.smoke.sprite]) o.frustumCulled = false;
    try { await ctx.post.precompile(this.root, 6000, this.game.around); await ctx.post.precompile({ traverse: (f) => { f(this.glow.sprite); f(this.smoke.sprite); } }, 3000, this.game.around); } catch (e) { console.warn('threat precompile', e); }
    this.ready = true;
  }

  show() { this.glow.sprite.visible = this.smoke.sprite.visible = true; }

  dispose() {
    this.lineEl.remove(); this.flashEl.remove(); document.getElementById('sealed')?.remove();
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
  lockFor(needR, floor = 2.0) { const r = this.hole.r, v = P3.speed(r) / r; return Math.min(4.6, Math.max(floor, P3.turn(r) + needR / (0.9 * v))); }
  notice(a) { if (a >= 1) this.quiet = 0; this.noto = Math.min(100, this.noto + a); }
  zoneAlloc() { for (let i = 0; i < 8; i++) if (!this.zoneUsed[i]) { this.zoneUsed[i] = true; return i; } return -1; }
  zoneFree(i) { if (i >= 0) { this.zoneUsed[i] = false; this.W.globe.u.uZoneP[i].value.y = 0; } }
  zoneSet(i, d, outer, inner, alpha, lock, kind) { if (i < 0) return; const u = this.W.globe.u; u.uZone[i].value.set(d.x, d.y, d.z, outer / R); u.uZoneP[i].value.set(inner / R, alpha, lock, kind); }
  scar(d, reach, speed, life, kind) { const u = this.W.globe.u, i = this.slots.s = (this.slots.s + 1) % 8; u.uScar[i].value.set(d.x, d.y, d.z, reach / R); u.uScarP[i].value.set(u.uTime.value, life, speed / R, kind); }
  screenFlash(a, color = '#fff', ms = 260) { if (a > this.flashA) { this.flashA = a; this.flashC = color; this.flashDur = ms / 1000; this.flashT = 0; } }
  /** Trauma, budgeted: at most 0.6 added per 1.5 s (§5.3). */
  trauma(k) { const room = Math.max(0, 0.6 - this.tAdd), add = Math.min(k, room); this.tAdd += add; this.state.shake = Math.min(1, this.state.shake + add); }
  news(t) { this.ctx.news.say(t); }

  /** A damaging hit: capped at 25% of the area, and at 25% in any 30 s (past it a hit is a near miss). Returns the fraction taken. */
  hurt(frac, why, key) {
    const { hole, state } = this;
    frac = Math.min(frac, 0.25);
    this.hits = this.hits.filter((h) => this.t - h.t < 30);
    const sum = this.hits.reduce((a, h) => a + h.f, 0);
    if (sum + frac > 0.25 + 1e-9) { this.stats.mercy++; this.stats.near++; this.trauma(0.25); this.ctx.hint('Near miss — the world blinks'); return 0; }
    this.hits.push({ t: this.t, f: frac });
    const a0 = hole.area; hole.area *= 1 - frac;
    const L = state.ledger; L[key] = (L[key] || 0) + (hole.area - a0); this.stats.loss += frac; this.stats.hits++;
    this.trauma(0.5);
    this.ctx.flash(why);
    this.sfx.hurt();
    return frac;
  }

  // ---------------------------------------------------------------- the director
  update(dt, ctx) {
    if (!this.ready) return;
    const { hole, state } = this, t0 = performance.now();
    this.t += dt; this.tAdd = Math.max(0, this.tAdd - dt * 0.4);
    if (this.t > 1e-3 && !this.disabled) this.direct(dt);
    this.updateSites(dt);
    for (const n of this.nukes) if (n.on) this.nukeStep(n, dt);
    for (const l of this.lances) if (l.on) this.lanceStep(l, dt);
    for (const s of this.strafes) if (s.on) this.strafeStep(s, dt);
    this.updateFallout(dt);
    this.glow.step(dt); this.smoke.step(dt);
    this.sealWatch(dt);
    state.frenzy = Math.max(0, (state.frenzy || 0) - dt); state.slow = Math.max(0, (state.slow || 0) - dt);
    this.updateLine(dt);
    if (this.flashA > 0) { this.flashT += dt; const k = Math.max(0, 1 - this.flashT / this.flashDur); this.flashEl.style.background = this.flashC; this.flashEl.style.opacity = (this.flashA * k * k).toFixed(3); if (k <= 0) this.flashA = 0; }
    this.ms = (this.ms ?? 0) * 0.95 + (performance.now() - t0) * 0.05;
  }

  direct(dt) {
    const { hole, state } = this, r = hole.r;
    const fl = r < 60e3 ? 5 : r < 150e3 ? 4 : r < 450e3 ? 3 : r < 1200e3 ? 2 : 1;
    this.quiet += dt; if (this.quiet > 6) this.noto = Math.max(0, this.noto - 3 * dt);
    const nl = this.noto >= 88 ? 1 : this.noto >= 65 ? 2 : this.noto >= 40 ? 3 : this.noto >= 15 ? 4 : 5;
    const dc = FORCE || Math.min(fl, nl);
    if (dc !== this.defcon) {
      const up = dc < this.defcon; this.defcon = dc;
      if (up && this.t > 2) { this.sfx.klaxon(dc); this.news(['', 'DEFCON 1: the world answers with everything it has', 'DEFCON 2: orbital weapons are being armed', 'DEFCON 3: the World Defense Council authorises a nuclear response', 'DEFCON 4: air forces scrambled', ''][dc]); this.ctx.hint(`DEFCON ${dc}`); }
    }
    state.defcon = dc;
    // tension cycle (75 s): build 45 / peak 15 / relax 15 (§5.1); comeback and the lid relax it
    const ph = this.t % 75, phase = ph < 45 ? 'build' : ph < 60 ? 'peak' : 'relax', fl0 = this.floorR();
    this.phase = phase;
    const surge = hole.r < 0.85 * fl0 || (state.surge && hole.r < fl0);
    if (surge && !state.surge) { state.surge = true; this.stats.surge++; this.ctx.card('Hunger Surge', 'land in view grows you ×1.5'); this.news('The void is starving: hunger surge — every bite counts for more'); }
    if (state.surge && hole.r >= fl0) state.surge = false;
    const mul = surge || this.seal ? 0 : phase === 'build' ? 1 : phase === 'peak' ? 2 : 0, cap = surge || this.seal ? 0 : phase === 'build' ? 2 : phase === 'peak' ? 3 : 1;
    this.budget = Math.min(14, this.budget + (0.6 + 0.2 * (5 - dc)) * mul * dt);
    for (const k in this.cool) this.cool[k] -= dt;
    const grace = FORCE ? 3 : 24;
    if (this.t < grace || this.eventsHold || !state.playing) return;
    const live = this.nukes.filter((n) => n.on && n.phase === 'fly').length + this.lances.filter((l) => l.on && l.phase !== 'gone' && !l.past).length + this.strafes.filter((s) => s.on).length;
    if (live >= cap) return;
    const tryK = [];
    if (r < 450e3 && this.cool.bomber <= 0 && this.budget >= 3) tryK.push('bomber');
    if (r < 1200e3 && dc <= 3 && this.cool.nuke <= 0 && this.budget >= 6 && this.sites.length) tryK.push('nuke');
    if (dc <= 2 && r >= 150e3 && this.cool.rod <= 0 && this.budget >= 5) tryK.push('rod');
    if (!tryK.length) return;
    const k = tryK.length > 1 && tryK.includes(this.last) ? tryK.filter((x) => x !== this.last)[0] : tryK[Math.floor(Math.random() * tryK.length)];
    if (this.spawn(k)) { this.last = k; }
  }

  spawn(kind, opts = {}) {
    let ok = false;
    if (kind === 'bomber') ok = this.spawnStrafe(opts); else if (kind === 'nuke') ok = this.spawnNuke(opts); else if (kind === 'rod') ok = this.spawnLance(opts);
    if (ok && !opts.force) { this.budget -= { bomber: 3, nuke: 6, rod: 5 }[kind]; this.cool[kind] = { bomber: 42 + rnd(0, 14), nuke: 48 + rnd(0, 20), rod: 55 + rnd(0, 20) }[kind]; }
    return ok;
  }

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
        const k = r * 0.5 / 10; this.surf(s.dir, 0, v1, s.elev); // (silo model: 20 m wide, 9.5 m tall)
        const east = v3.crossVectors(_Y, s.dir).normalize(), north = v4.crossVectors(s.dir, east);
        s.mesh.parts.forEach((o, j) => {
          const a = j * 1.2566 + 0.3, rad = j ? 0.62 * r : 0;
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
    hole.area *= 1.01; state.belly = Math.min(1, state.belly + 0.05); this.sfx.tink?.();
    this.news('Silo field swallowed: its missiles never fly'); this.ctx.hint('Silo field swallowed');
  }

  // ---------------------------------------------------------------- ICBM nukes
  spawnNuke(o = {}) {
    const { hole, W } = this, r = hole.r, n = this.nukes.find((q) => !q.on); if (!n) return false;
    let site = null, best = 1e30;
    for (const s of this.sites) { const d = W.distTo(s.dir); if (d < 5 * r || d > 40 * r) continue; const sc = Math.abs(d - 14 * r) + Math.random() * 6 * r; if (sc < best) { best = sc; site = s; } }
    if (!site) return false;
    const lock = this.lockFor(0.8, 2.0);
    Object.assign(n, { uid: ++this.uid, on: true, phase: 'fly', age: 0, r0: r, B: 1.4 * r, inner: 0.5 * r, lock, T: lock + rnd(3.4, 4.6), locked: false, ox: 0, oz: 0, side: Math.random() < 0.5 ? -1 : 1, off0: o.at === 'hole' ? 0 : 0.6 * r, ux: 0, uz: -1, boomT: 0, out: '', site, puffT: 0, ashT: 0, ashN: 0, elevT: 0, capT: 0, core: false });
    
    n.from.copy(site.dir); n.to.copy(W.hdir);
    n.chord = W.distTo(site.dir); n.apex = Math.min(1.5e6, 0.18 * n.chord + 0.5 * r);
    n.zone = this.zoneAlloc();
    n.mk = this.map?.addMarker({ kind: 'nuke', from: n.from, dir: n.to, dur: n.T, eta: n.T, r: n.B, label: 'ICBM', color: '#ff5d5d' });
    this.stats.nukes++;
    this.sfx.nukeLaunch(Math.max(0.2, 1 - W.distTo(site.dir) / (40 * r)));
    this.news('Launch detected: an ICBM leaves a silo field'); this.ctx.hint('ICBM launched — the ring is the blast: dive into the inner circle to swallow it');
    this.glow.spawn(this.surf(site.dir, 0, v1, site.elev), null, 1.4 * r, 4 * r, 1.1, FIRE[1], 1.6, 0);
    return true;
  }
  /** Ballistic point of nuke n at t (0..1): the great circle from the silo to the target, a parabola over it. */
  arcAt(n, t, out) {
    slerp(n.from, n.to, t, v3).normalize();
    const e0 = n.site.elev, e1 = n.elevT ?? 0, h = (e0 * (1 - t) + e1 * t) * this.W.E + n.apex * 4 * t * (1 - t) + n.r0 * 0.4 * t * t * t * t; // (the last quarter drops to the airburst height)
    return out.copy(v3).multiplyScalar(R + h);
  }
  nukeStep(n, dt) {
    const { hole, W, state } = this;
    n.age += dt;
    const camP = this.camP;
    if (n.phase === 'fly') {
      const eta = n.T - n.age;
      if (eta > n.lock) { // tracking: the ring rides the spot the hole will reach, offset to the side so doing nothing is a hit and escaping or diving is a choice
        const sp = Math.hypot(hole.vx, hole.vz);
        if (sp > 0.05 * P3.speed(hole.r)) { n.ux = hole.vx / sp; n.uz = hole.vz / sp; }
        const wx = hole.vx * n.lock - n.uz * n.side * n.off0, wz = hole.vz * n.lock + n.ux * n.side * n.off0, k = Math.min(1, dt * 5);
        n.ox += (wx - n.ox) * k; n.oz += (wz - n.oz) * k;
        W.dirAt(n.ox, n.oz, n.to);
        n.elevT = Math.max(0, W.P.elevation(n.to, 3));
      } else if (!n.locked) { n.locked = true; this.stats.locks++; this.sfx.lockBeep(); this.ctx.hint(`LOCKED — ${KMs(n.B)} blast: leave the ring, or dive into the inner circle`); }
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
      aim(n.mis, v2, v4.copy(n.pos).normalize(), 'x'); n.mis.position.copy(n.pos); n.mis.scale.setScalar(cd * 0.07 / 35.3); n.mis.visible = true;
      if (n.age > 0.25) this.glow.spawn(n.pos, null, cd * 0.012, cd * 0.022, 0.2, FIRE[1], 1.3, 0); // the motor
      if (eta <= 0) this.detonate(n);
      return;
    }
    // after the boom: the mushroom, the fall into the well
    n.arc.hide(); n.trail.hide(); n.mis.visible = false;
    const m = n.mush, mt = n.age - n.boomT;
    if (n.out === 'swallow') {
      const u = Math.min(1, Math.max(0, (mt - 0.28) / 1.0)), grow = Math.min(1, mt / 0.28), e = u * u * (3 - 2 * u), f = n.H / 1.16 * 0.62 * (0.35 + 0.65 * grow);
      v1.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E); v2.lerpVectors(n.pg, v1, e * e);
      m.mesh.position.copy(v2); m.mesh.scale.set(f * (1 - 0.8 * e) * (1 + 0.3 * Math.sin(u * 9)), f * (1 - 2.3 * e), f * (1 - 0.8 * e) * (1 + 0.3 * Math.sin(u * 9)));
      m.mesh.quaternion.copy(n.qUp).multiply(qa.setFromAxisAngle(_Y, u * 14));
      m.mat.userData.uA.value = 1 - 0.3 * u; m.mat.userData.uHeat.value = 1 - 0.5 * u; m.mat.userData.uT.value += dt;
      m.mesh.visible = u < 1;
      if (mt > 0.3 && mt < 1.3 && Math.random() < 0.5) { v3.copy(W.hdir).multiplyScalar(R + 200); this.glow.spawn(v2, null, 0.5 * n.r0, 0.1 * n.r0, 0.4, C(0xb58cff, 3), 0.9, 0); }
      if (mt > 1.4) this.finish(n);
      return;
    }
    // a real airburst
    const gk = smooth(0.0, 2.6, mt), wk = smooth(0.3, 3.4, mt), f = n.H / 1.16;
    m.mesh.scale.set(f * (0.25 + 0.75 * wk), f * (0.04 + 0.96 * gk), f * (0.25 + 0.75 * wk));
    m.mesh.position.copy(n.pg);
    const fade = 1 - smooth(9, 14, mt);
    m.mat.userData.uHeat.value = Math.max(0, 1 - mt / 12) * (0.5 + 0.5 * Math.min(1, mt * 1.5)); m.mat.userData.uA.value = Math.min(1, mt * 1.5) * fade; m.mat.userData.uT.value += dt;
    // smoke column and the rolling base ring while it grows; the ash plume drifts downwind after
    n.puffT = (n.puffT ?? 0) - dt;
    if (mt < 5 && n.puffT <= 0) {
      n.puffT = 0.11; const r = n.r0;
      v1.copy(n.pg).setLength(R + n.elev * W.E + n.H * gk * rnd(0.05, 0.7)); this.smoke.spawn(v1, vel3(v2.copy(n.to).normalize(), rnd(-0.1, 0.1) * r, rnd(-0.1, 0.1) * r, 0.1 * r, sv), 0.5 * r, 1.1 * r, 4, mt < 1.2 ? SMOKE1 : SMOKE0, 0.35, 0.5);
    }
    // the cap billows: dirty-orange puffs rolling out of the cap's rim (a cauliflower), and a core glow that burns under it
    n.capT = (n.capT ?? 0) - dt;
    if (mt > 0.5 && mt < 4.2 && n.capT <= 0) {
      n.capT = 0.06; const up = v3.copy(n.to).normalize(), a = rnd(0, 6.283), rad = n.H * 0.3 * Math.sqrt(Math.random()) * (0.4 + 0.6 * wk), hh = n.H * (0.58 + 0.2 * Math.random()) * gk;
      v1.copy(n.pg).setLength(R + n.elev * W.E + hh).addScaledVector(tangentAt(up, a, v2), rad);
      this.smoke.spawn(v1, vel3(up, 0, 0, 0.05 * n.H, sv).addScaledVector(v2, 0.09 * n.H * wk), 0.28 * n.H, 0.5 * n.H, 3.4, mt < 1.8 ? C(0xe0762c, 1.1) : mt < 3 ? C(0x6a4a36) : SMOKE0, mt < 1.8 ? 0.5 : 0.42, 0.5);
    }
    if (!n.core && mt > 0.4) { n.core = true; this.glow.spawn(v1.copy(n.pg).setLength(R + n.elev * W.E + n.H * 0.5), null, 0.55 * n.H, 1.1 * n.H, 3.2, FIRE[2], 1.5, 0.1); }
    if (mt > 2.2 && mt < 11 && n.ashN < 26 && (n.ashT = (n.ashT ?? 0) - dt) <= 0) {
      n.ashT = 0.28; n.ashN++; const r = n.r0, up = v3.copy(n.to).normalize(), w = tangentAt(up, 1.9, v2);
      v1.copy(n.pg).setLength(R + n.elev * W.E + n.H * rnd(0.3, 0.95)); this.smoke.spawn(v1, sv.copy(w).multiplyScalar(0.35 * r).addScaledVector(up, 0.04 * r), 0.7 * r, 1.8 * r, 12, ASH, 0.3, 0.2);
    }
    if (mt > 14.5) this.finish(n);
  }
  /** The warhead goes off (or falls into the void). */
  detonate(n) {
    const { hole, W, state } = this, r = n.r0, dist = W.distTo(n.to);
    n.phase = 'burn'; n.boomT = n.age; n.ashN = 0; n.elev = Math.max(0, W.P.elevation(n.to, 3)); n.H = 3.2 * r;
    n.pg = this.surf(n.to, 0, new THREE.Vector3(), n.elev); n.qUp = n.qUp ?? new THREE.Quaternion();
    n.qUp.setFromUnitVectors(_Y, v1.copy(n.to).normalize());
    n.zone >= 0 && this.zoneFree(n.zone); n.zone = -1; n.mk?.remove(); n.mk = null;
    n.mush.mesh.position.copy(n.pg); n.mush.mesh.quaternion.copy(n.qUp); n.mush.mesh.scale.setScalar(1e-3); n.mush.mesh.visible = true;
    n.mush.mat.userData.uA.value = 0; n.mush.mat.userData.uHeat.value = 1;
    const delay = Math.min(1.2, dist / (12 * r));
    if (dist < n.inner) return this.swallowNuke(n, dist);
    n.out = dist < n.B ? 'hit' : 'miss';
    // layered detonation: flash (1 frame, additive, 3 r) -> fireball -> shock ring over the ground -> smoke column / mushroom -> ash plume -> scorch
    v2.copy(n.pg).setLength(R + n.elev * W.E + 0.3 * n.B);
    this.glow.spawn(v2, null, 7 * r, 8 * r, 0.14, FIRE[0], 3.2, 0);
    this.glow.spawn(v2, null, 0.5 * n.B, 2.4 * n.B, 0.8, FIRE[1], 2.0, 0.3);
    this.glow.spawn(v2, null, 0.3 * n.B, 1.7 * n.B, 1.4, FIRE[2], 1.6, 0.3);
    this.glow.spawn(v2, null, 0.2 * n.B, 1.2 * n.B, 2.2, FIRE[3], 1.2, 0.2);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283 + rnd(0, 0.4), tg = tangentAt(v3.copy(n.to).normalize(), a, v4); v1.copy(n.pg).setLength(R + n.elev * W.E + 0.05 * r).addScaledVector(tg, 0.2 * n.B); this.smoke.spawn(v1, sv.copy(tg).multiplyScalar(0.8 * r).addScaledVector(v3, 0.05 * r), 0.6 * r, 1.4 * r, 4.5, DUST, 0.6, 0.45); } // (the rolling base ring)
    this.scar(n.to, 2.0 * n.B, 0.8 * r, 14, 0);
    this.scar(n.to, 1.2 * n.B, 0.2 * r, 90, 0); // (the scorch stays: its ring is short)
    this.fall.push({ dir: n.to.clone(), R: 2 * r, t: 0, life: 30, zone: this.zoneAlloc() });
    if (this.fall.length > 2) { const o = this.fall.shift(); this.zoneFree(o.zone); }
    const near = Math.max(0.12, 1 - dist / (8 * r));
    this.sfx.nukeBoom(Math.min(1, 0.5 + 0.5 * near), delay);
    this.screenFlash(0.18 + 0.5 * near, '#fff4dc', 320);
    this.trauma(0.2 + 0.4 * near);
    if (n.out === 'hit') { this.hurt(0.07, 'Nuclear airburst!', 'nuke'); this.notice(6); this.news('An ICBM detonates over the void: the blast rim scorches it'); }
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
    const a0 = hole.area; hole.area *= 1.03; state.belly = Math.min(1, state.belly + 0.25); state.ledger.nukeGulp = (state.ledger.nukeGulp || 0) + (hole.area - a0);
    state.frenzy = 6; this.notice(10);
    this.ctx.card('NUKE SWALLOWED', 'the void eats the bomb: Frenzy'); this.news('The void swallowed an ICBM whole'); this.ctx.hint('FRENZY — speed up, bite deeper');
    n.pulled = true;
  }
  finish(n) { n.on = false; n.mush.mesh.visible = false; n.mis.visible = false; n.arc.hide(); n.trail.hide(); if (n.zone >= 0) this.zoneFree(n.zone); n.zone = -1; n.mk?.remove(); n.mk = null; }

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
    if (inside && !state.fallout) this.ctx.hint('Fallout: hunger ×1.8, land counts ×0.7 — leave the zone');
    state.fallout = inside;
  }

  // ---------------------------------------------------------------- kinetic lances ("rods from god")
  spawnLance(o = {}) {
    const { hole, W } = this, r = hole.r, l = this.lances.find((q) => !q.on); if (!l) return false;
    const lock = this.lockFor(0.5, 2.0), Tfire = Math.max(6.6, lock + 3.2), om = 0.034;
    Object.assign(l, { uid: ++this.uid, on: true, phase: 'orbit', age: 0, r0: r, B: 1.0 * r, inner: 0.3 * r, lock, Tfire, om, th0: -om * Tfire, locked: false, past: false, ox: 0, oz: 0, side: Math.random() < 0.5 ? -1 : 1, off0: o.at === 'hole' ? 0 : 0.55 * r, ux: 0, uz: -1, rodT: -1, eaten: 0, alt: Math.max(260e3, 0.8 * r), out: '' });
    // the orbit plane holds the hole's position and the screen's top: the satellite comes down the frame toward you
    const br = rnd(-0.9, 0.9); W.dirAt(Math.sin(br) * 2e4, -Math.cos(br) * 2e4, v1); v1.addScaledVector(W.hdir, -v1.dot(W.hdir)).normalize();
    l.a.copy(W.hdir); l.b.copy(v1).negate(); l.n.crossVectors(l.a, l.b).normalize(); l.to.copy(W.hdir);
    l.zone = this.zoneAlloc();
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
      v3.copy(l.pos).normalize(); const gd = W.distTo(v3);
      if (hole.r >= 420e3 && gd < 0.9 * hole.r && !l.eaten) { this.eatSat(l); return; }
      if (eta < l.lock + 1.3) { // designator: tracking, then locked
        if (eta > l.lock) {
          const sp = Math.hypot(hole.vx, hole.vz); if (sp > 0.05 * P3.speed(hole.r)) { l.ux = hole.vx / sp; l.uz = hole.vz / sp; }
          const wx = hole.vx * l.lock - l.uz * l.side * l.off0, wz = hole.vz * l.lock + l.ux * l.side * l.off0, k = Math.min(1, dt * 5);
          l.ox += (wx - l.ox) * k; l.oz += (wz - l.oz) * k; W.dirAt(l.ox, l.oz, l.to);
        } else if (!l.locked) { l.locked = true; this.stats.locks++; this.sfx.lockBeep(); this.ctx.hint(`LOCKED — ${KMs(l.B)} impact: leave the ring, or dive into the inner circle`); }
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
  fireRod(l) {
    const { W, hole } = this, dist = W.distTo(l.to);
    l.phase = 'rod'; l.rodT = 0; l.satFire = l.pos.clone(); l.out = dist < l.inner ? 'swallow' : dist < l.B ? 'hit' : 'miss';
    l.mk?.remove(); l.mk = null; l.beam.hide();
    this.sfx.rodStrike(0.8, 0.34 + Math.min(1.2, dist / (12 * l.r0)));
  }
  rodImpact(l) {
    const { W, hole, state } = this, r = l.r0, dist = W.distTo(l.to), cd = this.game.camDist || 1;
    l.phase = 'gone'; l.rod.hide(); if (l.zone >= 0) this.zoneFree(l.zone); l.zone = -1; l.past = true;
    if (l.out === 'swallow' && dist < l.inner * 1.6) {
      this.stats.rodGulps++; v1.copy(W.hdir).multiplyScalar(R + Math.max(0, W.P.elevation(W.hdir, 3)) * W.E + 0.1 * r);
      this.glow.spawn(v1, null, 3 * r, 4 * r, 0.14, C(0xf0e4ff, 3), 3, 0); this.glow.spawn(v1, null, 1.2 * r, 2.8 * r, 0.7, C(0xa070ff, 2.2), 1.6, 0.2);
      this.scar(W.hdir, 3.4 * r, 3.2 * r, 3, 2); hole.shockwave(); this.sfx.tink(); this.sfx.choir(0.5); this.screenFlash(0.45, '#e8dcff', 320);
      state.hitstop = Math.max(state.hitstop || 0, 0.12); this.trauma(0.3); const a0 = hole.area; hole.area *= 1.02; state.belly = Math.min(1, state.belly + 0.15); state.ledger.rodGulp = (state.ledger.rodGulp || 0) + (hole.area - a0); state.frenzy = 6;
      this.ctx.card('ROD CAUGHT', 'the void swallowed a lance: Frenzy'); this.news('The void swallowed an orbital rod'); this.notice(6);
      return;
    }
    l.out = dist < l.B ? 'hit' : 'miss';
    this.surf(l.to, 0, v1, l.elev); const hi = v2.copy(v1).setLength(R + l.elev * W.E + 0.3 * r);
    this.glow.spawn(hi, null, 6 * r, 7 * r, 0.12, FIRE[0], 3.4, 0); this.glow.spawn(hi, null, 0.4 * r, 2.4 * r, 0.6, FIRE[1], 2.2, 0.3); this.glow.spawn(hi, null, 0.3 * r, 1.6 * r, 1.2, FIRE[2], 1.6, 0.3);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283 + rnd(0, 0.4), tg = tangentAt(v3.copy(l.to).normalize(), a, v4); this.smoke.spawn(v1, sv.copy(tg).multiplyScalar(1.4 * r).addScaledVector(v3, 0.1 * r), 0.5 * r, 1.3 * r, 3.5, DUST, 0.65, 0.6); }
    for (let i = 0; i < 7; i++) { v3.copy(v1).setLength(R + l.elev * W.E + r * (0.2 + i * 0.35)); this.smoke.spawn(v3, vel3(v2.copy(l.to).normalize(), rnd(-0.2, 0.2) * r, rnd(-0.2, 0.2) * r, 0.12 * r, sv), 0.7 * r, 1.4 * r, 5, i < 3 ? SMOKE0 : ASH, 0.5, 0.5); }
    this.scar(l.to, 1.6 * r, 3.0 * r, 14, 1); this.scar(l.to, 0.9 * r, 0.2 * r, 80, 1);
    const near = Math.max(0.12, 1 - dist / (8 * r)); this.sfx.nukeBoom(0.35 + 0.4 * near, Math.min(1.2, dist / (12 * r))); this.screenFlash(0.1 + 0.4 * near, '#fff', 260); this.trauma(0.2 + 0.4 * near);
    if (l.out === 'hit') { this.hurt(0.08, 'Orbital strike!', 'rod'); this.notice(5); }
  }
  eatSat(l) {
    const { hole, state } = this, r = hole.r; l.eaten = 1; l.phase = 'eaten'; l.eatT = l.age; this.stats.sats++;
    if (l.zone >= 0) this.zoneFree(l.zone); l.zone = -1; l.beam.hide(); l.mk?.remove(); l.mk = null; l.past = true;
    this.glow.spawn(l.pos, null, 0.3 * r, 1.4 * r, 0.5, C(0xdff6ff, 3), 1.6, 0); this.sfx.tink(); state.hitstop = Math.max(state.hitstop || 0, 0.08); this.trauma(0.15);
    const a0 = hole.area; hole.area *= 1.02; state.ledger.sat = (state.ledger.sat || 0) + (hole.area - a0); state.belly = Math.min(1, state.belly + 0.1);
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
        if (Math.abs(across) < s.hw && Math.abs(along - head * s.len) < 1.2 * r) { s.hit = true; this.stats.strafeHits++; this.hurt(0.06, 'Carpet bombed!', 'bomber'); this.notice(4); }
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
    const fl = this.floorR(), r = hole.r;
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

  /** Back to calm (a retry from a checkpoint, or reset()). */
  clear() {
    for (const n of this.nukes) if (n.on) this.finish(n);
    for (const l of this.lances) if (l.on) this.finishLance(l);
    for (const s of this.strafes) if (s.on) this.finishStrafe(s);
    for (const f of this.fall) { this.zoneFree(f.zone); f.mk?.remove(); }
    this.fall.length = 0;
    for (const s of this.sites) this.dropSite(s);
    this.sites.length = 0;
    if (this.seal) this.zoneFree(this.seal.zone); this.seal = null; this.lid.visible = false; document.getElementById('sealed')?.remove();
    this.hits.length = 0; this.budget = 3; this.noto = 0; this.cool = { bomber: 6, nuke: 12, rod: 10 }; this.siteT = 4; this.t = 0; this.tAdd = 0;
    this.state.frenzy = 0; this.state.fallout = false; this.state.surge = false;
    const u = this.W.globe.u; for (let i = 0; i < 8; i++) { u.uZoneP[i].value.y = 0; u.uScarP[i].value.y = 0; this.zoneUsed[i] = false; } u.uStrafeP.value.x = 0;
    this.glow.age.fill(9); this.smoke.age.fill(9);
  }

  // ---------------------------------------------------------------- HUD, the bot's view, the debug API
  updateLine(dt) {
    if ((this.lineT -= dt) > 0) return;
    this.lineT = 0.1;
    const { state } = this; let txt = '', cls = '', k = 1e9;
    const pick = (eta, s, c) => { if (eta < k) { k = eta; txt = s; cls = c; } };
    for (const n of this.nukes) if (n.on && n.phase === 'fly') pick(n.T - n.age, `ICBM · <b>${KMs(n.B)}</b> blast · impact <b>${Math.max(0, n.T - n.age).toFixed(1)} s</b>${n.locked ? ' · LOCKED' : ''}`, n.locked ? 'lock' : '');
    for (const l of this.lances) if (l.on && l.phase === 'orbit' && l.Tfire - l.age < l.lock + 1.3) pick(l.Tfire - l.age, `ORBITAL LANCE · <b>${KMs(l.B)}</b> impact · <b>${Math.max(0, l.Tfire - l.age).toFixed(1)} s</b>${l.locked ? ' · LOCKED' : ''}`, l.locked ? 'lock' : '');
    for (const s of this.strafes) if (s.on && s.age < s.tel + s.run) pick(Math.max(0, s.tel - s.age), `AIR STRIKE · line ${KMs(2 * s.hw)} wide · <b>${Math.max(0, s.tel - s.age).toFixed(1)} s</b>`, s.age > s.tel * 0.5 ? 'lock' : '');
    if (this.seal) { txt = `SEALING · grow past <b>${KMs(0.75 * this.floorR())}</b> · <b>${this.seal.left.toFixed(0)} s</b>`; cls = 'lock'; }
    else if (!txt && state.frenzy > 0) { txt = `FRENZY · <b>${state.frenzy.toFixed(0)} s</b>`; cls = 'good'; }
    else if (!txt && state.fallout) { txt = 'FALLOUT · hunger ×1.8 · land ×0.7'; }
    else if (!txt && state.surge) { txt = 'HUNGER SURGE · land counts ×1.5'; cls = 'good'; }
    const el = this.lineEl; el.hidden = !txt || !state.playing && !this.seal;
    if (!el.hidden) { if (el.dataset.t !== txt) { el.innerHTML = txt; el.dataset.t = txt; } if (el.className !== cls) el.className = cls; const hud = document.getElementById('hud'); el.style.top = `${(hud ? hud.getBoundingClientRect().bottom : 44) + 8}px`; }
  }
  /** Dangers for the bots (local frame, metres): circles { x, z, R, inner, eta, locked, kind } and strafe lines. */
  dangers(out = []) {
    out.length = 0; const o = this._o ??= {};
    for (const n of this.nukes) if (n.on && n.phase === 'fly') { this.offsetOf(n.to, o); out.push({ kind: 'nuke', id: `n${n.uid}`, x: o.x, z: o.z, R: n.B, inner: n.inner, eta: n.T - n.age, locked: n.locked, lock: n.lock }); }
    for (const l of this.lances) if (l.on && l.phase === 'orbit' && l.Tfire - l.age < l.lock + 1.3) { this.offsetOf(l.to, o); out.push({ kind: 'rod', id: `l${l.uid}`, x: o.x, z: o.z, R: l.B, inner: l.inner, eta: l.Tfire - l.age, locked: l.locked, lock: l.lock }); }
    for (const s of this.strafes) if (s.on && s.age < s.tel + s.run) {
      const hd = this.W.hdir, across = Math.asin(Math.max(-1, Math.min(1, hd.dot(s.n)))) * R; // (+ = the hole is on the normal's side)
      this.W.normalAt(s.n, v3); const ln = Math.hypot(v3.x, v3.z) || 1;
      out.push({ kind: 'line', id: `s${s.i}`, across, nx: v3.x / ln, nz: v3.z / ln, hw: s.hw, eta: Math.max(0, s.tel - s.age), end: s.tel + s.run - s.age, locked: true, lock: s.tel });
    }
    for (const f of this.fall) { this.offsetOf(f.dir, o); out.push({ kind: 'fall', id: `f${this.fall.indexOf(f)}`, x: o.x, z: o.z, R: f.R, inner: 0, eta: f.life - f.t, locked: true }); }
    return out;
  }
  api() {
    const self = this;
    return {
      t: self, force: (kind = 'nuke', o = {}) => { if (kind === 'nuke') { for (let i = 0; i < 20 && !self.sites.length; i++) self.makeSite(); } return self.spawn(kind, { force: true, ...o }); },
      state: () => ({ defcon: self.defcon, budget: +self.budget.toFixed(1), phase: self.phase, noto: +self.noto.toFixed(1), live: { nukes: self.nukes.filter((n) => n.on).length, lances: self.lances.filter((l) => l.on).length, strafes: self.strafes.filter((s) => s.on).length }, sites: self.sites.length, fall: self.fall.length, mercyHits: self.hits.length, ms: +(self.ms ?? 0).toFixed(3), stats: { ...self.stats }, seal: self.seal && { t: self.seal.t, left: self.seal.left } }),
      rings: () => self.dangers([]), clear: () => self.clear(), stats: self.stats,
      /** Debug: spawn `kind` and snapshot (.shots/<prefix><mark>.jpg) at each mark (s relative to impact / fire / the sweep start); the hole stands still. */
      async seq(kind = 'nuke', o = {}, marks = [0.5], prefix = 'th', bot = () => [0, 0]) {
        self.eventsHold = true; self.clear(); window.__bot = bot; self.state.shake = 0; if (kind === 'nuke') { while (!self.sites.length) self.makeSite(); } self.spawn(kind, { force: true, ...o });
        const ob = kind === 'nuke' ? self.nukes.find((q) => q.on) : kind === 'rod' ? self.lances.find((q) => q.on) : self.strafes.find((q) => q.on);
        const age = kind === 'nuke' ? () => (ob.phase === 'fly' ? ob.age - ob.T : ob.age - ob.boomT) : kind === 'rod' ? () => ob.age - ob.Tfire : () => ob.age - ob.tel, out = [];
        for (const m of marks) { let g = 0; while (age() < m && g++ < 3000) window.__tick(1 / 60, 1); await window.__snap(prefix + String(m).replace('.', '_').replace('-', 'm'), 1); out.push([m, +age().toFixed(2), ob.phase, ob.out]); }
        return out;
      },
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
