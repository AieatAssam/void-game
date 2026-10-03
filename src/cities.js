// Cities (docs/PHASE3.md 12.12): the baked population density (night.R) has no discrete cities, so the biggest maxima of it ARE the cities: found once on the bake, named, given a
// population (the same people-per-light as the counter), and then watched: a beacon sprite and a name label for the near big ones, a pip on the minimap that goes dark when the land under
// it is eaten, "Population -X M" chips and news when it falls. The shader draws the footprint itself (planetglobe.js "cities"), from the same density.
import * as THREE from 'three/webgpu';
import { R, faceDir, decodeHeight, texelArea } from './planetgen.js';
import { Pool, C, popStr } from './threat/kit.js';

const A = ['Ard', 'Bel', 'Cor', 'Dun', 'Eld', 'Fen', 'Gal', 'Har', 'Ist', 'Jor', 'Kes', 'Lor', 'Mar', 'Nev', 'Ost', 'Pel', 'Ros', 'Sal', 'Tor', 'Ver', 'Wyn', 'Yar', 'Zel', 'Bran', 'Cas', 'Dov'];
const B = ['polis', 'ora', 'ham', 'port', 'mere', 'ton', 'grad', 'ville', 'haven', 'ria', 'ash', 'more', 'stad', 'bury'];
const CELL = 16, MAXC = 64, SEP = 0.075;
const BEACON = C(0xffd9a0, 1.5), BEACON_S = C(0xffd9a0, 0.9); // (hoisted: one colour each, not 76 a frame)
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

/** The registry: [{ name, dir (THREE.Vector3), pop (people), big }] sorted by population. */
function findCities(bake, popK, seed = 7) {
  const { surf, night, N } = bake, fl = N * N, nc = N / CELL, cand = [];
  let s = (seed * 2654435761) >>> 0; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let f = 0; f < 6; f++) for (let cj = 0; cj < nc; cj++) for (let ci = 0; ci < nc; ci++) {
    let sum = 0, best = 0, bi = 0, bj = 0, land = 0;
    for (let j = cj * CELL; j < (cj + 1) * CELL; j++) for (let i = ci * CELL; i < (ci + 1) * CELL; i++) {
      const k = f * fl + j * N + i, h = decodeHeight(surf[k * 4]);
      if (h <= 0) continue; land++; const r = night[k * 2]; sum += r * texelArea(N, i, j); if (r > best) { best = r; bi = i; bj = j; }
    }
    if (land > CELL * CELL * 0.3 && best > 120) cand.push({ f, i: bi, j: bj, sum, best });
  }
  cand.sort((a, b) => b.sum - a.sum);
  const out = [];
  for (const c of cand) {
    const d = faceDir(c.f, (c.i / (N - 1)) * 2 - 1, (c.j / (N - 1)) * 2 - 1, { x: 0, y: 0, z: 0 }), dir = new THREE.Vector3(d.x, d.y, d.z).normalize();
    if (out.some((o) => o.dir.angleTo(dir) < SEP)) continue;
    out.push({ name: A[Math.floor(rnd() * A.length)] + B[Math.floor(rnd() * B.length)], dir, pop: c.sum * popK / 255 * 0.26, alive: 1, big: false, eaten: false });
    if (out.length >= MAXC) break;
  }
  out.forEach((c, i) => { c.big = i < 10; });
  return out;
}

/**
 * The start's towns (P1-3): the registry above keeps 64 maxima 0.075 rad apart, which on some seeds leaves nothing within 1200 km of the start. A second, local pass: 4-texel cells
 * within 0.17 rad (25 r0 + a margin) of `near`, up to 12 towns >= 0.012 rad apart, with the same people-per-light. `town` ones are labelled too (cities.js update), but only close.
 */
