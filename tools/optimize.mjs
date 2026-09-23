// assets-raw/*.glb -> public/models/*.glb (meshopt) + public/models/index.json manifest.
// The manifest carries each asset's glTF extras (tier, mass, kind...) so the game never hardcodes sizes.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
mkdirSync('public/models', { recursive: true });
const manifest = {};
for (const f of readdirSync('assets-raw').filter((f) => f.endsWith('.glb')).sort()) {
  const name = f.slice(0, -4);
  const doc = await io.read(`assets-raw/${f}`);
  await doc.transform(dedup(), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const root = doc.getRoot();
  const node = root.getDefaultScene().listChildren()[0];
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  const out = `public/models/${f}`;
  await io.write(out, doc);
  manifest[name] = { ...node.getExtras(), tris, bytes: statSync(out).size, clips: root.listAnimations().map((a) => a.getName()) };
}
writeFileSync('public/models/index.json', JSON.stringify(manifest, null, 1));
console.table(manifest);
