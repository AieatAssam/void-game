// The shared "Toybox Town" look: warm afternoon light on a tabletop city. Used by game + gallery.
import * as THREE from 'three';

export const COLORS = { sky: 0xf4dcc0, ground: 0xe6cfa7, void: 0x1a0f3a, lilac: 0xb58cff };

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 60, 220);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0xc98b5b, 1.6));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
  sun.position.set(-30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const c = sun.shadow.camera;
  c.left = c.bottom = -40; c.right = c.top = 40; c.near = 1; c.far = 160;
  scene.add(sun, sun.target);
  return { scene, sun };
}

/** Keep the shadow frustum centered on what the camera looks at. */
export function followSun(sun, target) {
  sun.position.set(target.x - 30, 50, target.z + 20);
  sun.target.position.copy(target);
}
