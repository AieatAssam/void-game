// Phase 3 game loop (docs/PHASE3.md): its own per-frame function so Phase 1/2 can't regress. main.js hands it a `ctx` (renderer, post,
// camera, scene, look, the Hole, the run state, sfx, fx pools, flash/hint/card helpers, steer) and calls frame() each tick while
// state.phase === 3. Step 4: the hole on the sphere. Step 5: the bite map (land credit, walls, ridge drag, lowland feast, wound).
// Step 6: food (src/food.js): eating, growth, belly/decay, tier goals + arrow, the ladder. Not here yet: minimap (7), ascension (8), threats (9).
import * as THREE from 'three/webgpu';
import { PlanetWorld } from './planet.js';
import { P3, TIERS } from './phase3.js';
import { R } from './planetgen.js';
import { sunDir } from './look.js';
import { Food } from './food.js';
import { loadPack } from './assets.js';
import { GROWTH } from './hole.js';
import { PlanetMap } from './planetmap.js';

const KM = (m) => (m >= 1e5 ? `${(m / 1000).toFixed(0)} km` : m >= 1e4 ? `${(m / 1000).toFixed(1)} km` : `${(m / 1000).toFixed(2)} km`);
const qs = new URLSearchParams(location.search);
const num = (k, d) => (qs.has(k) && qs.get(k) !== '' && Number.isFinite(+qs.get(k)) ? +qs.get(k) : d);
const _v = new THREE.Vector3(), _s = new THREE.Vector3();
const DUST = new THREE.Color(0xb3a48c);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Share of a bite that becomes growth: crumbs much smaller than the hole barely count (Phase 1's growthShare). */
const share = (tier, r) => 0.06 + 0.94 * smooth(0.1, 0.5, tier / r);

export class PlanetGame {
  constructor() { this.world = null; this.camDist = 0; this.lead = new THREE.Vector2(); this.dbg = {}; this.cpu = { world: 0, bite: 0, step: 0, food: 0 }; }

  /** Build the world behind a loading line, swap the town out, drop the hole in at r0. */
  async begin(ctx) {
    const quality = ctx.Q.tier === 'low' ? 'low' : ctx.Q.tier === 'medium' ? 'medium' : 'high';
    const seed = num('seed', 7);
    const W = this.world = await PlanetWorld.create(seed, { quality, workers: !qs.has('noworker'), onStage: (t) => ctx.stage?.(t) });
    const { hole, state } = ctx;
    const r0 = num('r', P3.startR);
    P3.feast = num('feast', P3.feast);
    await loadPack(ctx.assets, 'planet'); // (the ships, silos and rigs)
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
    const F = this.food = new Food(W, ctx.assets, { quality });
    F.dens = num('dens', 1);
    F.buildGoals(r0); F.refreshGoals(state.tier);
    this.hole = hole; this.ctxRef = ctx;
    F.vx = F.vz = 0; F.update(0, hole, true); F.paintUrban();
    if (!qs.has('nomap')) { this.map = new PlanetMap(ctx.renderer, W.globe); this.map.show(true); this.map.place(W, hole); await this.map.precompile(); } // (the minimap: §6.3)
    state.pop = 0; state.ledger = { meal: 0, crumb: 0, land: 0, fed: 0, starve: 0, ate: 0, crumbs: 0 }; state.tierAt = { 1: 0 }; state.shake = 0; state.slowT = 0;
    this.camDist = 0;
    window.__planet = this.debugApi(ctx);
    window.__planetLand = () => W.bite.landEaten * 100; // % of the world's land eaten
    window.__planetDbg = window.__planet.dbg; // r, tier, e_eff, speed, patch builds, bite/world/step ms
    window.__planetLadder = () => this.ladderTest(ctx);
    window.__P3 = P3; // (balance knobs between runs: __P3.growth, __P3.gLand, ...)
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
    const sh = state.shake * camDist * 0.015;
    if (sh > 0) { camera.position.x += Math.sin(state.time * 23) * sh; camera.position.y += Math.sin(state.time * 31) * sh * 0.5; camera.position.z += Math.cos(state.time * 19) * sh; }
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
    this.map?.place(W, hole);
    sun.position.copy(_s).multiplyScalar(1000); sun.target.position.set(0, 0, 0);
    sunDir.value.copy(_s);
    ctx.sparks.update(dt); ctx.debris.update(dt);
    if (state.playing) this.hud(ctx, tier);
    ctx.news.update(dt, state.pop || 0, !!state.playing);
    this.map?.update(dt, { hole, world: W, food: this.food, tier, land: W.bite.landEaten });
    this.cpu.step = t1 - t0;
    if (!window.__headless) {
      if (document.visibilityState === 'visible' && !qs.has('nowatch')) post.watch(dt);
      const ts = ctx.fpsEl && performance.now();
      post.render([1, 1, 1]);
      if (this.map && !qs.get('off')?.includes('map')) this.map.render(); // (after the post pipeline, scissored to its own corner)
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
    const L = state.ledger;
    // the bite: credit = the decrease of the land left (§2.5)
    const tb = performance.now();
    const credit = W.bite.chew(W.hdir, r, dt, moved);
    W.bite.upload();
    this.cpu.bite = performance.now() - tb;
    const dA = credit * P3.gLand[tier] * P3.feast * (here.h < 0 ? 0 : 1);
    if (dA > 0) {
      const a0 = hole.area;
      hole.area += dA;
      state.belly = Math.min(1, state.belly + dA / (a0 * P3.meal));
      L.land += dA; state.ledgerLand = L.land;
    }
    // food: spawn / despawn around the hole, the ladder, falls; eat what has fallen in
    const tf = performance.now();
    for (const ev of this.food.update(dt, hole)) {
      if (ev.type === 'eat') this.eat(ev.e, ctx);
      else if (state.time > (state.tooBigT || 0)) { state.tooBigT = state.time + 6; ctx.hint(`Too big — grow to ${KM(ev.e.tier / 0.95)}`); }
    }
    this.cpu.food = performance.now() - tf;
    const g = this.food;
    if (g.tier === (state.tier || 1) && g.goalTotal && g.goalLeft === 0 && !state.goalDone?.[g.tier]) this.goalCleared(ctx, g.tier);
    // belly and decay (§4.5): a full belly lasts 30 s; fed 0.1%/s, starving 0.8%/s
    const oceanDrain = here.h < 0 ? P3.oceanDrain(tier) : 1;
    state.belly = Math.max(0, state.belly - P3.bellyDrain * oceanDrain * (state.mods?.hunger ?? 1) * dt);
    const dr = (state.belly > 0 ? P3.decayFed : P3.decayStarving) * dt, a1 = hole.area;
    hole.area *= 1 - dr;
    if (state.belly > 0) L.fed -= a1 * dr; else L.starve -= a1 * dr;
    hole.area = Math.max(hole.area, Math.PI * (P3.floorK * TIERS[tier - 1].r) ** 2); // (stand-in for the Sealed loss, step 8)
    hole.vac = Math.max(0, (hole.vac || 0) - dt);
    hole.bump = Math.max(0, (hole.bump || 0) - dt * 2);
    state.best = Math.max(state.best || 0, hole.r);
    state.land = W.bite.landEaten;
    state.shake = Math.max(0, state.shake - dt * 1.5);
    if (state.slowT > 0 && (state.slowT -= dt) <= 0) state.slowmo = 1;
    // tier-up (§6.1): hitstop, a slow beat, the name card
    const nt = P3.tier(hole.r);
    if (nt > (state.tier || 1)) {
      state.tier = nt; state.tierAt[nt] = state.time;
      hole.shockwave();
      state.hitstop = Math.max(state.hitstop || 0, 0.25); state.slowmo = 0.4; state.slowT = 0.6; state.punch = 1;
      ctx.card(`Tier ${nt} · ${KM(hole.r)}`, TIERS[nt - 1].name);
      ctx.sfx.levelUp();
      ctx.news.say(`${TIERS[nt - 1].name}: the void is now ${KM(hole.r)} wide`);
      g.refreshGoals(nt);
    }
  }

  /** A meal has started to fall: growth now (the HUD answers at once), then the feel (§5.3) and the news. */
  eat(e, ctx) {
    const { hole, state, sfx, debris, sparks, news } = ctx, W = this.world, r = hole.r, t = e.tier, k = t / r, L = state.ledger;
    const crumb = k < 0.12 || e.kind === 'forest';
    const a0 = hole.area, tier = P3.tier(r);
    hole.area += Math.PI * t * t * GROWTH * P3.growth[tier] * share(t, r) * (crumb ? P3.crumbGrowth : 1) * (state.mods?.growth ?? 1);
    const dA = hole.area - a0;
    L[crumb ? 'crumb' : 'meal'] += dA; L[crumb ? 'crumbs' : 'ate']++;
    if (window.__eatLog) window.__eatLog.push(`${state.time.toFixed(0)}s ${e.kind} ${e.name} ${(k).toFixed(2)}r dA=${(100 * dA / a0).toFixed(1)}% belly+${(dA / (a0 * P3.meal)).toFixed(2)}`);
    state.belly = Math.min(1, state.belly + dA / (a0 * P3.meal) + (crumb ? P3.crumb : 0));
    state.eaten = (state.eaten || 0) + 1; state.pop += e.pop || 0;
    state.score = (state.score || 0) + Math.PI * t * t;
    hole.vac = Math.min(1, (hole.vac || 0) + 0.35); hole.bump = Math.min(0.25, (hole.bump || 0) + k * 0.3);
    const y = W.groundY(e.x, e.z);
    if (!crumb || (state.crumbT = (state.crumbT || 0) - 1) <= 0) {
      state.crumbT = 6;
      (k > 0.5 ? sfx.bigGulp : sfx.gulp)(Math.min(8, k * 8));
      sparks.burst(0, 0, r, Math.min(3, k * 3));
    }
    if (crumb) return;
    // dust: a front rolling out of the rim (scaled to the meal) and a plume where the thing stood (§5.3 layers: dust ring, then the collapse)
    const g0 = W.groundY(0, 0);
    debris.dustRing(0, g0, 0, r * 1.02, r * (0.45 + 0.6 * k), 22 + Math.round(14 * k), r * (0.5 + 0.55 * k), 2.8, DUST, 0.85);
    if (e.kind === 'settle') debris.dustRing(e.x, y, e.z, t * 0.35, t * 0.5, 16, Math.max(t * 0.7, r * 0.2), 2.4, DUST, 0.8);
    if (k >= 0.5) hole.shockwave();
    state.shake = Math.max(state.shake, k >= 0.6 ? 0.3 : 0.1 + 0.15 * k);
    if (k >= 0.6) state.hitstop = Math.max(state.hitstop || 0, 0.08);
    if (e.kind === 'settle' && k > 0.25 && news.queue.length < 2) news.say(`${e.name} swallowed — ${e.pop.toLocaleString()} evacuated`);
  }

  goalCleared(ctx, tier) {
    const { state, news, sfx } = ctx, g = this.food;
    (state.goalDone ??= {})[tier] = true;
    const names = (g.goalsByTier[tier] ?? []).map((e) => e.name);
    ctx.card('Goal cleared', g.goalNames?.[tier] ?? 'Tier goal');
    news.say(`${names.at(-1)} has fallen`);
    sfx.levelUp();
    ctx.draft?.();
  }

  /** window.__planetLadder(): 20 random spots per tier (T1..T3), each at a random size in the tier; asserts the §4.2 guarantee. */
  ladderTest(ctx, per = 20) {
    const W = this.world, F = this.food, { hole } = ctx, save = { q: W.holeQ.clone(), a: hole.area }, out = { total: { pass: 0, fail: 0 } };
    F.noShow = true;
    const bounds = [[1400, 6000], [6000, 25000], [25000, 110000]];
    for (let tier = 1; tier <= 3; tier++) {
      const o = out['T' + tier] = { pass: 0, fail: 0, fails: [], meals: [], gap: 0 };
      for (let k = 0; k < per; k++) {
        const z = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - z * z), d = { x: Math.cos(a) * s, y: z, z: Math.sin(a) * s };
        const [lo, hi] = bounds[tier - 1], r = lo * (hi * 0.95 / lo) ** Math.random(), e0 = W.P.elevation(d, 4);
        if ((k % 3 !== 0 && e0 < 20) || e0 > P3.wallK * P3.depth(r)) { k--; continue; } // two spots in three on land; never on a wall (the hole can't stand there)
        W.placeAt(d, { x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }); hole.area = Math.PI * r * r; hole.vx = hole.vz = 0;
        F.reset(); F.vx = F.vz = 0; F.update(0, hole, true);
        let meals = 0, bigger = 0;
        for (const e of F.recs) { if (!e.alive) continue; const q = e.tier / r; if (e.d < 25 * r && q >= 0.3 && q < 0.95) meals++; if (e.d < 15 * r && q >= 1 && q <= 1.6) bigger++; }
        o.meals.push(meals);
        if (meals >= 3 && bigger >= 1) { o.pass++; out.total.pass++; } else { o.fail++; out.total.fail++; o.fails.push({ r: Math.round(r), meals, bigger, recs: F.recs.size, made: F.lastMade, e: Math.round(W.P.elevation(W.hdir, 3)) }); }
      }
    }
    F.noShow = false;
    W.holeQ.copy(save.q); W.hdir.set(0, 1, 0).applyQuaternion(W.holeQ); hole.area = save.a;
    F.reset(); F.update(0, hole, true);
    return out;
  }

  hud(ctx, tier) {
    const { hole, state } = ctx, F = this.food;
    const g = F.nextGoal(hole);
    ctx.edgeArrow('town', g && g.d > hole.r * 5 && [g.x, g.z], g ? `${g.name}${g.fits ? '' : ` · ${KM(g.need)}`}` : '', g?.fits ? '#9ed9bf' : '#ff8a3d');
    if ((state.hudT = (state.hudT || 0) - 1) > 0) return;
    state.hudT = 6;
    const el = (id) => document.getElementById(id);
    const S = Math.log10(hole.r);
    el('size').innerHTML = `${TIERS[tier - 1].name} · <b>${KM(hole.r)}</b> · S ${S.toFixed(2)}`;
    // §4.5: the tier goal until T3, the planet % from T3 (both), then the % alone from T4 (it takes over: the final tier is a crescendo)
    el('eaten').hidden = tier < 3;
    el('eaten').innerHTML = `Land eaten <b>${(this.world.bite.landEaten * 100).toFixed(this.world.bite.landEaten < 0.001 ? 4 : this.world.bite.landEaten < 0.1 ? 2 : 1)}</b>%`;
    el('left').hidden = tier > 3;
    el('left').innerHTML = g ? `${g.name} — <b>${F.goalLeft}</b> left` : F.goalTotal ? `${F.goalNames?.[tier] ?? 'Goal'} <b>cleared</b>` : `<b>${(P3.speed(hole.r) / 1000).toFixed(2)}</b> km/s`;
    const dc = el('defcon'); dc.hidden = false; // (the director sets state.defcon in step 9: 5 = calm .. 1)
    [...dc.querySelectorAll('i')].forEach((pip, i) => pip.classList.toggle('on', i >= (state.defcon ?? 5) - 1));
    el('hunger').style.width = `${state.belly * 100}%`;
    el('hunger').parentElement.classList.toggle('low', state.belly < 0.3);
    el('stars').hidden = true; el('crave').hidden = true; el('card').hidden = true;
  }

  debugApi(ctx) {
    const W = this.world, { hole, state } = ctx, self = this;
    const api = {
      W, ctx, P: W.P, globe: W.globe, bite: W.bite, camera: ctx.camera, food: self.food, game: self,
      /** Debug: stand `dist` m from goal item i of tier `tier` (bearing rad), radius r, facing it, patch built, game paused (state.playing = false). */
      look(i = 4, dist = 3500, r = 1400, bearing = 4, tier = 1) {
        const e = self.food.goalsByTier[tier][i];
        W.placeAt(W.P.step(e.dir, bearing, dist), e.dir); hole.area = Math.PI * r * r; hole.vx = hole.vz = 0; W.h0Set = false; W.job = null; W.buildPatchNow(r);
        self.camDist = 0; self.food.reset(); self.food.revive(); self.food.update(0, hole, true); self.food.paintUrban(); state.playing = false; state.belly = 1;
        return { name: e.name, d: e.d | 0, boxes: self.food.stats.boxes };
      },
      /** Debug: stand `dist` m from the nearest item of `kind` (ρ >= minRho) near goal 4's region, hole radius r, facing it. */
      lookKind(kind = 'forest', minRho = 500, dist = 2400, r = 1400, near = [4, 12000, 4], bearing = 1.2) {
        this.look(near[0], near[1], r, near[2]);
        const e = [...self.food.recs].filter((q) => q.kind === kind && q.tier >= minRho && q.alive).sort((a, b) => a.d - b.d)[0];
        if (!e) return 'none';
        W.placeAt(W.P.step(e.dir, bearing, dist), e.dir); W.h0Set = false; W.job = null; W.buildPatchNow(r);
        self.camDist = 0; self.food.reset(); self.food.update(0, hole, true); self.food.paintUrban();
        return `${e.name} ${e.kind} rho=${e.tier | 0} biome=${e.biome}`;
      },
      /** Debug: look() at goal i, then steer into it and freeze when its fall is `frac` done (a crumble screenshot). */
      crumb(i = 2, tier = 1, dist = 2600, r = 1400, frac = 0.4, bearing = 4) {
        const e = self.food.goalsByTier[tier][i], st = ctx.state;
        this.look(i, dist, r, bearing, tier); st.playing = true; st.belly = 1;
        let n = 0;
        for (; n < 900 && !(e.falling && e.fallT / e.fallDur > frac); n++) this.run(1, () => { const l = Math.hypot(e.x, e.z) || 1; return [e.x / l, e.z / l]; });
        st.playing = false; return { n, T: e.fallT / e.fallDur, name: e.name, rho: e.tier | 0 };
      },
      /** Set the hole radius (m) at the current spot. */
      setR(m) { hole.area = Math.PI * m * m; },
      /** Jump to a planet direction ({x,y,z}); screen-up toward `toward`. */
      teleport(dir, toward) { W.placeAt(dir, toward); },
      dbg: () => ({ r: hole.r, tier: P3.tier(hole.r), E: W.E, h0: W.h0, e_eff: W.eff(0, 0).e, h: W.eff(0, 0).h, speed: P3.speed(hole.r), land: W.bite.landEaten, belly: state.belly,
        patchBuilds: W.builds, patchMs: W.buildMs, patchMaxSlice: W.maxSlice, lastBuild: W.lastBuild, biteMs: self.cpu.bite, visited: W.bite.visited, food: self.food.stats, foodMs: self.cpu.food, worldMs: self.cpu.world, stepMs: self.cpu.step, cap: W.capMode, walls: state.walls || 0, credit: state.ledgerLand || 0 }),
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

  leave(ctx) {
    this.map?.dispose(); this.map = null;
    for (const id of ['stars', 'eaten', 'left']) { const e = document.getElementById(id); if (e) e.hidden = false; }
    document.getElementById('defcon').hidden = true;
    this.world?.leave(); this.world = null;
  }
}
