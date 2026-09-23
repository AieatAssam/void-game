# Void Hole City

You are a hole in a toy town. Swallow what fits, grow, and keep eating or the ground seals.
The city fights back as heat rises: police barricades, cement trucks, helicopters dropping concrete, tanks.

Three.js, static build, no backend. Runs on GitHub Pages.

- **Play:** `npm run dev` → http://localhost:5173 · **Showroom:** `/gallery.html` (every model + clips + triangle counts)
- **Deploy:** push to `main`; `.github/workflows/pages.yml` checks, builds and publishes `dist/`
  (repo Settings → Pages → Source: GitHub Actions).

## Art pipeline (Blender MCP)
All 50 models are procedural Blender scripts in `blender/assets/*.py` built on `blender/lib.py` + `blender/kit.py`.
One shared 8×4 palette atlas material; theme and budgets in [ART.md](ART.md).

1. With Blender + the MCP addon running: `exec(open('blender/build_all.py').read())` (set `ONLY = ['name']` for one asset).
2. `npm run optimize` → meshopt GLBs + LOD1 in `public/models/` and `index.json` (tier, mass, kind read by the game).
3. `npm run check` → size ladder: no step between edible sizes above ×1.3 (no dead ends).

## Checks
- `npm run check` — size ladder from exported metadata.
- Playtest bot: open `/?bot`, then in the console `__runBot(420)` — the greedy bot must clear the city without starving;
  `__sloppy = true` first for a careless bot that should die some of the time (proves the failure mode is real).

See [PLAN.md](PLAN.md) for stages and the no-dead-end rules.
