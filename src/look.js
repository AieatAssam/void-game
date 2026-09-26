// The shared look: WebGPU renderer (WebGL2 fallback), physically based sky, sky-lit IBL, sun with soft shadows
// and aerial-perspective fog. Used by the game and the showroom. Time of day is picked per run.
import * as THREE from 'three/webgpu';
import { uniform, float, positionWorld, cameraPosition, exp, max, dot, normalize, pow, mix, clamp , fog } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { Q } from './quality.js';

export const COLORS = { sky: 0xf4dcc0, ground: 0xe6cfa7, void: 0x1a0f3a, lilac: 0xb58cff };

// sun: colour/intensity (lux-ish, AgX tonemapped), elev/azim in degrees; sky: Preetham turbidity/rayleigh;
// fog: horizon haze colour + density; hemi: bounce fill; glow: window/lamp emissive; grade: final colour balance.
export const TIMES = {
  morning: { lut: { shadow: [0.98, 1.0, 1.04], high: [1.03, 1.01, 0.97], sat: 1.04, con: 1.02 }, shafts: 0, sun: 0xfff1de, sunI: 4.4, elev: 26, azim: 120, turb: 3.2, ray: 1.6, fog: 0xc9d6e2, fogD: 0.0026, hemiSky: 0xcfe2ff, hemiGround: 0x8a7a62, hemiI: 0.35, envI: 0.55, glow: 1.0, exposure: 0.72, grade: [1.0, 1.0, 1.02] },
  noon: { lut: { shadow: [1.0, 1.0, 1.02], high: [1.01, 1.0, 0.99], sat: 1.06, con: 1.04 }, shafts: 0, sun: 0xfffaf2, sunI: 5.0, elev: 58, azim: 200, turb: 2.4, ray: 1.2, fog: 0xc6d8ea, fogD: 0.0022, hemiSky: 0xd8e8ff, hemiGround: 0x8c7f68, hemiI: 0.35, envI: 0.6, glow: 0.9, exposure: 0.5, grade: [1.0, 1.0, 1.0] },
  golden: { lut: { shadow: [0.93, 0.98, 1.07], high: [1.06, 1.0, 0.9], sat: 1.08, con: 1.03 }, shafts: 0.32, sun: 0xffc184, sunI: 4.6, elev: 16, azim: 250, turb: 5.5, ray: 2.4, fog: 0xe8c29a, fogD: 0.0032, hemiSky: 0xffdcbc, hemiGround: 0x7a5840, hemiI: 0.3, envI: 0.5, glow: 1.5, exposure: 1.05, grade: [1.05, 1.0, 0.94] },
  night: { lut: { shadow: [0.92, 0.96, 1.1], high: [1.03, 0.98, 1.03], sat: 0.97, con: 1.05 }, shafts: 0, sun: 0x9fb4ff, sunI: 0.7, elev: 38, azim: 140, turb: 1.2, ray: 0.35, fog: 0x1c2140, fogD: 0.004, hemiSky: 0x4a56a0, hemiGround: 0x1a1428, hemiI: 0.55, envI: 0.2, glow: 3.2, exposure: 1.25, grade: [0.95, 0.98, 1.08], night: true },
  dusk: { lut: { shadow: [1.0, 0.92, 1.09], high: [1.07, 0.97, 0.92], sat: 1.05, con: 1.03 }, shafts: 0.4, sun: 0xff8f5e, sunI: 2.4, elev: 7, azim: 285, turb: 7, ray: 3.2, fog: 0xc9929a, fogD: 0.0038, hemiSky: 0xa8a0dc, hemiGround: 0x5a4058, hemiI: 0.6, envI: 0.5, glow: 2.8, exposure: 1.15, grade: [1.0, 0.95, 1.05] },
};

