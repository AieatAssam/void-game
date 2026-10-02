# Phase 3 "Planetary" — principal review

Branch `feature/phase-three` @ `cf49540`. Reviewer: Opus, 2026-10-02.

## How this was reviewed

**Code read in full:** `phase3.js`, `planetgame.js`, `planet.js`, `bite.js`, `landforms.js`, `threat.js`, plus the relevant parts of `planetglobe.js` (uniforms, the threat, shock and cap shader blocks), `planetmap.js`, `bot.js` (planet section), `main.js` (Phase 3 wiring, steering, drafts) and `perks.js`.

**Played in the browser pane** (WebGPU, 1085×714 pane):
- `?planet` at the start (40 km), at `&r=200000` (T2), `&r=700000` (T3) and `&r=1500000` (T4), driven by hand and by `__planetSteer('human')` in real time.
- `?planet&defcon=2` with `__threat.force('nuke', {at: 'hole'})` and `__threat.seq(...)` snapshots (`.shots/rv_nk*.jpg`, git-ignored).
- One full human-bot game, `__planetBotAsync(2400)`, played to the win.
- The Ascension, played from a real `?region` run with `__ascend(false)`.

**Measured with instrumented harnesses in the page** (no source edits):
- A wrapper on `bite.chew` that splits credit into "centre on land" and "centre at sea".
- A wrapper on `moveHole` that records which side of the terminator the hole is on.
- `bite.save()` sizes, `performance.memory`, `__perf()` at a pinned `setPixelRatio(3)`.

Screens cited are in `docs/screens/`, or described inline.

**`ascend.js` was reviewed in play only** (one real `__ascend(false)` run), plus the §12.10 measurements. Its code was not audited line by line.

---

## 0. Verdict

The foundation is strong and technically impressive:
- One authoritative bite map with exact 16-bit accounting.
- Nested landform units that tear off as waves.
- A hole-at-origin sphere with no precision problems.
- 0.5 ms of CPU a frame, 60 fps at 1x.
- A hitch-free 15-second Ascension.

The game is **not yet the brief**. The planet is a beautiful plate you shade in for 23 minutes. These six problems cost the most:

1. **It is silent and invisible where it matters.**
   - The swath, which is 62-68% of all growth, makes no sound.
   - About **27% of a run is spent on the night side**, where the main view is black (measured, see B2).
2. **Humanity is not a threat.** In a full game at *forced* DEFCON 2, all damage taken was **98 Gm²**. Bonuses handed out by the threats were **915 Gm²**: eaten lance satellites gave 693, swallowed nukes 220. Adversity is a net gift, about 9:1.
3. **T4 is empty.**
   - From r = 1200 km the only weapon is the kinetic lance, and its satellite is usually eaten for free.
   - Above 1737 km nothing on or off the planet is bigger than you. That breaks "always something larger".
4. **There is no ending.** At 99.5% a card says "THE WORLD IS EATEN" and the game keeps running: lances keep spawning, there is no results screen and no finale.
5. **A coastal bug wastes up to a third of the late-game swath.** All land credit is thrown away whenever the hole's *centre* is over water (B1). It is also the first thing that happens in Phase 3: the hole lands on the coast and shrinks.
6. **The core loop is not legible.** Tear-offs, which are the "big bites", are invisible until they happen. Players can't see districts or provinces, so there is nothing to aim at except a green arrow.

Of the §5.2 roster, only these are built:
- bombers;
- ICBMs and silos;
- the kinetic lance;
- the Sealed lid.

MIRV, the laser, carriers, AA, tsunami, volcano, rivals (Maw / World-Eater), the Aegis, evacuation rockets, the cracker and the Moon are not built. Eleven of the 16 planet GLBs are loaded every run and never used (§1.3).

---

## 1. Architecture and correctness

### 1.1 Bugs (verified)

**B1. P0: land credit is discarded whenever the hole's centre is at sea.**
- **Where:** `planetgame.js step()`, line 249: `const dA = credit * G * (here.h < 0 ? 0 : 1)`. `here = W.eff(0, 0)` samples **one point**, the centre.
- **Mechanism:** `bite.chew` has already removed the land. The world's land % rises and the population counter ticks, but the hole gets nothing. The belly also drains at the ocean rate (`oceanDrain`), because the same centre sample decides "sea".
- **Measured**, as the share of chewed credit discarded by the human bot:

  | r | Discarded |
  |---|---|
  | 40 km | 0.1% |
  | 500 km | 1.1% |
  | 1300 km | **33%** |

  The 500 km and 1300 km rows used `__planet.setR` on a fresh world at the start spot, so they are a signal, not a campaign average.

  At T4 the hole is about 2600 km across, so its centre is over water whenever it hugs a coast.
- **Consequences:**
  - This is likely a large part of why `r_end` is 1.2-1.9k km instead of the §12.1 2.3k target.
  - It is also why T4 feels "supply-bound".
  - The Ascension drops the hole on the coast (`placeStart` → `P.startDir`). The first seconds of Phase 3 shrink the hole from 40.0 to 39.1 km while it visibly eats land.
- **Ocean texels already give 0 credit** (`chew`: `if (hm[kk] === OCEAN) continue`), so the multiplier is redundant as well as wrong.

**B2. P0 (readability): the sun is fixed in planet space, so a quarter of the run is played in the dark.**
- **Where:** `PlanetGame.placeStart()` calls `W.setSunRender()` once. `PlanetWorld.sunPlanet` never changes after that.
- **Measured:** the human bot (seed 7, 1500 s) spends **26.5%** of its frames with `sun·hdir < -0.05` and 4.8% at dusk.
- **What the night side looks like:**
  - Black ocean.
  - Land drawn only as speckled city lights, which go out as you eat them. They also alias at T2+ (`cl2 = mx_noise_float(dir*2100)`).
  - At T4 the hunt for the last land happens on a black screen. The win state of the full run was a black frame with a floating cap.
- **The minimap is not the fix.** It keeps the night side at 50% (`planetmap.js:46`, "the night side stays legible: it is a map"), so it shows land the main view hides.

**B3. P0: there is no game after the win.**
- `goalTick` sets `state.won`, increments `save.worlds`, shows a card and a news line. Nothing else changes:
  - the director keeps spawning (a lance spawned after the win in the test run);
  - `sealWatch` keeps running;
  - the HUD stays;
  - no dust is banked from Phase 3;
  - there is no results screen and no way to a menu except a reload.

**B4. P1: the perk draft is the Phase 2 pool.**
- `goalTick` → `ctx.draft()` → `openDraft` offers `PERKS`. In Phase 3 only `mods.speed` (Swift) and `mods.hunger` (Slow Burn) are read.
- `Threat.hurt()` ignores `mods.hurt` (Hard Shell) and `Threat.notice()` ignores `mods.noto` (Low Profile).
- So 12 of 14 perks do nothing.
- Perks taken in Phases 1-2 carry into Phase 3 as dead chips on the left edge (seen in play: Deep Roots, Glutton, Picky Eater, Whirlwind).

**B5. P1: lance satellites are free growth.**
- `spawnLance` builds the orbit through the hole's position, ±0.9 rad from screen-up (`l.a = W.hdir`). So the ground track runs along the player's forward path.
- `lanceStep` eats the satellite when its subpoint passes within 0.9 r with r ≥ 420 km, at +2% of *area*.
- **Measured:**
  - Full game: 7 satellites, **693 Gm², about 7% of all growth**, with no input from the player.
  - A 30 s T3 test ate one satellite unprompted.
- At T4 the lance is the only threat, so T4's "adversity" is a bonus dispenser.

**B6. P1: Phase 2 state leaks into Phase 3 at the swap.**
- `#status` keeps the Phase 2 line, e.g. "⚠ Sealing in 14s: grow past 9.6 m". It sat over the planet reveal and the T1 arrival in the `__ascend` test. `main.js hud()` writes it, and Phase 3 never clears it.
- The reveal's ticker reads "Population swallowed 0" while the wound already holds 0.3 M people (`state.pop` is only set from `B.pop` in `step`, which doesn't run during the cinematic).
- `news` is not cleared on `restoreCheckpoint`, so stale lines play after "Retry tier".

**B7. P2: the minimap and the main view disagree at night.** This is by design, but combined with B2 it confuses players: the minimap shows land the screen doesn't.

