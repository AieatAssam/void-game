// Phase 3 minimap (docs/PHASE3.md §6.3): a small GPU globe + a 2D overlay.
//  * The globe is a 32²-per-face cube-sphere in its OWN three Scene, drawn after post.render() into the overlay canvas's screen rect
//    (autoClear off, no depth), by an orthographic camera looking straight down the hole's up axis: track-up (screen-up = the hole's
//    screen-up), the hole at the centre. Its material is a cheap derived one (no detail octaves, no clouds, no hole caps) that reads the
//    same bake (`surf`) and the same bite-map texture as the real planet, so eaten land shows up as the wound.
//  * The view radius zooms with the hole (about 40 r, clamped to 80 km .. the whole hemisphere), so a 1.4 km hole reads its goals.
//  * The overlay (a 2D canvas stacked on it): you, the goal ring (pulsing) + edge chevrons, markers, the N tick, a land-eaten arc gauge.
//
// MARKER API (threat.js / rivals use it; the handle is live: mutate its fields, the map reads them every frame; nothing is copied)
//   const m = planetMap.addMarker({ kind, dir, ... })   -> m (also m.remove())
//   planetMap.removeMarker(m)     planetMap.clearMarkers(kind?)
//   dir / from : { x, y, z } unit vector in PLANET space (THREE.Vector3 is fine)
//   kind 'nuke'   an ICBM in flight: arc from `from` to `dir` (the impact), `dur` s total, `eta` s left (progress = 1 - eta / dur), the dot rides the arc
//   kind 'site'   a launch site / silo field / platform: a triangle at `dir`
//   kind 'sat'    a satellite at `dir`; `track` = the unit axis of its orbit plane -> the orbit great circle (back half dashed)
//   kind 'rival'  another hole at `dir`, radius `r` (m); `big: true` draws the red ring
//   kind 'ring'   a danger zone: a circle of radius `r` (m) at `dir`; `eta` shows a countdown
//   kind 'aegis'  a hexagon at `dir`, radius `r` (m)
//   common: label (string), color (css), eta (s, drawn as "4.2s"), ttl (s, removed after), pulse (bool)
import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, float, uniform, normalize, dot, length, mix, pow, max, min, If, Discard, positionGeometry, positionView, normalView, sin, abs, clamp } from 'three/tsl';
import { cubeSphere, R, faceST, sampleFace, sstep, srgb, heightOf } from './planetglobe.js';

const PI2 = Math.PI * 2;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _vp = new THREE.Vector4();
const KM = (m) => (m >= 1e6 ? `${(m / 1000).toFixed(0)} km` : m >= 1e5 ? `${(m / 1000).toFixed(0)} km` : `${(m / 1000).toFixed(m < 1e4 ? 1 : 0)} km`);

