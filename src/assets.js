// Loads every model listed in public/models/index.json and swaps in one shared palette material.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

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

export const toyMaterial = new THREE.MeshStandardMaterial({
  map: paletteTexture('palette.png', true),
  emissiveMap: paletteTexture('palette_emit.png', true),
  emissive: 0xffffff,
  emissiveIntensity: 1.4,
  roughness: 0.55,
});

export async function loadAll(onProgress) {
  const manifest = await (await fetch(base + 'models/index.json')).json();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const names = Object.keys(manifest);
  let done = 0;
  const entries = await Promise.all(names.map(async (name) => {
    const [gltf, lod] = await Promise.all([loader.loadAsync(`${base}models/${name}.glb`), loader.loadAsync(`${base}models/lod/${name}.glb`)]);
    for (const s of [gltf.scene, lod.scene]) {
      s.traverse((o) => {
        if (!o.isMesh) return;
        o.material = toyMaterial;
        o.castShadow = o.receiveShadow = true;
      });
    }
    onProgress?.(++done / names.length);
    return [name, { name, scene: gltf.scene, lod: lod.scene, clips: gltf.animations, meta: manifest[name] }];
  }));
  return Object.fromEntries(entries);
}
