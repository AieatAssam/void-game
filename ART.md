# Art Bible — "Toybox Town"

The city is a tabletop of **painted wooden and tin toys** under warm afternoon light:
chunky rounded silhouettes, satin paint, lit and graded like a film (post-process: AO, bloom, ACES filmic, vignette, per-time grade).
The hole is the one thing that does not belong: a **cold cosmic void** with a lilac glow rim.
Warm toy world vs cold void is the core visual contrast. Every asset must serve it.

## Shape language
- Everything is beveled. Bevel width ≈ 6–10% of the smallest dimension, 2–4 segments. No razor edges.
- Chunky, slightly exaggerated proportions (toy scale): fat wheels, big heads, thick trims.
- Readable silhouette from the 55° top-down game camera. Detail goes on top surfaces and edges first.
- Smooth shading + weighted normals so bevels catch light like painted wood.

## Palette
One shared material for the whole game: a 8×4 swatch **palette atlas** (`palette.png`) + matching
emissive atlas. Faces UV-map to swatch centers. 1 mesh = 1 draw call, instancing-friendly.

| Row | Use | Swatches |
|---|---|---|
| 0 | City neutrals | cream, warm white, sand, clay, terracotta, brick, asphalt, asphalt-light |
| 1 | Pastels | mint, sage, forest, sky, teal, butter, peach, pink |
| 2 | Toy accents & units | toy red, police blue, navy, army olive, concrete, steel, ink black, hazard yellow |
| 3 | Emissive | window glow, siren red, siren blue, toxic green, void lilac, void deep, warn orange, white glow |

Civilians = pastels. Authority/threat = saturated red/blue/olive/hazard yellow (instantly readable as "danger").
Poison props = hazard yellow + toxic green glow.

## The hole
- Interior: deep indigo void (row 3 "void deep") with a slowly drifting star speckle (shader).
- Rim: soft glowing lilac torus lip. Scales with hole size. Pulses faster when starving.

## Animation
- **Authored clips (glTF, AnimationMixer)** only on few-at-a-time heroes: heli rotors, cement drum, tank turret + recoil, police light bar, fountain, clock hands.
- **Procedural (JS, per instance)** for crowds and bulk: peg-people waddle-hop (toys have no limbs; the hop is the walk), pigeon peck/bob, tree sway, car drive + wheel spin feel.
- **Swallow**: tilt toward hole center, sink, squash. Always procedural.

## Budgets
| Class | Tris | Notes |
|---|---|---|
| Small prop (≤1m) | 0.5–3k | instanced |
| Vehicle / furniture | 3–8k | instanced, wheels separate only if animated |
| Hero unit | 5–15k | clip animated, cloned |
| Building | 4–20k | instanced, LOD1 decimated copy |
| On screen | ≲2M tris incl. shadow pass, ≲210 draw calls | measured (M5): start 1.9M/184, 4m hole 1.3M/157, 12m hole 0.9M/203 |

LOD0 is built with a detail multiplier (`Q` in blender/lib.py, 1.6). Every model ships LOD1 (~25%) and
LOD2 (~8%) via meshoptimizer. The city is instanced per (asset, 40m tile chunk): chunks within 15m of
the camera draw LOD0, to 60m LOD1, beyond LOD2 (and stop casting shadows). Traffic is LOD1/LOD2.
Idle snack pools are skipped. Low fps → quality steps down (src/post.js) and LOD0 is never used.

## Surface detail (scanned PBR, TSL)
The palette atlas still decides *what* a face is; the look of *what it is made of* comes from real scans. `tools/textures.py`
pulls 16 CC0 materials from Poly Haven (plaster, asphalt, concrete, grass, paving, sand, dirt, brick, wood, foliage, metal, roof
tiles, rock, bark, forest floor, shore) and ships each as three 512px maps: albedo, OpenGL normal, and RHA (roughness, height, AO).
`src/pbr.js` packs them into texture arrays. `src/surface.js` maps every swatch to a layer with its own repeat, relief strength
and *chroma* — how much of the scan's natural colour shows through (lawns and asphalt mostly real; toy paint keeps its colour and
only gets a whisper of orange-peel). Buildings' painted walls become rendered stucco.
Models have no UVs or tangents, so layers are projected triplanar (object space for props, so detail sticks to moving things;
world space for the ground, so no two blocks match) and normals use Mikkelsen's surface-gradient framework, which is exact
under instancing. Detail fades with distance; ground gets macro variation so repeats never read as a grid.
Objects still darken over their bottom 0.7 m (grounding) and sit on soft contact-shadow blobs; GTAO does the rest.

## Nature
- **Terrain** (`src/terrain.js`): a heightfield around town — flat apron at the city limits, rolling hills swelling into mountains,
  lakes, a meandering river, farm fields (ploughed, wheat, young crops, pasture) behind hedgerows, forests and rocky outcrops.
  Height-blended splatting by slope, altitude and painted masks; hollows are lusher, crests drier; wildflower drifts.
- **Trees and bushes** (`src/vegetation.js`): grown procedurally — tapered bark tubes with root flare, branches, and lobed crowns
  of leaf-cluster cards (composited from scanned leaves) with canopy-shaped normals, per-card occlusion and back-lit translucency.
  Three variants x three LODs per species; the game keeps each model's size (tier/height).
- **Grass** (`src/grass.js`): a top-down mask pass records where grass grows, the ground height and how wild it is; blades are
  fully procedural (hashed from the instance index in camera-snapped patches). Short lawns in town, tall meadow outside.
- **Wind**: one travelling-gust field bends trunks, flutters leaves and waves the grass; the hole makes everything near it thrash,
  and grass leans into its suction.

## Lighting and post
Physical (Preetham) sky; the IBL is the same sky PMREM-filtered per time of day. Sun shadows are 4096² PCF, snapped to texels.
Aerial-perspective fog thins with altitude and warms toward the sun. Post: MRT normals -> half-res GTAO + denoise -> bloom on
exposed HDR -> white balance + saturation -> ACES filmic -> S-curve -> SMAA -> vignette, fringe, grain.
Each time of day meters its own exposure, like a camera.

## Time of day
Four presets (morning, noon, golden, dusk) drive sun angle/colour, hemisphere light, sky dome, fog and
window/lamp glow (emissive intensity). Dusk is the "cosy" preset: windows and lamps glow strongly.

## Metadata (custom props → glTF extras)
Every exported root object carries: `tier` (footprint radius, m), `mass` (growth value),
`kind` (`prop|unit|hazard|poison|tile|fx`), optional `effect`. 1 unit = 1 m. Pivot = bottom center.
The game reads these from the GLB. There is no hardcoded size table.
