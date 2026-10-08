# Phase 4 — Cosmos: the black hole eats the sky

Phase 3 ends with the planet shredded and the hole turned into an honest black hole ("The void is hungry for more…").
Phase 4 is what it eats next: **the solar system, then other stars and their systems, then galaxies, then the universe.**

## 0. Decisions at a glance

| Question | Decision |
|---|---|
| Avatar | The finale's black hole: `holeSphere` (black), `holeHalo`, and the post `lens` (shadow, photon ring, Doppler-beamed disk, bent starfield). No new hole art. |
| Frame | **Render space is in units of the hole's radius.** The hole sits at the origin with r = 1; the world moves under it (positions are doubles in *tier units*, drawn as `(p - hole) / r`). Precision never degrades, the camera distance, speed (0.7 r/s) and the 60 ms steering response are the same at every size, so growth can never feel sluggish. Scale is shown by the HUD, the dust field and the things that get eaten. |
| Span | ~19 decades, from a 2,500 km hole to the observable universe (4.4e10 ly). **Discrete tiers**: each tier is a freshly generated field in its own unit (km), r grows by its `growth` factor inside the tier (×4 … ×1000). A tier-up is a log-zoom: leftovers are swept in, the unit scales and the next field is laid out. No global frame, ever. |
| Growth | By **progress, not area**: r = r0·G^f(p), p = eaten weight / tier weight. Pacing is therefore designed (≈ 2–3 min a tier), never a dead end, and the bot can measure it. |
| Food | Every tier lays bodies log-uniformly from 0.02 r0 to ≈ 2 G r0 so there is always something at 0.1–0.95 r and a next step. Bodies **smaller than the hole fall in whole** (tidal stretch, spiral, flash); **bigger ones are nibbled** (they shrink while the rim overlaps them and pay as they go). Nothing is a wall. |
| Look | One instanced sphere mesh + one TSL material for every body (rock, world, gas giant, star: chosen per instance), comet tails as one more instanced quad mesh, a procedural star dome, a dust field for motion cues, then the existing post (bloom, grade, lens). ≤ 8 draws. |
| WebGL2 | No compute. Instancing and stateless shaders only (the fireworks precedent). |
| Adversity | Hook only in slice 1 (`Tier.hazards`). Gravity wells, rival holes and stellar flares come later. |
| Entry | The Phase 3 finale card gets **"Devour the sky"**; dev flag `?space[&tier=n]` starts straight in (like `?planet`). `state.phase === 4`, own frame function in `src/space.js`. |

## 1. Tier ladder (unit = hole radius at the start of the tier)

| # | name | r0 → r1 | food |
|---|---|---|---|
| 1 | Rubble | 2.5e3 → 1e4 km | dust rocks, asteroids, comets (with tails), moonlets |
| 2 | Worlds | 1e4 → 4e4 km | big moons, Mercury, Mars, Venus, Uranus, Neptune |
| 3 | Giants | 4e4 → 3.2e5 km | Saturn (rings), Jupiter (+ moons), then **the Sun** (nibbled) |
| 4 | Stars | 1e6 → 1e9 km | dwarfs, giants, binaries, nebula wisps |
| 5 | Systems | 1e9 → 1e12 km | planetary nebulae, clusters of stars as "solar systems", neutron stars |
| 6 | Neighbourhood | 1e12 → 1e15 km | star clusters, molecular clouds (light years) |
| 7 | The Galaxy | 1e15 → 1e18 km | arms, globular clusters, satellite galaxies, Sagittarius A* |
| 8 | Local Group | 1e18 → 1e21 km | galaxies (spiral, elliptical, dwarf) |
| 9 | Cosmic web | 1e21 → 1e24 km | clusters, superclusters, filaments |
| 10 | The Universe | 1e24 → 4e26 km | the web, the voids, the horizon; the end card |

All 11 tiers are in (see §3). Tier definitions are data in `src/space/tiers.js`.

## 2. Build order

