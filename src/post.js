// Post pipeline (WebGPU, TSL), built for the quality tier (src/quality.js):
// scene pass -> half-res GTAO (edge-aware denoised) -> bloom on exposed HDR -> white balance + saturation ->
// ACES filmic -> S-curve -> anti-aliasing -> vignette, faint lens fringe, film grain.
// If the frame rate can't keep up it rebuilds itself lighter: AO off, then bloom off, then lower resolution.
import * as THREE from 'three/webgpu';
import {
  pass, sample, uniform, vec2, vec3, vec4, float, mix, dot, renderOutput, clamp, max, time, fract, sin, luminance,
  pow, toneMappingExposure, convertToTexture, texture3D, step, smoothstep, exp,
} from 'three/tsl';

const LUT = 16;
/**
 * A per-time-of-day grade baked into a small 3D LUT (display-referred, after the filmic curve): split toning
 * (shadow / highlight tints), saturation and a touch of contrast. Rewritten in place when the preset changes.
 */
function bakeLut(tex, { shadow = [1, 1, 1], high = [1, 1, 1], sat = 1, con = 1 } = {}) {
  const d = tex.image.data;
  for (let b = 0; b < LUT; b++) for (let g = 0; g < LUT; g++) for (let r = 0; r < LUT; r++) {
    let c = [r / (LUT - 1), g / (LUT - 1), b / (LUT - 1)];
    const l = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    const ws = (1 - l) ** 2, wh = l * l;
    c = c.map((v, i) => v * (1 + (shadow[i] - 1) * ws) * (1 + (high[i] - 1) * wh));
    const l2 = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    c = c.map((v) => Math.min(1, Math.max(0, (l2 + (v - l2) * sat - 0.5) * con + 0.5)));
    const o = ((b * LUT + g) * LUT + r) * 4;
    d[o] = c[0] * 255; d[o + 1] = c[1] * 255; d[o + 2] = c[2] * 255; d[o + 3] = 255;
  }
  tex.needsUpdate = true;
}
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
import { radialBlur } from 'three/addons/tsl/display/radialBlur.js';
import { sunDir, sunCol } from './look.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { Q } from './quality.js';
import { lensNodes, lensUniforms } from './blackhole.js';

const _sp = new THREE.Vector3();
/**
 * compileAsync() looks its render context up at call depth 0, but the scene pass renders nested inside the post pipeline's own render call (depth 1): objects it compiles get another
 * context, so the real frame found no node-builder state for them and built it all again at first draw (15 ms per instanced mesh: 1.3 s the first time the cinematic's high camera saw
 * the island). Looking the context up at depth 1 for the duration of the call makes the compile hit.
 */
