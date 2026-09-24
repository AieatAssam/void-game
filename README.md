# Void Hole City

**You are a hole in a toy town.** Swallow anything smaller than you, grow until skyscrapers fit, and keep eating — or the ground seals over you.
The city fights back as you grow: police barricades, cement trucks, helicopters dropping concrete, and tanks.

**▶ Play in your browser:** https://aieatassam.github.io/void-game/

![Golden hour: a taxi wedges into the hole at a plaza crossing](docs/screens/gameplay-golden.jpg)

| | |
|---|---|
| ![Dusk: late game, the hole swallowing a whole plaza](docs/screens/late-game-dusk.jpg) | ![Morning: suburban blocks, police barricades closing in](docs/screens/heat-morning.jpg) |
| ![Noon: a small hole among giant toy trees](docs/screens/suburbs-noon.jpg) | |

## The game
- **Grow:** everything has a size. Swallow what fits; each bite widens the hole by a share of the object's footprint.
- **Starve:** a belly meter drains. Keep eating or you shrink — too small and the ground seals.
- **Heat ★1–4:** the bigger you get, the harder the city responds — barricades (toll zones), cement pours, concrete drops with red warning rings, tank shells. Shrink and it calms down.
- **Poison:** gas cans shrink you, toxic barrels reverse your controls, spiky art jams the hole. Oversized cars can **clog** it.
- **Win:** swallow every building. Clear time is your score; the **Daily city** is the same map for everyone that day.
- **Progress:** void dust buys upgrades. Every run randomises city size, style (Old Town, Suburbia, Waterfront, Boomtown), time of day and start spot.

Controls: mouse, touch-drag or WASD · `M` mutes.

## How it's made
- **Engine:** [three.js](https://threejs.org) + Vite. Static build, no backend — runs on GitHub Pages.
- **Art:** ~90 models, all procedural Blender Python scripts (`blender/assets/*.py`) driven through **Blender MCP**. One shared palette atlas + roughness/metalness atlas, so the whole city is one material; chrome, glass and gold are real metals/gloss.
- **Performance:** every model ships 3 LODs (full, ~25%, ~8% via meshoptimizer). The city is instanced per asset per 40 m chunk and culled; far chunks drop to LOD2 and stop casting shadows. Tilt-shift post-process and full-detail models switch off automatically on slow devices.
- **Design rules:** no dead ends — nothing blocks movement, a size-ladder check (`npm run check`) guarantees there's always something slightly smaller to eat, and every hit is capped.

## Develop
```bash
npm install
npm run dev          # game at http://localhost:5174, model showroom at /gallery.html
npm run check        # size ladder: no gaps > 1.3x between edible sizes
npm run build        # static site in dist/
```
Rebuild art (Blender with the MCP add-on running): run `blender/build_all.py` inside Blender, then `npm run optimize`.

Playtest bot: open `/?bot` and run `__runBot(600)` in the console (`__sloppy = true` for a careless player).

See [PLAN.md](PLAN.md) for the build stages and [ART.md](ART.md) for the art bible.
