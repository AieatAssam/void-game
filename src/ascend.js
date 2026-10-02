// The Ascension (docs/PHASE3.md §7, §12.7 R6): the Phase 2 -> 3 cinematic. The capital falls and the world goes quiet; the island cracks and the sea pours in;
// the hole rips outward (r 60 m -> 40 km, devouring the coast: the first wound is real); one continuous log-zoom pull-out through two cloud decks to orbit
// (sky blue -> indigo -> black, stars, the curved limb, the wound a glowing scar by a coast); a hold on the whole planet with the Moon in frame and the name
// card; the plunge back down to the T1 camera. Control returns on the way down.
//
// One clock (`t`, cinematic seconds) drives everything; main.js feeds it the raw frame time. The camera is a parametric orbit around the hole (dist, pitch, yaw, fov,
// aimK, aimF): main.js applies it in the region, planetgame.js on the planet, so the world swap (under the lilac flash, at T.swap) is seamless: the hole is at the render
// origin in both worlds and the same numbers give the same view. The planet is built during Phase 2 (PlanetGame.prepare, 3 ms slices); the swap is cheap.
import * as THREE from 'three/webgpu';
import { uniform, vec2, vec3, vec4, float, length, atan, mix, smoothstep, abs, floor, positionLocal, mx_noise_float, hash, max, min, step } from 'three/tsl';
import { spriteCloud } from './fx.js';
import { R } from './planetgen.js';
import { P3 } from './phase3.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const eio = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2); // ease in-out cubic
const eo = (u) => 1 - (1 - u) ** 3;
const lerp = (a, b, k) => a + (b - a) * k;
const lg = (a, b, k) => a * (b / a) ** k; // log interpolation

/** Seconds on the clock where each beat starts. */
export const T = {
  hold: 0.45, // silence: the freeze
  brk: 2.9, // the island breaks, then the surge starts
  swap: 5.0, // the flash peaks: region -> planet
  flashEnd: 5.6, surgeEnd: 7.4, // the planet's hole reaches 40 km (the lip is in frame from ~5.8 s: you watch it rip over the coast)
  pull: 9.8, // the whole planet in frame
  reveal: 12.7, // the plunge starts
  control: 14.4, end: 15.8, // control returns; the camera is home
};
const R_SWAP = 8000; // hole radius (m) at the swap (the region's last visible radius): the planet's surge carries on to 40 km
const D_SWAP = 3000; // camera distance (m) at the swap
const SKY = [new THREE.Color(0x4f8fe0), new THREE.Color(0x2b2f8a), new THREE.Color(0x000004)]; // blue, indigo, space
const CSS = `
#ascbars i{position:fixed;left:0;right:0;height:0;background:#000;z-index:30;pointer-events:none}
#ascbars i:first-child{top:0}#ascbars i:last-child{bottom:0}
#ascflash{position:fixed;inset:0;z-index:31;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 55%,#fff 0%,#e9dcff 35%,#a77cff 80%,#7a4cff 100%)}
.edge-arrow.pulse b{animation:ascpulse .7s ease-in-out infinite alternate}
@keyframes ascpulse{from{transform:scale(1);filter:brightness(1)}to{transform:scale(1.35);filter:brightness(1.8)}}
#news{z-index:35}
#hud.ascin{animation:aschud 1.2s ease-out both}
@keyframes aschud{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}`;

