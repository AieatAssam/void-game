# Void Hole City — Build Plan

Browser game. Three.js + Vite, static build, hosted on GitHub Pages. No backend.
All art built procedurally in Blender (via Blender MCP) from scripts in `blender/`.
Art direction lives in [ART.md](ART.md) and drives every stage.

## Core loop
You are a hole. Swallow things smaller than you, grow, survive. **Win** by swallowing every building (clear time is the score; daily city keeps a per-day best).
- **Starvation**: hole shrinks over time. Size 0 = ground seals = run over.
- **Heat ★1–4**: follows the hole's current size with hysteresis (grow → city escalates: barricades → cement trucks → helicopters → tanks; shrink → it calms, so no death spiral). Response units are also the best food.
- **Poison props**: gas canisters (shrink), toxic barrels (reverse controls), spiky sculptures (jam 2s).
- **Clog**: too-big objects plug the hole ≤2s. *(deferred: spiky-art jam covers the feel; add if playtests want more)*

## No-dead-end rules (hard guarantees)
1. Nothing blocks movement. Hole slides under everything; barricades are toll zones (small size loss + slow), never walls.
2. Size ladder: consecutive prop sizes ≤1.3× apart (checked at build from exported GLBs). Snack floor spawns tier-appropriate food off-screen when local edible mass is low. Snack income ≈1.2× decay.
3. Everything hostile is temporary or edible later. Barricades expire in 20s; concrete hit ≤25% size; clog ≤2s.

## Stages
Each stage ends with a commit.

- **0 — Foundations.** git, PLAN.md, ART.md, Vite + three scaffold, `base: './'`.
- **1 — Pipeline proof.** `blender/lib.py` (palette atlas material, bevel/shade helpers, metadata, export). Two assets end to end: hydrant (static) + helicopter (rotor clip). GLB → gltf-transform (meshopt) → gallery page. Verify palette, emissive, extras, clip, tri count.
- **2 — Full asset set.** All props, ground tiles, response units, hazards, hole rim — built now, before gameplay, so the game is shaped around them. Gallery shows every asset + clips + tri counts. Size-ladder check runs on exports.
- **3 — Core loop.** Seeded city layout from tiles + props, hole movement (mouse/touch/keys), ground cut-out shader, fake fall (tilt + sink, no physics engine), growth, camera zoom-out, starvation.
- **4 — Adversity.** ✅ Bot check: `?bot` then `__runBot(420)` — greedy bot clears the city (5/5 seeds, 3.5–6 min); with `__sloppy = true` (no dodging, eats poison, stalls) it dies ~3 in 5. Heat system + unit spawner/AI, concrete plugs with ground shadow warning, poison props, clog, snack floor.
- **5 — Meta + feel.** Run results, currency, upgrades (slower decay, pull radius, concrete resist), daily seed, UI, WebAudio SFX, particles/juice.
- **6 — Perf + ship.** Profile (draw calls, tris), LOD tune, GitHub Actions → Pages.

## Stage 7 — Refine + deferred items ✅
Done: detail multiplier Q=1.6 on every model + LOD1 (25%) / LOD2 (8%); richer cars/trees/houses, kid peg, car_c;
new districts (residential, construction + animated crane, parking, canal); countryside ring (hills, farm, lake,
windmill, barn, cows) + clouds; 4 time-of-day presets + sky dome; random city size/mood/time/start; clog; tilt-shift;
sparks, combos, fleeing peds, hints, attract camera, endgame compass. Units stand down when heat drops.
Bot (latest): greedy clears 7/8 (3–5.5 min, Boomtown slowest); sloppy dies ~1/4.
- **Models:** fix weak ones (scooter front, hot-dog cart topping, tank stars), trim hydrant to budget, richer cars
  (grille, plates, arches) + a third car colour, kid peg with balloon, rooftop detail on buildings.
- **Clog:** vehicles slightly too big to swallow tip into the hole, jam it ≤1.5s, then pop out (rule 3).
- **Tilt-shift:** post-process (blur band + vignette + grade), auto-off if fps drops.
- **Juice:** swallow sparks, floating combo text + combo dust bonus, pedestrians flee a big hole,
  first-run hints, slow attract camera behind the menu.

