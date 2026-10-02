// Phase 3 game loop (docs/PHASE3.md): its own per-frame function so Phase 1/2 can't regress. main.js hands it a `ctx` (renderer, post,
// camera, scene, look, the Hole, the run state, sfx, fx pools, flash/hint/card helpers, steer) and calls frame() each tick while
// state.phase === 3. Step 4: the hole on the sphere. Step 5: the bite map (land credit, walls, ridge drag, lowland feast, wound).
// Not here yet (plug-in points are marked "TODO(step N)"): food (6), minimap (7), ascension (8), threats (9).
import * as THREE from 'three/webgpu';
import { PlanetWorld } from './planet.js';
import { P3, TIERS } from './phase3.js';
import { R } from './planetgen.js';
import { sunDir } from './look.js';

const KM = (m) => (m >= 1e5 ? `${(m / 1000).toFixed(0)} km` : m >= 1e4 ? `${(m / 1000).toFixed(1)} km` : `${(m / 1000).toFixed(2)} km`);
const qs = new URLSearchParams(location.search);
const num = (k, d) => (qs.has(k) && qs.get(k) !== '' && Number.isFinite(+qs.get(k)) ? +qs.get(k) : d);
const _v = new THREE.Vector3(), _s = new THREE.Vector3();

export class PlanetGame {
  constructor() { this.world = null; this.camDist = 0; this.lead = new THREE.Vector2(); this.dbg = {}; this.cpu = { world: 0, bite: 0, step: 0 }; }

  /** Build the world behind a loading line, swap the town out, drop the hole in at r0. */
  async begin(ctx) {
    const quality = ctx.Q.tier === 'low' ? 'low' : ctx.Q.tier === 'medium' ? 'medium' : 'high';
    const seed = num('seed', 7);
    const W = this.world = await PlanetWorld.create(seed, { quality, workers: !qs.has('noworker'), onStage: (t) => ctx.stage?.(t) });
    const { hole, state } = ctx;
    const r0 = num('r', P3.startR);
    P3.feast = num('feast', P3.feast);
    ctx.dropTown(); // the town (and any Phase 2 region) goes; stand-ins keep the shared code honest
    W.enter({ scene: ctx.scene, camera: ctx.camera, look: ctx.look, post: ctx.post, renderer: ctx.renderer, sun: ctx.sun });
    ctx.wisps.sprite.visible = false; ctx.birds.sprite.visible = false;
    if (qs.get('view') === 'pole') W.placeAt(new THREE.Vector3(0, 1, 0));
    else if (qs.get('at') === 'city') W.placeAt(W.P.city, W.P.startDir); // (debug: the mainland)
    else W.placeAt(W.P.startDir, W.P.city);
    W.setSunRender(_s.set(-0.75, 0.6, 0.3)); // low sun over the left shoulder: relief reads
    hole.area = Math.PI * r0 * r0;
    hole.x = hole.z = 0; hole.vx = hole.vz = 0; hole.sx = hole.sz = 0; hole.hidden = false; hole.capMode = false;
    state.phase = 3; state.belly = 1; state.tier = P3.tier(r0); state.left = 0; state.wallHint = 0; state.land = 0;
    W.update(0, hole, ctx.camera, innerHeight);
    if (!W.capMode) W.buildPatchNow(r0);
    W.update(0, hole, ctx.camera, innerHeight);
    this.camDist = 0;
    window.__planet = this.debugApi(ctx);
    window.__planetLand = () => W.bite.landEaten * 100; // % of the world's land eaten
    window.__planetDbg = window.__planet.dbg; // r, tier, e_eff, speed, patch builds, bite/world/step ms
    state.playing = true;
    return this;
  }

