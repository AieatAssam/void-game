# Phase 3 "Planetary" — second principal review

Branch `feature/phase-three` @ `03ca91a`. Reviewer: Opus, 2026-10-03. The first review is `docs/PHASE3-REVIEW.md`. Since then WP-A (fixes and juice), WP-B (adversity), WP-E (pain, the nuke, cities), WP-C (the Moon, the finale, results) and WP-D (polish, perf, audio) have landed.

## How this was reviewed, and what it could not cover

**Read:** `docs/PHASE3.md` §12.x, `docs/BALANCE.md` (Phase 3 sections), `docs/PERFORMANCE.md` (Phase 3), the first review's tick list. In the code: `planetgame.js` (`step`, finale and results flow, debug hooks, `leave`), `threat.js` (`hurt`, `hurtCont`, the mercy window, `sealWatch`, `moonCheck`, the debug API), `bot.js` (`planetSteer`, sweeps), `cities.js`, `finale.js` (keys, `dispose`), `blackhole.js` (the disk), `results.js`, `main.js` (`bankPlanet`, `newRun`, `__tick`). I also ran a size scan of functions and files, and an unused-export scan.

**Ran (Browser pane at `localhost:5174`, WebGPU unless noted):**
- **Regressions:** the town start (`/`, Play, 15 s), `?region&seed=7` and the real `__ascend(false)` (6 snaps through the cinematic), `?nophase3&region`, `?planet&webgl&seed=11` at T1-T4, the 375×812 mobile preset, `npm run build`, `npm run check`.
- **Stepped play** as the human bot on `?planet` (T1 for about 140 s, including a perk draft, an ICBM, a volcano and a carrier group). The Moon from `?planet&r=2200000&land=0.89`. The finale scrubbed with `__finale(t)` from `?planet&finale`. A forced nuke hit (`__threat.seq('nuke')`) at 300 km. A forced laser at 900 km.
- **Balance:** four full games with a **zero-dodge** human bot, and one same-build control with the normal human bot (see §3).
- **Perf:** `__bench` (the `tools/bench-snippet.js` method) at T1, T3 and T4, seed 4242 and seed 7.

**Limitations. Read these before the verdict.**
- **No real-time play.** The pane reported `document.visibilityState = hidden` most of the session, and `requestAnimationFrame` measured **1.3 Hz**. A canvas in a hidden pane is never presented, so the pane's own screenshots were stale; every image below is `__snap`. All feel calls come from stepped snapshots and numbers, not from holding a mouse for 25 minutes.
- **Nothing was listened to.** As in WP-C and WP-D, no person has heard the audio.
- **Not seen this pass:** the Aegis, the cracker and a rival. A forced Aegis needs r ≥ 800 km, and my hole had decayed to 687 km. These three have screens from WP-B in `docs/screens/phase3-threat-*`.
- **My test touched the local save.** The `?planet&finale` debug path banked a "world" into this browser's save: fastest world **0:47**, +208 dust, five world stars (see P1-2).

---

## 0. Verdict: **not yet**

The planet is now a game with an ending, and much of it is beautiful:
- the wound walls;
- the nuke's ray-marched mushroom with its white-out and shock ring;
- the Moon's fall and Roche break-up;
- a 30-second shattering of the world into a lensing black hole.

Every first-review P0 is fixed: sea credit, the night side, the win state, the swath sound, ripe units. No regression was found in Phases 1 and 2, the Ascension, `?nophase3`, WebGL or the build.

**It does not ship, for one design reason and a handful of cheap bugs.**

