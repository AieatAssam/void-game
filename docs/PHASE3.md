# Phase 3 — Planetary: the hole eats the world

Phase 2 ends when the capital falls. Today that's the win. In Phase 3 the island **crumbles into the hole**, the camera
climbs out through the clouds and the atmosphere, and the player sees for the first time that the island was a speck off
the coast of a continent on a whole planet. The hole then eats its way up the scale: towns, cities, nations, mountain
ranges, continents, the satellites overhead and finally the Moon, until **no land is left**. Humanity answers with
everything it has: bombers, fleets, nukes, orbital kinetic strikes, orbital lasers, a planetary lid, and at the very end
a planet-cracker.

This is a build-ready design: core representation, terrain height as gameplay, the size ladder, adversity, camera, HUD
and audio, visuals, budgets, balance and a build order in three shippable passes. Numbers are starting values for the bot
balance pass (docs/BALANCE.md). Distances are metres in code and km in this text.

---

## 0. Decisions at a glance

| Question | Decision |
|---|---|
| Planet | One Earth-sized sphere, R = 6371 km, procedurally generated per run seed (≈29% land, ~40 nations, 8.1 billion people). Fictional. |
| Representation | **The hole stays at the local origin, and the planet turns under it.** `planet.group` is rotated by the inverse of the hole's orientation quaternion `holeQ` and translated by (0, −R − h, 0). Everything near the hole sits in precise float range, and the existing camera, `hole.update`, the hole cut and the screen-relative steering keep working. |
| Geometry | A **globe** (a displaced cube-sphere: one draw) plus a **local patch** around the hole (a 129² CPU heightfield bent onto the sphere, rebuilt in 3 ms slices and leapfrogged) while the hole is under 110 km. Above that, the globe alone. **Superseded by §12.** (150 km) |
| Land state | One authoritative CPU array, the **bite map**: 6 cube faces × 1024² `Uint8`, the remaining fraction of each texel's land column. Growth credit, the HUD land %, the minimap and the win condition all read it. Credit = its decrease, so total credit can never exceed total land. The fine trail at small sizes is cosmetic only. |
| Scale | Phase 3 starts at **r ≈ 1.4 km**: the hole swallows the island, area for area. It ends near **1.5–1.8k km**, ×1200 in radius, ~27 ladder steps of 1.3×, in **5 scale tiers**. (Arithmetic in §4.5. The Moon is made edible by a scripted capture, not by size.) **Superseded by §12.** (40 km → ~2.4k km, 4 tiers) |
| Speed | **0.6 r/s** (Phase 2 at 60 m is 0.67 r/s), so the screen always scrolls at the same rate. The 40 m/s `P2.speed` cap does not apply in Phase 3. **Superseded by §12.** (0.6 r·(r/40 km)^−0.22) |
| Height | **Bite depth D(r) = 0.5 r.** A land column taller than 4D can't be bitten (wall, slide along it). Between D and 4D it drags and is eaten from the top down over several passes. Below D it's a lowland feast. **Superseded by §12.** (D = 0.03 r) |
| Food | Hierarchical, deterministic, procedural: cube-face quadtree cells spawn settlements and units sized to the levels that match the current r. There is always something at 0.1–0.95 r and something at 1–1.6 r on screen. **Superseded by §12.** (the land in nested units; cities are lights) |
| Threat | A DEFCON 5→1 director (army.js patterns) with a budget, a tension cycle and a mercy cap. Every attack is telegraphed ≥ 1.5 s; no hit > 25%. Nukes and kinetic rods can be **swallowed** for a payoff. |
| Loss | **Sealed** (the Phase 2 rule, scaled): starve below 0.7× the current checkpoint and a lid comes down. **Per-tier checkpoints**: retry the tier at its floor; a 25-minute run never resets to the town. |
| Length | Town 4–8 min + island 5–10 min + planet 18–24 min ≈ **30–40 min** campaign. ~3.5–4.5 min per tier, 2–3 min loops inside it. **Superseded by §12.** (planet 19–25 min, 4 tiers) |
| Test flag | `?planet` jumps straight in at 1.4 km (as `?region` does; **§12: 40 km**). `?planet&r=50000` starts at 50 km, `?tier=4`, `?defcon=2`, `?noarmy`, `?norivals`, `?nophase3`. |

---

## 1. What we take from other games

| Game | Device | What we do |
|---|---|---|
| Katamari Damacy / Forever | Continuous growth with fixed screen framing; old obstacles become snacks; the ending turns the ball into a star | Camera distance ∝ r, so the hole is always the same size on screen. The emptied island becomes the first wound. Finale: the planet collapses into a **void star**. |
| Hole.io / Donut County | A readable rim, things tipping in, short set pieces | Keep the rim and the tipping fall up to 110 km, then a shader cap with the same rim colour. |
| Osmos | Size relative to *you* is the whole language | Food smaller than 0.95 r gets a faint lilac edge glow at small screen sizes; things bigger than you get a red-tinted outline on the minimap. |
| Spore (space stage zoom) | One continuous zoom from ground to orbit, with icons taking over as things shrink | The Ascension pull-out is one continuous log-zoom. Things under 3% of r stop drawing as meshes and survive as decals, lights and icons. |
| Outer Wilds | Altitude changes the sky (blue → black, stars, a visible limb) | Sky, haze and stars are driven by camera altitude, not by the time-of-day preset. |
| Super Mario Galaxy | Exaggerated curvature makes "planet" read instantly | Vertical exaggeration E grows with the tier (×1 → ×6), and the camera pitch lowers so the curved horizon is on screen from Tier 2. |
| Solar Smash | Planetary destruction reads through molten cross-sections, craters and orbital weapons with tracers | The eaten land is a glowing wound with strata walls. Lasers and rods come from visible satellites on drawn orbits. Impact decals sit on the globe. |
| Just Cause | Layered explosions: flash → fireball → shock ring → smoke column → debris | Every big detonation is five layers on fixed timings (§5.3). |
| Kerbal Space Program | Trajectories drawn as arcs over a globe | ICBM arcs and satellite orbits are drawn on the minimap globe and in the main view. |
| Titanfall 2 / Horizon | Huge things in the sky, with parallax against the near ground | The Moon, orbital platforms and the Aegis ring hang in the sky. Cloud wisps pass between camera and ground (`Wisps`, reused). |
| Black & White | The giant's scale is read against tiny people | Streams of evacuation traffic, rockets leaving the atmosphere, and the population counter in billions. |

---

## 2. The core representation

### 2.1 Frames and transforms (`src/planet.js`)

- **The hole's frame:** `holeQ` (a quaternion) maps the local frame (x right, y up, z toward the camera) to planet space.
  Moving by the local tangent step (dx, dz) rotates the frame about the local axis (dz, 0, −dx)/|d| by angle |d|/R:
  `holeQ.multiply(qAxisAngle(axis, |d| / R))`, then normalize. There are no lat/long and no pole singularities. Screen-up
  stays the frame's −z, so the controls never flip; geographic north drifts as you travel, which is correct parallel
  transport. The minimap is track-up with an N tick.
- **Render placement:** `planet.group.quaternion = holeQ⁻¹`, `planet.group.position = (0, −(R + h₀), 0)`, where h₀ is the
  ground height under the hole (eased, ×E). The hole sits at (0, 0, 0) every frame (`hole.x = hole.z = 0`). main.js still
  integrates `hole.x/z`, then calls `planet.moveHole(hole.x, hole.z)`, which converts the displacement and zeroes them.
  float32 precision at 6.4·10⁶ m is ~0.5 m. The smallest Phase 3 food is ~140 m, so this is invisible.
- **Entity coordinates:** an entity stores a unit direction `dir` (planet space) and altitude `alt`. For the ~300
  entities near the hole, `planet.update` writes local **azimuthal-equidistant** coordinates (`e.x`, `e.z` =
  great-circle angle × R along the local bearing), so every flat-world distance test (`dx² + dz² < …`) is an exact
  great-circle test at any r. Instance matrices are written in planet space under `planet.group`.
- **City-shaped surface:** `Planet` exposes the duck-typed surface `frame()`, `edgeArrow`, `humanBot` and rivals use on
  `Region`. The full list comes from `grep -o "city\.[a-zA-Z_]*" src/main.js`:
  - **Real implementations:** `entities`, `settlements` (tier goals, §4.3), `capital` (null), `target(hole)`,
    `targetScore`, `buildingsLeft`, `groundY`, `groundSpan`, `groundTilt`, `surfaceSpeed`, `surface` (status text),
    `budget`, `update(dt, holes, jammed)`, `events` (falls / tooBig: these drive hitstop, gulps and dust), `evacuate`,
    `dispose`, `group`, `mood`.
  - **Inert stubs:** `mixers` [], `syncBatches()` no-op, `cullTraffic()` no-op, `smokers` [], `scaleK` 1, `half` ∞,
    `bound` ∞, `alarm`, `tiles` [], `reveal` null, `shadowCam`.

  **`frame()` edits** (each a `state.phase === 3` branch):
  - **Edge clamp:** `lim` at main.js:1542 = ∞. `city.half` is used outside Phase 2, and an undefined `half` turns the
    hole position into NaN.
  - **Coast/mountain block** (1547) is skipped; walls are §3.
  - **Velocity order:** `planet.moveHole()` runs **after** `hole.vx/vz` is computed (1562–1563). Otherwise the
    velocity reads 0, which breaks the camera lead, nuke aim prediction and the bots.
  - **Knock-back:** `state.kick` scales with r (×0.6 r/s instead of a fixed 60 m/s).
  - **Quiet stand-ins** (`quietEvents` and friends in phase2.js) for `grass`, `powerups` (no capsules in Phase 3: perks
    and Frenzy cover it), `rubble`, and `rivals` until step 12.
  - **Threat readout:** threat.js exposes `stars = 5 − DEFCON`, so the existing "stars went up" flash, `starAt` and
    `city.alarm` still read "a bigger number means more threat".

### 2.2 The planet generator (`src/noise.js`, `src/planetgen.js`, `src/planet.worker.js`)

`makeNoise` and `smooth` move from terrain.js to a pure `src/noise.js` (terrain.js imports them back; no behaviour
change). It gains **3D Perlin** `noise3`, `fbm3` and `ridged3`: the existing noise is 2D, and 2D noise on cube faces seams.

`planetgen.js` is pure. It imports no three and no DOM, so the worker and the main thread share it:
- `elevation(dir)` (metres): continents = domain-warped `fbm3` at 1.3 cycles/R, thresholded so ≈29% of the area is above
  sea level. Mountain belts are `ridged3` along plate seams (|fbm3| < 0.08 bands), up to 8.8 km. Shelves go to −200 m,
  abyss to −5 km, with volcano cones (§3) added. Detail octaves continue down to 150 m wavelength, so the live `heightAt`
  is the full function. About 2 µs a call: the gameplay and patch builds call this directly. Nothing reads heights back
  from the GPU.
- `biome(dir, e)`: latitude + moisture fbm → ice, tundra, taiga, temperate, steppe, desert, savanna, jungle, alpine
  rock/snow.
- `habitability(dir, e, biome)`: low, coastal, temperate → the city density used by food.js and the night lights.
- `nation(dir)`: nearest of ~40 seeded land points (Voronoi) → nation id, name and capital.
- Cube mapping uses a **tan-warped cube** (`u' = (4/π)·atan(u)`): texel areas vary ~1.4× instead of 5×, and the same
  ~12 lines are used in JS and TSL.
- `startDir`: a temperate shelf-sea point 12–20 km off a continent coast with a habitability ≥ 0.6 city within 60 km. The
  generator plants an islet of radius 1.4 km there. That islet *is* the Phase 2 island at planet scale.

The worker (`new Worker(new URL('./planet.worker.js', import.meta.url), { type: 'module' })`) bakes:

| Texture | Format | Contents |
|---|---|---|
| `surf` | `DataArrayTexture` 6 × 512², RGBA8 | R height (signed, 40 m steps), G biome, B moisture, A nation edge (borders as faint lines at T3) |
| `night` | `DataArrayTexture` 6 × 512², RG8 | R city light density (habitability × population noise), G cloud cover (fbm3, 3 octaves) |

Bake: 2 × 1.57 M samples, ~1.5–3 s in the worker. It starts when Phase 2 begins (`breakout` → `planet.prebake(seed)`),
so it's long done by the capital. `?planet` shows "Forming the world…" for that time. Results are transferred as
`ArrayBuffer`s; the textures are created on the main thread.

### 2.3 The globe

- A cube-sphere of 6 × N² quads (N = 128 high, 96 medium, 64 low: 196k / 110k / 49k tris), unit radius, one
  `BufferGeometry`, one draw. The vertex shader displaces it by `surf.R × E` (ocean clamped to sea level) and sinks eaten
  land by the bite map (§2.5).
- `planetMaterial` (TSL, `MeshBasicNodeMaterial` with hand-written lighting, `fog: false`) is shared by the globe, the
  patch and the minimap globe through a `uLocal` uniform:
  - **land:** biome ramp × macro `fbm3` variation, slope rock, altitude snow; on the patch the baked ground (`src/groundtex.js`, §11
    "premium ground"): Voronoi farm parcels, forest canopy and stands, street grids, relief slopes, scan detail, rivers and lakes.
  - **ocean:** depth colour from height, GGX sun glint, Fresnel to the sky colour, two octaves of wave-normal noise at T1–T2.
  - **lighting:** Lambert + wrap from the sun, hemi fill, cloud shadows (`night.G` sampled along the sun direction).
  - **night side:** `night.R` city lights × (1 − daylight), warm sodium colour, flicker-free. Lights in eaten land go out
    (× bite map).
  - **aerial perspective:** in-material haze by view distance through the atmosphere: density × exp(−camera altitude /
    8 km). The scene `fogNode` is set to null in Phase 3 (`aerialFog` uses max(y, 0) and would fog the globe at y ≈ −R
    solid).
  - **wound** (§2.5) and the **hole cap** (§2.6).
