# Handover — Variety Pack (Stage 11)

Branch: `feature/variety-pack`. All **38 new models are built, reviewed and committed** (Blender scripts, raw GLBs,
optimized GLBs + LODs, manifest). What remains is **integration, the game systems, and the AAA visual pass** described
below. Read this top to bottom once; then work the milestones in order (§9), committing after each.

> You (the cloud agent) cannot run Blender. Treat the models as final art. Every model was checked from two angles with a
> person beside it for scale, for clipping, floating parts, texture mapping and triangle budget. If a model truly needs a
> geometry change, note it in `HANDOVER-FEEDBACK.md` and move on; do not hand-edit GLBs.

---

## 1. Scope (what the player asked for)

| # | Feature | Summary |
|---|---|---|
| 1 | **City events** | One surprise per run: parade, marathon, car show, UFO landing |
| 5 | **More districts** | Fairground, airport (swallowable airliner), county fair (prize pumpkins), railway (moving train) |
| 6 | **Chain reactions** | Gas station blast, fireworks volley, water-tower flood, building dominoes, burst water mains |
| 7 | **Power-ups** | Magnet, ghost, split, surge (speed) capsules dropped by the city |
| 11 | **Star challenges** | Three goals per city type; stars unlock skins and cities |
| 12 | **City progression** | Start in Old Town only; unlock districts by clearing them |
| 13 | **Hole abilities** | Active skills bought in the shop, on a cooldown: Quake, Vortex Burst, Dash |
| 14 | **Weekly mutators** | Low gravity, everything is ducks, miniature mode, and more; seeded per ISO week |

Plus a standing requirement: **AAA "Unreal-level" look and feel** — better textures, relief, organic detail, AO, filmic
grade — **without** regressing performance (iPad is the reference low-end device).

---

## 2. Current architecture (read before touching anything)

| Area | Where | Notes |
|---|---|---|
| Renderer | `src/look.js`, `src/post.js` | `WebGPURenderer` (WebGL2 fallback), physical sky + PMREM IBL per time of day, 4K PCF sun shadows, GTAO → bloom → white balance → ACES → S-curve → SMAA → vignette/fringe/grain |
| Materials | `src/surface.js` (TSL) | One `ToyNodeMaterial` for every prop. Palette atlas decides *what* a face is; `OBJECT`/`GROUND` tables map each of the 48 swatches → PBR layer (repeat, chroma, relief). Per-object flags on `mesh.userData.toyFlags` (x tree, y building, z edible tier, w vehicle → clearcoat) |
| Scanned PBR | `src/pbr.js`, `tools/textures.py` | 16 Poly Haven layers in texture arrays (albedo, normal, RHA = roughness/height/AO), triplanar + surface-gradient normals |
| Nature | `src/terrain.js`, `src/vegetation.js`, `src/grass.js` | Heightfield countryside, procedural trees (replace `tree_small`/`tree_big`), GPU grass, shared wind |
| Quality tiers | `src/quality.js` | `low` (mobile default) / `medium` / `high`, `?q=` override; runtime fallback in `post.js` |
| Loader | `src/assets.js` `loadAll(onProgress, { packs })` | Loads `public/models/index.json`; `packs: true` additionally loads `packs.json` (**gallery only today** — see §6) |
| City | `src/city.js` | `MOODS`, tile layout (`layout()/tile()`), entities + movers (`walk`, `drive`, `wander`, `peck`, `scuttle`, `bob`), `CLONED` set (animated heroes get real clones + mixers), instanced chunks, `events` array per frame, `blocked()`, `clearAhead()` |
| Director | `src/director.js` | Heat = max(size floor `HEAT_R`, notoriety); units, barricades, tide, searchlights, snack floor |
| Main loop | `src/main.js` | Input, growth, hunger, cravings, combos, size-up `MILESTONES`, whirlpool `hole.vac`, fall events → collapse FX/hit-stop, results/finale |
| Meta | `src/meta.js` | `save` (localStorage), `UPGRADES`, `ECON` |
| FX | `src/fx.js` | `Sparks`, `Debris` (chunks + puffs, ring-buffered), `SMOKE` emitter table |
| Tools | `tools/` | `optimize.mjs`, `check-ladder.mjs`, `botrun.mjs` (headless bot), `shot.mjs` (headless screenshot), `textures.py` |
| Gallery | `gallery.html?packs` | `__sheet(names, cols, cell, dirs)` contact sheet; `window.__sheetRef = 'ped_business'` adds a person for scale |

