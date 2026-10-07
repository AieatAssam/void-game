// THE FINALE (docs/PHASE3.md 12.13): the last land goes and the planet is consumed. The world is not a ball of land any more but a structured body: the globe splits along fault lines into
// shell shards (src/shatter.js) whose cross-sections show crust strata over a glowing mantle and, once they have gone, the outer core; the sea peels off in a sheet of droplets and
// spirals in with the air and the lava (src/streaks.js); the chunks are stretched along the line to the hole (tidal spaghettification), spiral in, flatten into a plane and are
// swallowed one by one, each a flash, a shudder and a step in the hole's growth; the debris becomes an accretion disk; then the purple hole is drained into an honest black hole
// (src/blackhole.js, src/post.js: the lens, the shadow, a thin Doppler-beamed disk bent over the top, the photon ring) over the starfield, and a title card closes the stage.
//
// One clock `t` (finale seconds; slowed on the beats) drives everything and every visual is a closed form of it, so `__finale(t)` scrubs to any frame. The camera is a keyframed orbit
// (Hermite) round the hole, which stays at the render origin. The game's own loop (planetgame.js) hands the camera to `state.asc.cam` (free mode) and calls afterWorld().
import * as THREE from 'three/webgpu';
import { R } from './planetgen.js';
import { planetMaterial } from './planetglobe.js';
import { buildShards, cutMaterial, coreMaterial, shardUniforms, NSH, R_IN } from './shatter.js';
import { streakUniforms, makeStreaks, makeDiskGlow } from './streaks.js';
import { holeSphere, holeHalo } from './blackhole.js';
import { save, persist } from './meta.js';
import { popStr } from './threat/kit.js';

if (/[?&]trace\b/.test(location.search)) THREE.Node.captureStackTrace = true; // (dev: TSL errors with stacks)
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;

/** Seconds on the finale clock. */
export const FT = {
  rupt: 2.6, openEnd: 4.8, peel0: 3.4, peelSpan: 12.6, fall0: 4.6, fall1: 15.2, core0: 16.6, coreDur: 5.4, last: 22.0, quiet: 22.4, drained: 23.7, lens0: 23.7, lens1: 27.3, title: 28.1, buttons: 31.9,
};
const NAME = 'THE WORLD IS CONSUMED';
const CSS = `
#finbars i{position:fixed;left:0;right:0;height:0;background:#000;z-index:30;pointer-events:none}#finbars i:first-child{top:0}#finbars i:last-child{bottom:0}
#finflash{position:fixed;inset:0;z-index:31;pointer-events:none;opacity:0;background:#fff}
#fincard::before{content:'';position:fixed;left:0;right:0;bottom:0;height:46vh;background:linear-gradient(transparent,#000b 60%);z-index:-1}
#fincard{position:fixed;left:0;right:0;bottom:calc(9vh + env(safe-area-inset-bottom));z-index:32;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none;text-align:center;font-family:system-ui,sans-serif;color:#eef0ff;opacity:0;transition:opacity 2.4s ease}
#fincard.on{opacity:1}#fincard h1{margin:0;font:300 clamp(26px,5.4vw,64px)/1 system-ui,sans-serif;letter-spacing:.34em;padding-left:.34em;text-shadow:0 0 40px #8a5cff77,0 2px 0 #0008}
#fincard .st{font:600 clamp(11px,1.5vw,16px)/1.4 system-ui,sans-serif;letter-spacing:.3em;color:#c9cbe8;text-transform:uppercase}#fincard .st b{color:#fff;font-weight:800}
#fincard .tz{font:italic 300 clamp(13px,1.8vw,19px)/1.4 Georgia,serif;letter-spacing:.06em;color:#a9a6d6;margin-top:6px;opacity:0;transition:opacity 3s ease 1.6s}#fincard.on .tz{opacity:1}
#finbtn{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:14px;max-width:calc(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right));pointer-events:auto;opacity:0;transition:opacity 1.6s ease}#finbtn.on{opacity:1}
#finbtn button{min-height:44px;font:700 14px system-ui,sans-serif;letter-spacing:.12em;padding:11px 22px;border-radius:999px;border:1.5px solid #8a7cff99;background:#120a2acc;color:#e8dcff;cursor:pointer;text-transform:uppercase}
#finbtn button:hover{background:#2a1670dd;border-color:#c9a8ff}#finbtn button.pri{background:linear-gradient(#6a48e8,#4a2cc0);border-color:#c9a8ff;color:#fff}
#finskip{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:33;display:flex;align-items:center;justify-content:center;min-height:44px;box-sizing:border-box;font:600 12px system-ui,sans-serif;letter-spacing:.14em;color:#9a98c4;background:#0a0618aa;padding:10px 14px;border-radius:999px;cursor:pointer;opacity:0;transition:opacity .6s;pointer-events:none}#finskip.on{opacity:.8;pointer-events:auto}`;