## Stage 8 — Rivals, challenges, collection, skins, beach, neon
Models first, then systems, then districts, then bot check.
- **Models (Blender):** beach set (tile_beach, land_sea, umbrella, deckchair, sandcastle, beach ball, surfboard,
  lifeguard tower, crab, sailboat, pier), neon set (tile_neon, arcade, karaoke bar, neon sign, noodle stall,
  searchlight tower), rares (golden gnome, gold hydrant, rainbow pigeon, mayor's limo). Thumbnails rendered in Blender.
- **18 Skins:** hole look is data (rim colour, void gradient, swirl, lensing ring). Buy with dust; rivals wear skins too.
- **13 Rival holes:** up to 4 holes share one ground-cut uniform array. Rivals are bots: eat, grow, starve, chase smaller
  holes, flee bigger ones. Eat a rival → take half its area. Get eaten → run over. Rivals respawn small.
- **14 Challenge cards:** pick 1 of 3 before a run (daily city has a fixed card). Rule changes + dust multiplier.
- **17 Collection book:** first swallow of each type is recorded; rare variants spawn sometimes. Book page with thumbnails.
- **7 Beach + pier:** Seaside edge of town, sea beyond. Tide event every ~45s floods the sand: slow + hungrier.
- **12 Neon district:** night preset; neon signs give combo points; searchlights sweep: caught = +1 heat for 12s.

## Stage 9 — AAA rendering (WebGPU + TSL)
- **Renderer:** `WebGPURenderer` with WebGL2 fallback; all shaders rewritten in TSL (palette materials, hole, particles, sky).
- **Post:** GTAO, bloom, ACES filmic + per-time exposure, SMAA, vignette, fringe, grain (tilt-shift removed after iPad playtest).
- **Performance (iPad playtest):** quality tiers with mobile defaults, graceful fps fallback, staged loading with per-file progress,
  shaders precompiled behind the loading screen, lazy thumbnails, grid-based terrain generation, `?fps` overlay.
- **Materials:** scanned PBR texture arrays, triplanar + surface-gradient normals, clearcoat cars, deep water with shore foam.
- **Nature:** heightfield countryside, procedural trees/bushes, GPU grass, shared wind field.
- **Checks:** `tools/shot.mjs` captures frames headlessly (WebGL2 backend in CI-like containers without a GPU).

## Stage 10 — Balance + adversity (after playtest: "dust too plentiful, upgrades are a win button")
Measured before: greedy bot cleared a city in 96 s and a win paid ~38,000 dust (quadratic combo bonus).
- **Growth curve:** bites grow you by 17% of the footprint (was 25%), scaled by size relative to the hole (crumbs ~6%, full at half your size).
  Whirlpool suction is shorter and only pulls things under 60% of your size.
- **Economy (meta.js `ECON`):** dust = sqrt(area eaten) + sqrt(capped combos) + cravings + rares + rivals + win + speed (+ first daily clear),
  times the card. Defeats keep half of meals/combos. Costs up; old banks capped at 300 once.
- **Upgrades:** 6-10% per level, three levels, most with a drawback; new Quiet Void (slower notoriety).
- **Adversity:** notoriety heat, evacuation at ★2+, rising hunger over the run, wet concrete patches, cravings with a missed-craving penalty.
- **Result:** greedy bot clears in ~3.5-4 min on most seeds and can die; careless bot dies.

## Stage 11 — Variety pack ✅
38 new models in `public/models/packs.json` (Blender scripts + LODs), integrated per [HANDOVER.md](HANDOVER.md):
- **Pack loading:** `loadPack()` per city behind the staged loader, shaders precompiled, next city preloaded on the results screen.
- **Districts + moods:** Fun Fair, Airport City, Railway Town, County Fair (train with station stops and level crossings,
  taxiing airliner, baggage trains, bumper cars, tractors, tree roots under the ground).
- **City events:** parade, marathon, car show, UFO — one per run, warned 5 s ahead with an edge arrow.
- **Chain reactions:** gas-station blast, fireworks (GPU particles), water-tower flood, building dominoes, burst water mains.
- **Power-ups:** magnet, ghost, split, surge; rivals chase capsules too.
- **Progression:** ten cities unlocked in order, 30 star challenges, star skins, a second ability slot at 10 stars.
- **Abilities:** Quake, Vortex Burst, Dash (shop, cooldown HUD, touch buttons).
- **Weekly mutators:** low gravity, everything is ducks, miniature, night shift, rush hour.
- **AAA pass:** polished metals, glass interiors, ground POM, fabric sheen/flutter/translucency, light chases, per-preset LUTs,
  light shafts, cavity term, per-instance jitter.
- **Balance:** docs/BALANCE.md (baseline, per-mood, A/B, abilities). No-dead-end rules hold: blasts, floods and events never hurt
  or wall off the player, capsules never block, parade floats pass through traffic and are edible.
Model notes and design deviations: [HANDOVER-FEEDBACK.md](HANDOVER-FEEDBACK.md).
