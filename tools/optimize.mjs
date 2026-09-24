// assets-raw/*.glb -> public/models/*.glb (meshopt) + public/models/index.json manifest.
// The manifest carries each asset's glTF extras (tier, mass, kind...) so the game never hardcodes sizes.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
mkdirSync('public/models/lod', { recursive: true });
mkdirSync('public/models/lod2', { recursive: true });
const countTris = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
const manifest = {};
for (const f of readdirSync('assets-raw').filter((f) => f.endsWith('.glb')).sort()) {
  const name = f.slice(0, -4);
  const doc = await io.read(`assets-raw/${f}`);
  await doc.transform(dedup(), weld(), prune());
  // LOD1 (~25%) for mid distance, LOD2 (~8%) for far / zoomed-out views (ART.md budgets).
  const lods = [];
  // thin structures (spokes, rails, bunting) can ask for gentler LODs with a `lod: [r1, r2]` extra
  const lodExtra = (await io.read(`assets-raw/${f}`)).getRoot().getDefaultScene().listChildren()[0].getExtras().lod;
  const [r1, r2] = Array.isArray(lodExtra) ? lodExtra : [0.25, 0.08];
  for (const [dir, ratio, error] of [['lod', r1, 0.02], ['lod2', r2, 0.06]]) {
    const lod = await io.read(`assets-raw/${f}`);
    await lod.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }), prune(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await io.write(`public/models/${dir}/${f}`, lod);
    lods.push(countTris(lod));
  }
  const tris = countTris(doc), [lodTris, lod2Tris] = lods;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const root = doc.getRoot();
  const node = root.getDefaultScene().listChildren()[0];
  const out = `public/models/${f}`;
  await io.write(out, doc);
  manifest[name] = { ...node.getExtras(), tris, lodTris, lod2Tris, bytes: statSync(out).size, clips: root.listAnimations().map((a) => a.getName()) };
}
// Pack assets (extras.pack) live in their own manifest so the base game never downloads them up front.
const base = {}, packs = {};
for (const [n, m] of Object.entries(manifest)) (m.pack ? packs : base)[n] = m;
writeFileSync('public/models/index.json', JSON.stringify(base, null, 1));
writeFileSync('public/models/packs.json', JSON.stringify(packs, null, 1));
console.table(manifest);