Design rules that must survive (PLAN.md): **no dead ends** (nothing blocks movement; size ladder ≤1.3× per step; every
hostile thing is temporary or edible later), **sizes come from the manifest** (never hard-code tiers).

---

## 3. Asset pipeline changes on this branch

- `blender/build_all.py` has a `PACKS` list; build any subset with `ONLY = [...]` (index lookup is now inside the `try`).
- `blender/kit.py` gained `rope`, `bunting`, `rivets`, `scallops`, `checker`, `tag(ob, pack, **extras)`; `blob(seg=)`;
  `wheel(detail=False)` for cheap hidden/small wheels.
- Every pack model's root carries `pack` (+ feature extras, §4). `tools/optimize.mjs` writes pack assets to
  **`public/models/packs.json`** and everything else to `index.json`, so **the live game loads exactly what it did before**.
- Optional `lod: [r1, r2]` extra overrides the 25% / 8% LOD ratios (thin structures: spokes, rails, bunting).
- `tools/check-ladder.mjs` checks the base game alone **and base + each pack** (packs only appear in some cities).
  `npm run check` passes for all 9 combinations.
- **`assets-raw/` is now committed** (was gitignored) so you can re-run `npm run optimize` (e.g. different LOD ratios).

---

## 4. Model catalogue (38 models)

Columns: tier = swallow radius (m, from manifest), h = height (m), tris = LOD0 / LOD1 / LOD2.
`clone=true` → add to the `CLONED` path (real clone + `AnimationMixer`, play **all** clips). Everything else can be
instanced. Wheels/pivots sit at z = 0; pivot = bottom centre; +X is "forward".

