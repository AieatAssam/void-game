// Loads every model listed in public/models/index.json and swaps in the shared palette materials.
// Content packs (public/models/packs.json) load on demand with loadPack() and merge into the same asset table.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { toyMaterial as makeToy, pedMaterial, glow, pedTime } from './surface.js';
import { loadPBR } from './pbr.js';
import { installVegetation } from './vegetation.js';
import { installTerrainAssets } from './terrain.js';
import { Q } from './quality.js';

const base = import.meta.env.BASE_URL;
// clearcoat body paint (toyFlags.w); cards.js keeps its own set for the Car Crusher card
export const VEHICLES = new Set(['car', 'car_b', 'car_c', 'taxi', 'bus', 'police_car', 'icecream_van', 'cement_truck', 'mayor_limo', 'scooter', 'tank', 'heli',
  'supercar', 'classic_car', 'bumper_car', 'tractor', 'baggage_tug', 'locomotive', 'carriage', 'airliner']);

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

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
// low tier never draws LOD0, so it downloads only the 25% and 8% models (and uses LOD1 as its "full" model)
const DIRS = Q.tier === 'low' ? ['lod/', 'lod2/'] : ['', 'lod/', 'lod2/'];

/** Fetch one model's LODs and give every mesh the shared material + flags. */
async function loadModel(name, meta, tick) {
  const files = await Promise.all(DIRS.map(async (d) => { const g = await loader.loadAsync(`${base}models/${d}${name}.glb`); tick(); return g; }));
  const [gltf, lod, lod2] = files.length === 3 ? files : [files[0], { scene: files[0].scene.clone() }, files[1]];
  let ped = false;
  gltf.scene.traverse((o) => { if (o.isMesh && o.geometry.attributes._swing) ped = true; });
  const material = ped ? walkMaterial : toyMaterial;
  const edible = meta.kind === 'prop' || meta.kind === 'unit';
  const building = meta.tier >= 3 && meta.height > 4 && !VEHICLES.has(name);
  const flags = new THREE.Vector4(name.startsWith('tree') ? 1 : 0, building ? 1 : 0, edible ? meta.tier : 0, VEHICLES.has(name) ? 1 : 0);
  for (const s of [gltf.scene, lod.scene, lod2.scene]) {
    s.traverse((o) => {
      if (!o.isMesh) return;
      dequantize(o.geometry);
      o.material = material;
      o.castShadow = o.receiveShadow = true;
      o.userData.toyFlags = flags;
    });
  }
  return [name, { name, scene: gltf.scene, lod: lod.scene, lod2: lod2.scene, clips: gltf.animations, meta, material, flags }];
}

let packManifest = null;
const packJobs = new Map();

/** The pack manifest (fetched once). */
async function packsManifest() {
  packManifest ??= fetch(base + 'models/packs.json').then((r) => r.json());
  return packManifest;
}

export async function loadAll(onProgress, { packs = false } = {}) {
  const manifest = await (await fetch(base + 'models/index.json')).json();
  if (packs) Object.assign(manifest, await packsManifest()); // gallery/tools: every pack up front
  const names = Object.keys(manifest);
  let done = 0;
  const total = names.length * DIRS.length + 16;
  const tick = () => onProgress?.(++done / total);
  const pbr = loadPBR(tick);
  const entries = await Promise.all(names.map((name) => loadModel(name, manifest[name], tick)));
  await pbr;
  const assets = Object.fromEntries(entries);
  if (packs) for (const p of new Set(Object.values(manifest).map((m) => m.pack).filter(Boolean))) packJobs.set(p, Promise.resolve());
  installVegetation(assets);
  installTerrainAssets(assets);
  return assets;
}

/** Has this pack finished loading into the asset table? */
export const packReady = (assets, name) => packJobs.has(name) && Object.values(assets).some((a) => a.meta.pack === name);

/**
 * Load one content pack (HANDOVER §6) and merge its models into `assets`. Safe to call repeatedly: every pack is
 * fetched once, and concurrent callers share the same promise.
 */
export function loadPack(assets, name, onProgress) {
  if (!packJobs.has(name)) {
    packJobs.set(name, (async () => {
      const manifest = await packsManifest();
      const names = Object.keys(manifest).filter((n) => manifest[n].pack === name);
      let done = 0;
      const tick = () => onProgress?.(++done / (names.length * DIRS.length));
      const entries = await Promise.all(names.map((n) => loadModel(n, manifest[n], tick)));
      Object.assign(assets, Object.fromEntries(entries));
    })().catch((e) => { packJobs.delete(name); throw e; }));
  }
  return packJobs.get(name);
}

/** Load several packs; progress is the average over them. */
export async function loadPacks(assets, names, onProgress) {
  const p = Object.fromEntries(names.map((n) => [n, 0]));
  await Promise.all(names.map((n) => loadPack(assets, n, (f) => { p[n] = f; onProgress?.(Object.values(p).reduce((a, b) => a + b, 0) / names.length); })));
}

/** Kept for callers: time-of-day glow lives in one uniform now. */
export function syncMaterials() {}
