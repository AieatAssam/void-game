# Balance log

Bot runs from `node tools/balance.mjs [extraQuery] [seconds] [seeds]` (wraps `tools/botrun.mjs`; greedy + sloppy per
seed, 420 s cap, `q=low`, WebGL, headless). `open` = still alive at the cap. The simulation is not fully deterministic
(director/city use `Math.random`), so the same seed can land ±40 s apart between runs: compare bands, not single runs.

Target (HANDOVER §8, Stage 10): greedy clears in 3.5–4 min on most seeds and can die; sloppy mostly dies.
New systems must not push greedy below 2:45 or sloppy into regular clears.

## Baseline — before any Stage 11 system (commit 0ca949f)

| seed | greedy | sloppy |
|---|---|---|
| 777 | clear 4:26 (r 12.4) · standalone rerun 5:08 | clear 5:05 (r 10.3) |
| 11 | open at 7:00 (r 5.5, ★4) | open (r 2.0) |
| 23 | clear 4:22 (r 11.6) | clear 5:31 (r 8.4) |
| 42 | clear 3:28 (r 12.0) | open (r 4.4, ★4) |
| 99 | clear 3:32 (r 12.3) | open (r 5.2, ★4) |
| 2024 | clear 5:46 (r 13.9) | clear 6:08 (r 11.8) |

Greedy: 5/6 clear, 3:28–5:46 (median ≈ 4:24). Sloppy: 3/6 clear, all slower than greedy (5:05–6:08), none die
inside 7:00 — the sloppy bot currently survives more than "mostly dies". Nothing below 2:45.

## M2 — new districts (seeds 777, 42; `&mood=`)

| mood | greedy 777 | sloppy 777 | greedy 42 | sloppy 42 |
|---|---|---|---|---|
| Fun Fair | clear 3:21 | clear 4:51 | clear 3:33 | open (r 0.5) |
| Airport City | clear 5:47 | open (r 0.4) | open (r 1.8) | died 5:28 |
| Railway Town | clear 5:28 | clear 4:35 | open (r 0.4) · rerun clear 5:50 | open (r 1.2) |
| County Fair | clear 3:15 | open (r 4.0) | clear 3:25 | died 5:27 |

All greedy clears ≥ 2:45. Airport/Railway run a little slower than the base median (the runway/track rows carry less
food); both stay inside the base game's spread (base seed 11 also stalls). Sloppy clears 2/8.

## M3 — city events on (every run has one; commit 5ee0e4c)

| seed | greedy | sloppy |
|---|---|---|
| 777 | clear 5:23 | clear 5:26 |
| 11 | open (r 2.4) | open (r 1.5) |
| 23 | clear 3:08 | open (r 1.4) |
| 42 | open (r 4.2) | open (r 0.5) |
| 99 | clear 2:47 | clear 3:11 |
| 2024 | clear 4:27 | open (r 2.3) |

Greedy 4/6 clear, 2:47–5:23 (fastest just above the 2:45 floor: the parade's drummer conveyor feeds a small hole
well). Sloppy 2/6 (baseline 3/6). Inside the baseline spread.

## A/B after power-ups + chain reactions (12 seeds, greedy; commit f49142a vs 0ca949f)

A 6-seed sweep after M5 looked worse (greedy 2/6 clears), so both builds were run side by side on 12 seeds
(777, 11, 23, 42, 99, 2024, 5, 8, 13, 31, 64, 101). Moods differ per seed between the builds (four new moods in the
seed roll), so this compares distributions, not seeds.

| build | clears | clear times | open at 7:00 | died |
|---|---|---|---|---|
| base (0ca949f) | 8/12 | 3:28–4:35 (median ≈ 4:05) | 3 | 1 |
| Stage 11 so far (f49142a) | 7/12 | 2:57–4:31 (median ≈ 3:36) | 2 | 3 |

Clears get a little faster (capsules, drummer/runner conveyors, chain reactions knocking food loose) and a greedy
hole that over-heats dies a bit more often (fireworks notoriety, capsule detours). Nothing clears under 2:45.

## M7 — abilities used greedily (`&abil=quake,dash`, both slots; commit 30a5467, Quake cooldown 25 s)

| seeds | clears | clear times | open at 7:00 |
|---|---|---|---|
| 777, 11, 23, 42, 99, 2024, 5, 8, 13, 31, 64, 101 | 8/12 | 2:41–4:18 (median ≈ 3:19) | 4 |

