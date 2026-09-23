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
