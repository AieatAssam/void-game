# Art Bible — "Toybox Town"

The city is a tabletop of **painted wooden and tin toys** under warm afternoon light:
chunky rounded silhouettes, satin paint, a tilt-shift miniature feel (post-process: blur band + vignette + per-time grade, auto-off on slow devices).
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
Idle snack pools are skipped. Low fps → tilt-shift off and LOD0 never used.

## Time of day
Four presets (morning, noon, golden, dusk) drive sun angle/colour, hemisphere light, sky dome, fog and
window/lamp glow (emissive intensity). Dusk is the "cosy" preset: windows and lamps glow strongly.

## Metadata (custom props → glTF extras)
Every exported root object carries: `tier` (footprint radius, m), `mass` (growth value),
`kind` (`prop|unit|hazard|poison|tile|fx`), optional `effect`. 1 unit = 1 m. Pivot = bottom center.
The game reads these from the GLB. There is no hardcoded size table.