1. `src/space/tiers.js` (data + deterministic generators), `src/space.js` (loop, render, HUD, eat rules), `main.js` wiring, `?space`.
2. Perf (`?fps`, `?webgl`), screenshot quality pass, README shots.
3. Tiers 4–6, then 7–10, then the end card and "Begin again".
4. Adversity, power-ups, balance (bot).

## 3. As built

Files: `src/space.js` (loop, eat rules, camera, lens, HUD), `src/space/tiers.js` (data + deterministic generators), `art/space/bake_bodies.py` and `art/space/bake_galaxies.py` (Blender bakes), `public/textures/space/{bodies,galaxies}.png`, `src/blackhole.js` (the exact lens table), `src/main.js` (`?space[&tier=n&bot&simx=N]`, `state.phase === 4`), `src/planetgame.js` (finale button **Devour the sky**).

**Tiers 1–3** (the solar system) are hand-placed (a belt, dwarf worlds, comets, the planets and the Sun). **Tiers 4–11** use `field()`: n bodies, log-uniform sizes, a body of size s lives in a disc of radius max(18, 28 s), so a neighbour of about the hole's size is always a few radii away. Kinds: rock, world, giant (rings), star (+ disc), comet (+ tail), cluster (fuzzy ball), galaxy and cloud (additive sprites). Progress weights are `b^wexp` (0.65 in the solar system, falling to 0 for the big-growth tiers so each decade of size counts the same); a body smaller than a tenth of the hole pays less, so dust cannot be farmed and growth cannot run away. Hole growth is log-capped (0.45/s).

**Look.** The hole is the finale's black hole (shadow, photon ring, thin disk) with the sky bent by the **exact Schwarzschild deflection** (`deflectionLUT()`: alpha(b) integrated numerically, a 512-entry half-float table; the lens equation source = image − alpha/θs, θs = 0.7). The disk is drawn at a virtual elevation of 17°, so the Interstellar arcs show while the camera stays top-down; the tier-up swings the camera low (12°) and lifts the disk. Bodies: one instanced sphere mesh (+ a coarse LOD mesh), one TSL material for every kind sampling the Blender-baked pattern atlas (R albedo pattern, G height, B mask, tinted per body); a cheap bump from the height channel; rings, tails, galaxy sprites and star glare are one instanced quad mesh each. The sky is drawn **once per tier into a cube map** (it was the whole fill cost: 27 → 60 fps at 7× pixel ratio on the dev Mac).

**Feel.** Chains (gulps within 1.8 s, a bonus every fifth), comet ion rush (×1.6 speed for 4.5 s), a meteor storm every 35–60 s, chunks that fly into the hole from big bodies being eaten, camera shake and a flare per big gulp, tier-up sweep + white-out + low camera.

**Budget** (dev Mac, 7× pixel ratio = 32 MP): 59 fps WebGPU and 60 fps `?webgl&q=low`, 17–32 draws, 18–27k triangles in tier 9. Bot pacing (`?space&bot&simx=14`): about 3–4 minutes a tier, about 35 minutes for the whole ladder.

**Adversity and power-ups** (`src/space/extras.js`). *Flares* (tier 2+, every 24–38 s): a 1.6 s telegraph, then a ring expanding from a nearby body; touching it shoves you 3 r clear, dazes steering for 1.3 s and costs 1.5% of the tier. *Tidal pull* (tier 3+): a body 2.5× your size leans on you at up to 0.3 r/s (you move at 0.95). The *rival hole* bites at most twice, then leaves. Power-ups (one at a time, every 26–42 s, 20 s to grab): Magnet (reach ×2.2), Surge (speed ×1.7, credit ×1.25), Shield (flares and the rival cannot touch you), Nova (a shockwave drags everything within 7 r in). Nothing can end the run.

**Results** (`src/space/results.js`): time, swallowed, best chain, rivals, flares, power-ups, time per tier, six stars (under 30 min, 60-chain, six rivals, never bitten, 20 flares dodged with at most 3 hits, 25 power-ups), void dust (250 + 20 per tier + extras + 40 per star), best time. Bots, `?tier`, `?simx` and debug hooks bank nothing. A full greedy-bot run takes about 32 minutes.

