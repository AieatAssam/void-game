# Phase 4 — Cosmos: the black hole eats the sky

Phase 3 ends with the planet shredded and the hole turned into an honest black hole ("The void is hungry for more…").
Phase 4 is what it eats next: **the solar system, then other stars and their systems, then galaxies, then the universe.**

## 0. Decisions at a glance

| Question | Decision |
|---|---|
| Avatar | The finale's black hole: `holeSphere` (black), `holeHalo`, and the post `lens` (shadow, photon ring, Doppler-beamed disk, bent starfield). No new hole art. |
| Frame | **Render space is in units of the hole's radius.** The hole sits at the origin with r = 1; the world moves under it (positions are doubles in *tier units*, drawn as `(p - hole) / r`). Precision never degrades, the camera framing, speed (8.3-10.3 r/s: a screen's short side in 1.5 s, `src/space/frame.js`; up to 30% more for a few seconds after eating, the jets in §8) and the steering response (0.18 s to speed, 0.15 s to stop) are the same at every size, so growth can never feel sluggish. Scale is shown by the HUD, the dust field and the things that get eaten. |
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

**Tiers 1–3** (the solar system) are hand-placed (a belt, dwarf worlds, comets, the planets and the Sun). **Tiers 4–11** use `field()`: n bodies, log-uniform sizes, a body of size s lives in a disc of radius max(12, 18 s) (was max(18, 28 s)), and `src/space/near.js` streams the field round the hole, so a neighbour of about the hole's size is always a few radii away. Kinds: rock, world, giant (rings), star (+ disc), comet (+ tail), cluster (fuzzy ball), galaxy and cloud (additive sprites). Progress weights are `b^wexp` (0.65 in the solar system, falling to 0 for the big-growth tiers so each decade of size counts the same); a body smaller than a tenth of the hole pays less, so dust cannot be farmed and growth cannot run away. Hole growth is log-capped (0.45/s).

**Look.** The hole is the finale's black hole (shadow, photon ring, thin disk) with the sky bent by the **exact Schwarzschild deflection** (`deflectionLUT()`: alpha(b) integrated numerically, a 512-entry half-float table; the lens equation source = image − alpha/θs, θs = 0.7). The disk is drawn at a virtual elevation of 17°, so the Interstellar arcs show while the camera stays top-down; the tier-up swings the camera low (12°) and lifts the disk. Bodies: one instanced sphere mesh (+ a coarse LOD mesh), one TSL material for every kind sampling the Blender-baked pattern atlas (R albedo pattern, G height, B mask, tinted per body); a cheap bump from the height channel; rings, tails, galaxy sprites and star glare are one instanced quad mesh each. The sky is drawn **once per tier into a cube map** (it was the whole fill cost: 27 → 60 fps at 7× pixel ratio on the dev Mac).

**Feel.** Jets (what you eat speeds you up for a few seconds, §8), chains (gulps within 1.8 s, a bonus every fifth), comet ion rush (×1.6 speed for 4.5 s), a meteor storm every 35–60 s, chunks that fly into the hole from big bodies being eaten, camera shake and a flare per big gulp, tier-up sweep + white-out + low camera.

**Budget** (dev Mac, 7× pixel ratio = 32 MP): 59 fps WebGPU and 60 fps `?webgl&q=low`, 17–32 draws, 18–27k triangles in tier 9. Bot pacing (`?space&bot&simx=14`): about 3–4 minutes a tier, about 35 minutes for the whole ladder.

**Adversity and power-ups** (`src/space/extras.js`). *Flares* (tier 2+, every 24–38 s): a 1.6 s telegraph, then a ring expanding from a nearby body; touching it shoves you 3 r clear, dazes steering for 1.3 s and costs 1.5% of the tier. *Tidal pull* (tier 3+): a body 2.5× your size leans on you at up to about a third of your speed (0.2 r/s per body against the old 0.95 r/s, scaled by speed / 0.95). The *rival hole* bites at most twice, then leaves. Power-ups (one at a time, every 26–42 s, 20 s to grab): Magnet (reach ×2.2), Surge (speed ×1.7, credit ×1.25), Shield (flares and the rival cannot touch you), Nova (a shockwave drags everything within 7 r in). Nothing can end the run.

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