  /** One frame. dt already includes slow-mo/hit-stop. */
  frame(dt, ctx) {
    const t0 = performance.now(), W = this.world, { state, hole, camera, post, renderer, look, sun } = ctx;
    if (!W) return;
    if (state.playing) {
      state.time += dt;
      this.step(dt, ctx);
    }
    const t1 = performance.now();
    const r = hole.r, tier = P3.tier(r);
    // ---- camera (§6.1): pitch and E ride r; target = the origin plus a small lead along the velocity
    const portrait = Math.max(1, 1.2 / camera.aspect) ** 0.7;
    const want = P3.camDist(r) * portrait * ctx.LENS;
    this.camDist = this.camDist ? this.camDist + (want - this.camDist) * Math.min(1, dt * 2) : want;
    const camDist = this.camDist, pitch = P3.pitch(r);
    const kl = Math.min(1, dt * 3);
    this.lead.x += ((hole.sx || 0) * 0.12 * camDist - this.lead.x) * kl; this.lead.y += ((hole.sz || 0) * 0.12 * camDist - this.lead.y) * kl;
    const horiz = Math.cos(pitch) * camDist;
    camera.position.set(this.lead.x, Math.sin(pitch) * camDist, this.lead.y + horiz);
    camera.lookAt(this.lead.x, 0, this.lead.y);
    const alt = camera.position.y + W.h0, far = Math.max(camDist * 4, 1.2 * Math.sqrt(2 * R * alt + alt * alt)), near = camDist * 0.02;
    if (Math.abs(camera.far - far) > far * 0.05 || Math.abs(camera.near - near) > near * 0.1) { camera.far = far; camera.near = near; camera.updateProjectionMatrix(); }
    // ---- the world: group placement, patch, bite upload; then the hole itself (it sits on the ground under it)
    const tw = performance.now();
    W.update(dt, hole, camera, renderer.domElement.height);
    this.cpu.world = performance.now() - tw;
    hole.update(dt, state.time, Math.max(0, 0.5 - state.belly) * 2, W.span, W.tilt);
    // the sun is fixed in planet space: rotate it into render space for the hole's own lighting and the shared sunDir
    W.sunRender(_s);
    sun.position.copy(_s).multiplyScalar(1000); sun.target.position.set(0, 0, 0);
    sunDir.value.copy(_s);
    ctx.sparks.update(dt); ctx.debris.update(dt);
    if (state.playing) this.hud(ctx, tier);
    ctx.news.update(dt, 0, false);
    this.cpu.step = t1 - t0;
    if (!window.__headless) {
      if (document.visibilityState === 'visible' && !qs.has('nowatch')) post.watch(dt);
      const ts = ctx.fpsEl && performance.now();
      post.render([1, 1, 1]);
      if (ctx.fpsEl) ctx.perf.sub += performance.now() - ts;
    }
  }

  /** The game step: steering, terrain rules (§3), the bite (§2.5), growth, belly. */
  step(dt, ctx) {
    const W = this.world, { state, hole } = ctx, r = hole.r, tier = P3.tier(r), D = P3.depth(r);
    const [sx, sz] = window.__bot ? window.__bot(hole, ctx.city) : ctx.steer();
    const kv = 1 - Math.exp(-dt / P3.turn(r));
    hole.sx = (hole.sx || 0) + (sx - (hole.sx || 0)) * kv;
    hole.sz = (hole.sz || 0) + (sz - (hole.sz || 0)) * kv;
    // what is under the hole: height x what is left of it
    const here = W.eff(0, 0);
    let mult = 1;
    if (here.h < 0) mult = P3.oceanSpeed(tier); // the sea: no credit, slower while small
    else if (here.e < D) mult = 1.1; // lowland feast
    else if (here.e < P3.wallK * D) mult = 1 - 0.5 * (here.e - D) / (3 * D); // ridge drag: eaten from the top down over several passes
    const slow = state.slow > 0 ? 0.45 : 1;
    const speed = P3.speed(r) * mult * slow * (state.mods?.speed ?? 1) * (ctx.speedK?.() ?? 1);
    const kick = state.kick || (state.kick = { x: 0, z: 0 });
    let dx = (hole.sx * speed + kick.x * r / 60) * dt, dz = (hole.sz * speed + kick.z * r / 60) * dt;
    kick.x *= Math.max(0, 1 - dt * 5); kick.z *= Math.max(0, 1 - dt * 5);
    // walls: a column taller than 2 r can't be bitten: slide along it (x only, then z only, else stop)
    const wallAt = (x, z) => { const q = W.eff(x, z); return q.e > P3.wallK * D && q.e > here.e ? q.e : 0; }; // (never trapped: downhill is always open)
    let w = dx || dz ? wallAt(dx, dz) : 0;
    if (w) {
      if (state.time > (state.wallHint || 0)) { state.wallHint = state.time + 6; ctx.hint(`Too tall — grow to ${KM(w / 2)}`); }
      const wx = dx ? wallAt(dx, 0) : 0, wz = dz ? wallAt(0, dz) : 0;
      if (!wx) dz = 0; else if (!wz) dx = 0; else { dx = 0; dz = 0; }
      state.walls = (state.walls || 0) + 1;
    }
    const moved = Math.hypot(dx, dz);
    W.moveHole(dx, dz);
    hole.x = hole.z = 0;
    hole.vx = dt > 0 ? dx / dt : 0; hole.vz = dt > 0 ? dz / dt : 0;
    // the bite: credit = the decrease of the land left (§2.5)
    const tb = performance.now();
    const credit = W.bite.chew(W.hdir, r, dt, moved);
    W.bite.upload();
    this.cpu.bite = performance.now() - tb;
    const dA = credit * P3.gLand[tier] * (ctx.feast ?? P3.feast) * (here.h < 0 ? 0 : 1);
    if (dA > 0) {
      const a0 = hole.area;
      hole.area += dA;
      state.belly = Math.min(1, state.belly + dA / (a0 * P3.meal));
      state.eaten = (state.eaten || 0);
      state.ledgerLand = (state.ledgerLand || 0) + dA;
    }
    // belly and decay (stub until food.js): a full belly lasts 30 s
    const oceanDrain = here.h < 0 ? P3.oceanDrain(tier) : 1;
    state.belly = Math.max(0, state.belly - P3.bellyDrain * oceanDrain * dt);
    hole.area *= 1 - (state.belly > 0 ? P3.decayFed : P3.decayStarving) * dt;
    hole.area = Math.max(hole.area, Math.PI * (0.5 * P3.startR) ** 2);
    hole.vac = Math.max(0, (hole.vac || 0) - dt);
    state.best = Math.max(state.best || 0, hole.r);
    state.land = W.bite.landEaten;
    // tier-up: the name card (the beats - slow-mo, draft - arrive with step 8/10)
    const nt = P3.tier(hole.r);
    if (nt > (state.tier || 1)) {
      state.tier = nt;
      hole.shockwave();
      ctx.card(`Tier ${nt} · ${KM(hole.r)}`, TIERS[nt - 1].name);
      ctx.sfx.levelUp();
    }
  }