Abilities shave ~20 s off a typical clear. Seed 99 (a Railway Town that already clears at 2:42–2:47 without abilities)
dipped to 2:41, so Quake's cooldown went 25 → 30 s. Every other clear is 3:00 or slower.

## Replayability pass: forgiving controls, perk drafts, Heat, Happy Hour (branch `feature/replayability`)

A/B on the default 6 seeds. "Before" is f0810c4: forgiving mouse aim and rim assist are already in, no perks.
"After" adds perk drafts at 0.95 / 4.4 / 8.6 m (the bot takes the first offer) and Happy Hour. One sloppy run that
crashed in the parallel batch was rerun on its own.

| seed | before greedy | before sloppy | after greedy | after sloppy |
|---|---|---|---|---|
| 777 | clear 4:11 | clear 4:41 | clear 4:05 | clear 3:41 |
| 11 | open (r 3.3) | open (r 1.2) | clear 4:15 | died 5:55 |
| 23 | clear 3:10 | open (r 8.6) | clear 3:04 | clear 3:34 |
| 42 | clear 3:25 | clear 6:02 | open (r 1.4, early stall) | clear 5:04 |
| 99 | clear 2:32 | clear 3:07 | clear 2:24 | clear 3:25 |
| 2024 | clear 3:38 | clear 6:13 | clear 3:48 | clear 5:43 |

Greedy: 5/6 before, 5/6 after, same spread. Sloppy: 4/6 → 5/6, and the sloppy clears come 30–60 s sooner. That
is the intended direction: the brief was a more forgiving game. Seed 99 (Railway Town) was already under the 2:45
floor before this pass (2:32), from the rim assist.

**Heat 5** (Hungry + Alert + Bold Rivals + Short Fuse + Lean Start), greedy: 777 clear 3:55 · 23 clear 3:21 ·
42 clear 6:23 · 99 clear 3:00. The bot barely notices the lower Heat levels: it doesn't plan around hunger or
notoriety. Heat 1–5 add pressure for a human player; 6–10 (Hard Knocks, Scarce Capsules, Crowded, Wanted, Against the
Clock) are the real gate. Dust: ×1.75 at Heat 5 (a 299-dust clear paid 521).

**Blitz** (seed 11, 2:00): r 3.6, 13 dust. Blitz is for the size record and the "Grow past 6 m in a Blitz"
contract, not for farming dust.

## Phase 2 — the region (branch `feature/phase-two`)

Run with `?region&bot&seed=N` and `__regionBot(900)` (starts at 10 m; `__sloppy = true` for the careless bot).

| Change | Why (what the bot showed) |
|---|---|
| Region bites grow the hole at 60% of a town bite; crumbs (trees, hedges, rocks) at 30% of that; the capital pays 90% | With town rates the bot went 10 → 20 m in a minute on woods and boulders, and the capital snowballed from 16 m. At 60% the country has to be eaten; the capital's 90% makes it a climax and leaves enough growth to fit the stadium (its last piece, 40.7 m). |
| No small-tower lots in the capital; the Capper arrives at 20 m | The capital opened at 10 m and was an early buffet; now it opens at ~16 m (glass towers) and properly at 20 m (city blocks). |
| Belly 16 s, crumbs +1.8% each, fed decay 0.2%/s, starving 1.5%/s | Travel legs between settlements are long; starving at a big size used to halve the hole in 30 s. |
| Army eased: two-gun salvos every 11 s at 5%, wider aim; at most two roadblocks; jets every 22–30 s; castle cannons 120 m, 3.5%; Capper 15% with a 10 s cooldown; Void Lids every 30 s, a short, gentler setting drain | 44 hits in 10 min (26 shells, 16 tolls) ground the bot down at 11–19 m. |

Results (final tuning):

| Seed | Greedy bot | Notes |
|---|---|---|
| 4242 | wins 5:12 | town → capital |
| 99 | wins 4:04 | stalled at 16–20 m before the Capper change; now climbs through the industrial valley |
| 2024 | wins 4:18 | |
| 7 | wins 3:51 | |
| 4242, careless bot | dies 13:30 | no dodging: 23 shells, 7 cannonballs |

Region dust is 90–160 on top of the town's (meals and combos at half rate from the region's score, plus 8 per settlement
and 40 for the capital). A human player takes longer than the greedy bot (it knows every target and path).