| pack | model | kind | tier | h | tris | clips | extras / placement |
|---|---|---|---|---|---|---|---|
| events | `alien` | prop | 0.28 | 1.33 | 13.1k / 3.3k / 1.0k | — | `event=ufo`; walk shader (arms/legs swing) |
| events | `drummer` | prop | 0.35 | 1.90 | 19.0k / 4.8k / 1.8k | — | `event=parade`; walk shader |
| events | `marathon_runner` | prop | 0.36 | 1.38 | 12.8k / 3.2k / 1.0k | — | `event=marathon`; walk shader |
| events | `supercar` | prop | 2.48 | 1.47 | 37.2k / 9.3k / 7.5k | — | `event=carshow rare`; add to `VEHICLES` (clearcoat) |
| events | `classic_car` | prop | 2.79 | 1.84 | 33.9k / 8.5k / 5.7k | — | `event=carshow rare`; add to `VEHICLES` |
| events | `balloon_float` | prop | 2.90 | 9.65 | 34.7k / 10.4k / 3.5k | — | `event=parade flying mover=parade`; needs r ≥ 1.6×tier (existing `flying` rule) |
| events | `ufo` | prop | 3.10 | 2.90 | 18.6k / 5.6k / 1.9k | `lights` | `event=ufo clone rare`; beam emitter underside at local z ≈ 0.55 |
| events | `parade_float` | prop | 3.54 | 3.19 | 41.6k / 14.5k / 5.0k | — | `event=parade mover=parade`; candle flames are emissive |
| events | `finish_arch` | prop | 4.57 | 5.00 | 11.2k / 3.9k / 3.0k | — | `event=marathon`; spans a road (arch along X, mat across Y) |
| events | `show_turntable` | prop | 4.95 | 3.51 | 27.0k / 9.5k / 3.2k | `turn` | `event=carshow clone`; plate top at z = 0.36 — parent the showcased car to node `turntable_top` so it spins |
| fair | `balloon_stand` | prop | 0.75 | 3.15 | 12.4k / 3.1k / 1.0k | — | promenade stall |
| fair | `bumper_car` | prop | 0.81 | 2.70 | 6.0k / 1.5k / 0.5k | — | wander mover in a fenced rink; add to `VEHICLES` |
| fair | `ticket_booth` | prop | 0.91 | 3.72 | 6.0k / 1.7k / 1.6k | — | entrance |
| fair | `hoopla_stall` | prop | 1.61 | 3.09 | 24.0k / 6.0k / 2.2k | — | promenade stall |
| fair | `carousel` | prop | 4.44 | 6.40 | 54.0k / 21.6k / 7.6k | `spin` | `clone`; tile_fair anchor (+7.5, −7.5) |
| fair | `ferris_wheel` | prop | 7.38 | 14.9 | 31.9k / 17.6k / 11.7k | `wheel`, `gond0..11` | `clone landmark`; gondolas counter-rotate (all 13 clips must play at the same timeScale); anchor (−7.5, +7.5) |
| fair | `tile_fair` | tile | — | 6.97 | 20.9k | — | dirt + promenade loop (r 8.2–10.8), ride pads at the anchors, festoon masts on the (−12.5,−12.5)/(12.5,12.5) corners |
| airport | `baggage_tug` | prop | 3.32 | 2.14 | 31.1k / 7.8k / 3.4k | — | `mover=apron`; tug + two carts |
| airport | `control_tower` | prop | 3.77 | 20.6 | 14.2k / 5.0k / 1.7k | `radar` | `clone`; beside the runway on a lot |
| airport | `hangar` | prop | 10.95 | 10.1 | 18.3k / 6.4k / 2.2k | — | open doors face +X |
| airport | `airliner` | prop | 14.13 | 10.2 | 45.0k / 13.5k / 4.5k | — | `landmark`; **largest edible in the game** (ladder: crane 11.5 → airliner 14.13, ×1.23) |
| airport | `tile_runway` | tile | — | 4.43 | 11.3k | — | `rot180`; strip runs edge-to-edge along X; verges at |y| 8–15; roads meet it at |y| > 15 |
| farmfair | `hay_bale` | prop | 0.85 | 1.56 | 8.3k / 2.1k / 1.5k | — | |
| farmfair | `scarecrow` | prop | 1.02 | 2.30 | 6.7k / 1.7k / 0.8k | — | |
| farmfair | `prize_pumpkin` | prop | 1.46 | 2.30 | 9.3k / 2.3k / 0.9k | — | first-prize rosette faces +X |
| farmfair | `tractor` | prop | 1.62 | 2.55 | 20.0k / 5.4k / 5.1k | — | `mover=field` (slow wander across farm/park); add to `VEHICLES` |
| rail | `carriage` | prop | 5.35 | 3.94 | 27.3k / 8.3k / 3.1k | 8 × `w_*` | `mover=rail clone rail_top=0.47`; length 10.3 m buffer-to-buffer |
| rail | `locomotive` | prop | 6.59 | 4.20 | 43.7k / 13.6k / 6.8k | 16 × `w_*` | `mover=rail clone rail_top=0.47`; loco+tender ≈ 13.2 m; chimney top local (5.3, 4.2, 0) → smoke |
| rail | `station` | prop | 8.52 | 6.20 | 28.8k / 7.2k / 2.7k | — | `rail_offset=4.2`: place its origin 4.2 m from the track centre, platform edge (local −Y) facing the track |
| rail | `tile_rail` | tile | — | 4.78 | 27.7k | — | `rot180 rail_top=0.47`; track along X at y = 0 edge-to-edge; level crossings at |x| > 15 |
| chain | `fireworks_stand` | prop | 1.36 | 2.61 | 9.7k / 2.4k / 1.9k | — | `effect=fireworks` |
| chain | `water_tower` | prop | 3.10 | 12.1 | 12.1k / 4.8k / 1.8k | — | `effect=flood` |
| chain | `gas_station` | prop | 7.16 | 7.30 | 32.6k / 11.4k / 3.9k | — | `effect=blast` |
| powerups | `pu_magnet` `pu_ghost` `pu_split` `pu_boost` | **pickup** | 0.5 | ~1.4 | 4–7k | `float` | `clone effect=magnet|ghost|split|boost`; new kind — exclude from edible logic, book, rivals' targets and the ladder |
| mutators | `rubber_duck` | prop | 0.50 | 1.18 | 9.2k / 2.3k / 0.7k | — | `mutator=ducks unit_scale`: scale = replaced asset tier / 0.5 |

