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
| 4242 | wins 4:07 | market town, castle, then the capital from 18 m |
| 99 | wins 4:04 | stalled at 16–20 m before the Capper change; now climbs through the industrial valley |
| 2024 | wins 4:18 | |
| 7 | wins 3:48 | farms, then the capital from 13 m via its glass towers |
| 4242, careless bot | dies 13:30 | no dodging: 23 shells, 7 cannonballs |

### Island pass (relief, mountains, rivals, the seal)

| Change | Why (what the bot showed) |
|---|---|
| Rivals only swallow things under half your size | Seed 77: Bubblegum ate 439 things including the market town, leaving nothing between 16 and 20 m; the bot starved and was sealed at 8:14. Now a win in 4:07. |
| No dead ends: if nothing standing fits, crumbs grow you at the full rate (hint shown) | Seed 4242: shelled from 18.9 to 13.7 m with every settlement left needing 16 m+; sealed at 10:33. Now a win in 5:43. |
| Death is the army's seal below 9 m (14 s to grow past 9.6 m; instant below 7.5 m) | A scripted, readable loss instead of shrinking back to town scale. |

| Net at 0.6x while stuck (`P2.stuckGrowth`); the bot heads for the woods when stuck | At 1.0x the careless bot always won (8:48); careless play should lose sometimes. The greedy bot didn't know to follow the "go to the woods" hint (crumbs aren't in its target list) and starved at 0.6x until it did. |

| Seed | Greedy bot | Careless bot |
|---|---|---|
| 4242 | wins 6:38 | sealed at 9:53 (16 shells) |
| 77 | wins 4:10 | wins 4:39 |

Region dust is 90–160 on top of the town's (meals and combos at half rate from the region's score, plus 8 per settlement
and 40 for the capital). A human player takes longer than the greedy bot (it knows every target and path).

## Human-paced pass (branch `perf/safari-gpu`)

Playtest report: "as a human I cannot chase everything fast enough to grow; my hole stays small and keeps shrinking".
The greedy bot sees the whole map and never misses, so it hid this. New `humanBot()` (bot.js): sees only what's on
screen, re-plans every 0.45-1 s after a 0.18-0.33 s reaction, picks among its top 4 with a bias, wobbles +-10 degrees,
dodges 3 rings in 4 by sidestepping, keeps away from bigger rivals and the Capper, explores when nothing's in view and
follows the same edge arrows a player gets. `__humanSuite(n, secs)` (town), `__regionSuite(n, secs, who)` (island,
fixed seeds 4242, 77, 5, 99, 2024, 7, 31, 555) print one line per run with a growth ledger (`state.ledger`: m2 from
buildings and crumbs, lost to fed decay, starving and each kind of hit; share of time travelling).
`window.__botDbg` counts which push steered the bot, to trace a stall.

| Change | Why (what the human-like bot showed) |
|---|---|
| Town: hunger ramps over 10 min (was faster); small holes drain and decay less | It stayed small and shrank. Now clears 8/8 towns in 4:50-9:33. |
| Hunt mode: last 25% of buildings (town) or of the capital: no drain, no decay, arrow to the nearest | Stalled with 1-17 scattered buildings left, all small enough. |
| Island: `P2` belly 24 s, growth 0.8x (capital 0.9x), army cadence 32-42 s jets / 44 s lifts, Capper 0.1 every 14 s | Human-paced runs spend 2-3x as long on the island as the greedy bot; hits scaled with time. |
| Arrow target sticks unless another settlement scores 1.5x; distance weighs more than meal size | Flip-flopped between two settlements and went nowhere; sent 900 m past two villages. |
| Town and industry placed on the capital's side of the island (within 1100 m, else anywhere) | Seed 4242 put both 1900 m from the capital: greedy and human bots both starved on the trek. |
| The capital is never skipped (retries 10% nearer the middle) | Seed 31 had no capital: unwinnable. |
| Air strike 0.12 to 0.08, lid 0.18 to 0.12 (`P2.jetHit`, `P2.lidHit`) | The two losses of six lost 3500+ m2 to each. |
| Bot sidesteps rings instead of backing off; in-settlement arrow from 100 m past the edge | Hovered 200 m outside the capital for minutes, rings landing on it, the last pieces off screen. |

