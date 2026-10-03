// Phase 3 game loop (docs/PHASE3.md): its own per-frame function so Phase 1/2 can't regress. main.js hands it a `ctx` (renderer, post,
// camera, scene, look, the Hole, the run state, sfx, fx pools, flash/hint/card helpers, steer) and calls frame() each tick while
// state.phase === 3. Step 4: the hole on the sphere. Step 5: the bite map (land credit, walls, ridge drag, lowland feast, wound).
// Step 6/R4 (§12): the land is the meal (src/landforms.js units), growth, belly/decay, the goal chain + arrow + HUD, the unit ladder. Not here yet: ascension (8), threats (9).
import * as THREE from 'three/webgpu';
import { PlanetWorld } from './planet.js';
import { P3, TIERS, T3 } from './phase3.js';
import { R } from './planetgen.js';
import { sunDir } from './look.js';
import { loadPack } from './assets.js';
import { modsFor } from './perks.js';
import { PlanetMap } from './planetmap.js';
import { Threat } from './threat.js';
import { scoreWorld } from './progress.js';
import { showResults } from './results.js';
import { save, persist } from './meta.js';
import { Cities } from './cities.js';
import { Finale, FT } from './finale.js';

const KM = (m) => (m >= 1e5 ? `${(m / 1000).toFixed(0)} km` : m >= 1e4 ? `${(m / 1000).toFixed(1)} km` : `${(m / 1000).toFixed(2)} km`);
const SUN_R = new THREE.Vector3(-0.75, 0.6, 0.3).normalize(); // low sun over the left shoulder (render space): relief reads; it follows the hole, so the play area is always lit (review B2)
const qs = new URLSearchParams(location.search);
const num = (k, d) => (qs.has(k) && qs.get(k) !== '' && Number.isFinite(+qs.get(k)) ? +qs.get(k) : d);
const _qi = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _n2 = new THREE.Vector3();
const DUST = new THREE.Color(0xb3a48c);
/** The camera backs off in a tall frame (phones see as much width as desktops), but less than the town does (^0.7): the planet's horizon has to stay in a tall frame, and a big hole reads best. */
const portraitK = (aspect) => Math.max(1, 1.2 / aspect) ** 0.45;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const popStr = (p) => (p >= 1e9 ? `${(p / 1e9).toFixed(p >= 1e10 ? 1 : 2)} B` : p >= 1e6 ? `${(p / 1e6).toFixed(0)} M` : `${(p / 1e3).toFixed(0)} k`);
const km2Str = (a) => (a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)} M km²` : `${Math.round(a / 1e3)}k km²`);
const RIPE_CSS = `#ripe{position:fixed;left:0;top:0;z-index:4;pointer-events:none;font:800 12px system-ui,sans-serif;letter-spacing:.06em;color:#e8dcff;background:#2a1260c8;padding:3px 10px;border-radius:999px;box-shadow:0 0 0 1.5px #c9a8ff99;white-space:nowrap}#ripe[hidden]{display:none}
.gain{position:fixed;left:0;top:0;z-index:5;pointer-events:none;font:900 22px system-ui,sans-serif;color:#fff3dd;text-shadow:0 2px 0 #0008,0 0 14px #8a5cffcc;white-space:nowrap;opacity:0}.gain small{font-size:12px;display:block;opacity:.85;text-align:center}
#size.pulse b{animation:szpulse .6s ease-out}@keyframes szpulse{40%{transform:scale(1.35);color:#c9a8ff}}`;
const KINDS = ['province', 'provinces', 'nation', 'nations', 'world']; // the goal chain (§12.3, amended: five nations at T3, continents are a counter)

export class PlanetGame {
  constructor() { this.world = null; this.camDist = 0; this.lead = new THREE.Vector2(); this.dbg = {}; this.cpu = { world: 0, bite: 0, step: 0 }; }

  /**
   * Build the world (async; `slice` = the ascension's 3 ms time slicer: the planet is baked and built behind Phase 2, nothing here touches the scene's state) and
   * compile its pipelines. commit() then swaps it in. begin() = both, behind a loading line (?planet).
   */
  async prepare(ctx, slice = null, r0 = num('r', P3.startR)) {
    const quality = ctx.Q.tier === 'low' ? 'low' : ctx.Q.tier === 'medium' ? 'medium' : 'high';
    const seed = num('seed', 7);
    const W = this.world = await PlanetWorld.create(seed, { quality, workers: !qs.has('noworker'), slice, onStage: (t) => ctx.stage?.(t) });
    W.bind({ scene: ctx.scene, camera: ctx.camera, look: ctx.look, post: ctx.post, renderer: ctx.renderer, sun: ctx.sun });
    this.around = (fn) => (this.entered ? fn() : W.around(fn)); // (compile in the planet's scene state before the swap: W.sceneState)
    await loadPack(ctx.assets, 'planet', null, slice ? { gentle: true } : undefined);
    if (!qs.has('nomap')) { this.map = new PlanetMap(ctx.renderer, W.globe); this.map.show(false); await this.map.precompile(); } // (the minimap: §6.3)
    if (!qs.has('noarmy') && !qs.has('nothreat')) { ctx.stage?.('Arming the world…'); this.threat = new Threat(this, ctx); await this.threat.init(); } // (the DEFCON director, src/threat.js)
    this.cities = new Cities(this, ctx); this.cities.attach(this.map); try { await ctx.post.precompile({ traverse: (f) => f(this.cities.pool.sprite) }, 3000, this.around); } catch (e) { console.warn('cities precompile', e); }
    if (slice) { // (under Phase 2: the globe, sky and patch pipelines compile here, one mesh a frame; the textures go up to the GPU one a frame; the first patch is built: the swap does none of it)
      await ctx.post.precompile(W.globe.group, 20000, this.around);
      await ctx.post.precompile(W.globe.sky, 8000, this.around);
      const g = W.globe;
      for (const t of [g.surfTex, g.nightTex, g.biteTex, g.trailTex, ...Object.values(g.gt)]) { ctx.renderer.initTexture(t); await slice(); }
      this.placeStart(r0); W.buildPatchNow(r0);
    }
    this.prepared = true;
    return this;
  }

  /** Put the hole at the start (the islet by the coast; ?view=pole, ?at=city debug) and the sun over the left shoulder. */
  placeStart(r0 = P3.startR) {
    const W = this.world;
    if (qs.get('view') === 'pole') W.placeAt(new THREE.Vector3(0, 1, 0));
    else if (qs.get('at') === 'city') W.placeAt(W.P.city, W.P.startDir); // (debug: the mainland)
    else {
      // the minute-one hook (A11): face the nearest peninsula / isle (a 0.3-0.8 pi r0^2 coastal unit 1.5-10 r0 away), so the first bite is a tear
      let face = W.P.city; const lf = W.bite.lf, s = W.P.startDir;
      if (lf?.ready) {
        const pi = Math.PI * (r0 / 1000) ** 2; let bd = 1e9;
        for (const L of [1, 2]) {
          const v = lf.lv[L];
          for (let u = 0; u < v.n; u++) {
            const a = v.area0[u]; if (!(a > 0.3 * pi && a < 0.8 * pi)) continue;
            const d = Math.acos(Math.min(1, v.c[u * 3] * s.x + v.c[u * 3 + 1] * s.y + v.c[u * 3 + 2] * s.z)) * R / r0, sc = d * (v.coast[u] / v.np[u] > 0.5 ? 1 : 1.6); // (a peninsula / isle wins over inland pieces)
            if (d >= 1.5 && d <= 10 && sc < bd) { bd = sc; face = { x: v.c[u * 3], y: v.c[u * 3 + 1], z: v.c[u * 3 + 2] }; }
          }
        }
        this.hook = bd < 1e9 ? bd : null;
      }
      W.placeAt(s, face);
    }
    W.setSunRender(SUN_R);
  }

  /** The swap: the town / region goes, the planet is the scene, the hole is dropped in at r0. cinematic: the ascension keeps the HUD and the controls off until it is done. */
  commit(ctx, { cinematic = false, r0 = num('r', P3.startR) } = {}) {
    const W = this.world, { hole, state } = ctx;
    P3.feast = num('feast', P3.feast);
    ctx.dropTown(); // the town (and any Phase 2 region) goes; stand-ins keep the shared code honest
    W.enter({ scene: ctx.scene, camera: ctx.camera, look: ctx.look, post: ctx.post, renderer: ctx.renderer, sun: ctx.sun });
    this.entered = true;
    this.threat?.show(); this.cities?.show();
    ctx.wisps.sprite.visible = false; ctx.birds.sprite.visible = false;
    this.placeStart(r0);
    hole.area = Math.PI * r0 * r0;
    hole.x = hole.z = 0; hole.vx = hole.vz = 0; hole.sx = hole.sz = 0; hole.hidden = false; hole.capMode = false;
    state.phase = 3; state.belly = 1; state.tier = P3.tier(r0); state.left = 0; state.wallHint = 0; state.land = 0;
    W.update(0, hole, ctx.camera, innerHeight);
    if (!W.capMode && !W.patchInfo) W.buildPatchNow(r0); // (the cinematic built it behind Phase 2)
    W.update(0, hole, ctx.camera, innerHeight);
    this.hole = hole; this.ctxRef = ctx;
    if (this.map) { this.map.show(!cinematic); this.map.place(W, hole); } // (the minimap waits for the end of the cinematic)
    state.sealed = false; state.over = false; state.gRate = 0; state.hitsByTier = {}; this.landLog = []; this.logT = -99;
    { const st = document.getElementById('status'); if (st) st.textContent = ''; } ctx.chips?.(); // (A12: no stale Phase 2 line, no Phase 2 perk chips)
    state.pop = this.world.bite.pop; state.ledger = { land: 0, tear: 0, pull: 0, fed: 0, starve: 0 }; state.tierAt = { 1: 0 }; state.goalDone = []; state.continents = 0; state.won = false; state.shake = 0; state.slowT = 0; state.stun = 0;
    this.camDist = 0;
    if (!cinematic) this.armRun(ctx, r0);
    this.installDebug(ctx);
    state.ng = qs.has('ng') ? 1 : 0;
    if (state.ng && save.legacyPerk && !qs.has('r')) ctx.takePerk?.(save.legacyPerk);
    state.playing = !cinematic;
  }

  /** The start of the run proper: the bite map as it is now is what reset() and the Sealed checkpoint return to. */
  armRun(ctx, r0 = ctx.hole.r) {
    const W = this.world;
    this.snap0 = W.bite.save(); this.r0 = r0; // (the start of the run: __planet.reset() for balance sweeps)
    this.ckpt = { tier: P3.tier(r0), snap: this.snap0, holeQ: W.holeQ.clone() }; // (the Sealed loss restores the latest tier-up: §8)
  }

  installDebug(ctx) {
    const W = this.world;
    window.__planet = this.debugApi(ctx);
    window.__planetLand = () => W.bite.landEaten * 100; // % of the world's land eaten
    window.__planetDbg = window.__planet.dbg; // r, tier, e_eff, speed, patch builds, bite/world/step ms
    window.__planetLadder = () => this.ladderTest(ctx);
    window.__planetUnits = () => this.unitsApi(ctx);
    if (import.meta.env.DEV && qs.has('land') && !this.landDebug) { this.landDebug = true; setTimeout(() => console.info(`[land] ${(this.fastLand(+qs.get('land') || 0.89) * 100).toFixed(2)}% eaten`), 1200); } // ?planet&land=0.89: the world as it is at 89% (the bite map really chewed, the credit thrown away)
    if (import.meta.env.DEV && qs.has('finale') && !this.finDebug) { // ?planet&finale[=t]: build the finale, take the land away and play it (or scrub to t)
      this.finDebug = true;
      setTimeout(async () => {
        const st = ctx.state; st.playing = false; ctx.hole.area = Math.PI * (num('r', 2.3e6)) ** 2; window.__bot = () => [0, 0];
        if (qs.get('fake') !== '0') this.fakeLand(1);
        const F = await this.finalePrep(ctx); if (!F) return console.warn('finale not ready');
        this.world.update(0, ctx.hole, ctx.camera, innerHeight); this.camDist = 0; for (let i = 0; i < 4; i++) window.__tick(1 / 30, 3);
        await this.startFinale(ctx); const t = +qs.get('finale'); if (t > 0) window.__finale(t);
      }, 1500);
    }
    window.__P3 = P3; // (balance knobs between runs: __P3.gRamp, __P3.collapseK, ...)
  }

  /** ?planet: prepare + commit behind the loading line. */
  async begin(ctx) {
    await this.prepare(ctx);
    this.commit(ctx);
    return this;
  }

  /** Throw a prepared (never swapped in) world away: the run ended in Phase 2. */
  discard() {
    if (this.entered) return;
    this.threat?.dispose(); this.threat = null; this.cities?.dispose(); this.cities = null;
    this.map?.dispose(); this.map = null;
    this.world?.globe.dispose(); this.world = null;
  }

  /** One frame. dt already includes slow-mo/hit-stop. */
  frame(dt, ctx) {
    const t0 = performance.now(), W = this.world, { state, hole, camera, post, renderer, look, sun } = ctx;
    if (!W) return;
    if (!state.playing || state.asc) ctx.sfx.grind.stop();
    if (state.asc) state.pop = W.bite.pop; // (the reveal's ticker counts the islet)
    if (state.playing) {
      state.time += dt;
      this.step(dt, ctx);
    }
    const t1 = performance.now();
    const r = hole.r, tier = P3.tier(r);
    // ---- camera (§6.1): pitch and E ride r; target = the origin plus a small lead along the velocity. During the ascension (src/ascend.js) the cinematic owns it:
    // the camera orbits the hole at `dist` / `pitch` / `yaw`, looks `aimK` of the way to the planet's centre (the reveal) and `aimF` x dist ahead of the hole.
    const A = state.asc?.cam;
    const fx = this.fx;
    let camDist, pitch;
    if (A?.free) { // the finale's keyframed camera (src/finale.js): position and target in render space
      camDist = this.camDist = A.dist; pitch = 0;
      camera.position.copy(A.pos); camera.up.set(0, 1, 0); camera.lookAt(A.look); if (A.roll) camera.rotateZ(A.roll);
      if (Math.abs(camera.fov - A.fov) > 1e-3) { camera.fov = A.fov; camera.updateProjectionMatrix(); }
    } else if (A) {
      camDist = this.camDist = A.dist; pitch = A.pitch;
      const hz = Math.cos(pitch) * camDist;
      camera.position.set(Math.sin(A.yaw) * hz, Math.sin(pitch) * camDist, Math.cos(A.yaw) * hz);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, -A.aimK * (R + W.h0) + A.aimK * 0.2 * R, -A.aimF * camDist); // (the reveal looks a little above the planet's centre: the planet sits low, under the name card)
      if (A.roll) camera.rotateZ(A.roll);
      if (Math.abs(camera.fov - A.fov) > 1e-3) { camera.fov = A.fov; camera.updateProjectionMatrix(); }
    } else {
      const want = this.homeCam(ctx).dist * (fx && fx.pullT < 3.6 ? (fx.pullT += dt, 1 + 0.15 * Math.min(1, fx.pullT / 0.6) * Math.max(0, Math.min(1, (3.6 - fx.pullT) / 1.2))) : 1); // (a continent: the camera backs off 15% for 3 s)
      this.camDist = this.camDist ? this.camDist + (want - this.camDist) * Math.min(1, dt * (want > this.camDist ? 0.6 : 2)) : want; // (A6: the camera follows growth slowly and settles back fast, so the hole swells on screen before the world rescales)
      { const mo = this.threat?.byName.moon?.items[0], tgt = mo?.on && mo.phase !== 'idle' ? 1 : 0; this.moonCam = (this.moonCam || 0) + (tgt - (this.moonCam || 0)) * Math.min(1, dt * (tgt ? 0.5 : 0.25)); } // (the Moon beat: the camera backs off and lowers so the sky above the limb is in frame)
      camDist = this.camDist * (1 + 0.55 * (this.moonCam || 0)); pitch = P3.pitch(r) * (1 - 0.45 * (this.moonCam || 0));
      const kl = Math.min(1, dt * 3);
      this.lead.x += ((hole.sx || 0) * 0.025 * camDist - this.lead.x) * kl; this.lead.y += ((hole.sz || 0) * 0.025 * camDist - this.lead.y) * kl; // (the lead pushes the hole down the frame; the aim already put it at ~70%)
      const horiz = Math.cos(pitch) * camDist;
      camera.position.set(this.lead.x, Math.sin(pitch) * camDist, this.lead.y + horiz);
      const pn = ctx.pain; if (pn && (pn.cx || pn.cz)) { const s3 = camDist * 0.03; camera.position.x += pn.cx * s3; camera.position.z += pn.cz * s3; } // (the shove of a hit: away from the cause, springing back)
      const tr = state.shake, sh = tr * tr * camDist * 0.02, ts = state.time; // (§5.3: trauma is a slow sway, and above 0.3 a roll: never jitter)
      if (sh > 1e-4) { camera.position.x += (Math.sin(ts * 2.9) + 0.5 * Math.sin(ts * 6.3 + 1)) * sh; camera.position.y += Math.sin(ts * 3.7 + 2) * sh * 0.5; camera.position.z += Math.cos(ts * 2.3) * sh * 0.7; }
      camera.lookAt(this.lead.x, 0.1 * camDist * (this.moonCam || 0), this.lead.y - 0.14 * camDist * P3.aim(r) / 4); // (§12.1: aimed above the hole, so the limb and the black sky are in frame from the first second)
      if (tr > 0.3) camera.rotateZ(Math.sin(ts * 5.7) * 0.05 * (tr - 0.3) / 0.7);
      if (pn && pn.roll) camera.rotateZ(pn.roll);
    }
    const alt = camera.position.y + W.h0, far = Math.max(camDist * 4, 1.2 * Math.sqrt(2 * R * alt + alt * alt), 1.15 * (Math.sqrt(2 * R * alt + alt * alt) + 0.2475 * R)), near = camDist * 0.02; // (far's last term: the atmosphere shell's far wall behind the limb, or the glow is clipped)
    if (Math.abs(camera.far - far) > far * 0.05 || Math.abs(camera.near - near) > near * 0.1) { camera.far = far; camera.near = near; camera.updateProjectionMatrix(); }
    // ---- the world: group placement, patch, bite upload; then the hole itself (it sits on the ground under it)
    const tw = performance.now();
    W.holeVis = 1 + (ctx.pain?.s || 0); // (hit feedback: the drawn hole springs from the old radius to the new one)
    W.setSunRender(SUN_R); // (the sun rides with the hole: no night side to play on; the far globe still has its terminator)
    W.update(dt, hole, camera, renderer.domElement.height);
    this.cpu.world = performance.now() - tw;
    this.painFx(ctx, W);
    state.asc?.afterWorld(W, camera);
    this.threat?.post(ctx);
    if (this.cities) { _qi.copy(W.holeQ).invert(); this.cities.post(_qi, W.globe.group.position); }
    hole.update(dt, state.time, Math.max(0, 0.5 - state.belly) * 2, W.span, W.tilt);
    // the sun is fixed in planet space: rotate it into render space for the hole's own lighting and the shared sunDir
    W.sunRender(_s);
    this.map?.place(W, hole);
    sun.position.copy(_s).multiplyScalar(1000); sun.target.position.set(0, 0, 0);
    sunDir.value.copy(_s);
    ctx.sparks.update(dt); ctx.debris.update(dt);
    if (state.playing) this.hud(ctx, tier);
    ctx.news.update(dt, state.pop || 0, !!state.playing || !!state.asc?.news);
    this.map?.update(dt, { hole, world: W, tier, land: W.bite.landEaten, goal: this.goal, lf: W.bite.lf });
    this.cpu.step = t1 - t0;
    if (!window.__headless) {
      if (document.visibilityState === 'visible' && !qs.has('nowatch')) post.watch(dt);
      const ts = ctx.fpsEl && performance.now();
      post.render([1, 1, 1]);
      if (this.map && !qs.get('off')?.includes('map')) this.map.render(); // (after the post pipeline, scissored to its own corner)
      if (ctx.fpsEl) ctx.perf.sub += performance.now() - ts;
    }
  }

  /** Hit feedback into the shader and the post pass (src/pain.js): the cause's direction as a tangent at the hole, the dent / wound numbers, where the hole is on screen. */
  painFx(ctx, W) {
    const pn = ctx.pain; if (!pn) return;
    const u = W.globe.u;
    if (pn.hasSrc) { _p.copy(pn.src).addScaledVector(W.hdir, -pn.src.dot(W.hdir)); const l = _p.length(); if (l > 1e-9) { _p.divideScalar(l); u.uPain.value.set(_p.x, _p.y, _p.z, 1); } else u.uPain.value.w = 0; } else u.uPain.value.w = 0;
    u.uPainP.value.set(pn.age, pn.wound, pn.imp, pn.heart); u.uPainQ.value.x = pn.crack;
    if (pn.age < 6 || pn.wound > 0) { ctx.camera.updateMatrixWorld(); _s.set(0, 0, 0).project(ctx.camera); pn.setCenter(_s.x * 0.5 + 0.5, 0.5 - _s.y * 0.5); }
  }

  /** The camera the game would use now at the hole's radius (the portrait stretch and LENS included): the ascension's plunge ends exactly here. */
  homeCam(ctx, r = ctx.hole.r) {
    const portrait = portraitK(ctx.camera.aspect);
    return { dist: P3.camDist(r) * portrait * ctx.LENS, pitch: P3.pitch(r), aimF: 0.14 * P3.aim(r) / 4, fov: ctx.baseFov };
  }

  /** The game step: steering, terrain rules (§3), the bite (§2.5), growth, belly. */
  step(dt, ctx) {
    const W = this.world, { state, hole } = ctx, r = hole.r, tier = P3.tier(r), D = P3.depth(r) * (state.mods?.depth ?? 1) * (state.frenzy > 0 ? 2 : 1); // (Frenzy: bite twice as deep)
    const [sx, sz] = window.__bot ? window.__bot(hole, ctx.city) : ctx.steer();
    const kv = 1 - Math.exp(-dt / P3.turn(r));
    hole.sx = (hole.sx || 0) + (sx - (hole.sx || 0)) * kv;
    hole.sz = (hole.sz || 0) + (sz - (hole.sz || 0)) * kv;
    // what is under the hole: height x what is left of it
    const here = W.eff(0, 0), Ek = 1 + (W.E - 1) * smooth(40e3, 450e3, r) * P3.heightK; // (A10: the walls and the drag compare the height the player SEES (x E, ramped in), so a summit stays a summit past T1)
    here.e *= Ek;
    let mult = 1;
    if (this.wetPrev) mult = P3.oceanSpeed(tier) * (state.mods?.sea ?? 1); // the sea: no credit, slower while small (wet = the centre is at sea AND the disc ate nothing last frame: a coast is not the sea)
    else if (here.e < D) mult = 1.1; // lowland feast
    else if (here.e < P3.wallK * D) mult = 1 - 0.5 * (here.e - D) / (3 * D); // ridge drag: eaten from the top down over several passes
    const slow = (state.slow > 0 ? (state.slowK ?? 0.45) : 1) * (state.ash ? 0.7 : 1) * (state.stun > 0 ? T3.stunSlow : 1);
    const speed = P3.speed(r) * mult * slow * (state.frenzy > 0 ? 1.3 : 1) * (state.mods?.speed ?? 1) * (ctx.speedK?.() ?? 1);
    const kick = state.kick || (state.kick = { x: 0, z: 0 });
    let dx = (hole.sx * speed + kick.x * r / 60) * dt, dz = (hole.sz * speed + kick.z * r / 60) * dt;
    kick.x *= Math.max(0, 1 - dt * 5); kick.z *= Math.max(0, 1 - dt * 5);
    // walls: a column taller than 2 r can't be bitten: slide along it (x only, then z only, else stop)
    const wallAt = (x, z) => { const q = W.eff(x, z); q.e *= Ek; return q.e > P3.wallK * D && q.e > here.e ? q.e : 0; }; // (never trapped: downhill is always open)
    let w = dx || dz ? wallAt(dx, dz) : 0;
    if (w) {
      if (state.time > (state.wallHint || 0)) { state.wallHint = state.time + 6; ctx.hint(`Too tall — grow to ${KM(w / Ek / (P3.wallK * 0.03))}`); }
      const wx = dx ? wallAt(dx, 0) : 0, wz = dz ? wallAt(0, dz) : 0;
      if (!wx) dz = 0; else if (!wz) dx = 0; else { dx = 0; dz = 0; }
      state.walls = (state.walls || 0) + 1;
    }
    const moved = Math.hypot(dx, dz);
    W.moveHole(dx, dz);
    hole.x = hole.z = 0;
    hole.vx = dt > 0 ? dx / dt : 0; hole.vz = dt > 0 ? dz / dt : 0;
    const L = state.ledger;
    // the bite: credit = the decrease of the land left (§2.5)
    const tb = performance.now();
    const credit = W.bite.chew(W.hdir, r, dt, moved, state.mods?.hcol ?? 0.5);
    W.bite.upload();
    this.cpu.bite = performance.now() - tb;
    // tear-offs and the pull-in (§12.3): the units the disc touched, the remnants within reach; their credit is not land credit under the ocean rule
    const B = W.bite;
    B.tearCheck(W.hdir, r); B.pullCheck(W.hdir, r, state.time, state.mods?.pull ?? 1); B.stepTears(dt);
    const G = P3.g(r) * P3.feast * (state.fallout ? T3.falloutLand : 1) * (state.surge ? 1.5 : 1) * (state.magma > 0 ? T3.kinds.volcano.surge : 1) * (state.rubble ? T3.kinds.tsunami.rubble : 1), tc = B.cTear * G * (state.mods?.tear ?? 1) * (state.time - (this.comboAt ?? -9) < 2.5 ? 1 + 0.1 * Math.min(5, this.combo || 0) : 1), pc = B.cPull * G; // (fallout x0.5, Hunger Surge x1.5: threat.js)
    if (tc + pc > 0) { const a0 = hole.area; hole.area += tc + pc; state.belly = Math.min(1, state.belly + (tc + pc) / (a0 * P3.meal)); L.tear = (L.tear || 0) + tc; L.pull = (L.pull || 0) + pc; }
    for (const ev of B.events) this.swallow(ev, ctx);
    B.events.length = 0;
    state.pop = B.pop;
    // the swath's dust curtain: an arc off the leading rim every 0.4 r of travel (§12.5), and the cap's rim band widens with the credit rate
    this.dustMoved = (this.dustMoved || 0) + (credit > 0 ? moved : 0);
    if (this.dustMoved > 0.4 * r && credit > 0) {
      this.dustMoved = 0;
      const hl = Math.hypot(hole.sx, hole.sz) || 1, th = Math.atan2(hole.sz / hl, hole.sx / hl), S = Math.min(0.34 * r, ctx.camera.position.length() * 0.14);
      for (let q = -2; q <= 2; q++) {
        const a = th + q * 0.34 + (Math.random() - 0.5) * 0.15, cx = Math.cos(a), cz = Math.sin(a), x = cx * r * 1.02, z = cz * r * 1.02, y = W.groundY(x, z) + S * 0.55, sp = r * (0.2 + Math.random() * 0.15);
        ctx.debris.puff(x, y, z, cx * sp * 0.5, S * (0.5 + Math.random() * 0.4), cz * sp * 0.5, S * (0.8 + Math.random() * 0.5), S * 0.5, 2.0 + Math.random() * 0.8, DUST, 0.26); // (it lifts off the rim: a curtain above the lip, not a smudge on it)
      }
    }
    this.rim = (this.rim || 0) + (Math.min(1, (credit * P3.g(r) * P3.feast) / (Math.max(dt, 1e-3) * hole.area) * 40) - (this.rim || 0)) * Math.min(1, dt * 3);
    W.globe.u.uRim.value = this.rim;
    ctx.sfx.grind.set(state.won ? 0 : this.rim, tier); // (A4: the grind swells on land, falls to silence over the sea)
    { // the music bed (D6): the chord follows the tier, a pulse follows DEFCON, a surf wash where the cap overlaps a coast (8 rim probes at 2 Hz)
      const sx = ctx.sfx;
      if (tier !== this._bedTier) { this._bedTier = tier; sx.setTier(tier); }
      if ((state.defcon ?? 5) !== this._bedDc) { this._bedDc = state.defcon ?? 5; sx.bed.defcon(this._bedDc); }
      this._surfT = (this._surfT || 0) - dt;
      if (this._surfT <= 0) {
        this._surfT = 0.5; let sea = 0, land = 0;
        for (let q = 0; q < 8; q++) { const d = W.P.step(W.hdir, q * 0.785, r); if (W.bite.landAt(d) < 0) sea++; else land++; }
        sx.bed.surf(sea && land ? 1 : 0);
      }
    }
    const dA = credit * G; // (ocean texels already give 0 credit: the old centre-at-sea multiplier threw a third of the T4 swath away)
    this.wetPrev = here.h < 0 && credit <= 0;
    if (dA > 0) {
      const a0 = hole.area;
      hole.area += dA;
      state.belly = Math.min(1, state.belly + dA / (a0 * P3.meal));
      L.land += dA; state.ledgerLand = L.land;
    }
    if (state.time - (this.logT ?? -99) >= 5) { this.logT = state.time; (this.landLog ??= []).push([+state.time.toFixed(1), +B.landEaten.toFixed(4)]); } // (the results' land timeline)
    if (B.landEaten >= 0.8 && !this.finPromise) this.finalePrep(ctx); // (the finale's shards, interior and shaders are built behind the play, 3 ms a frame)
    this.goalTick(ctx, dt);
    this.ripeTick(ctx, dt);
    this.threat?.update(dt, ctx);
    this.cities?.update(dt, ctx);
    // belly and decay (§4.5): a full belly lasts 30 s; fed 0.1%/s, starving 0.8%/s
    const oceanDrain = this.wetPrev ? P3.oceanDrain(tier) : 1;
    const hunt = B.landEaten >= 0.97; // §12.4: no decay in the hunt (the last specks of land are a chase, not a famine)
    if (!hunt) state.belly = Math.max(0, state.belly - P3.bellyDrain * oceanDrain * (state.fallout ? 1.8 : 1) * (state.mods?.hunger ?? 1) * dt);
    const dr = hunt ? 0 : (state.belly > 0 ? P3.decayFed : P3.decayStarving) * dt * Math.min(1, Math.max(0, (0.97 - B.landEaten) / P3.huntSoft)), a1 = hole.area; // (decay fades out over the last 30% of the land: the remaining land is far apart, and a hole that starves on the crossings never reaches it)
    hole.area *= 1 - dr;
    if (state.belly > 0) L.fed -= a1 * dr; else L.starve -= a1 * dr;
    hole.area = Math.max(hole.area, Math.PI * ((this.threat?.sealOn ? 0.5 : P3.floorK) * TIERS[Math.max(tier, state.tier || 1) - 1].r) ** 2); // (below 0.7 x the floor of the highest tier the Void Lid comes down: threat.sealWatch; 0.5 x is the hard floor. Without the director the old 0.7 clamp stays)
    hole.vac = Math.max(0, (hole.vac || 0) - dt);
    hole.bump = Math.max(0, (hole.bump || 0) - dt * 2);
    state.best = Math.max(state.best || 0, hole.r);
    state.land = W.bite.landEaten;
    state.gRate = (state.gRate || 0) + ((dA + tc + pc) / Math.max(dt, 1e-3) - (state.gRate || 0)) * Math.min(1, dt / 30); // (EMA of income, area/s, tau 30 s: tears land in bursts, a 10 s window made a hit cost 1-48% depending on luck; the threats' damage is a number of seconds of it)
    state.shake = Math.max(0, state.shake - dt * 1.5);
    if (state.slowT > 0 && (state.slowT -= dt) <= 0) state.slowmo = 1;
    // tier-up (§6.1): hitstop, a slow beat, the name card
    const nt = P3.tier(hole.r);
    if (nt > (state.tier || 1)) {
      state.tier = nt; state.tierAt[nt] = state.time; (state.tierLand ??= {})[nt] = state.land;
      hole.shockwave(); W.shock(W.hdir, 0.6 * hole.r / R, 1.5 * hole.r / R, 1.2, 1);
      state.hitstop = Math.max(state.hitstop || 0, 0.25); state.slowmo = 0.4; state.slowT = 0.6; state.punch = 1;
      this.checkpoint(ctx); this.camDist *= 1.12; { const sz = document.getElementById('size'); sz?.classList.remove('pulse'); void sz?.offsetWidth; sz?.classList.add('pulse'); } // (the pull-out beat: the hole visibly swells, then the camera settles)
      ctx.card(`Tier ${nt} · ${KM(hole.r)}`, TIERS[nt - 1].name);
      ctx.sfx.levelUp();
      ctx.news.say(`${TIERS[nt - 1].name}: the void is now ${KM(hole.r)} wide — ${popStr(state.pop || 0)} swallowed so far`);
    }
  }

  /**
   * A unit tears off or is pulled in (§12.5): the feel lives here. Class by what it is relative to the hole: 0 nothing but the swath's own dust (a parcel, a speck),
   * 1 district / island, 2 province, 3 nation, 4 continent. Hitstop / shake / slow-mo are budgeted: the max of what is asked, at most one hitstop per 1.5 s.
   */
  swallow(ev, ctx) {
    if (ev.type !== 'start') return;
    const { state, hole, sfx, debris, news } = ctx, W = this.world, r = hole.r, t = state.time, rEq = ev.rEq;
    state.lastTear = ev;
    let cls = ev.L === 0 ? 0 : ev.L === 1 ? 1 : ev.L === 2 ? 2 : ev.L === 3 ? (ev.area0 < 3e5 ? 1 : 3) : (ev.area0 < 3e5 ? 1 : 4);
    if (rEq < 0.12 * r) cls = 0; // (a speck beside this hole)
    else if (rEq < 0.3 * r) cls = Math.min(cls, 1);
    if (cls === 0) { if (rEq > 0.04 * r) ctx.sfx.pebble(); return; } // (a parcel: a dry crackle)
    this.threat?.notice([0, 1, 3, 6, 10][cls]);
    if (cls >= 2 && ev.kind !== 'pull') this.threat?.coastTear(ev);
    if (ev.kind !== 'pull') { // the collapse combo (A5): tears within 2.5 s of the last one chain; +10% credit per level (to 5)
      this.combo = t - (this.comboAt ?? -9) < 2.5 ? (this.combo || 0) + 1 : 0; this.comboAt = t;
      if (this.combo >= 3 && t - (this.comboCard ?? -9) > 3) { this.comboCard = t; ctx.card(`×${this.combo} COLLAPSE`, `+${10 * Math.min(5, this.combo)}% on torn land`); }
    }
    this.gainLabel(ev, cls, ctx);
    const fx = this.fx ??= { hitAt: -9, hitCls: 0, pull: 0, pullT: 9, tok: 3, tokAt: 0 }, pull = ev.kind === 'pull';
    fx.tok = Math.min(3, fx.tok + (t - fx.tokAt) * 2); fx.tokAt = t; // effect tokens: 2 a second, 3 banked (a cascade of tears is one big event to the eye)
    const cost = cls >= 3 ? 3 : cls === 2 ? 2 : 1, show = fx.tok >= cost; if (show) fx.tok -= cost;
    const dist = W.distTo(ev.dir), life = 1.2 + cls * 0.25, k = Math.min(1, Math.max(0.2, Math.sqrt(rEq / r) * 0.5));
    // the shock ring across the land: from the centroid out to 1.5 r_eq (the shader clears the clouds inside it)
    const a0 = 0.05 * rEq / R, a1 = 1.5 * rEq / R;
    if (show) W.shock(ev.dir, a0, (a1 - a0) / life, life, pull ? 0.5 : 0.7 + 0.1 * cls);
    // dust and ash where it stood: puffs of rEq size, a ring rolling out and (province up) two column layers
    const h = Math.max(0, W.P.elevation(ev.dir, 6)), p0 = W.renderPos(ev.dir, h, _p.set(0, 0, 0)), up = W.normalAt(ev.dir, _n2), cap = ctx.camera.position.length() * 0.22, S = Math.min(rEq * 0.65, cap, r * 0.35), near = p0.x * p0.x + p0.z * p0.z < (1.7 * r) ** 2; // (an event at the hole itself shows as the ring, not as smoke over the cap)
    const ring = show && !near ? 10 + 4 * cls : 0, pc = new THREE.Color(DUST).lerp(new THREE.Color(0x5a4f45), 0.5);
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * 6.283 + Math.random() * 0.4, tx = Math.cos(a), tz = Math.sin(a), sp = rEq * (0.18 + Math.random() * 0.12);
      const px = p0.x + tx * rEq * 0.45 + up.x * S * 0.5, pz = p0.z + tz * rEq * 0.45;
      if (px * px + pz * pz < (1.15 * r) ** 2) continue; // (no dust floating over the hole)
      debris.puff(px, p0.y + up.y * S * 0.5, pz, tx * sp, S * 0.05, tz * sp, S * (0.7 + Math.random() * 0.6), S * 0.35, 3 + Math.random(), pc, 0.65);
    }
    if (cls >= 2 && show && !near) {
      const layers = cls >= 3 ? 3 : 2; // ash columns: a dark low layer and a pale high one
      for (let l = 0; l < layers; l++) for (let i = 0; i < 7; i++) {
        const a = Math.random() * 6.283, d = Math.random() * rEq * 0.3, col = l === 0 ? new THREE.Color(0x2d2a28) : new THREE.Color(0xc9bba8);
        debris.puff(p0.x + Math.cos(a) * d, p0.y + S * (0.3 + 0.9 * l), p0.z + Math.sin(a) * d, 0, S * (0.35 + 0.35 * l + Math.random() * 0.2), 0, S * (0.8 + 0.4 * l), S * 0.4, 4.5 + 1.5 * l, col, 0.8 - 0.15 * l);
      }
    }
    // budgets
    state.shake = Math.max(state.shake, [0, 0.15, 0.3, 0.45, 0.6][cls] * (pull ? 0.5 : 1));
    if (!pull && (t - fx.hitAt > 1.5 || cls > fx.hitCls) && rEq >= 0.2 * r) {
      fx.hitAt = t; fx.hitCls = cls;
      state.hitstop = Math.max(state.hitstop || 0, [0, 0.06, 0.08, 0.12, 0.2][cls]);
      if (cls >= 3) { state.slowmo = cls === 3 ? 0.5 : 0.4; state.slowT = (cls === 3 ? 0.8 : 1.5) * state.slowmo; }
      if (cls === 4) { fx.pull = 0; fx.pullT = 0; }
    }
    // sound: crack + gulp, rumble late by distance, choir, the continent's silence-swell-boom
    const dl = Math.min(1.2, dist / (6 * r));
    if (!show) return;
    const cs = Math.min(5, this.combo || 0) * 2; if (cls === 1) sfx.tear(k, cs); else if (cls === 2) { sfx.tear(k, cs); sfx.rumble(k, 0.15 + dl); } else if (cls === 3) { sfx.choir(k); sfx.rumble(k, 0.2 + dl); } else sfx.swell();
    if (ev.pop > 5e5 && !pull && (cls >= 2 || news.queue.length < 2)) { const pp = ev.pop >= 1e9 ? `${(ev.pop / 1e9).toFixed(1)} B` : ev.pop >= 1e6 ? `${(ev.pop / 1e6).toFixed(0)} M` : `${(ev.pop / 1e3).toFixed(0)} k`; news.say(cls === 3 ? `${ev.name} is gone — ${pp} swallowed` : `${ev.name} swallowed — ${pp} evacuated`); }
  }

  /** The finale (src/finale.js): built behind the play from 80% of the land (3 ms a frame); the last land starts it. Bot / headless runs skip it unless `window.__finaleBot`. */
  finalePrep(ctx) {
    if (this.finPromise) return this.finPromise;
    if (qs.has('nofinale') || (window.__headless && !window.__finaleBot)) return null;
    return (this.finPromise = Finale.prepare(this, ctx).then((F) => (this.fin = F)).catch((e) => { console.warn('finale prepare failed', e); this.finFailed = true; return null; }));
  }
  /** The Moon's break-up flash is the moment to build the finale's shaders (src/finale.js compile()). */
  finaleCompile() { this.finPromise?.then((F) => F?.compile()); }
  startFinale(ctx) { return (this.finStart ??= this.startFinale1(ctx)); } // (once: the win and a test hook may both ask)
  async startFinale1(ctx) {
    const F = this.fin || (await this.finalePrep(ctx));
    if (!F || F.started) return false;
    await F.compile(); // (a no-op if the Moon's break already did it)
    F.worldTime = ctx.state.time; F.onButtons = (mk) => this.finaleButtons(ctx, mk);
    F.begin(); this.installFinaleDebug(ctx);
    return true;
  }
  /** The world is eaten: the finale if it can play, else the plain results overlay (bots, ?nofinale, a failed build). */
  endWorld(ctx) {
    const { state } = ctx;
    (async () => {
      const ok = await this.startFinale(ctx).catch((e) => { console.warn('finale failed', e); return false; });
      if (!ok) { ctx.card('THE WORLD IS EATEN', `${popStr(state.pop || 0)} swallowed`); ctx.news.say('Nothing is left. The void is the world.'); ctx.sfx.levelUp(); setTimeout(() => this.resultsUi(ctx), window.__headless || window.__bot ? 0 : 2200); }
    })();
  }
  /** The title card's buttons (the finale calls it with a maker). */
  finaleButtons(ctx, mk) {
    mk('Results', '', () => this.resultsUi(ctx));
    mk('Continue', '', () => { this.fin.btnEl.classList.remove('on'); this.fin.cardEl.classList.remove('on'); setTimeout(() => this.fin.btnEl.classList.remove('on'), 0); ctx.hint?.('Drag to look around — Esc for the card'); });
    mk('Menu', '', () => ctx.toMenu());
    mk('New World', 'pri', () => { const u = new URL(location.href); u.search = `?planet&ng=1&seed=${Math.floor(Math.random() * 9e5) + 1000}`; location.href = u.href; });
  }
  installFinaleDebug(ctx) {
    const F = this.fin, self = this;
    window.__finale = Object.assign((t) => { F.hold = true; F.scrub(t); window.__tick(1 / 60, 1); return t; }, {
      play() { F.hold = false; }, fin: () => F, FT, start: () => self.startFinale(ctx), fake: (f) => self.fakeLand(f), clock: () => F.t,
    });
  }
  /** Eat the land (the real bite map: units, people and goals follow) until `frac` of it is gone, the credit thrown away: for tests (?land=). Returns the share. */
  fastLand(frac = 0.89, r = 1.2e6) {
    const W = this.world, B = W.bite, lf = B.lf, land = lf.land, pd = lf.pDir, d = { x: 0, y: 0, z: 0 }; let guard = 0;
    while (B.landEaten < frac && guard++ < 6000) {
      const pk = land[Math.floor(Math.random() * land.length)]; if (!(lf.lv[0].left[pk] > 1e-4)) continue;
      d.x = pd[pk * 3]; d.y = pd[pk * 3 + 1]; d.z = pd[pk * 3 + 2]; B.chew(d, r, 30, 0); B.upload(); B.tflag.fill(0); B.nTouched = 0; B.events.length = 0;
    }
    B.jobs.length = 0; this.ctxRef.state.pop = B.pop; return B.landEaten;
  }
  /**
   * Test hook (the bot sweeps): play the finale headless at 40x until its card, and report what happened (the card up, the shards swallowed, the hole's final radius, any error).
   * Needs `window.__finaleBot = true` before the run (the build is skipped in headless play otherwise).
   */
  async fastFinale(ctx) {
    const out = { ok: false };
    try {
      const t0 = performance.now(); this.threat?.stand(); window.__finK = 0.25; ctx.state.world ??= this.worldStats(ctx);
      if (!(await this.startFinale(ctx))) return { ...out, why: 'not started' };
      const F = this.fin, h = window.__headless; window.__headless = true;
      let n = 0; while (F.t < FT.title + 1.5 && n++ < 3000) window.__tick(0.1);
      window.__headless = h; window.__finK = 1;
      Object.assign(out, { ok: F.cardEl.classList.contains('on') && F.swallowed >= F.K, t: +F.t.toFixed(1), swallowed: F.swallowed, shards: F.K, ticks: n, rBH: Math.round(F.holeR(F.t) / 1000), ms: Math.round(performance.now() - t0), card: F.cardEl.textContent.slice(0, 70) });
    } catch (e) { out.err = String(e?.stack || e).slice(0, 300); window.__headless = false; window.__finK = 1; }
    return out;
  }
  /** Back to the start: the finale's meshes and state go (a sweep runs again in the same page). */
  finaleReset(ctx) {
    this.fin?.dispose(); this.fin = null; this.finPromise = null; this.finStart = null; this.finFailed = false; ctx.state.asc = null; ctx.state.world = null;
  }
  /** Visual only: take the land away (the wound shader on every land texel) without touching the accounting. */
  fakeLand(frac = 1) {
    const B = this.world.bite, n = B.hm.length; let k = 0;
    for (let i = 0; i < n; i++) { if (B.hm[i] !== 65535 && Math.random() < frac) { B.rem8[i] = 0; B.rem[i] = 0; } k++; }
    B.tex.needsUpdate = true; return k;
  }

  /** The world's numbers at the end: the results screen reads them; the pay is banked and the stars scored here, once. */
  worldStats(ctx) {
    const { state } = ctx, th = this.threat?.stats || {}, hits = state.hitsByTier || {}, ta = state.tierAt || {};
    const tiers = [1, 2, 3, 4].map((n) => ({ n, from: ta[n] ?? null, to: n < 4 ? ta[n + 1] ?? state.time : state.time }));
    const cleanTier = tiers.some((q) => q.from != null && (q.n === 4 || ta[q.n + 1] != null) && !hits[q.n]) ? 1 : 0;
    const w = { seed: this.world.seed, time: state.time, pop: state.pop || 0, best: state.best || ctx.hole.r, tiers, landLog: this.landLog || [], nukes: th.swallowed || 0, nukesFired: th.nukes || 0, rodGulps: th.rodGulps || 0, rods: th.rods || 0, sats: th.sats || 0,
      rivalEaten: th.rivalEaten || 0, rivals: th.rivals || 0, moonAll: th.moonAll || 0, moonGulps: th.moonGulps || 0, aegis: th.aegis || 0, aegisBroke: th.aegisBroke || 0, cracker: th.cracker || 0, fizzles: th.fizzles || 0, hits: th.hits || 0, seen: th.seen || 0, cleanTier };
    w.pay = ctx.bankPlanet?.(state, { stats: th, seed: w.seed }) || { total: 0, parts: {} }; state.dust = w.pay.total;
    w.stars = scoreWorld(w);
    return w;
  }
  /** The results screen (src/results.js): after the finale's card, or on its own if the finale could not play. */
  resultsUi(ctx) { showResults(ctx, ctx.state.world ?? this.worldStats(ctx)); }

  /** A floating "+X.X%" at the tear's centroid (A6): the credit is known only at the end, so it is estimated from the unit's land and height; provinces and up add the people. Six pooled elements. */
  gainLabel(ev, cls, ctx) {
    const { hole, state } = ctx, W = this.world, lf = W.bite.lf, v = lf.lv[ev.L];
    document.getElementById('size')?.classList.remove('pulse'); if (cls >= 2) { const sz = document.getElementById('size'); void sz.offsetWidth; sz.classList.add('pulse'); }
    if (this.fx && this.fx.tok < 0) return;
    const h = v.hsum ? v.hsum[ev.u] / (v.area0[ev.u] || 1) : 300, G = P3.g(hole.r) * P3.feast * (state.fallout ? T3.falloutLand : 1) * (state.surge ? 1.5 : 1);
    const k = 1 + 0.1 * Math.min(5, this.combo || 0), pct = ev.left * 1e6 * Math.sqrt((h + P3.crust) / 1000) * P3.collapseK * G * (state.mods?.tear ?? 1) * k / hole.area * 100;
    if (pct < 0.2) return; // (smaller ones are noise)
    const pool = this.gains ??= Array.from({ length: 6 }, () => document.body.appendChild(Object.assign(document.createElement('div'), { className: 'gain' }))), el = pool[(this.gainI = ((this.gainI ?? -1) + 1) % 6)];
    const p = W.renderPos(ev.dir, Math.max(0, W.P.elevation(ev.dir, 6)), _p).project(ctx.camera);
    const x = p.z > 1 || Math.abs(p.x) > 0.9 ? 0 : p.x, y = p.z > 1 || Math.abs(p.y) > 0.8 ? 0.1 : p.y;
    el.innerHTML = `+${pct.toFixed(pct < 10 ? 1 : 0)}%${cls >= 2 && ev.pop > 1e5 ? `<small>${popStr(ev.pop)} people</small>` : ''}`;
    const X = (x * 0.5 + 0.5) * innerWidth, Y = (-y * 0.5 + 0.5) * innerHeight;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate([{ opacity: 0, transform: `translate(${X}px,${Y}px) translate(-50%,0) scale(.7)` }, { opacity: 1, transform: `translate(${X}px,${Y - 24}px) translate(-50%,0) scale(1.1)`, offset: 0.15 }, { opacity: 1, transform: `translate(${X}px,${Y - 60}px) translate(-50%,0) scale(1)`, offset: 0.7 }, { opacity: 0, transform: `translate(${X}px,${Y - 90}px) translate(-50%,0) scale(1)` }], { duration: 1300, easing: 'ease-out' });
  }

  /** Ripe units (A5): at 2 Hz the best four go to zone slots 16-19 (lilac dashed rings) and the minimap; the best one gets a HUD label ("Kesport Peninsula · 58%"). */
  ripeTick(ctx, dt) {
    const W = this.world, lf = W.bite.lf, u = W.globe.u, { state, hole } = ctx, rp = this.ripe ??= [];
    if (state.won && rp.length) { rp.length = 0; for (let i = 16; i < 20; i++) u.uZoneP[i].value.y = 0; this.ripeMk?.forEach((m) => m?.remove()); this.ripeMk = []; } // (the world is eaten: no rings)
    if (lf?.ready && !state.won && ((this.ripeT = (this.ripeT || 0) - dt) <= 0)) {
      this.ripeT = 0.5; lf.ripe(W.hdir, hole.r, rp, 4);
      for (let i = 0; i < 4; i++) {
        const o = rp[i];
        if (o) { u.uZone[16 + i].value.set(o.dir.x, o.dir.y, o.dir.z, o.rEq / R); u.uZoneP[16 + i].value.set(0, 0.5 + 0.35 * (1 - o.frac), 0, 2); } else u.uZoneP[16 + i].value.y = 0;
        if (this.map) {
          const mk = (this.ripeMk ??= [])[i];
          if (o && mk) { mk.dir = o.dir; mk.r = o.rEq; } else if (o) this.ripeMk[i] = this.map.addMarker({ kind: 'ring', dir: o.dir, r: o.rEq, color: '#c9a8ff' });
          else if (mk) { mk.remove(); this.ripeMk[i] = null; }
        }
      }
    }
    // the label: projected from the best unit's centroid every frame (a pooled element)
    const el = this.ripeEl ??= Object.assign(document.createElement('div'), { id: 'ripe', hidden: true }), o = rp[0];
    if (!el.isConnected) { document.body.append(el); if (!document.getElementById('ripe-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'ripe-css', textContent: RIPE_CSS })); }
    if (!o || !state.playing || state.won) { el.hidden = true; return; }
    const p = W.renderPos(o.dir, Math.max(0, W.P.elevation(o.dir, 6)), _p).project(ctx.camera);
    if (p.z > 1 || Math.abs(p.x) > 0.92 || Math.abs(p.y) > 0.9) { el.hidden = true; return; }
    const txt = `${o.name} · ${Math.round(o.frac * 100)}%`;
    if (el.textContent !== txt) el.textContent = txt;
    el.hidden = false; el.style.transform = `translate(${((p.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px,${((-p.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px) translate(-50%,-140%)`;
  }

  /** The Sealed checkpoint (§8): the bite map and the hole's frame at the latest tier-up (17 MB, memory only; the snapshot is reused at every tier-up). */
  checkpoint(ctx) { this.ckpt = { tier: ctx.state.tier, snap: this.world.bite.save(this.ckpt?.snap !== this.snap0 ? this.ckpt?.snap : null), holeQ: this.world.holeQ.clone() }; }
  /** "Retry tier N": back to the tier-up (land as it was, the hole at the tier's floor, belly full). */
  restoreCheckpoint(ctx) {
    ctx.pain?.clear(); this.cities?.reset();
    const W = this.world, { hole, state } = ctx, c = this.ckpt, B = W.bite;
    B.restore(c.snap); B.jobs.length = 0; B.events.length = 0; B.tflag.fill(0); B.nTouched = 0; B.pullAt = 0;
    W.holeQ.copy(c.holeQ).normalize(); W.hdir.set(0, 1, 0).applyQuaternion(W.holeQ); W.h0Set = false; W.job = null; W.patchInfo = null; W.nStamps = 0; W.globe.trailData.fill(0); W.globe.trailTex.needsUpdate = true;
    W.capMode = false; hole.capMode = false; W.globe.hidePatch?.();
    hole.area = Math.PI * TIERS[c.tier - 1].r ** 2; hole.sx = hole.sz = 0;
    Object.assign(state, { belly: 1, tier: c.tier, playing: true, over: false, sealed: false, shake: 0, slowT: 0, slowmo: 1, hitstop: 0, frenzy: 0, surge: false, fallout: false, land: B.landEaten, pop: B.pop });
    this.goal = null; this.gT = 0; this.worldGoal = null; this.fx = null; this.rim = 0; this.dustMoved = 0;
    this.threat?.clear(); ctx.news.queue.length = 0; state.gRate = 0;
    W.update(0, hole, ctx.camera, innerHeight); if (hole.r < P3.capR) W.buildPatchNow(hole.r);
    this.camDist = 0; ctx.card(`Retry · tier ${c.tier}`, TIERS[c.tier - 1].name);
  }

  /**
   * The goal chain (§12.3): home province -> three provinces -> home nation -> five nations -> the world (99.5%). Scanned at 2 Hz of game time (the units' tables are big);
   * clearing one gives the banner, a news line, the perk draft; there is always a current goal. Also the arrow target and the continent counter.
   */
  goalTick(ctx, dt) {
    const W = this.world, lf = W.bite.lf, { state, hole, news, sfx } = ctx;
    if (!lf?.ready || (this.gT = (this.gT || 0) - dt) > 0) return;
    this.gT = 0.5;
    const first = !this.goal; // (a start that has already eaten its way past the first goals, ?r=: they clear quietly: no cards, no perk draft that would freeze the test)
    const G = this.goal ??= { idx: 0, g: lf.makeGoal(KINDS[0], W.hdir), frac: 0, tgt: null, hunt: false };
    const world = this.worldGoal ??= lf.makeGoal('world', W.hdir);
    let pr = lf.progress(G.g);
    for (let k = 0; pr.cleared && G.g.kind !== 'world' && k < 4; k++) { // (a cascade: a goal already eaten as part of a bigger tear clears at once)
      const g = G.g;
      state.goalDone[G.idx] = state.time;
      if (!first) {
        ctx.card('Goal cleared', g.name);
        news.say(`${g.name} ${/provinces|nations/.test(g.kind) ? 'have' : 'has'} fallen — ${popStr(state.pop || 0)} swallowed so far`);
        sfx.levelUp(); if (!qs.has('r')) ctx.draft?.(); // (?r=: a debug start has no perk drafts: the first goals clear in the first seconds and the popup froze the test)
      }
      G.g = lf.makeGoal(KINDS[++G.idx], W.hdir); pr = lf.progress(G.g);
    }
    G.frac = pr.frac;
    if (G.g.kind === 'world' && pr.cleared && !state.won && !this.threat?.byName.moon?.items[0].on) { // (the Moon is the last feast: the world is not won while its rocks still fall)
      state.won = true; state.goalDone[4] = state.time; save.worlds = (save.worlds || 0) + 1;
      this.threat?.stand(); ctx.edgeArrow('town', null); sfx.grind.stop();
      state.world = this.worldStats(ctx); // (the numbers, the stars, the pay: banked once, persisted)
      this.endWorld(ctx);
    }
    G.hunt = W.bite.landEaten >= 0.97 && !state.won;
    G.tgt = state.won ? null : lf.target(G.hunt ? world : G.g, W.hdir, hole.r, G.hunt);
    let c = 0; const v4 = lf.lv[4];
    for (let u = 1; u < v4.n; u++) if (v4.area0[u] >= 2e6 && lf.done(4, u)) c++;
    if (c > state.continents) { state.continents = c; }
    G.cont = c; G.contTotal = this.contTotal ??= (() => { let n = 0; for (let u = 1; u < v4.n; u++) if (v4.area0[u] >= 2e6) n++; return n; })();
  }

  /**
   * window.__planetLadder(): the "always something smaller and larger" rule (§4.2, §12.3) as pure table queries (no placement, no patch):
   * 20 random land spots per tier at a random size in the tier. A spot passes with >= 3 meals (a unit with 0.1-0.9 pi r^2 of land left,
   * centroid within 8 r) and >= 1 bigger thing (a unit with more than pi r^2 left within 15 r of its rim, at T1 a wall (a column above 0.12 r within 15 r), or the Moon while r < 1737 km). `noLand` counts the spots that pass only on the Moon.
   * `rEqMeals` counts the strict "0.1-0.9 r" reading (equivalent radius) for reference.
   */
  ladderTest(ctx, per = 20) {
    const W = this.world, lf = W.bite.lf, out = { total: { pass: 0, fail: 0 } }, bounds = TIERS.map((q, i) => [q.r, TIERS[i + 1]?.r ?? 2400e3]);
    for (let tier = 1; tier <= TIERS.length; tier++) {
      const o = out['T' + tier] = { pass: 0, fail: 0, fails: [], meals: [], rEqMeals: [], bigger: [] };
      for (let k = 0; k < per; k++) {
        const [lo, hi] = bounds[tier - 1], r = lo * (hi * 0.95 / lo) ** Math.random(), pi = Math.PI * (r / 1000) ** 2;
        const pk = lf.land[Math.floor(Math.random() * lf.land.length)], d = { x: lf.pDir[pk * 3], y: lf.pDir[pk * 3 + 1], z: lf.pDir[pk * 3 + 2] }; // (a spot on land: at sea the arrow is the answer)
        let meals = 0, strict = 0, bigger = 0;
        for (let L = 0; L <= 4; L++) {
          const v = lf.lv[L], c = v.c;
          for (let u = 0; u < v.n; u++) {
            const left = v.left[u];
            if (!(left > 1e-6) || (L === 0 && !(v.area0[u] > 0))) continue;
            const dist = Math.acos(Math.min(1, d.x * c[u * 3] + d.y * c[u * 3 + 1] + d.z * c[u * 3 + 2])) * R;
            if (left >= 0.1 * pi && left <= 0.9 * pi && dist < 8 * r) meals++;
            if (left > 0.01 * pi && left <= 0.81 * pi && dist < 8 * r) strict++;
            if (left > pi && dist < 15 * r + Math.sqrt(left / Math.PI) * 1000) bigger++;
          }
        }
        if (tier === 1 && !bigger) for (let q = 0; q < 24 && !bigger; q++) if (W.P.elevation(W.P.step(d, Math.random() * 6.283, (2 + Math.random() * 13) * r), 4) > 0.12 * r) bigger++;
        o.meals.push(meals); o.rEqMeals.push(strict); o.bigger.push(bigger);
        const moon = r < 1737400 ? 1 : 0; // the Moon is in the sky (an impostor, always in frame) and bigger than the hole until r = 1737 km
        if (!bigger) o.noLand = (o.noLand || 0) + 1; // spots whose only bigger thing is the Moon (or nothing, past 1737 km)
        if (meals >= 3 && (bigger >= 1 || moon)) { o.pass++; out.total.pass++; } else { o.fail++; out.total.fail++; o.fails.push({ r: Math.round(r / 1000), meals, bigger }); }
      }
    }
    return out;
  }

  /** window.__planetUnits(): the landforms in numbers (R2 checks) and test hooks (nearest / goto) for the tear tests. */
  unitsApi(ctx) {
    const W = this.world, lf = W.bite.lf, { hole } = ctx, self = this;
    const info = (L, u) => ({ L, u, name: lf.name(L, u), area0: Math.round(lf.lv[L].area0[u]), left: Math.round(lf.lv[L].left[u]), rEqKm: Math.round(lf.rEq(L, u) / 1000), torn: !!lf.lv[L].torn[u] });
    const api = {
      lf, init: { ms: Math.round(W.bite.initMs), worstSliceMs: +W.bite.initSlice.toFixed(2) },
      check: () => lf.check(),
      /** The land left by the texels themselves (sum of rem x area) against the running total: the accounting must agree (it drifted by 0.75% before the 16-bit step fix). */
      truth: () => { const B = W.bite; let t = 0; for (let k = 0; k < B.rem.length; k++) if (B.hm[k] !== 65535) t += (B.rem[k] / 65535) * B.area[k % (B.B * B.B)]; return { texels: t, sum: B.sum, err: t / (B.sum || 1) - 1, sum0: B.sum0 }; },
      counts: () => lf.lv.map((v, L) => ({ L, n: L === 0 ? lf.land.length : v.n - (L === 4 ? 1 : 0) })),
      info,
      /** The biggest n units of a level by starting area. */
      biggest(L = 4, n = 8) { const v = lf.lv[L], ids = [...Array(v.n).keys()].filter((u) => v.area0[u] > 0).sort((a, b) => v.area0[b] - v.area0[a]).slice(0, n); return ids.map((u) => info(L, u)); },
      /** The nearest unit of level L (standing land left, area0 in [minKm2, maxKm2]) to the hole. */
      nearest(L = 1, maxKm2 = 1e12, minKm2 = 0, from = W.hdir) {
        const v = lf.lv[L]; let best = -1, bd = 9;
        for (let u = 0; u < v.n; u++) {
          if (v.left[u] < 1 || v.area0[u] > maxKm2 || v.area0[u] < minKm2 || v.torn[u]) continue;
          const d = Math.acos(Math.min(1, v.c[u * 3] * from.x + v.c[u * 3 + 1] * from.y + v.c[u * 3 + 2] * from.z));
          if (d < bd) { bd = d; best = u; }
        }
        return best < 0 ? null : { ...info(L, best), distKm: Math.round(bd * R / 1000) };
      },
      /** Stand just outside unit (L, u), `off` hole radii from its rim, facing it; builds the patch if there is one. */
      goto(L, u, off = 1.2, bearing = Math.random() * 6.283) {
        const c = lf.dirOf(L, u, { x: 0, y: 0, z: 0 }), r = hole.r, d = W.P.step(c, bearing, lf.rEq(L, u) + off * r);
        W.placeAt(d, c); W.h0Set = false; W.job = null;
        if (!W.capMode) W.buildPatchNow(r);
        self.camDist = 0; return info(L, u);
      },
      /** Steering [sx, sz] toward the unit's centroid (a test helper: ?__planet.run(n, () => units.steer(L, u))). */
      steer(L, u) {
        const c = lf.dirOf(L, u, { x: 0, y: 0, z: 0 }), q = new W.hdir.constructor(c.x, c.y, c.z).applyQuaternion(W.holeQ.clone().invert()), l = Math.hypot(q.x, q.z) || 1;
        return [q.x / l, q.z / l];
      },
      /** Tear jobs running now. */
      jobs: () => W.bite.jobs.map((j) => ({ name: j.name, L: j.L, kind: j.kind, parcels: j.n, next: j.next, t: +j.t.toFixed(2), T: +j.T.toFixed(2), active: j.act.length })),
      stat: () => ({ ...W.bite.stat, pop: W.bite.pop, popK: W.bite.popK, tearMs: W.bite.tearMs, biteMs: W.bite.ms }),
    };
    return api;
  }

  hud(ctx, tier) {
    const { hole, state } = ctx, G = this.goal, tg = G?.tgt, W = this.world;
    // the arrow: toward the goal's nearest standing land (the hunt: the biggest piece left); green: land is always edible
    if (tg && tg.d * R > hole.r * 3) { const q = _v.set(tg.dir.x, tg.dir.y, tg.dir.z).applyQuaternion(_qi.copy(W.holeQ).invert()); ctx.edgeArrow('town', [q.x, q.z], tg.name, '#9ed9bf'); }
    else ctx.edgeArrow('town', null);
    if ((state.hudT = (state.hudT || 0) - 1) > 0) return;
    state.hudT = 6;
    const el = (id) => document.getElementById(id);
    el('hud').classList.add('p3');
    el('size').innerHTML = `${TIERS[tier - 1].name} · <b>${KM(hole.r)}</b> · ×${(hole.r / P3.startR).toFixed(hole.r >= 4 * P3.startR ? 0 : 1)}`;
    const le = W.bite.landEaten, pct = (x) => (100 * x).toFixed(x < 0.001 ? 3 : x < 0.1 ? 2 : 1);
    el('eaten').hidden = false;
    el('eaten').innerHTML = `Land eaten <b>${pct(le)}</b>% · ${popStr(state.pop || 0)}`;
    el('left').hidden = !G;
    if (G) {
      const left = W.bite.sum, hunt = G.hunt;
      el('left').innerHTML = state.won ? `<b>The world is eaten</b>` : hunt ? `Hunt: <b>${km2Str(left)}</b> left${G.tgt ? ` · ${G.tgt.name}` : ''}` : G.g.kind === 'world' ? `The world — <b>${pct(G.frac)}</b>% eaten${G.contTotal ? ` · ${G.cont}/${G.contTotal} continents` : ''}` : `${G.g.name} — <b>${Math.floor(G.frac * 100)}</b>% eaten`;
    }
    const dc = el('defcon'); dc.hidden = false; // (the director sets state.defcon in step 9: 5 = calm .. 1)
    [...dc.querySelectorAll('i')].forEach((pip, i) => pip.classList.toggle('on', i >= (state.defcon ?? 5) - 1));
    el('hunger').style.width = `${state.belly * 100}%`;
    el('hunger').parentElement.classList.toggle('low', state.belly < 0.3);
    el('stars').hidden = true; el('crave').hidden = true; el('card').hidden = true;
  }

  debugApi(ctx) {
    const W = this.world, { hole, state } = ctx, self = this;
    const api = {
      W, ctx, P: W.P, globe: W.globe, bite: W.bite, camera: ctx.camera, game: self,
      /** §12.1 limb test: degrees of margin by which the horizon is inside the frame (> 1 required) at radius r (default: now), landscape. */
      limb(r = hole.r) {
        const cam = ctx.camera, portrait = portraitK(cam.aspect), cd = P3.camDist(r) * portrait * ctx.LENS, p = P3.pitch(r);
        const hz = Math.cos(p) * cd, hc = Math.sin(p) * cd, view = Math.atan2(Math.sin(p) * cd, hz + 0.14 * cd * P3.aim(r) / 4), half = cam.fov / 2 * Math.PI / 180;
        // the camera sits hz behind the hole and hc above it, so the planet's local horizon is tilted away from the render horizontal: the limb is at atan2(R + hc, hz) - asin(R / |C|) below it
        const horizon = Math.atan2(R + hc, hz) - Math.asin(R / Math.hypot(R + hc, hz));
        return +(((horizon - (view - half)) * 180) / Math.PI).toFixed(2);
      },
      /** Back to the start of the run (bite map, units, hole, ledger, trail): for balance sweeps in one page load. */
      reset() {
        self.finaleReset(ctx); ctx.pain?.clear(); self.cities?.reset();
        W.bite.restore(self.snap0); W.bite.jobs.length = 0; W.bite.events.length = 0; W.bite.tflag.fill(0); W.bite.nTouched = 0; W.bite.pullAt = 0; W.bite.stat = { tears: 0, pulls: 0, parcelTears: 0 }; self.rim = 0; self.dustMoved = 0;
        W.placeAt(W.P.startDir, W.P.city); W.h0Set = false; W.job = null; W.patchInfo = null; W.nStamps = 0; W.globe.trailData.fill(0); W.globe.trailTex.needsUpdate = true;
        W.capMode = false; hole.capMode = false; W.globe.hidePatch?.(); hole.area = Math.PI * self.r0 * self.r0; hole.sx = hole.sz = 0;
        Object.assign(state, { belly: 1, tier: P3.tier(self.r0), land: 0, time: 0, pop: 0, best: 0, walls: 0, goalDone: [], tierLand: {}, tierAt: { 1: 0 }, shake: 0, slowT: 0, slowmo: 1, hitstop: 0, ledger: { land: 0, tear: 0, pull: 0, fed: 0, starve: 0 }, perks: [], mods: modsFor([]), drafts: 0, draftsDue: 0, draft: null, continents: 0, won: false });
        self.goal = null; self.gT = 0; self.worldGoal = null; state.hitsByTier = {}; self.landLog = []; self.logT = -99; state.world = null; self.moonGone = false; state.sealed = false; state.over = false; state.playing = true; state.frenzy = 0; state.surge = false; state.fallout = false; state.nukesSwallowed = 0; state.gRate = 0; self.combo = 0; self.threat?.clear(); if (self.threat) { for (const k in self.threat.stats) self.threat.stats[k] = typeof self.threat.stats[k] === 'object' ? {} : 0; self.threat.firstNuke = false; self.threat.arm(); } self.ckpt = { tier: P3.tier(self.r0), snap: self.snap0, holeQ: W.holeQ.clone() };
        W.update(0, hole, ctx.camera, innerHeight); W.buildPatchNow(self.r0); self.camDist = 0; self.fx = null;
        return 'reset';
      },
      /** Set the hole radius (m) at the current spot. */
      setR(m) { hole.area = Math.PI * m * m; },
      /** Jump to a planet direction ({x,y,z}); screen-up toward `toward`. */
      teleport(dir, toward) { W.placeAt(dir, toward); },
      dbg: () => ({ r: hole.r, tier: P3.tier(hole.r), E: W.E, h0: W.h0, e_eff: W.eff(0, 0).e, h: W.eff(0, 0).h, speed: P3.speed(hole.r), land: W.bite.landEaten, belly: state.belly,
        patchBuilds: W.builds, patchMs: W.buildMs, patchMaxSlice: W.maxSlice, lastBuild: W.lastBuild, biteMs: self.cpu.bite, tearMs: W.bite.tearMs, visited: W.bite.visited, worldMs: self.cpu.world, stepMs: self.cpu.step, cap: W.capMode, walls: state.walls || 0, credit: state.ledgerLand || 0 }),
      /** Debug: jump to a sunlit spot `off` m short of a peak taller than minE (m) at radius r (m), facing it, and settle the camera. */
      peak(minE = 4500, r = 3000, off = 16000) {
        const S = W.sunPlanet, P = W.P;
        let m = null;
        for (let k = 0; k < 800000 && !m; k++) {
          const z = Math.random() * 1.2 - 0.6, a = Math.random() * 6.283, s = Math.sqrt(1 - z * z), d = { x: Math.cos(a) * s, y: z, z: Math.sin(a) * s };
          if (d.x * S.x + d.y * S.y + d.z * S.z > 0.5 && P.elevation(d, 12) > minE) m = d;
        }
        W.placeAt(P.step(m, 1.0, off), m); hole.area = Math.PI * r * r; W.h0Set = false; return P.elevation(m, 12);
      },
      /** Debug: advance n frames without drawing, steering with fn(t) -> [sx, sz]. */
      run(n, fn = () => [0, 0], dt = 1 / 30) {
        const was = window.__bot, h = window.__headless; let t = 0;
        window.__bot = () => fn(t += dt); window.__headless = true; window.__tick(dt, n); window.__headless = h; window.__bot = was;
      },
      /** Calibration (§2.5, §12.7 R1): a straight run of 8 r over the best land line found (land share >= 0.9 if the world has one) at radius r (m): credit per second vs 2 r v f sqrt(hcol). Restores the bite map. */
      cal(rm, secs = 0, dt = 1 / 30) {
        const saveQ = W.holeQ.clone(), saveBite = W.bite.save();
        const v = P3.speed(rm), len = 8 * rm, steps = Math.ceil(len / (v * dt)); secs = steps * dt;
        let best = null, bestF = -1;
        for (let k = 0; k < 1500 && bestF < 0.9; k++) { // dry runs: only the land under the centre is sampled (no chewing)
          const z = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - z * z), d = { x: Math.cos(a) * s, y: z, z: Math.sin(a) * s }, tw = { x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 };
          W.placeAt(d, tw);
          let f = 0;
          for (let i = 0; i < steps; i += 2) { W.moveHole(0, -v * dt * 2); if (W.bite.landAt(W.hdir) >= 0 && W.bite.heightAt(W.hdir) < 400) f++; }
          f /= Math.ceil(steps / 2);
          if (f > bestF) { bestF = f; best = [d, tw]; }
        }
        W.placeAt(best[0], best[1]);
        let credit = 0, land = 0, swept = 0, n = 0;
        let expect = 0; // sum of swept x sqrt(hcol / 1 km) over the land the hole drove over (the doc's G * 2 r v * f * sqrt(h), before G)
        for (let t = 0; t < secs; t += dt) {
          const q = W.eff(0, 0);
          W.moveHole(0, -v * dt);
          const c = W.bite.chew(W.hdir, rm, dt, v * dt);
          credit += c; swept += 2 * rm * v * dt; n++;
          if (q.h > 0) { land++; expect += (2 * rm * v * dt + (n === 1 ? Math.PI * rm * rm : 0)) * Math.sqrt((q.h + P3.crust) / 1000); } // (the first frame eats the whole disc once)
        }
        const out = { r: rm, v, credit_m2_per_s: credit / secs, swept_m2_per_s: swept / secs, ratio: credit / swept, expect_ratio: expect / swept, vs_expect: credit / (expect || 1), growth_pct_per_s: 100 * credit * P3.g(rm) / secs / (Math.PI * rm * rm), landFrac: land / n, visited: W.bite.visited };
        W.holeQ.copy(saveQ); W.hdir.set(0, 1, 0).applyQuaternion(W.holeQ);
        W.bite.restore(saveBite);
        return out;
      },
    };
    return api;
  }

  leave(ctx) {
    this.finaleReset(ctx); document.getElementById('wres')?.remove(); // (P0-2: the finale's listeners, DOM, meshes and lens go with the world)
    ctx.sfx.grind.stop(); ctx.sfx.bed.stop();
    this.threat?.dispose(); this.threat = null; this.cities?.dispose(); this.cities = null;
    this.map?.dispose(); this.map = null;
    for (const id of ['stars', 'eaten', 'left']) { const e = document.getElementById(id); if (e) e.hidden = false; }
    document.getElementById('defcon').hidden = true; document.getElementById('hud').classList.remove('p3');
    this.world?.leave(); this.world = null;
  }
}