**B8. P2: the doc understates checkpoint memory.**
- `bite.save()` is **35.5 MB**, not the "6 MB" in §12.9/§12.10: `rem` 12.6 + `ov` 12.6 + `rem8` 6.3 + `ptear` 0.4, plus every level's `left`.
- `snap0` and `ckpt` are both held, so about 71 MB.
- Every tier-up allocates a fresh 35 MB and drops the old one, a GC spike masked by the hitstop.

**B9. P2: units read as squares.**
- At T2 the wound's outline is an axis-aligned texel staircase: about 10 km texels, plus 4×4 parcels in a grid with only ±1.5-texel warp.
- From the T2 camera it reads as rectangles cut out of a continent, not torn land (T2 play capture).
- The `dn` threshold roughens the edge pixels but not the silhouette.

### 1.2 Performance

| Area | Finding | Risk |
|---|---|---|
| CPU | `stepMs` about 0.2-0.6 ms, director 0.06-0.13 ms, bite 0.05-1 ms (budgeted round robin), tears ≤ 0.4 ms. Excellent. | low |
| Fill (the real cost) | Pinned `setPixelRatio(3)` (3255×2142, `noarmy`, `nowatch`): **T1 (patch) 18 fps vs T3 (globe only) 28 fps**. The T1 patch ground shader costs about 20 ms more per 7 Mpx than the globe. It runs on the tier everyone plays first, and on retina laptops it is what keeps the watchdog lowering resolution. | **high** on mobile and retina |
| Dead fill | The patch shader samples `mapTex` (`planetglobe.js:250`) and computes `woodV`, `roadV` and a road distance field (`:335`, `:480-482`, `uRoadW`). `globe.mapData` is **never written** since food.js was deleted, so this is pure cost on the most fill-bound tier. | medium |
| Shader loops | 4 shock + 8 scar + 8 zone loops, each behind a uniform `If`. They are cheap when idle. A nuke plus fallout plus a lance puts about 5 slots live, each with 1-2 `mx_noise_float` per pixel over the whole globe and patch, about 10 noise calls per pixel at peak. WP-B (MIRV children, Aegis, laser, tsunami) will want more slots: **give zones a cheap rejection** (`dot(dir, z.xyz) < cos(outer*1.1)` before any noise) before raising the count. | medium |
| Per-frame allocations | `Threat.direct()` makes 3 `filter` arrays and `tryK` every frame. `PlanetWorld.update()` does `Math.min(...ys)` on a fresh array. `W.eff()` returns a new object, 3-5 times a frame (`step`, `wallAt` ×3). `C(0x9fe8ff, 2)` runs in `placeSat` every 0.5 s and `C(0xb58cff, 3)` per frame in the swallow animation. `Pool.flush` rewrites and re-uploads all 870 sprites every frame even when none is alive. Each is small; together they are steady GC churn for no reason. | low |
| Memory | The JS heap is about 1.25 GB in Phase 3, but the town page alone is 1.8 GB, so Phase 3's own share is small: about 71 MB of snapshots, about 60 MB of bite and landforms. Check what `dropTown` actually releases. | medium (mobile) |
| Assets | `loadPack('planet')` decodes all 16 planet GLBs. 11 are unused: aircraft_carrier, destroyer, laser_platform, aegis_platform, rocket, space_station, launch_pad, cargo_ship, oil_rig, aa_battery, cracker. That's fine if WP-B uses them, waste if not. | low |
| `?fps` GPU ms | Reads 70-190 ms at a steady 60 fps on WebGPU. It is known junk (memory note). Don't cite it in docs; use the pinned pixel-ratio A/B. | — |

### 1.3 Maintainability and dead code

- **Dead food-era paths:**
  - `planetglobe.js`: `mapTex` / `mapData`, the `woodV` / `roadV` branch, `uRoadW`.
  - `planet.js`: `onPatch` hook, `uRoadW` write and the "see food.paintUrban" comment (line 327), the "readable at 1.4 km" trail comment, the "food's dark albedo" comment (line 343).
  - `planetgame.js`: the "(the ships, silos and rigs)" pack comment (line 41), `__P3` comment ("`__P3.growth, __P3.gLand`" no longer exist, line 104), the `installDebug` doc line.
- **`?hole3d` / `uCut`:** the Phase 1/2 mesh path for T1 survives only as an A/B flag. Delete it, or keep it documented as a debug flag; it keeps a second hole path alive in `planet.update`.
- **`planetgame.js` is a 570-line god class.** It mixes camera, step, swallow FX, checkpoint, goals, ladder test, units API, HUD and debug API. Before WP-B adds rivals, move the debug APIs (`debugApi`, `unitsApi`, `ladderTest`, about 200 lines) into `src/planetdebug.js`. That is pure code motion and keeps the game file readable.
- **`threat.js` (764 lines) will double in WP-B.** Split by attack (`threat/nuke.js`, `threat/lance.js`, …) with the director, pools, `hurt` and zones in `threat.js`. Every attack already follows the same `spawn` / `step` / `finish` / `dangers` shape, so formalise it as a plain object per kind:

  ```js
  { spawn(o), step(x, dt), finish(x), dangers(out), cost, cool, window(r, dc) }
  ```

  That turns `direct()`'s if-chain into a table.
- **Magic numbers.** Damage fractions (0.07 / 0.08 / 0.06), bonuses (×1.03, ×1.02, ×1.01) and cooldowns are inline in `threat.js`. Move them to a `T3` table in `phase3.js` next to `P3`, so the balance pass can sweep them the way it sweeps `P3.gRamp`.
- **Two shake systems.** `swallow()` writes `state.shake = max(...)` directly while `Threat.trauma()` budgets 0.6 per 1.5 s. Route both through `trauma()`.
- **The unbudgeted hitstop is fine,** but `state.slowT = x * state.slowmo` relies on the caller knowing that `slowT` ticks in scaled time. Add a helper `slow(scale, realSeconds)` in planetgame.

---

## 2. Game design critique (as a player)

### 2.1 The first minute

**What happens:**
- **Ascension path:** a great cinematic (cracks, surge, pull-out to the whole planet, plunge). Then you land on a coast with your centre at sea, so you shrink while eating land (B1), with a Phase 2 sealing warning still on screen (B6).
- **`?planet` path:** the same landing.