/** The crack disc (region): a polar mesh laid on the ground (heights from the terrain); the shader draws spokes and rings out to a front that races to the coast. */
function crackDisc(groundY, radius, ox, oz) {
  const NA = 160, NR = 64, pos = new Float32Array((NA + 1) * (NR + 1) * 3), idx = [];
  for (let j = 0; j <= NR; j++) {
    const r = radius * (j / NR) ** 1.6;
    for (let i = 0; i <= NA; i++) {
      const a = (i / NA) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, o = (j * (NA + 1) + i) * 3;
      pos[o] = x; pos[o + 1] = groundY(x + ox, z + oz) + 0.35 + r * 0.0006; pos[o + 2] = z;
    }
  }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, b, c, b, d, c); } // (wound to face up)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  const u = { uFront: uniform(0), uHot: uniform(0), uW: uniform(2), uVis: uniform(1) }; // front: how far the cracks have run (m); hot: the lilac glow along them; w: a crack's half width (m, scales with the camera)
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const p0 = positionLocal.xz, nz = (x, y, z) => mx_noise_float(vec3(x, y, z));
  // domain warp in two octaves: jagged, shattered-glass lines instead of a diagram
  const warp = vec2(nz(p0.x.mul(0.012), p0.y.mul(0.012), 3.1), nz(p0.x.mul(0.012).add(9), p0.y.mul(0.012), 5.7)).mul(u.uW.mul(5)).add(vec2(nz(p0.x.mul(0.045), p0.y.mul(0.045), 1.3), nz(p0.x.mul(0.045).add(4), p0.y.mul(0.045), 8.1)).mul(u.uW.mul(1.8)));
  const q = p0.add(warp), r = length(q), a = atan(q.y, q.x);
  // spokes: a main family (13, each its own length) and a branching family (31, short, half of them missing); thick at the hole, thin at the tip
  const spokes = (N, seed, reachK, keep) => {
    const sector = float(Math.PI * 2 / N), k = a.div(sector).add(0.5), id = floor(k), h = hash(id.add(seed));
    const reach = u.uFront.mul(h.mul(0.5).add(0.5)).mul(reachK), taper = mix(float(1.7), float(0.45), min(r.div(reach.max(1)), 1));
    return mix(float(1e4), abs(k.sub(id).sub(0.5)).mul(sector).mul(r).div(taper), step(r, reach).mul(step(12, r)).mul(step(keep, h)));
  };
  let dMin = min(spokes(13, 3, 1, 0), spokes(31, 11, 0.42, 0.45));
  for (const [R0, s] of [[110, 1], [260, 2], [470, 3], [760, 4], [1100, 5], [1500, 6]]) { // (broken rings: a crack that stops, picks up again)
    const here = step(R0, u.uFront).mul(step(0.34, nz(a.mul(2.6), float(s), float(4.4)).mul(0.5).add(0.5)));
    dMin = min(dMin, mix(float(1e4), abs(r.sub(R0)), here));
  }
  const core = float(1).sub(smoothstep(u.uW.mul(0.5), u.uW.mul(0.8), dMin)), glow = float(1).sub(smoothstep(u.uW.mul(0.8), u.uW.mul(2.6), dMin)).mul(u.uHot);
  // the ground inside the front sags into shadow toward the hole (a cheap stand-in for a real sink: a dark, soft fill that deepens with the front)
  const fill = float(1).sub(smoothstep(u.uFront.mul(0.15), u.uFront.add(80), length(p0))).mul(0.4);
  m.colorNode = vec4(mix(mix(vec3(0.015, 0.01, 0.03), vec3(0.6, 0.36, 1.0).mul(1.8), min(glow.mul(2.4), 1)), vec3(0.02, 0.015, 0.03), core), 1);
  m.opacityNode = max(max(core.mul(0.95), glow.mul(0.5)), fill).mul(u.uVis);
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 3;
  return { mesh, u };
}