Island, from `?region&r=16` (8 fixed seeds):

| Bot | Result |
|---|---|
| Human-like, before | 0/6 to 3/6 won, stuck at 24-33 m, 77-92% travelling |
| Human-like, after | 8/8 won in 2:05-6:25 |
| Greedy (before the last two rows) | 3/4 won in 2:22-3:43 (4242 died: the layout) |
| Careless (before the last two rows) | 4/4 won in 2:45-5:24: it still sees the whole map, so it's no longer the lower bound; the human-like bot is |

## Phase 3 (planet), R4 — the unit bot, 3 seeds (`__planetSweep(3)` in the browser pane, `?planet&seed=N`)

The human-like `planetSteer` (units within 8 r, goal ×6, follows the arrow within 12 r, hunt from 97%), headless at 1/30 s steps; each run 12-20 s of real time. Config: G anchors 0.035 / 0.05 / 0.08 / 0.13 / 0.2 / 0.3 at 40 / 150 / 450 / 1000 / 1600 / 2600 km, `speedExp` -0.30, `collapseK` 0.3, decay 0.1% fed / 0.5% starving, faded out 67% → 97% land, none in the hunt. **All 15 runs win (99.5% land).**

Minutes per tier (T1 is r 40-150 km ... T4 r ≥ 1200 km), total, land % at the tier-ups (T2 / T3 / T4; doc target 1 / 8 / 45), end radius:

| seed | run | T1 | T2 | T3 | T4 | total | land at T2 / T3 / T4 | r end |
|---|---|---|---|---|---|---|---|---|
| 7 | 1 | 5.5 | 6.2 | 7.2 | 5.0 | 23.9 | 1.5 / 11.1 / 56 | 1656 km |
| 7 | 2 | 5.3 | 5.9 | 4.8 | 7.3 | 23.3 | 1.2 / 11.3 / 48 | 1582 |
| 7 | 3 | 5.2 | 5.9 | 5.7 | 4.8 | 21.6 | 1.3 / 10.7 / 55 | 1779 |
| 3 | 1 | 5.3 | 2.5 | 4.1 | 6.4 | 18.3 | 1.1 / 6.2 / 38 | 1706 |
| 3 | 2 | 6.0 | 4.2 | 4.1 | 5.1 | 19.4 | 1.1 / 9.6 / 43 | 1748 |
| 3 | 3 | 6.0 | 5.2 | 3.2 | 7.8 | 22.2 | 1.2 / 10.5 / 41 | 1661 |
| 11 | 1 | 7.1 | 3.5 | 5.1 | 7.3 | 23.0 | 1.5 / 8.8 / 44 | 1661 |
| 11 | 2 | 7.6 | 2.8 | 6.4 | 6.4 | 23.2 | 1.5 / 7.0 / 49 | 1864 |
| 11 | 3 | 7.4 | 3.8 | 4.2 | 5.9 | 21.3 | 1.5 / 8.6 / 42 | 1818 |
| 1 (extra) | 1-3 | 5.0-5.4 | 6.2-7.4 | 4.0-6.5 | 4.5-7.2 | 21.1-25.5 | 1.2 / 12-13 / 49-56 | 1360-1781 |
| 5 (extra) | 1-3 | 5.9-7.6 | 8.7-10.1 | 3.8-5.7 | 5.4-7.8 | 25.9-28.8 | 1.5-1.9 / 12-15 / 46-54 | 1537-1755 |

Seeds 7 / 3 / 11: **18.3-23.9 min** (target 18-25), T1 5.2-7.6, T2 2.5-6.2, T3 3.2-7.2, T4 4.8-7.8. The greedy bot (seed 7, 2 runs): 18.8 and 18.5 min (≥ 15). Seed 5 is slow (a poor start, long crossings), seed 11's T1 is long (a thin coastline start).

Ledger shares (growth by source, 15 runs): **swath 62-68%, tear-offs 31-38%, pull-in 0-1%**, decay (fed + starving) 10-40% of the gains (the hole ends 1.2-1.9k km, doc 2.3k).

How the numbers were found (seed 7, 3 runs each unless noted):

