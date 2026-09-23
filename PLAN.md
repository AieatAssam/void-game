# Void Hole City — Build Plan

Browser game. Three.js + Vite, static build, hosted on GitHub Pages. No backend.
All art built procedurally in Blender (via Blender MCP) from scripts in `blender/`.
Art direction lives in [ART.md](ART.md) and drives every stage.

## Core loop
You are a hole. Swallow things smaller than you, grow, survive.
- **Starvation**: hole shrinks over time. Size 0 = ground seals = run over.
- **Heat ★1–4**: damage raises heat; the city escalates (barricades → cement trucks → helicopters → tanks). Response units are also the best food.
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
- **4 — Adversity.** ✅ Bot check: `?bot` then `__runBot(240)` — greedy bot must never starve. Heat system + unit spawner/AI, concrete plugs with ground shadow warning, poison props, clog, snack floor.
- **5 — Meta + feel.** Run results, currency, upgrades (slower decay, pull radius, concrete resist), daily seed, UI, WebAudio SFX, particles/juice.
- **6 — Perf + ship.** Profile (draw calls, tris), LOD tune, GitHub Actions → Pages.
