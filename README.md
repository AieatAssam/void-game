# Void Hole City

**You are a hole in a toy town.** Swallow anything smaller than you, grow until skyscrapers fit, and keep eating — or the ground seals over you.
The city fights back as you grow: police barricades, cement trucks, helicopters dropping concrete, and tanks.

**▶ Play in your browser:** https://aieatassam.github.io/void-game/

![Golden hour: a taxi wedges into the hole at a plaza crossing](docs/screens/gameplay-golden.jpg)

| | |
|---|---|
| ![Rival holes: Bubblegum and Rusty compete for the same suburb](docs/screens/rivals.jpg) | ![Neon Nights: arcade, karaoke bar, noodle stalls and searchlights](docs/screens/neon-night.jpg) |
| ![Seaside: beach umbrellas, lifeguard tower, the pier and the tide line](docs/screens/seaside.jpg) | ![Dusk: late game, the hole swallowing a whole plaza](docs/screens/late-game-dusk.jpg) |
| ![Morning: suburban blocks, police closing in](docs/screens/heat-morning.jpg) | ![Noon: a small hole among giant toy trees](docs/screens/suburbs-noon.jpg) |

## The game
- **Grow:** everything has a size. Swallow what fits; each bite widens the hole by a share of the object's footprint.
- **Starve:** a belly meter drains. Keep eating or you shrink — too small and the ground seals.
- **Heat ★1–4:** the bigger you get, the harder the city responds — police cars that chase and ram you, barricades, cement pours, concrete drops with red warning rings, tank shells. Shrink and it calms down.
- **Rival holes:** other holes eat the same city. Bigger swallows smaller — including you.
- **Poison:** gas cans shrink you, toxic barrels reverse your controls, spiky art jams the hole. Oversized cars can **clog** it.
- **Win:** swallow every building. Clear time is your score; the **Daily city** is the same map for everyone that day.
- **Challenge cards:** pick one rule twist per run (Car Crusher, Rush Hour, Glass Cannon, Crowded…) for a dust multiplier.
- **Collection book:** every type of thing gets a page the first time you swallow it. Rare golden variants are hiding.
- **Progress:** void dust buys upgrades and hole skins (Galaxy, Lava, Cotton Candy, Black Hole).
- **Every city is different:** random size, style (Old Town, Suburbia, Waterfront, Seaside with a tide, Neon Nights with searchlights, Boomtown), time of day and start spot.

Controls: mouse, touch-drag or WASD · `M` mutes.

## How it's made
- **Engine:** [three.js](https://threejs.org) `WebGPURenderer` + Vite, every shader written in TSL (three's node shading language).
  Runs on WebGPU and falls back to WebGL2 automatically (force it with `?webgl`). Static build, no backend — runs on GitHub Pages.
- **Rendering:** physically based sky with sky-lit IBL, 4K soft sun shadows, aerial-perspective fog, GTAO ambient occlusion,
  HDR bloom, ACES filmic tonemapping with per-time-of-day exposure, tilt-shift lens blur, SMAA, vignette, lens fringe and film grain.
- **Materials:** 16 CC0 scanned PBR materials from [Poly Haven](https://polyhaven.com) (asphalt, paving, grass, brick, roof tiles, bark,
  rock…) packed into texture arrays. Every palette swatch maps to a scan, projected triplanar with tangent-free surface-gradient
  normal mapping, so toy models get real albedo, normal, roughness and AO detail. Cars get clearcoat paint; water has depth, waves and shore foam.
- **Nature:** a heightfield countryside (hills, lakes, a river, farm patchwork behind hedgerows, forests, moss-topped rocks),
  procedurally grown trees and bushes built from leaf-cluster cards cut from [ambientCG](https://ambientcg.com) leaf scans,
  and GPU grass — hundreds of thousands of procedural blades — all swaying in travelling gusts and thrashing when the hole passes.
- **Art:** ~100 models (detailed toy people with a GPU walk cycle, AAA-detailed toy cars), all procedural Blender Python scripts (`blender/assets/*.py`) driven through **Blender MCP**. One shared palette atlas + roughness/metalness atlas, so the whole city is one material; chrome, glass and gold are real metals/gloss.
- **Performance:** every model ships 3 LODs (full, ~25%, ~8% via meshoptimizer). The city is instanced per asset per 40 m chunk and culled; far chunks drop to LOD2 and stop casting shadows. Tilt-shift post-process and full-detail models switch off automatically on slow devices.
- **Design rules:** no dead ends — nothing blocks movement, a size-ladder check (`npm run check`) guarantees there's always something slightly smaller to eat, and every hit is capped.

## Develop
```bash
npm install
npm run dev          # game at http://localhost:5174, model showroom at /gallery.html
npm run check        # size ladder: no gaps > 1.3x between edible sizes
npm run build        # static site in dist/
python3 tools/textures.py   # rebuild the PBR texture library in public/tex (Pillow + numpy; downloads CC0 scans)
```
Debug URL flags: `?webgl` (WebGL2 backend), `?seed=7`, `?time=golden|noon|morning|dusk|night`, `?mood=seaside`, `?r=6` (start radius),
`?view=x,z,dist[,yaw,pitch]` (fixed camera), `?grass=0.5` (blade density), `?nopost`, `?noao`, `?low`. `test.html?mat=trees|grass|toy`
renders materials in isolation; `node tools/shot.mjs out.png "?seed=7&webgl"` captures a frame headlessly.
Rebuild art (Blender with the MCP add-on running): run `blender/build_all.py` inside Blender, then `npm run optimize`.

Playtest bot: open `/?bot` and run `__runBot(600)` in the console (`__sloppy = true` for a careless player).

See [PLAN.md](PLAN.md) for the build stages and [ART.md](ART.md) for the art bible.