| Change | Result |
|---|---|
| Doc G anchors (0.06 / 0.065 / 0.09), `collapseK` 1 | T2 at 100 s, 60% tear share, 9 min games (R3) |
| R3 interim anchors + float accounting | no run could pass 99.25%: phantom land, see PHASE3.md §12.8b |
| 16-bit exact accounting, bonus ×2.2 | 20 min wins; the home province lingered at 50% for 10 min (bot preferred fresh provinces) |
| goal bonus ×6 | goals clear in 1-2 min (province), T4 reached late |
| follow the arrow within 40 r | T2 7-8 min, T3 ≥ 12 min: chasing nation remnants across the planet |
| follow within 12 r + chain of 5 goals, G 0.05 / 0.07 / 0.11 | 18-19 min, T4 only 3.6-4.3 min |
| `speedExp` -0.22 → -0.30 | T3 / T4 +25% (they are land-supply bound, not G-bound) |
| `collapseK` 0.2 | tear share 23% but 24-30 min games |
| `collapseK` 0.3, G(450) 0.08, G(1000) 0.13 | final: 21.6-23.9 min on seed 7 |
| starving decay 0.8% → 0.5% and fade-out 67-97% | decay share 60% → 15-30%; T4 no longer stalls below 1200 km |

## Phase 3 WP-A — sea credit, damage in seconds of income, satellites as a catch (`docs/PHASE3-REVIEW.md`)

Changes that move pacing: (A1) land credit is no longer thrown away when the hole's *centre* is at sea (T4 swath +33%); (A2) the sun rides with the hole (no night side to play on); (A5) collapse combo +10% per level to ×5 on torn land, ripe-unit chasing in the bot; (A8) satellite orbits run 1.5-2.5 r to the side of the hole for 12 s and are eaten within 0.7 r for ×1.01 (was ×1.02, free, 7% of all growth); (A9) a hit costs `max(old fraction, k s of income)` with `k` = 25 s nuke / 25 s rod / 12 s bomber (`T3` in `phase3.js`; income = EMA, tau 30 s, of gross growth), fallout 45 s and land ×0.5, the first ICBM at 14 s is capped at 7%; (A10) walls and ridge drag see the relief E ramped in from 40 to 450 km (`P3.heightK`; the sweep shows no pacing difference with it at 0 or 1); `P3.gScale` 1.00 → 1.06 (the new damage costs ~5% of pace). Planet perks (A7) are taken first-offer by the bot (they change speed / depth / sea / tear / hurt / noto / pull / gulp).

`__planetSweep(3, 3000, 'human')` on seeds 7 / 3 / 11 (`__planetSum()` prints these rows), normal DEFCON, all threats on. Minutes per tier, total, land % at the tier-ups (T2 / T3 / T4), r end, threat damage / bonus / satellite share of all gains (`ledger`), decay share:

| seed | run | T1 | T2 | T3 | T4 | total | land at T2 / T3 / T4 | r end | dmg % | bonus % | sat % | decay % | hits / rods / sats | 
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 7 | 1 | 5.0 | 7.9 | 5.2 | 5.7 | 23.8 | 1.0 / 12.3 / 39 | 2311 km | 9.2 | 2.4 | 1.8 | 14 | 5 / 16 / 5 |
| 7 | 2 | 4.8 | 6.1 | 5.5 | 8.1 | 24.5 | 1.0 / 8.6 / 40 | 2151 | 12.7 | 2.4 | 1.8 | 18 | 4 / 17 / 6 |
| 7 | 3 | 5.3 | 6.9 | 6.6 | 4.6 | 23.4 | 0.9 / 10.8 / 46 | 2513 | 0.5 | 2.6 | 1.9 | 12 | 2 / 16 / 5 |
| 3 | 1 | 6.0 | 3.7 | 5.8 | 5.8 | 21.3 | 1.1 / 8.5 / 42 | 2276 | 7.3 | 3.6 | 2.3 | 11 | 6 / 14 / 5 |
| 3 | 2 | 6.3 | 2.8 | 4.1 | 6.1 | 19.3 | 1.0 / 5.1 / 35 | 2137 | 0 | 1.4 | 1.0 | 26 | 1 / 12 / 6 |
| 3 | 3 | 5.4 | 7.2 | 2.1 | 5.2 | 19.9 | 1.0 / 10.1 / 32 | 2326 | 0.4 | 2.3 | 1.6 | 11 | 5 / 13 / 4 |
| 11 | 1 | 6.7 | 6.1 | 4.1 | 5.6 | 22.5 | 1.3 / 8.1 / 35 | 2647 | 5.1 | 1.9 | 1.0 | 12 | 3 / 14 / 3 |
| 11 | 2 | 8.2 | 6.9 | 4.9 | 5.3 | 25.3 | 1.4 / 8.6 / 39 | 2700 | 0.6 | 2.8 | 1.4 | 11 | 4 / 15 / 5 |
| 11 | 3 | 6.6 | 5.1 | 5.8 | 6.5 | 24.0 | 1.3 / 7.3 / 37 | 2678 | 0.9 | 0.8 | 0.7 | 13 | 2 / 15 / 4 |