Wheel clips (`w_*`) are authored for 4.5 m/s rolling; set `action.timeScale = speed / 4.5`.
Pack sizes (optimized, LOD0+1+2): events 1.8 MB, fair 1.1 MB, airport 0.8 MB, rail 0.8 MB, chain 0.4 MB, farmfair 0.4 MB,
powerups 0.2 MB, mutators 0.06 MB.

---

## 5. Feature designs

Keep each system in its own module (`src/events.js`, `src/powerups.js`, `src/chains.js`, `src/progress.js`,
`src/abilities.js`, `src/mutators.js`) and keep `main.js` as wiring. All randomness from the run's seeded `rng`.

### 5.1 City events (`src/events.js`) — #1
- **Schedule:** one event per run, chosen by seed from those valid for the city (the car show needs a plaza or parking
  tile, the UFO a park or plaza, the parade and marathon a straight road ≥ 3 tiles). Fires at 60–150 s. A 5 s warning
  uses the existing hint/toast queue (respect `bannerUntil`) plus an edge-of-screen arrow like the endgame compass.
  The event lasts 45–60 s, then props that are still alive leave (drive off, or the UFO flies away).
- **Parade:** a route along one road line (`director.lines`). 1–2 `parade_float`s and one `balloon_float` crawl
  along it at 2 m/s using a new `parade` mover (follows a polyline, eases around corners). 10 `drummer`s march
  in a 2×5 block behind each float; walkers along the route stand and cheer (a `peck`-like idle). Each drummer eaten
  is +1 combo. The balloon only comes down to a hole ≥ 1.6 × 2.9 m (existing `flying` rule). Eating parade entities
  adds notoriety ×1.5.
- **Marathon:** a `finish_arch` sits across a road. 24–40 `marathon_runner`s loop a closed road circuit at 3.4 m/s
  (a `jog` mover on the road grid). This is a snack conveyor for small holes. Runners flee like other walkers.
- **Car show:** 3 `show_turntable`s in a plaza, each with a showcased car parented to its `turntable_top` node
  (`supercar`, `classic_car`, `mayor_limo`). They count as rare book entries. Velvet ropes are part of the model.
- **UFO:** the `ufo` lands on a park or plaza. A TSL additive cone beam shines from the underside for 3 s on arrival.
  6 `alien`s wander nearby and flee the hole. After 40 s it takes off (rises 12 m over 4 s and becomes `flying`).
  Eating it before take-off pays a rare bonus plus a book entry.
- **Book:** event models are `kind=prop`, so they appear in the book automatically; add titles in `book.js` `TITLES`.

### 5.2 New districts — #5
Add tile types and moods; keep existing ones intact.
- **Fairground** (`tile_fair`): the tile places `ferris_wheel` at local (−7.5, 7.5) and `carousel` at (7.5, −7.5).
  Along the promenade circle (r ≈ 9.5): `hoopla_stall`, `balloon_stand`, `ticket_booth`, and a few
  `fireworks_stand`s. A small rink of 4–6 `bumper_car`s (wander, bouncing inside a 5 m circle) goes in the free
  quadrant. Walkers are dense here (a crowd).