- Under the patch the globe is discarded inside 0.9 × the patch radius (one angular test). The patch skirt dips 0.3%
  below the globe, so the seam never shows sky.

### 2.4 The local patch (T1–T3, r < 110 km)

> Superseded by §12.1: the patch serves T1 only (r < 150 km).

The globe's vertices are 78–156 km apart: far too coarse for a 1.4 km hole. The patch is the Phase 2 terrain idea
carried onto the sphere:
- A 129² grid (97² on low) covering **L = 28 r**, radially warped so it's denser at the middle, built on the CPU in
  `planet.patchGen()` (a generator) at an **anchor** direction. Per vertex it stores the planet-space unit direction and
  the real height. The vertex shader computes `dir × (R + h·E)` in planet space, so E can change without a rebuild.
- **Leapfrog:** two patch meshes. Start building the next one (`slicer(3)` from region.js, ~10 slices: 16.6k ×
  `heightAt` ≈ 35 ms) when the hole is more than 4 r from the anchor, or r has changed by more than 1.25×. Cross-fade
  over 0.4 s with a dithered alpha ramp. At 0.6 r/s a 4 r drift takes 6.7 s; the build takes ~0.2 s.
- A per-patch 512² RGBA **map** (`globe.mapTex`, painted by `food.paintUrban`): R settlement density (soft edge), G woods, B a road
  distance field between neighbouring towns (3 texels reach: the shader draws any line width from it), A spare. The patch shader
  uses it for the urban fabric, woods and roads by day, and street glow by night.
- A per-patch 512² `R8` **fine trail** (cosmetic): eaten depth in units of 4D(r_build), stamped every frame where the
  hole is (π(r/texel)² ≈ 1000 texels) and re-rasterized at rebuild from a ring buffer of the last 4096 stamps `{dir, r,
  depth}`. Its texel is 0.055 r: 77 m at the start.

### 2.5 The bite map: eating land (`src/bite.js`)

- `rem`: `Uint8Array` 6 × 1024², 255 = untouched land. Ocean texels are 0 and never count. The texel is ~9.8 km. A CPU
  copy lives in a `DataArrayTexture` (R8); dirty faces upload via `addLayerUpdate(face)`, at most 10 Hz (three r186
  `DataArrayTexture.addLayerUpdate`, handled by both backends: checked in `node_modules/three/src`).
- Static per texel (built once from the `surf` bake): `area` (km², from the tan-warped cube) and `hcol = max(0, e) + C`
  with **C = 300 m** of crust, so lowlands are not free.
- **Chew** (per hole, per frame, over texels the disc touches, by great-circle distance):
  - **Coverage** `cov` = the disc ∩ texel area fraction. Below r = 2 texels (all of T1, most of T2) compute it by 4×4
    supersampling. Above that, use 1 inside r − t/2 and linear across the edge.
  - **Chew:** `Δrem = min(cov · dt · D(r) / (T_chew · hcol), rem − (1 − ov)·rem₀)`, with **D(r) = 0.5 r** and
    **T_chew = 1.2 s**. `ov` is the fraction of the texel the hole has *ever* overlapped: an 8-bit per-texel `seen` array
    whose overlap only grows. So a hole parked in a 96 km² texel can only eat the part its disc has actually covered,
    never land outside it.
  - **Feel:** a moving hole crosses a texel in ≈ 2r / 0.6r = 3.3 s, so it eats a column ≈ 1.4 r deep in one pass. A
    parked hole grinds D every 1.2 s.
  - **Calibration test (step 5):** the measured credit rate on flat land ≈ `G_land · 1.2 r² · f_land · √(hcol)`, within
    ±20%, at r = 1.4, 10 and 100 km.
- **Credit:** `dA = G_land(tier) · Σ Δrem · area · √(hcol / 1 km)`. Mountains pay √h more per area but take h/D longer:
  lowlands grow you fast, mountains are slow, rich meals.
- **Budget:** at r = 2000 km the disc covers ~130k texels. bite.js visits at most **40k texels a frame**, round-robin over
  the disc's rows, with each row's dt accumulated (≈0.4 ms). This is exact on average, and the 1.2 s chew hides the
  latency.
- **Land %** = 1 − Σ rem·area / Σ area₀ (by area, tracked incrementally). This feeds the HUD, the minimap ring, the news
  and the win (§4.4).
- **Rivals chew too**, with the same code and their own credit. Their eaten land is gone for everyone.
- **Look of the wound:** eaten land sinks to `−(woundDepth)` (3 km × E) plus the fine trail on the patch. The walls show
  strata (the banded soil colours of the void shader in hole.js, rescaled to km) over a glowing mantle floor: lilac at
  the rim, molten orange deeper (emissive, so it blooms). A crack band glows outside the edge (the `rimCracks` idea in
  angular units). At the coast, the sea stops at the wound edge with a bright meniscus (stylised: the void holds the sea
  back). On the night side the wounds are the brightest thing on the planet.

### 2.6 The hole on a sphere

> Superseded by §12.1: the switch to the cap is at 150 km (the T2 tier-up). Cap feel: §12.5.

- **r < 110 km (T1–T3):** the existing `Hole` meshes (well, rim, swirl, wave) at the origin, with the rim tilted by
  `groundTilt` (from planet heights at ±0.5 r). The cap's sagitta R(1 − cos(r/R)) is under 1 km here, hidden by the rim's
  thickness (y-scale r·0.35).
- **r ≥ 110 km (T4–T5):** the sagitta grows (20 km at 500 km, 310 km at 2000 km), so the flat meshes would float. Hide
  `well`, `rim` and `swirl` (`hole.capMode = true`). The planet shader draws the hole as a **spherical cap**: an angular
  test against a `holeCaps` uniform array (vec4: dir, cos(angle); player + rivals, `MAX_HOLES` = 5). Inside, it ports
  `voidMaterial`'s colours, spiral arms and stars to angular coordinates. The rim is a glowing band at the cap edge, and
  the shockwave is an expanding angular ring.
- `holeField` (the flat vec3(x, z, r) cut) keeps working for the patch, since the hole is at the origin. Rivals near
  you use local coordinates; far rivals are cap-only.

### 2.7 Precision, sky, fog, shadows: fixed at the swap