/** The minimap globe's own material: the bake's land / sea palette, hillshade, the sun's terminator, the bite-map wound. */
function mapMaterial(globe, u) {
  const { surfTex: surf, biteTex: bite, N, B } = globe;
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, depthTest: false, depthWrite: false });
  m.colorNode = Fn(() => {
    const dir = normalize(positionGeometry).toVar();
    If(length(positionView.xy).greaterThan(u.uHalf), () => { Discard(); });
    // 3x3 tent-filtered taps (the bake's 19 km texels are a few px apart at full zoom-out, so plain bilinear would shimmer as it turns)
    const W3 = [1, 2, 1];
    let h = float(0), T = float(0), M = float(0), rm = float(0), hE = float(0), hW = float(0), hN = float(0), hS = float(0);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const d = normalize(dir.add(u.uAx.mul(u.uStep.mul(i))).add(u.uAz.mul(u.uStep.mul(j))));
      const S = sampleFace(surf, N, d), w = (W3[i + 1] * W3[j + 1]) / 16;
      const e = heightOf(S.r);
      h = h.add(e.mul(w)); T = T.add(S.g.mul(w)); M = M.add(S.b.mul(w)); rm = rm.add(sampleFace(bite, B, d).r.mul(w));
      if (j === 0 && i === 1) hE = e; if (j === 0 && i === -1) hW = e; if (j === 1 && i === 0) hS = e; if (j === -1 && i === 0) hN = e;
    }
    const nl = dot(dir, u.uSun);
    const lit = mix(0.5, 1.0, sstep(-0.12, 0.38, nl)); // (the night side stays legible: it is a map)
    // ---- land (the main globe's biome ramp, simplified) and sea
    const cold = sstep(0.42, 0.2, T.sub(max(h.sub(400), 0).div(9000))), hot = sstep(0.52, 0.74, T);
    const mild = mix(mix(srgb(0.66, 0.57, 0.38), srgb(0.5, 0.52, 0.28), sstep(0.06, 0.22, M)), mix(srgb(0.38, 0.5, 0.2), srgb(0.17, 0.33, 0.15), sstep(0.4, 0.68, M)), sstep(0.22, 0.42, M));
    const warm = mix(mix(srgb(0.78, 0.63, 0.42), srgb(0.66, 0.57, 0.31), sstep(0.18, 0.42, M)), mix(srgb(0.36, 0.48, 0.17), srgb(0.09, 0.28, 0.11), sstep(0.6, 0.85, M)), sstep(0.42, 0.62, M));
    const cool = mix(srgb(0.5, 0.5, 0.43), srgb(0.15, 0.26, 0.18), sstep(0.35, 0.55, M));
    let land = mix(mix(mild, warm, hot), cool, cold).toVar();
    land.assign(mix(land, srgb(0.5, 0.46, 0.4), sstep(1400, 3200, h)));
    land.assign(mix(land, srgb(0.93, 0.95, 0.98), max(sstep(3600, 5600, h), sstep(0.22, 0.1, T))));
    const dep = max(h.negate(), 0);
    let sea = mix(srgb(0.12, 0.46, 0.5), srgb(0.04, 0.24, 0.42), sstep(8, 260, dep)).toVar();
    sea.assign(mix(sea, srgb(0.015, 0.1, 0.26), sstep(300, 3800, dep)));
    sea.assign(mix(sea, srgb(0.82, 0.9, 0.96), sstep(0.16, 0.07, T).mul(sstep(-20, 5, h.negate()))));
    const coast = sstep(-14, 14, h);
    // hillshade from the neighbouring taps (light from the upper left of the screen)
    const sp = u.uStep.mul(R).mul(2);
    const slope = hE.sub(hW).add(hS.sub(hN)).div(sp);
    const shade = float(1).add(clamp(slope.mul(3.2), -0.45, 0.45).mul(coast));
    let col = mix(sea, land.mul(shade), coast).toVar();
    // the shore: a thin pale edge so coasts read at any zoom
    col.assign(mix(col, srgb(0.78, 0.9, 0.86), sstep(10, 0, abs(h)).mul(0.28)));
    col.assign(col.mul(lit));
    // ---- the wound: the bite map's remaining land, boosted so a few bites are visible at this scale
    const ee = float(1).sub(pow(rm, 5)).mul(coast);
    col.assign(mix(col, srgb(0.1, 0.04, 0.16), sstep(0.02, 0.5, ee).mul(0.92)));
    col.addAssign(vec3(1.0, 0.42, 0.1).mul(ee.mul(float(1).sub(ee)).mul(1.6)));
    // ---- the limb: a thin blue atmosphere when the whole hemisphere is in view
    const rim = pow(float(1).sub(normalView.z), 3.2);
    col.addAssign(vec3(0.2, 0.46, 1.0).mul(rim).mul(0.9).mul(lit.mul(0.7).add(0.3)));
    return vec4(col.max(0).pow(1 / 2.2), 1); // (drawn with no output transform: see PlanetMap.render)
  })();
  return m;
}

/** The dark disc behind the globe (and the circle clip when the globe fills the viewport). */
function backMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, depthTest: false, depthWrite: false });
  m.vertexNode = vec4(positionGeometry.xy, 0.5, 1);
  m.colorNode = Fn(() => {
    const r = length(positionGeometry.xy);
    If(r.greaterThan(1.0), () => { Discard(); });
    return vec4(mix(srgb(0.05, 0.06, 0.14), srgb(0.01, 0.015, 0.045), r).pow(1 / 2.2), 1);
  })();
  return m;
}