// Chrome 141-143 shipped an older draft of 'texture-component-swizzle' that rejects three's identity swizzle
// string. The identity swizzle is a no-op, so drop it before it reaches the browser.
if (typeof GPUTexture !== 'undefined' && !GPUTexture.prototype.__noSwizzle) {
  const createView = GPUTexture.prototype.createView;
  GPUTexture.prototype.createView = function (d) {
    if (d && d.swizzle === 'rgba') { d = { ...d }; delete d.swizzle; }
    return createView.call(this, d);
  };
  GPUTexture.prototype.__noSwizzle = true;
}

if (typeof location !== 'undefined' && location.search.includes('trace')) THREE.Node.captureStackTrace = true;

export async function createRenderer(canvas) {
  const forceGL = typeof location !== 'undefined' && location.search.includes('webgl');
  // ?fps: time the GPU work too (WebGPU timestamp queries, where the browser offers them) for the overlay
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', forceWebGL: forceGL,
    trackTimestamp: /[?&]fps\b/.test(location.search) });
  // start a notch under the tier's ceiling: post.js's dynamic resolution climbs back up if frames hold 60
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dpr, 1.5));
  // Unreal-style filmic curve: rich toe, soft highlight shoulder. AgX was evaluated per time of day (?tone=agx):
  // it greys out the saturated toy paint in the brights, so ACES stays for every preset (the LUTs do the rest).
  const agx = typeof location !== 'undefined' && location.search.includes('tone=agx');
  renderer.toneMapping = agx ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  await renderer.init();
  // Instanced meshes read their matrices as vertex attributes, not a uniform array. On the uniform path three names
  // every mesh's block uniquely, so each mesh was its own shader program: 862 of them once the region appeared (58 on this
  // path). WebGL compiles each on the main thread (~650 ms measured, even through compileAsync): the breakout froze for
  // 4.6 s, then 200-600 ms at a time as the region revealed. WebGPU creates each pipeline at first draw too.
  // (Only instancing, skinning and draw ranges read this limit.)
  renderer.backend.capabilities.getUniformBufferLimit = () => 0;
  console.info(`renderer: ${renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 fallback'}`);
  return renderer;
}

// Shared lighting uniforms (fog, windows and water read them too).
export const sunDir = uniform(new THREE.Vector3(-0.5, 0.8, 0.3).normalize());
export const sunCol = uniform(new THREE.Color(0xffffff));
const fogCol = uniform(new THREE.Color(0xc6d8ea));
const fogDensity = uniform(0.003);
const fogNear = uniform(20);
const fogScale = uniform(1);

/** Haze starts a little past the look-at point and thins as the camera pulls back, so the city never fogs out. */
export function setFogRange(camDist) {
  fogNear.value = camDist * 1.6;
  fogScale.value = Math.min(1.2, Math.max(0.2, 24 / camDist));
}

// Aerial perspective: exponential distance haze that thins with altitude and warms toward the sun.
function aerialFog() {
  const toFrag = positionWorld.sub(cameraPosition);
  const dist = max(toFrag.length().sub(fogNear), 0);
  const heightFade = exp(max(positionWorld.y, 0).mul(-0.012));
  const f = float(1).sub(exp(dist.mul(fogDensity).mul(fogScale).mul(heightFade).negate()));
  const sunAmt = pow(max(dot(normalize(toFrag), sunDir), 0), 6);
  const col = mix(fogCol, fogCol.mul(0.5).add(sunCol.mul(0.6)), sunAmt.mul(0.6));
  return fog(col, clamp(f, 0, 0.92));
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fogNode = aerialFog();
  const hemi = new THREE.HemisphereLight(0xfff4e0, 0xc98b5b, 0.6);
  const sun = new THREE.DirectionalLight(0xffe2b8, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = Q.tier === 'low' ? 1.5 : 3;
  const c = sun.shadow.camera;
  c.left = c.bottom = -40; c.right = c.top = 40; c.near = 20; c.far = 320; // sun sits 150 m out along its direction
  const sky = new SkyMesh();
  sky.scale.setScalar(4000);
  sky.frustumCulled = false;
  scene.add(hemi, sun, sun.target, sky);
  sun.userData.dir = new THREE.Vector3(-0.5, 0.8, 0.3).normalize();
  // IBL comes from the same sky: a small offscreen scene with its own sky dome, PMREM-filtered per time of day
  const envScene = new THREE.Scene();
  const envSky = new SkyMesh();
  envSky.scale.setScalar(100);
  envScene.add(envSky);
  const groundBounce = new THREE.Mesh(new THREE.CircleGeometry(60, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6b6558 }));
  groundBounce.position.y = -2;
  envScene.add(groundBounce);
  return { scene, sun, hemi, sky, envScene, envSky, groundBounce };
}