Changes made from the passes: base suction reach 2.6 r to 3.4 r (strength 2.2 to 2.8 r/s; magnet 7 r; since §8 the strength is scaled by speed / 0.95, about 30 r/s peak); scale-aware tiers 4-11 are 1.6x denser (2.4x for 7, 9, 10) with goals about 0.88; a tier cannot end before the hole has grown to G^0.9, and the hole may not swell faster than ln(G)/100 s a second (a tier lasts at least about 100 s); flares are avoidable (final ring shown during the 2.2 s warning, radius 8 r, 3.2 s expansion); rival bonus 4% to 2.5% and respawn 55 s; chain bonus smaller and capped; tidal pull only from bodies 3.5 r or bigger; supernovae every 75-115 s; Quiet cosmos pays 1.2x (it was 0.8x and took 70 minutes); golden bodies only count on the arrow within 25 r (the bot chased one 100 r away).

Results (all runs won, so there is no dead end): human-like bot, 14 runs on seeds 5, 7, 11, 19, 23: 32-40 minutes (typical tier 100-300 s; tier 5 occasionally 500 s); sloppy bot 36-47 minutes; greedy bot 35-50 minutes (the greedy bot is not faster than the human-like one: more pulling, same travel). All 7 mutators and all 6 legacy perks finished on seeds 11/23 within +-20% of baseline except Quiet before the fix.

## 6. Spectacle (branch `feature/cosmos-spectacle`)

Seven more Blender props (`art/space/build_props.py`): **freighter** and **miner** (tier 1; eating one spills gold cargo rocks), **void whale** (tiers 2, 4, 7; weaves, and bolts when you are near but is slower than you), **alien relic** (tier 2; grants a random power-up), **gas refinery** (tier 3; spills cargo) and **warp gate** (tiers 3, 5, 6; eating it jumps you along your heading (12 r then; since §8 3.5 s of travel, about 36 r) with a speed boost), and the **siege orb** (tiers 5, 6): the nearest orb within 18 r aims a red beam for 1.5 s then fires for 0.6 s; stand out of the line to dodge, a hit shoves you, dazes you for 0.9 s and costs 0.6% of the tier; eating the orb ends it and pays 2%. The first balance pass with big, frequent orbs made tier 5 take 40+ minutes (80-160 hits); orbs are now 0.8-4 r (tier 5) and 2-15 r (tier 6), shoot every 9-14 s and wait 14 s after a hit. Human-bot suite afterwards: 2034, 2243, 2196 s, all won.

## 7. Feeling the growth (branch `feature/cosmos-growth`)

Problem: the world is drawn in units of the hole's radius, so the hole is the same size on screen at every scale and growth reads as "the background shrinks". Changes:
- **Camera closes in** as a tier goes on, eased on log progress, and the tier-up steps back out (the tier-up camera pull is stronger, 1.6x). This branch closed the distance by up to 36% (the hole swelled about 1.5x); since §8 the hole's screen share goes from 0.13 to 0.16 of the short side, a 1.23x swell.
- **The lens and the disk grow with the whole run:** the sky bends more (thetaS 0.9 to 0.5) and the disk's outer edge widens (2.6 to 4.0 shadow radii); a gulp makes the hole swell for a beat.
- **A size ladder** (`src/space/ladder.js`): a log scale from Earth to the universe with a pointer at the hole's real radius, the last thing you passed and the next one named, and a "x1000 since the start" read-out. The size pill uses the same formatter (the light-year thresholds were wrong before: tier 10 read "0.0 bn ly").

More Blender props (11 more, `art/space/build_props.py`): solar sail and asteroid base (1), crystal clusters (2-3), gas mantas (3), generation ships (4), motherships and jellyfish (5-6), nebula serpents (6-7), cosmic eggs (7, 8, 11: hatch into cargo and a Nova), star hubs (8-10), void eyes (10-11: they watch you). Creatures weave and the small ones flee (`CRE` table). Prop meshes now have exactly the capacity the tiers need, and heavy models were decimated (tier 6: 174k to 103k triangles). Human-bot suite after: 1976-2222 s, all won.

## 8. Space overhaul (scale, speed, density, jets; branch `feature/space-overhaul`)