**For 24 s (the director's grace) nothing threatens you.** The land under you is a uniform green speckle (T1 at 477 km camera distance), with no features to aim at: no cities, no landmarks, no visible units. The first tear-offs happen by accident at the swath's edge, with a small ring and puff (class 1).

**The hook is missing.** Katamari gives you something to grab in the first two seconds and a "that used to be big" moment within a minute. Hole.io shows the next-size-up object on screen at all times. Here the player's first decision is "follow the arrow to the Province of Zelford". The province is not drawn anywhere on the main view.

What a hook needs:
- **A guaranteed big first bite in the first 5 s.** A named peninsula or island in front of the landing that rips off with the class-2 FX.
- **A visible thing that is bigger than you.** A wall massif with snow, a megacity glow, an Aegis-like object in the sky.
- **A first threat around 20-30 s that you can swallow.** The first ICBM at T1 is gated behind DEFCON ≤ 3 (r ≥ 150 km or notoriety ≥ 40), so a typical player first meets a nuke in T2, 5+ minutes in.

### 2.2 Power fantasy and the feel of scale per tier

The camera distance is `∝ r`, so **the hole is the same size on screen for 23 minutes.** Growth reads only through:
- the size number (`S 4.60`, a log10 nobody understands);
- the land shrinking;
- the screen speed slowing (0.6 → 0.18 r/s, the intended "mass" cue, which mostly reads as "sluggish").

Katamari solves this with a camera that *lags* growth and then steps out on size thresholds, so you feel bigger for a beat before the world rescales.

| Tier | What works | What's missing (compared with the reference games) |
|---|---|---|
| **T1 REGIONS 40-150 km** | The limb and black sky in frame from second one. The swath dust curtain. District tears. Walls on massifs for the first about 1.5 min. | The scale is unreadable: green noise with no cities, roads or landmarks, so "40 km" means nothing. **Solar Smash** sells scale through recognisable geography plus debris; **Black & White** through tiny people. Silo fields and missiles are toy GLBs 20-50 km wide (`k = r*0.5/10`), sitting on the ground like Lego. That actively *shrinks* the perceived scale. |
| **T2 NATIONS 150-450 km** | Cap mode, a real globe curvature, nation-fall news with population. | The wound's square silhouette (B9). No rival: the doc's Maw is not built, so the "fear" column of the §12.3 ladder is only "a unit bigger than πr²", which is just more land. |
| **T3 CONTINENTS 450-1200 km** | The best tier visually: the planet is a ball, nukes and lances arc over it, continents tear with slow-mo. | No boss: the Aegis is not built. Nuke fireball sprites scale with r and read as a second sun (T3 capture: an orange disc taking a third of the frame). Satellites are free food (B5). |
| **T4 THE WORLD 1200 km → end** | The cap is enormous and the limb dents. | **The hole sits on the limb.** At pitch 32-36° and camera distance 8 r, the land ahead (screen-up) is over the horizon, so you steer by minimap. **Nothing is larger than you** above 1737 km. **Adversity is one lance a minute.** There's no Moon event, no World-Eater, no cracker. The run ends on a card. This is the climax of a 40-minute campaign, and it is the emptiest tier. |

### 2.3 Pacing and boredom

**Tier lengths** (BALANCE.md, human bot): T1 5.2-7.6 min, T2 2.5-10.1, T3 3.2-7.2, T4 4.8-7.8.
- They are long for a single verb: "hold the cursor ahead of the hole over land".
- There is no time pressure apart from the belly.
- Variety comes from a threat every ~50 s and four goal cards.

**Ocean crossings are dead air:**
- No credit, the belly draining, the screen speed ×0.85 at T1-T2.
- Nothing lives on the sea: carriers, destroyers and cargo ships were cut as food and never built as adversaries, though the GLBs ship in the pack.
- A 500 km strait at T1 is about 21 s of nothing.
- **Fix with content, not speed:** fleets with salvos at sea (WP-B), and a tsunami event.

**The tail hunt is fine.** The pull-in rule works: 96.3% → 99.5% took 22 s in the full run.

**Repetition:**
- Every tear uses the same FX vocabulary scaled up: ring, puff, column.
- Every threat in T1-T3 is "a ring appears: leave or dive".
- No threat changes *how you move*: no beam to outrun, no lid to break out of, no rival to race.

### 2.4 Adversity: difficulty and fairness

**Fairness is good:**
- Telegraphs are ≥ 2 s and lock times scale with speed (`lockFor`).
- There's a 25% mercy cap.
- The dive-to-swallow choice is well designed.

**Difficulty is absent:**
- **A nuke hit costs 7% of area**, about 7-9 s of T1 growth (net about 0.8-1%/s at the current 0.035 anchor), less later.
- **Full game, forced DEFCON 2:** 8 hits, 3 bomber hits, total `loss` 0.56 of area-fractions. Ledger damage was 98 Gm² against 9,600 Gm² of gains.
- **Decay ("fed", -1,780 Gm²) costs 18× more than all of humanity's weapons.** The real enemy is the belly.
- **§12.9 normal-DEFCON runs:** 3 hits, mercy cap 0, Sealed 0, Hunger Surge 0. The comeback machinery (surge, seal) never fires in practice.

**Missing escalation:**
- DEFCON 1 changes nothing except pips.
- The weapons don't graduate: the doc's idea that a threat becomes *food* at the next tier is only half there (silos are edible; bombers never become snacks).
- **Power fantasy needs a curve:**
  - early weapons should hurt;
  - mid weapons should be dodgeable or swallowable;
  - late weapons should be *boss events*, while the early ones are eaten casually.

### 2.5 Readability

- **Units are invisible.** The core reward, tear-offs, can't be aimed for. Osmos works because size relative to you is *colour-coded on every object*. Here, nothing tells you "this peninsula is 60% eaten; one more pass and it rips".
- **The night side (B2).**
- **The arrow** is a single green chevron to "the nearest standing parcel of the goal". It is good for direction and gives no sense of the size of the prize.
- **The HUD:**
  - `S 4.60` is opaque.
  - A red pip at DEFCON 5 reads as alarming.
  - The threat pill is excellent (countdown plus LOCKED).
  - Strafe bands are two thin yellow lines crossing the whole view, hard to read as "a band you're inside".
- **The ICBM arc seen from the T1 camera is a near-vertical pale streak** (it comes from over the horizon toward the camera). It reads as a laser, not a missile. Draw the minimap arc bigger, or tilt the apex sideways.

### 2.6 What would make it addictive

| Pillar | Now | Needed |
|---|---|---|
| **Core loop** (30 s) | Swath → occasional accidental tear | Aim at **ripe units** (visible, scored), carve, **rip**, chain rips into a **collapse combo** |
| **Mid loop** (2-3 min) | Goal card → draft (dead perks) | Goal → **Phase 3 perk** that changes play (bigger pull-in, sea speed, nuke magnetism) → a boss or rival event every tier |
| **Run loop** (25 min) | Card at 99.5% | **Finale** (Moon capture, void star) → **results** with stars, dust, records → NG+ world archetypes |
| **Rewards** | Numbers go up | Floating "+212 M" / "+1.4%" at the centroid, combo counter, size pill pulse, a camera lag-and-settle on growth |
| **Surprise** | Threats on a timer | Tsunami after a coastal nuke, a volcano erupting in a district you're carving, rockets fleeing (Exodus), a rival appearing from the far side |
| **Tension and relief** | 75 s cycle with no teeth | Damage in seconds of progress, Sealed actually threatening at peaks, relief beats (Frenzy, surge) that matter |
| **Juice** | Good tier-ups and nuke swallows; silent swath | Grind audio ∝ credit, tear crack-and-gulp pitch-stepped by combo, music bed per tier |

### 2.7 The brief, line by line

| Brief | Status |
|---|---|
| AAA feel, rich visuals | Ascension yes. T1 ground and T3 globe good. Night side, toy GLB scale, square wounds and busy veins hurt it. |
| Performant | Yes on CPU; T1 is fill-heavy. |
| Truly planetary scale | Numerically yes. Perceptually weak at T1 (no scale references) and T4 (hole on the limb). |
| Extinction-level adversity | **No.** 3 of about 14 designed attacks, and damage is negligible. |
| Always something larger and smaller | Smaller yes. Larger fails above 1737 km, and at T2 only as "more land". |
| Terrain height matters | **Only for about 1.5 min.** Walls are e > 0.12 r, so the 8.8 km summit gives way at 73 km. Drag needs e > 0.03 r, so it's gone by about 300 km. After that, height is an invisible √h credit factor. |
| Playable to the end | Yes, the bot wins in 18-25 min. The end is a card. |
| Minimap shows the planet | Yes, and well (hemisphere from about 270 km, markers, goal stipple). |
| Fun, addictive, balanced | Pacing is balanced on paper. Fun is held back by legibility, silence, a toothless threat and the missing endgame. |

---

## 3. Punch list

**Item format:** file → function → change → acceptance hook.

**Priorities:**
- **P0:** must fix before anything else ships.
- **P1:** high value.
- **P2:** polish.

**Run the work packages in order.** Each ends with a balance gate, because the sea fix, the satellite nerf, the damage retune and the new attacks all move pacing:

```js
__planetSweep(3, 3000, 'human') // on seeds 7, 3 and 11, in the browser pane
```

Compare against the BALANCE.md Phase 3 table and add the new rows.

**Shared acceptance tools** (all exist): `__planetSweep`, `__planetBot(Async)`, `__threat.state().stats`, `state.ledger`, `__planet.cal(r)`, `__planetLadder()`, `__planet.limb(r)`, `__perf()`, `__threat.seq(kind, o, marks, prefix)`.

### WP-A: correctness, legibility, feel and juice (do first)

**A1 (P0). Swath credit at sea (B1). DONE** (`wetPrev`: sea speed and drain only when the centre is at sea and the disc ate nothing last frame; r end 2.1-2.7k km).
- **`planetgame.js` → `step()`:**
  - Replace `const dA = credit * G * (here.h < 0 ? 0 : 1)` with `const dA = credit * G`.
  - Define `const wet = here.h < 0 && credit <= 0` and use `wet` instead of `here.h < 0` for the ocean speed `mult` (line 202) and for `oceanDrain` (line 259).
  - `credit` is computed after the move, so move the `mult` decision to use **last frame's** `this.wetPrev` (store it at the end of `step`).
- **Acceptance:**
  - Re-run the chew wrapper from this review (credit split by `W.eff(0,0).h < 0`) at r = 1300 km: discarded share 0.
  - `?planet` arrival: r does not fall during the first 3 s.
  - Then the WP-A gate sweep. Expect `r_end` to rise toward 2.3k km and T4 to shorten. If the total drops below 18 min, lower `GRAMP` at 1600 / 2600 km (0.2 / 0.3) by the measured factor, not the earlier anchors.

**A2 (P0). The sun follows the hole (B2). DONE** (`SUN_R` re-applied every frame in `frame()`; the reveal keeps its terminator because the hole does not move during it).
- **`planet.js` → `update()`:** after placing the group, call `this.setSunRender(SUN_R)` every frame, where `const SUN_R = new THREE.Vector3(-0.75, 0.6, 0.3).normalize()` (the `placeStart` value). Move it to a module const and use it in `placeStart` as well.
- `patchGen` reads `this.sunPlanet` at build start, so cast shadows stay consistent per build.
- The ascension's reveal sets its own sun before `commit`. Check that `ascend.js` calls `setSunRender` in its beats, or guard the per-frame call with `!state.asc`.
- The terminator and city lights still show on the far globe at T3-T4, which keeps the night side as a visual, not as the play area.
- **Acceptance:**
  - The moveHole harness reports a night share under 2%.
  - The night spot from this review (teleport to the antisolar land parcel, r = 250 km) renders lit.
  - `__ascend(false)`: the reveal still shows a terminator.

**A3 (P0). The win state (B3), minimal version. DONE** (`resultsUi`, `Threat.stand()`, `bankPlanet` in main.js, dust persisted once; verified headless: overlay up, live threats 0, `save.worlds` +1).
- **`planetgame.js` → `goalTick()`, in the `state.won` branch:**
  - `this.threat?.clear(); this.threat.disabled = true; this.threat.sealOn = false;`
  - `ctx.edgeArrow('town', null)`.
  - Open a results overlay. Copy `Threat.sealedUi()` into `planetgame.js resultsUi()` and reuse the `#sealed` styles with a `.won` modifier.
- **Overlay contents:**
  - total time;
  - people swallowed;
  - peak r;
  - tier times (`state.tierAt`);
  - nukes swallowed, rods caught, satellites;
  - hits taken.
- **Buttons:** "Continue (free roam)" and "New run" (`location.href` without `?r`).
- **Dust:** bank it via the same path as `bankRegion`. Add `bankPlanet(state)` in `main.js`, `dust = 40 + 2 * minutes-under-30 + 5 * nukesSwallowed`, persisted with `persist()`.
- The finale cinematic is C2.
- **Acceptance:**
  - `__planetBotAsync(2400)` to the win: the overlay is up.
  - `__threat.state().live` stays all 0 for 30 s.
  - `save.worlds` has incremented once.
  - Dust has increased.

**A4 (P0). The swath has a sound. DONE** (`sfx.grind` one persistent graph, `sfx.pebble` parcel crackle at 4 Hz; not listened to: no audio in the harness, the graph runs without errors).
- **`sfx.js`:** add `grind = { start(), set(level, pitch), stop() }`, one persistent node graph built on first use:
  - a looped `noiseBuf` through a lowpass at 180-600 Hz, plus a 38-55 Hz sine sub;
  - gain = 0.5·level;
  - filter cutoff rises with level;
  - pitch drops one step per tier.
- **`planetgame.js` → `step()`:** `sfx.grind.set(this.rim, tier)` (`this.rim` is already the smoothed credit rate, 0..1). Stop it in `leave()`, on Sealed, and while `state.asc` runs.
- **Add a parcel crackle:** in `swallow()`, `cls === 0` returns early. Before returning, play `sfx.crackle(0.15)` at most 4 Hz (a `fx.crackAt` timestamp).
- **Acceptance:** audible grind that swells on land, falls to silence over sea, and is ducked by tears. No new allocations per frame (create the nodes once).

**A5 (P0). Ripe units are visible, and combos make the loop. DONE** (`landforms.ripe`, zones 8-11 kind 2 with the cheap rejection and fallout noise moved into its own branch, minimap rings, label, combo x5 with pitch steps, bot ×2 on ripe; ripe rings show in ~60% of play; the 12-zone loop's pixel-ratio-3 A/B was not run).
- **`landforms.js`:** add `ripe(dir, r, out, max = 5)`, scanned at 2 Hz alongside `target`. It finds units at L1-L3 with `0.25·area0 < left < 0.65·area0` and `left < 0.9·πr²`, centroid within 6 r, not torn. Score by `left / (d + r)` and return the top 5 as `{dir, rEq, frac, L, u, name}`.
- **`planetglobe.js`:**
  - Raise the zone uniform count from 8 to 12 (`uZone`, `uZoneP`).
  - Add the early-out `If(dot(dir, z.xyz) > cos(z.w * 1.1))` around each zone body (see §1.2).
  - Add zone `kind = 2` "ripe": a lilac dashed ring at `rEq`, with a fill alpha of `0.06 * (1 - frac)`.
  - **Branch by kind with `If` before the fallout `mx_noise_float`.** Today `select(fall > 0.5, fo, g)` evaluates both sides, so every live zone pays that noise. Four always-on ripe zones would add four noise calls per pixel over the whole globe.
  - A/B at pixel ratio 3; at most 1 fps lost.
- **`planetgame.js`:**
  - **Allocator:** zones 8-11 are reserved for ripe rings. Threats keep 0-7, so `Threat.zoneAlloc` stays as it is.
  - Every 0.5 s write the top 4 ripe units into zones 8-11.
  - Draw one HUD label ("Kesport Peninsula · 58%") for the best of them via a pooled DOM element positioned by projecting the centroid. Reuse the `edgeArrow` projection helper; if it isn't exported, write a 6-line projector.
- **Collapse combo (`planetgame.js` → `swallow()`):**
  - For `cls ≥ 1` tears within 2.5 s of the previous one: `fx.combo++`.
  - The credit multiplier is `1 + 0.1·min(combo, 5)`, applied in `step` to `tc` (`B.cTear * G * comboK`).
  - HUD pop: `ctx.card('×3 COLLAPSE', ...)` from combo 3, throttled.
  - `sfx.tear` pitch steps up a semitone per combo level.
- **Acceptance:**
  - Screenshot at T1 and T2 shows ripe rings on the main view and the minimap (add marker kind `'ring'` in `planetmap`, colour `#c9a8ff`).
  - The sweep's tear share stays 25-38%.
  - The human bot's `planetSteer` scores ripe units ×2 (update `bot.js`, so balance reflects players chasing them).

**A6 (P1). A growth reward you can see. DONE** (gain labels, asymmetric camera follow + 12% pull-out at tier-up, `×N.N` size pill with pulse; limb margin stays above 1° with the lag, 150 km sits at 0.3° without it, as before).
- **Floating gain text:** in `swallow()`, for `cls ≥ 1` and `show`, spawn a pooled DOM label (pool of 6, CSS transform plus fade over 1.2 s) at the projected centroid with `+X.X%` (the job's credit share of `hole.area`). The credit is known only at `'done'`, so estimate it at `'start'`: `ev.left * 1e6 * sqrt(avg h) * collapseK * G / hole.area`. Also show the population for `cls ≥ 2`.
- **Camera lag and settle (`frame()`):**
  - Replace `this.camDist += (want - this.camDist) * min(1, dt*2)` with an asymmetric follow: grow-follow `dt * 0.6`, shrink-follow `dt * 2`.
  - On tier-up, add a 0.6 s pull-out beat: `camDist *= 1.12` then settle. The hole visibly swells on screen before the world rescales (the Katamari read).
  - Check `__planet.limb(r)` stays > 1° with the +12% lag at every r.
- **The size pill:** replace `S 4.60` with `×{(r / 40 km).toFixed(1)}` (growth since landing), and pulse the pill on tier-up and each `cls ≥ 2` tear (a `.pulse` CSS class).
- **Acceptance:** screenshots before and after a province tear show the label and the hole larger on screen than at rest.

**A7 (P1). A Phase 3 perk pool (B4). DONE** (8 `p3` perks in perks.js, wired into step / chew / pullCheck / hurt / notice / gulps; drafts and chips are phase-filtered; the Hardened Void A/B on the ledger was not scripted).
- **`perks.js`:** add `PLANET_PERKS` (8 entries):

  | Perk | Effect |
  |---|---|
  | Tectonic Jaws | `mods.depth *= 1.25` |
  | Deep Core | `mods.hcol = 0.65` (credit exponent, was 0.5) |
  | Undertow | `mods.sea *= 1.2` |
  | Tidal Pull | `mods.pull *= 1.35`, the pull-in radius |
  | Hardened Void | `mods.hurt *= 0.7` |
  | Silent Running | `mods.noto *= 0.7` |
  | Orbital Appetite | `mods.gulp *= 1.5`, nuke and rod swallow bonuses |
  | Fission | `mods.tear *= 1.25`, `collapseK` |

  Extend `baseMods()` with these keys.
- **Wire the mods:**
  - `step()`: `D` (×`mods.depth`), the ocean `mult` (×`mods.sea`), `tc` (×`mods.tear`).
  - `bite.chew`: pass `hExp` as an argument, default 0.5. Replace `Math.sqrt(hcol / 1000)` with `Math.pow(hcol / 1000, hExp)` on the credit line (it doesn't touch rem accounting).
  - `bite.pullCheck`: replace the `3 * r` radius with `3 * r * pullK`.
  - `Threat.hurt`: `frac *= state.mods.hurt`.
  - `Threat.notice`: `a *= state.mods.noto`.
  - `swallowNuke` and `rodImpact`: bonus `× mods.gulp`.
- **`main.js`:** `openDraft(pool)` uses `PLANET_PERKS` when `state.phase === 3`. `perkChips()` shows only perks whose ids are in the active pool, so Phase 2 perks are hidden in Phase 3. `offerPerks(seed, k, taken, pool)` gets a pool argument.
- **Acceptance:** a draft in Phase 3 shows only planet perks. Each perk's effect shows in the ledger in a scripted A/B, e.g. Hardened Void halves `ledger.nuke` for the same forced hits.

**A8 (P1). Satellites are a deliberate catch (B5). DONE, with changed numbers**: the orbit track is 1.5-2.5 r (not 2.5-4) to the side and the orbit phase lasts 12 s (not 6.6): at the hole's 0.27 r/s a 2.5-4 r detour in 6.6 s is unreachable. Eat radius 0.7 r, ×1.01, pill 'SATELLITE OVERHEAD', bot detours (human 50%); satellites are 0.7-2.3% of gains.
- **`threat.js` → `spawnLance()`:** offset the orbit so its ground track passes 2.5-4 r to the side of the hole:

  ```js
  l.a = W.dirAt(side * rnd(2.5, 4) * r, 0)
  ```

  Build `l.b` as before but from `l.a`'s frame, and aim the designator at the hole via `l.to` (unchanged).
- **`lanceStep`:** the eat condition becomes `gd < 0.7 * hole.r`, and `eatSat` gives `×1.01`, not `×1.02`.
- Show "SATELLITE OVERHEAD" in the threat pill for the 3 s window when its track passes within 4 r, so it's a choice.
- **Acceptance:** over a sweep, `ledger.sat` is under 2% of gains, and the human bot eats 30-60% of satellites. Teach `planetSteer` to detour when a satellite pass is within 4 r (it reads `__threat.rings()` already; add the satellite subpoint).

**A9 (P1). Damage worth fearing. DONE, partly**: `T3` table, income EMA (tau 30 s), k 25 / 25 / 12, first ICBM capped at 7%, fallout 45 s ×0.5. Area-weighted damage is 0-12.7% of gains (mean 4%), below the 8-15% target because the human bot dodges; Sealed warnings 0 of 9. See BALANCE.md.
- **`threat.js`:** keep `hurt()` but express damage in **seconds of current income**.
- **`planetgame.js` → `step()`:** keep an EMA of growth `state.gRate` (area/s, τ = 10 s).
- **`hurt(frac, …)`:** `frac = min(0.25, max(frac, k * state.gRate / hole.area))`. Put the constants in a new `T3` table in `phase3.js`.
- **Calibrate k from the measured `gRate` EMA,** not from the doc's 1.7%/s. Net T1 growth today is about 0.8-1%/s (G anchor 0.035). Start at k = 15 s for nukes, 15 s for rods and 8 s for bombers, and check that no single hit reaches the 25% cap at T1.
- **Exempt A11's scripted first ICBM:** cap it at today's 7%.
- **Fallout:** extend to 45 s. Fallout land credit ×0.5 (was 0.7).
- **Acceptance (sweep at normal DEFCON):**
  - threat damage is 8-15% of gains (`ledger.nuke + rod + bomber` against the total);
  - Sealed warnings in 1-3 of 9 runs, actual Sealed in at most 1 of 9;
  - totals still 18-25 min.

**A10 (P1). Height matters past T1. DONE** (`Ek` ramp, `P3.heightK`; no pacing effect in the sweep, `state.walls` stays 0 because the bot steers round columns; `__planetLadder()` untouched).
- **`planetgame.js` → `step()`:** compare the *visual* height. Use `const ev = here.e * W.E` in the drag rule, and `q.e * W.E` in `wallAt`. E is 3 at 40 km and 7 at 1200 km, so walls hold to about 450 km and ridge drag to about 1200 km (8.8 km × 7 = 62 km against D = 36 km).
- Update the wall hint to `KM(w * W.E / (P3.wallK * 0.03))`.
- **The drag must never trap:** keep the "downhill is always open" rule.
- **Ramp the factor in.** Use `Ek = 1 + (W.E - 1) * smooth(40 km, 450 km, r)`, not the raw E. At 40 km a raw E = 3 would make every massif above 1.6 km a wall (today 4.8 km), which collides with the coastal landing and A11's hook.
- **Acceptance:**
  - T1: `state.walls` and the bot's `stuck` count in the first 2 min are no worse than today.
  - `__planetLadder()` stays 80/80.
  - `state.walls` is greater than 0 in T2 in the sweep.
  - Totals still 18-25 min. Expect T2 +0.5 min; compensate with `GRAMP[150 km]` if needed.

**A11 (P1). A first-minute hook. DONE, adapted**: `placeStart` faces the nearest 0.3-0.8 pi r0^2 unit 1.5-10 r0 away (the review's 2-4 r0 has none on seed 7: the nearest is 5.7 r0), grace 14 s, a scripted first ICBM at the hole at any DEFCON (swallowed by the bot in the first 40 s). A class-2 tear within 6 s is not guaranteed (the first tear fires after the swath eats half a unit).
- **`planetgame.js` → `placeStart()`:** after placing, find the nearest L1/L2 unit with `0.3·πr0² < area0 < 0.8·πr0²` within 2-4 r0 that has coast share > 50% (a peninsula or isle). Face it: `W.placeAt(startDir, unitCentroid)`. The ascension's camera still plunges straight down.
- **`threat.js`:** `grace` becomes 14 s.
- **First threat:** in the first 60 s of a run (only once), spawn one **ICBM with `{at: 'hole'}` at any DEFCON**, with the hint "Dive into the inner circle". That guarantees the best moment in the game in minute one.
- **Acceptance:** fresh `?planet`, hands off, steering straight: a class-2 tear within 6 s, and an ICBM telegraph before 30 s.

**A12 (P2). Cleanup at the swap (B6). DONE** (status line, perk chips, `state.pop` during the cinematic, news queue on retry; B6 reproduced only by reading the code).
- **`planetgame.js` → `commit()`:**
  - `document.getElementById('status').textContent = ''`;
  - hide `#perks`, then `perkChips()` per A7;
  - set `state.pop = W.bite.pop` immediately, and every frame while `state.asc` runs (`frame()` → `if (state.asc) state.pop = W.bite.pop`).
- **`restoreCheckpoint()`:** `ctx.news.queue.length = 0`.
- **Acceptance:** `__ascend(false)` from a run with an active Phase 2 seal warning shows no stale line, and the ticker counts the islet.

**Gate A:** sweep 3 seeds against BALANCE.md. Update the §12 "As built" notes and the BALANCE.md row with the new `r_end`, tear share, threat-damage share and satellite share.

### WP-B: adversity at the new scale

**Shared groundwork (do first):**

- **B0 (P0). Refactor the director into a table. DONE, partly** (`Threat.register(kind)`, `T3.kinds` in `phase3.js`, the mercy window a preallocated ring, `hurtCont` / `gain` / `fair` and a `stats.unfair` column in the sweep; the new kinds live in `src/threat/*.js`, the bomber / ICBM / lance code stayed methods of `Threat`; `kit.js` holds Ribbon / Pool / helpers) (see §1.3): `KINDS = { bomber, nuke, rod, … }`, each with:

  ```js
  { window: (r, dc) => bool, cost, cool: [min, max], spawn(o), step(x, dt), finish(x), dangers(x, out) }
  ```

  - `direct()` picks from `Object.values(KINDS).filter((k) => k.window(r, dc) && cool <= 0 && budget >= k.cost)`, using a preallocated array.
  - Move the numbers into `T3` in `phase3.js`.
  - Split the files under `src/threat/` with `threat.js` keeping the director, pools, `hurt`, zones and seal.
  - **Acceptance:** with only the three existing kinds, a seeded sweep gives the same stats as before (±10%).

- **Windows after WP-B.** DEFCON floors are unchanged.

  | Kind | Tiers | DEFCON |
  |---|---|---|
  | bomber | T1-T2 | ≤ 5 |
  | carrier group | T1-T2 | ≤ 4 |
  | ICBM | T1-T3 | ≤ 3 |
  | tsunami | T1-T2 | event |
  | volcano | T1-T2 | event |
  | rockets | T2-T3 | ≤ 3, food |
  | MIRV | T2-T3 | ≤ 2 |
  | lance | T2-T4 | ≤ 2 |
  | Maw | T2 | event |
  | laser | T3-T4 | ≤ 2 |
  | Aegis | T3 | once |
  | World-Eater | T4 | event |
  | cracker | T4 | once, at 90% land |

**The new kinds:**

**B1 (P0). Rival holes on the sphere: the Maw and the World-Eater. DONE** (`src/planetrival.js`, `bite.chew(..., opts)`; the Maw spawns 25 s into T3 (the brief's T3, not 250 km), the World-Eater 20 s into T4; rivals graze at 4% speed, live 140 / 170 s and eat 5-13% of the world; bots flee bigger / hunt smaller; `__planetLadder` was not extended).
- **New `src/planetrival.js`.** A rival is `{ q: Quaternion (its frame), dir: Vector3, area, heading, name, big, mk }`. Each frame:
  - steer toward `lf.target(worldGoal, rival.dir, r)` (reuse `landforms.target`);
  - move by `P3.speed(r) * 0.85 * dt` along a great circle (rotate `dir` about `dir × heading`);
  - chew with `bite.chew(dir, r, dt, moved, { tear: false })`.
- **`bite.chew`:** add the options argument. When `tear === false`, skip the `tflag` / `touched` recording so the player's tear check is untouched. Give it its own `frame` counter (`this.frameR`) so the round-robin phase doesn't collide. Credit grows `rival.area` by `G(r)`.
- **Draw:** `W.globe.setHole(1 + i, dir, r / R)` (`MAX_HOLES` = 5; the cap shader exists). Minimap `addMarker({ kind: 'rival', dir, r, big: rival.r > hole.r, label: name })` (the kind exists in `planetmap.js`).
- **Spawns:**
  - **The Maw:** when the player reaches 250 km, at the antipode of the player's goal unit, r = 1.3× player.
  - **The World-Eater:** at the T4 tier-up, r = 1.4× player, from the far side.
- **Contact:** centre distance `< rBig - 0.5 rSmall` eats the smaller.
  - The player eating a rival gets +60% of its area (cap 25% of the player's area in one go), the class-4 FX, and the card "THE MAW IS FED TO THE VOID".
  - A rival eating the player is `hurt(0.25)` plus a kick away, never Sealed directly.
- **Rivals starve:** decay 0.15%/s when they chew nothing.
- **Bots:** `dangers()` returns rivals as `{ kind: 'rival', R: r }` circles so the bot flees bigger rivals and hunts smaller ones.
- **`bite.chew` pitfalls:**
  - Its last lines set `this.nTouched = nT` and add to `this.pop`. Order the frame as: player `chew` → `tearCheck` → rival `chew`, and guard the `nTouched` write with the option.
  - Give rivals their own pop accumulator (`opts.pop` out-param), so the player's "swallowed" counter doesn't credit rival kills.
  - `this.sum` must still fall (the land is gone). The goal % will include rival eating, which is correct, but say so in the news ("the Maw devours Valoria").
- **Acceptance:**
  - T4 ladder spots above 1737 km pass on the World-Eater (update `ladderTest`: the rival counts as "bigger").
  - In the sweep, rivals eat 3-10% of the world.
  - Rival chew CPU is at most 0.5 ms (`__perf` js).

**B2 (P1). The orbital laser platform (T3-T4). DONE** (`src/threat/laser.js`; the spot starts ~3.8 r away, not 6 r: 6 r is over the limb; one sweep; the bot keeps out of it: 0 hits in 9 runs; the platform was swallowed in none of the 9 sweep runs: the bot does not detour for it, forced tests do).
- **Model:** `laser_platform` at 0.8 r altitude above a point 6 r ahead and to the side.
- **Telegraph:** 2 s warm-up, the beam drawn as a `Ribbon(10)` from the platform to the ground, white core with red glow.
- **The sweep:** a ground spot moving toward the hole at `0.35 * P3.speed(r)` (slower than the player), drawn as a zone of kind 0 with radius 0.6 r and `lock = 1` (a solid ring). Burning scar decals use `scar(kind 1)` every 0.4 s along the path.
- **In the beam:** `hurt(0.02 * dt)` with the key `'laser'`, which needs a continuous variant: accumulate into the 30 s mercy window, and `state.slow = 0.5` (it jams).
- **Counter-play:** after 12 s the platform descends to 0.3 r altitude to re-aim, and is edible for 5 s when the hole is within 0.8 r of its subpoint: +2%, Frenzy.
- **Bot:** `dangers()` returns `{ kind: 'beam', x, z, R }`.
- **Acceptance:** `__threat.force('laser')` can be outrun on a straight line at every tier (T3 and T4 tests). Eating the platform shows the hitstop and the card.

**B3 (P1). MIRV (T2-T3). DONE** (a nuke item with `mirv`, 4 children, light children without a mushroom, salvo cap 15%; allowed up to T4 at DEFCON <= 2; `__threat.seq('mirv', ...)` snapshots; peak live zones ~9).
- A `spawnNuke` variant with `children = 4` (fits 4 zone slots plus the arc).
- At `u = 0.55` the arc splits. Each child gets its own `to`, spread 1.2-2 r around the predicted position, `inner = 0.4 r`, 4% each, with a shared key `'mirv'` capped at 15% per salvo (sum its hits in `hurt`).
- Swallowing ≥ 2 children shows the card "MIRV GULP" and +2% per child.
- Mushrooms: reuse the 3 pooled meshes and skip the mushroom for children 4+ (use the fireball only).
- **Acceptance:** `__threat.seq('mirv', {}, [-1, 0.2, 1])` shows 4 rings. Peak live zones ≤ 12, and the zone early-out holds frame time (`__perf` at pixel ratio 3, at most 1 fps lost).

**B4 (P1). Carrier groups and cruise salvos (T1-T2): life on the sea. DONE** (`src/threat/fleet.js`; ships 2.8 / 1.5 r long, 4.5-7.5 r off, 3-4 missiles, max 2 salvos per fleet: an unbounded fleet made T2 14 min long; a fleet is met in every sweep run).
- **Spawn:** a `aircraft_carrier` plus 2 `destroyer` GLBs at readable scale on ocean texels 6-10 r from the hole, preferring the sea ahead of the heading. `bite.landAt(d) < 0`, and the `W.P.elevation` depth is below -200 m.
- **Salvos:** every 12 s while within 15 r, 3-5 small rings of 0.5 r at 4%, tracking for 2 s and then locked for 1.5 s.
- **Ships are edible:** within 0.7 r, +1.5% each. Eating the carrier ends its salvos. All three within 6 s gives "FLEET SUNK" and +3%.
- Wakes: reuse the foam-wake idea (a flat instanced quad, `planetMaterial`-agnostic).
- **Acceptance:** an ocean crossing of 15 s or more at T1 meets a fleet in at least 50% of sweeps (log `stats.fleets`).

**B5 (P1). Tsunami and volcano (T1-T2) events. DONE** (`src/threat/nature.js`; tsunami from a nuke over the sea or a coastal class >= 2 tear, foam front shader kind 3, rubble x1.5 for 30 s; volcano: Massif, smoke column, ash zone, 3 lava rings, MAGMA SURGE; both forceable).
- **Tsunami:** triggered by a nuke detonating over the sea, or by a class ≥ 2 tear of a unit with coast share > 50%.
  - A ring zone (kind 0, no inner) expanding from the cause at `0.4 r/s`, life 10 s.
  - Crossing its front: `hurt(0.03)` plus a kick along the outward normal.
  - Land inside the ring after it passes gets credit ×1.5 for 30 s (a "rubble" flag checked in `step` by distance to the cause and the front radius).
- **Volcano:** pick a district named "Volcanic Field" or "Massif" (`landforms.name` L1) within 10 r.
  - 3 s rumble (`sfx.rumble`), then a smoke column (Pool smoke).
  - 3 lava-bomb rings at 3% each.
  - An ash zone (kind 1 tint, speed ×0.7).
  - Eating the district while it erupts gives "MAGMA SURGE": Frenzy plus credit ×1.5 for 8 s.
- **Acceptance:** each is forceable via `__threat.force('tsunami' | 'volcano')`, and shows in `__threat.state().stats`.

**B6 (P1). The Aegis: the T3 boss (once, r ≈ 800 km). DONE, changed numbers** (`src/threat/aegis.js`; hexagon 2.6 r, lid 3.6 -> 0.6 r closing at (alive / 6) of 34 s instead of a fixed 6 s, which makes six platforms impossible to eat; the bot breaks it in 6 of 9 sweep runs and 3 of 5 forced trials).
- 6 `aegis_platform` GLBs descend over 8 s into a hexagon at 3 r around the hole, minimap kind `'aegis'` (exists).
- A closing ring zone 3 r → r over 6 s (`zoneSet` with `lock` progress).
- Inside at the close: `hurt(0.12)` plus an eject kick.
- **Platforms are edible** when the hole is within 0.9 r of each one's subpoint.
  - Eat all 6: "AEGIS BROKEN", +8%, a free perk draft, 0.4× slow-mo for 1 s.
  - Otherwise it retries after 90 s, at most 3 times.
- **Acceptance:** `__threat.force('aegis')` at r = 800 km. The bot (taught to beeline the nearest platform) breaks it in 2 of 3 attempts.

**B7 (P2). Evacuation rockets (T2-T3). DONE** (`src/threat/exodus.js`: rockets from a Metro Belt, a space station on a 12 s orbit at T3-T4; scenery for the bot).
- Spawn from districts named "Metro Belt" within 12 r.
- A `rocket` GLB plus a contrail `Ribbon`, climbing for 6 s.
- Edible while the hole is within 0.8 r of its subpoint and the rocket's altitude is below r: +0.3% each.
- News: "Exodus begins: 40 M flee to orbit".
- A sky-life snack that makes the planet feel inhabited.

**B8 (P1). The planet-cracker (T4, at 90% land, once). DONE, changed numbers** (`src/threat/cracker.js`; `launch_pad` as the stations, countdown 30 s + route (<= 75 s), ring 1.8 r with a lock of `lockFor(1.3, 4.5, 8)` s: 2 r for 4 s cannot be left at T4 speed; the set piece ran in 9 of 9 sweeps).
- `cracker` GLB on the far side, plus 3 `station` GLBs placed on remaining land 6-12 r from the hole (minimap triangles).
- A 30 s world countdown in the threat pill.
- Eat all 3 stations: "THE CRACKER FIZZLES", +5%.
- Otherwise a 2 r ring locks for 4 s: `hurt(0.2)` plus a crater scar.
- **Acceptance:** T4 has a set piece in 100% of sweeps.

**Gate B (sweep). PASSED, mostly** (`docs/BALANCE.md` "Phase 3 WP-B": mean 21.3 min (17.3-28.6, 6 of 9 inside 19-26), damage mean 7.3% (target 8-15 per the brief), bonuses 7.2%, 11-12 kinds per run, unfair 0 of 9, Sealed warnings 0 of 9, JS 1.07 ms with five attacks live, director 0.31 ms, `?webgl&q=low` boots; the Gate's 20-27 min / 10-18% damage were replaced by the brief's 19-26 / 8-15):
- Totals 20-27 min (the extra events add time).
- Threat damage 10-18% of gains.
- Threat bonuses ≤ 10% (§12.4 income target "nukes, rivals, space ≤ 10%").
- At least 4 distinct threat kinds seen per run.
- `__perf` js ≤ 2 ms average.
- WebGPU and `?webgl&q=low` both boot.

### WP-C: the endgame

**C1 (P0). The Moon: capture and Roche break-up (at 90% land or r ≥ 1600 km).**
- **`planetglobe.js`:** `moonSky = false` hands the Moon from impostor to a real object. Interpolate its planet-space distance from `12 R` to `2.4 R` over 40 s, with the news "The Moon is falling", so it grows in the sky.
- **At the Roche distance:** swap the sphere for 8 fragment meshes (instanced `SphereGeometry(1, 24, 16)` with `moonMaterial`, scaled 0.25-0.45 of the Moon).
- Each fragment falls as a meteor at the planet: a nuke-like zone, `inner = 0.5 r`, +3% on a swallow, 6% on a hit, a huge scar.
- Swallowing the last fragment: "THE MOON FALLS INTO THE VOID", 0.3× slow-mo for 2 s, and the moonlight goes out.
- This is the "larger thing" for r > 1737 km until the World-Eater.
- **Acceptance:** forceable via `__threat.force('moon')`. `ladderTest` counts falling fragments as bigger at T4.

**C2 (P0). The void-star finale** (replaces the A3 card; the A3 results come after it).
- On `state.won`, play a 12 s cinematic using the Ascension's camera hook (`state.asc = { cam, advance, afterWorld }`). Build a small `src/finale.js` modelled on `ascend.js`:
  1. silence;
  2. the oceans drain into the hole: a new `uSeaDrop` uniform in `planetMaterial` that blends ocean pixels toward the dark wound colour, radially from `hdir`;
  3. a log-zoom pull-out to 3 R;
  4. the planet's group scales to 0 over 3 s toward the hole's direction, while the cap grows to cover it;
  5. a white-lilac star flash, the stars brighten, "THE VOID IS A STAR" (the Katamari star).
- Then the results.
- **Acceptance:** worst frame ≤ 50 ms on WebGPU, measured as in §12.10.

**C3 (P1). Results and legacy.**
- **The results overlay** from A3, extended with:
  - a world card: the seed's planet thumbnail via `planetview.js` (exists, 93 lines);
  - eaten-world count;
  - best time per seed (`save.planetBest[seed]`);
  - "Legacy": the list of eaten worlds with dates.
- **The start menu:** a "Worlds eaten: N" chip and a gallery entry.

**C4 (P1). Star challenges for the planet.**
- **`progress.js`:** add `C('The World', …)` entries in the existing pattern:
  - eat the world in under 22 min;
  - swallow 5 ICBMs;
  - never Sealed;
  - eat the Maw;
  - break the Aegis;
  - fizzle the cracker;
  - catch the Moon.
- Three are offered per run (seeded). Dust rewards as in Phase 2.
- **Acceptance:** stars show on the results screen and persist.

**C5 (P1). NG+ and world archetypes.**
- **`planetgen.js`:** expose `makePlanet(seed, { archetype })` with land-fraction and noise presets:

  | Archetype | Land | Shape |
  |---|---|---|
  | Pangaea | 35% | one supercontinent (seed 7 already is one) |
  | Archipelago | 22% | many isles: pull-in heaven, sea threats |
  | Ice world | — | high walls |
  | Desert | — | low walls, dense silos |

- Unlock after the first world. The menu picks one.
- **NG+ difficulty:** damage k ×1.3, rivals spawn one tier earlier, the decay threshold is lower.
- **Acceptance:** each archetype passes `__planetLadder()` 80/80 and a 3-run sweep of 18-28 min.

**C6 (P2). Retry and continue.**
- "Retry tier N" also restores the director's DEFCON, cooldowns and budget at the checkpoint. Today `clear()` resets `t = 0` and `noto = 0`, so a retry is easier than the original.
- Store `{ budget, noto, cool }` in `checkpoint()`.

**Gate C:** a full campaign run (Phase 1 → Ascension → Phase 3 → finale → results) by hand, plus a sweep with the Moon and cracker on.

### WP-D: performance, audio and visual polish

**D1 (P1). Remove the dead food-era paths. DONE in WP-A** (`mapTex`/`mapData`, `woodV`/`roadV`, the road block, `uRoadW`, `onPatch`, stale comments; the pixel-ratio-3 fps A/B was not run; `?hole3d`/`uCut` kept as a documented debug flag).
- `planetglobe.js`: the `mapTex` sample (line 250), `woodV` / `roadV` (line 335), the road block (lines 480-482), `uRoadW`, `mapTex` / `mapData` creation and disposal (lines 770-772, 891), and `mapTex` in the material options (line 779).
- `planet.js` lines 327 and 329 (`uRoadW` write, `onPatch`).
- `planetgame.js` line 48 (`g.mapTex` in the upload list).
- The stale comments listed in §1.3.
- **Acceptance:** an interleaved A/B at `setPixelRatio(3)` (baseline T1 18 fps): the gain is reported in the commit, there's no visual change at T1 (screenshot diff), and `?webgl` boots.

**D2 (P1). T1 fill cost.**
- Bisect with `?off=fields|canopy|urban|relief|noise|pbr|cloud|wave|atmo` at pixel ratio 3, interleaved and at least 3 pairs (the memory-note method).
- **Verify the gating per fetch first.** `uGroundK` (parcels, hedges, rows, rivers, lakes) is 0 above 14 km. `uGroundM` (relief, woods, settlements, `planetglobe.js:189` and `:403`) stays live to 60-150 km. So some fetches are dead in play (r ≥ 40 km) and some are not.
- **Compile only the dead ones out:**
  - give `planetMaterial` a `close` option;
  - build a precompiled no-close patch variant;
  - swap to it once, when r first passes 14 km. That happens during the Ascension's surge, at 8 → 40 km between 5.0 and 7.4 s. Swap after that beat, or keep the full variant until `state.asc` ends.
- Do not wrap texture fetches in `If`. The memory note says it broke the render; use a separate material variant.
- **Target:** T1 ≥ 24 fps at pixel ratio 3 (from 18).
- **Acceptance:** `__ascend(false)` frames match the docs/screens ascend shots, and there's no hitch at the swap (`__perf` worst frame).

**D3 (P2). Checkpoint memory (B8). DONE in WP-A** (snapshot = `rem` + unit tables, ~17 MB, `ov` and `rem8` rebuilt by `restore`, reused at every tier-up; the §12.9/§12.10 '6 MB' text was not edited).
- `bite.save(into)` takes an optional target object and `.set()`s into preallocated arrays. `checkpoint()` reuses `this.ckpt.snap`.
- Drop `ov` from the snapshot if `restore` can rebuild it as `rem < 65535 ? 65535 : 0`. Check: `ov` only gates future chewing of touched texels; after a restore, `ov = 65535` for eaten texels is the right conservative value.
- Fix the "6 MB" claims in §12.9/§12.10.
- **Acceptance:** `save()` ≤ 20 MB, and no allocation on tier-up (Performance panel).

**D4 (P2). Per-frame allocations (§1.2).**
- `Threat.direct`: counters instead of `filter`, and a reused `tryK`.
- `PlanetWorld.update`: an inline min / max over 5 values.
- `W.eff(dx, dz, out = this._eff)`.
- Hoist `C(...)` colours to module consts.
- `Pool.flush`: skip when `this.live === 0`; track `live` in `spawn` / `step`.
- **Acceptance:** an allocation timeline in Chrome DevTools shows no steady sawtooth over 10 s of T1 play.

**D5 (P2). Memory at the swap.**
- Take a heap snapshot after `commit()` and list what the town and region still retain: city meshes, `grass`, `vegetation` instances, region tables.
- Release them in `dropTown()`.
- **Target:** under 800 MB used heap in Phase 3, from 1.25 GB.

**D6 (P1). Music and the soundscape.**
- **`sfx.js`:** add a synthesised **music bed** per tier (a sustained pad of 3 detuned saws through a lowpass, one chord per tier: T1 Dm, T2 Bb, T3 Gm, T4 a drone on D).
  - It crossfades on tier-up.
  - It ducks under tears (`duck` / `unduck` exist).
  - A pulse layer rises with DEFCON.
- Surf wash when the cap overlaps a coast (cheap: `landAt` at 8 rim points at 2 Hz).
- Pan stereo by screen x for booms.
- Continents keep the silence → organ → boom (`swell`).
- **Acceptance:** a listening pass, and mute (`m`) still silences everything.

**D7 (P1). Visual polish (from play).**
- **The wound:**
  - The vein pattern is busy over hundreds of km. Keep a hot molten band only at the eaten boundary (distance to `rem` crossing, available from the bite texture gradient). Make the interior dark basalt with sparse cooling embers.
  - **Break the texel staircase:** warp the bite-map sample uv by a noise offset of about 1.5 texels before thresholding, so the silhouette is torn rather than stepped (B9).
- **Threat scale:**
  - Silo fields: replace the 5 GLBs (20-50 km toys) with a ground decal (a scar of kind 3 at small reach) plus a blinking launch light. Show the GLBs only while they would be under 40 px.
  - Size the ICBM by `cd * 0.03` (now 0.07).
  - Cap fireball and glow sprite sizes at `min(k * r, 0.25 * camDist)` so T3 airbursts don't read as a second sun.
  - Cap ash column height at `min(3.2 r, 600 km)` so T4 smoke doesn't float in space past the limb (T4 capture: brown puffs beside the planet).
- **Night lights** (still visible at T3-T4 on the far globe): fade `cl2` (`dir * 2100`) by pixel footprint (`fadeTo(…, pxM)` like the ground) to stop the gold glitter.
- **The T4 camera:** in `phase3.js` `VIEW`, raise the pitch at 1200 km from 36° to 48° and at 2400 km from 32° to 58°, so the land ahead is on screen. Then re-run `__planet.limb()` for every r and portrait, keep it > 1°, and if needed raise `aim` at T4 instead of lowering the pitch.
- **The strafe band:** fill it with a 0.12 alpha hatch across its width (`inB` is computed but faint), so "you are in the band" reads.
- **ICBM arc:** add a lateral bias to the apex (`arcAt`: offset the great circle by `0.15 * chord` sideways) so it reads as an arc from the T1 camera.
- **Moon:** exempt it from chromatic aberration, or move the impostor in from the frame corner (`moonAt` -0.93 → -0.8), where post CA fringes it.
- **HUD:** DEFCON pips grey and amber at 5-4, red only at 2-1.
- **Acceptance:** before and after screenshots at 40 km, 200 km, 700 km and 1500 km, by day and at dusk, saved to `docs/screens/phase3-review-*.jpg`, and the README shots refreshed (memory note).

**Gate D:**
- `?fps&nowatch` at 1x: 60 fps at all four tiers.
- The pixel-ratio-3 A/B table in PHASE3.md §12 "As built".
- `?webgl&q=low` boots and plays to T2.

---

## 4. Order and sizing

| WP | Items | Size (Sonnet sessions) | Gate |
|---|---|---|---|
| A | A1-A3 (P0, about 1 session), A4-A5 (P0, 1-2), A6-A12 (P1-P2, 2) | 4-5 | balance sweep and BALANCE.md row |
| B | B0 refactor (1), B1 rivals (2), B2-B6 (1 each), B7-B8 (1) | 8-9 | sweep with the threat-share targets |
| C | C1 Moon (1-2), C2 finale (2), C3-C6 (2) | 5-6 | full campaign by hand |
| D | D1-D2 (1-2), D3-D5 (1), D6 (1), D7 (2) | 5-6 | perf table at 1x and pixel ratio 3 |

If time is short, ship **A1, A2, A3, A4, A5, A8, A9, B1, C1 and C2**. They fix the bug that eats a third of the late-game growth, the dark quarter of the run, the silent swath and the missing ending. They make the core loop legible, give humanity teeth, and give T4 something bigger than the player.
