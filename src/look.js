// The shared "Toybox Town" look: warm light on a tabletop city. Used by game + gallery.
// Time of day is picked per run; every preset keeps the warm-world / cold-void contrast.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const COLORS = { sky: 0xf4dcc0, ground: 0xe6cfa7, void: 0x1a0f3a, lilac: 0xb58cff };

export const TIMES = {
  morning: { top: 0x8fc6ee, horizon: 0xfde2c4, sun: 0xfff0da, sunI: 2.4, elev: 28, azim: 120, hemiSky: 0xeaf4ff, hemiGround: 0xc9a27a, hemiI: 1.5, glow: 1.1, exposure: 1.05, grade: [1.0, 1.0, 1.03] },
  noon: { top: 0x6fb6ea, horizon: 0xe4f1f6, sun: 0xffffff, sunI: 2.9, elev: 62, azim: 200, hemiSky: 0xf2f7ff, hemiGround: 0xd0b08a, hemiI: 1.5, glow: 1.0, exposure: 1.0, grade: [1.0, 1.0, 1.0] },
  golden: { top: 0x7aa7d8, horizon: 0xffc58a, sun: 0xffb46a, sunI: 2.7, elev: 16, azim: 250, hemiSky: 0xffe0bf, hemiGround: 0xb77a55, hemiI: 1.3, glow: 1.6, exposure: 1.05, grade: [1.06, 1.0, 0.93] },
  night: { top: 0x0a0f2c, horizon: 0x2b2556, sun: 0x9fb4ff, sunI: 0.9, elev: 38, azim: 140, hemiSky: 0x5a66b0, hemiGround: 0x241a36, hemiI: 1.25, glow: 2.6, envI: 0.12, exposure: 1.3, grade: [0.95, 0.97, 1.08], night: true },
  dusk: { top: 0x3a3f7a, horizon: 0xf59a78, sun: 0xff9a70, sunI: 2.0, elev: 12, azim: 285, hemiSky: 0xb9b2ea, hemiGround: 0x6d5070, hemiI: 1.6, glow: 2.6, envI: 0.18, exposure: 1.2, grade: [1.0, 0.95, 1.06] },
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uSun: { value: new THREE.Color() } },
  vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0); }`, // camera-locked
  fragmentShader: /* glsl */ `
    uniform vec3 uTop, uHorizon, uSun, uSunDir; varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y, 0.0, 1.0);
      vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
      float s = max(dot(normalize(vDir), uSunDir), 0.0);
      col += uSun * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.35);
      if (vDir.y < 0.0) col = uHorizon;
      gl_FragColor = vec4(col, 1.0);
    }`,
});

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 120, 520);
  const hemi = new THREE.HemisphereLight(0xfff4e0, 0xc98b5b, 1.6);
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const c = sun.shadow.camera;
  c.left = c.bottom = -40; c.right = c.top = 40; c.near = 1; c.far = 400;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(hemi, sun, sun.target, sky);
  scene.userData.needsEnv = true;
  sun.userData.dir = new THREE.Vector3(-0.5, 0.8, 0.3).normalize();
  return { scene, sun, hemi, sky };
}

/** Apply a time-of-day preset. Returns the preset so callers can read glow/grade. */
export function applyTime({ scene, sun, hemi }, renderer, name, toyMaterial) {
  const t = TIMES[name];
  if (scene.userData.needsEnv) { // soft studio reflections so chrome, glass and gold read as real materials
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.userData.needsEnv = false;
  }
  scene.environmentIntensity = t.envI ?? 0.35;
  const e = THREE.MathUtils.degToRad(t.elev), a = THREE.MathUtils.degToRad(t.azim);
  sun.userData.dir.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
  sun.color.set(t.sun);
  sun.intensity = t.sunI;
  hemi.color.set(t.hemiSky);
  hemi.groundColor.set(t.hemiGround);
  hemi.intensity = t.hemiI;
  skyMat.uniforms.uTop.value.set(t.top);
  skyMat.uniforms.uHorizon.value.set(t.horizon);
  skyMat.uniforms.uSun.value.set(t.sun);
  skyMat.uniforms.uSunDir.value.copy(sun.userData.dir);
  scene.fog.color.set(t.horizon);
  scene.background.set(t.horizon);
  renderer.toneMappingExposure = t.exposure;
  if (toyMaterial) toyMaterial.emissiveIntensity = t.glow;
  return t;
}

/** Keep the shadow frustum centered on what the camera looks at; the sun keeps its direction. */
export function followSun(sun, target) {
  sun.position.copy(target).addScaledVector(sun.userData.dir, 150);
  sun.target.position.copy(target);
}
