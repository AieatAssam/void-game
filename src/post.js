// Post pipeline (WebGPU, TSL), built for the quality tier (src/quality.js):
// scene pass -> half-res GTAO (edge-aware denoised) -> bloom on exposed HDR -> white balance + saturation ->
// ACES filmic -> S-curve -> anti-aliasing -> vignette, faint lens fringe, film grain.
// If the frame rate can't keep up it rebuilds itself lighter: AO off, then bloom off, then lower resolution.
import * as THREE from 'three/webgpu';
import {
  pass, sample, uniform, vec2, vec3, vec4, float, mix, dot, renderOutput, clamp, max, time, fract, sin, luminance,
  pow, toneMappingExposure, convertToTexture,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { Q } from './quality.js';

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
    this.opts = { ao: Q.ao && !q.has('noao'), aoRes: Q.aoRes, aoSamples: Q.aoSamples, bloom: Q.bloom, aa: Q.aa, grain: Q.grain };
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
    }
    let hdr = lit;
    if (opts.bloom) {
      // measured on exposed values so only genuinely hot pixels bloom at any time of day
      const bloomPass = (this.bloomPass = bloom(vec4(lit.mul(toneMappingExposure), 1), 0.28, 0.6, 1.25));
      hdr = lit.add(bloomPass.rgb.div(max(toneMappingExposure, 0.05)));
    }
    // grade in scene-linear: per-time white balance, a touch more saturation (ACES desaturates brights)
    const wb = hdr.mul(this.grade);
    const graded = mix(vec3(luminance(wb)), wb, 1.12);
    const toned = renderOutput(vec4(max(graded, vec3(0)), 1));
    const mapped = vec4(mix(toned.rgb, toned.rgb.mul(toned.rgb).mul(float(3).sub(toned.rgb.mul(2))), 0.35), 1);
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
  watch(dt) {
    if (!this.enabled || this.settled) return;
    this.frames++;
    this.time += dt;
    if (this.time < 4) return;
    const fps = this.frames / this.time;
    this.frames = this.time = 0;
    this.fps = fps;
    if (fps >= 45) { if (++this.good >= 3) this.settled = true; return; }
    this.good = 0;
    const r = this.renderer, o = this.opts;
    let step;
    if (r.getPixelRatio() > 1) { r.setPixelRatio(Math.max(1, r.getPixelRatio() - 0.5)); step = `resolution ${r.getPixelRatio()}x`; }
    else if (o.ao && o.aoRes > 0.3) { o.aoRes = 0.3; o.aoSamples = 6; step = 'AO 0.3x'; }
    else if (!this.lowSpec) { this.lowSpec = true; step = 'half grass, no LOD0'; }
    else if (o.ao) { o.ao = false; step = 'AO off'; }
    else if (o.bloom) { o.bloom = false; step = 'bloom off'; }
    else { this.settled = true; return; }
    this.steps = [...(this.steps || []), step];
    console.info(`low fps (${fps.toFixed(0)}): ${step}`);
    if (step.startsWith('AO') || step.startsWith('bloom')) this.build();
  }

  render(grade) {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    this.grade.value.fromArray(grade);
    this.pipeline.render();
  }
}