export function findTowns(bake, popK, seed, near, have, max = 12) {
  const { surf, night, N } = bake, fl = N * N, nc = N / 4, cand = [], cs = Math.cos(0.17);
  let s = (seed * 40503 + 17) >>> 0; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let f = 0; f < 6; f++) for (let cj = 0; cj < nc; cj++) for (let ci = 0; ci < nc; ci++) {
    const d0 = faceDir(f, ((ci * 4 + 2) / (N - 1)) * 2 - 1, ((cj * 4 + 2) / (N - 1)) * 2 - 1, { x: 0, y: 0, z: 0 });
    if ((d0.x * near.x + d0.y * near.y + d0.z * near.z) / Math.hypot(d0.x, d0.y, d0.z) < cs) continue;
    let sum = 0, best = 0, bi = 0, bj = 0, land = 0;
    for (let j = cj * 4; j < cj * 4 + 4; j++) for (let i = ci * 4; i < ci * 4 + 4; i++) {
      const k = f * fl + j * N + i, h = decodeHeight(surf[k * 4]);
      if (h <= 0) continue; land++; const r = night[k * 2]; sum += r * texelArea(N, i, j); if (r > best) { best = r; bi = i; bj = j; }
    }
    if (land >= 12 && best > 70) cand.push({ f, i: bi, j: bj, sum, best });
  }
  cand.sort((a, b) => b.sum - a.sum);
  const out = [];
  for (const c of cand) {
    const d = faceDir(c.f, (c.i / (N - 1)) * 2 - 1, (c.j / (N - 1)) * 2 - 1, { x: 0, y: 0, z: 0 }), dir = new THREE.Vector3(d.x, d.y, d.z).normalize();
    if (out.some((o) => o.dir.angleTo(dir) < 0.012) || have.some((o) => o.dir.angleTo(dir) < 0.012)) continue;
    out.push({ name: A[Math.floor(rnd() * A.length)] + B[Math.floor(rnd() * B.length)], dir, pop: Math.max(2e4, c.sum * popK / 255 * 0.26), alive: 1, big: false, town: true, eaten: false });
    if (out.length >= max) break;
  }
  return out;
}

export const CITY_CSS = `.cname{position:fixed;left:0;top:0;z-index:4;pointer-events:none;font:800 11px system-ui,sans-serif;letter-spacing:.06em;color:#fff3dd;text-shadow:0 1px 0 #120a22,0 0 8px #120a22;white-space:nowrap;opacity:0;transition:opacity .3s}
.cname small{opacity:.75;margin-left:6px;font-weight:700}`;

