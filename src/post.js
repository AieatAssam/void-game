// Post pipeline (WebGPU, TSL): scene pass with normals in MRT -> half-res GTAO (edge-aware denoised) ->
// bloom on HDR highlights -> tilt-shift lens blur (the miniature look, ART.md) -> colour grade ->
// AgX filmic tonemap -> SMAA -> vignette, faint lens fringing and film grain.
// Drops to a plain render if the frame rate can't afford it.
import * as THREE from 'three/webgpu';
import {
  pass, mrt, output, normalView, packNormalToRGB, unpackRGBToNormal, sample, screenUV, uniform, vec2, vec3, vec4, float, mix,
  smoothstep, abs, dot, renderOutput, clamp, max, time, fract, sin, luminance, pow,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const q = new URLSearchParams(location.search);
    this.enabled = !q.has('nopost');
    this.frames = 0;
    this.time = 0;
    this.grade = uniform(new THREE.Vector3(1, 1, 1));
    this.focus = uniform(0.5);
    this.blurAmt = uniform(1);
    this.aoAmt = uniform(q.has('noao') ? 0 : 1);
    if (!this.enabled) return;

    const pipeline = (this.pipeline = new THREE.RenderPipeline(renderer));
    pipeline.outputColorTransform = false; // we tonemap ourselves so grading/vignette/grain happen in display space
    const scenePass = pass(scene, camera);
    scenePass.setMRT(mrt({ output, normal: packNormalToRGB(normalView) }));
    const normalTex = scenePass.getTexture('normal');
    normalTex.type = THREE.UnsignedByteType; // bandwidth
    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    const normal = sample((uv) => unpackRGBToNormal(scenePass.getTextureNode('normal').sample(uv)));

    // ---- ambient occlusion: contact darkening in corners, under cars, between buildings
    const aoPass = (this.aoPass = ao(depth, normal, camera));
    aoPass.resolutionScale = 0.5;
    aoPass.radius.value = 1.1;
    aoPass.thickness.value = 1.5;
    aoPass.distanceExponent.value = 1.6;
    aoPass.scale.value = 1.15;
    aoPass.samples.value = 12;
    const aoDenoised = denoise(aoPass.getTextureNode(), depth, normal, camera);
    aoDenoised.radius.value = 4;
    // AO mostly shapes ambient/sky light: keep lit highlights bright, crush only the shade
    const lit = color.rgb.mul(mix(float(1), pow(aoDenoised.r, 1.2), this.aoAmt.mul(0.85)));

    // ---- bloom from HDR highlights (windows, lamps, sirens, sun glints)
    const bloomPass = (this.bloomPass = bloom(vec4(lit, 1), 0.35, 0.55, 0.85));
    const hdr = lit.add(bloomPass.rgb);

    // ---- tilt-shift: a sharp band across the hole, soft lens blur above and below
    const blurred = gaussianBlur(vec4(hdr, 1), float(1), 5, { resolutionScale: 0.5 });
    const band = smoothstep(0.2, 0.5, abs(screenUV.y.sub(this.focus))).mul(this.blurAmt).mul(0.85);
    const shifted = mix(hdr, blurred.rgb, band);

    // ---- grade + filmic tonemap (AgX, renderer.toneMapping) + sRGB
    // grade in scene-linear: per-time white balance, a touch more saturation (ACES desaturates brights)
    const wb = shifted.mul(this.grade);
    const graded = mix(vec3(luminance(wb)), wb, 1.12);
    const toned = renderOutput(vec4(max(graded, vec3(0)), 1));
    // gentle display-space S-curve for punch
    const mapped = vec4(mix(toned.rgb, toned.rgb.mul(toned.rgb).mul(float(3).sub(toned.rgb.mul(2))), 0.35), 1);
    const aa = smaa(mapped).getTextureNode();

    // ---- lens: vignette, faint chromatic fringe toward the corners, film grain
    const final = sample((uv) => {
      const c0 = uv.sub(0.5);
      const r2 = dot(c0, c0);
      const ca = c0.mul(r2).mul(0.012);
      const rr = aa.sample(uv.sub(ca)).r, gg = aa.sample(uv).g, bb = aa.sample(uv.add(ca)).b;
      let c = vec3(rr, gg, bb);
      c = c.mul(clamp(float(1).sub(r2.mul(0.95)), 0, 1).pow(0.9));
      const seed = fract(sin(dot(uv.mul(vec2(1920, 1080)).add(fract(time.mul(13.7)).mul(97)), vec2(12.9898, 78.233))).mul(43758.5453));
      const lum = luminance(c);
      c = c.add(seed.sub(0.5).mul(0.018).mul(float(1).sub(lum).mul(0.7).add(0.3)));
      return vec4(max(c, vec3(0)), 1);
    });
    pipeline.outputNode = final;
  }

  setSize() {}

  /** Watch the frame rate for a few seconds of play; if it's low, drop the heavy passes for good. */
  watch(dt) {
    if (!this.enabled || this.decided) return;
    this.frames++;
    this.time += dt;
    if (this.time > 4) {
      this.decided = true;
      if (this.frames / this.time < 40) {
        this.aoPass.resolutionScale = 0.35;
        this.aoPass.samples.value = 6;
        this.lowSpec = true;
        console.info('low fps: lighter AO, LOD0 off');
      }
    }
  }

  render(grade, blur = 1) {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    this.grade.value.fromArray(grade);
    this.blurAmt.value = blur;
    this.pipeline.render();
  }
}
