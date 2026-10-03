// Phase 3 debug and test hooks, moved out of planetgame.js (P2-7; no behaviour change): `Object.assign(PlanetGame.prototype, debugMethods)`. window.__planet (debugApi: reset, setR, teleport, run,
// cal, ...), __planetUnits (unitsApi: the landforms in numbers), __planetLadder (ladderTest), __finale (installFinaleDebug), fastLand (?land=), fastFinale (the sweeps), fakeLand (?finale).
import { P3, TIERS, portraitK } from './phase3.js';
import { R } from './planetgen.js';
import { modsFor } from './perks.js';
import { FT } from './finale.js';

export const debugMethods = {
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
  },
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
  },
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
        Object.assign(state, { belly: 1, tier: P3.tier(self.r0), land: 0, time: 0, pop: 0, best: 0, walls: 0, goalDone: [], tierLand: {}, tierAt: { 1: 0 }, shake: 0, slowT: 0, slowDuration: 0, slowFrom: 1, stun: 0, wound: 0, slowmo: 1, hitstop: 0, ledger: { land: 0, tear: 0, pull: 0, fed: 0, starve: 0 }, perks: [], mods: modsFor([]), drafts: 0, draftsDue: 0, draft: null, continents: 0, won: false });
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
  },
  installFinaleDebug(ctx) {
    const F = this.fin, self = this;
    window.__finale = Object.assign((t) => { F.hold = true; F.scrub(t); window.__tick(1 / 60, 1); return t; }, {
      play() { F.hold = false; }, fin: () => F, FT, start: () => self.startFinale(ctx), fake: (f) => self.fakeLand(f), clock: () => F.t,
    });
  },
  /** Eat the land (the real bite map: units, people and goals follow) until `frac` of it is gone, the credit thrown away: for tests (?land=). Returns the share. */
  fastLand(frac = 0.89, r = 1.2e6) {
    const W = this.world, B = W.bite, lf = B.lf, land = lf.land, pd = lf.pDir, d = { x: 0, y: 0, z: 0 }; let guard = 0;
    while (B.landEaten < frac && guard++ < 6000) {
      const pk = land[Math.floor(Math.random() * land.length)]; if (!(lf.lv[0].left[pk] > 1e-4)) continue;
      d.x = pd[pk * 3]; d.y = pd[pk * 3 + 1]; d.z = pd[pk * 3 + 2]; B.chew(d, r, 30, 0); B.upload(); B.tflag.fill(0); B.nTouched = 0; B.events.length = 0;
    }
    B.jobs.length = 0; this.ctxRef.state.pop = B.pop; return B.landEaten;
  },
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
  },
  /** Visual only: take the land away (the wound shader on every land texel) without touching the accounting. */
  fakeLand(frac = 1) {
    const B = this.world.bite, n = B.hm.length; let k = 0;
    for (let i = 0; i < n; i++) { if (B.hm[i] !== 65535 && Math.random() < frac) { B.rem8[i] = 0; B.rem[i] = 0; } k++; }
    B.tex.needsUpdate = true; return k;
  },
};
