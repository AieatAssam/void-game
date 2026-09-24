// Loads every model listed in public/models/index.json and swaps in one shared palette material.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { applySurface } from './surface.js';

const base = import.meta.env.BASE_URL;
const tex = new THREE.TextureLoader();

function paletteTexture(file, srgb) {
  const t = tex.load(base + file);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false; // glTF UV convention
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One material for the whole game. The ORM atlas gives each swatch its own finish:
// satin toy paint by default, glossy glass, real metals (gold, chrome, copper).
const orm = paletteTexture('palette_orm.png', false);
export const toyMaterial = new THREE.MeshStandardMaterial({
  map: paletteTexture('palette.png', true),
  emissiveMap: paletteTexture('palette_emit.png', true),
  emissive: 0xffffff,
  emissiveIntensity: 1.4,
  roughnessMap: orm,
  metalnessMap: orm,
  roughness: 1,
  metalness: 1,
});
toyMaterial.onBeforeCompile = (s) => applySurface(s);
toyMaterial.customProgramCacheKey = () => 'toy-surface';

export async function loadAll(onProgress) {
  const manifest = await (await fetch(base + 'models/index.json')).json();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const names = Object.keys(manifest);
  let done = 0;
  const entries = await Promise.all(names.map(async (name) => {
    const [gltf, lod, lod2] = await Promise.all(['', 'lod/', 'lod2/'].map((d) => loader.loadAsync(`${base}models/${d}${name}.glb`)));
    for (const s of [gltf.scene, lod.scene, lod2.scene]) {
      s.traverse((o) => {
        if (!o.isMesh) return;
        o.material = toyMaterial;
        o.castShadow = o.receiveShadow = true;
      });
    }
    onProgress?.(++done / names.length);
    return [name, { name, scene: gltf.scene, lod: lod.scene, lod2: lod2.scene, clips: gltf.animations, meta: manifest[name] }];
  }));
  return Object.fromEntries(entries);
}

// People walk: arms/legs carry _swing (+-1 legs, +-2 arms, sign = side) and _pivot (hip/shoulder height).
// Each instance gets its own phase, so an instanced crowd still looks like individuals strolling.
export const pedTime = { value: 0 };
export const pedMaterial = toyMaterial.clone();
pedMaterial.onBeforeCompile = (s) => {
  applySurface(s);
  s.uniforms.uPedTime = pedTime;
  s.vertexShader = s.vertexShader
    .replace('#include <common>', `#include <common>
      attribute float _swing; attribute float _pivot; uniform float uPedTime;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      if (abs(_swing) > 0.5) {
        float ph = uPedTime * 8.0 + float(gl_InstanceID) * 1.618;
        float arm = step(1.5, abs(_swing));
        float ang = sin(ph) * sign(_swing) * mix(0.5, -0.65, arm);
        vec3 q = transformed - vec3(0.0, _pivot, 0.0);
        float c = cos(ang), sn = sin(ang);
        transformed = vec3(q.x * c - q.y * sn, q.x * sn + q.y * c, q.z) + vec3(0.0, _pivot, 0.0);
      }`);
};
pedMaterial.customProgramCacheKey = () => 'ped-walk';