| Phase 2 setting | Phase 3 replacement |
|---|---|
| `camera.far = max(1600, 4·camDist)` (clips the horizon: √(2Rh) ≈ 500 km at 20 km altitude) | `far = max(4·camDist, 1.2·√(2R·alt + alt²))`, `near = 0.02·camDist`. The near/far ratio stays ≤ 1500. |
| `SkyMesh` scaled to 4000 m (the camera starts ~17 km up, outside it) | Sky dome follows the camera, `scale = 0.9·far`. It fades out between 60 and 250 km altitude; the star field and Milky Way band fade in over the same range. |
| `scene.fogNode = aerialFog()` | null. Haze lives in `planetMaterial`. |
| Sun shadows (near 20 / far 320, sun 150 m out) | **Off** for the whole of Phase 3 (`sun.castShadow = false` at the swap). Relief reads through normals, AO and cloud shadows. This saves the whole shadow pass. |
| `viewScale = camDist/45`, `post.setViewScale(camDist/130)`: unbounded | Clamp `viewScale` to ≤ 8. AO fades out between 300 and 600 km altitude via a new `post.aoMix` uniform (no rebuild). If the AO pass can't be skipped when the mix is 0, run the one `post.build()` without AO during the T3→T4 tier-up slow-mo (quality.js notes that a rebuild freezes Safari: only ever under a cinematic). **Superseded by §12.** AO is off for all of Phase 3 (`PlanetWorld.enter`). |
| Directional sun fixed per preset | The sun is fixed in planet space (≈ 23° tilt, so there's a terminator). Render-space sun = `holeQ⁻¹ · sunPlanet` each frame, so travelling to the night side makes it night. `applyTime` gets a `planet` preset (exposure, LUT). |

---

## 3. Terrain height as gameplay

> Bite depth, wall and drag numbers are superseded by §12.2 (D = 0.03 r).

| Rule | Formula / number | Feel |
|---|---|---|
| Bite depth | D(r) = 0.5 r | A 1.4 km hole chews 700 m a pass; a 20 km hole chews 10 km, so the tallest peak goes in one gulp. |
| Effective height under the hole | e_eff = elevation(dir) × rem(texel) | Mountains you've sliced stay lower. |
| **Wall** | e_eff > 4D = 2 r → slide along, as Phase 2's `mountain > 0.22` slide does (try x-only, then z-only, else stop). Hint "Too tall — grow to {e_eff/2} km". | At 1.4 km, anything over 2.8 km is a wall. An 8.8 km summit walls you until r = 4.4 km. |
| **Ridge drag** | D < e_eff < 4D → speed × (1 − 0.5·(e_eff − D)/3D) | Eaten in slices from the top: every pass lowers it ~1.4 r. |
| **Lowland feast** | e_eff < D → speed × 1.1 | Plains, river valleys and coastal flats are your roads. |
| Slope | Phase 2's `hill` rule (×0.62–1.2 up/down), from `groundTilt` | Unchanged feel. |
| **Ocean** | No credit; speed × 0.6 and belly drain × 1.4 below T3, × 0.85 / × 1.15 at T3, normal from T4 (the hole "drinks" across) | Crossings are a cost while small and nothing at all once you're continental. |
| **Ice caps and shelves** | Land with C = 600 m (thick), biome ice; credit × 1.2 | A polar detour pays at T4–T5. |
| **Volcanoes** | Cones 5–40 km wide, +1–5 km, entities with a crater. Telegraphed eruptions (§5). Eat one while it erupts → **Magma Surge**: 8 s of D × 2 and speed × 1.3. | A hazard that becomes a boost. |
| **Altitude-dependent threats** | Flak belts: AA batteries ring mountain passes (T1–T2: a toll of 1.5% when you cross a pass with an active belt; edible). Storm fronts over oceans (T2–T3): a visual cloud wall that cuts minimap visibility. Orbital weapons target lowlands first: open plains are exposed, and ridges give 30% cover (rods aimed at you while on a ridge scatter wider). | Height is a choice: high ground is slow but safer, lowlands are fast but exposed. |
| Sea level | Fixed: the void holds the sea at the wound edge. No flooding simulation. | Cut: flooding would mean reshaping the ocean per frame for no gameplay. |
| **Tsunamis** (adversity) | Eating more than 60 km of coastline in 20 s, or a nuke hitting the sea, launches a wave ring (§5). | Scale feedback that bites back. |

The gating is a ladder rule for terrain, the same in spirit as "tier < 0.95 r": a wall is always a promise ("grow to X").
It never hard-blocks the map, because there is always a lower pass or a coast around it. The generator checks this: a
flood fill from `startDir` at e < 2.8 km must reach ≥ 60% of the land.

---

## 4. Growth ladder, tiers and pacing

### 4.1 Scale tiers

> Superseded by §12.1: 4 tiers from 40 km, new ramps, the switch at 150 km.

S = log₁₀(r / 1 m). Each tier is ~×4.3 in radius (≈5.5 ladder steps, ~×18.5 in area).

| Tier | r (km) | S | camDist | Pitch | E (relief ×) | Name card |
|---|---|---|---|---|---|---|
| T1 | 1.4–6 | 3.15–3.8 | 17–72 km | 55° (as Phase 2) | 1 | **COASTLANDS** |
| T2 | 6–25 | 3.8–4.4 | 72–300 km | 55 → 47° | 1.5 | **NATIONS** |
| T3 | 25–110 | 4.4–5.04 | 300–1300 km | 47 → 38° | 3 | **CONTINENT** |
| T4 | 110–480 | 5.04–5.68 | 1300–5700 km | 38 → 33° | 6 | **ORBIT** |
| T5 | 480–1800 | 5.68–6.25 | 5700–21500 km | 33° | 6 | **THE WORLD** |

`camDist` stays `(14 + 8r)·portrait·LENS` (FOV 26°, LENS ≈ 1.49). Pitch and E lerp on r within the tier, so there are
no pops. At 1800 km the globe fills most of the 26° view. Only patch → globe-only (110 km), rim → cap (110 km) and the
AO rebuild are discrete. All three happen under the T4 tier-up slow-mo and are **one-way**: a hit that drops r back
below 110 km afterwards (the mercy cap allows 25%) does not switch them back, so there are no flip-flops and no rebuild
freeze outside a cinematic. A checkpoint restore below T4 is the only way back.

### 4.2 Food at each tier: always something smaller and larger

> Superseded by §12.3: the food is the land, in units; the quadtree, skyline kit and food.js go.

| Tier | Crumbs (< 0.12 r: no fanfare, as in Phase 2) | Meals (0.3–0.95 r) | Bigger, the fear (1–1.6 r+) | Ambient scale cues |
|---|---|---|---|---|
| T1 | villages, cargo ships, oil rigs, forest clumps, AA batteries | towns, airports, carrier groups, silo fields | cities, 3–5 km peaks (walls), rival holes | traffic streams on highways, contrails, ferry wakes |
| T2 | towns, ships, silo fields | cities, naval armadas, volcanoes, the first spaceports | metros, the tallest ranges, a bigger rival | night grids, bomber contrail lines, storm fronts |
| T3 | cities, fleets, volcanoes | metros, megacities, nation capitals | megalopolis strips (100–300 km), **The Maw** (a rival at 1.3× you) | ICBM arcs over the limb, border lines, hurricanes |
| T4 | megacities, launch pads, LEO satellites (alt 400 km: eaten once r > 420 km, as they pass) | megalopolis strips, ice shelves, evacuation rockets, **Aegis** platforms | the Aegis ring, continents (land), **World-Eater** (a rival at 1.4×) | rockets leaving the atmosphere, orbit lines, the ISS |
| T5 | islands, ice shelves, orbital debris | continent lobes (land), the planet-cracker's power stations, **Moon fragments** | **the Moon** (radius 1737 km: bigger than you all tier), World-Eater | the Moon looming, a debris ring forming, the night side going dark |

**The Moon** is never eaten whole by size (r peaks ~1.5–1.8k km). At 90% land eaten, the hole's pull drags it into a
low orbit, where it breaks up at the Roche limit (a 6 s cinematic beat). It rains fragments sized 0.3–0.9 r for ~40 s:
the last "larger thing" becomes the last feast.

**Hierarchical procedural food (`src/food.js`).** The cube faces form a quadtree: level L cells are s_L = 10,007 km / 2ᴸ.
Each land cell at level L holds 0–3 items of radius log-uniform in [s_L/48, s_L/16], seeded by
`hash(seed, face, L, i, j)` and weighted by habitability. Sea cells hold ships, fleets and rigs; arid inland cells hold silo
fields (T2+); plate seams hold volcanoes; equatorial coasts hold spaceports (T3+). Kind follows size: < 0.4 km village,
rig or ship; 0.4–3 km town, airport, carrier group or silos; 3–20 km city, armada, volcano or spaceport; 20–90 km metro or
megacity; 90–400 km megalopolis strip; ice shelves and orbital items are separate lists.
- **Active levels:** those with s_L in [4.8 r, 25.6 r] (≈2.4 levels). Cells within the view radius 25 r → ~150 cells →
  ~300 live entities in a pool. Items spawn when their cell enters the view and despawn beyond 30 r.
- **Persistence without storage:** regeneration is deterministic. An `eaten` `Set` of item hashes, plus "not spawned where
  rem < 0.5", means what you ate stays eaten, at every level. A city at level L sits on land, so eating it carves the land
  under all its children.
- **Ladder guarantee:** after each spawn pass, if fewer than 3 meals (0.3–0.95 r) lie within 25 r, or no "bigger" thing lies
  within 15 r, a **filler** item of the missing kind spawns at the nearest suitable land cell ahead (the Phase 1 snack-floor
  rule). Food spacing is authored in units of r: the next goal is always 20–40 s of travel (12–24 r at 0.6 r/s).
- **Rendering by screen size:** items under 3% of r draw nothing (the decal and lights carry them). Cities use the
  **skyline kit**: one or two `InstancedMesh`es of procedural boxes (10 tris each; tower, slab, setback and dome variants
  merged into one geometry with a per-instance variant attribute). A city of radius s gets ≤ 400 boxes with footprint
  ≈ s/12 and height 0.2–3× footprint. Big cities draw blocks, not buildings, which is itself a scale cue. Ships, silos,
  pads, rockets and platforms are GLBs (§6.4) at **readability scale** (≥ 12 px on screen).
- **Eating a city:** one entity with tier = its radius. On the fall, its boxes crumble toward the hole over 1.5–3 s (CPU
  instance matrices, ≤ 2000 per frame) with Phase 2's dust ring scaled to km (`debris.dustRing`).

### 4.3 Tier goals (what the arrow points at)

> Superseded by §12.3 (goals table).

Phase 2's settlement machinery is reused as **objectives**. `planet.settlements` is a short list of goal clusters for
the current tier, built by food.js, each with `list`, `left`, `total`, `name`, `kind`, `x/z` (local) and `r`. The arrow
(`nextSettlement`), "X is gone" banners, news and perk drafts work unchanged.

| Tier | Goals (cleared → banner + draft) |
|---|---|
| T1 | The 4 towns and the coastal city nearest the landing ("Port Ardent has fallen") |
| T2 | The home nation: its cities + capital (nation id from `planetgen.nation`) |
| T3 | Three nations' capitals + megacities, and the Maw |
| T4 | The Aegis (6 platforms), 2 spaceports during the evacuation, and one continent below 50% |
| T5 | Land to 99.5% (§4.4), plus the Moon (optional, star challenge) |

Tier-ups happen on **size** (r ≥ the next floor), not on goals. Goals are guidance and payout, so they can never be a
dead end.

### 4.4 Win, hunt and ending

- **Win:** land eaten ≥ 99.5%.
- **Hunt mode** (Phase 2's rule, main.js:1524) from 97%: no belly drain, no decay. The arrow points at the largest
  remaining land texel cluster (bite.js keeps a coarse 64² per face "land left" summary, updated at 2 Hz). Islands
  smaller than 0.05 r within 3 r crumble into the hole by themselves: no islet-hunting.
- **Finale (≈ 20 s, skippable after the first time):** (1) hitstop 0.3 s, silence; (2) the last coast crumbles; (3) any
  Moon fragments still in orbit rain in at once; (4) the planet's crust caves:
  `uCollapse` shrinks the globe radius toward the hole over 6 s, the atmosphere tears into streamers, and the camera pulls
  out 4×; (5) a **void star**: a black disc with an accretion ring (the hole's swirl shader on a ring mesh), a lensing halo
  and the sun's light bending around it; (6) the card "WORLD EATEN · 23:41 · 8,104,551,203 swallowed".
- **Results / legacy:** run dust from Phase 3 meals, nations (+20 each), the Moon (+60) and the world (+150). Save
  `save.worlds++`, best world time, a "Void Star" skin at the first world. `bankTown` is unchanged; Phase 2 banks at
  ascension the way the town banks at breakout.
- **NG+ ("New World"):** a fresh seed and planet, existing Heat levels apply, and a **legacy perk** carries over (pick 1
  of 3 at the start of the next world). Replays can start at the planet from the menu once one world is eaten
  (`?planet` for players).

### 4.5 Pacing numbers (`P3` in `src/phase3.js`)

> Superseded by §12.1 and §12.4.

| Knob | Value | Note |
|---|---|---|
| `speed(r)` | 0.6 r/s × surface × hill | Continuous with Phase 2 at 60 m. |
| `turn(r)` | 0.45 s | P2's value at 60 m, held. |
| `growth` (meals) | T1 0.8 · T2 0.75 · T3 0.7 · T4 0.6 · T5 0.5 × `growthShare` | Meals matter less as land takes over. |
| `G_land` | T1 0.012 · T2 0.018 · T3 0.028 · T4 0.038 · T5 0.06 | At 70% land under you, a pure land run grows ~0.3%/s at T1 and ~1.6%/s at T5. |
| End size (check) | T5 starts at 0.72 M km² of hole. Land credit ≈ 0.06 × ~137 M km² left × ~0.9 (√h) ≈ +7.4 M; Moon fragments ≈ +0.8 M; less decay → **r_end ≈ 1.5–1.8k km**. | The bot suite verifies this; it is a check, not a target. |
| Belly | drain 1/30 s; meal 0.06 of area; land credit tops it up 1:1 in area terms; crumbs +2% | |
| Decay | fed 0.0010/s, starving 0.008/s | |
| Income split (target, from the ledger) | T1 meals 65 / land 25 / other 10 · T2 55/35/10 · T3 45/45/10 · T4 30/50/20 · T5 15/75/10 | "Other" = nukes and rods swallowed, rivals, space food. |
| Per tier | ×18.5 area ≈ 74 bites of 4% ≈ one every 3.2 s over ~4 min | A 2–3 min loop: goal → set piece → tier-up. |
| Land % by tier end (expected) | T1 < 0.01 · T2 0.1 · T3 1.5 · T4 8 · T5 100 | Global land % stays tiny until T4. The HUD shows the **tier goal** until T3, then the planet %, which takes over at T4. That is honest, and it makes the final tier a crescendo. |
| Rival meal | 0.6 × its area (as now) | |
| Seal | critical 0.7 × checkpoint floor, recover 0.75, dead 0.55, 14 s | army.js `sealWatch`, scaled. |

---

## 5. Adversity

### 5.1 The director (`src/threat.js`, the `Army` pattern)

- **DEFCON 5 → 1** is the threat level shown on the HUD. Like `Army.update`, it's the max of a size floor (5 at 1.4 km,
  4 at 4 km, 3 at 10 km, 2 at 40 km, 1 at 200 km) and notoriety (`notice()` per meal, decaying after 6 s quiet).
- **Budget:** points refill at 0.6 + 0.2 × (5 − DEFCON) per s. Each attack costs points (table) and has its own cooldown.
- **Tension cycle (75 s):** build 45 s (refill × 1, ≤ 2 telegraphs live), peak 15 s (× 2, ≤ 3 live), relax 15 s (× 0,
  ≤ 1 live). The peak lines up with a goal approach where it can (the director peeks at `nextSettlement`).
- **Fairness:** every telegraph is ≥ 1.5 s *locked* (it doesn't move after it locks), and no single hit is > 25%. A
  **mercy cap** allows ≤ 25% total size loss in any 30 s window; past it, hits become near misses (shake only).
  Nothing blocks movement; every ground or sea unit is edible; everything else is temporary.
- **Comeback:** below 0.85 × the checkpoint floor the director goes to *relax* and "Hunger Surge" turns on (food in view
  grows you × 1.5). A swallowed nuke or rod also gives **Frenzy** (6 s, speed × 1.3, D × 2).

### 5.2 The roster

| Unit | DEFCON / tier | Telegraph | Behaviour | Counter / power fantasy | Cost (budget · perf) |
|---|---|---|---|---|---|
| **Bomber wings** | 5 · T1–T2 | strafe line across the view, 2.5 s (`jetStrike`, scaled) | carpet of blasts along the line, 6% | get off the line; wings fly off (temporary) | 3 · 1 instanced draw + puffs |
| **Carrier groups / armadas** | 4 · T1–T3 | ships visible; launch flash, then a cruise missile salvo whose rings track for 2 s then lock 1.5 s | 3–6 rings, 4% each | **edible**: eat the fleet to stop the salvos (a combo) | 3 per salvo · ships instanced |
| **AA belts** | 4 · T1–T2 | flak puffs over passes | 1.5% toll per crossing | edible batteries | 2 · puffs |
| **ICBM nukes** | 3 · T2–T4 | a **launch** contrail rises from a silo field (often over the horizon: the arc is drawn); a ring appears and tracks your predicted position until 2 s before impact, then locks. Flight 6–9 s. | airburst: 7% if your rim is in the blast ring (2 r) + **fallout** zone (2 r, 30 s: belly drain × 1.8, land credit × 0.7) | **Swallow it**: if your *centre* is within 0.5 r of the impact point at detonation (the inner lilac circle), it falls into the void: +3% growth, Frenzy, the best moment in the game. A swallow **overrides** the blast: no damage, no fallout. Silo fields are edible snacks: eat them to stop launches from that region. | 6 · contrail ribbon + ring + mushroom mesh |
| **MIRV** | 2 · T3–T4 | one arc that splits at apex into 6 rings, 3 s locked | 6 × 4%, cap 15% per salvo | each child can be swallowed (inner circle 0.4 r) | 10 |
| **Kinetic lance** ("rods from god") | 2 · T3–T5 | a satellite on a drawn orbit; a red designator beam to the ground, 2.0 s locked | a white-hot rod, crater decal, 8% | dodge; inner gulp 0.3 r → +2%; from r > 420 km **eat the satellite** as it passes overhead | 5 · line + flash |
| **Orbital laser platform** | 2 · T4–T5 | beam warms 2 s at a point 6 r away, then sweeps toward you at 0.35 r/s (slower than you) | 2%/s drain + 0.5 s jam while in the beam | outrun or circle it; bait it across a **rival**; the platform drops to 300 km to re-aim, where it's edible | 8 · beam quad + scorch decal |
| **Tsunami** | 3 · T2–T4 | a visible wave front (foam ring, sea bulge) at 0.4 r/s from the cause | crossing the front: 3% + kick | it wrecks the coast it reaches: towns there become rubble fields worth 1.5× | 4 (or triggered) · ring mesh |
| **Volcano eruption** | 3 · T2–T3 | 3 s rumble + smoke column | lava-bomb rings (4%), an ash zone (speed × 0.7, view dims) | eat it while it erupts → Magma Surge | 4 · plume sprites |
| **Rival holes** | T1 (2 breakouts), T3 Maw (1.3×), T4–T5 World-Eater (1.4×) | names on the minimap with a red ring when bigger | as `rivals.js` (hunt food, chase smaller, flee bigger), now on the sphere and chewing land | eat one → 60% of its area; let it pre-chew a continent for you | rival meshes + cap uniforms |
| **The Aegis** (the planet-scale Capper) | 1 · T4 boss | six lid platforms descend from orbit to 200 km over 8 s in a hexagon, then a closing ring 3 r → r over 6 s | inside the ring 2 s → 12% + eject (like `capper`) | the descended platforms are **edible**: eat all six = "Aegis broken" (+8%, draft) | 30, once · 6 GLB instances + ring |
| **Evacuation rockets** | — · T4 | spaceports launch waves (news: "Exodus begins") | not hostile: **food** while they climb, if r > their altitude | the "small thing in space" | 0 · trail ribbons |
| **Planet-cracker** ("Last Resort") | 1 · T5 | a world countdown of 30 s, a beam charging on the far-side megastructure, three power stations marked on the minimap; at 0 a 2 r ring locks for 4 s | 20% (≤ 25%) + a crater wound | eat the three stations in time and it **fizzles** (the best set piece of the endgame), or dodge the ring | 40, once |
| **Sealing lid** (loss) | any | warning + countdown (army.js `sealWatch`) | T1–T3: a Void Lid Mk III dropped from orbit; T4–T5: the Aegis's last platform | grow back past 0.75 × the floor in 14 s | — |

Cut (low value per line of code): giant mecha and kaiju (scale is wrong: anything that walks is a crumb at 6 km), sea-level
flooding, anti-matter beyond the cracker.

### 5.3 Feel-of-power catalog

| You swallow | Hitstop | Shake (trauma) | Slow-mo | Visual layers | Audio |
|---|---|---|---|---|---|
| a town / ship | — | 0.1 | — | dust ring | gulp (pitched by tier) |
| a city ≥ 0.6 r | 0.08 s | 0.3, rolling | — | boxes pancake toward the rim, dust front, lights wink out | low gulp + sub thump |
| a mountain (a pass that removes > 2 km) | 0.06 s | 0.25 | — | rock spray, snow puff, strata wall glows | grinding rumble |
| **a nuke mid-air** | 0.15 s | 0.5 | 0.5× for 0.6 s | white flash *inside* the well, the mushroom inverts and is sucked down, a lilac shock ring outward | boom reversed into a gulp, choir hit |
| a satellite / rocket | 0.08 s | 0.15 | — | the streak bends and falls in, sparks | high "tink" then whoosh |
| the Aegis's last platform | 0.2 s | 0.6 | 0.4× for 1 s | the ring shatters into falling segments | metal groan + choir |
| a rival | 0.12 s | 0.4 | — | as now (`sparks.burst`) plus a cap flash | star + sub drop |
| the Moon breaking up (Roche) / its last fragment | 0.3 s | 0.8 | 0.3× for 2 s | a debris ring, the moonlight goes out | silence → organ swell |

Every big detonation layers on fixed offsets (the Just Cause recipe): flash (0 ms, 1 frame of additive white over 3 r) →
fireball sprite (0–400 ms) → shock ring (an expanding ground decal at 0.8 r/s, plus a screen-space ripple when close) →
smoke column / mushroom mesh (0.3–6 s) → debris rain (puffs). **Shake budget:** trauma decays at 1.5/s, and new shakes
add at most 0.6 per 1.5 s. Shake is a low-frequency roll (camera rotation) above 0.3 trauma, never jitter.
**Sound travels:** a far detonation's boom is delayed by min(1.2 s, dist / 12 r).

---

## 6. Camera, controls, HUD, audio, visuals

### 6.1 Camera

- The existing camera block (main.js ~1779–1795), with: pitch from `P3.pitch(r)` (table §4.1); far/near as §2.7; target
  = the origin plus a lead of 0.15 × camDist along the velocity (the hole no longer lerps across the screen); FOV 26°
  fixed, plus a +4° punch-out for 0.8 s at tier-ups.
- Layered by altitude: cloud wisps (`Wisps`, reused; their 260–520 m fade becomes a fade by camDist/r), the cloud shell
  at 8 km (from the `night.G` bake; faded within 2.5 r of the hole so the play area stays clear), the atmosphere shell, the
  stars. Parallax between the wisps and the ground is the strongest height cue (Phase 2 finding).
- **Tier-up beat:** hitstop 0.25 s → slow-mo 0.4× for 1.5 s → name card (existing `levelEl`) → news line → a perk
  draft (existing `openDraft`). Any expensive one-off switch (globe-only, cap mode, AO rebuild) happens under it.

### 6.2 Controls on a sphere

Input is unchanged: `steer()` / `__bot` return a screen-relative (sx, sz). `frame()` integrates `hole.x/z` as now
(speed from `P3.speed`), then `planet.moveHole(hole.x, hole.z)` applies the rotation in §2.1 and zeroes them. Walls are
the Phase 2 slide (try the x-only move, then the z-only move, testing `e_eff` at the would-be centre). `state.kick`
(knock-back) passes through the same path. There are no poles and no gimbal: only an incremental quaternion. Renormalize
every frame.

### 6.3 HUD and the planet minimap (`src/planetmap.js`)

- **Minimap = a small GPU globe.** A separate `THREE.Scene` holds a 32²-per-face cube-sphere sharing `planetMaterial`
  (`uLocal = 0`: no detail octaves, no clouds) and a thin atmosphere ring. An orthographic camera looks straight down
  the hole's up axis (track-up: the hole is at the centre, so you see your hemisphere). It renders **after**
  `post.render()` into a scissored 200 px viewport with `autoClear = false`: ~3 draws, ~0.2 ms GPU. A 2D canvas above
  it draws the overlays:
  - you (lilac) and rivals (red ring when bigger than you);
  - threats: nuke arcs with an ETA, satellites, orbit tracks with the back half dashed, the Aegis;
  - the goal ring;
  - edge chevrons for far-side items;
  - an N tick;
  - a **land-eaten arc gauge** around the rim.
  Must be verified on the WebGL2 fallback (`?webgl`) as part of its step. The current per-pixel canvas bake (~118k px
  at dpr 2) can't redraw a turning globe at 12 Hz.
- **HUD top centre:** tier name and S, then the goal ("Nation of Valoria — 3 cities left") until T3, then **"Land eaten
  12.4%"** with a planet icon. DEFCON pips replace the ★ stars, and the threat line names the live attack with a
  countdown ("ICBM — impact 4.2 s").
- The news ticker (`News`) continues, with the population counter in billions. Example lines: "World Defense Council
  authorises nuclear response", "Exodus: first evacuation rockets leave Equatoria".

### 6.4 Audio (sfx.js)

| Layer | Implementation |
|---|---|
| World bus | All diegetic sfx route through `world` Gain → BiquadFilter (lowpass). Cutoff: 18 kHz at T1 → 2 kHz at T3 → 400 Hz in space (camera alt > 100 km), −8 dB. "No sound in space", but the rumble is still felt. |
| Sub drone | 38–55 Hz sine + brown noise, gain ∝ tier, pitched down per tier: the planet's groan. |
| Big events | `boom(k)` gets a sub tail (k ≥ 2), a delayed arrival (§5.3) and a reverse-gulp variant for swallows. |
| Choir / organ pad | Two detuned saw voices through a formant bandpass: tier-ups, the Aegis, the Moon, the finale. |
| Alarms | Phase 2's `airRaid` and `bells` → a global "emergency broadcast" tone + DEFCON klaxon (one per level change). |
| Ascension | wind rush (filtered noise rising) → silence at 100 km → a single sustained chord swell. |

### 6.5 Visual quality plan

| Feature | How | Cost | Tier |
|---|---|---|---|
| Atmosphere shell | A sphere at R × 1.025 (exaggerated), BackSide, additive. Analytic single scatter: 4-sample Rayleigh + Mie (the O'Neil/GPU Gems 2 form) along the view ray through the shell, sun from the shared `sunDir` | 1 draw, ~0.3 ms at 1080p | all (low: 2 samples) |
| Cloud layer | A shell at R + 8 km sampling `night.G` with a slow rotation offset; soft edge; shadow term in `planetMaterial` | 1 draw | med/high (low: shadows only) |
| City lights | `night.R` × dark side, plus the patch city map for close range | in material | all |
| Ocean glint + Fresnel | In `planetMaterial` | in material | all |
| Terminator | Wrap lighting + atmosphere tint at the limb, warm band | in material | all |
| Wound | §2.5; emissive → bloom (existing post bloom) | in material | all |
| Stars + Milky Way | 4k `Points` (`spriteCloud` style) + a band shader on a camera-centred sphere, faded in by altitude | 2 draws | all |
| Moon | Sphere (64²) + procedural craters (`mx_worley`) + a far-side bake; real size, at 12 R (fiction: closer, so it looms) | 1 draw | all |
| Light shafts | Existing post shafts (half res), on at T3+ when the sun is near the limb | existing | high |
| AO | Existing; clamped scale, fades out at 300–600 km | existing | per tier |
| Bloom, LUT, grain, SMAA | Existing pipeline, unchanged; `planet` LUT preset | existing | — |
| Readability | Lilac edge on edible food < 12 px, red for bigger; adversary models at readability scale | instanced | all |

**Baked vs runtime:** height, biome, moisture, nation edges, light density and clouds are baked once in the worker (§2.2).
The bite map, the patch, the city map and the fine trail are runtime. Nothing is cached across sessions: the bake is fast
enough, and it's seed-specific.

### 6.6 Models (Blender, `blender/assets/*.py`, a `PLANET` list in build_all.py, pack `planet`)

Most planetary food is procedural (skyline boxes, decals, land). Models are for adversity and space, where silhouettes
sell the fiction. Shown at readability scale, so LOD0 budgets are small.

| # | Model | Real size | LOD0 tris | Worth it because |
|---|---|---|---|---|
| 1 | `icbm` (with a plume socket) | 35 m | 1.2k | the nuke arc's hero |
| 2 | `missile_silo` (an open hatch, a field of 6 instanced) | 20 m | 0.8k | edible snack, launch source |
| 3 | `aircraft_carrier` | 330 m | 3k | fleets read instantly |
| 4 | `destroyer` | 150 m | 1.5k | fleet escort |
| 5 | `cargo_ship` (containers) | 300 m | 1.5k | T1 crumbs at sea |
| 6 | `oil_rig` | 100 m | 1.5k | sea crumbs |
| 7 | `bomber` (flying wing) | 50 m | 1k | strike wings (`jet.glb` reused for fighters) |
| 8 | `kinetic_sat` (rod platform, solar wings) | 40 m | 1.5k | orbital lance source |
| 9 | `laser_platform` (ring + lens) | 120 m | 2.5k | orbital laser |
| 10 | `aegis_platform` (a hex lid segment with thrusters) | 60 km (fiction) | 3k | T4 boss, edible |
| 11 | `rocket` (evacuation heavy lifter) | 110 m | 1.5k | food in space |
| 12 | `launch_pad` (tower + pad + tanks) | 400 m | 2.5k | spaceport goal |
| 13 | `space_station` (truss + modules + panels) | 110 m | 3k | the ISS beat |
| 14 | `mushroom_cloud` (toy-styled, vertex colour, rings) | unit | 2k | animated by scale/shader: better than a billboard from oblique views |
| 15 | `cracker` (the planet-cracker array + 3 power stations) | 300 km (fiction) | 4k | the T5 set piece |
| 16 | `aa_battery` | 30 m | 0.8k | flak belts, edible |

16 models, ~31k LOD0 tris total. Same pipeline (`tools/optimize.mjs` → meshopt, LOD1/LOD2, manifest extras with
`tier` in metres). The ladder check doesn't apply: they're adversaries or set pieces, not ladder food. Reused:
`jet`, `chinook`, `cooling_tower` (nuclear plants), `capper` (the Mk III lid). **Not modelled:** cities, mountains,
volcanoes, forests, ice, the Moon, clouds and mecha (procedural or cut).

### 6.7 Performance budgets

Reference: Phase 2 holds 58–60 fps at 100–120 draws and 0.5–1.85M tris (Apple Silicon, high). Phase 3 has **no shadow
pass**, which buys headroom for the atmosphere.

| Per frame | T1–T2 | T3 | T4–T5 |
|---|---|---|---|
| Draws (high / low) | ≤ 75 / 55 | ≤ 75 / 55 | ≤ 60 / 45 |
| Triangles (high / low) | ≤ 1.0M / 0.45M | ≤ 0.9M / 0.4M | ≤ 0.5M / 0.25M |
| Instanced skyline boxes (**removed, §12.3**) | — | — | — |
| CPU game step | ≤ 4 ms: bite ≤ 0.6, food ≤ 1.2, threat ≤ 0.4, patch build ≤ 3 ms slices | same | same |
| GPU extras | patch ×2 during the cross-fade, AO on | AO fading out, shafts (high) | atmosphere + clouds + stars, AO off |
| Texture memory | surf 6 MB + night 3 MB + bite 6 MB + city map 1 MB + trail 0.25 MB ≈ 17 MB | | |
| Long tasks | none > 50 ms outside cinematics; ascension worst frame ≤ 200 ms (Phase 2's breakout bar) | | |

Draw breakdown (T1, high): globe 1, patch 2, atmosphere 1, clouds 1, stars 2, moon 1, skyline 2, food GLBs ~10, rings and
decals 4, FX sprites ~6, contrails 2, hole 5, rivals 3 × 5, minimap 3, orbit lines 1 ≈ 57. Measure with `?planet&fps&nowatch`
and the `__perf()` hitch log (perfTag gains `p3`, `tier N`, `patch build`), on WebGPU and `?webgl`, high and `?q=low`.

---

## 7. Ascension: the Phase 2 → 3 transition (the biggest wow)

Triggered where `endRun(true, 'capital')` is today (main.js:1615), if `phase3Run()`. `PHASE3 = !nophase3 && (!BOT ||
START_PLANET)`, mirroring `PHASE2` (main.js:163), so the existing region suites and BALANCE tables keep their win.
`bankRegion()` first (as `bankTown` does at breakout). The planet bake started at the Phase 2 breakout. Its meshes are
built in 3 ms slices during Phase 2 (`planet.prebuild()`, beside `prebuildRegion`), and `post.precompile(planet.group)`
runs under shot 2.

| t (s, real) | Shot | What happens | Under the hood |
|---|---|---|---|
| 0.0–0.4 | **Silence** | Hitstop on the last capital piece, audio ducks to a low drone | `state.hitstop = 0.3` |
| 0.4–2.6 | **The island breaks** | A crack ring races out to the coast (rimCracks at `coastR`); terrain sectors sag toward the hole (a `uSink` uniform in the terrain material: sink ∝ 1 − dist/coastR × t); dust rings from the coast; the sea pours over the coast in white waterfall sprites. Slow-mo 0.3. Camera at the kaiju low angle (Phase 2 `finale`), climbing. | `debris.dustRing` ×4 (Phase 2 timings); precompile planet meshes one per frame |
| 2.6–4.6 | **The surge** | (**Superseded by §12.7 R6: r 60 m → 40 km, chewing the coast.**) The hole swallows the island: r 60 m → r₀ = √(r² + mean(coastR)²) ≈ 1.4 km (area for area), lilac flash, the whole island sinks into the well | `state.surgeTo`; region sectors `uSink` → 1 |
| 4.6–8.6 | **The pull-out** | One continuous log-zoom: altitude = 1 km × 24,000^(t/4), up to ~24,000 km. Through the cloud deck (wisps pass the lens at ~2 and 8 km), the sky goes from blue to indigo to black, stars fade in, the horizon bends into a limb, and the island's wound is a lilac dot by a continent's coast. Pitch eases 55° → 25°, FOV 26° → 22° (a slight dolly-zoom). | **World swap at alt 60 km** (the island is < 40 px, under the flash): dispose the Region, scene `fogNode` null, shadows off, sky follows the camera, planet group in. Wind rush → silence at 100 km. |
| 8.6–11 | **The reveal** | Hold on the whole planet: slow orbit, the sun breaking over the limb (shafts on high), the Moon in frame. Card **"PHASE 3 — THE WORLD"**. News: "Void entity visible from orbit — global emergency declared". | Chord swell; precompile food and threat meshes |
| 11–14 | **The plunge** | Log-zoom back down to the T1 camDist, with the world turning so the hole is at the top. Control returns with the arrow pulsing at Port Ardent. | `state.slowmo = 1`, `state.phase = 3`, `planetMap.start()` |

`?planet` runs the same setup without the cinematic (like `breakout(true)`): build the town as now, bake (loading line),
dispose the town, place the hole at `startDir` at r₀ (or `?r=`), and set the tier from r.

---

## 8. Balance and bot testing

- **Bots on the planet:** `humanBot` and the greedy bot work unchanged through the duck-typed surface (§2.1). They
  target `planet.entities` in local coordinates, follow `__nextSettlement`, and sidestep rings. Additions:
  - **Rings:** nuke rings get an "inner gulp" flag; the greedy bot dives for it, the human-like bot does so 1 time in 3.
  - **Walls:** the bot reads the "Too tall" hint as "go around": `__botDbg` counts wall slides.
- **`__planetSuite(n, secs, who)`** (bot.js, after `__regionSuite`): fixed seeds `?planet&bot&seed=N`, one line per run.
  It prints tier times, land %, the cause of death, and the growth ledger extended with `land`, `meal`, `nuke`, `rival`,
  `space` and `fallout` losses.
- **`__planetLadder()`:** samples 20 random spots per tier and asserts ≥ 3 meals in 0.3–0.95 r within 25 r, ≥ 1 bigger
  item within 15 r, and no 1.3× size gap empty between 0.1 r and 1.6 r. Run in CI-style headless with `tools/botrun.mjs`
  (its query string takes `&planet`).
- **Headless runs:** `botrun.mjs` calls the town bot `__runBot`, and the region needed `__regionBot`, so Phase 3 adds
  `__planetBot(seconds)` (bot.js, the `__regionBot` loop over the planet), and botrun.mjs gains a 4th argument
  `who = town|region|planet` to pick the entry. With `?planet&bot`, the worker bake and `planet.build()` finish
  **before** `#menu` is shown, so the bot never starts on a half-built world. The bot loop steps frames back to back:
  only visuals may be sliced or async (patch meshes, city maps, mask uploads). Gameplay state (`heightAt`, the bite map,
  food spawn) is synchronous. Then `tools/balance.mjs '&planet' 1800 8 planet` (balance.mjs forwards the argument).
- **Targets:**
  - human-like bot: Phase 3 in 18–26 min on ≥ 6/8 seeds; each tier 3–5 min; no tier > 7 min.
  - greedy bot: ≥ 14 min (the floor).
  - careless bot: sealed at least once on ≥ 3/8 seeds.
  - mercy cap triggers < 2 times per run.
  - ≥ 1 nuke swallowed per run (human-like).
- **Checkpoint cost:** a Sealed loss offers "Retry tier N" (the bite map is restored from an in-memory `rem.slice()`
  taken at the tier-up; r = floor; belly full; half the tier's dust kept) or "New run". The snapshot is 6 MB, in memory
  only: closing the tab ends the run.

---

## 9. Build order (each step ends in a commit and is testable on its own)

**Pass 1: vertical slice** (planet, hole on the sphere, ascension, minimap, 3 adversaries). Shippable: a short planetary
epilogue that ends at T3 with "to be continued" if the later steps aren't in.

| # | Step | Test |
|---|---|---|
| 1 | This design | — |
| 2 | `src/noise.js`: move `makeNoise` and `smooth` out of terrain.js, add `noise3/fbm3/ridged3` | Screenshots identical (`tools/shot.mjs`); `__regionSuite(2)` unchanged |
| 3 | `planetgen.js` + `planet.worker.js` + the globe and `planetMaterial` (land, ocean, lighting, night lights), with the **`?planet=view`** debug orbit camera | A lit globe with continents, ~29% land; bake < 3 s (console); 60 fps |
| 4 | `planet.js`: `holeQ`, `moveHole`, the leapfrog patch, the §2.7 fixes (far/near, sky follow, fog null, shadows off, clamps), `P3.speed/turn/pitch`, **`?planet`** start at r₀ by the coast | Drive for 2 min over coast and mountains: no swimming, no seams, no pole flip (`?planet&view=pole` start); `__perf` has no long tasks |
| 5 | `bite.js`: the bite map, chew, credit, land %, wall/drag/feast, the wound look (globe + patch fine trail) | `__planetLand()` drops as you eat; a mountain walls at 1.4 km and gives at 4.4 km (`?planet&r=4500`); the credit-rate calibration (§2.5) holds at 1.4 / 10 / 100 km; a parked hole stops crediting once its disc is eaten |
| 6 | `food.js` (T1–T3): hierarchical spawn, the skyline kit, swallow + crumble, belly/decay `P3`, tier goals + arrow, hunt mode, `__planetLadder()`, `__planetBot` + the botrun/balance `who` argument | Ladder check passes on 8 seeds; the human-like bot climbs T1 → T2 |
| 7 | `planetmap.js`: the GPU mini globe + overlays + land gauge | WebGPU **and** `?webgl`; ≤ 0.3 ms GPU |
| 8 | Ascension cinematic, `PHASE3`/`?nophase3` gating, `bankRegion`, checkpoints + Sealed | Real cinematic via `__ascend(false)`; worst frame ≤ 200 ms; `__regionSuite` still reports wins |
| 9 | `threat.js`: DEFCON director + bombers (`jetStrike` scaled), ICBM nukes (arc, ring, mushroom, fallout, **swallow**), kinetic lances | `?planet&defcon=2`: telegraph ≥ 1.5 s locked; mercy cap logged; a nuke swallow pays |

**Pass 2: scale and adversity** (the full 5-tier campaign).

| # | Step | Test |
|---|---|---|
| 10 | Tiers T4–T5: globe-only switch, `hole.capMode` + shader cap, pitch/E ramps, tier-up beats + drafts, space food (satellites, rockets, ISS) | `?planet&r=150000` and `r=900000`: the cap reads, 60 fps; tier-up switch under the slow-mo, no hitch in `__perf` |
| 11 | Visuals: atmosphere shell, clouds + shadows, stars + Milky Way, Moon, ocean glint, wound strata/mantle, terminator, shafts | A/B screenshots per tier in `docs/screens/phase3-*.jpg`; GPU cost per feature with `?off=` flags |
| 12 | Adversity: fleets + cruise missiles, AA belts, MIRV, orbital laser, tsunamis, volcanoes + Magma Surge, the Aegis boss, planet rivals (`rivals.js` planet mode: quaternion positions, chewing; Maw, World-Eater) | `__planetSuite(4, 1800)`: every unit appears in a run; deaths come only from Sealed or a bigger rival |
| 13 | Finale (Moon, collapse, void star), results/legacy, NG+ entry, star challenges ("Swallow 5 nukes", "Eat the Moon") | `?planet&r=1500000&land=0.89` plays the Moon break-up and reaches the end card |
| 14 | Balance pass (§8 targets), BALANCE.md section | Suite table in docs |

**Pass 3: models, audio, polish, perf.**

| # | Step | Test |
|---|---|---|
| 15 | 16 models (§6.6), pack `planet`, gentle loading during Phase 2 | Gallery review beside each other; `npm run optimize` |
| 16 | Audio bus, sub drone, choir pad, delayed booms, space lowpass | Listen-through of the ascension and a nuke swallow |
| 17 | Perf pass on the real device (PERFORMANCE.md method: visible window, `nowatch`, WebGPU + WebGL2, high + low) + a premium visual pass + README screenshots (crediting Hole.io as now) | Budgets in §6.7 met; PERFORMANCE.md "Phase 3" table |

---

## 10. Risks and cuts

| Risk | Mitigation |
|---|---|
| **Patch ↔ globe seams and swimming** (two geometries, an exaggeration that changes, the leapfrog) | Real heights per vertex with E applied in the shader; the patch skirt + a globe discard disc; cross-fade only between patches built from the same function. Step 4 tests it before anything else is built on top. |
| **Pacing collapse at the ends** (land % flat until T4, then all of it in T5; T1 starved if food density is off) | Tier goals carry T1–T3; `__planetLadder` and filler spawns guarantee food; `G_land` per tier is the main knob; hunt mode from 97%. Bot targets per tier, not just per run. |
| **First-sight shader builds / long tasks** at ascension and tier-ups (PERFORMANCE.md's open issue) | Few new pipelines by design: one `planetMaterial` for globe, patch and minimap; instanced food per kind; precompile under shots 2–4; one-off switches only under slow-mo. |
| **CPU cost of the bite map at large r** (130k texels under the disc) | 40k texels a frame round-robin; dirty-face uploads ≤ 10 Hz; a 64² summary for hunt and the minimap. |
| **Readability at planetary scale** (attacks and food too small to see, night-side play) | Readability scale for every adversary, edible/bigger edge tints, rings sized in r, minimap arcs with an ETA, rim glow + city lights at night. |
| **Scope** | Pass 1 alone is a shippable epilogue. Cuts in order, if needed: tsunamis → volcano eruptions → MIRV → orbital laser → Moon finale (keep the void star) → ice-cap credit bonus. |

---

## 11. Step 6 as built (food, eating, goals, bot)

> Food, goals and the bot are superseded by §12: food.js is off (built only with `?food`) since R1 and is deleted in R4. The ground pass stays.

- **`src/food.js`** (`Food`, owned by `PlanetGame.food`, reads `window.__planet.food`): the §4.2 quadtree (levels with s_L in [3.2 r, 48 r], 8 item slots per
  cell, radius log-uniform in [s/48, s/16] skewed up, window 10 r + 2 s capped at 40 r), item kinds from biome / habitability / sea: **settle** (village / town /
  city / metro, the skyline kit), **forest** (tree instances + canopy decal), **ship / fleet / rig** (GLBs at readability scale), **silo** fields (GLB grid).
  Records live in `food.recs` (Set): `{ dir, tier = radius m, x, z, d (local azimuthal-equidistant), kind, name, label, alive, falling, vis, goal, pop, ... }`.
  Only items within 10 r (the patch) get instances; the rest are logical. `food.eaten` (Set of item hashes) is the persistence.
- **Skyline kit:** one `InstancedMesh` (26k boxes high / 12k low, 25-instance chunks), box = podium + shaft in one 20-tri geometry, per-instance
  `aShape = (podium fraction, shaft width, palette + seed, floors)`; walls from 4 palettes (modern glass, old stone, whitewash, brick), window grid +
  night lights from the planet sun (`uSun`), footprint decal and woods canopy painted into two 512² maps in the patch's space (`globe.urbanTex / woodTex`,
  repainted on every patch commit through `W.onPatch`). `scene.environmentIntensity = 0.14` on entering Phase 3 (the town's IBL washed dark albedos out).
  The painted town discs (`townLayer`) are gone from the patch shader; the bake's night-light blobs fade out up close.
- **Eating:** an item is edible when `tier < 0.95 r`; it falls when `d < r - 0.5 tier` (also if it has no instances). Boxes crumble over 1.5-3 s on the CPU
  (pancake, sink, slide to the hole, `≤ 2000` writes a frame), dust rings from the rim and the plume, shake / hitstop per §5.3, `sfx.gulp / bigGulp`
  pitched by tier, news line, `hole.shockwave()` from 0.5 r. Growth: `dA = π tier² · 0.17 · P3.growth[tier] · growthShare` (crumbs `× 0.4`), belly
  `+ dA / (area · 0.06)`; decay fed 0.1 %/s, starving 0.8 %/s, floored at 0.7 × the tier floor until the Sealed loss exists.
- **Ladder** (every scan): ≥ 3 meals (0.3-0.95 r) within 25 r, ≥ 1 bigger (1-1.6 r) within 15 r, plus (pacing) ≥ 1 meal within 9 r and ≥ 6 real
  meals (0.4-0.95 r) within 14 r: fillers placed 3-14 r ahead (`food.rich`, `food.dens` are the knobs). `__planetLadder()` samples 20 spots per
  tier (random sizes in the tier, two in three on land, never on a wall): 360/360 over the last runs (three seeds), fails only on peaks.
- **Goals** (`food.goalsByTier`, `food.settlements`, `food.nextGoal(hole)`): T1 four towns between the landing and the coast city (`Port ...`, ρ 4.2 km),
  T2 four cities (60-450 km around it, home nation) + the nation capital (17 km), T3 three other capitals (26 / 36 / 50 km). The HUD arrow
  (`edgeArrow('town', ...)`) points at the nearest edible one, orange with "grow to X km" when none fits; "Goal cleared" card, news and a perk draft.
- **Pacing knobs** (`P3`, bot runs `__planetBot(1500, 'human')` from the islet, seeds 7 / 3 / 11): growth `[0, 1.7, 1.1, 1.0, ...]`, `gLand` T3 0.022, sea
  `0.85 speed / 1.1 drain`. T1 3.3-4.2 min, T2 3.0-3.4 min, T3 2.8-6.4 min; the greedy bot T4 at 9.7 min. The doc's 0.8 / 0.75 / 0.7 growth left the bot
  at 1.4 km after 10 min: its bites (0.3-0.5 r items) were 1-2 % each, one every 12 s.
- **Bot / tools:** `window.__planetBot(seconds, who)` (bot.js; `who` = `'human'` or `'greedy'`), `tools/botrun.mjs` 4th argument `planet`, `tools/balance.mjs
  '&planet' 1800 8 planet`. Debug: `__planet.look(i, dist, r, bearing, tier)`, `.crumb(i, tier, dist, r, frac)`, `.lookKind(kind)`, `__P3`.

### Premium ground pass (T1-T3 close ground)

The Phase 3 ground was a saturated rectangle quilt with black hedges, flat light and grey discs under the cities. Now:
- **`src/groundtex.js`** bakes six small tileable textures once on the CPU (~100 ms): `fields` (periodic Voronoi parcels: id, distance to the
  hedge, crop rows, hedge type; 9 km tile), `canopy` (stands / clumps / crowns, 1.5 km), `urban` (block grid with a few missing streets, alleys,
  park blocks, 0.8 km), `relief` (slopes of a fBm and a ridged fBm, 12 km), `noise` (4 value-noise scales, 20 km) and `scan` (rock normal +
  luminance and grass luminance resampled from the PBR scans in `public/tex`: one 256² fetch with 2x anisotropy; the `pbr.js` arrays were 45 ms of
  a 140 ms frame at 3 Mpx, from the 8x anisotropic compressed array fetches). Textures, not noise maths: mip-mapping antialiases hedges, rows and
  street grids into their mean colour by itself, and a fetch replaces a dozen noise calls. All are sampled in surface metres on the cube face
  (`wp = st * 5e6`), so nothing swims across patch rebuilds; the cube-face seam shows only as a fine line (gradients are clamped).
- **Colour:** natural, muted biome ramps; farm parcels use absolute crop palettes (pasture, green crop, ripe grain, plough, stubble, rapeseed)
  shifted by dryness, only where habitability x the bake's population is high, mixed 66 % so the regional hue stays; hedges are a 30-80 % soft
  darker green line; a second, 2 km parcel layer and 5-9 km stands carry the pattern up to T3. Woods are patches (wetness + stand noise, cleared by
  fields and towns), conifer / broadleaf / jungle by climate, canopy brightness from the baked texture, gone to a mean before a pixel is 60 m.
- **Relief:** the CPU heightfield is smooth below 2 km, so the shader adds baked slopes (`relief` x2 scales, warped, faded by the pixel size) and
  the rock scan's normals on top of the vertex slope (shading exaggeration `2 + 3.4/E`); `aS` per patch vertex = terrain occlusion (curvature at two
  scales) and the sun's cast shadow marched across the height grid in `patchGen` (soft, ~100-2000 m). Haze: a cheap exponential up close
  (`dist/200 km`), blended into the single-scatter shell from 28-51 km. Cloud shadows: only thick cloud, 30 % at most, only from T2 (r > 2.5 km).
- **Water:** the seabed shows through the shallows (sand -> depth colour), two fine wave octaves in metres, surf bands lapping toward the shore,
  rivers (zero crossings of a warped noise: constant pixel width, wider with the local flow value, lowlands only) and lakes use the same lighting
  (`shadeWater`). Beaches are a narrow warm sand band with a wet edge.
- **Cities:** the skyline kit got dark/light roofs with plant and parapet, a base darkening of 2.6 floors, window grids that dissolve before they
  alias, up to 520 boxes per city and taller downtown cores; a second `InstancedMesh` of soft contact-shadow blobs shares the box slots (stretched
  away from the sun by the box height, zeroed when an item starts to fall); crumbling boxes that reach the void drop instead of hovering. The
  ground under a town is the street grid fabric (dense core, gardens at the edge) under a ragged footprint; roads between towns are thin pale lines.
- **Ships** have a foam wake (flat instanced quad per cargo / carrier / destroyer, slot = unit block + instance index) and the carrier is lifted
  with a tinted material clone.
- **Cost** (browser pane at 3.1 Mpx, same camera, interleaved A/B): farm 1.4 km 144 -> ~78 ms, farm 30 km 166 -> ~102 ms, mountain 10 km 233 -> ~95 ms
  (the old patch pattern stack was the expensive part). `?off=ground` (no baked ground), `?off=fields|canopy|urban|relief|noise|pbr|cloud|wave|atmo`
  price each part; `?dbg=1..9,12` shows albedo / normal / terrain AO+shadow / sun term / pixel size.

---

## 12. Rescale: landmass scale from the first second

User feedback: T1–T2 play like Phase 2 at 20× (skyline boxes, towns, a 1.4 km hole). The fix:
- Phase 3 starts at **r₀ = 40 km**, and the meal is **the land itself**, eaten in swaths and torn off in named chunks.
- Cities are lights.
- The campaign has 4 tiers and ends with all land eaten at r ≈ 2.4k km.

This section supersedes the conflicting lines in §0, §2.4–2.7, §3, §4, §5.1 (DEFCON floors), §6.1 (pitch), §6.3 (minimap extent), §6.7, §7, §8 (tier targets) and §9 (steps 6 and 10). Where they disagree, §12 wins.

### 12.1 Scale, tiers, camera (`src/phase3.js`)

| Tier | r (km) | Name card | camDist (km, ×LENS) | Pitch | E | G_land (ramp) | Speed (r/s) | Target |
|---|---|---|---|---|---|---|---|---|
| T1 | 40–150 | **REGIONS** | 477–1790 | 30 → 36° | 3 → 4 | 0.06 | 0.60 → 0.45 | 4–5 min |
| T2 | 150–450 | **NATIONS** | 1.8k–5.4k | 36 → 40° | 4 → 6 | 0.06 → 0.065 | 0.45 → 0.35 | 4.5–5.5 min |
| T3 | 450–1200 | **CONTINENTS** | 5.4k–14.3k | 40 → 36° | 6 → 7 | 0.065 → 0.09 (1000 km) → 0.13 | 0.35 → 0.28 | 5–6.5 min |
| T4 | 1200 → end (~2.4k) | **THE WORLD** | 14.3k–28.6k | 36 → 32° | 7 | 0.13 → 0.2 (1600 km) → 0.3 (2600 km) | 0.28 → 0.24 | 5–7 min |

- **Ramps:** `RAMP` gains columns for G and aim. G is a smooth ramp on r. The per-tier step `gLand[tier]` popped at every tier-up and flipped back whenever a mercy-cap hit dropped r below a floor. G anchors (r, G): (40 km, 0.06), (450 km, 0.065), (1000 km, 0.09), (1600 km, 0.2), (2600 km, 0.3).
- **Speed:** `P3.speed(r) = 0.6 r · (r / 40 km)^−0.22`, which is 24 km/s at the start and 585 km/s at 2.4k km. **Do not restore a constant 0.6 r/s.** The sweep (2r·v) grows with r², and at a constant 0.6 r/s T3 alone eats ~77% of the world's land in 5 minutes. The slowing screen speed is also the "mass" cue.
- **Turning:** `P3.turn(r) = 0.45 · (r / 40 km)^0.14`, which is 0.8 s at 2.4k km. The hole gets heavier.
- **The limb is in frame from the first second.** The horizon is visible iff pitch − 13° (half the FOV) − aim < acos(R / (R + camDist·sin pitch)).
  - At 40 km: pitch 30° → altitude 238 km, horizon dip 15.4°. The camera aims 4° high: `lookAt` targets 0.14·camDist screen-up of the hole, so the hole sits ~65% down the frame. That puts the top ray at 13°, so the limb and black sky fill the top ~9% of the frame.
  - The aim fades to 0 between 150 and 450 km. At 150 km and 36° the margin is +7.9°.
  - Test: `__planet.limb()` returns the margin and must be > 1° for every r ≥ 40 km (landscape).
- **Switches:**
  - The patch and the 3D hole meshes stay for T1. Patch L = 28 r = 1120–4200 km, centre spacing 5–19 km (129², sinh warp): fine as is.
  - `P3.capR = P3.patchMax = 150 km`: the T2 tier-up switches to globe-only + the shader cap, one-way, under the slow-mo.
  - Globe N stays 128. From T2 the view spans ≥ 800 km, and coasts and relief are drawn per pixel from the bake.
  - near/far keep the §2.7 formulas (near ≥ 9.5 km, ratio ≤ 1500). AO is already off for all of Phase 3 (`PlanetWorld.enter`).
- **Wound depth:** `uWoundG = clamp(0.08 r, 3 km, 60 km)`. The fixed 3 km sink was invisible from T2; at T4 the wound dents the limb. While the patch exists, `uWoundG = uWoundP` (0.6 r_build), so torn land sinks as deep as the swath (tears are not stamped into the trail).
- **End size and length:** r_end ≈ 2.3–2.5k km.
  - Sim model: dA/dt = G·2r·v·f·0.95 − 0.001·A, f = f₀·max(0.15, 1 − land), with hunt (no decay) from 97%.
  - Tier times are T1 4.2–5.2, T2 4.6–5.7, T3 5.3–6.7, T4 5.1–7.2 min: **19–25 min** for f₀ = 0.6–0.5.
  - Land eaten at the tier-ups: 0.8% / 8% / 45%. 95 → 99.5% takes 0.5–0.9 min, with the pull-in rule (§12.3).
  - T4's length is set by the land supply and the hunt, not by G. G₄ only sets r_end.

### 12.2 Height rules (`P3.depth`, `P3.wallK`)

- **Bite depth:** D(r) = **0.03 r**, decoupled from the old 0.5 r. `wallK` stays 4, so a wall is e_eff > 0.12 r.
- **T1:** at 40 km, massifs and plateaus above 4.8 km are walls. An 8.8 km summit gives way at 73 km. Ridges drag between 1.2 and 4.8 km.
- **From T2** (D ≥ 4.5 km): only the top peaks drag. Height then shows only in credit (√hcol) and the look.
- **One pass eats ≈ (2/s)·D/`chewT` ≈ 2.75–4 D:** lowlands go in one pass, massifs in 2–4. That is the "bit by bit" swath.
- `chewT` (1.2 s) and `crust` (300 m) are unchanged.
- The wall hint becomes `KM(w / (P3.wallK * 0.03))`.

### 12.3 Food is the land: units (new `src/landforms.js`)

The land is pre-cut into nested **units** on the bite-map grid. There is no per-texel label array.
- A texel's **parcel** is arithmetic on its texel coordinates: `pi = floor((i + wx) / 4)`, `pj = floor((j + wy) / 4)`.
- wx and wy are ±1.5-texel offsets, bilinear from a seeded 8-texel lattice per face (~15 ops, no noise call), so borders are organic.
- `pi` and `pj` are clamped to 0..255. Parent cells are `pi >> 2` (district) and `pi >> 4` (province).

| Level | Built from | Typical size | Left 0.1–0.9 πr² (meal) at r ≈ | Name |
|---|---|---|---|---|
| parcel | warped 4×4 texels | 1.5k km², r_eq 22 km | 23–73 km | — |
| district | 4×4 parcels | 24k km², r_eq 88 km | 93–290 km | "X Massif" (mean > 2 km), "X Ice Sheet" (ice), "X Metro Belt" (night.R > 0.6), "X Lakes" (lake share), "X Volcanic Field" (cone), else Coast / Plain |
| province | 16×16 parcels ∩ nation ∩ landmass | 390k km², r_eq 350 km | 370–1170 km | "Province of X", "X Peninsula" if coast share > 50% |
| nation | `planetgen.nation` ∩ landmass | 0.5–8 M km², r_eq 400–1600 km | 420–5000 km | "Valoria" / "the Valorian Isles" |
| landmass | connected components of land parcels (BFS across face edges, ~100 ms) | isles < 0.3 M km² … continents ≥ 2 M km² | — | "Isle of X", continent names |

**Init** (in the bite-map pass, which becomes a generator):
- Per parcel: land area, centroid, `nat` (Uint8, nation at the centroid), `comp` (Uint16), and the unit index of each level (Int32 ×3). That is ≈ 9 MB for 393k parcels.
- Each level's parcels are kept as CSR lists for tear-offs.
- Units never cross a cube-face edge below nation level.
- `bite.init` yields every 64 rows. `?planet` drains it under the loading line; the Phase 2 prebuild runs it in 3 ms slices (§7).

**Rules** (the whole food system):
- **left:** `chew` subtracts each texel's `da` from its parcel and that parcel's ancestors. So Σ left == `bite.sum` at every level (the test).
- **Tear-off (the swallow):** a unit the disc touched this frame with 0 < left < min(0.5·area₀, 0.6·πr²) tears off. The highest qualifying ancestor wins.
  - Its parcels are sorted nearest-first, and their texels are zeroed over 0.8–2.5 s (log of the area; ≤ 15k texel tests a frame ≈ 2.3 ms at 150 ns/texel, only while a tear runs, under its hitstop/slow-mo).
  - The glowing wound edge rides the wave, so it reads as land sinking toward the hole.
  - Credit uses the normal per-texel formula × `P3.collapseK` (1.0 to start: the reach is already a bonus).
  - The 50% condition stops grazed edges from tearing: you carve half, then the rest goes in.
- **Pull-in:** these tear off untouched if their centroid is within 2.5 r:
  - remnants: left < 0.5·area₀ and left < 0.08·πr²;
  - whole isles: a landmass with area₀ < 0.08·πr².
  Islets fly in and frayed swath edges get cleaned up. There is no islet hunting, and the tail to 99.5% is ~1 min.
- **Size language:** left < 0.1 πr² is a crumb, 0.1–0.9 πr² a meal, > πr² bigger. Bigger land is never a wall: you carve it down until it tears.
- **Ladder:** it holds by construction. The levels are ×4 apart in r_eq, and partly eaten remnants fill the gaps. `__planetLadder()` takes 20 land spots per tier and asserts:
  - ≥ 3 units with meal-sized left within 12 r;
  - ≥ 1 bigger unit or wall within 15 r.

| Tier | Smaller (crumbs) | Meals | Larger (the fear) | Sky |
|---|---|---|---|---|
| T1 | parcels, islets, city lights | districts, islands, fringes | provinces, massifs > 0.12 r (walls) | ICBM arcs, bomber lines |
| T2 | districts | provinces, big islands | nations, the Maw (1.3×, from 250 km) | LEO sats + the ISS (edible from 420 km), rockets |
| T3 | provinces | nations, archipelagos (≥ 3 isles in one province cell: a naming-only group that tears as one) | continents, the Aegis ring | lances, laser platforms |
| T4 | isles, nation remnants | continent remnants (a continent tears at < 0.6 πr²: 7.5 M km² at 2000 km) | World-Eater (1.4×), the Moon (r 1737 km) | the cracker, Moon fragments 0.3–0.9 r |

**Cities:**
- No meshes.
- By day, the patch's urban fabric comes from the bake: `urbV = sstep(0.35, 0.8, night.R)` replaces `mapV.r`, and `globe.mapTex` painting goes.
- By night, the bake's lights already go out with the bite map.
- **Population is per texel:** `pop += da · night.R(texel) · popK`, with popK = 8.1e9 / Σ(night.R·area) at init. The counter ends at exactly 8.1 B. `bite.bake.night` is already in memory.

**`food.js` is deleted** (git keeps it):
- Gone: the skyline kit, trees, contact decals, GLB units, wakes, fillers, settlement goals, `paintUrban/paintRoads`.
- `H5`, `rng` and `nameOf` move to landforms.js.
- The `UNITS` GLB table moves to threat.js (step 9): fleets, AA and silos are T1 adversaries at readability scale (≥ 12 px), edible, not ladder food.

**Goals** (R4 as built; a chain of five, each cleared when its units are ≤ 1% left or torn off, then card, news and a draft; tier-ups stay on size):

| # | Goal | Typical tier | HUD goal line |
|---|---|---|---|
| 1 | the home province (the province holding `P.city`) | T1 (~1.2 min) | "Province of Ardent — 38% eaten" |
| 2 | the three nearest provinces ≥ 50k km² | T1 (~4 min) | "3 provinces — 61% eaten" |
| 3 | the home nation ∩ home landmass | T2 (~7 min) | "Nation of Valoria — 61% eaten" |
| 4 | the five nearest nations ≥ 0.3 M km² (chosen when the goal starts) | T3 (~12 min) | "5 nations — 40% eaten" |
| 5 | the world: land ≥ 99.5% (the win) | T4 | "The world — 81.2% eaten · 3/6 continents"; from 97%: "Hunt: 1.2 M km² left · Continent of Istia" |

- A continent is **not** a tier goal: seed 7 is one supercontinent (78% of the land). Continents are a counter (`state.continents`, the "3/6" in the T4 line) and the swallow news.
- **Arrow:** `edgeArrow('town', …)` points at the nearest standing parcel (left > 1e-3 km²) of the goal's open units, scanned at 2 Hz (`Landforms.target`), converted into the hole frame like `unitsApi.steer`; it hides inside 3 r. It is always green: land is always edible.
- **Hunt** (≥ 97%): the arrow and the bot target the landmass with the most land left, scored `left / (d + 2 r)`; no decay.
- **Minimap:** the goal's open units are a gold stipple of their standing parcels (it recedes as you eat), a dashed ring at each centroid (radius r_eq), a pulsing white ring + % at the arrow target, an edge chevron when it is off the disc or on the far side.

### 12.4 Growth, belly, pacing (`P3`)

- **Growth:** dA = G(r)·credit. The meal knobs `growth[]`, `crumbGrowth` and `crumb` go.
- **Belly:** drains 1/30 s and is topped up by dA / (0.06·A). Growth is ~1%/s on land, so the belly stays full there and drains at sea: a 30 s crossing at T1 is 720 km.
- **Decay:** 0.1%/s fed, 0.8%/s starving, none in hunt. The floor is 0.7 × the tier floor until Sealed exists.
- **Income targets** (ledger `land`, `tear`, `pull`, `other`): swath ≥ 65%, tear-offs + pull-in 15–30%, nukes/rivals/space ≤ 10%. The G anchors are swath-only sim values. If R5 measures a tear share > 30%, lower the anchors by that share.
- **Bots:** human-like 18–26 min on ≥ 6/8 seeds, each tier 4–7 min; greedy ≥ 15 min. Land % at the tier-ups ≈ 1 / 8 / 45 (±50%).

### 12.5 Feel of power at this scale

| You swallow | Look | Hitstop / trauma / slow-mo | Audio |
|---|---|---|---|
| a swath (continuous) | a dust curtain off the leading rim (`Debris.dustRing` in fx.js, every 0.4 r of travel, size 0.5 r); the wound's glowing edge trails the hole | — / 0.05 rolling / — | sub drone gain ∝ credit rate (a grind) |
| a district or island | the sink wave (nearest-first zeroing) behind a molten edge; shock ring at the centroid (r_eq ×1.5); dust plume | 0.06 / 0.15 / — | crack + gulp |
| a coastline | the sea's meniscus at the wound edge flares white and a foam band runs along it for 1.5 s (`uShock` age lights it) | — | surf roar |
| a province | as a district + an ash column (sprites, 2 layers) + clouds pushed out radially inside the ring | 0.08 / 0.3 / — | rumble, delayed by distance (§5.3) |
| a nation | a 2 s wave; its city lights die in the wave; news "Valoria is gone — 212 M swallowed" | 0.12 / 0.45 / 0.5× for 0.8 s | choir hit + sub drop |
| a continent | a 2.5 s wave over thousands of km; the limb dents (60 km wound); a ring circles the globe; camera +15% pull-out for 3 s | 0.2 / 0.6 / 0.4× for 1.5 s | silence → organ swell → boom |

**Shader additions** (`planetMaterial`; the meshes are hidden in capMode, so everything from T2 must live in the shader):
- `u.uShock[0..3]` (vec4: dir, start angle) + `u.uShockT` (vec4 start times): a lilac band expanding at 1.5 r/s (angular) for 1.2 s, plus cloud displacement inside it. In capMode, `hole.shockwave()` writes slot 0.
- **Cap depth:** the void samples its spiral at `dd·(1 + 0.6·(1 − dot(V, n)))` (parallax), and the rim band's width grows with the credit rate. Today's cap reads as a sticker (phase3-orbit-200k.jpg), and it is the hole for three tiers.
- Torn edges threshold `rem` with the existing `dn` fractal, so the 10 km texel stairs read as torn rock.
- No new texture: the bite map stays R8.

**Planet GLB pack:** icbm + mushroom_cloud T1–T3; bomber, carrier, destroyer, aa_battery T1; rocket + launch_pad T2–T3; space_station,
kinetic_sat T2–T4; laser_platform T3–T4; aegis_platform the T3 boss (r ≈ 800–1200 km); cracker T4; missile_silo as launch sites only;
cargo_ship and oil_rig cut as food.

### 12.6 Adversity, minimap, HUD (amendments to §5–6)

- **DEFCON floor by r:** 5 below 60 km, 4 from 60 km, 3 from 150 km, 2 from 450 km, 1 from 1200 km.
- **Rings** stay in r (blast 2 r, swallow 0.5 r); labels show km ("ICBM — 80 km blast — 4.2 s").
- **Windows:**
  - T1: bombers, fleets, AA, tsunami, volcano.
  - T1–T3: ICBM. T2–T3: MIRV. T2–T4: lances. T3–T4: laser.
  - T3: the Aegis (6 platforms of 0.3 r at 300 km altitude, ring 3 r → r).
  - T2–T3: rockets. T4: the cracker.
  - Rivals: the Maw at T2, the World-Eater at T4.
  - The mercy cap and the Moon (90%) are unchanged.
- **Minimap:**
  - `extent(r) = clamp(25 r, 1000 km, 1.07 R)`: the hemisphere from ~270 km.
  - The goal is a ring at the goal unit's centroid (radius r_eq) with its %.
  - `update()` takes `{ goal }` instead of `food`. The land gauge stays.
- **HUD:** one goal line in every tier (the §12.3 table) replaces the `tier < 3` / `tier > 3` toggles; size pill "REGIONS · 52 km ·
  S 4.72"; `#eaten` "1.24 B swallowed".

### 12.7 Build steps (each a commit; the bot rewrite lands with the units so the tier times can be measured)

| # | Changes (file → function) | Test |
|---|---|---|
| R1 | **Retune.**<br>• phase3.js: `TIERS` (4), `RAMP` + G/aim columns, `P3.g(r)`, `speed`, `turn`, `depth` 0.03 r, `capR`/`patchMax` 150 km, `startR` 40 km.<br>• planetgame.js: `step` (G ramp, wall hint), `frame` (aim offset), `debugApi.cal` (`v = P3.speed(rm)`, not `0.6*rm`), `ladderTest` (bounds from `TIERS`), `debugApi.limb()`.<br>• planet.js `update`: `uWoundG`.<br>• bot.js `__planetBot`: stop on the win or `seconds`, not `tier >= 4`. | `?planet` lands at 40 km on a coast with the limb in frame. 2 min of driving: no swim, no seams. `?planet&r=160000`: cap mode at 60 fps. `cal(40e3 / 150e3 / 600e3)` within ±20% of G·2r·v·f·√h. |
| R2 | **Units.**<br>• landforms.js (new): parcel warp, parcel tables, BFS landmasses, unit tables + CSR, names.<br>• bite.js: `init` → generator (yield every 64 rows); `chew` updates parcel/ancestor `left` and `pop`.<br>• Callers: `PlanetWorld.create` drains the generator; `debugApi.cal()` and the Sealed checkpoint (§8) also save/restore parcel `left`, unit `left` and `pop`.<br>• `__planetUnits()` (debug). | Σ left == `bite.sum` per level (±0.5%); every unit nests in its parent; init ≤ 400 ms total, no slice > 4 ms. |
| R3 | **Tear-off + pull-in + feel.**<br>• planetgame.js: `swallow(unit)` (§12.5 table) beside the old `eat` (Food stays in the loop until R4, so the bot keeps running).<br>• planetglobe.js: `uShock`, cap parallax, `urbV` from night.R.<br>• Tear-off and pull-in stay off during the R6 surge. | Into an island ≤ 0.6 πr²: it tears in < 1.5 s. District tear-offs at 40 km, province tear-offs at 400 km. Tear CPU ≤ 2.5 ms a frame while one runs, 0 otherwise (`__perf`). |
| R4 | **Goals, HUD, minimap, bot; Food out.**<br>• planetgame.js: `Food` removed from `begin`/`step`/`eat`/`hud` and from `debugApi` (`look`, `lookKind`, `crumb` go); `git rm src/food.js`.<br>• landforms.js: `goals`, `nextGoal`.<br>• planetgame.js `hud`.<br>• planetmap.js: `extent`, goal ring, `update({ goal })`.<br>• bot.js `planetSteer` and `__planetBot`'s log (no `food`): score districts within 8 r by left / (d + 2 r) with a goal pull; keep the stuck/wall sidestep.<br>• `__planetLadder` unit-based. | Ladder passes on 8 seeds. `__planetBot(1800, 'human')` logs every tier. |
| R5 | **Balance.** `tools/balance.mjs '&planet' 1800 8 planet`; tune the G anchors, the speed exponent and `collapseK`; table in BALANCE.md. | The §12.4 targets on ≥ 6/8 seeds. |
| R6 | **Ascension (with step 8).** The surge rips outward: r 60 m → 40 km over 3 s. Each frame `bite.chew` runs at the surge radius with its credit discarded, so the first wound is the islet + ~25 km of coast and shelf. The pull-out ends in the plunge to the T1 camera (477 km, 30°). | `__ascend(false)`: the wound is visible from orbit; worst frame ≤ 200 ms. |

**Scope removed:** `food.js` (~900 lines) and the skyline-box budgets (§6.7), the §4.2 quadtree food, the `P3` meal knobs, T5 (merged into T4), the 110 km switch, the debug look/crumb shots.

### 12.8 As built (R1-R3)

Commits "Phase 3 R1 / R2 / R3". Screens: `docs/screens/phase3-scale-*.jpg`. Food is constructed only with `?food` (A/B); in R1-R3 the HUD shows "Land eaten x%" and the population counter (`state.pop`, 8.1 B at the end), the goal arrow waits for R4.

**R1 (retune).**
- `phase3.js`: 4 tiers; `VIEW` ramp (pitch, E, aim), `P3.g(r)` (§12.1 anchors x `gScale`), `speed`, `turn`, `depth = 0.03 r`, `capR = patchMax = 150 km`, `startR = 40 km`. `?planet` lands at 40 km on the coast, 60 fps in cap mode at `?r=160000`.
- Camera: **the §12.1 limb arithmetic missed one thing**: the camera sits `cos(pitch)·camDist` behind the hole, so the planet's horizon is tilted away from the render horizontal (the limb is at `atan2(R + hc, hz) − asin(R / |C|)` below it, e.g. 12.2° at 40 km, not 15.4°). With 30° / 4° the limb was off the top of the frame. Built: **pitch 25°, aim 7°** at 40 km (aim 7 → 4 at 150 km → 0 at 450 km), `lookAt` 0.14·camDist·aim/4 above the hole; the hole sits ~70% down. `lead` cut to 0.025 camDist (it pushed the hole off the bottom). `__planet.limb(r)` implements the right formula: 3.8° at 40 km, 2.2-2.8° at 100-150 km, ≥ 3.5° from 450 km, 11° at 2.4k km (all > 1°).
- `far` also covers the atmosphere shell's far wall (`1.15·(d_horizon + 0.2475 R)`); without it the glow was clipped. `uAtmo` (density x) and `uAtmoH` (outer-glow cut) ease 0.26 / 0.35 → 1 over 50-450 km: at T1 the camera sits inside the exaggerated shell and the ground was 70% haze; now black space over a thin limb.
- `uGroundK` (parcels, hedges, rows, street grids, rivers, lakes) is off by 14 km; new `uGroundM` (relief, woods, urban fabric) holds to 60 km and is off at 150 km (the patch→globe switch). Rivers were black scratches at 477 km. Value-noise tiles (`nz`) show their lattice as a plaid at this scale: the urban mottle and woods stands use gradient fractals instead.
- `uWoundG = 0.6 r_build` while the patch exists, else clamp(0.08 r, 3, 60 km), eased. `cal(r)` runs 8 r over the best land line found (≥ 90% land if the world has one): credit / (2 r v f √h, plus the first-frame disc) = 0.98 / 1.00 / 1.02 at 40 / 150 / 600 km. Growth at 40 km is 1.7%/s of area at gScale 1.
- Bot: `__planetBot(seconds, who)` stops at 99.5% land or the time; the stand-in steering scores 24 bearings x 6 rings by land left (R4 replaces it with unit scoring). `__planetSteer`, `__planetTT` (tear/step/hud helpers), `__planet.reset()` (back to the start in one page load, for sweeps).

**R2 (units).** `landforms.js` + `bite.js`.
- **Clarification:** every level's key carries the parcel's nation and landmass (district = (cell, nat, comp), province the same, nation = (nat, comp), landmass = comp), so units split at borders and straits and nest by construction (`nestingBad = 0`). District and province cells are 4x4 blocks in smoothly warped grids (province cell = a function of the district cell), because plain 16x16-parcel provinces were 576 km squares. Units never cross a face edge below nation level; BFS across faces goes through `faceDir` + `texel()`.
- Arrays: parcel `left` and every unit's `left` / `area0` are Float64; `pk(f, i, j)` is the one texel→parcel function (init, chew, tears). `bite.gen()` yields every 3 ms (time-sliced, not by rows); `init()` drains it. **Init 335 ms total, worst slice 3.7 ms.** Seed 7: 121k land parcels, 9.0k districts, 959 provinces, 57 nation units, 21 landmasses, `popK` 130.3 people per (km² x night light). **Seed 7 is one supercontinent** (Continent of Istia, 117 M km² = 78% of the land) plus 5 continents of 2-18 M km² and 15 isles: the §12.3 "home continent" T3 goal is far bigger than a tier of play there; R4 may want a finer "continent" cut (or goals by nation).
- `chew` subtracts `da` from the parcel and its 4 ancestors, adds `pop`, marks the parcel for the tear check. Σ left == `bite.sum` at every level (|err| ≤ 1e-11 over a 560 s game with 3k tears), also across `cal()` (save/restore covers parcel / unit left, torn flags, pop).
- `bite.biteMs` 0.05 ms at 50 km, 0.4 avg / 1.0 max at 960 km (texel budget 14k, round robin).
- `__planetUnits()`: `check()`, `counts()`, `biggest(L, n)`, `nearest(L, maxKm2, minKm2)`, `goto(L, u, off, bearing)`, `steer(L, u)`, `jobs()`, `stat()`, `info(L, u)`, `init`.

**R3 (tear-off, pull-in, feel).**
- Tear check on the units the disc touched (highest qualifying ancestor wins; the parcel counts too: dozens a minute that clean up the swath edge); pull-in scan every 0.35 s over the district / province / nation / landmass tables. A tear sorts its standing parcels nearest-first and sinks them as a wave (T = 0.8-2.5 s by log area) in three stages (x0.55, x0.36, 0 at 0.11 s steps) so the 36 km blocks slide down instead of popping; one take-texel path (`shrinkAll`) keeps left / pop / credit / the ledger (`tear`, `pull`) in sync; 15k texel visits a frame across all jobs; the dirty-face upload goes to 30 Hz while a tear runs. **Island of 507 km² at r = 40 km: 0.77 s; district tear at 40 km, province tear at 400 km (cap mode); tear CPU max 0.4 ms a frame (0 with no job); `startTear` 0.7 ms for a 4.5k-parcel nation, 1.7 ms for 10 M km² (8k parcels, the most the 0.6 pi r^2 rule allows).**
- Feel (`PlanetGame.swallow`, class by level and size vs the hole: parcel/speck 0, district/isle 1, province 2, nation 3, continent 4): shock ring (`PlanetWorld.shock()` → `uShock[4]` + `uShockP[4]` (start time, speed, life, strength; added to the doc's `uShockT`), band + clouds cleared inside), dust ring + 2-3 ash layers (Debris puffs at the centroid, none over the hole), hitstop 0.06 / 0.08 / 0.12 / 0.2 (max, one per 1.5 s), shake 0.15 / 0.3 / 0.45 / 0.6 (max), slow-mo 0.5x (nation) / 0.4x (continent), camera +15% for 3 s (continent), news with the population, sfx `tear / rumble (delayed by distance) / choir / swell`. Effect tokens (2/s, 3 banked) keep a cascade of tears from becoming smoke; the swath's dust is an arc lifted off the leading rim every 0.4 r. Not built: sub-drone gain (grind), the coastline foam band and surf roar on coasts.
- Shader: the hole is the **spherical cap at every size** (`?hole3d` brings the Phase 1/2 mesh back for T1), drawn as a real shaft (a ray down the tube meets a lit wall crescent or the swirling floor; `uRim` widens the lip with the credit rate), the ground stays up under the cap (`holeK`), the atmosphere does not veil it; torn edges (`dn` fractal threshold on `rem`); `urbV` from `night.R` (patch only, mottled; no street grid above ~50 m a pixel).
- Interim pacing (R5 retunes on the R4 bot): G anchors 0.035 (40 km) / 0.04 (150 km) / 0.055 (450 km), then the doc's 0.09 / 0.2 / 0.3 (`P3.gRamp`, `P3.gScale`), `collapseK = 0.35`. At the doc's 0.06 / 0.065 with `collapseK = 1` the bot had a 60% tear share and won in 9.4 min at r = 2.3k km; with 0.06 / 0.065 and `collapseK = 0.35` it reaches T2 at ~100 s and T4 at 7-10 min, which is faster than §12.1. Stand-in bot, seed 7, 3 human runs (one page load, after `reset()` was fixed to re-arm the pull-in): T2 at 167-289 s, T3 at 369-579 s, T4 at 615-866 s, tear share 26-38%, pull ~0-1% (the stand-in bot is rarely within 2.5 r of a remnant). One run won at 23.5 min; two stalled at 91% / 96.5% at 45 min: the bot cannot hunt specks and starves in the tail (fed / starving decay shrinks the hole to 0.3-0.9k km; no decay in the hunt, from 97%; the tier floor uses the highest tier reached). R4's hunt arrow and unit bot are the fix; the numbers above are the bot's, not a player's.
- Perf: 60 fps at 40 km, 125 km, 450 km, 1500 km (also at pixel ratio 2.5: 44 fps at 40 km, 60 fps in cap mode); `?webgl&q=low` boots and plays. No long tasks after boot.
- Known issues / next: units at T2+ are mostly smaller than the hole, so a tear shows as land sinking next to the cap and a ring, not a collapse you can look at; the T1 city mottle reads as tan farmland patches; the wound floor's vein pattern is busy; tears at the hole's own position show only the ring.

### 12.8b As built (R4)

Commit "Phase 3 R4". `src/food.js` is deleted (git rm); `H5`/`rng`/`nameOf` live in landforms.js; `?food` and the debug `look` / `lookKind` / `crumb` are gone.

- **Goals, HUD, tier-up:** `Landforms.makeGoal / progress / done / target` (landforms.js), `PlanetGame.goalTick` (2 Hz): chain above, banner "Goal cleared", news with the population ("… has fallen - 1.24 B swallowed so far"), `ctx.draft()` (note: it offers the Phase 2 perk pool, most of it meaningless on a planet; only Swift, Slow Burn and the like do anything). Win: `state.won`, banner "THE WORLD IS EATEN". HUD: size pill, belly, "Land eaten 12.4% · 1.24 B", goal pill, DEFCON; the pills do not wrap inside themselves any more (`#hud.p3`, they wrap as whole pills on narrow screens, the goal on its own row at phone width). Tier-up: hitstop + slow-mo + name card (REGIONS / NATIONS / CONTINENTS / THE WORLD) + news with the population. `News` shows the counter in billions from 100 M.
- **Minimap:** `extent = clamp(25 r, 1000 km, 1.07 R)`; goal stipple / rings / chevrons (above); the wound is a dark ember scar with a hot rim and a pulsing halo (8 wider taps of the bite map) so a thin swath still glows; the % gauge and the `1.24%` chip stay. Checked at 1085 px, 800 px and 390 px (124 px map) and on `?webgl`.
- **The accounting bug R4 found:** `chew` and `shrinkAll` computed the credit and `left` from the float `d` but stored the 16-bit rounded `rem`, so every parcel kept ~0.003 km² of phantom land (0.75% of the world: **99.25% was the ceiling, no bot could win**, and the "stalled at 91% / 96.5%" runs of R3 chased specks). Both now remove whole 16-bit steps (at least one) and account for exactly those: `__planetUnits().truth()` (Σ rem × area over every texel) agrees with `bite.sum` to 1e-12.
- **Bot** (`planetSteer`): districts within 8 r (provinces from 160 km, nations from 520 km), score `left / (d + 2 r)`, ×6 inside the current goal, ×1.3 for the current target, human picks among the best 3; drives at the nearest standing parcel ≥ 0.9 r away (a swath carries on); follows the goal arrow while its target is within 12 r; hunt from 97% (the arrow's landmass); wall sidestep on a 3.5 r look-ahead plus the 3 s stuck turn. Islets: the pull-in radius is 3 r (was 2.5). `__planetBot(seconds, who)` (sync), `__planetBotAsync` (sliced, poll `__botRun`), `__planetSweep(n, seconds, who)` (rows in `__sweep`: minutes per tier, land % at the tier-ups, goal times, income shares, decay share).
- **Ladder:** `__planetLadder()` is now pure table queries (no placement): 20 land spots per tier; a spot passes with ≥ 3 meals (units with 0.1-0.9 πr² of land left, centroid within 8 r) and ≥ 1 bigger thing (a unit with > πr² left within 15 r of its rim; at T1 a wall > 0.12 r also counts). 80/80 on seeds 7, 3, 11, 1, 5, on a fresh world and after 500 s of bot play. The strict "0.1-0.9 r" reading is returned as `rEqMeals`. The Moon is drawn again (impostor on the far plane at its true angular size, 1.3° radius) but is not counted: it is rarely in frame, and above r = 1737 km it is smaller than the hole; late T4's "larger" thing is the remaining continents (some late spots would fail: the world ends with nothing larger, by design).
- **Balance** (docs/BALANCE.md "Phase 3"): G anchors 0.035 / 0.05 / 0.08 / 0.13 / 0.2 / 0.3 at 40 / 150 / 450 / 1000 / 1600 / 2600 km, `speedExp` -0.30 (was -0.22), `collapseK` 0.3, starving decay 0.5%/s (was 0.8) and faded out between 67% and 97% land (`huntSoft`). 9 of 9 runs on seeds 7 / 3 / 11 win in 18.3-23.9 min; tear share 31-38%.
- Screens: `docs/screens/phase3-hud-desktop.jpg` (Nation goal, minimap tint + wound, `?webgl`), `phase3-hud-phone.jpg` (390 px: pills wrap, goal banner).
- **Known issues:** the tear share is 31-38% (target 15-30%: 0.2 gets 23% but 29-minute games, and the swath ratio would need the G anchors up with it); T1 on seed 11 takes 7+ min and seed 5 is slow overall (25.9-28.8 min, T2/T3 8-10 min: a poor start and long crossings); r_end is 1.2-1.9k km, not 2.3k; goals are cleared late if the player ignores the arrow (the bot follows it only within 12 r); the draft offers the Phase 2 perks.