All 9 runs win in **19.3-25.3 min** (target 18-25), r end **2.1-2.7k km** (was 1.2-1.9k, doc target 2.3k: the sea fix), swath 59-65% / tears 35-41% / pull 0-1%. Threat bonuses 1-4% of gains (was ~9:1 gift over damage: swallowed nukes + satellites ~10%); satellites 0.7-2.3% (was ~7%) and the human-like bot catches about 30% of them (greedy: all of them in the forced test, human 3-6 of 8). Damage 0-12.7% of gains, mean 4%: the area-weighted share is low because a hit costs the same *seconds of progress* at every tier (about 1.5% of a run per hit), the late-game area dwarfs the early one, and the human bot dodges or dives 2/3 of the locked rings. A real player hits more. Sealed warnings: 0 of 9 (the lid still only matters to a player who starves); one earlier seed-3 run sealed at 9 min after a T1 stall (r 27 km, decay 140% of gains): the bot stuck on its islet, a start problem, not a threat problem. Variance between runs of one seed is large (T2 2.8-7.9 min): coast crossings.

How the numbers moved: first pass at k = 15 / 15 / 8 with a 10 s income EMA gave hits of 1-48% depending on a tear burst (income is lumpy: 0.04-2.6%/s); tau 30 s evened it out; k up to 25 / 25 / 12 and `gScale` 1.06 brought 24-28 min back to 19-25. A satellite 2.5-4 r to the side with a 6.6 s orbit (the review's numbers) cannot be caught at all (the hole moves 0.27 r/s at 600 km); 12 s and 1.5-2.5 r can.

## Phase 3 WP-B — adversity at the new scale (`docs/PHASE3-REVIEW.md` B0-B8, `docs/PHASE3.md` §12.11)

New kinds on top of WP-A: rival holes (the Maw at T3, the World-Eater at T4), MIRV, orbital laser, carrier groups + cruise salvos, tsunami, volcano, the Aegis, the planet-cracker, rockets and a space station. Config at the end: `P3.gScale` **1.3** (was 1.06: the new attacks, errands and set pieces cost 6-10 min of dodging, fleeing and starving that the growth anchors then had to give back), `T3.coolK` [1.3, 1.15, 1, 0.75, 0.6] by tier (T1-T2 gentler than before, T4 faster), `T3.cap` build 2 / peak 3 / relax 1 live telegraphs, +1 at DEFCON <= 2, `rodK` 25, `nukeK` 25, per-kind numbers in `T3.kinds` (`phase3.js`).

`__planetSweep(3, 3300, 'human')` on seeds 7 / 3 / 11 (`__sweepRows()` prints these rows), normal DEFCON, everything on. Minutes (cumulative at the tier-ups T2 / T3 / T4), land % at the tier-ups, r end, threat damage / bonus % of all gains (`ledger.dmg`, `ledger.bonus`), decay %, hits, mercy-cap hits, Sealed warnings, **unfair** (a hit whose telegraph was fixed for < 1.5 s: `stats.unfair`), the rivals' share of the world's land, Aegis attempts / broken, cracker spawned / fizzled / hit:

| seed | run | total | at T2 / T3 / T4 | land at T2 / T3 / T4 | r end | dmg % | bonus % | decay % | hits | mercy | Sealed | unfair | rivals % | Aegis | cracker |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 7 | 1 | 28.6 | 4.3 / 11.8 / 19.8 | 0.7 / 10.8 / 41 | 2239 | 11.3 | 10.8 | 27 | 13 | 1 | 0 | 0 | 13.0 | 1 / 1 | 1 / 1 / 0 |
| 7 | 2 | 21.7 | 4.3 / 12.5 / 17.2 | 0.7 / 9.4 / 44 | 2535 | 13.9 | 8.3 | 8 | 12 | 2 | 0 | 0 | 5.4 | 1 / 1 | 1 / 1 / 0 |
| 7 | 3 | 20.2 | 5.3 / 9.1 / 14.2 | 1.1 / 5.7 / 35 | 2506 | 6.6 | 9.8 | 15 | 7 | 1 | 0 | 0 | 9.4 | 1 / 1 | 1 / 1 / 0 |
| 3 | 1 | 18.0 | 5.7 / 8.3 / 13.2 | 1.0 / 4.7 / 36 | 2582 | 2.2 | 4.9 | 11 | 6 | 1 | 0 | 0 | 8.7 | 1 / 1 | 1 / 0 / 0 |
| 3 | 2 | 17.3 | 6.2 / 9.0 / 13.9 | 1.5 / 6.2 / 37 | 2605 | 1.7 | 11.0 | 8 | 4 | 0 | 0 | 0 | 8.7 | 1 / 1 | 1 / 1 / 0 |
| 3 | 3 | 23.1 | 6.4 / 11.1 / 17.0 | 1.1 / 7.3 / 45 | 2173 | 10.1 | 10.4 | 22 | 12 | 0 | 0 | 0 | 6.7 | 1 / 1 | 1 / 1 / 0 |
| 11 | 1 | 22.2 | 6.3 / 11.4 / 15.1 | 1.1 / 6.7 / 30 | 2828 | 4.4 | 3.3 | 18 | 11 | 0 | 0 | 0 | 7.0 | 3 / 0 | 1 / 0 / 0 |
| 11 | 2 | 21.9 | 8.3 / 14.5 / 17.1 | 1.2 / 7.1 / 26 | 2894 | 6.4 | 3.3 | 8 | 9 | 0 | 0 | 0 | 10.0 | 2 / 0 | 1 / 0 / 0 |
| 11 | 3 | 18.8 | 7.0 / 11.8 / 14.6 | 1.1 / 7.3 / 28 | 2888 | 9.5 | 2.9 | 8 | 8 | 1 | 0 | 0 | 10.7 | 1 / 0 | 1 / 0 / 0 |

All 9 runs win. **Mean 21.3 min** (range 17.3-28.6; 6 of 9 inside 19-26, three just under, one over: seed 3 is the fast seed and seed 7 run 1 lost 5 min to a long T3). Threat damage **mean 7.3%** of gains (range 1.7-13.9, a hair under the 8-15 target: the human bot dodges or dives most rings and a real player hits more); bonuses mean 7.2% (<= 10); mercy-cap hits 1-2 in 5 of 9 runs; **Sealed warnings 0 of 9 and unfair 0 of 9** (the audit: every damaging event had a telegraph fixed for >= 1.5 s); 11-12 of the 12 kinds seen per run (`stats.seen`: bomber, ICBM, lance, MIRV, laser, fleet, tsunami, volcano, Aegis, rockets, cracker, rival); the rivals eat **8.8% of the land** on average (5.4-13); the bot broke the Aegis in 6 of 9 runs (all of seeds 7 and 3, none of seed 11, where it used 1-3 tries; 3 of 5 in isolation: `T.force('aegis')` at 900 km with the human bot) and fizzled the cracker in 5 of 9 (it dodged the ring in the other 4: 0 hits). Hits by kind over the 9 runs: rod 27, nuke 15, volcano 13, fleet 12, MIRV 8, tsunami 7, laser 0 (the bot keeps out of the beam), Aegis 0, cracker 0, rivals 0 (the bot bends away).

How the numbers moved (seed 7 unless noted):

| Change | Result |
|---|---|
| First full run, everything on, bot unchanged | SEALED at 20 min: the bot fled the Maw for 4 min (the flee overrode ring dodges), 29% damage |
| bot: bend away from rivals, rings first | won in 27.7 min, 29% damage (the cracker ring could not be left in 4 s at T4 speed: lock = `lockFor(1.3, 4.5, 8)`) |
| fleets: 3 salvos / 45 s, rings placed 0.7-1.9 r off (the first one 0.15-0.45 r), lock >= 2 s | 40 fleet hits in a 45 min run -> 1-3 per run |
| bot errands one decision per set piece (Aegis p = 0.85, 60 s; stations 80 s) | the bot broke the Aegis in 6 of 9 runs (it was 0 of 7 with a coin per platform: 0.67^6 = 9%) |
| laser: one sweep (not two at DEFCON 1), cooldown 90-120 s, bot bends away from the beam | T4 stalled at 82% land for 35 min: a beam that is "always on" kept the bot fleeing; fixed |
| rivals: lifetime 140 / 170 s, graze at 4% speed, start digesting | the rivals ate 20-30% of the world, now 5-13% |
| Aegis `draft()` double-counted `draftsDue` | a second perk draft opened from a timer in headless runs and froze the sim at 5% speed: two 55 min runs |
| `gScale` 1.06 -> 1.28 -> 1.32 -> 1.2 -> 1.3, `coolK` T3 / T4 0.85 / 0.7 -> 0.75 / 0.6 | 28-35 min -> 23.7 -> 20.5 -> 21.3 min, damage 4-9% -> 7.3% |

Perf (visible pane, `?fps`, 1085x714, WebGPU): with a laser sweep, a MIRV (4 warheads), a lance, two rivals live: **60 fps, JS 1.07 ms average, worst frame 20 ms, director 0.31 ms** (`__threat.state().ms`); `?webgl&q=low`: 60 fps, JS 0.99 ms, director 0.20 ms, with a laser, a MIRV, the Aegis and a rival; forcing each of the new kinds in turn in a fresh WebGPU page produced no frame over 33 ms (everything is built and precompiled under the loading line). **Fill cost, pinned `setPixelRatio(3)`, interleaved old / new pairs of the same scene (ripe rings, a nuke ring, a lance) against the WP-A build (`bdf0ef7`): 30.4 / 28.9 fps old vs 26.4 / 27.9 new, about -8%** (the 20-slot zone loop and 12 scars; the pane varies by +-10 fps, so this is an indication, not a figure); gating the new zone kinds' noise by `If(kind > 2.5)` vs always evaluating it: 24.2 / 14.4 / 12.4 vs 23.2 / 12.5 / 15.6 fps, no difference within the noise. At 1x the scene holds 60 fps.

## Phase 3 WP-C — the Moon, the finale, the end of a world (`docs/PHASE3.md` §12.13)

`__planetSweep(3, 3300, 'human')` with `window.__finaleBot = true` on `?planet&bot&seed=N&nowatch` (each run, once won, plays the finale headless at 40x via `PlanetGame.fastFinale()`: it must start, swallow all 45 chunks and reach its card with no error). Config: Moon from **88%** of the land (`T3.kinds.moon`: nine rocks, 3.5% a swallowed rock, hit 3% / 6 s of income capped at 10%, 5% for all nine), the cracker waits for the Moon (or 96%), the win is held while rocks fall. Seed 7 was run on the previous Moon tuning (90%, hit 4% / 8 s, cap 20%); seeds 3 and 11 on the final one.

| seed | run | total | at T2 / T3 / T4 | r end km | dmg % | bonus % | hits | Moon swallowed / hits | cracker | unfair | Sealed | finale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 7 | 1 | 21.9 | 5.3 / 10.7 / 14.7 | 2529 | 5.2 | 14.1 | 7 | 2 / 1 | 1/1/0 | 0 | 0 | card, 45/45 |
| 7 | 2 | 21.7 | 4.9 / 11.8 / 16.0 | 2672 | 21.8 | 20.9 | 16 | 0 / 3 | 1/1/0 | 0 | 0 | card, 45/45 |
| 7 | 3 | 21.3 | 4.6 / 10.8 / 15.5 | 2705 | 15.0 | 18.5 | 12 | 3 / 2 | 1/1/0 | 0 | 0 | card, 45/45 |
| 3 | 1 | 17.7 | 4.6 / 8.0 / 13.6 | 2431 | 14.8 | 5.0 | 10 | 0 / 4 | 0/0/0 | 0 | 0 | card, 45/45 |
| 3 | 2 | 26.7 | 4.5 / 7.6 / 19.1 | 2102 | 1.6 | 12.5 | 4 | 1 / 0 | 1/1/0 | 0 | 0 | card, 45/45 |
| 3 | 3 | 15.5 | 4.8 / 7.2 / 9.2 | 2563 | 13.7 | 13.0 | 9 | 4 / 2 | 0/0/0 | 1 | 0 | card, 45/45 |
| 11 | 1 | 23.0 | 6.8 / 11.9 / 15.1 | 2875 | 17.9 | 20.2 | 14 | 3 / 1 | 1/0/0 | 0 | 0 | card, 45/45 |
| 11 | 2 | 21.3 | 6.9 / 10.1 / 15.1 | 2822 | 4.2 | 27.9 | 5 | 3 / 1 | 1/1/0 | 0 | 0 | card, 45/45 |
| 11 | 3 | 18.4 | 6.1 / 13.1 / 15.1 | 3275 | 0.6 | 13.2 | 4 | 2 / 0 | 0/0/0 | 0 | 0 | card, 45/45 |

All 9 runs win and all 9 finales reach the card without an error. **Mean 20.8 min** (15.5-26.7). The Moon came in all 9 (before the hold it was missed in 1 of 9 when the cracker was still charging at 99.5%; it now comes first). The human bot swallows **~2.0 of 9** rocks per run (1 time in 3 it dives; in an isolated harness with the Moon alone it swallowed 5 and 3 of 9, a pure diver 9 of 9) and takes 0-4 Moon hits. With the Moon first the cracker is skipped when a run is fast (3 of 9 runs: the world is won before its turn), and the one `unfair` of the 9 is a rock that hit before its ring locked (seed 3 run 3). Damage mean 10.6% (the Moon's hits are part of it; the earlier WP-B mean was 7.3%), bonuses mean 16.2% (the Moon's gulps and the earlier set pieces; target was <= 10: the feast is deliberately generous, it is the last minute of the world).

Why the first Moon tuning failed (kept for the record): the hole crosses only ~0.18 r a second at 2.4k km (`P3.speed`), so a 4.4 s lock with the ring 1.5 r away made a dive unreachable (0 of 27 rocks eaten by the human bot); offset 0.6 r and a lock of 2.4-6 s fixed it. The win was flagged while rocks still fell (the bot loop broke at 99.5%): the goal scan now waits for the Moon and the sweeps stop at `state.won`.

**Performance** (visible pane, 1085x714, WebGPU; fill-bound A/B at pinned `setPixelRatio` 4-5, interleaved pairs, the pane varies by +-10%): the shard top is the globe's own shader (21.4-22.3 fps vs 21.3-21.7 with the plain globe at pixel ratio 4: no difference); the cut, the core, 13.5k streaks and the disk glow add nothing measurable; the **lens + disk stage** costs about **6 ms at pixel ratio 5 (19.4 Mpix), ~0.3 ms per Mpix, ~1 ms at 1085x714 at 2x** (13 ms before the disk's noise became one periodic texture fetch and only the wanted half of the disk was evaluated per pixel), it is a uniform-gated `If` and costs nothing when the strength is 0; JS: `Finale.apply` writes 44 x 4 `vec4` uniforms and a few dozen scalars a frame (below the 1 ms budget; headless at 40x the 88 ticks of a whole finale take 0.2-1.3 s including the build). Building: `buildShards` runs in 3 ms slices behind the play from 80% of the land; the one-off compile of the shard-top shader (~150 ms in one frame) is moved under the Moon's break flash (`finaleCompile`), or to the finale's own freeze if the Moon never came. `?webgl` and `?q=low` (30 shards, level-5 icosphere, 45% streaks, one turbulence octave) render every beat with no error; `?q=low` frames match WebGPU's composition.