  hud(ctx, tier) {
    const { hole, state } = ctx;
    if ((state.hudT = (state.hudT || 0) - 1) > 0) return;
    state.hudT = 6;
    const el = (id) => document.getElementById(id);
    el('size').innerHTML = `${TIERS[tier - 1].name} · <b>${KM(hole.r)}</b>`;
    el('eaten').innerHTML = `Land eaten <b>${(this.world.bite.landEaten * 100).toFixed(this.world.bite.landEaten < 0.001 ? 4 : 2)}</b>%`;
    el('left').innerHTML = `<b>${(P3.speed(hole.r) / 1000).toFixed(2)}</b> km/s`;
    el('hunger').style.width = `${state.belly * 100}%`;
    el('hunger').parentElement.classList.toggle('low', state.belly < 0.3);
    el('stars').hidden = true; el('crave').hidden = true; el('card').hidden = true;
  }

  debugApi(ctx) {
    const W = this.world, { hole, state } = ctx, self = this;
    const api = {
      W, ctx, P: W.P, globe: W.globe, bite: W.bite, camera: ctx.camera,
      /** Set the hole radius (m) at the current spot. */
      setR(m) { hole.area = Math.PI * m * m; },
      /** Jump to a planet direction ({x,y,z}); screen-up toward `toward`. */
      teleport(dir, toward) { W.placeAt(dir, toward); },
      dbg: () => ({ r: hole.r, tier: P3.tier(hole.r), E: W.E, h0: W.h0, e_eff: W.eff(0, 0).e, h: W.eff(0, 0).h, speed: P3.speed(hole.r), land: W.bite.landEaten, belly: state.belly,
        patchBuilds: W.builds, patchMs: W.buildMs, patchMaxSlice: W.maxSlice, lastBuild: W.lastBuild, biteMs: self.cpu.bite, visited: W.bite.visited, worldMs: self.cpu.world, stepMs: self.cpu.step, cap: W.capMode, walls: state.walls || 0, credit: state.ledgerLand || 0 }),
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
      /** Calibration (§2.5): a straight run over flat land at radius r (m): credit per second vs G * 1.2 r^2 * sqrt(hcol). */
      cal(rm, secs = 20, dt = 1 / 30) {
        const saveQ = W.holeQ.clone(), saveBite = { rem: W.bite.rem.slice(), ov: W.bite.ov.slice(), rem8: W.bite.rem8.slice(), sum: W.bite.sum };
        // find a flat-ish stretch of land: sample directions until a long straight line stays on land below the wall height
        let found = null;
        for (let k = 0; k < 4000 && !found; k++) {
          const z = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - z * z), d = { x: Math.cos(a) * s, y: z, z: Math.sin(a) * s };
          const e = W.P.elevation(d, 4);
          if (e > 20 && e < 400) { found = d; }
        }
        W.placeAt(found, { x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 });
        let credit = 0, land = 0, swept = 0, n = 0;
        const v = 0.6 * rm;
        for (let t = 0; t < secs; t += dt) {
          const q = W.eff(0, 0);
          W.moveHole(0, -v * dt);
          const c = W.bite.chew(W.hdir, rm, dt, v * dt);
          credit += c; swept += 2 * rm * v * dt; n++;
          if (q.h > 0) land++;
        }
        const out = { r: rm, credit_m2_per_s: credit / secs, swept_m2_per_s: swept / secs, ratio: credit / swept, landFrac: land / n, visited: W.bite.visited };
        W.holeQ.copy(saveQ); W.hdir.set(0, 1, 0).applyQuaternion(W.holeQ);
        W.bite.rem.set(saveBite.rem); W.bite.ov.set(saveBite.ov); W.bite.rem8.set(saveBite.rem8); W.bite.sum = saveBite.sum; W.bite.tex.needsUpdate = true;
        return out;
      },
    };
    return api;
  }

  leave(ctx) { this.world?.leave(); this.world = null; }
}