export class Cities {
  constructor(game, ctx) {
    this.game = game; this.ctx = ctx; this.W = game.world; this.list = findCities(this.W.bake, this.W.bite.popK, this.W.seed);
    this.list.push(...findTowns(this.W.bake, this.W.bite.popK, this.W.seed, this.W.P.startDir, this.list));
    this.pool = new Pool(256, true); this.pool.sprite.frustumCulled = false; ctx.scene.add(this.pool.sprite); this.pool.sprite.visible = !!game.entered;
    if (!document.getElementById('city-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'city-css', textContent: CITY_CSS }));
    this.labels = Array.from({ length: 5 }, () => { const e = Object.assign(document.createElement('div'), { className: 'cname' }); document.body.append(e); return e; });
    this.t = 0; this.k = 0; this.near = []; this.mk = [];
  }
  show() { this.pool.sprite.visible = true; }
  attach(map) { if (!map) return; for (const c of this.list) { c.mk = map.addMarker({ kind: 'city', dir: c.dir, big: c.big, label: c.big ? c.name : '', color: '#ffd28a', c }); } }
  dispose() { this.ctx.scene.remove(this.pool.sprite); for (const e of this.labels) e.remove(); for (const c of this.list) c.mk?.remove(); }
  reset() { for (const c of this.list) { c.eaten = false; c.alive = 1; } }

  /** Per frame: beacons + labels for the near big ones; a slice of the registry is checked for eaten land. */
  update(dt, ctx) {
    const { W } = this, hole = ctx.hole; this.t += dt;
    // eaten-land watch: 6 cities a frame (the registry is 64)
    for (let n = 0; n < 6; n++) {
      const c = this.list[this.k = (this.k + 1) % this.list.length];
      c.alive = W.bite.remAt(c.dir);
      if (!c.eaten && c.alive < 0.35) this.eat(c, ctx);
    }
    // beacons: one glint per near / big city, sized to read at any distance; labels for the nearest few in view
    const cd = this.game.camDist || R * 0.05, cam = ctx.camera;
    let nl = 0; const lim = Math.max(3 * hole.r, 400e3);
    const pool = this.pool; pool.step(dt);
    for (const c of this.list) {
      if (c.eaten) continue;
      const d = W.distTo(c.dir); if (d > 90 * hole.r && !c.big) continue;
      _v.copy(c.dir).multiplyScalar(R + Math.max(0, W.P.elevation(c.dir, 3)) * W.E);
      const pulse = 0.75 + 0.25 * Math.sin(this.t * 2.2 + c.pop * 1e-7), sz = cd * (c.big ? 0.02 : 0.011) * pulse * Math.min(1, d / (6 * hole.r));
      if (d < 1.2 * hole.r) continue; // (the hole is on it: the wound speaks for itself)
      pool.spawn(_v, null, sz, sz, 0.03, c.big ? BEACON : BEACON_S, c.big ? 0.7 : 0.45, 0);
    }
    for (const e of this.labels) e.style.opacity = '0';
    const cand = this.near; let nc = 0;
    for (const c of this.list) if (!c.eaten && (c.big || c.pop > 3e7 || c.town)) { const d = W.distTo(c.dir); if (d < (c.town ? 10 * hole.r : Math.max(14 * hole.r, 1200e3)) && d > 1.5 * hole.r) { const q = cand[nc++] ??= { d: 0, c: null }; q.d = d; q.c = c; } }
    for (let i = 0, nl2 = Math.min(nc, this.labels.length); i < nl2; i++) { // (the nearest few: selection over the preallocated {d, c} records, no sort, no garbage)
      let m = i; for (let j = i + 1; j < nc; j++) if (cand[j].d < cand[m].d) m = j;
      const t = cand[i]; cand[i] = cand[m]; cand[m] = t;
      const c = cand[i].c, e = this.labels[i];
      _v.copy(c.dir).multiplyScalar(R).applyQuaternion(_q.copy(W.holeQ).invert()).add(W.globe.group.position);
      _v.project(cam); if (_v.z > 1 || Math.abs(_v.x) > 0.95 || Math.abs(_v.y) > 0.92) continue;
      if (e.dataset.n !== c.name) { e.dataset.n = c.name; e.innerHTML = `${c.name}<small>${popStr(c.pop)}</small>`; }
      e.style.transform = `translate(${((_v.x * 0.5 + 0.5) * innerWidth) | 0}px, ${((0.5 - _v.y * 0.5) * innerHeight - 26) | 0}px)`; e.style.opacity = '1';
    }
  }
  /** A "Population -X M" ticker pop under the HUD, and a bump of the people counter. */
  chip(txt, name) {
    const e = Object.assign(document.createElement('div'), { className: 'cname' }); e.style.cssText = 'font:900 24px system-ui,sans-serif;color:#ffd28a;text-align:center;opacity:1;transition:none'; e.innerHTML = `${txt}<small style="display:block;font-size:11px">${name} GOES DARK</small>`;
    document.body.append(e); const x = innerWidth / 2 - 90, y = 92;
    e.animate([{ transform: `translate(${x}px,${y + 8}px) scale(1.6)`, opacity: 0 }, { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 1, offset: 0.15 }, { transform: `translate(${x}px,${y - 26}px) scale(1)`, opacity: 1, offset: 0.75 }, { transform: `translate(${x}px,${y - 40}px)`, opacity: 0 }], { duration: 2200, easing: 'ease-out' }).onfinish = () => e.remove();
    const el = document.getElementById('eaten'); if (el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  }
  /** Flush the beacon pool into render space (after the world is placed). */
  post(qiw, off) { this.pool.flush(qiw, off); }

  eat(c, ctx) {
    c.eaten = true; c.mk && (c.mk.dead = true);
    const g = this.game, th = g.threat, r = ctx.hole.r, W = this.W;
    th?.glow.spawn(_v.copy(c.dir).multiplyScalar(R + Math.max(0, W.P.elevation(c.dir, 3)) * W.E), null, 1.2 * r, 4 * r, 0.9, C(0xffb060, 2.6), 1.2, 0);
    ctx.news.say(`${c.name} goes dark: ${popStr(c.pop)} people`);
    g.popChip?.(`Population −${popStr(c.pop)}`, c.name);
  }
}