The complaint after §7: the hole filled too much of a phone, it crawled (0.95 r/s, 9.6 s to cross a Pixel 7's width), space looked empty, and nothing in the game said why a black hole could dart from body to body.

**Framing** (`src/space/frame.js`, shared with `tools/space-scale.mjs`): the camera distance is solved for a hole *diameter* share of the screen's **short side** (the width of a portrait phone, the height of a desktop): 0.13 at the start of a tier easing to 0.16 at its end (log progress, smoothstep), inside the 1/8-1/6 band. On a 412x915 Pixel 7 that is 54 → 66 px (distance 75 → 61 r); on 1280x720, 94 → 115 px (34 → 27 r). It replaces BASE_DIST 19 x LENS x portraitK with the 36% close-in, which showed 91 → 142 px on the phone (0.22 → 0.34 of the width) and 0.15 → 0.24 on a desktop. The tier-up steps back by 1.23x through the sweep's existing pull and easing.

**Near-hole sizes** (`src/space/near.js`): r grows x4 to x4000 inside a tier while the field is laid out once, so twice a second `herd()` keeps 10 edible bodies (0.3-0.8 r) and 2 threats (1.5-4 r) within 16 r: right-sized bodies beyond 20 r are moved into a 10-26 r ring and bodies over 6 r near you are moved out to 60-90 r, only while both spots are off screen (camera frustum), never keys, props, comets, nibbled bodies or meteors. Sizes, weights and the tier total are untouched (only places change), so progress, `finishTier` and the bots work as before. The solar tiers had nothing of the hole's size late in a tier, so they got real-sized generic bodies: stray moons (1,500-3,500 km) and rogue worlds (4,000-6,500 km) in tier 1, rogue worlds (3,500-28,000 km) and rogue giants (40,000-70,000 km) in tier 2, brown dwarfs (60,000-104,000 km) and red dwarfs (100,000-240,000 km) in tier 3. This raises the tier weight totals (seed 7: tier 1 99 → 137, tier 2 62 → 97, tier 3 74 → 121), which still needs a bot pacing pass.

**Speed and density**: top speed = short side / 1.5 s = 2 / share / 1.5 = 10.3 r/s at the start of a tier, 8.3 r/s at its end (was 0.95 r/s: 9.6 s to cross a phone), portrait and landscape alike. The stick's velocity approaches the input with tau 0.08 s (90% in 0.18 s) and 0.05 s when released (95% stopped in 0.15 s), frame-rate independent; the multipliers (ion rush, Surge, stun, mutators, perks) are unchanged, and the jets below add one more. Everything tuned against 0.95 r/s is scaled by speed / 0.95 so it keeps its relation: creature flee speeds, the rival, suction strength (clamped so a body never overshoots the centre), tidal pull. `herd()` now streams: every 0.25 s, 12 moves a pass (60 on a tier's first pass, so the field is full from the start), a 48 r disc at the start of a tier (beyond the 43 r a portrait phone sees ahead) that shrinks with the camera (x SHARE0 / share, 48 → 39 r), and in it 100 edible bodies (0.3-0.8 r), 12 threats (1.5-4 r) and 24 crumbs (0.1-0.3 r), spots 80% within ±63° of the heading and always off screen; when no real right-sized body is left outside the disc, an eaten body (or a far speck under 0.05 r) is reused at a right size and pays 0.4 of a fresh one. The first density pass (40 edible + 5 threats in a fixed disc) gave 5.1 → 3.4 expected edible bodies on a Pixel 7 portrait screen and screenshots of tier 1 showed one; now it is 100 / (π 48²) = 0.0138 per r² over 923 r² = 12.8 at a tier's start, and since the disc shrinks with the view, 12.8 at its end too (610 r², density x1.51), plus 1.5 threats and 3.1 crumbs (landscape 1280x720: 10.2 edible). Landmarks (keys, proper names, props, comets, golden bodies, meteors) are never reused; eaten galaxies and clouds are (a sprite is drawn at its body's size, and tiers 9-11 are nothing but galaxies). Nothing new is allocated: bodies are pooled, the largest tier has 704 against CAP 1500, and the draw calls are unchanged. Every tier now has minTime 120 (at least 108 s), so reused food cannot shorten a tier. Dust box 48 x 64 r, shifted ahead. `node tools/space-scale.mjs` prints all of it plus a deterministic streamed run per tier.