const tmStr = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Cubic Hermite through [t, v] keys with Catmull-Rom tangents: a camera that never stops dead between keys. */
function herm(K, t) {
  const n = K.length;
  if (t <= K[0][0]) return K[0][1];
  if (t >= K[n - 1][0]) return K[n - 1][1];
  let i = 0; while (K[i + 1][0] < t) i++;
  const [t0, v0] = K[i], [t1, v1] = K[i + 1], h = t1 - t0, u = (t - t0) / h;
  const m0 = i > 0 ? (v1 - K[i - 1][1]) / (t1 - K[i - 1][0]) : (v1 - v0) / h, m1 = i + 2 < n ? (K[i + 2][1] - v0) / (K[i + 2][0] - t0) : (v1 - v0) / h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * m1;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pr = new THREE.Vector3();

export class Finale {
  /**
   * Build and precompile everything the finale draws, 3 ms a frame (called at ~80% of the land, behind the play; `?finale` waits for it). Returns the Finale (not started).
   */
  static async prepare(game, ctx, { fake = false } = {}) {
    const W = game.world, g = W.globe, low = ctx.Q.tier === 'low' || /[?&]webgl/.test(location.search), quality = ctx.Q.tier === 'low' ? 'low' : ctx.Q.tier === 'medium' ? 'medium' : 'high';
    const frame = () => new Promise((r) => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => r())));
    const SU = shardUniforms();
    const gen = buildShards(W.bake, { L: low ? 5 : 6, K: low ? 30 : 44, seed: 11 + (W.seed || 7), bias: 0, ms: 3 });
    let r; while (!(r = gen.next()).done) await frame();
    const geo = r.value;
    const mo = { surf: g.surfTex, night: g.nightTex, bite: g.biteTex, trail: g.trailTex, N: g.N, B: g.B, quality, u: g.u };
    const top = new THREE.Mesh(geo.top, planetMaterial({ ...mo, gt: null, shard: SU })), cut = new THREE.Mesh(geo.cut, cutMaterial(g.u, SU));
    const coreMat = coreMaterial(g.u), core = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), coreMat);
    const SKU = streakUniforms(g.u), streaks = makeStreaks(W.bake, geo.fault, SKU, low), bh = holeSphere(), halo = holeHalo(), diskGlow = makeDiskGlow(SKU);
    for (const m of [top, cut, core, streaks.mesh]) { m.scale.setScalar(R); m.frustumCulled = false; m.visible = false; }
    core.scale.setScalar(R); cut.renderOrder = 0; top.renderOrder = 0; core.renderOrder = 0;
    g.group.add(top, cut, core, streaks.mesh, diskGlow);
    ctx.scene.add(bh, halo);
    await frame();
    const F = new Finale(game, ctx, { geo, SU, top, cut, core, coreMat, streaks, SKU, bh, halo, diskGlow });
    console.info(`[finale] ready: ${geo.shards.length} shards, ${geo.faces} faces, ${geo.walls} fault edges, ${streaks.counts.reduce((a, b) => a + b, 0)} streaks`);
    return F;
  }

  /**
   * Compile the finale's pipelines (the shard top is the globe's whole shader again: one node build is ~150 ms in one frame): called under the Moon's break-up flash (hit-stop, a white
   * frame), or at the finale's own start (it opens on a freeze) if the Moon never came. One mesh a frame, in the planet's scene state.
   */
  compile() {
    return (this._compile ??= (async () => {
      const meshes = [this.top, this.cut, this.core, this.streaks.mesh, this.bh, this.halo, this.diskGlow];
      try { await this.ctx.post.precompile({ traverse: (f) => meshes.forEach(f) }, 12000, this.game.around); } catch (e) { console.warn('finale precompile', e); }
    })());
  }

  constructor(game, ctx, p) {
    Object.assign(this, p);
    this.game = game; this.ctx = ctx; this.W = game.world; this.g = this.W.globe; this.post = ctx.post; this.canvas = ctx.renderer.domElement;
    this.t = 0; this.over = false; this.started = false; this.did = new Set(); this.news = false; this.shake = 0; this.pulse = 0;
    this.cam = { free: true, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: ctx.baseFov, roll: 0, dist: 1e7, aimK: 0, aimF: 0 };
    this.raw = 0; this.swallowed = 0; this.mass = 0; this.silent = false;
    const K = this.geo.shards.length;
    this.K = K; this.sh = this.geo.shards.map((s) => ({ c: s.c.clone(), p0: s.c.clone().multiplyScalar(0.8), n: s.n, off: 0, qo: new THREE.Quaternion(), w: new THREE.Vector3(), om: 0, tk: 0, Dk: 3, ts: 0, ang: 0, rot: 0, done: false }));
    this.coreS = { tk: FT.core0, Dk: FT.coreDur, ts: FT.core0 + 0.93 * FT.coreDur };
    this.massTotal = this.sh.reduce((a, s) => a + s.n, 0) / 0.83; // shards are 83% of the volume (1 - 0.55^3), the core 17%
  }

  /** Plan the run from the hole's place now: the order and timing of the shards, the disk plane, the camera's start. */
  begin() {
    const { W, ctx, sh, g } = this, { state, hole } = ctx, hd = W.hdir;
    this.n = hd.clone(); this.r0 = hole.r;
    this.e1 = new THREE.Vector3(0.31, 0.12, 0.94).addScaledVector(this.n, -this.n.dot(_v.set(0.31, 0.12, 0.94))).normalize(); this.e2 = new THREE.Vector3().crossVectors(this.n, this.e1);
    this.Hc = this.n.clone().multiplyScalar(1 + (W.h0 || 0) / R); // the hole's centre in planet units (planet-local)
    const order = sh.map((s, i) => [Math.acos(clamp(s.c.dot(hd), -1, 1)), i]).sort((a, b) => a[0] - b[0]), K = this.K;
    let seed = 1234; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    order.forEach(([ang, i], rank) => {
      const s = sh[i];
      s.ang = ang; s.tk = FT.fall0 + (FT.fall1 - FT.fall0) * (rank / Math.max(1, K - 1)) ** 0.85 + (rnd() - 0.5) * 0.4; s.Dk = 2.4 + 2.2 * (ang / Math.PI) + rnd() * 0.5; s.ts = s.tk + 0.93 * s.Dk;
      s.off = 0.012 + rnd() * 0.05; s.w.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(); s.om = (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.8); s.rot0 = (rnd() - 0.5) * 0.12;
      s.qo.setFromAxisAngle(s.w, s.rot0); s.rank = rank; s.done = false;
    });
    this.sorted = order.map((o) => o[1]);
    this.events = sh.map((s, i) => [s.ts, i]).sort((a, b) => a[0] - b[0]);
    this.evI = 0;
    // streak timings: [start, span, duration min, spread] and [width, length / s, intensity, spin] per kind (sea, air, lava, debris, disk)
    const K0 = this.SKU.uK.array, hi = this.ctx.Q.tier !== 'low';
    [[FT.peel0, FT.peelSpan, 3.2, 2.2], [2.8, 8, 2.6, 1.8], [3.2, 12, 3.2, 2.4], [4.2, 12, 3.4, 2.8], [0, 0, 1, 1], [FT.peel0, FT.peelSpan, 3.4, 2.0]].forEach((v, k) => K0[k].set(...v));
    [[0.0062, 0.2, 2.0, 1.7], [0.0024, 0.55, 0.7, 2.6], [0.0056, 0.14, 1.1, 1.1], [0.0058, 0.1, 1.0, 1.5], [0.0046, 0.5, 1.0, 0], [0.028, 0.34, 0.3, 1.2]].forEach((v, k) => K0[k + 6].set(...v));
    this.SKU.uDisk.value.set(8.0, 12.0, 1, 0.55);
    for (const o of [this.SKU.uN, this.SKU.uE1, this.SKU.uE2, this.SKU.uH]) o.value.set(0, 0, 0);
    this.SKU.uN.value.copy(this.n); this.SKU.uE1.value.copy(this.e1); this.SKU.uE2.value.copy(this.e2); this.SKU.uH.value.copy(this.Hc);
    this.g.u.uPeel.value.set(this.n.x, this.n.y, this.n.z, -1); this.g.u.uFault.value = 0;
    // the camera's start (the game's own) so the first frame is the last gameplay frame
    const c = ctx.camera, p = c.position, d = p.length();
    this.cam0 = { D: d, el: Math.asin(clamp(p.y / d, -1, 1)), yaw: Math.atan2(p.x, p.z), fov: ctx.baseFov, aimY: 0, aimZ: 0 };
    const D0 = d, e0 = this.cam0.el;
    this.K_D = [[0, D0], [FT.rupt, D0 * 1.08], [6, D0 * 1.32], [11, D0 * 1.55], [17, D0 * 2.2], [23.5, 8.0e7], [28.5, 1.02e8], [60, 1.1e8]];
    this.K_el = [[0, e0], [FT.rupt, e0 * 0.96], [6, 0.42], [12, 0.32], [20, 0.25], [26, 0.2], [60, 0.19]];
    this.K_yaw = [[0, this.cam0.yaw], [8, this.cam0.yaw + 0.2], [19, this.cam0.yaw + 0.06], [27, 0.42], [60, 0.9]];
    this.K_aim = [[0, 0], [6, -0.58 * R], [12, -0.66 * R], [19, -0.36 * R], [24, -0.05 * R], [28, 0], [60, 0]];
    this.K_fov = [[0, ctx.baseFov], [19, ctx.baseFov], [27, ctx.baseFov * 0.8], [60, ctx.baseFov * 0.78]];
    // look
    const doc = document;
    if (!doc.getElementById('fin-css')) doc.head.append(Object.assign(doc.createElement('style'), { id: 'fin-css', textContent: CSS }));
    const el = (tag, id, parent = doc.body) => parent.appendChild(Object.assign(doc.createElement(tag), { id }));
    this.bars = el('div', 'finbars'); this.bars.append(doc.createElement('i'), doc.createElement('i'));
    this.flashEl = el('div', 'finflash'); this.cardEl = el('div', 'fincard'); this.btnEl = el('div', 'finbtn', this.cardEl); this.skipEl = el('div', 'finskip'); this.skipEl.textContent = 'SKIP ›';
    this.skipEl.onclick = () => this.t >= FT.title ? this.toggleControls() : this.skip();
    this.started = true; this.t = 0; this.did.clear(); this.shake = 0.25; this.w = 0; this.warm = 0; this.bloom = 0;
    this.skippable = !!save.finaleSeen || /[?&]finale\b/.test(location.search);
    this.keyH = (e) => {
      if ((e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') && this.skippable && this.t < FT.title) { e.preventDefault(); this.skip(); }
      else if (e.key === 'Escape' && this.t >= FT.title) this.toggleControls(); // (the hold's free look: Esc brings the card back)
    };
    addEventListener('keydown', this.keyH);
    // The free-look of the hold works with a captured mouse or touch pointer.
    this.drag = { on: false, id: null, x: 0, y: 0, yaw: 0, el: 0 };
    this.pdown = (e) => {
      if (this.t < FT.title || this.drag.on || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button, #finskip')) return;
      this.drag.on = true; this.drag.id = e.pointerId; this.drag.x = e.clientX; this.drag.y = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    };
    this.pmove = (e) => {
      if (this.drag.on && e.pointerId === this.drag.id) {
        this.drag.yaw -= (e.clientX - this.drag.x) * 0.004;
        this.drag.el = clamp(this.drag.el + (e.clientY - this.drag.y) * 0.003, -0.3, 0.55);
        this.drag.x = e.clientX; this.drag.y = e.clientY;
      }
    };
    this.pup = (e) => { if (e.pointerId === this.drag.id) { this.drag.on = false; this.drag.id = null; } };
    this.blur = () => { this.drag.on = false; this.drag.id = null; };
    this.canvas.addEventListener('pointerdown', this.pdown);
    this.canvas.addEventListener('pointermove', this.pmove);
    this.canvas.addEventListener('pointerup', this.pup);
    this.canvas.addEventListener('pointercancel', this.pup);
    this.canvas.addEventListener('lostpointercapture', this.pup);
    addEventListener('blur', this.blur);
    const { top, cut, core, streaks, bh } = this;
    g.globe.visible = false; top.visible = cut.visible = core.visible = streaks.mesh.visible = true; this.diskGlow.visible = false;
    state.playing = false; state.asc = this;
    { const e = document.getElementById('hud'); if (e) e.hidden = true; }
    { const c = this.game.cities; if (c) { c.pool.sprite.visible = false; for (const e of c.labels) e.hidden = true; } }
    { const th = this.game.threat; if (th) { th.glow.sprite.visible = th.smoke.sprite.visible = false; } }
    this.game.map?.show(false); this.ctx.edgeArrow?.('town', null); document.getElementById('ripe')?.setAttribute('hidden', ''); document.getElementById('threat')?.setAttribute('hidden', '');
  }

  once(name, t, fn) { if (this.t >= t && !this.did.has(name)) { this.did.add(name); fn(); } }

  /** The clock's rate: slowed on the beats (the rupture, the last mouthful, the silence). */
  rate(t) { return 1 - 0.82 * Math.exp(-(((t - 0.05) / 0.4) ** 2)) - 0.78 * Math.exp(-(((t - FT.rupt - 0.25) / 0.45) ** 2)) - 0.7 * Math.exp(-(((t - FT.last) / 0.7) ** 2)) - 0.35 * Math.exp(-(((t - 9) / 0.25) ** 2)); }

  advance(raw) {
    if (this.over || !this.started) return;
    const { sfx, state } = this.ctx;
    this.raw = raw;
    if (!this.hold) this.t += Math.min(raw, 0.1) * this.rate(this.t) / (window.__finK ?? 1);
    const t = this.t;
    this.once('start', 0, () => {
      this.silent || (sfx.duck(0.05, 0.3), sfx.finale.start(), sfx.finale.mix({ sub: 0.5, groan: 0.2, choir: 0, grind: 0, shim: 0, drone: 0, rise: 0 }, 0.5));
      state.hitstop = 0.35; this.ctx.news.queue.length = 0;
      this.bars.style.transition = 'height 1.4s ease-in'; requestAnimationFrame(() => { for (const i of this.bars.children) i.style.height = '6.5vh'; });
      this.ctx.card?.('THE LAST LAND', 'nothing is left to eat'); 
    });
    this.once('skipOn', 1.2, () => { if (this.skippable) this.skipEl.classList.add('on'); });
    this.once('rupt', FT.rupt, () => {
      this.flash(1.0); this.shake = 1; this.pulse = 1; this.W.holeVis = 0; this.bhOn = true; this.W.shock(this.n, 0.3, 0.9, 2.6, 1.0);
      this.silent || (sfx.finale.rupture(), sfx.duck(1, 0.2));
      state.hitstop = Math.max(state.hitstop || 0, 0.12);
    });
    while (this.evI < this.events.length && this.events[this.evI][0] <= t) { const s = this.sh[this.events[this.evI][1]]; this.evI++; this.swallow(s.n / this.massTotal, this.evI); }
    this.once('core', this.coreS.ts, () => { this.swallow(0.17, this.K + 1, true); });
    this.once('last', FT.last, () => { this.flash(1.0); this.shake = 1; this.silent || sfx.finale.last(); state.hitstop = Math.max(state.hitstop || 0, 0.1); });
    this.once('quiet', FT.quiet, () => { this.silent || (sfx.finale.silence(0.05), sfx.duck(0.0, 0.05)); });
    this.once('drone', FT.drained + 0.5, () => { this.droneOn = true; });
    this.once('title', FT.title, () => this.showCard());
    this.once('buttons', FT.buttons, () => { this.btnEl.classList.add('on'); this.skipEl.classList.remove('on'); });
    this.once('resolve', FT.title + 0.3, () => { this.silent || this.ctx.sfx.finale.resolve(); });
    this.mixAudio(t);
    this.shake = Math.max(0, this.shake - this.raw * 0.55);
    this.pulse = Math.max(0, this.pulse - this.raw * 2.4);
    this.w *= Math.exp(-this.raw * 3.2); this.warm *= Math.exp(-this.raw * 0.4); this.bloom *= Math.exp(-this.raw * 1.6);
    this.flashA = (this.flashA || 0) * Math.exp(-this.raw * 4.5); this.flashEl.style.opacity = this.flashA > 0.01 ? this.flashA.toFixed(3) : 0;
    this.apply(t);
  }

  flash(k) { this.flashA = Math.max(this.flashA || 0, k); this.flashEl.style.opacity = this.flashA; this.w = Math.max(this.w, 0.55 * k); this.bloom = Math.max(this.bloom, 0.6 * k); }

  /** A chunk crosses the horizon: a pulse of the lip, a shudder, the thump (pitch climbing), the hole a step bigger. */
  swallow(share, n, core = false) {
    this.swallowed = n; this.pulse = Math.min(1, this.pulse + 0.35 + 3 * share); this.shake = Math.min(1, Math.max(this.shake, 0.3 + 4 * share));
    this.w = Math.max(this.w, 0.1 + 1.2 * share); this.bloom = Math.max(this.bloom, 0.3 + 2 * share);
    this.silent || this.ctx.sfx.finale.hit(clamp(share * 6, 0.1, 1), n);
    if (core) { this.flash(0.9); this.ctx.state.hitstop = Math.max(this.ctx.state.hitstop || 0, 0.12); }
  }

  /** What the sound does at time t: a groan and sub that swell, the choir climbing, grinding as the chunks go, silence, then the drone and a shimmer that rises. */
  mixAudio(t) {
    if (this.silent || !this.started) return;
    const open = sm(FT.rupt, FT.rupt + 4, t), body = sm(FT.fall0 - 1, FT.fall0 + 5, t), pre = 1 - sm(FT.last - 1, FT.last + 0.1, t), post = sm(FT.drained, FT.drained + 3.5, t);
    const quiet = t > FT.quiet && t < FT.drained ? 0 : 1;
    this.ctx.sfx.finale.mix({
      sub: quiet * pre * (0.35 + 0.65 * open), groan: quiet * pre * (0.25 + 0.75 * open) * (1 - 0.5 * body), choir: quiet * pre * sm(FT.rupt + 1, FT.last, t) * 0.9, grind: quiet * pre * body * (0.4 + 0.6 * sm(8, 17, t)) * (1 - sm(FT.last - 2, FT.last, t)),
      shim: post * sm(FT.lens0, FT.title, t) * (1 - 0.3 * sm(FT.title, FT.title + 6, t)), drone: post * 0.8, rise: sm(FT.rupt, FT.last, t), up: sm(FT.lens0, FT.title + 4, t),
    }, 0.12);
  }

  /** The hole's radius (m) at t: r0 growing with the share of the planet swallowed (each chunk a smoothed step), with the lip's pulse on top. */
  holeR(t) {
    let m = 0;
    for (const s of this.sh) m += s.n * sm(s.tk + 0.7 * s.Dk, s.ts + 0.5, t);
    m = m / this.massTotal + 0.17 * sm(this.coreS.tk + 0.7 * this.coreS.Dk, this.coreS.ts + 0.6, t);
    m = clamp(m);
    return this.r0 * (1 + 1.6 * Math.pow(m, 1.4) + 1.8 * sm(0.78, 1.0, m)) * (1 + 0.05 * this.pulse); // (slow while the planet goes, the last jump with its core)
  }

  /** The state of the whole picture at finale time t (pure of t, apart from the pulse / shake decays). */
  apply(t) {
    const { sh, SU, SKU, g, post, W } = this, n = this.n, H = this.Hc;
    const rb = this.holeR(t), Rb = rb / R, open = sm(FT.rupt, FT.openEnd, t);
    this.rb = rb;
    // ---- shards
    for (let i = 0; i < this.K; i++) {
      const s = sh[i], A = SU.A.array[i], Q = SU.Q.array[i], V = SU.V.array[i], X = SU.X.array[i], u = clamp((t - s.tk) / s.Dk);
      X.set(s.p0.x, s.p0.y, s.p0.z, 0);
      // the opened position: lifted a little along its own direction, turned a little (the crust parts), glowing in the gap
      _p.copy(s.p0).addScaledVector(s.c, s.off * open); _q.identity().slerp(s.qo, open);
      if (u <= 0) { A.set(_p.x, _p.y, _p.z, 1); Q.set(_q.x, _q.y, _q.z, _q.w); V.set(n.x, n.y, n.z, 1); X.w = 0.2 * open; continue; }
      if (u >= 1) { A.set(H.x, H.y, H.z, 1); V.set(n.x, n.y, n.z, 0); X.w = 1; continue; }
      _w.copy(_p).sub(H); const h0 = _w.dot(n); _pr.copy(_w).addScaledVector(n, -h0); const rho0 = _pr.length(), th0 = Math.atan2(_pr.dot(this.e2), _pr.dot(this.e1));
      const q = Math.pow(u, 1.7), rho = rho0 * Math.pow(1 - q, 1.4) + Rb * 0.2 * q, h = h0 * Math.pow(1 - q, 2.3), th = th0 + s.om * 5.0 * (Math.pow(u, 0.9) * (1 + 2.2 * u));
      _a.copy(H).addScaledVector(n, h).addScaledVector(this.e1, Math.cos(th) * rho).addScaledVector(this.e2, Math.sin(th) * rho);
      _v.copy(_a).sub(H); const dl = _v.length(); if (dl > 1e-6) _v.divideScalar(dl); else _v.copy(n);
      const S = 1 + 3.3 * Math.pow(q, 1.9), spin = s.om * (t - s.tk) * (1.7 - 0.9 * q); // (stretched to ~4x at most, the other two axes shrink by 1/sqrt(S): a chunk, not a stick; and it tumbles)
      _q2.setFromAxisAngle(s.w, spin); _q.copy(s.qo).multiply(_q2);
      A.set(_a.x, _a.y, _a.z, S); Q.set(_q.x, _q.y, _q.z, _q.w); V.set(_v.x, _v.y, _v.z, 1 - sm(0.8, 1.0, u)); X.w = 0.3 + 0.7 * sm(0.05, 0.8, u);
    }
    // ---- the core: the last thing standing, stretched into a thread
    {
      const c = this.coreS, u = clamp((t - c.tk) / c.Dk), CU = this.coreMat.userData.U;
      _w.set(0, 0, 0).sub(H).addScaledVector(this.e1, 0.14); const h0 = _w.dot(n); _pr.copy(_w).addScaledVector(n, -h0); const rho0 = _pr.length(), th0 = Math.atan2(_pr.dot(this.e2), _pr.dot(this.e1));
      const q = Math.pow(u, 1.7), rho = rho0 * Math.pow(1 - q, 1.4) + Rb * 0.2 * q, h = h0 * Math.pow(1 - q, 2.3), th = th0 + 3.2 * (Math.pow(u, 0.9) * (1 + 2.2 * u));
      _a.copy(H).addScaledVector(n, h).addScaledVector(this.e1, Math.cos(th) * rho).addScaledVector(this.e2, Math.sin(th) * rho);
      _v.copy(_a).sub(H); const dl = _v.length(); if (dl > 1e-6) _v.divideScalar(dl); else _v.copy(n);
      _q.setFromAxisAngle(_w.set(0.3, 1, 0.2).normalize(), 0.5 * (t - c.tk));
      CU.A.value.set(_a.x, _a.y, _a.z, 1 + 5.5 * Math.pow(q, 2.2)); CU.Q.value.set(_q.x, _q.y, _q.z, _q.w); CU.V.value.set(_v.x, _v.y, _v.z, u >= 1 ? 0 : 1 - sm(0.82, 1.0, u)); CU.X.value.set(0, 0, 0, 0);
      CU.uHeat.value = 0.35 + 0.65 * sm(FT.fall1 - 3, FT.core0 + 3, t);
    }
    // ---- the world's skin: faults ignite, the crust opens, the sea peels, the air and the clouds go
    const gu = g.u;
    gu.uFault.value = sm(0.15, FT.rupt - 0.1, t); gu.uPeel.value.w = t < FT.peel0 ? -1 : clamp((t - FT.peel0) / FT.peelSpan) * Math.PI * 1.04;
    gu.uSkyK.value = lerp(1, 2.2, sm(FT.drained, FT.lens1, t)); gu.uSunK.value = 1 - sm(FT.quiet, FT.lens1 - 1, t);
    // ---- the streaks
    { const dg = this.diskGlow; dg.visible = t > this.SKU.uDisk.value.x; dg.position.copy(H).multiplyScalar(R); dg.scale.setScalar(R * Rb * 7.25); dg.quaternion.setFromUnitVectors(_a.set(0, 0, 1), n); }
    SKU.uT.value = t; SKU.uRb.value = Rb; SKU.uPx.value = 2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) / Math.max(400, innerHeight); SKU.uDisk.value.z = 1 - sm(FT.lens0 + 0.6, FT.lens1 + 1.5, t) * 0.9; SKU.uAlpha.value = 1;
    // ---- the hole: a sphere at the origin, drained to black; then the lens takes it
    const bh = this.bh, U = bh.material.userData.U, kl = sm(FT.lens0, FT.lens1, t), drained = sm(FT.quiet, FT.drained, t);
    { const x = clamp((t - FT.rupt) / 0.7) - 1, ob = 1 + 2.70158 * x * x * x + 1.70158 * x * x; bh.visible = t >= FT.rupt && kl < 0.02; bh.scale.setScalar(rb * (0.55 + 0.45 * ob)); } // (the pit inflates into a sphere with an overshoot)
    { const hl = this.halo, HU = hl.material.userData.U; hl.visible = bh.visible; hl.scale.setScalar(bh.scale.x * 5); HU.uHeat.value = clamp(this.pulse * 0.8); HU.uT.value = t; HU.uK.value = drained; HU.uA.value = sm(FT.rupt, FT.rupt + 0.8, t) * (0.7 + 0.3 * sm(FT.fall0, FT.last, t)); }
    U.uHeat.value = clamp(this.pulse * 0.9); U.uK.value = drained; U.uT.value = t;
    this.bhOn = t >= FT.rupt;
    // ---- fx
    post.fxu.value.set(this.w < 0.003 ? 0 : this.w, this.warm < 0.003 ? 0 : this.warm, this.bloom < 0.003 ? 0 : this.bloom, 0);
    // ---- the camera
    const c = this.cam, cam = this.ctx.camera, hold = sm(FT.title, FT.title + 3, t);
    const D = herm(this.K_D, t), yaw = herm(this.K_yaw, t) + this.drag.yaw + hold * 0.0, el = herm(this.K_el, t) + this.drag.el, aim = herm(this.K_aim, t), cE = Math.cos(el);
    const sk = this.shake * this.shake;
    c.look.set(Math.sin(t * 2.9) * sk * D * 0.004, aim + Math.sin(t * 3.7 + 2) * sk * D * 0.002, 0);
    c.pos.set(Math.sin(yaw) * cE * D, Math.sin(el) * D + c.look.y * 0, Math.cos(yaw) * cE * D).add(c.look);
    c.fov = herm(this.K_fov, t); c.roll = this.shake > 0.3 ? Math.sin(t * 5.1) * 0.04 * (this.shake - 0.3) : 0; c.dist = D;
    this.lensFrame(t, kl, rb);
  }

  /** The lens uniforms: where the hole is on the screen, how big the shadow is, the disk's tilt and brightness. Needs the camera as placed this frame. */
  lensFrame(t, kl, rb) {
    const cam = this.ctx.camera, L = this.post.lens, c = this.cam;
    cam.position.copy(c.pos); cam.up.set(0, 1, 0); cam.lookAt(c.look); if (c.roll) cam.rotateZ(c.roll); cam.fov = c.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    this.halo.quaternion.copy(cam.quaternion);
    _v.set(0, 0, 0).project(cam);
    const d = cam.position.length(), th = Math.asin(Math.min(0.99, rb / d)), rs = 0.5 * Math.tan(th) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    L.A.value.set(_v.x * 0.5 + 0.5, 0.5 - _v.y * 0.5, rs, kl);
    const sE = clamp(cam.position.y / d, 0.12, 0.95);
    L.B.value.set(sE, c.roll * 0.0 - 0.1 * sm(FT.lens0, FT.title, t), t * 0.5, sm(FT.lens0 + 0.9, FT.lens1 + 0.6, t));
    L.C.value.set(1.6, 7.4, 0.72, 1.0);
  }

  afterWorld(W, camera) {
    const g = W.globe, t = this.t; // (W.update has just written the game's own sky values: the finale's go over them)
    g.u.uClouds.value = 0.5 * (1 - sm(FT.rupt, FT.rupt + 3.5, t)); g.u.uAtmo.value = 1 - sm(FT.rupt, FT.rupt + 4.5, t); g.u.uAtmoH.value = g.u.uAtmo.value;
    g.atmo.visible = g.u.uAtmo.value > 0.02; g.sky.visible = true;
    if (this.t > FT.rupt + 0.5 || this.game.moonGone) g.moon.visible = false;
    g.globe.visible = false;
  }

  showCard() {
    const { state } = this.ctx;
    this.cardEl.innerHTML = `<h1>${NAME}</h1><div class="st">World eaten · <b>${tmStr(this.worldTime ?? state.time)}</b> · <b>${popStr(state.pop || 0, true)}</b> swallowed</div><div class="tz">The void is hungry for more…</div>`;
    this.cardEl.append(this.btnEl); this.cardEl.classList.add('on');
    this.btnEl.innerHTML = '';
    const mk = (txt, cls, fn) => { const b = document.createElement('button'); b.textContent = txt; if (cls) b.className = cls; b.onclick = fn; this.btnEl.append(b); return b; };
    this.onButtons?.(mk);
    this.bars.style.transition = 'height 2.5s ease-out'; for (const i of this.bars.children) i.style.height = '9vh';
    save.finaleSeen = true; persist();
  }

  toggleControls(on = !this.cardEl.classList.contains('on')) {
    this.cardEl.classList.toggle('on', on); this.btnEl.classList.toggle('on', on);
    this.skipEl.textContent = on ? 'HIDE CONTROLS' : 'SHOW CONTROLS';
    this.skipEl.classList.add('on');
  }

  /** Skip (after the first completion): straight to the hold, silently. */
  skip() {
    if (this.over || this.t >= FT.title) return;
    this.silent = true; this.ctx.sfx.finale.silence(0.05);
    for (let i = 0; i < 400 && this.t < FT.title + 0.2; i++) { this.t = Math.min(FT.title + 0.2, this.t + 0.2); this.advance(0); }
    this.t = FT.title + 0.2; this.silent = false; this.ctx.sfx.duck(1, 0.2); this.ctx.sfx.finale.mix({ sub: 0, groan: 0, choir: 0, grind: 0, shim: 0.5, drone: 0.7, rise: 1, up: 1 }, 0.3);
    this.skipEl.classList.remove('on');
  }

  /** Scrub (debug): jump to time t without the beats' sounds or side effects (events up to t are marked done). */
  scrub(t) {
    if (!this.started) return;
    this.silent = true; this.t = t;
    this.evI = 0; while (this.evI < this.events.length && this.events[this.evI][0] <= t) this.evI++;
    for (const [k, tt] of [['start', 0], ['skipOn', 1.2], ['rupt', FT.rupt], ['core', this.coreS.ts], ['last', FT.last], ['quiet', FT.quiet], ['drone', FT.drained + 0.5], ['title', FT.title], ['buttons', FT.buttons]]) if (t >= tt) this.did.add(k); else this.did.delete(k);
    if (t >= FT.title) { if (!this.cardEl.classList.contains('on')) this.showCard(); } else this.cardEl.classList.remove('on');
    this.pulse = 0; this.shake = 0; this.w = this.warm = this.bloom = 0; this.flashA = 0;
    this.apply(t); this.silent = false;
  }

  /** Put the world back as it was before the finale (a sweep resets and runs again in the same page; also the end of the debug view). */
  dispose() {
    removeEventListener('keydown', this.keyH); removeEventListener('blur', this.blur);
    this.canvas?.removeEventListener('pointerdown', this.pdown); this.canvas?.removeEventListener('pointermove', this.pmove);
    this.canvas?.removeEventListener('pointerup', this.pup); this.canvas?.removeEventListener('pointercancel', this.pup); this.canvas?.removeEventListener('lostpointercapture', this.pup);
    if (this.drag?.id != null && this.canvas?.hasPointerCapture(this.drag.id)) this.canvas.releasePointerCapture(this.drag.id);
    for (const e of [this.bars, this.flashEl, this.cardEl, this.skipEl]) e?.remove();
    const { state } = this.ctx, g = this.g, W = this.W;
    if (state.asc === this) state.asc = null;
    W.holeVis = undefined; g.globe.visible = true; g.u.uFault.value = 0; g.u.uPeel.value.w = -1; g.u.uSunK.value = 1; g.u.uSkyK.value = 1; g.moon.scale.setScalar(1737400);
    g.group.remove(this.top, this.cut, this.core, this.streaks.mesh, this.diskGlow); this.ctx.scene.remove(this.bh, this.halo);
    for (const o of [this.top, this.cut, this.core, this.streaks.mesh, this.bh, this.halo, this.diskGlow]) { o.geometry.dispose(); o.material.dispose(); }
    this.post.lens.A.value.w = 0; this.post.fxu.value.set(0, 0, 0, 0);
    { const e = document.getElementById('hud'); if (e) e.hidden = false; }
    { const c = this.game.cities; if (c) c.pool.sprite.visible = true; const th = this.game.threat; if (th) th.glow.sprite.visible = th.smoke.sprite.visible = true; }
    this.game.map?.show(true); this.ctx.sfx.finale.stop();
    this.disposed = true;
  }
}
