# Handoff: Phase 3 performance tuning

State: Phase 3 (planetary stage, ending in a black-hole finale) is merged. Loop 3 (GPU perf + pacing) was started and cut off by a usage limit.

## Do next
1. Measure in a VISIBLE window at the default pixel ratio (docs/PERFORMANCE.md, tools/bench-snippet.js, `?fps`, `__perf`, `?off=` flags). Last visible-window numbers (DPR 2, WebGPU high): 52 / 48 / 44 / 40 avg fps at T1..T4; the bar is 58+ avg, 45+ 1% low. Resolve whether the default pixel ratio is 1 or 2.
2. Cut GPU cost: patch/globe material terms (mid-scale terrain, parcels, canopy, rivers, 4-tap B-spline wound, city footprints), atmosphere/clouds, AO beyond T2, cap-shader zone loops, finale lens. Fix the ~290 ms T3 patch-build hitch.
3. `docs/wip-loop3-perf.patch` holds the unfinished, UNTESTED edits of the cut-off agent: adaptive pixel-ratio hysteresis in `src/post.js` (watchdog) and `T3.rodK` 18 -> 14. Review, test (also Phase 1/2), then `git apply` or discard.
4. Pacing: human-like bot seed 7 mean 28.8 min (target 19-26), damage 13-23% mostly T4 rods (target 8-15%). See docs/BALANCE.md.
5. Known open items: docs/PHASE3-REVIEW-2.md.

Dev flags: `?planet`, `?planet&r=<m>`, `?planet&finale` (dev build only), `?region`, `__planetSweep(n, secs, 'human'|'naive'|'greedy')`, `__threat.force(kind)`.
