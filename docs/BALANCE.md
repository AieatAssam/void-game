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