**Sound** (`sfx.space`, `sfx.wake`): a bed (sub drone whose root climbs a step per tier, an open fifth with a slow tremolo, a band of solar wind that follows your speed), the existing grind for nibbling huge bodies, pentatonic chain notes, per-power-up cues, flare warning/hit, meteor storm, ion rush, a tier-up chord, rival growl/bite/eaten, a victory chord. ?space starts without a click, so the first touch or key wakes the audio.

**Touch HUD** (`src/space/touch.js`): the steering is still main.js's drag joystick; this draws the stick under the finger, compacts the HUD and the cards on small/coarse screens (safe-area insets, chips under the HUD wherever it wraps), tells a first-time touch player how to steer, and adds haptics (flare hit, rival bite, power-up, tier-up).

**Blender props** (`art/space/build_props.py` → `public/models/space/*.glb`, vertex colours with alpha = emissive): Earth's leftovers in tier 1 (comm satellites, the station, capsules, rocket stages), **The Monolith** in tier 2 (eat it for a bonus), ringworlds in tier 5, neutron stars with jets in tiers 6–7, Dyson shells in tier 7. Each model is one small instanced mesh, drawn only in tiers that use it; capacity is fixed and spares collapse (the WebGPU buffer quirk).

**Not done yet:** per-tier hand-art for the remaining stars/clusters, a human playtest of the numbers.

## 4. Replayability (branch `feature/cosmos-replay`)

`src/space/modes.js`: a seeded **mutator** per universe (Calm, Flare season, Predator, Twitch, Feast, Iron run, Quiet cosmos; the first universe is always Calm; `?mut=` forces one) and six **legacy perks** (Wide mouth, Sprinter, Chain keeper, Fireproof, Hunter, Lucky): the results screen offers three, the pick carries into the next universe (saved; `?legacy=` for tests). Both only change multipliers (`g.k`). A **Daily universe** (menu button, `?space&seed=<date>&daily=1`) is the same universe and mutator for everyone, no legacy perk, one best time per day. The menu buttons appear once a world has been eaten or a cosmos run finished. The software profile gets lighter spheres.

**Fun additions:** four *golden bodies* per tier (rare, sparkling, worth five times their size; the arrow prefers them) and a **frenzy** at chains of 10/25/50 (everything pays double for 6 s). The results screen counts goldens.

## 5. Balance passes (`feature/cosmos-balance`)

Bots (`src/space/bot.js`): `?bot` greedy (perfect, instant), `?bot=human` (decides 5x a second, 0.15 s late, keeps a target, aims a few degrees off, notices power-ups within 14 r, reacts late to hazards, lapses 3% of decisions), `?bot=sloppy` (worse). `?suite=seed:mutator:legacy,...&idx=0&simx=30` runs configs back to back through page loads and stores each result in localStorage (`__space.suite()`, `__space.suiteDone()`, `__space.suiteClear()`).

Changes made from the passes: base suction reach 2.6 r to 3.4 r (strength 2.2 to 2.8 r/s; magnet 7 r); scale-aware tiers 4-11 are 1.6x denser (2.4x for 7, 9, 10) with goals about 0.88; a tier cannot end before the hole has grown to G^0.9, and the hole may not swell faster than ln(G)/100 s a second (a tier lasts at least about 100 s); flares are avoidable (final ring shown during the 2.2 s warning, radius 8 r, 3.2 s expansion); rival bonus 4% to 2.5% and respawn 55 s; chain bonus smaller and capped; tidal pull only from bodies 3.5 r or bigger; supernovae every 75-115 s; Quiet cosmos pays 1.2x (it was 0.8x and took 70 minutes); golden bodies only count on the arrow within 25 r (the bot chased one 100 r away).

Results (all runs won, so there is no dead end): human-like bot, 14 runs on seeds 5, 7, 11, 19, 23: 32-40 minutes (typical tier 100-300 s; tier 5 occasionally 500 s); sloppy bot 36-47 minutes; greedy bot 35-50 minutes (the greedy bot is not faster than the human-like one: more pulling, same travel). All 7 mutators and all 6 legacy perks finished on seeds 11/23 within +-20% of baseline except Quiet before the fix.
