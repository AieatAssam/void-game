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
const countTris = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
const manifest = {};
for (const f of readdirSync('assets-raw').filter((f) => f.endsWith('.glb')).sort()) {
  const name = f.slice(0, -4);
  const doc = await io.read(`assets-raw/${f}`);
  await doc.transform(dedup(), weld(), prune());
  // LOD1: same model at ~25% triangles for far-away / zoomed-out views (ART.md budgets).
  const lod = await io.read(`assets-raw/${f}`);
  await lod.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.02 }), prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`public/models/lod/${f}`, lod);
  const tris = countTris(doc), lodTris = countTris(lod);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const root = doc.getRoot();
  const node = root.getDefaultScene().listChildren()[0];
  const out = `public/models/${f}`;
  await io.write(out, doc);
  manifest[name] = { ...node.getExtras(), tris, lodTris, bytes: statSync(out).size, clips: root.listAnimations().map((a) => a.getName()) };
}
writeFileSync('public/models/index.json', JSON.stringify(manifest, null, 1));
console.table(manifest);