**Not measured:** audio by ear (the API runs without errors, the graph is built once); a real-time 30 s play-through frame log of the finale on a slow GPU.

## Phase 3 loop 2: stakes (docs/PHASE3-REVIEW-2.md P0-1), the no-dodge bot as the gate

**What changed.** (a) A hit costs the land clock: `state.stun` = 3.5 s + 45 s x fraction at 0.35x speed (a 7% nuke = 6.6 s; compounds 50% on an open stun; capped 14 s). (b) A wound state: each hit adds 0.15 + 2 x fraction, heals in 60 s, and slows by up to 50%, so only a player who keeps getting hit stays hobbled. (c) The hit floors grow with the tier (x1 / 1.2 / 1.5 / 1.8), so a T4 nuke is no longer 1-3%. (d) The Void Lid follows the peak: `0.7 x max(tier floor, 0.75 x best r)`. Unchanged: telegraph >= 1.5 s, no hit > 25%, the 25% / 30 s mercy cap, the comeback. Knobs: `T3.stunBase/stunK/stunSlow`, `T3.wound*`, `T3.tierHit` (phase3.js). Bots: `__planetSweep(n, 3300, 'human' | 'naive')`; `naive` = the human bot with every ring / beam / wave / lid dropped from `dangers()`, errands only. Rows now carry `who`.

