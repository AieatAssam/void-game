// Tilt-shift miniature look (ART.md): sharp band across the hole, soft top/bottom, vignette + time-of-day grade.
// One extra full-screen pass. Turns itself off if the frame rate can't afford it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TiltShift = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFocus: { value: 0.5 },
    uBlur: { value: 3.0 },
    uGrade: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocus, uBlur; uniform vec3 uGrade;
    varying vec2 vUv;
    void main() {
      float band = smoothstep(0.12, 0.48, abs(vUv.y - uFocus));
      float rad = band * uBlur;
      vec4 c = texture2D(tDiffuse, vUv);
      if (rad > 0.05) {
        vec4 acc = c; float w = 1.0;
        for (int i = 0; i < 12; i++) {           // golden-angle disc taps
          float a = float(i) * 2.39996, d = sqrt(float(i) + 0.5) / 3.6;
          acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * d * rad / uRes);
          w += 1.0;
        }
        c = acc / w;
      }
      vec2 q = vUv - 0.5;
      c.rgb *= uGrade * (1.0 - dot(q, q) * 0.55);   // warm grade + soft vignette
      gl_FragColor = c;
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const size = renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.tilt = new ShaderPass(TiltShift);
    this.composer.addPass(this.tilt);
    this.composer.addPass(new OutputPass());
    this.enabled = !new URLSearchParams(location.search).has('nopost');
    this.frames = 0;
    this.time = 0;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.tilt.uniforms.uRes.value.set(w * pr, h * pr);
  }

  /** Watch the frame rate for a few seconds of play; if it's low, drop the effect for good. */
  watch(dt) {
    if (!this.enabled || this.decided) return;
    this.frames++;
    this.time += dt;
    if (this.time > 4) {
      this.decided = true;
      if (this.frames / this.time < 45) { this.enabled = false; this.lowSpec = true; console.info('low fps: tilt-shift off, LOD0 off'); }
    }
  }

  render(grade, blur = 3) {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    this.tilt.uniforms.uGrade.value.fromArray(grade);
    this.tilt.uniforms.uBlur.value = blur * this.renderer.getPixelRatio();
    this.composer.render();
  }
}