export class PlanetMap {
  /** renderer: the game's WebGPU/WebGL renderer; globe: the PlanetGlobe (textures, uSun). */
  constructor(renderer, globe) {
    this.renderer = renderer; this.globe = globe;
    this.size = 0; this.markers = []; this.t = 0; this.drawT = 0; this.on = false; this.halfR = 0.03;
    this.el = Object.assign(document.createElement('canvas'), { id: 'pmap', hidden: true });
    document.body.append(this.el);
    this.g2 = this.el.getContext('2d');
    this.u = { uSun: uniform(new THREE.Vector3(0, 1, 0)), uAx: uniform(new THREE.Vector3(1, 0, 0)), uAz: uniform(new THREE.Vector3(0, 0, 1)), uStep: uniform(0.001), uHalf: uniform(R) };
    this.scene = new THREE.Scene();
    this.group = new THREE.Group(); // planet space; rotated by the hole's inverse frame so the camera can stay fixed
    this.mat = mapMaterial(globe, this.u);
    this.globeMesh = new THREE.Mesh(cubeSphere(32, null, 0), this.mat);
    this.globeMesh.scale.setScalar(R); this.globeMesh.frustumCulled = false;
    this.group.add(this.globeMesh);
    this.back = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backMaterial());
    this.back.renderOrder = -1; this.back.frustumCulled = false;
    this.scene.add(this.back, this.group);
    this.cam = new THREE.OrthographicCamera(-R, R, R, -R, R, 6 * R);
    this.cam.position.set(0, 3 * R, 0); this.cam.up.set(0, 0, -1); this.cam.lookAt(0, 0, 0); this.cam.updateMatrixWorld();
    this.qi = new THREE.Quaternion();
  }

  /** The globe's material compiles now (under a loading line / a cinematic), not on the first frame it shows. */
  async precompile() {
    const r = this.renderer, tm = r.toneMapping, cs = r.outputColorSpace;
    r.toneMapping = THREE.NoToneMapping; r.outputColorSpace = THREE.LinearSRGBColorSpace; // (the state render() draws in)
    try { await r.compileAsync(this.scene, this.cam); } catch (e) { console.warn('planet map compile', e); } finally { r.toneMapping = tm; r.outputColorSpace = cs; }
  }

  show(on = true) { this.on = on; this.el.hidden = !on; }
  dispose() {
    this.show(false); this.el.remove(); this.markers.length = 0;
    this.globeMesh.geometry.dispose(); this.mat.dispose(); this.back.geometry.dispose(); this.back.material.dispose();
  }

  // ---------------------------------------------------------------- markers
  addMarker(m) {
    m.remove = () => this.removeMarker(m);
    m.age = 0;
    this.markers.push(m);
    return m;
  }
  removeMarker(m) { const i = this.markers.indexOf(m); if (i >= 0) this.markers.splice(i, 1); }
  clearMarkers(kind) { this.markers = kind ? this.markers.filter((m) => m.kind !== kind) : []; }

  // ---------------------------------------------------------------- projection (shared by the GPU view and the overlay)
  /** The view radius in metres for a hole of radius r: ~40 r from 80 km (T1's goals sit 30-55 km away), up to the whole hemisphere (from r ~ 170 km). */
  extent(r) { return Math.min(1.07 * R, Math.max(80000, 40 * r)); }
  /** planet-space dir (+ optional lift: height above the surface in planet radii) -> [px, py, front, off-disc]; px,py in overlay pixels */
  project(d, lift = 0, out = this._p ??= [0, 0, 0, 0]) {
    _v.set(d.x, d.y, d.z).applyQuaternion(this.qi);
    const k = this.kPx * (1 + lift);
    out[0] = this.cx + _v.x * k; out[1] = this.cy + _v.z * k; out[2] = _v.y > 0 ? 1 : 0;
    out[3] = Math.hypot(out[0] - this.cx, out[1] - this.cy) > this.rad ? 1 : 0;
    return out;
  }

  // ---------------------------------------------------------------- per frame
  /** Place the GPU globe (call every frame before render). */
  place(world, hole) {
    const el = this.el;
    this.qi.copy(world.holeQ).invert();
    this.group.quaternion.copy(this.qi);
    this.hq = world.holeQ;
    const ext = this.extent(hole.r);
    this.ext = ext;
    this.halfR = ext / R; // view half-extent in planet radii
    const c = this.cam;
    if (c.top !== ext) { c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.updateProjectionMatrix(); }
    const rc = this.rect = el.getBoundingClientRect();
    const dpr = this.renderer.getPixelRatio(), pxDev = (2 * ext) / Math.max(1, rc.width * dpr);
    this.u.uHalf.value = ext;
    this.u.uStep.value = (pxDev * 0.75) / R; // tap spacing in radians: ~0.75 device px
    this.u.uAx.value.set(1, 0, 0).applyQuaternion(world.holeQ); // (screen-right and screen-down in planet space)
    this.u.uAz.value.set(0, 0, 1).applyQuaternion(world.holeQ);
    this.u.uSun.value.copy(this.globe.u.uSun.value);
  }

  /** Draw the GPU globe into the overlay's screen rect. Call right after post.render(). */
  render() {
    const rc = this.rect, r = this.renderer;
    if (!this.on || !rc || rc.width < 4) return;
    r.getViewport(_vp);
    // (with a tone map or an sRGB output three renders into an intermediate target and then COPIES the whole viewport rect over the
    // canvas, wiping the game under the discarded corners: so draw with no output transform and encode in the shader)
    const ac = r.autoClear, tm = r.toneMapping, cs = r.outputColorSpace;
    r.autoClear = false; r.toneMapping = THREE.NoToneMapping; r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.setViewport(rc.left, rc.top, rc.width, rc.height);
    r.render(this.scene, this.cam);
    r.setViewport(_vp);
    r.autoClear = ac; r.toneMapping = tm; r.outputColorSpace = cs;
  }

  /**
   * The 2D layer. things = { hole, world, food, goals, land (0..1 eaten), tier }. ~24 Hz: the globe moves smoothly on its own.
   * (the overlay canvas is resized from CSS: its device size follows the layout, so phones get the small map for free)
   */
  update(dt, things) {
    if (!this.on) return;
    this.t += dt;
    for (const m of this.markers) { m.age += dt; if (m.ttl != null && m.age > m.ttl) m.dead = true; }
    if (this.markers.some((m) => m.dead)) this.markers = this.markers.filter((m) => !m.dead);
    if ((this.drawT -= dt) > 0) return;
    this.drawT = 1 / 24;
    const el = this.el, dpr = Math.min(2, devicePixelRatio || 1), cssW = el.clientWidth || 200;
    if (el.width !== Math.round(cssW * dpr)) el.width = el.height = Math.round(cssW * dpr);
    const S = el.width, g = this.g2;
    this.cx = this.cy = S / 2; this.rad = S / 2 - 7 * dpr; this.kPx = this.rad / this.halfR; this.dpr = dpr;
    g.clearRect(0, 0, S, S);
    const { hole, world, tier } = things, cx = this.cx, cy = this.cy, rad = this.rad, p = this._p ??= [0, 0, 0, 0];
    const D = dpr, pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    const chev = (x, y, color, size = 5) => { // an edge chevron pointing out toward (x, y) from the centre
      const a = Math.atan2(y - cy, x - cx), px = cx + Math.cos(a) * (rad - 1 * D), py = cy + Math.sin(a) * (rad - 1 * D);
      g.save(); g.translate(px, py); g.rotate(a); g.beginPath(); g.moveTo(size * D * 0.8, 0); g.lineTo(-size * D * 0.6, -size * D * 0.75); g.lineTo(-size * D * 0.2, 0); g.lineTo(-size * D * 0.6, size * D * 0.75); g.closePath();
      g.fillStyle = color; g.strokeStyle = '#120a22'; g.lineWidth = 1.4 * D; g.stroke(); g.fill(); g.restore();
    };
    // ---- the tier's goal towns: a warm dot while standing, a dark ring once gone; the next one pulses
    const food = things.food, goals = food?.goalsByTier?.[tier] ?? [];
    const next = food?.nextGoal?.(hole)?.e;
    for (const e of goals) {
      this.project(e.dir, 0, p);
      if (!e.alive && !e.falling) { if (p[2] && !p[3]) { g.beginPath(); g.arc(p[0], p[1], 2.6 * D, 0, PI2); g.strokeStyle = '#7d63b8'; g.lineWidth = 1.2 * D; g.stroke(); } continue; }
      const rr = Math.max(3.2 * D, (e.tier / R) * this.kPx);
      if (p[2] && !p[3]) {
        g.beginPath(); g.arc(p[0], p[1], rr, 0, PI2);
        g.fillStyle = e.label === 'Capital' ? '#ff8a3d' : '#f7d774'; g.fill(); g.lineWidth = 1.2 * D; g.strokeStyle = '#2a1650'; g.stroke();
        if (e === next) { g.beginPath(); g.arc(p[0], p[1], rr + (4 + 4 * pulse) * D, 0, PI2); g.lineWidth = (1.6 + pulse) * D; g.strokeStyle = '#ffffff'; g.stroke(); }
      } else if (e === next) chev(p[0], p[1], '#ffe9a0', 6);
    }
    // ---- markers (threat.js etc.)
    for (const m of this.markers) this.drawMarker(g, m, p, D, pulse, chev);
    // ---- you: the hole at the centre, its radius to scale (never under 4.5 px)
    const hr = Math.max(4.5 * D, (hole.r / R) * this.kPx);
    g.beginPath(); g.arc(cx, cy, hr, 0, PI2); g.fillStyle = '#0e0720'; g.fill();
    g.lineWidth = 2 * D; g.strokeStyle = '#c9a8ff'; g.stroke();
    g.beginPath(); g.arc(cx, cy, hr + 3 * D + pulse * 1.5 * D, 0, PI2); g.lineWidth = 1 * D; g.strokeStyle = '#b58cff66'; g.stroke();
    // ---- the rim: dark ring + light ring, the land-eaten gauge, the N tick
    g.lineWidth = 6 * D; g.strokeStyle = '#120a22'; g.beginPath(); g.arc(cx, cy, rad + 2.2 * D, 0, PI2); g.stroke();
    g.lineWidth = 2.2 * D; g.strokeStyle = '#fff8eecc'; g.beginPath(); g.arc(cx, cy, rad - 0.6 * D, 0, PI2); g.stroke();
    const eaten = things.land || 0;
    g.lineWidth = 3.4 * D; g.lineCap = 'round';
    g.strokeStyle = '#ffffff22'; g.beginPath(); g.arc(cx, cy, rad + 2.2 * D, 0, PI2); g.stroke();
    if (eaten > 0) {
      const a1 = -Math.PI / 2 + Math.max(0.045, eaten * PI2), gr = g.createLinearGradient(0, S, S, 0);
      gr.addColorStop(0, '#ff8a3d'); gr.addColorStop(1, '#c9a8ff');
      g.strokeStyle = gr; g.beginPath(); g.arc(cx, cy, rad + 2.2 * D, -Math.PI / 2, a1); g.stroke();
    }
    g.lineCap = 'butt';
    _v.set(0, 1, 0).applyQuaternion(this.qi); // (planet north, in the hole's frame: x right, z down the screen)
    const nl = Math.hypot(_v.x, _v.z);
    if (nl > 0.06) {
      const a = Math.atan2(_v.z, _v.x), nx = cx + Math.cos(a) * (rad + 2.2 * D), ny = cy + Math.sin(a) * (rad + 2.2 * D);
      g.save(); g.translate(nx, ny); g.rotate(a + Math.PI / 2);
      g.fillStyle = '#fff8ee'; g.strokeStyle = '#120a22'; g.lineWidth = 1.6 * D; g.beginPath(); g.moveTo(0, -5.5 * D); g.lineTo(4.4 * D, 3 * D); g.lineTo(-4.4 * D, 3 * D); g.closePath(); g.stroke(); g.fill();
      g.restore();
      g.font = `700 ${9 * D}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff8ee';
      g.strokeStyle = '#120a22'; g.lineWidth = 2.4 * D; const lx = cx + Math.cos(a) * (rad - 10 * D), ly = cy + Math.sin(a) * (rad - 10 * D);
      g.strokeText('N', lx, ly); g.fillText('N', lx, ly);
    }
    // ---- numbers: the land-eaten %, the view radius
    const pct = eaten * 100, txt = pct >= 10 ? `${pct.toFixed(1)}%` : pct >= 0.1 ? `${pct.toFixed(2)}%` : `${pct.toFixed(3)}%`;
    g.font = `800 ${11 * D}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(txt).width + 12 * D, ty = S - 9 * D;
    g.fillStyle = '#120a22d9'; g.beginPath(); g.roundRect(cx - tw / 2, ty - 8 * D, tw, 16 * D, 8 * D); g.fill();
    g.fillStyle = eaten > 0 ? '#ffb27a' : '#c9b8ee'; g.fillText(txt, cx, ty);
    g.font = `600 ${8.5 * D}px system-ui, sans-serif`; g.fillStyle = '#fff8eeaa'; g.strokeStyle = '#120a22'; g.lineWidth = 2.2 * D;
    const sc = `${KM(this.ext)}`, sx = cx + rad * 0.62, sy = cy - rad * 0.7; g.textAlign = 'center'; g.strokeText(sc, sx, sy); g.fillText(sc, sx, sy);
  }

  drawMarker(g, m, p, D, pulse, chev) {
    const col = m.color || (m.kind === 'rival' ? (m.big ? '#ff5d5d' : '#c9a8ff') : m.kind === 'sat' ? '#9fe8ff' : m.kind === 'site' ? '#ff9f5d' : '#ff5d5d');
    const lab = (x, y, txt) => { g.font = `700 ${8.5 * D}px system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 2.4 * D; g.strokeStyle = '#120a22'; g.fillStyle = '#fff8ee'; g.strokeText(txt, x, y); g.fillText(txt, x, y); };
    const eta = m.eta != null && m.eta > 0 ? `${m.eta.toFixed(m.eta < 10 ? 1 : 0)}s` : '';
    const arcPts = (a, b, n, lift) => { // great-circle samples from a to b, raised like a ballistic arc
      const om = Math.acos(Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z))), so = Math.sin(om) || 1, out = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, ka = Math.sin((1 - t) * om) / so, kb = Math.sin(t * om) / so;
        _a.set(a.x * ka + b.x * kb, a.y * ka + b.y * kb, a.z * ka + b.z * kb);
        out.push([_a.x, _a.y, _a.z, lift * Math.sin(Math.PI * t) * Math.min(1, om * 1.5)]);
      }
      return out;
    };
    const stroke = (pts, dashBack) => { // polyline in planet space; far-side segments dashed and dim
      let prev = null;
      for (const q of pts) {
        this.project({ x: q[0], y: q[1], z: q[2] }, q[3], p);
        if (prev) {
          g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(p[0], p[1]);
          g.setLineDash(prev[2] && p[2] ? [] : dashBack ? [2 * D, 3 * D] : []); g.globalAlpha = prev[2] && p[2] ? 1 : 0.4; g.stroke();
        }
        prev = [p[0], p[1], p[2]];
      }
      g.setLineDash([]); g.globalAlpha = 1;
    };
    if (m.kind === 'nuke' && m.from) {
      const pts = arcPts(m.from, m.dir, 24, 0.18), prog = m.dur ? 1 - Math.max(0, m.eta ?? 0) / m.dur : 1;
      g.lineWidth = 1.6 * D; g.strokeStyle = col + '99'; stroke(pts.slice(Math.floor(prog * 24)), true);
      const cur = pts[Math.min(24, Math.round(prog * 24))];
      this.project({ x: cur[0], y: cur[1], z: cur[2] }, cur[3], p);
      if (p[2]) { g.beginPath(); g.arc(p[0], p[1], 2.6 * D, 0, PI2); g.fillStyle = '#fff'; g.fill(); }
      const ip = this.project(m.dir, 0, [0, 0, 0, 0]);
      if (ip[2]) { // the impact ring + ETA
        g.beginPath(); g.arc(ip[0], ip[1], Math.max(4 * D, ((m.r || 8000) / R) * this.kPx), 0, PI2); g.lineWidth = (1.4 + pulse) * D; g.strokeStyle = col; g.stroke();
        if (eta) lab(ip[0] + 6 * D, ip[1] - 6 * D, eta);
      }
      return;
    }
    if (m.kind === 'sat' && m.track) { // orbit: the great circle about the unit axis `track`
      const ax = m.track, b1 = _b.set(ax.y, -ax.x, 0).normalize(); if (b1.lengthSq() < 1e-6) b1.set(1, 0, 0);
      const b2x = ax.y * b1.z - ax.z * b1.y, b2y = ax.z * b1.x - ax.x * b1.z, b2z = ax.x * b1.y - ax.y * b1.x, pts = [];
      for (let i = 0; i <= 48; i++) { const a = (i / 48) * PI2, c = Math.cos(a), s = Math.sin(a); pts.push([b1.x * c + b2x * s, b1.y * c + b2y * s, b1.z * c + b2z * s, 0.12]); }
      g.lineWidth = 1 * D; g.strokeStyle = col + '88'; stroke(pts, true);
    }
    this.project(m.dir, m.kind === 'sat' ? 0.12 : 0, p);
    if (!p[2] || p[3]) { if (m.kind !== 'sat') chev(p[0], p[1], col, 5); return; }
    g.lineWidth = 1.4 * D; g.strokeStyle = '#120a22'; g.fillStyle = col;
    if (m.kind === 'rival') {
      const rr = Math.max(4 * D, ((m.r || 100) / R) * this.kPx);
      g.beginPath(); g.arc(p[0], p[1], rr, 0, PI2); g.fillStyle = '#12091f'; g.fill(); g.lineWidth = 1.8 * D; g.strokeStyle = col; g.stroke();
      if (m.label) lab(p[0] + rr + 3 * D, p[1], m.label);
    } else if (m.kind === 'ring') {
      g.beginPath(); g.arc(p[0], p[1], Math.max(4 * D, ((m.r || 8000) / R) * this.kPx), 0, PI2); g.lineWidth = (1.4 + (m.pulse ? pulse : 0)) * D; g.strokeStyle = col; g.stroke();
      if (eta) lab(p[0] + 6 * D, p[1] - 6 * D, eta);
    } else if (m.kind === 'aegis') {
      const rr = Math.max(5 * D, ((m.r || 60000) / R) * this.kPx);
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * PI2; (i ? g.lineTo : g.moveTo).call(g, p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr); } g.closePath(); g.lineWidth = 1.8 * D; g.strokeStyle = col; g.stroke();
    } else if (m.kind === 'site') {
      g.beginPath(); g.moveTo(p[0], p[1] - 4.6 * D); g.lineTo(p[0] + 4 * D, p[1] + 3 * D); g.lineTo(p[0] - 4 * D, p[1] + 3 * D); g.closePath(); g.stroke(); g.fill();
      if (m.pulse) { g.beginPath(); g.arc(p[0], p[1], (6 + 4 * pulse) * D, 0, PI2); g.strokeStyle = col + '99'; g.stroke(); }
    } else { // sat (and anything else): a diamond
      g.beginPath(); g.moveTo(p[0], p[1] - 3.6 * D); g.lineTo(p[0] + 3.6 * D, p[1]); g.lineTo(p[0], p[1] + 3.6 * D); g.lineTo(p[0] - 3.6 * D, p[1]); g.closePath(); g.stroke(); g.fill();
    }
    if (m.label && m.kind !== 'rival') lab(p[0] + 6 * D, p[1] + 1 * D, m.label + (eta ? ` ${eta}` : ''));
  }
}
