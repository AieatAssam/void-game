# Handover feedback — Variety Pack integration

Notes from integrating the 38 Stage 11 models (HANDOVER.md). The models were treated as final art: no GLB was
hand-edited and nothing was re-exported. Everything below is either a model/metadata observation for the next
Blender pass, or a design deviation made in code, with the reason.

## Model / metadata observations

No model needed a geometry change to ship. Things worth knowing, in rough order of usefulness:

1. **`pier` is `kind=scenery`** (tier 25.5), so it can't be eaten, but HANDOVER §5.5 lists "eat the pier" as a
   Seaside star. Replaced with "eat every lifeguard tower" (see below). If the pier should become a meal, it needs
   `kind=prop` and a sensible tier (and a place on the size ladder — 25.5 m would be the largest edible by far).
2. **`rubber_duck` is `kind=prop`**, so without special handling it lands in the collection book although it can
   never be swallowed by name (it is only a costume in the ducks mutator). `book.js` now skips assets tagged
   `mutator`. Consider `kind=fx` (or another non-edible kind) for it in the export.
3. **`show_turntable` node `turntable_top`**: the car rides the plate by reading the node's world rotation each
   frame (instanced cars can't be parented to a cloned node). Works well; no change needed. If the plate ever gets
   a non-vertical axis the yaw extraction in `city.js` ('show' mover) would need the full quaternion.
4. **Ferris wheel / carousel bulb chase**: the chase is procedural (angle round the model's vertical axis + height)
   because the bulbs share emissive swatches with other lit parts. A dedicated emissive swatch (or a vertex
   attribute with the bulb's index round the rim) would give a crisper, rim-true chase on the ferris wheel.
5. **Fabric vs paint**: sheen, wind flutter and sun glow-through are applied per *model* (a fabric list in
   `assets.js`) and only to painted swatches, because awning cloth and painted wood use the same palette swatches.
   A "fabric" swatch row (or a per-vertex mask baked in `lib.py`) would let the stall frames stay rigid while the
   cloth flutters.
6. **Locomotive chimney** at local (5.3, 4.2, 0) reads correctly for smoke. Train wheel clips play at
   speed / 4.5 as authored; they look right at 8 m/s and while easing into the station.
7. **Cavity AO**: as HANDOVER §10 suggests, baking per-vertex cavity into a colour attribute in `lib.py` would be
   cheaper and nicer than the screen-derivative curvature term now used on the high tier. Needs Blender.

## Design deviations (code)

- **Star challenges**: Seaside "eat the pier" → "eat every lifeguard tower" (pier isn't edible);
  Waterfront "clear with no tide losses" → "clear without the belly ever running empty" (Waterfront has no tide
  unless the 25% random beach rolls). "Never …" goals only count on a clear, so dying early can't earn them.
- **Fireworks particles** are stateless GPU particles (each spark's position is an analytic TSL function of launch
  time and index) rather than a compute pass: same single reused buffer (3840 sparks), zero per-frame CPU work and no
  compute dispatch, so it also runs on the WebGL2 fallback that the headless tools and older iPads use.
- **Ground displacement** (subdividing tiles near the camera and displacing by the height array) was not done: the
  §9 milestone list covers POM, which is in (high tier). Tiles are authored meshes, not single quads, so vertex
  displacement would need a dedicated near-camera ground grid.
- **Tonemapping**: AgX was evaluated per time of day (`?tone=agx`); it greys the saturated toy paint in the brights
  at golden hour and noon, so ACES stays everywhere and a per-preset 3D LUT carries the grade.
- **Abilities**: Quake cooldown 25 → 30 s after the greedy-ability balance run put one seed at 2:41 (floor 2:45).