export class Ascension {
  /**
   * d: { camera, hole, state, ctx (planetCtx), game (the prepared PlanetGame), city (getter: the Region), debris, sfx, hideHud(), showHud(), card(small, big),
   *      cam0: { dist, yaw, pitch, fov }, fast, done() }
   */
  constructor(d) {
    Object.assign(this, d);
    // (this.k: real seconds per cinematic second: 0.4 = fast, window.__ascK = 6 for slow-motion captures)
    this.t = 0; this.k = d.fast ? 0.4 : 1; this.stage = 'region'; this.did = new Set(); this.news = false; this.shake = 0; this.over = false;
    const c0 = d.cam0;
    this.cam = { dist: c0.dist, pitch: c0.pitch, yaw: c0.yaw, fov: c0.fov, aimK: 0, aimF: 0, roll: 0, jx: 0, jy: 0, jz: 0 };
    this.revPitch = 0.62; this.revYaw = 0.55; this.revFov = 22; // the reveal's composition: the planet from the side, the sun over the limb
    const el = (tag, id) => Object.assign(document.createElement(tag), { id });
    this.style = Object.assign(document.createElement('style'), { textContent: CSS }); document.head.append(this.style);
    this.bars = el('div', 'ascbars'); this.bars.append(document.createElement('i'), document.createElement('i'));
    this.flashEl = el('div', 'ascflash'); document.body.append(this.bars, this.flashEl);
    this.W = null; this.chewT = 0; this.holeLog = d.hole.r;
    this.cracks = crackDisc((x, z) => d.city().groundY(x, z), 2000, d.hole.x, d.hole.z);
    this.cracks.mesh.position.set(d.hole.x, 0, d.hole.z); this.cracks.mesh.visible = false;
    d.ctx.scene.add(this.cracks.mesh);
    this.coast = 1400;
    // the planet's cinematic extras: the wound's glow (visible from orbit) and two cloud decks the camera climbs through
    this.wound = spriteCloud(2, { additive: true, world: true }); this.wound.sprite.renderOrder = 12; this.wound.sprite.visible = false; this.wound.sprite.frustumCulled = false;
    this.decks = spriteCloud(112, { additive: false, world: true }); this.decks.sprite.renderOrder = 6; this.decks.sprite.visible = false; this.decks.sprite.frustumCulled = false;
    this.deckSeed = Array.from({ length: 112 }, (_, i) => ({ deck: i < 56 ? 0 : 1, a: Math.random() * 6.283, d: Math.sqrt(Math.random()), s: 0.6 + Math.random() * 0.8, dy: Math.random() - 0.5 }));
  }

  /** The camera at the clock's time (cam: the orbit around the hole, the aim, the sway). */
  place(t) {
    const c = this.cam, c0 = this.cam0;
    c.aimK = 0; c.aimF = 0; c.roll = 0;
    if (t < T.swap) {
      // 1 silence: a slow push-in and a held breath; 2 the island breaks: the kaiju angle, climbing and turning; 3 the surge: the rise, the lens stretches
      const u1 = clamp(t / T.hold), u2 = clamp((t - T.hold) / (T.brk - T.hold)), u3 = clamp((t - T.brk) / (T.swap - T.brk));
      const dBrk = Math.max(c0.dist * 1.55, 2300), pBrk = 0.56; // (the kaiju climb ends high enough to see the coast the cracks run to)
      c.yaw = c0.yaw + 0.5 * eio(u2) + 0.35 * u3;
      if (t < T.brk) { c.dist = lerp(c0.dist * (1 - 0.06 * eio(u1)), dBrk, eio(u2)); c.pitch = lerp(c0.pitch, pBrk, eio(u2)); c.fov = lerp(c0.fov, c0.fov * 0.86, eo(u1)) + 3 * u2; }
      else { c.dist = lg(dBrk, D_SWAP, u3 ** 1.25); c.pitch = lerp(pBrk, 0.96, sm(0, 1, u3)); c.fov = lerp(c0.fov * 0.86 + 3, 44, sm(0, 1, u3)); }
    } else {
      const home = this.home, up = clamp((t - T.swap) / (T.pull - T.swap)), ur = clamp((t - T.reveal) / (T.end - T.reveal)), dView = this.viewDist;
      if (t < T.pull) { // the pull-out: one log-zoom, the pitch easing to the reveal's, the lens narrowing as the camera recedes
        const s = 1 - (1 - up) ** 2.4; // (out-ease: the rip out of the pit is fast, the arrival at the planet gentle)
        c.dist = lg(D_SWAP, dView, s); c.pitch = lerp(lerp(0.96, 0.3, sm(0, 0.35, s)), this.revPitch, sm(0.5, 1, s));
        // (the camera lowers to a grazing angle through the first 90 km: the horizon is in frame, the sky goes blue -> indigo -> black above it; then it rises to the reveal's)
        c.yaw = lerp(this.yawSwap, this.revYaw, s); c.fov = lerp(44, this.revFov, sm(0.3, 1, up)); c.aimK = sm(0.25, 1, up);
      } else if (t < T.reveal) { // the hold: a slow orbit and a creeping dolly
        const h = (t - T.pull) / (T.reveal - T.pull);
        c.dist = dView * (1 + 0.035 * h); c.pitch = this.revPitch + 0.02 * h; c.yaw = this.revYaw + 0.22 * h; c.fov = this.revFov; c.aimK = 1;
      } else { // the plunge: the world turns until the hole is at the top, the lens opens back to the game's
        const s = eio(ur);
        c.dist = lg(dView * 1.035, home.dist, s); c.pitch = lerp(this.revPitch + 0.02, home.pitch, s); c.yaw = lerp(this.revYaw + 0.22, 0, eo(ur)); c.fov = lerp(this.revFov, home.fov, s);
        c.aimK = 1 - sm(0, 0.5, ur); c.aimF = home.aimF * sm(0.3, 1, ur); // (the hole is back in the middle of the frame by the half way: the wound never leaves it)
      }
    }
    // trauma: a slow sway, never a jitter (the roll rides the same number)
    const a = this.shake * this.shake, tt = this.t;
    c.jx = a * c.dist * 0.02 * (Math.sin(tt * 2.9) + 0.5 * Math.sin(tt * 6.3 + 1)); c.jy = a * c.dist * 0.01 * Math.sin(tt * 3.7 + 2); c.jz = a * c.dist * 0.014 * Math.cos(tt * 2.3);
    if (this.shake > 0.25) c.roll = Math.sin(tt * 5.1) * 0.05 * (this.shake - 0.25);
  }