1. **Adversity is optional, and Phase 3 has no fail state.** A bot that ignores every ring, beam, wave and lid wins in **14.7-27.5 min** (4 runs). The normal dodging bot takes **15.5-26.7 min** (WP-C's 9 runs plus my control at 21.5). The zero-dodger takes **20-35 % of its gains as damage** (13 of its 29 hits in one run were absorbed by the mercy cap). Neither bot has *ever* seen a Sealed warning.
   - Any real human sits between those two bots, so a real human cannot lose and is not rewarded for dodging.
   - The "real pain" is real on screen (§2.3) and nearly free in outcome.
2. **After the finale there is no way back to the game.** Results → Close leaves you on the black hole. Esc only toggles the card, although the hint says "Esc for the menu". The only exits are New World (a reload into another planet) or reloading the tab.
3. **Debug paths bank real rewards in production.** `?planet&finale` (and `?r=` / `&land=`) are live in the built bundle. In about 40 s they grant +208 dust, both skins, five world stars and a 0:47 "fastest world". Every bot sweep banks into the save as well.
4. **The black hole's disk has a hard straight seam.** It is the last frame of the game, and it is in the committed README screen `docs/screens/phase3-finale-blackhole.jpg`.
5. **No named city is visible in T1 on seed 7.** The nearest of the 64 registry cities is 2190 km (55 r₀) from the start, so the WP-E labels never appear in the first tier. The urban blotches read as grey texture.

---

## 1. Regressions (all pass)

| Check | Result |
|---|---|
| Town start (`/`, Play) | Phase 1, playing, a car / pedestrians / fountain render, 0 console errors (`.shots/rv2-town.jpg`). |
| `?region&seed=7` → `__ascend(false)` | Phase 2 → 3. The cinematic has 6 beats (cracks, surge, pull-out to the globe, plunge, the coast). `#status` is empty after the swap (B6 fixed). r 37.1 → 38.0 km in the first 10 s: no coast shrink (B1 fixed). Worst `__tick` 84 ms during the swap, hidden pane. Console: no errors. |
| `?nophase3&region` | Phase 2 plays; `state.planetSlice` false, `__planet` absent: no planet prebuild. |
| `?planet&webgl&seed=11` | "WebGL2 fallback". T1-T4 render via `setR`, 0 errors. The load sat at "Forming the world… 50%" for about 3 min in the hidden pane, because `nextPaint` waits on a 1 Hz rAF. That is an environment effect: the same page loads in about 20 s in a live tab. |
| Mobile (375×812, `quality: low (mobile default)`) | Portrait frame OK; the HUD takes the top 99 px and the news bar the bottom 46 px. (`__snap` never contains the DOM minimap, so its look was not checked.) |
| `npm run build` | Passes in 0.5 s. `noise` chunk 1.1 MB (306 kB gz), `planetgame` 242 kB. |
| `npm run check` | **FAILS: `base + planet`.** The size-ladder check walks the planet pack: oil_rig → destroyer ×1.44, destroyer → cargo_ship ×2, launch_pad → cracker ×750. The planet pack is set pieces, not ladder food. See P2-6. |

---

## 2. As a player

### 2.1 Scale and power

- **T1 is the best-looking tier.** The ripped province walls (`.shots/rv2-t1a.jpg`) and the curved limb with black sky sell "landmass from the first second".
- **The Ascension is still the biggest wow,** and it lands cleanly now.
- **T3-T4 read as a cap on a globe.** At T4 the hole is a deep violet well on a mostly blue planet (`rv2-moon1`, `rv2-laser*`). It feels powerful because of the camera distance and the Moon set piece, not because anything resists.
- **Scale is broken by the silo complexes at T1.** Each pad is about 20 km across (half the hole), and they render as toy-box GLBs next to a 50 km wound (`rv2-t1a`, bottom left).

### 2.2 Readability of threats

- **Nuke:** an excellent read: ring and lock, white-out, fireball, dome, scar (`.shots/rv2-hitm2 … rv2-hit2_5`).
- **The Moon's rain:** concentric rings on the planet under a visibly falling rock with an entry glow (`rv2-moon4`).
- **Fleet and cruise salvos:** small rings around the hole, readable. The carrier is a black silhouette against the sun glint.
- **Laser:** the platform and beam sit on the far horizon (`rv2-laser3/7`). The warm-up spot is far from the hole, so the threat reads as "something over there" more than "a beam coming for me".

### 2.3 "Real pain"

- **The feedback is right:**
  - a dent toward the cause, cracks, a shock ring;
  - chromatic aberration, a red vignette, a camera shove;
  - a −X % chip and a draining segment under the size pill.
- **The consequence is not.** Measured on a forced nuke at 300 km: r 300 → 297 km.
- **Why it doesn't matter:** the win is gated on land %, and r only scales the swath. The mercy window (`threat.js:129`, 25 % per 30 s) caps the worst case.
  - **The Sealed lid can't fire in practice.** It sits at 0.7 × the highest tier floor (`sealWatch`), i.e. 840 km at T4. Sealing a 2000 km hole would take about six back-to-back maxed 30 s windows (0.75⁶ ≈ 0.18) with zero eating in between.
  - **Nothing in the director produces that,** so a hit is a fireworks show with a 1-3 % bill.

### 2.4 Cities

- **T1 on seed 7: no city label in sight.** The registry's nearest city is 2190 km away. Labels need `big || pop > 3e7` within `max(14 r, 1200 km)` (`cities.js:74`).
- **The footprints** are grey noise blotches. At T1 they read as rock or texture, not towns (`rv2-t1a`, `rv2-mobile`).
- **The "X goes dark" beat** therefore first fires in T2. The brief's "city lights you are swallowing" is invisible in the tier where the player learns the game.

### 2.5 Always something larger, and something smaller

- **Smaller:** always true (land units, ships, rockets, rocks).
- **Larger:**
  - T1-T2: silos and fleets are scenery, not "larger".
  - T3: the Maw.
  - T4: the World-Eater for 170 s, then the Moon at 88 %.
  - Between the World-Eater's death and the Moon, a typical 3-5 minutes of T4, nothing is bigger than you.
- **Better than the first review, not solved.**

### 2.6 Height

`state.walls` stays 0 in every sweep (WP-A note), and A10 found no pacing difference with `heightK` 0 or 1. After T1, height is credit (`√h`) and looks. It does nothing a player can feel. Accept it, or cut the claim from the brief.

### 2.7 Pacing

**Tier targets (§12.1) vs the WP-C sweep:**

| Tier | Target | Measured | Notes |
|---|---|---|---|
| T1 | 4-5 min | 4.5-6.9 | |
| T2 | 4.5-5.5 | 2.4-6.9 | seed 3 runs 3.1-3.4 |
| T3 | 5-6.5 | 2.0-11.5 | **T3 is the wild one** |
| T4 | 5-7 | 2.0-7.6 | |
| Total | 19-25 | 15.5-26.7 | 3 of 9 outside |

- My naive seed-3 run spent **11.0 min in T4** and the WP-C seed-3 run 2 spent **11.5 min in T3**. Both were chasing remnants across the planet.
- **The long tails are the boredom risk, not the average.**

### 2.8 The finale

- **Excellent overall:** the fault lines, the rupture, the chunky shards with lit cross-sections, the disk build and the lens (`.shots/rv2-fin*`).
- **Three defects:**
  - **The seam:** a straight cut where the near half of the disk meets the far, lensed half. It is at the left at y ≈ 340/768 and the right at y ≈ 425 (`.shots/rv2-fin29.jpg`; the same seam is in the committed `docs/screens/phase3-finale-blackhole.jpg`).
  - **No way out** (§0.2).
  - **"0 thousand swallowed"** on the card when the count is 0. Four separate `popStr` copies (`finale.js:40`, `planetgame.js:29`, `results.js:32`, `cities.js:11`) disagree on format.

---

## 3. Balance sanity (the evidence behind §0.1)

**What I ran.** A *zero-dodge* human: the `human` `planetSteer`, with `__threat.t.dangers` filtered to `target` / `sat` / `scenery`. It still runs errands (Aegis platforms, cracker stations, ships, satellites) but never leaves a ring, beam, wave or lid, and never dives a ring on purpose (the bot sees the Moon's rocks as rings, so it neither dodges nor dives them). Pages: `?planet&bot&seed=N&nowatch`, `__planetBotAsync(3300,'human')`, `__runSum()`.

| run | min | cum. min at T2 / T3 / T4 | dmg % gains | bonus % | hits | mercy saves | Sealed warns | r end km | biggest damage |
|---|---|---|---|---|---|---|---|---|---|
| naive seed 7 #1 | **19.0** | 4.2 / 11.2 / 15.6 | 34.6 | 8.1 | 29 | 13 | 0 | 2219 | rods 20.7 %, Moon 8.1 % |
| naive seed 7 #2 | **14.7** | 5.3 / 9.0 / 12.7 | 20.4 | 17.2 | 18 | 6 | 0 | 2717 | rods 15.0 % |
| naive seed 3 | **27.5** | 7.3 / 10.5 / 21.5 | 26.4 | 12.5 | 31 | 6 | 0 | 1846 | rods 13.7 %, Moon 6.8 % |
| naive seed 11 | **22.5** | 7.3 / 10.8 / 15.0 | 28.5 | 16.2 | 23 | 9 | 0 | 2349 | rods 20.5 %, Moon 6.9 % |
| control (dodging human) seed 7 | 21.5 | 5.6 / 10.7 / 17.5 | 10.7 | 12.8 | 9 | 4 | 0 | 2181 | rods 4.6 % |

WP-C's dodging runs: seed 7 21.3-21.9, seed 3 15.5-26.7, seed 11 18.4-23.0.

**Reading.**
- **The two bots bracket a real player.** The dodging bot has perfect information and a 0.35 s reaction. The naive bot never dodges at all. A real human is somewhere in between.
- **Both brackets land in the same 15-28 min band, and neither ever seals.** Damage triples (about 10 → 20-35 % of gains) and changes nothing that matters. n = 4 is small and seed 3 alone ran slower, so read this as "no measurable advantage to dodging", not "dodging is worse".
- **Rods dominate damage at T4** (14-21 % of all gains for the naive bot). They are the only weapon whose cost shows in the ledger.
- **Bonus 8-17 % against a ≤ 10 % target.** The Moon's gulps (4-10 %) and cracker fizzles (3-5 %) arrive even for the naive bot.
- **Unfair:** 1 in my control run (and 1 of 9 in WP-C). Both are below the 1.5 s telegraph rule. Watch it, but it doesn't block.

**Why (hypothesis, not proven):**
- The win is land %, and a hit only shaves r. A smaller hole sweeps a narrower swath but moves faster in r/s (`P3.speed` ∝ r^0.7), so the land clock barely moves.
- Dodging costs heading time away from food.
- The mercy cap (25 % / 30 s) bounds the worst case.
- The lid floor is the tier floor, not the player's recent peak.

**What a real human will feel:** "the bombs are spectacular and I can ignore them". That is a 25-minute game with no stakes after the first two hits.

---

## 4. Code risks

| Risk | Where | Severity |
|---|---|---|
| **Debug hooks shipped and banking** | `planetgame.js:125-142` `installDebug` runs unconditionally (`:112`); `?finale` / `?land` / `?r` are in `dist/assets/planetgame-*.js` (`fakeLand` present). `main.js:1097` `bankPlanet` has no guard; `fastFinale` (sweeps) reaches it via `worldStats`. | P1 |
| **Finale not disposed on `leave()`** | `planetgame.js:785 leave()` disposes threat, cities, map and world but not `this.fin`. That leaves `finale.js:152,158` keydown and mouse listeners, the `#finbars` / card / skip DOM, `post.lens.A` and the shard meshes. Unreachable today only because there is no route to the menu (§0.2): fixing the route without this leaks. | P1 (with P0-2) |
| **One 53 KB function** | `planetglobe.js:243 planetMaterial`: 576 lines of TSL. The §12.11 lesson (a shared node first used inside `If` reads as 0 elsewhere) shows how fragile it is to edit. | P2 |
| **God files and long lines** | `planetgame.js` 62 KB (the first review's `debugApi` / `unitsApi` / `ladderTest` → `planetdebug.js` split was not done: `:643-790`). `threat.js` 75 KB (bomber, ICBM and lance still methods). `bot.js planetSteer` 10 KB in one function. Lines up to 804 chars (`bot.js`), 632 (`planetgame.js`), 573 (`planetglobe.js`). | P2 |
| **Dead assets** | `public/models/packs.json` pack `planet` still lists `mushroom_cloud`, `cargo_ship`, `oil_rig` and `aa_battery`. None of them is referenced in `src/`. All are decoded every planet run. | P2 |
| **Per-frame allocations** | `cities.js:71` builds a `THREE.Color` (`C(0xffd9a0, …)`) per city per frame (64), and `cand.push([d, c])` makes arrays per frame. WP-D measured about 5 KB/frame overall and no sawtooth: fine, but this one is a two-line fix. | P2 |
| **Duplicated helpers** | 4 × `popStr` (§2.8). | P2 |
| **Unused exports** | `planetgen.encodeHeight`, `planetglobe.planetUniforms/moonMaterial/patchLayout`, `landforms.H5/nameOf/LEVELS`, `cities.findCities`, `threat.NZ` (internal-only; drop `export`). | P2 |
| **Memory at the swap (D5), allocation rewrites (D4), T1 fill (D2)** | Still open per the first review's ticks. | P2 / see perf |

**Perf: PERFORMANCE.md not reproduced.**
- **What I measured:** `__bench` at pixel ratio 1, 1024×768 (0.79 Mpx), WebGPU high, hidden pane, seed 4242: **T1 25.4 ms, T3 8.7 ms, T4 10.2 ms**. Seed 7 T1: 16.0-16.3 ms; pr 2: 72 ms.
- **What PERFORMANCE.md says:** 8.1 / 4.8 / 5.2 ms, using the same method and the same commit.
- **Reading:** T3 and T4 are about 2× the doc, but T1 is about 3×.
  - A shared GPU (I ran bot sweeps in another tab for part of the session) may explain the uniform 2×.
  - It does not explain the extra T1 factor.
- **Not called a regression.** It must be re-measured in a visible window before ship (P1-5).

**Docs drift.**
- **§12.13** says the Moon starts "from 90 % … once the cracker has settled (or at 94 %)", with hit 4 % / k 8 s. The code (`phase3.js:84`, `cracker.js:27`) has the Moon at **88 %**, hit 3 % / k 6, and the cracker *waiting for the Moon* (or 96 %). BALANCE WP-C has it right.
- **§12.11** says the cracker comes "at 90 % of the land". It now comes after the Moon.
- **§6.7 / §9 "6 MB" snapshot:** still unedited (D3 noted it).
- **§12.13 "Esc brings the card back"** is correct, but the in-game hint (`planetgame.js:450`) says "Esc for the menu".

---

## 5. Punch list

Each item is sized for one Sonnet session, with files, steps and a check.

### P0: blocks ship

**P0-1. Make dodging matter, and make losing possible.**
- **Add the naive bot first,** so the fix can be measured:
  - In `src/bot.js planetSteer`, accept `who === 'naive'`: after `th.dangers(s.buf)`, drop every danger whose `kind` is not `target` / `sat` / `scenery` (the filter used in §3).
  - In `__sweepRows`, add a `who` column.
- **Then pick one or two levers** (try them in this order; each is a few lines):
  - **(a) Hits cost land-clock time, not just area.** A hit also applies `state.stun = k_s` seconds at 0.35× speed and no credit (in `Threat.hurt`, `threat.js:149`). Read it in `PlanetGame.step` next to `state.slow`. Start with `k_s` = 1.5 s for a bomber, 3 s for a nuke or rod, 4 s for a Moon rock.
  - **(b) Damage eats the wound back.** A hit "spits out" a ring of land around the hole, i.e. un-eats `frac × hole.area` of texels near the rim through `bite` (a new `BiteMap.restore(dir, rKm, area)` that raises `rem` on the nearest eaten land texels and fixes `landEaten`). The player then has to re-eat it, so the land clock goes backwards.
  - **(c) The lid follows your peak.** In `sealWatch` (`threat.js:722`), compare r to `0.7 × max(tier floor, 0.6 × state.best)`, so a run that bleeds 40 % of its peak gets the 14 s SEALING warning.
  - **(d) Tighten the mercy window** to 20 % per 30 s **only after** (a), (b) or (c). On its own it only makes damage smaller.
- **Acceptance:** `__planetSweep(3, 3300, 'human')` and the naive sweep on seeds 7 / 3 / 11.
  - The dodging bot stays at 19-25 min with damage 8-15 %.
  - The naive bot is **≥ 20 % slower on average or seals at least once in 3 runs.**
  - Record both tables in BALANCE.md.

**P0-2. A way back after the world (with the leak fix).**
- **Card buttons:** in `planetgame.js finaleButtons` (`:448`), add a 4th button "Menu" that calls a new `ctx.toMenu()` (wire it in `main.js` next to `bankPlanet`).
  - `toMenu()` runs `planetGame.leave(); planetGame = null;` and shows the start menu the way `newRun`'s callers do.
  - In `results.js:66`, `Close` gets the same option via `opt.onClose`.
- **Finale disposal:** in `planetgame.js:785 leave()`, call `this.finaleReset(ctx)` first. It already calls `fin.dispose()`, which removes the listeners, DOM, meshes and lens.
- **Hint:** change it (`:450`) to "Drag to look around — Esc for the card".
- **Check:**
  - `?planet&finale` → Menu → Play a town: no `#finbars`, `#fincard` or `#wres` in the DOM.
  - `getEventListeners(window).keydown` (DevTools) has no finale handler.
  - The lens is off.

### P1: fix before ship

**P1-1. Black-hole disk seam.**
- **Where:** `src/blackhole.js:76-80`. The near half is gated by `q.y < 0.012` with a `smoothstep(-0.012, 0.01, q.y)` fade; the far half by `bv.y > -0.01`. Where the far (lensed) image does not reach the same pixel, the near half ends on a straight line.
- **Fix:**
  - Widen both fades to about ±0.06 in `q.y` / `bv.y`.
  - Let the near half run past the line wherever `farK` is small: `nearK *= 1 - farK` instead of the hard `If`. Keep the `If` only as a cost gate with the wider threshold.
- **Check:** `?planet&finale=29` → `__snap('bh')`: no straight edge at the disk's left and right ends. Re-take `docs/screens/phase3-finale-blackhole.jpg`.

**P1-2. Debug paths must not pay.**
- **Guard the bank:** in `main.js bankPlanet` (`:1097`), return `{ total: 0, parts: {} }` without touching `save` when any of these hold:
  - `window.__bot` or `window.__headless`;
  - `/[?&](finale|land|r|defcon)\b/` in `location.search`. Leave `seed` and `ng` alone: New World uses `?planet&ng=1&seed=N`.
- **Skip the stars:** in `planetgame.js worldStats` (stars, `progress.js` world stars), skip under the same predicate.
- **Gate the URL hooks:** gate `installDebug`'s `?finale` and `?land` handling with `import.meta.env.DEV`. Keep `__planet` etc. if the sweeps need them in prod, but not the URL hooks.
- **Check:**
  - `npm run build && grep -c fakeLand dist/assets/planetgame-*.js` → only the `__finale.fake` reference, or 0.
  - `?planet&finale` → Results shows "practice" (or no pay) and `localStorage` is unchanged.
- **Also:** tell the user that this machine's save now holds bot and debug worlds (fastest 0:47, 52 worlds). Offer a `save.worldFastest` reset.

**P1-3. Cities you can see in T1.**
- **Where:** `src/cities.js`. `findCities` keeps 64 maxima on 16-texel cells at 0.075 rad. Near the start that leaves nothing within 1200 km.
- **Fix:** add a second, local pass for the start region. At `placeStart` (`planetgame.js:65`), run a fine search (4-texel cells, ≥ 0.01 rad apart) of the density bake within 25 r₀ of the start. Register up to 12 "towns" (pop from the same people-per-light, not `big`).
- **Label rule:** label `!c.big && d < 10 r` candidates as well (`cities.js:74`).
- **Footprint shade:** give it a 15 % warmer / brighter albedo at T1 so it doesn't read as rock (`planetglobe.js`, the "cities" block).
- **Check:** `?planet&seed=7`, the first 60 s: at least 2 named labels on screen and at least 1 "goes dark" chip. Same on seeds 3 and 11.

**P1-4. T3 / T4 long tails.**
- **The problem:** T3 takes 2-11.5 min and T4 up to 11 min (§2.7). Both tails are remnant chasing.
- **Read the tails first.** In `bot.js botLoop`, log `landEaten` per 30 s and the distance to the goal arrow's target. Find whether the tail is crossings (sea) or a goal that points at a far remnant.
- **Then one of:**
  - `pullCheck` reach × 1.5 from 90 % (`bite.js`);
  - the arrow (`planetgame.js goalTick`) targets the *nearest* standing unit of the tier's level, not the named goal, once the goal is ≥ 85 % eaten.
- **Check:** max tier time ≤ 8 min over 9 runs.

**P1-5. Re-measure perf in a visible window.**
- Run `await __tiers([40000, 150000, 450000, 1200000])` (`tools/bench-snippet.js`) with the pane **visible** and nothing else on the GPU, plus `?off=mid` at T1. Update `docs/PERFORMANCE.md` either way.
- **If T1 at pr 1 is > 12 ms on Apple Silicon,** do D2: the no-close material variant, or move the mid-scale terrain's 3 × 4-octave gradient to 2 evaluations with a central difference on a baked height texture.

**P1-6. Docs drift** (§4): fix §12.13 (Moon 88 %, hit 3 % / k 6, the cracker waits for the Moon, or 96 %), §12.11 (cracker after the Moon), §6.7 / §9 (snapshot ≈ 17 MB, per D3).

### P2: polish and hygiene

- **P2-1. Silo scale at T1.** In `threat.js:77` `siteMesh`, scale the `missile_silo` parts to ≤ 0.12 r (about 5 km at 40 km), or replace them with a ground decal + one GLB per site (the D7 leftover).
- **P2-2. Something larger in late T4.** If the World-Eater has died and land < 88 %, spawn a second, short-lived rival from `planetrival.js` at 1.25× (`T3.kinds.rival.ttl.eater2 = 90`). Or bring the Moon's *approach* (the falling impostor growing in the sky) forward to 80 % as a looming threat.
- **P2-3.** One `popStr` in `src/threat/kit.js`, imported by the four files. Fix the card's "0 thousand" ("nobody" / "0").
- **P2-4.** Drop `mushroom_cloud`, `cargo_ship`, `oil_rig` and `aa_battery` from the `planet` pack in `public/models/packs.json`, and from `PLANET` in `blender/build_all.py`. Keep the GLBs in `public/models` only if the gallery needs them.
- **P2-5.** `cities.js:71`: hoist the two `C(...)` colours to module constants. Make `cand` reuse a preallocated array of `{d, c}`.
- **P2-6.** `tools/check-ladder.mjs`: skip pack `planet` (its food is the land), so `npm run check` passes again.
- **P2-7.** Code motion, no behaviour change, one commit each:
  - `planetgame.js` `debugApi` / `unitsApi` / `ladderTest` / `installFinaleDebug` → `src/planetdebug.js`;
  - split `planetMaterial` into `landNodes()`, `woundNodes()`, `zoneNodes()`, `cityNodes()`, `capNodes()` returning nodes (keep `.toVar()` at the declarations);
  - wrap lines > 200 chars in the Phase 3 files.
- **P2-8.** Remove `export` from the internal-only symbols listed in §4.
- **P2-9. Height.** Either let walls bite at T2 (`P3.heightK` × 2 above 150 km for massifs > 6 km) and verify `state.walls > 0` in a sweep, or delete "height matters past T1" from the brief and the README.

---

## 6. Ship call

**Not yet.** P0-1 is a design change with a measurable gate, about one loop. P0-2 and P1-1 to P1-3 are small, about half a day together. Everything else can follow the ship.

**The next loop should focus on, in order:**
1. **P0-1 with the naive bot as the gate.** The planet needs stakes before it needs more spectacle.
2. **P0-2, P1-1, P1-2:** the exit, the seam, the save hygiene.
3. **A human pass:** one person plays a full 25-minute world in a visible window, with sound on, and writes down where they were bored, confused or scared. Nobody has done this for Phase 3 since WP-A. It is the only way to judge the audio, the pain and the pacing tails, and it should gate the ship call that follows.
4. **P1-3, P1-4, P1-5.**

**For the next stage (the black hole eats planets): don't build it yet.** Its hook is already in the finale card ("The void is hungry for more…"). Keep the finale's closed-form `t` architecture and the post-pass lens: both carry straight over.

---

## 7. Loop 2 ticks (commits fdf9e07 .. HEAD)

- [x] **P0-1** stakes: stun + wound + tier-scaled floors + lid follows the peak, `naive` bot; naive +23% slower, 3-5x the hits, Sealed 1 of 9 (docs/BALANCE.md "loop 2"). Partly: the dodger's seed 7 mean (28.8) is over target and its damage 13-23% is over the 8-15% aim; no (b) land-restore, no (d) tighter mercy.
- [x] **P0-2** exit: Menu on the card and on Results, `ctx.toMenu()` (leave + reload to the start menu), `leave()` runs `finaleReset`, hint says "Esc for the card". Checked: Results shows `wr-menu`, `leave()` removes `#wres`, `fin` is null. Also fixed `main.js` calling `leave()` without ctx.
- [x] **P1-1** disk seam: images cross-fade over a wide band; README screen re-taken.
- [x] **P1-2** `devRun()` guard: no dust / stars / records for bots or `?finale|land|r|defcon` (`?banksave` overrides); URL hooks `import.meta.env.DEV` only (`fakeLand` stays reachable through `__finale.fake`). Checked: Results says "practice", localStorage unchanged. **This browser's save still holds the old debug worlds (fastest 0:47, 52 worlds, +208 dust); reset `save.worldFastest` / `worlds` by hand if wanted.**
- [x] **P1-3** 12 start towns (`findTowns`), labelled within 10 r; footprint tan. Seeds 7 / 3 / 11: 2-3 labels in the first second, nearest town 2.2-3.8 r0.
- [~] **P1-4** tails: pull reach x1.5 from 90% only; the goal-arrow change was not done. Dodger tiers 1.9-10.7 min (worst a T2), T4 <= 8.3; naive tails to 14.8.
- [~] **P1-5** visible-window fps recorded (PERFORMANCE.md): 52 / 48 / 44 / 40 fps at DPR 2. D2 not done, `?off=mid` not measured.
- [x] **P1-6** docs drift fixed (Moon 88%, cracker after the Moon, 17 MB, Menu).
- [x] **P2-1** silos 0.12 r. **P2-2** a second, 90 s World-Eater (1.25x) 30 s after the first and below 88% land. **P2-3** one `popStr` ("nobody"). **P2-4** four dead assets out of the pack and `build_all.py`. **P2-5** cities per-frame garbage. **P2-6** `npm run check` green. **P2-8** unused exports internal. **P2-9** height claim withdrawn (PHASE3.md section 3).
- [~] **P2-7** only the debug split (`src/planetdebug.js`); `planetMaterial` split and long-line wrapping skipped.
- Still open: a human 25-minute pass with sound; D2/D4/D5 perf; the Aegis / cracker / rival not re-seen.