**Jets** (`src/space/frame.js` `fuelGain`, `jetK`): the game's answer to "why is it so fast". What the hole eats comes back out as jets, and the jet behind it pushes. Each gulp adds fuel: fuel += (1 - fuel) x 0.4 x clamp((q - 0.03) / 0.47), with q the body's size over r, so a speck adds almost nothing and a body of 0.5 r or more adds 0.4. Back-to-back gulps stack with diminishing returns (0.40, 0.64, 0.78 ...) and fuel never reaches 1. Nibbling a body too big to swallow creeps fuel toward 0.35. Fuel decays with tau 1.3 s (a third left after 1.4 s, a tenth after 3.0 s). Top speed is multiplied by 1 + 0.3 x fuel: x1.12 after one 0.5 r gulp (x1.06 a second later), x1.19 after two, x1.24 after three, x1.30 at most, so 10.3 r/s at the start of a tier reaches up to 13.3 r/s. It stacks with ion rush (x1.6) and Surge (x1.7). The rival, creature flee speeds and suction do not use it, so "slower than you" still holds. Fuel resets at each tier and the sweep adds none. In the deterministic run of `tools/space-scale.mjs` the boost averages x1.17 to x1.19 and peaks at x1.25 to x1.28. The bots get the same boost. A human-bot suite has not been run since.

**Density run** (`node tools/space-scale.mjs`, portrait 412x915, a hole seeking the nearest edible body on screen, seed 7). Edible on screen, mean (p10-p90): tier 1 12.8 (6-20), tier 2 12.8 (6-22), tier 3 12.0 (5-18), tier 5 12.4 (6-21), tier 8 11.5 (2-26), tier 11 13.5 (7-20); crumbs 3-5 (12.6 in tier 8, whose own field is crumb-rich), threats about 2 (7.5 in tier 5 and 5.3 in tier 8: their own fields lay many; herd() only adds threats, it moves out only bodies over 6 r). Before: 3.6-5.9 edible. Tier times 108, 108, 109, 110, 109, 108 s (were 108, 109, 166, 182 s for tiers 1, 3, 5, 8). The floor is the log growth cap: r may rise by at most ln G / minTime a second and a tier ends only at r ≥ G^0.9, so no tier can end in under 0.9 x 120 = 108 s however much is eaten; denser food brings the slow galactic tiers down to that floor, it cannot go below it. Reused bodies pay 59-80% of the solar tiers' credit and about a third in tiers 5-11; farming them only fills the progress bar sooner, the hole still grows at the capped rate.

**Showing the jet**: the comet-tail mesh's last instance slot (`tailMaterial`, a per-instance `aJ`: kind, gain, knot phase), so it costs no extra draw call, no compute and no per-frame allocation. It is a narrow plume lying in the plane, pointing away from the hole's travel (it keeps its last heading while you coast), with a blue-white core, a violet sheath and knots running outward. Length in r: 1.5 + 3.5 x stick, times 1 + 0.6 x fuel (1.5 r idle, 5 r at full stick, 8 r with full fuel; the hole's shadow covers the first r); width 0.9 + 0.5 x fuel r. Gain: (0.15 + 0.55 x stick) x (1 + 2.6 x fuel), capped at 2 (0.7 cruising, about 1.4 after a good gulp). It is additive and fades toward the tip, so bodies behind it stay visible. On a Pixel 7 at the start of a tier (54 px hole, 27 px per r) the full-speed jet reaches about 135 px from the hole's centre and 215 px with full fuel, 24 to 38 px wide (less where the camera's 56° pitch foreshortens it). It shows only during play.

**The line**: when phase 4 starts (from the finale or `?space`), the first hint says "Each thing you eat fires your jets and speeds you up for a few seconds." It fits a 412 px phone in two lines. The start hints now run one after another, 4.8 s apart: the jet line, then "Swallow what fits" (or the tier blurb), then the mutator and perk. They wait for the first-touch steering hint (`src/space/touch.js`) instead of cutting it off.