- **Airport** (`tile_runway` ×N): like the beach row, one full row of runway tiles along an edge. Tiles only turn
  by 180° (`rot180`). One `airliner` is parked on the middle runway tile; optionally it taxis slowly along X
  (`taxi` mover, 3 m/s, stopping at the row ends). `hangar` and `control_tower` go on the lot tiles next to the row,
  and `baggage_tug` trains drive the apron (`mover=apron`: loops the verge). The airliner is the run's ultimate meal.
- **Railway** (`tile_rail` ×N): one row like the canal row (`canalRow` pattern), `rot180`. A train made of
  `locomotive` + 2–3 `carriage`s moves along X on the row at 8 m/s, lifted to y = 0.47, and wraps edge to edge like
  traffic. It stops for 6 s at the `station`, which sits on the verge of one rail tile at `rail_offset` 4.2.
  Traffic on the north–south roads must stop when the train is within 20 m of a crossing (extend `clearAhead`).
  Puff chimney smoke with `debris.puff` from the loco's chimney. The train counts as three separate meals (loco
  6.6, carriages 5.35), and a carriage decouples when it's eaten.
- **County fair** (farm-fair props): dress `park` and `residential` tiles of a new mood with `prize_pumpkin`,
  `hay_bale` stacks, `scarecrow`s and 2–3 `tractor` movers. Bias the countryside ring toward `farm`.
- **New moods** (append to `MOODS`):
  - `Fun Fair` (fair tiles inner and outer; event bias toward the parade)
  - `Airport City` (runway row plus lots)
  - `Railway Town` (rail row plus residential)
  - `County Fair` (farm-fair dressing plus the marathon event)
- **Trees and roots:** procedural trees replaced the rooted tree models. Add underground root tubes to `growTree`
  (below z = 0, so the ground-cut shader shows them only inside the hole). That restores the "roots too wide" read
  that pairs with the `tooBig` hint.

### 5.3 Chain reactions (`src/chains.js`) — #6
Trigger on the `fall` event (`city.events`) of a model with `meta.effect`. Never hurt the player. Each effect is capped
at one active instance.
- **`blast`** (`gas_station`): a radial impulse over 12 m.
  - Static props inside it become a short-lived `tumble` mover: outward velocity, spin, then they settle.
    `city.solids` placement no longer applies once they're loose.
  - Cars nearby switch to panicked `wander`. Sparks plus orange debris, a camera shake of 0.5, and a bass boom.
  - Anything knocked into the hole counts toward the combo.
- **`fireworks`** (`fireworks_stand`):
  - 16 rockets launch from the stand and burst 20–30 m up as a TSL compute particle system, with bloom
    (budget ≤ 4k particles, reuse one buffer).
  - Props within 8 m hop 0.5 m, pigeons scatter, notoriety +10.
- **`flood`** (`water_tower`): reuse the tide/flood surface. A circular wave front expands 0 → 25 m over 3 s.
  Units in it are slowed ×0.5 for 8 s, and props ≤ tier 1 drift toward the hole at 1.5 m/s.
- **Dominoes:** when a building falls, neighbours within 1.3× its footprint (and with tier < hole.r × 1.15) rock,
  and with a 25% chance they topple toward the hole (tilt 70° over 0.8 s, then slide 1.5 m). Only the geometry
  changes, not the tier.
- **Water mains:** swallowing a hydrant (any hydrant, gold included) spawns a geyser column (particles) for 6 s,
  plus a puddle ring that bobs small props.

### 5.4 Power-ups (`src/powerups.js`) — #7
- **Spawning:** every 45–70 s (seeded), one pickup spawns 25–45 m from the player on open ground (not inside
  `blocked()`). It is marked by an edge arrow and lasts 20 s, then fades. It is a cloned asset, and its `float`
  clip bobs and spins it.
