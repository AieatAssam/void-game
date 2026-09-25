# Replayability — recommended next features

Where the game stands after Stage 11: ten cities that unlock in order, 30 star challenges, one event per run, challenge
cards, weekly mutators, a daily city, dust upgrades, abilities, skins and a collection book. That is plenty to *start*
playing. What's thin is the reason to play **the 20th run** of a city you've already starred:

- **Runs play out the same way.** Growth is a fixed curve. Once you know a city, nothing you choose *during* a run
  changes how it goes: cards and abilities are picked before the run starts.
- **Progress hits a ceiling.** Stars cap at 30. Upgrades cap at three levels. Skins are a short list.
- **No social pull.** Scores never leave the browser, and nothing asks you to beat someone (or yourself).
- **Little surprise.** The same props sit on the same tiles, and there is one event per run.

The recommendations below target those four gaps, ranked by *replay value per unit of work*. Each one says where it
plugs into the existing code, so it can be scoped as a milestone.

## Implemented on `feature/replayability`

Research first (sources below), then the patterns that fit a 3–6 minute arcade run:

| Pattern (research) | In the game | Code |
|---|---|---|
| **Meaningful in-run choices / agency:** a roguelite run stays fresh when the player makes build decisions *during* it, choosing from a small, seeded set (Hades boons, Slay the Spire card rewards) | **Perk drafts.** At three size-ups (benches ≈ 0.95 m, houses ≈ 4.4 m, apartments ≈ 8.6 m) the world slows to a crawl and the void offers **3 of 14 perks, pick 1** (click, or keys 1–3). Perks stack into builds: vehicle glutton, combo king, chain master, rival bane… Draws come from the run seed, so the daily/weekly city offers everyone the same choices. Taken perks show as chips on the left and on the results screen. | `src/perks.js`, `openDraft()` / `takePerk()` / `applyMods()` in `main.js` |
| **Self-chosen, stacking difficulty for mastery** (Hades' Pact of Punishment / Heat, Slay the Spire's Ascension): experts set their own challenge and get paid for it | **Heat 1–10** per city, unlocked by clearing it. Each level adds one modifier (Hungry, Alert, Bold Rivals, Short Fuse, Lean Start, Hard Knocks, Scarce Capsules, Crowded, Wanted, Against the Clock) and +15% dust. The best Heat cleared is kept per city; each clear opens the next level. New players never see it. | `src/heat.js`, `renderHeat()` in `main.js` |
| **Daily goals and streaks, "without shame":** short daily goals bring players back; streak multipliers reward consistency, and a freeze stops one missed day from wiping out weeks of play | **Daily contracts.** Three goals a day, the same for everyone (seeded by date), playable in any city and adding up across runs: "Swallow 20 cars", "Set off 3 chain reactions", "Clear any city in under 4:30"… Finishing one extends the **streak**, which raises contract pay by up to +70%. One freeze a week covers a missed day. | `src/contracts.js`, `renderContracts()` in `main.js` |
| **Short sessions / "one more go"** (Hole.io's 2-minute rounds) | **Blitz 2:00.** Grow as big as you can in two minutes; best size is kept per city. | `BLITZ` in `main.js` |
| **Variable rewards / surprise** | **Happy Hour.** In about half of runs, once, somewhere between 1:00 and 3:30: 20 s where everything grows you 50% more and combos last longer. | `happyAt` in `main.js` |

Balance (bot sweep, `tools/balance.mjs`) is in docs/BALANCE.md. Test flags: `?heat=N`, `?mode=blitz`; the bot takes the
first perk it is offered.

### Sources

- [What makes or breaks agency in roguelikes](https://thom.ee/blog/what-makes-or-breaks-agency-in-roguelikes/): meaningful choices from small, readable offers
- [On roguelikes and progression systems](https://indiecator.org/2022/03/30/on-roguelikes-and-progression-systems/): in-run builds vs meta progression
- [Pact of Punishment (Hades wiki)](https://hades.fandom.com/wiki/Pact_of_Punishment) and [Hades Heat modifiers and rewards](https://www.rpgsite.net/feature/10287-hades-pact-of-punishment-heat-modifiers-and-how-to-maximize-your-rewards): opt-in stacking difficulty with rewards
- [Master the art of streak design](https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/), [The psychology of hot-streak game design](https://uxmag.medium.com/the-psychology-of-hot-streak-game-design-how-to-keep-players-coming-back-every-day-without-shame-3dde153f239c) and [Streaks for gamification in mobile apps](https://www.plotline.so/blog/streaks-for-gamification-in-mobile-apps): streak multipliers, freezes, no-shame resets
- [Hole.io](https://grokipedia.com/page/Hole.io): 2-minute rounds as the genre's replay hook
- [22 tips to increase player retention](https://www.game-developers.org/22-tips-to-increase-player-retention-in-games-the-definitive-guide): daily goals, variable rewards

## Top five (do these first)

### 1. In-run perk drafts (roguelite choices at every size-up) — highest impact
At each size-up milestone (`MILESTONES` / `sizeUp()` in `main.js`), the game pauses for a beat and offers **3 perks,
pick 1**. Examples:
- **Glutton:** vehicles grow you 30% more.
- **Deep Roots:** trees count double.
- **Shock Rim:** clogs stun police.
- **Tide Rider:** no slow in water.
- **Chain Master:** chain reactions pull debris into you.
- **Snack Magnet:** the whirlpool lasts 50% longer.

Perks stack, so each run builds differently: a "vehicle build" plays differently from a "chain-reaction build".
- **Reuses:** the `CARDS` rule-twist pattern (`cards.js`), `hole.reach`/`vac`, growth multipliers in the eaten loop,
  the level-up banner UI.
- **Seeded** from the run seed, so the daily/weekly city offers everyone the same perk draws. That makes it a shared puzzle.
- **Balance:** add a bot policy that picks the top-scoring perk, and keep greedy clears inside the §8 band.
- **Effort:** medium (about 12–20 perks, a draft UI, and one bot policy).

### 2. Heat levels (stackable difficulty for mastery)
After you clear a city, unlock **Heat 1–10** for it. Each level adds one permanent modifier:
- faster hunger;
- rivals start bigger;
- units spawn one star earlier;
- an existing mutator;
- fewer capsules;
- no snack floor for the first minute.

Higher heat multiplies dust and records a **best heat cleared** per city (shown on the city picker card). This is the
core loop that keeps skilled players replaying the same ten cities (Hades' Heat, Slay the Spire's Ascension).
- **Reuses:** challenge cards, weekly mutators (`mutators.js`), director knobs (`HEAT_R`, `NOTO_STARS`, cooldowns), `ECON` multipliers.
- **Save:** `save.heat[mood] = best cleared`.
- **Effort:** low–medium. Most modifiers already exist as cards or mutators, so this is mostly a stacking layer and UI.

### 3. Ghost races and shareable seeds
- **Ghosts.** Record the hole's path (x, z, r at 10 Hz, about 30 KB per 5-minute run, delta-encoded) for your best clear of each city,
  daily and weekly. Replays race a translucent **ghost hole** of your best (or a friend's) run. Rivals already render
  extra holes and name tags, so a ghost is a rival with a scripted path and no collisions.
- **Share codes.** A "Share run" button produces a URL
  (`?seed=…&mood=…&card=…&mutator=…&heat=…&ghost=<compressed path>`) plus the existing "biggest bite" polaroid, with
  time and stars stamped on it. It works on static GitHub Pages: no backend.
- **Reuses:** `Rivals`/`Hole` for rendering, `snapshot()` for the card, URL params that already exist (`seed`, `mood`, `mutator`).
- **Effort:** medium.

### 4. Daily contracts and streaks
Three small rotating goals per day across any city, for example:
- "Eat 3 UFO crew."
- "Chain two gas stations in one run."
- "Clear any city with Ghost active for 20 s."

They pay dust and a streak counter; a 7-day streak rewards a cosmetic. This gives a reason to open the game every day,
even for players who don't care about the daily leaderboard city.
- **Reuses:** the star-challenge DSL and run stats in `progress.js` (`newStats`, `end(stats, won, time)`). Contracts
  are the same table with a date seed.
- **Effort:** low. It's data plus a small menu panel.

### 5. More surprise inside a run: event roulette and rare "golden" moments
- **Two events on long runs.** The second fires after 4:00 at 50% odds (e.g. a marathon *and* a late UFO).
- **Rare golden variants for the new packs.** Examples: a golden pumpkin, a rainbow drummer, a chrome carousel horse,
  a first-class carriage. Rares already exist (`rares()` in `city.js`); new variants are mostly a tint plus a book
  entry, and they give collectors a reason to replay each district.
- **Rare city-wide "Happy Hour" (a 5% roll).** For 30 s, everything edible glows and combos pay double; announced
  like the event warning.
- **Effort:** low. It reuses events, `rares()`, the edible glow and the toast/arrow UI.

## Next tier

| # | Feature | Why it adds replay | Plugs into | Effort |
|---|---|---|---|---|
| 6 | **Collection sets**: finish a set (Fair, Rail, Airport, Parade, Rares…) → a trail/rim cosmetic and a book badge | Gives the book goals beyond "see everything once"; pulls players into every district and event | `book.js` (`bookEntries`, `record`), `skins.js` | Low |
| 7 | **Cosmetic layers beyond skins**: rim trails, swallow FX (confetti colours, sparks), victory camera moves, hole "voices" (gulp sfx sets) | Long-tail dust sink; people replay to unlock the look they want | `Sparks`/`Debris` palettes, `hole.js` materials, `sfx.js` | Low–medium |
| 8 | **City mastery tracks**: per-city XP (from eating that city's signature things), with bronze/silver/gold clear-time medals beside the stars | Gives a starred city another ceiling; medals give speedrunners a target | `progress.js` save schema, city picker cards | Low |
| 9 | **Rival nemeses**: a rival that eats you comes back next run by name, bigger and with a grudge; beat it three times for its skin | Personal stakes and a story across runs; turns rivals from noise into characters | `rivals.js` (`NAMES`, spawn size), `save.nemesis` | Medium |
| 10 | **Ability variants / talent picks**: each ability branches once (Quake → Aftershock or Sinkhole; Dash → Blink or Ram) | More build variety for the meta layer; pairs with perk drafts | `abilities.js` | Medium |
| 11 | **Endless "Megacity" mode**: after the last building falls, a new ring of districts builds out from the edge and heat keeps climbing; score = size × time | A mode with no end for high-skill players; showcases every pack at once | `City.layout()` rings, the pack loader, director heat | Medium–high |
| 12 | **Seasonal and weather events** tied to the real date: autumn pumpkins everywhere, winter snowmen (edible) and slippery roads, spring blossom, rain puddles that slow cars | Returning players see something new; drives comeback visits | Mutator system + `?time` presets; some new models (Blender) | Medium (art) |
| 13 | **Kaiju / boss finale (optional)**: at ★4 late in a run a giant mech or blimp arrives; outgrow it, or shrink it with chain reactions, for a big payout | A memorable climax; different each time depending on your build | Director units + new model (Blender); no-dead-end rules apply (it must be temporary or eventually edible) | High (art) |
| 14 | **Photo mode**: pause, free orbit camera, the LUT/time-of-day presets, a share button | Players share screenshots, which pulls in new players and gives existing ones a reason to show off rare moments | Existing `?view` camera path, `post.setPreset`, `snapshot()` | Low |

## Suggested sequencing

1. **Replay loop:** perk drafts (1) + Heat levels (2). Together they change *how* a run plays and give an open-ended
   difficulty ceiling. Balance both with the bot sweep (`tools/balance.mjs`) against the §8 band.
2. **Retention:** daily contracts and streaks (4) + collection sets (6) + mastery medals (8). All data-driven and low effort.
3. **Social:** ghosts and share codes (3) + photo mode (14). No server needed.
4. **Surprise and content:** event roulette and golden variants (5), then seasonal events (12) and a boss (13), which need Blender art.

## Guardrails (keep what already works)

- **No dead ends** (PLAN.md): perks and heat modifiers must never block movement, and every hazard stays temporary or
  becomes edible. Heat levels change pressure, never the size ladder (`npm run check`).
- **Economy:** new dust sources (contracts, heat multipliers) go through `ECON`, so the "dust is scarce" rule from
  Stage 10 holds. Re-run the dust-per-run numbers in docs/BALANCE.md after each.
- **Performance:** ghosts are one extra hole (one draw set). Megacity must stream districts through the pack loader
  and keep the draw-call and triangle budgets in ART.md.
- **Determinism:** perk draws, contracts and golden rolls use the run's seeded `rng`, so dailies and shared seeds stay
  fair. Moving the remaining `Math.random` gameplay calls (director, city panic) onto the seed would also make ghost
  races and balance runs reproducible.
