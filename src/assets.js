// Loads every model listed in public/models/index.json and swaps in the shared palette materials.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { toyMaterial as makeToy, pedMaterial, glow, pedTime } from './surface.js';
import { loadPBR } from './pbr.js';
import { installVegetation } from './vegetation.js';

const base = import.meta.env.BASE_URL;

// One material for (almost) the whole game; per-object flags ride on mesh.userData.toyFlags.
export const toyMaterial = makeToy();
const walkMaterial = pedMaterial();
export { pedTime, glow };

/** meshopt quantizes attributes (e.g. 3 x int16) - formats WebGPU can't fetch. Expand them to float32 once. */
function dequantize(geo) {
  for (const [name, a] of Object.entries(geo.attributes)) {
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
}

export async function loadAll(onProgress) {
  const manifest = await (await fetch(base + 'models/index.json')).json();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const names = Object.keys(manifest);
  let done = 0;
  const total = names.length + 16;
  const tick = () => onProgress?.(++done / total);
  const pbr = loadPBR(tick);
  const entries = await Promise.all(names.map(async (name) => {
    const [gltf, lod, lod2] = await Promise.all(['', 'lod/', 'lod2/'].map((d) => loader.loadAsync(`${base}models/${d}${name}.glb`)));
    const meta = manifest[name];
    let ped = false;
    gltf.scene.traverse((o) => { if (o.isMesh && o.geometry.attributes._swing) ped = true; });
    const material = ped ? walkMaterial : toyMaterial;
    const edible = meta.kind === 'prop' || meta.kind === 'unit';
    const flags = new THREE.Vector4(name.startsWith('tree') ? 1 : 0, meta.tier >= 3 && meta.height > 4 ? 1 : 0, edible ? meta.tier : 0, 0);
    for (const s of [gltf.scene, lod.scene, lod2.scene]) {
      s.traverse((o) => {
        if (!o.isMesh) return;
        dequantize(o.geometry);
        o.material = material;
        o.castShadow = o.receiveShadow = true;
        o.userData.toyFlags = flags;
      });
    }
    tick();
    return [name, { name, scene: gltf.scene, lod: lod.scene, lod2: lod2.scene, clips: gltf.animations, meta, material, flags }];
  }));
  await pbr;
  const assets = Object.fromEntries(entries);
  installVegetation(assets);
  return assets;
}

/** Kept for callers: time-of-day glow lives in one uniform now. */
export function syncMaterials() {}