  /** The camera distance (from the hole) at which the whole planet fills ~62% of the frame at pitch p (m). */
  planetDist(p) {
    const th = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.revFov) / 2) * Math.min(1, this.camera.aspect) * 0.62), dc = R / Math.sin(th), sp = Math.sin(p);
    return -R * sp + Math.sqrt(R * R * sp * sp - R * R + dc * dc);
  }

  once(name, t, fn) { if (this.t >= t && !this.did.has(name)) { this.did.add(name); fn(); } }

  /** Advance by the raw frame time (before the sim's slow-mo). */
  advance(raw) {
    if (this.over) return;
    const { state, hole, sfx } = this;
    this.t += Math.min(raw, 0.1) / (window.__ascK ?? this.k);
    const t = this.t;
    this.once('start', 0, () => {
      this.ctx.news.queue.length = 0;
      sfx.duck(0.1, 0.2); sfx.drone(3.4, 0.5);
      state.slowmo = 0.04; this.shake = 0.2; // (the freeze: the hit-stop on the last capital piece)
      this.hideHud();
      this.bars.style.transition = 'height 1.2s ease-in'; requestAnimationFrame(() => { for (const i of this.bars.children) i.style.height = '6.5vh'; });
    });
    this.once('post', 0.12, () => this.game.world.enterPost(this.ctx.post)); // (the post pipeline rebuilds without AO: one hitch, under the freeze)
    this.once('break', T.hold, () => { this.lite(true); state.slowmo = 0.3; this.shake = 0.9; hole.shockwave(); sfx.boom(1); sfx.duck(0.5, 0.2); this.cracks.mesh.visible = true; });
    for (const [name, ts, r0, v, n, size, life] of [['d1', 0.5, 'h', 25, 32, 12, 3.5], ['d2', 0.95, 2, 50, 36, 26, 4], ['d3', 1.6, 0.4, 90, 40, 46, 5], ['d4', 2.3, 0.85, 140, 40, 70, 6]]) this.once(name, ts, () => {
      const rr = r0 === 'h' ? hole.r : this.city().half * r0, col = new THREE.Color(name === 'd2' || name === 'd4' ? 0x8c7a64 : 0xb8a58a);
      this.debris.dustRing(hole.x, 1, hole.z, rr, v, n, size, life, col, 0.7); hole.shockwave(); this.shake = Math.max(this.shake, 0.7); sfx.boom(0.8);
    });
    this.once('surge', T.brk, () => { state.slowmo = 0.5; sfx.surge(2.3); sfx.duck(1, 0.3); this.shake = 1; });
    this.once('clear', T.brk + 0.25, () => { for (let i = 0; i < this.debris.plife.length; i++) this.debris.plife[i] = Math.min(this.debris.plife[i], 0.6); }); // (the dust rings of the breaking island fade before the pit swallows them)
    this.shake = Math.max(0, this.shake - raw * (t < T.brk ? 0.25 : 0.12));
    const D = window.__ascDbg; // (dev: price the parts of the region stage: window.__ascDbg = { debris: false, cracks: false, water: false, city: false, terrain: false, hole: false })
    if (D && this.stage === 'region') {
      const C = this.city(), vis = (o, k) => { if (o && D[k] !== undefined) o.visible = D[k]; };
      vis(this.debris.puffs, 'debris'); vis(this.debris.mesh, 'chunks'); vis(this.cracks.mesh, 'cracks'); vis(C.terrain?.waterMesh, 'water'); vis(C.group, 'city'); vis(C.terrain?.group, 'terrain'); vis(hole.group, 'hole');
    }
    if (this.stage === 'region') this.regionFrame(raw, t);
    if (t >= T.swap && this.stage === 'region') this.swap();
    // the flash: in over the last half second of the surge, out over the first 0.8 s of the planet
    this.flashEl.style.opacity = (t < T.swap ? sm(T.swap - 0.55, T.swap, t) : 1 - sm(T.swap + 0.1, T.flashEnd, t)).toFixed(3);
    this.place(t);
    if (this.stage === 'planet') this.planetBeats(raw, t);
  }

  /** The region stage: cracks race to the coast, the sea pours in, the hole rips out. */
  regionFrame(raw, t) {
    const { hole, state, debris } = this, S = this.cracks.u;
    const u = clamp((t - T.hold) / 2.1);
    S.uFront.value = 4 + (this.coast + 160) * eo(u) ** 1.4; S.uHot.value = 1 - sm(0.7, 1, (t - T.brk) / 0.8); S.uVis.value = 1 - sm(T.brk + 0.1, T.brk + 1.3, t); // (the pit takes the cracks) S.uW.value = Math.max(1.0, this.cam.dist * 0.0021) * (1 + 0.8 * sm(0.3, 1, u));
    this.cracks.mesh.position.set(hole.x, 0, hole.z);
    // the sea pours over the coast: white fans of water sliding in and down
    if (t > 0.9 && t < 4.6 && (this.pourT = (this.pourT || 0) - raw) < 0) {
      this.pourT = 0.07;
      const T0 = this.city().terrain;
      for (let q = 0; q < 3; q++) {
        const a = Math.random() * 6.283, cr = T0.coastR(Math.cos(a), Math.sin(a)) - 30 * Math.random(), x = hole.x + Math.cos(a) * cr, z = hole.z + Math.sin(a) * cr, s = 24 + Math.random() * 40;
        debris.puff(x, T0.water + s * 0.4, z, -Math.cos(a) * (30 + Math.random() * 30), -s * 0.15 + Math.random() * 3, -Math.sin(a) * (30 + Math.random() * 30), s, s * 0.8, 2.2 + Math.random(), new THREE.Color(0xf2f8ff), 0.6);
        if (Math.random() < 0.5) debris.puff(x, T0.water + 4, z, -Math.cos(a) * 12, 18 + Math.random() * 14, -Math.sin(a) * 12, s * 0.6, s, 1.8, new THREE.Color(0xdfeaf5), 0.45); // (spray)
      }
    }
    // the surge: the radius in a log ramp (slow start, the lip crossing the coast about 0.55 of the way, gone from the frame at 0.9)
    if (t >= T.brk) hole.area = Math.PI * lg(this.holeLog, R_SWAP, eio(clamp((t - T.brk) / (T.swap - T.brk))) ** 1.15) ** 2;
  }

  /** The world swap, under the flash: the region goes, the planet comes in with the hole at the islet; the first bite is taken at r = 8 km and the surge carries on from there. */
  swap() {
    const { ctx, game } = this;
    this.stage = 'planet';
    this.debris.alpha.fill(0); this.debris.plife.fill(0); this.debris.cloud.alpha.needsUpdate = true; for (const c of this.debris.c) c.life = 0; // (the region's dust and spray stay behind)
    ctx.scene.remove(this.cracks.mesh); this.cracks.mesh.geometry.dispose(); this.cracks.mesh.material.dispose();
    this.yawSwap = this.cam.yaw;
    ctx.state.slowmo = 1; ctx.state.hitstop = 0;
    game.commit(ctx, { cinematic: true, r0: R_SWAP });
    this.W = game.world;
    ctx.scene.add(this.wound.sprite, this.decks.sprite);
    this.home = game.homeCam(ctx, P3.startR);
    this.viewDist = this.planetDist(this.revPitch);
    this.shake = 0.6;
    this.sfx.boom(1);
    this.surgeChew(R_SWAP);
  }

  /** Eat the land under a disc of radius r (m) at the hole, throwing the credit away (the first wound is real; the hole does not grow from it). */
  surgeChew(r) {
    const W = this.W, B = W.bite;
    B.chew(W.hdir, r, 30, 0); B.upload();
    B.tflag.fill(0); B.nTouched = 0; B.events.length = 0;
  }

  planetBeats(raw, t) {
    const { hole, state, sfx } = this;
    const us = clamp((t - T.swap) / (T.surgeEnd - T.swap)), rr = lg(R_SWAP, P3.startR, eo(us));
    if (us < 1 || !this.did.has('surgeDone')) { hole.area = Math.PI * rr * rr; if ((this.chewT -= raw) <= 0 || us >= 1) { this.chewT = 0.05; this.surgeChew(rr); } }
    if (us >= 1) this.did.add('surgeDone');
    this.once('ring', T.swap + 0.15, () => this.W.shock(this.W.hdir, 0.0012, 0.012, 2.4, 0.5)); // (the first ring across the planet's own land)
    this.once('wind', T.swap + 0.3, () => sfx.windRush(3.6));
    this.once('quiet', T.pull - 0.9, () => sfx.duck(0.15, 1.2));
    this.once('reveal', T.pull, () => {
      this.news = true;
      this.ctx.news.queue.length = 0; this.ctx.news.t = 0; // (the line that tells the world: nothing from the old country first)
      this.card('PHASE 3 — THE WORLD', 'The hole is global');
      this.ctx.news.say('Void entity visible from orbit — global emergency declared');
      sfx.unduck(1.2); sfx.chord();
      this.W.shock(this.W.hdir, 0.002, 0.3, 3.4, 1); // (a lilac ring spreading over the planet from the wound)
    });
    this.once('plunge', T.reveal, () => this.W.shock(this.W.hdir, 0.003, 0.35, 2.6, 0.8));
    this.once('control', T.control, () => { console.info(`[ascend] control: r=${(hole.r / 1000).toFixed(1)} km`); this.game.map?.show(true); if (this.after) this.ctx.news.say(this.after); state.playing = true; this.game.armRun(this.ctx, hole.r); this.showHud(); document.getElementById('hud').classList.add('ascin'); this.arrowT = 5; });
    if (this.arrowT > 0) { this.arrowT -= raw; for (const el of document.querySelectorAll('.edge-arrow')) el.classList.toggle('pulse', this.arrowT > 0); }
    this.bars.style.transition = 'height 1.4s ease-out';
    if (t > T.reveal + 0.8) for (const i of this.bars.children) i.style.height = '0';
    if (t >= T.end) this.finish();
  }

  /** After the planet has placed the world for this frame: the sky (blue -> indigo -> black, stars), the cloud decks, the wound's glow. */
  afterWorld(W, camera) {
    const g = W.globe, alt = camera.position.y + W.h0, t = this.t, c = this.cam;
    // sky: the planet's own sky objects only show above 120 km; the cinematic wants blue air below that, stars from 70 km, the thin shell at every height
    g.sky.visible = true; g.atmo.visible = true;
    const rv = sm(T.pull - 1.5, T.pull, t) * (1 - sm(T.reveal, T.control, t)); // (the reveal: the stars come up, the Moon steps into the open)
    g.u.uSkyK.value = sm(70e3, 400e3, alt) * (1 + 1.2 * rv);
    g.moonAt[0] = lerp(-0.93, -0.64, rv); g.moonAt[1] = lerp(0.8, 0.68, rv);
    const out = sm(190e3, 1500e3, alt); // (inside the 191 km shell the game's own thin value stays, or the ground is all haze; outside it the limb glow comes up for the reveal)
    g.u.uAtmo.value = lerp(g.u.uAtmo.value, 1, out); g.u.uAtmoH.value = lerp(g.u.uAtmoH.value, 1, out);
    const bg = this.ctx.scene.background;
    if (bg?.isColor) bg.copy(SKY[0]).lerp(SKY[1], sm(2e3, 40e3, alt)).lerp(SKY[2], sm(30e3, 110e3, alt)).multiplyScalar(1 - sm(12e3, 140e3, alt));
    this.deckFrame(W, camera, alt, t);
    // the wound: a pulsing lilac glow where the hole is, big enough to read from orbit, fading out as the camera drops back onto it
    const w = this.wound, size = Math.max(this.hole.r * 3.2, c.dist * 0.055) * (1 + 0.15 * Math.sin(t * 5.5)), show = sm(2e6, 8e6, c.dist) * 0.9 * (1 - sm(T.reveal + 0.2, T.end - 0.5, t));
    w.sprite.visible = show > 0.01;
    if (w.sprite.visible) {
      w.pos.array.set([0, W.groundY(0, 0) + 1, 0, 0, W.groundY(0, 0) + 1, 0]);
      w.size.array[0] = size; w.size.array[1] = size * 0.38;
      w.col.array.set([0.75 * show, 0.42 * show, 1.4 * show, 1.4 * show, 1.2 * show, 1.5 * show]);
      w.pos.needsUpdate = w.size.needsUpdate = w.col.needsUpdate = true;
    }
  }

  deckFrame(W, camera, alt, t) {
    const dk = this.decks, pos = dk.pos.array, size = dk.size.array, al = dk.alpha.array, col = dk.col.array, cp = camera.position;
    const show = 1 - sm(40e3, 90e3, alt);
    dk.sprite.visible = show > 0.01;
    if (!dk.sprite.visible) return;
    const ALT = [3600, 11000], RAD = [30000, 80000], SZ = [4200, 11000];
    for (let i = 0; i < this.deckSeed.length; i++) {
      const s = this.deckSeed[i], dec = s.deck, a = s.a + t * 0.004 * (dec + 1), d = s.d * RAD[dec], x = Math.cos(a) * d, z = Math.sin(a) * d;
      const y = ALT[dec] + s.dy * 500 - (x * x + z * z) / (2 * R) - W.h0, dd = Math.hypot(x - cp.x, y - cp.y, z - cp.z), sz = SZ[dec] * s.s;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      size[i] = sz;
      al[i] = 0.62 * sm(sz * 0.25, sz * 1.1, dd) * (1 - sm(sz * 14, sz * 30, dd)) * show; // (soft in and out: not on the lens, no pop at range)
      col[i * 3] = 0.97; col[i * 3 + 1] = 0.98; col[i * 3 + 2] = 1.0;
    }
    dk.pos.needsUpdate = dk.size.needsUpdate = dk.alpha.needsUpdate = dk.col.needsUpdate = true;
  }

  finish() {
    if (this.over) return;
    this.over = true;
    const { state, ctx } = this;
    ctx.camera.fov = ctx.baseFov; ctx.camera.updateProjectionMatrix();
    state.asc = null; state.slowmo = 1; this.lite(false);
    ctx.scene.remove(this.wound.sprite, this.decks.sprite);
    this.wound.sprite.material.dispose(); this.decks.sprite.material.dispose();
    this.W.globe.u.uSkyK.value = 1; this.W.globe.moonAt[0] = -0.93; this.W.globe.moonAt[1] = 0.8;
    ctx.scene.background = new THREE.Color(0x000000);
    this.bars.remove(); this.flashEl.remove(); this.style.remove();
    document.getElementById('hud')?.classList.remove('ascin');
    for (const el of document.querySelectorAll('.edge-arrow.pulse')) el.classList.remove('pulse');
    this.done?.();
  }
}