function nested(r, fn, depth = 1) {
  const rc = r._renderContexts, get = rc.get;
  rc.get = function (t, m) { return get.call(this, t, m, depth); };
  try { return fn(); } finally { rc.get = get; }
}
const NOWATCH = typeof location !== 'undefined' && location.search.includes('nowatch'); // profiling: hold the tier as set

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const q = new URLSearchParams(location.search);
    this.enabled = !q.has('nopost');
    this.frames = 0;
    this.time = 0;
    this.good = 0; this.bad = 0; // (bad: one slow second is a hitch, not a verdict)
    this.grade = uniform(new THREE.Vector3(1, 1, 1));
    this.opts = { ao: Q.ao && !q.has('noao'), aoRes: Q.aoRes, aoSamples: Q.aoSamples, bloom: Q.bloom, aa: Q.aa, grain: Q.grain,
      shafts: Q.tier === 'high' && !q.has('noshafts'), lut: !q.has('nolut'), shadowEvery: Q.shadowEvery, lensLow: Q.tier !== 'high' || q.has('webgl') };
    this.lutTex = new THREE.Data3DTexture(new Uint8Array(LUT ** 3 * 4), LUT, LUT, LUT);
    this.lutTex.minFilter = this.lutTex.magFilter = THREE.LinearFilter;
    this.lutTex.wrapS = this.lutTex.wrapT = this.lutTex.wrapR = THREE.ClampToEdgeWrapping;
    this.lutTex.unpackAlignment = 1;
    bakeLut(this.lutTex, {});
    this.sunUV = uniform(new THREE.Vector2(0.5, -1));
    this.shaftK = uniform(0);
    this.pk0 = uniform(new THREE.Vector4(0.5, 0.5, 9, 0)); // hit feedback (src/pain.js): hole on screen (uv), seconds since the hit, impact 0..1
    this.pk1 = uniform(new THREE.Vector4(0, 0, 1, 0)); // wound 0..1, heartbeat pulse, aspect
    this.fxu = uniform(new THREE.Vector4(0, 0, 0, 0)); // a blast (threat.js): white-out (added in HDR, so bloom bursts), warm grade, bloom boost
    this.lens = lensUniforms(); // the finale's black hole (src/blackhole.js): the lens bends the picture, a thin accretion disk is drawn over it; A.w = 0 costs nothing
    this.aoShare = uniform(1); // AO's share of the picture (suspendAO: 0 on a planet, with no rebuild of the pipeline)
    this.aoOff = false;
    this.lowSpec = false; // set by the watchdog: thins grass, never draws LOD0
    if (!this.enabled) return;
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false; // we tonemap ourselves so grading/vignette/grain happen in display space
    this.scenePass = pass(scene, camera);
    this.build();
  }

  build() {
    const { scenePass, camera, opts } = this;
    this.aoPass?.dispose?.();
    this.aoK = 0;
    this.passDepth = undefined; // (re-learned on the next frame)
    this.bloomPass?.dispose?.();
    this.aoPass = this.bloomPass = null;
    for (const t of this.rtts || []) t.dispose();
    this.rtts = [];
    this.rayRtts = this.aoRtt = null;
    const color = scenePass.getTextureNode('output');
    let lit = color.rgb;
    if (opts.ao) {
      // contact darkening from depth-reconstructed normals (no MRT; transparent sprites/water can't corrupt it)
      const depth = scenePass.getTextureNode('depth');
      const aoPass = (this.aoPass = ao(depth, null, camera));
      aoPass.resolutionScale = opts.aoRes;
      aoPass.radius.value = 1.6;
      aoPass.thickness.value = 1.5;
      aoPass.distanceExponent.value = 1.6;
      aoPass.scale.value = 1.15;
      aoPass.samples.value = opts.aoSamples;
      let aoTex = aoPass.getTextureNode();
      if (opts.aoDenoise !== false) { // (the bisect measures without it)
        // denoised once at the AO's own resolution and upsampled: inline at full resolution the 16 depth-aware taps per
        // pixel were most of AO's cost (a measured 5 of AO's 7 fps on a laptop GPU)
        const dn = denoise(aoTex, depth, null, camera);
        dn.radius.value = 4;
        aoTex = convertToTexture(dn);
        aoTex.setResolutionScale(opts.aoRes);
        this.aoRtt = aoTex;
        this.rtts.push(aoTex);
      }
      lit = lit.mul(mix(float(1), pow(aoTex.r, 1.6), this.aoShare.mul(0.9)));
      // the denoise is inline (16 depth-aware taps per pixel), and bloom, shafts and the composite each evaluate
      // `lit` at full res: bake it once so they all read a texture
      const litTex = convertToTexture(vec4(lit, 1));
      this.rtts.push(litTex);
      lit = litTex.rgb;
    }
    let hdr = lit;
    if (opts.bloom) {
      // measured on exposed values so only genuinely hot pixels bloom at any time of day
      const bloomPass = (this.bloomPass = bloom(vec4(lit.mul(toneMappingExposure), 1), 0.24, 0.45, 2.2)); // (threshold well above sunlit white: else the whole frame blooms milky)
      hdr = lit.add(bloomPass.rgb.div(max(toneMappingExposure, 0.05)));
    }
    if (opts.shafts) {
      // light shafts (golden hour, dusk): the sky and the hottest pixels, radially blurred toward the sun's
      // screen position (screen-space, high tier only); faded out when the sun is behind the camera
      const depth = scenePass.getTextureNode('depth');
      const hot = smoothstep(0.9, 2.2, luminance(lit.mul(toneMappingExposure))).add(step(0.99995, depth.r));
      const src = vec4(lit.mul(hot).min(vec3(4)), 1);
      // source and 24-tap blur both at half res: the rays are soft, and at full res this was a GPU hotspot
      const half = { resolutionScale: 0.5 };
      const raySrc = convertToTexture(src, null, null, half);
      const rays = convertToTexture(radialBlur(raySrc, { center: this.sunUV, weight: 0.85, decay: 0.955, count: 24, exposure: 1.6 }), null, null, half);
      this.rtts.push(raySrc, rays);
      this.rayRtts = [raySrc, rays]; // (render() stops updating them while the shafts contribute nothing)
      hdr = hdr.add(rays.rgb.mul(sunCol).mul(this.shaftK));
    }
    // grade in scene-linear: per-time white balance, a touch more saturation (ACES desaturates brights)
    hdr = hdr.add(vec3(1, 0.93, 0.78).mul(this.fxu.x.mul(3.2)));
    const wb = hdr.mul(this.grade).mul(mix(vec3(1), vec3(1.14, 0.95, 0.78), this.fxu.y));
    const graded = mix(vec3(luminance(wb)), wb, 1.12);
    const toned = renderOutput(vec4(max(graded, vec3(0)), 1));
    let mapped = vec4(mix(toned.rgb, toned.rgb.mul(toned.rgb).mul(float(3).sub(toned.rgb.mul(2))), 0.35), 1);
    if (opts.lut) mapped = vec4(lut3D(mapped, texture3D(this.lutTex), LUT, float(1)).rgb, 1); // per-preset grade
    const aa = opts.aa === 'smaa' ? smaa(mapped).getTextureNode() : convertToTexture(fxaa(mapped));
    const grain = opts.grain;
    const pk0 = this.pk0, pk1 = this.pk1;
    this.pipeline.outputNode = sample((uv0) => {
      // hit feedback: a shock ring out of the hole (the picture is pushed away along it), a zoom punch, split colour channels, a red vignette and a drained, heartbeat-pulsed picture while wounded
      const age = pk0.z, amp = pk0.w, wound = pk1.x, heart = pk1.y, asp = pk1.z;
      const lens = lensNodes(uv0, asp, this.lens, time, opts.lensLow); // (the finale: the picture is sampled through the black hole's lens, then the shadow and the disk go over it)
      const hv = uv0.sub(pk0.xy), hd = hv.mul(vec2(asp, 1)), hr = hd.length().max(1e-4);
      const imp = amp.mul(exp(age.mul(-1.7)));
      const ring = exp(pow(hr.sub(age.mul(1.5)).div(0.075), 2).negate()).mul(imp).mul(smoothstep(0, 0.05, age));
      const uv = lens.uv.add(hd.div(hr).div(vec2(asp, 1)).mul(ring).mul(0.02)).sub(hv.mul(imp.mul(exp(age.mul(-5))).mul(0.03)));
      const c0 = uv.sub(0.5);
      const r2 = dot(c0, c0);
      let c;
      const caP = hv.mul(imp.mul(0.008)).add(c0.mul(r2).mul(grain ? 0.012 : 0));
      if (grain) c = vec3(aa.sample(uv.sub(caP)).r, aa.sample(uv).g, aa.sample(uv.add(caP)).b); // faint chromatic fringe toward the corners, and the hit's split
      else c = aa.sample(uv).rgb;
      c = c.mul(float(1).sub(lens.over.w)).add(lens.over.xyz);
      const vig = smoothstep(0.06, 0.5, r2), red = imp.mul(0.8).add(wound.mul(heart.mul(0.4).add(0.25)).mul(0.8));
      c = mix(c, vec3(luminance(c)), clamp(imp.mul(0.3).add(wound.mul(0.22)), 0, 0.6)); // drained
      c = c.mul(vec3(1).sub(vec3(0.05, 0.75, 0.8).mul(vig.mul(red).mul(0.8)))).add(vec3(0.5, 0.015, 0.01).mul(vig).mul(vig).mul(red).mul(0.55)); // red at the edges
      c = c.mul(clamp(float(1).sub(r2.mul(0.95)), 0, 1).pow(0.9)); // vignette
      if (grain) {
        const seed = fract(sin(dot(uv.mul(vec2(1920, 1080)).add(fract(time.mul(13.7)).mul(97)), vec2(12.9898, 78.233))).mul(43758.5453));
        c = c.add(seed.sub(0.5).mul(0.018).mul(float(1).sub(luminance(c)).mul(0.7).add(0.3)));
      }
      return vec4(max(c, vec3(0)), 1);
    });
    this.pipeline.needsUpdate = true;
  }

  setSize() {}

  /** Switch AO off / on without rebuilding the pipeline (a rebuild is a ~1 s freeze while its shaders compile): its share goes to 0 and its buffers shrink to nothing. The planet (Phase 3) has no use for it. */
  suspendAO(off) {
    this.aoOff = off; this.aoShare.value = off ? 0 : 1;
  }

  /**
   * Compile what `root` will draw (default: the scene) in the scene pass's own render context (its target and MRT:
   * renderer.compileAsync on the canvas built different variants, so the first real draw compiled again).
   * - WebGL compiles on the main thread at first draw, so everything is compiled up front, hidden or not.
   * - WebGPU builds pipelines in the background; queueing all 1,200+ town meshes cost 8 s of load and a stuttery first
   *   minute there, so only what's on screen (plus a root about to appear) is compiled.
   * A root is compiled one mesh per frame: three's own loop runs the builds back to back (~24 ms each) and starved
   * rendering (the breakout cinematic dropped to 10 fps). The wait gives up after `timeout` ms: three's WebGL backend
   * polls with requestAnimationFrame, which never fires in a background tab.
   */
  async precompile(root = null, timeout = 8000, around = null) {
    const r = this.renderer, sp = this.scenePass, scene = this.scene, cam = this.camera;
    const withPass = (fn) => { // (collect synchronously in the scene pass's context, then put the renderer back)
      if (!sp) return fn();
      const rt = r.getRenderTarget(), mrt = r.getMRT();
      try { r.setRenderTarget(sp.renderTarget); r.setMRT(sp.getMRT()); return nested(r, fn, this.passDepth); } finally { r.setRenderTarget(rt); r.setMRT(mrt); }
    };
    const race = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(res, ms))]).catch((e) => console.warn('precompile skipped', e));
    if (!root) { // the whole scene at once, behind the loading screen
      // WebGL: one representative per material + geometry layout, so every program exists before play (each costs
      // ~650 ms on the main thread); each mesh's own node build (~25 ms) happens as it first comes into view
      const flip = [], seen = new Set();
      if (!r.backend.isWebGPUBackend) scene.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const key = mats.map((m) => m?.uuid).join() + '|' + Object.keys(o.geometry?.attributes || {}).sort().join() + '|' + o.receiveShadow + o.isInstancedMesh;
        const rep = !seen.has(key);
        seen.add(key);
        if (rep === o.visible && !rep) return;
        for (let q = o; q; q = q.parent) if (rep && !q.visible) { flip.push([q, q.visible, q.frustumCulled]); q.visible = true; }
        flip.push([o, o.visible, o.frustumCulled]);
        o.visible = rep;
        if (rep) o.frustumCulled = false;
      });
      const p = withPass(() => r.compileAsync(scene, cam));
      for (const [o, v, f] of flip.reverse()) { o.visible = v; o.frustumCulled = f; } // (reverse: parents may be listed twice)
      return race(p, timeout);
    }
    const t0 = performance.now(), reps = [], rest = [], seen = new Set();
    root.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const key = mats.map((m) => m?.uuid).join() + '|' + Object.keys(o.geometry?.attributes || {}).sort().join() + '|' + o.receiveShadow + o.isInstancedMesh;
      (seen.has(key) ? rest : reps).push(o);
      seen.add(key);
    });
    const meshes = [...reps, ...rest]; // (one per program first: on WebGL a missing program costs ~650 ms at first draw)
    for (const o of meshes) {
      if (performance.now() - t0 > timeout) break;
      const v = o.visible, f = o.frustumCulled, parents = [];
      for (let q = o; q; q = q.parent) { parents.push([q, q.visible]); q.visible = true; }
      o.frustumCulled = false;
      const n = o.count;
      if (o.isInstancedMesh && !n) o.count = 1; // (culled traffic and crumbs sit at 0 until the first cull: three skips them)
      const p = withPass(() => (around ? around(() => r.compileAsync(o, cam, scene)) : r.compileAsync(o, cam, scene))); // (around: the ascension compiles the planet in the planet's scene state, synchronously, so the swap finds the pipelines cached)
      for (const [q, pv] of parents) q.visible = pv;
      o.visible = v; o.frustumCulled = f; o.count = n;
      await race(p, 1000);
      await new Promise((res) => (document.hidden ? setTimeout(res, 0) : requestAnimationFrame(() => res())));
    }
  }

  /**
   * One mesh's render object and pipeline, created now and not awaited (precompile() does one a frame, behind a timeout, and skips the rest of a big region): the ascension
   * warms every mesh of the region (LODs share an instanced mesh's node state), 3 ms a frame, so the cinematic's high camera does not meet ~900 first draws at once (1.3 s).
   */
  warm(o, mats = null) {
    const r = this.renderer, sp = this.scenePass, scene = this.scene, cam = this.camera, rt = r.getRenderTarget(), mrt = r.getMRT();
    const parents = [], f = o.frustumCulled, n = o.count, m0 = o.material, ps = [];
    for (let q = o; q; q = q.parent) { parents.push([q, q.visible]); q.visible = true; }
    o.frustumCulled = false;
    if (o.isInstancedMesh && !n) o.count = 1; // (culled traffic and crumbs sit at 0 until the first cull: three skips them)
    try {
      if (sp) { r.setRenderTarget(sp.renderTarget); r.setMRT(sp.getMRT()); }
      for (const m of mats || [m0]) { o.material = m; nested(r, () => ps.push(r.compileAsync(o, cam, scene)), this.passDepth); } // (mats: the variants it can switch to: the ground's cut / solid sets)
    } finally {
      o.material = m0; o.frustumCulled = f; o.count = n;
      for (const [q, pv] of parents) q.visible = pv;
      r.setRenderTarget(rt); r.setMRT(mrt);
    }
    return Promise.all(ps).catch(() => {});
  }

  /** Pulled-back views (Phase 2): contact AO reaches as far as things are big on screen. k = viewScale (1 in town). */
  setViewScale(k) {
    if (!this.aoPass) return;
    this.aoPass.radius.value = 1.6 * k;
    this.aoPass.thickness.value = 1.5 * k;
  }

  /**
   * Watch the frame rate while playing and shed the least visible cost first, one notch per slow stretch:
   * resolution -> AO resolution -> grass density / LOD0 -> AO -> bloom. Stops once it holds 45+ fps.
   */
  watch() {
    if (!this.enabled || NOWATCH || this.paused) return; // (paused: the GPU bisect is measuring)
    // real frame time (the game's dt is clamped and slowed by hit-stop, so it can't be trusted for this)
    const now = performance.now(), ft = this.lastT ? now - this.lastT : 16.7;
    this.lastT = now;
    if (ft > 250) return; // a hitch (tab switch, pack download): not a verdict on the GPU
    this.frames++;
    this.time += ft / 1000;
    if (this.time < 1) return;
    const fps = this.frames / this.time;
    this.frames = this.time = 0;
    this.fps = fps;
    const r = this.renderer, o = this.opts, pr = r.getPixelRatio();
    // Dynamic resolution first: trim the render scale in small steps until frames hold ~60, and give it back when
    // there is headroom. Only below the resolution floor do whole features go, least visible first.
    const maxPR = Math.min(devicePixelRatio, Q.dpr), minPR = Math.min(maxPR, Math.max(0.75, maxPR * 0.5));
    // Below 56: trim the render scale. Whole features go only once the scale is on the floor and frames are under 52.
    if (fps < 56 && (fps < 52 || pr > minPR + 0.01)) {
      this.good = 0;
      if (fps >= 35 && ++this.bad < 2) return; // one slow window is a hitch, not a verdict: two in a row step down
      if (pr > minPR + 0.01) {
        this.bad = 0;
        // the ratio that failed: no climbing back to it for 45 s, doubling at each failure up to 5 min, or the
        // watchdog hunts up and down around it and every probe costs a few slow seconds
        this.ceil = pr; this.ceilAt = performance.now(); this.hold = Math.min(300000, (this.hold || 22500) * 2);
        r.setPixelRatio(Math.max(minPR, pr * (fps < 35 ? 0.8 : 0.9)));
        this.scaled = true;
        return;
      }
      if ((this.cool = (this.cool || 0) - 1) > 0) return; // one feature step per 3 s at most
      this.cool = 3;
      let step;
      if (o.shadowEvery < 3) { o.shadowEvery++; step = `shadows every ${o.shadowEvery} frames`; } // (first: no rebuild, no freeze)
      else if (o.shafts) { o.shafts = false; step = 'shafts off'; }
      else if (o.ao && o.aoRes > 0.3) { o.aoRes = 0.3; o.aoSamples = 6; step = 'AO 0.3x'; }
      else if (!this.lowSpec) { this.lowSpec = true; step = 'half grass, no LOD0'; }
      else if (o.ao) { o.ao = false; step = 'AO off'; }
      else if (o.bloom) { o.bloom = false; step = 'bloom off'; }
      else if (o.grain || !o.lensLow) { o.grain = false; o.aa = 'fxaa'; o.lensLow = true; step = 'grain off, FXAA, cheap lens'; }
      else return;
      this.steps = [...(this.steps || []), step];
      console.info(`low fps (${fps.toFixed(0)}): ${step}`);
      if (step !== 'half grass, no LOD0' && !step.startsWith('shadows every')) this.build();
      return;
    }
    this.bad = 0;
    // hysteresis: stay under the failing ratio for `hold`, then try again
    const cap = this.ceil && performance.now() - this.ceilAt < this.hold ? this.ceil - 0.05 : maxPR;
    if (fps >= 58 && pr < Math.min(maxPR, cap) - 0.01 && ++this.good >= 5) { // steady for 5 s: take some sharpness back
      this.good = 0;
      r.setPixelRatio(Math.min(maxPR, cap, pr + 0.1));
    }
  }

  /** New time of day: bake its LUT and set its shaft strength. */
  setPreset(t) {
    bakeLut(this.lutTex, t.lut);
    this.shafts = t.shafts || 0;
  }

  render(grade) {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    this.grade.value.fromArray(grade);
    if (this.bloomPass) this.bloomPass.strength.value = 0.24 + this.fxu.value.z;
    // AO resolution is held at opts.aoRes of a CSS pixel: above 1x the extra device pixels add no AO detail (it is soft and
    // denoised) but its cost grows with them, and retina screens are where the GPU is slowest
    if (this.aoPass) {
      const k = this.aoOff ? 0.02 : this.opts.aoRes / Math.max(1, this.renderer.getPixelRatio());
      if (k !== this.aoK) { this.aoK = k; this.aoPass.resolutionScale = k; this.aoRtt?.setResolutionScale(k); }
    }
    if (this.opts.shafts) { // where the sun sits on screen (uv, y down)
      _sp.copy(this.camera.position).addScaledVector(sunDir.value, 1000).project(this.camera);
      const behind = _sp.z > 1;
      this.sunUV.value.set(_sp.x * 0.5 + 0.5, 0.5 - _sp.y * 0.5);
      this.shaftK.value = behind ? 0 : this.shafts || 0;
      // morning, noon, night (and the sun behind the camera): the two half-res ray passes would be multiplied by zero
      if (this.rayRtts) for (const t of this.rayRtts) t.autoUpdate = this.shaftK.value > 0;
    }
    if (this.passDepth === undefined && this.scenePass) { // (learn the call depth the scene pass renders at: nested() compiles at that depth, so the compile hits)
      const rc = this.renderer._renderContexts, get = rc.get, self = this;
      rc.get = function (t, m, d) { if (t === self.scenePass.renderTarget) self.passDepth = d; return get.call(this, t, m, d); };
      try { this.pipeline.render(); } finally { rc.get = get; }
    } else this.pipeline.render();
  }
}