function setSky(sky, t, dir) {
  sky.turbidity.value = t.turb;
  sky.rayleigh.value = t.ray;
  sky.mieCoefficient.value = t.night ? 0.001 : 0.005;
  sky.mieDirectionalG.value = 0.82;
  sky.sunPosition.value.copy(dir).multiplyScalar(1000);
  if (sky.cloudCoverage) { sky.cloudCoverage.value = t.night ? 0.15 : 0.35; sky.cloudDensity.value = 0.45; }
}

/** Apply a time-of-day preset. Returns the preset so callers can read glow/grade. */
export function applyTime(look, renderer, name, toyMaterial) {
  const { scene, sun, hemi, sky } = look;
  const t = TIMES[name];
  const e = THREE.MathUtils.degToRad(t.elev), a = THREE.MathUtils.degToRad(t.azim);
  sun.userData.dir.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
  sunDir.value.copy(sun.userData.dir);
  sun.color.set(t.sun);
  sunCol.value.set(t.sun);
  sun.intensity = t.sunI;
  hemi.color.set(t.hemiSky);
  hemi.groundColor.set(t.hemiGround);
  hemi.intensity = t.hemiI;
  setSky(sky, t, sun.userData.dir);
  // night: the physical sky has no moon, so darken the dome and let the fog colour carry the mood
  sky.visible = !t.night;
  scene.background.set(t.fog);
  fogCol.value.set(t.fog);
  fogDensity.value = t.fogD;
  renderer.toneMappingExposure = t.exposure;
  // environment from the sky of this time of day
  setSky(look.envSky, t, sun.userData.dir);
  look.envSky.visible = !t.night;
  look.envScene.background = t.night ? new THREE.Color(t.hemiSky).multiplyScalar(0.15) : null;
  look.groundBounce.material.color.set(t.hemiGround).multiplyScalar(t.night ? 0.3 : 0.8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(look.envScene, 0.02, 1, 200);
  if (scene.environment) scene.environment.dispose();
  scene.environment = env.texture;
  pmrem.dispose();
  scene.environmentIntensity = t.envI;
  if (toyMaterial) toyMaterial.emissiveIntensity = t.glow;
  return t;
}

/** Keep the shadow frustum centred on what the camera looks at, snapped to shadow texels so edges don't crawl. */
export function followSun(sun, target) {
  const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
  const d = sun.userData.dir;
  // snap in light space: project target onto the light's right/up axes and round
  const up = Math.abs(d.y) > 0.99 ? _x : _y;
  _r.crossVectors(up, d).normalize();
  _u.crossVectors(d, _r);
  const rx = Math.round(target.dot(_r) / texel) * texel - target.dot(_r);
  const uy = Math.round(target.dot(_u) / texel) * texel - target.dot(_u);
  _t.copy(target).addScaledVector(_r, rx).addScaledVector(_u, uy);
  sun.position.copy(_t).addScaledVector(d, 150);
  sun.target.position.copy(_t);
}
const _x = new THREE.Vector3(1, 0, 0), _y = new THREE.Vector3(0, 1, 0), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3();