- **Collecting:** the player collects it when the hole centre is within `r + 0.5`. Rivals can collect it too
  (the bot steers to it when it's within 20 m) — that's adversity.
- **Effects** (show an icon plus a radial timer in the HUD):
  - `magnet`: `hole.vac = 2.5` held for 6 s, with 2× reach in the whirlpool code.
  - `ghost`: 8 s where notoriety is frozen, units lose their target (they patrol), and searchlights ignore you.
    The hole rim shimmers (a TSL fresnel on the rim material).
  - `split`: for 10 s a twin hole (the next free `holeField` slot) mirrors your steering at an offset of
    2.5 × r. Both eat into one shared area pool. The twin has 70% of your radius, and they merge with a
    shockwave at the end.
  - `boost`: 5 s at ×1.8 speed, with a particle trail. Crowds flee in the direction you're heading.
- **Pickups are never edible** (`kind=pickup`): exclude them from `BOOK_KINDS`, the rivals' target filter, the swallow
  test and the ladder check (already excluded).

### 5.5 Star challenges (`src/progress.js`) — #11
- **Data:** a table of `{ id, mood, text, live?: (state) => bool | 'fail', end: (state, result) => bool }`.
  There are three per mood, 30 in total.
- **Storage:** `save.stars[mood]` is a 3-bit mask.
- **UI:** stars show on the results screen as they're earned, and the city picker shows the totals.
- **Examples** (write all 30):
  - Old Town: clear under 5:00 · eat the clock tower before ★3 · never get rammed
  - Suburbia: 50 gnomes · clear without eating poison · win with ≤ 2 rival encounters
  - Seaside: eat the pier · survive 3 tides without shrinking · 20 crabs
  - Neon Nights: 30-combo · never caught in a searchlight · eat 3 arcades in 60 s
  - Boomtown: eat the crane under 3:00 · 10 cement trucks · no concrete hits
  - Fun Fair: ferris wheel · all 8 bumper cars · clear during the parade
  - Airport City: eat the airliner · 5 baggage trains · no rams
  - Railway Town: swallow a moving train · station under 3:00 · eat 3 carriages in 10 s
  - County Fair: 3 prize pumpkins · 10 hay bales · eat every scarecrow
  - Waterfront: 10 rowboats · clear with no tide losses · 40-combo
- **Rewards:** stars are a currency for §5.6 unlocks and give skin unlocks at 5/10/20/30 stars
  (add skins in `skins.js`).

### 5.6 City progression (`src/progress.js`) — #12
- **Order:** Old Town → Suburbia → Waterfront → County Fair → Seaside → Fun Fair → Railway Town → Boomtown →
  Neon Nights → Airport City.
- **Unlocking:** a city unlocks by clearing the previous one **or** earning 2 of its stars.
- **Menu:** a horizontal city picker replaces the random mood for normal runs, showing a thumbnail of the
  district's landmark (use `warmThumbs`), stars and a lock. "Dig again" replays the same city with a new seed.
- **Unaffected modes:** Daily city and Weekly (§5.8) stay open to all players and use every mood.
- **Migration:** existing saves with `best ≥ 6` start with the first four cities unlocked.

### 5.7 Hole abilities (`src/abilities.js`) — #13
Bought in the shop with dust (they sit beside the upgrades). One slot at first, a second at 10 stars. Triggered by
Space, right-click, or an on-screen button on touch devices, with a radial cooldown HUD.
- **Quake** (cooldown 25 s): a shockwave out to 3 × r. Static props slide 1–2 m toward the hole, units are stunned
  for 2 s, and there's a camera kick plus a ground ripple decal. Costs 400.
- **Vortex Burst** (cooldown 18 s): `hole.vac = 2`, 2.5× reach, for 1.5 s. Costs 350.
- **Dash** (cooldown 8 s): 0.35 s at ×3 speed with afterimages. Passing through a barricade's toll zone costs nothing
  during a dash. Costs 300.

Balance: run `tools/botrun.mjs` with the bot using abilities greedily. Clear times must stay inside the §8 band.

### 5.8 Weekly mutators (`src/mutators.js`) — #14
A "Weekly" menu button sits beside Daily. The seed is the ISO week; one mutator is active, and the best result is kept
per week.
- **Low gravity:** falls take 2.5× longer and objects float upward as they tip in; hole speed ×1.1.
- **Everything is ducks:** every non-building prop's geometry is swapped for `rubber_duck`, with per-instance
  scale = tier / 0.5. Meta (tier, mass, kind) stays, so the gameplay is identical. Buildings stay as they are.
- **Miniature:** every placed prop is at 0.5× scale and 2× count (layout multiplier); the camera comes 30% closer.
- **Night shift:** forced night, searchlights in every district, and windows lit.
- **Rush hour:** traffic ×2 at 1.5× speed.

---

## 6. Lazy pack loading (required for iPad)

Today `loadAll` loads everything in `index.json` up front (≈ 13 MB total across LODs, 94 models).
- **New:** `loadPack(name)` fetches `packs.json` once, then the GLBs for that pack (low tier: LOD1 + LOD2 only, like the
  base game). It builds materials and flags exactly like `loadAll` and merges the result into `assets`.
- The menu preloads the packs the selected city and the day's event need (mood → packs map). Start the run only when
  they have resolved; show "Setting up the fair…" using the existing staged-loading UI.
- Power-ups (0.2 MB) and the duck (0.06 MB) are small enough to add to the base load if simpler.
- Precompile pack materials behind the loading screen, as the base game already does (`renderer.compileAsync`).

---

## 7. AAA visual pass (keep every tier's frame budget)

Fix these first; they're visible on the new models.
1. **Metals read as diamond tread-plate.** `tools/textures.py` maps layer `metal` → Poly Haven `metal_plate`, and
   `surface.js` routes `chrome`, `steel`, `gold`, `copper` and `rose_gold` to it (`MET`).
   - Switch chrome, gold, copper and rose_gold to smooth (layer −1) with a faint brushed-anisotropy normal in TSL, and
     let ORM metalness plus the IBL do the work.
   - Keep `metal_plate` only for `steel` on floors and cart beds.
   - Models on this branch already avoid large chrome, steel and gold surfaces for this reason.
2. **Glass is opaque.** The `glass` swatch is glossy but opaque. Add a transmission-lite path in TSL for the glass
   swatch: fresnel reflection of the IBL, a darkened interior tint, and a faint window-interior parallax (cube-map
   "fake rooms") for buildings. At night, `y` (building) flags already light random windows.
3. **Clearcoat for new vehicles:** add `supercar`, `classic_car`, `bumper_car`, `tractor`, `baggage_tug`,
   `locomotive`, `carriage` and `airliner` to `VEHICLES` in `assets.js`.

Then the look upgrades (each behind `Q` tiers):
- **Relief:** WebGPU has no hardware tessellation.
  - Use **parallax occlusion mapping** from the RHA height channel on ground layers (asphalt, paving, brick, dirt,
    grass verges): 8–16 steps on high, off on low.
  - Subdivide ground tile grids near the camera (tiles are single quads today) and displace the vertices by the height
    array for silhouettes at the hole's rim.
- **Organic detail:**
  - Per-instance hue/value jitter (small) so repeated props aren't clones.
  - A **sheen** lobe for fabric swatches: tents, awnings, bunting, the balloon float.
  - Soft **subsurface/transmission** for leaves (already back-lit) and for the balloon float/inflatables.
  - Wind flutter on bunting and flags: a vertex-shader wave keyed to height, reusing `wind`/`gust`.
- **AO:** GTAO exists. Add a vertex-AO/cavity term.
  - Either bake it in Blender later (see §10), or compute a cheap curvature term in TSL from `normalGeometry`
    derivatives on high.
  - Keep contact-shadow blobs for small props.
- **Tonemapping and grade:** evaluate AgX vs ACES per time of day (keep whichever holds saturated toy colours better),
  and add a 3D LUT per preset. Auto-exposure is already metered.
- **Lights:** the ferris wheel, carousel, fair festoons, runway edge lights and signals are emissive and should bloom.
  Pulse them with a shared uniform (chase patterns on the ferris rims).
- **Atmosphere:** golden hour and dusk get light shafts (screen-space radial blur from the sun on high).
- **FX:**
  - Fireworks as TSL compute particles with bloom.
  - The UFO beam as a soft additive cone with scrolling noise.
  - Train smoke and steam through `Debris` puffs (heavier, lingering).
  - The water-tower flood reuses the tide water material.

Budgets (ART.md): ≲ 2 M triangles including the shadow pass and ≲ 210 draw calls on high. The low tier must hold 60 fps on
a 2021 iPad at the start of a run. Measure with `?fps`.

---

## 8. Acceptance checks (run before every commit)

- `npm run check`: the ladder passes for base + every pack (it does today).
- `npm run build` is clean. The Pages workflow runs `npm ci && npm run check && npm run build`.
- **Balance:** `node tools/botrun.mjs "&seed=777" 420` (greedy) and `node tools/botrun.mjs "&seed=777" 420 1` (sloppy),
  plus 4 more seeds. Record the baseline **before** your first system change. Stage 10 target: greedy clears in
  3.5–4 min on most seeds and can die; sloppy mostly dies. New systems must not push greedy below 2:45 or sloppy
  into regular clears. Test each new mood separately with `?mood=`, adding that param if needed.
- **Visual:** `node tools/shot.mjs` at golden and night for each new mood. Contact sheets via `gallery.html?packs`.
- **Perf:** `?fps` on the quality tiers. Draw calls and triangles stay within §7 budgets with a pack loaded.
- **No-dead-end rules** hold for every new hazard (blast/flood never shrink the player; pickups can't block; events
  never wall off roads — parade floats are edible or pass through).

## 9. Suggested milestones (commit after each)

1. **Pack loader:** `loadPack()`, mood → packs, precompile, `VEHICLES`, `CLONED` handling for `clone=true` extras.
2. **Districts:** fair, rail (train mover + crossings + station), airport (runway row + taxiing airliner), county fair,
   plus the four new moods. Bot and screenshot check.
3. **Events:** parade, marathon, car show, UFO (plus movers `parade`, `jog`, `taxi`, `apron`, `field`). Book titles.
4. **Chain reactions:** blast, fireworks (compute particles), flood, dominoes, water mains.
5. **Power-ups:** spawn, collect, effects, HUD, rivals.
6. **Progression and challenges:** save schema, picker UI, 30 challenges, star rewards, migration.
7. **Abilities:** shop entries, input, cooldown HUD, FX; bot balance.
8. **Weekly mutators:** menu, seed, 5 mutators.
9. **AAA pass:** metals, glass, POM, sheen/SSS, bunting wind, LUTs, shafts, emissive chases, then perf tuning per tier.
10. **Docs:** README feature list and screenshots, PLAN.md Stage 11 ✅, ART.md (new swatch usage, glass/metal
    rules), then open the PR from `feature/variety-pack`.

## 10. Known gotchas

- Palette `glass` is opaque today (see §7.2). The power-up capsules therefore carry their icon **on top** of an open
  capsule, not inside a dome.
- Emissive row swatches (`glow`, `warn`, `toxic`, `lilac`, `siren_*`, `glow_white`, `void`) glow. Use them only for
  lights, screens and flames.
- `tag()` extras arrive in the manifest as JSON (`true`, strings, arrays).
- Blender clip names stay unique per asset (`_name_action`). The ferris wheel has 13 clips, the loco 16 and the
  carriage 8: play all of them.
- Tiles with `rot180` must only rotate by 0 or π, so rows join (the runway and rail line up edge to edge).
- `station` has an offset, not a tile. Trains sit at y = 0.47 on rail tiles; if you place a train off-rail (a
  mutator, the book thumbnail), use y = 0.
- `balloon_float` is `flying`; the ground clamp was deliberately left on (its carts touch the ground, the balloon is
  aloft).
- Optional future pipeline work: bake per-vertex cavity AO into a colour attribute during export in `lib.py`. This
  needs Blender, so leave a note rather than attempting it.