**Gate.** A never-dodging bot is clearly slower, takes far more hits and damage, and can be Sealed; the dodging bot still wins in range. Minutes per run (cumulative tier clock in the raw rows); `hits` = damaging hits taken; `dmg` = % of gains lost.

| seed | bot | runs (min) | mean | hits | dmg % | Sealed |
|---|---|---|---|---|---|---|
| 7 | human | 29.3 / 27.0 / 30.2 | 28.8 | 15-20 | 18-23 | 0 |
| 7 | naive | 33.2 / 32.9 / 27.3 | 31.1 | 40-75 | 22-50 | 0 |
| 3 | human | 19.1 / 24.0 / 18.7 | 20.6 | 6-16 | 13-21 | 0 |
| 3 | naive | 22.8 / 31.6 (SEALED) / 27.9 | 27.4 | 34-89 | 18-66 | 1 of 3 |
| 11 | human | 24.9 / 26.4 / 24.5 | 25.3 | 7-12 | 13-19 | 0 |
| 11 | naive | 37.0 / 32.0 / 30.6 | 33.2 | 39-57 | 36-44 | 0 |
| all | human / naive | | **24.9 / 30.6** | 8-20 / 34-89 | | 0 / 1 |

- Naive is **+23% slower on average** (the gate was >= 20% or a Seal), takes **3-5x the hits**, 2-3x the damage, and sealed once in nine runs. Every run still won: nothing in this build ends a world by itself.
- Earlier tuning passes, for the record (seed 7, n = 3 each): stun 3 / 40 only: human 22.4, naive 27.1 (+21%); stun 4 / 60: human 28 (too slow), naive 33.6 (+20%); stun 3.5 / 45 + wound (shipped, before the eater2 / silo / town commits): human 22.0 / 24.3, naive 39.1.
- **Noise is large.** Same seed, same build, human: 22.2-24.1 vs 27.3-23.7 (silo scale reverted) vs 29.3-30.2 (HEAD). The human seed 7 mean of 28.8 is above the 19-26 target; seeds 3 and 11 sit inside it. Damage for the dodger (13-23%) is above the 8-15% aim, mostly rods at T4. A mild `tierHit` cut (1 / 1.15 / 1.35 / 1.55) is the first knob if a human playtest says it hurts.
- Unfair (< 1.5 s telegraph) count: 0 in all 18 runs. Mercy saves: human 0-4, naive 1-19 per run (the cap is doing its job, and it is why naive does not die).
- T1 on seed 11 is 6.4-9.7 min (target 4-5); T2-T4 stay inside 3-11 min. The T3 / T4 tails shrank: the long ones (T3 14.7-14.8 min on naive seed 7) are the naive bot's, a dodger's worst tier is 10.7 (T2, seed 7).
- Sweep hygiene: three tabs in parallel stalled a run (a stale finale build attached itself after `reset()`); fixed with an epoch in `finalePrep` / `startFinale1`; sweeps run one tab at a time now.
- Bots and debug worlds no longer bank (`devRun()` in progress.js): the sweeps leave the save alone.
