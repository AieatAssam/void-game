# Water material

`public/textures/water/water-detail.png` is the current 256×256 runtime tile. RGB encodes a tangent-space normal; alpha encodes broken periodic crest patches for depth-gated coastal foam. The game samples it with repeat wrapping, mipmaps and no colour-space conversion.

`water-material.blend` contains the current reusable material and preview quad in the **VOID Water Material Library** collection. Blender MCP made five reversible normal-map trials: `candidates/water-detail-sharp.png`, `water-detail-broken.png`, `water-detail-gapped.png`, `water-detail-packets.png` and `water-detail-packets-short.png`. Sharp, gapped, packets and packets-short were rejected in captures for persistent parallel stripes; broken fails the p99 slope bound and was not captured. Their `.blend` previews and bake/check scripts remain for reproducibility. None replaces the runtime PNG.

Run the checks for a candidate with:

```sh
python3 art/check-water.py          # sharp
python3 art/check-water-broken.py   # broken; expected to fail its p99 gate
python3 art/check-water-gapped.py   # gapped
python3 art/check-water-packets.py  # packets; numeric pass, visual fail
python3 art/check-water-packets-short.py # shorter packets; numeric pass, visual fail
```

When executing through Blender MCP, set `__file__` to the absolute path of `art/bake-water.py` before its contents, so output paths resolve to the repository. The script exports only its candidate collection and preserves the open scene. Blender 5.2.2 crashed when exporting a newly created scene through `bpy.data.libraries.write`; collection export worked.

The runtime uses the baked asset for fine water detail, with analytic large waves and terrain depth for coastal colour and foam. It does not simulate fluid physics or add a reflection render pass.

## Rejected temporal normal volume

`candidates/water-normal-volume.blend`, the bake script, RGBA8 volume and atlas preserve a Blender-MCP temporal-normal experiment. `python3 art/candidates/check-water-normal-volume.py` checks its seams, alpha preservation and decoded slopes. Although those numeric checks passed, a locked phone-size SwiftShader capture and independent Sol-medium visual review found no clearly legible improvement in evolving ripples or crests. The runtime integration was removed; this 1 MiB volume is research only. The comparison and limitations are recorded in `docs/IMPROVEMENT-HANDOFF.md`.

## Shallow-bed caustics

`public/textures/terrain/caustics.png` is an optional 128×128 seamless illumination tile, sampled over a 16 m world repeat to soften phone-scale patterning. `bake-caustics.py` traces 512² sun rays through a periodic four-wave water surface using Snell refraction, deposits their energy onto a bed 1.1 m below, and writes both this tile and `caustics.blend` through Blender MCP. The asset is isolated in its own collection and does not alter the live scene. The terrain shader samples it only with `?caustics`; software rendering disables the option automatically. The effect uses true vertical bed depth, fades outside 0.02–3 m, respects upward terrain normals, dims with the selected sun intensity, and caps the light multiplier at 1.6.
