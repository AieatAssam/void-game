// Post pipeline (WebGPU, TSL), built for the quality tier (src/quality.js):
// scene pass -> half-res GTAO (edge-aware denoised) -> bloom on exposed HDR -> white balance + saturation ->
// ACES filmic -> S-curve -> anti-aliasing -> vignette, faint lens fringe, film grain.
// If the frame rate can't keep up it rebuilds itself lighter: AO off, then bloom off, then lower resolution.
import * as THREE from 'three/webgpu';
import {
  pass, sample, uniform, vec2, vec3, vec4, float, mix, dot, renderOutput, clamp, max, time, fract, sin, luminance,
  pow, toneMappingExposure, convertToTexture, texture3D, step, smoothstep,
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

const _sp = new THREE.Vector3();
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
    this.good = 0;
    this.grade = uniform(new THREE.Vector3(1, 1, 1));
    this.opts = { ao: Q.ao && !q.has('noao'), aoRes: Q.aoRes, aoSamples: Q.aoSamples, bloom: Q.bloom, aa: Q.aa, grain: Q.grain,
      shafts: Q.tier === 'high' && !q.has('noshafts'), lut: !q.has('nolut') };
    this.lutTex = new THREE.Data3DTexture(new Uint8Array(LUT ** 3 * 4), LUT, LUT, LUT);
    this.lutTex.minFilter = this.lutTex.magFilter = THREE.LinearFilter;
    this.lutTex.wrapS = this.lutTex.wrapT = this.lutTex.wrapR = THREE.ClampToEdgeWrapping;
    this.lutTex.unpackAlignment = 1;
    bakeLut(this.lutTex, {});
    this.sunUV = uniform(new THREE.Vector2(0.5, -1));
    this.shaftK = uniform(0);
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
    this.bloomPass?.dispose?.();
    this.aoPass = this.bloomPass = null;
    for (const t of this.rtts || []) t.dispose();
    this.rtts = [];
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
      const aoDenoised = denoise(aoPass.getTextureNode(), depth, null, camera);
      aoDenoised.radius.value = 4;
      lit = lit.mul(mix(float(1), pow(aoDenoised.r, 1.6), 0.9));
      // the denoise is inline (16 depth-aware taps per pixel), and bloom, shafts and the composite each evaluate
      // `lit` at full res: bake it once so they all read a texture
      const litTex = convertToTexture(vec4(lit, 1));
      this.rtts.push(litTex);
      lit = litTex.rgb;
    }
    let hdr = lit;
    if (opts.bloom) {
      // measured on exposed values so only genuinely hot pixels bloom at any time of day
      const bloomPass = (this.bloomPass = bloom(vec4(lit.mul(toneMappingExposure), 1), 0.28, 0.6, 1.25));
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
      hdr = hdr.add(rays.rgb.mul(sunCol).mul(this.shaftK));
    }
    // grade in scene-linear: per-time white balance, a touch more saturation (ACES desaturates brights)
    const wb = hdr.mul(this.grade);
    const graded = mix(vec3(luminance(wb)), wb, 1.12);
    const toned = renderOutput(vec4(max(graded, vec3(0)), 1));
    let mapped = vec4(mix(toned.rgb, toned.rgb.mul(toned.rgb).mul(float(3).sub(toned.rgb.mul(2))), 0.35), 1);
    if (opts.lut) mapped = vec4(lut3D(mapped, texture3D(this.lutTex), LUT, float(1)).rgb, 1); // per-preset grade
    const aa = opts.aa === 'smaa' ? smaa(mapped).getTextureNode() : convertToTexture(fxaa(mapped));
    const grain = opts.grain;
    this.pipeline.outputNode = sample((uv) => {
      const c0 = uv.sub(0.5);
      const r2 = dot(c0, c0);
      let c;
      if (grain) { // faint chromatic fringe toward the corners
        const ca = c0.mul(r2).mul(0.012);
        c = vec3(aa.sample(uv.sub(ca)).r, aa.sample(uv).g, aa.sample(uv.add(ca)).b);
      } else c = aa.sample(uv).rgb;
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

  /**
   * Watch the frame rate while playing and shed the least visible cost first, one notch per slow stretch:
   * resolution -> AO resolution -> grass density / LOD0 -> AO -> bloom. Stops once it holds 45+ fps.
   */
  watch() {
    if (!this.enabled || NOWATCH) return;
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
    if (fps < 52) {
      this.good = 0;
      if (pr > minPR + 0.01) {
        r.setPixelRatio(Math.max(minPR, pr * (fps < 35 ? 0.8 : 0.9)));
        this.scaled = true;
        return;
      }
      if ((this.cool = (this.cool || 0) - 1) > 0) return; // one feature step per 3 s at most
      this.cool = 3;
      let step;
      if (o.shafts) { o.shafts = false; step = 'shafts off'; }
      else if (o.ao && o.aoRes > 0.3) { o.aoRes = 0.3; o.aoSamples = 6; step = 'AO 0.3x'; }
      else if (!this.lowSpec) { this.lowSpec = true; step = 'half grass, no LOD0'; }
      else if (o.ao) { o.ao = false; step = 'AO off'; }
      else if (o.bloom) { o.bloom = false; step = 'bloom off'; }
      else return;
      this.steps = [...(this.steps || []), step];
      console.info(`low fps (${fps.toFixed(0)}): ${step}`);
      if (step !== 'half grass, no LOD0') this.build();
      return;
    }
    if (fps >= 57 && pr < maxPR - 0.01 && ++this.good >= 3) { // steady: take some sharpness back
      this.good = 0;
      r.setPixelRatio(Math.min(maxPR, pr + 0.1));
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
    if (this.opts.shafts) { // where the sun sits on screen (uv, y down)
      _sp.copy(this.camera.position).addScaledVector(sunDir.value, 1000).project(this.camera);
      const behind = _sp.z > 1;
      this.sunUV.value.set(_sp.x * 0.5 + 0.5, 0.5 - _sp.y * 0.5);
      this.shaftK.value = behind ? 0 : this.shafts || 0;
    }
    this.pipeline.render();
  }
}
