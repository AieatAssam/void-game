# Performance without downscaling the models

How three.js games keep frame rate up without lowering model detail, what this game already did, what this pass
added, and what's left. Numbers come from the headless tools in `tools/`. That's a software renderer (SwiftShader),
so they show *relative* cost: triangles, draw calls and CPU milliseconds. They are not frame rates on real hardware.
On a real machine, `?fps` now shows CPU time (game logic vs render submission) and GPU time (WebGPU timestamp queries,
where the browser supports them), so you can see whether a frame is CPU- or GPU-bound.

## The techniques, and where the game stands

| Technique (what the research says) | Status here |
|---|---|
| **Instancing / batching.** One draw per repeated model (`InstancedMesh`) or per shared material (`BatchedMesh`). | ✅ Already done: the city is instanced per model per 40 m chunk, and animated landmarks render through merged per-part batches (ART.md → Budgets). |
| **LOD chain.** Swap in decimated copies with distance. | ✅ Already done: every model ships LOD1 (~25%) and LOD2 (~8%), chosen by distance per chunk. |
| **Frustum culling at the right granularity.** three.js culls per object, so one huge object is never culled, and one `InstancedMesh` spanning the map is culled all-or-nothing. | ➕ **Added.** The countryside terrain was one 1.7 km mesh that the camera and the shadow map always drew in full. It is now 96 m sectors sharing one vertex buffer: 249k → 16k tris in view, 236k → 14k in the shadow pass. City-wide traffic (whole-map instanced meshes, never culled) is now **culled per instance** every frame against the view and shadow frustums: 401k → 54k tris in view, 411k → 64k in the shadow pass. |
| **GPU-driven culling** (compute shaders writing indirect draws). | Not needed yet. The CPU per-instance pass above does the same job for the one group that needed it, and it works on the WebGL fallback too. |
| **Shadow budget.** Only near things cast, cheaper geometry for the shadow pass, depth-only shadow shaders. | ✅ Already done: shadow stand-ins at LOD1, 35 m cast distance, depth-only toy shadow shader. ➕ Terrain and traffic now also cull against the shadow camera (above). |
| **Vegetation LOD: density and geometry falloff.** Fewer, wider, simpler blades with distance. | ➕ **Added.** Far-ring blades are one triangle instead of five. Pulled back, blades thin out and widen to keep the same coverage (a 4–6 m hole draws about a third of the blades it did). ✅ Already done: grass only in cells that contain lawn, inside the view and the fade radius. |
| **Avoid fragment `discard` on tile-based GPUs** (Apple): it switches off hidden-surface removal. | ✅ Previous pass: grass and hole-free ground chunks draw without it. |
| **Dynamic resolution before feature cuts.** | ✅ Previous pass. |
| **Keep the CPU side lean.** Stable object shapes, no per-frame garbage, no repeated maths in hot loops. | ➕ **Added.** Entities are created with one fixed shape (`src/entity.js`), so V8's inline caches stay monomorphic, and the hole radius is cached: the game step went 7.2 → 5.1 ms at a 2 m hole and 10.3 → 6.9 ms at 6 m, including the new collision step. |
| **Occlusion culling** (hardware queries). | Not worth it here: a top-down camera over a flat city hides very little behind anything. |
| **Texture compression (KTX2 / Basis).** Less VRAM and memory bandwidth per sample. | ➕ **Added.** The 48 scanned surface textures ship as KTX2 (`npm run ktx2`, tools/ktx2.mjs): albedo as ETC1S, normals and roughness/height/AO as UASTC (ETC1S would smear the normals and the packed channels). The browser transcodes them to the GPU's native block format (ASTC on Apple, BC on desktop, ETC2 on mobile). The albedo array is 2 MB instead of 16 MB at the top mip, and normal/RHA are a quarter of their RGBA8 size, so every triplanar sample reads 4–8× less memory. Screenshots match the JPEG path side by side. Cost: the download grows from 4.5 MB of JPEG to 10.3 MB of KTX2. A GPU with no block format at all (rare), or `?jpgtex`, falls back to the JPEGs. |
| **Static shadow caching** (render the shadow map only when something moves). | Open, and hard here: the sun's shadow box follows the camera and traffic moves every frame. A split static/dynamic shadow map is possible but not in three.js out of the box. |
| **Impostors for distant models.** | Not needed: the far LOD is already ~8% of the triangles, and the camera never sees far across the map. |

## Real-device pass (Apple Silicon Mac, WebGPU, Chrome)

Measured in a real browser on Apple GPU (same tile-based family as the iPad) with `?bot&fps&nowatch&seed=4242`,
steady state after 12 s of play, dev and production builds. Two fixes, one open item:

| Finding | Fix | Result |
|---|---|---|
| **Shadow shaders recompiled every frame (CPU).** three.js keys a shadow-pass render object by *object*, not by geometry group. The tree meshes draw two groups (bark, leaves) with different wind `positionNode`/alpha/side, so the one shared shadow override material flip-flopped between them and its node shader was rebuilt twice per tree per frame: ~6 `NodeBuilder.build` a frame, a third of all main-thread time. | Trees cast through a shadow stand-in (the existing `shadowProxies`) with **one** material for bark and leaves (`vegetation.js`, leaf cards are `aWind.y > 0`), at the LOD they are drawn at. Rule: never let a multi-material mesh cast shadows directly. | render submit 9–17 ms → ~4 ms per frame |
| **Denoised AO evaluated three times at full res (GPU).** `denoise()` is not a pass: it is inlined (16 depth-aware taps) wherever its result is read, and `lit` fed bloom's input, the light-shaft source and the composite. The shafts also ran a 24-tap radial blur per full-res pixel. | `lit` is baked to a texture once (`convertToTexture`); shaft source and blur run at half res (`post.js`). No visible change (same-frame A/B). | high tier 48 → 58 fps; frames over 20 ms 30% → 3.5% |
| **First-sight shader builds (open).** three.js puts `object.uuid` in the shader cache key of every `InstancedMesh` (its instancing nodes bind per-object buffers), so each chunk mesh builds its own ~10–30 ms shader the first time it's drawn. Growth reveals new chunks, so the first minute stutters (20–30 frames of 50–130 ms per 25 s at a 1 m hole); steady state has none. | Tried and rejected: warming every mesh at load (~40 s), a wide-frustum `compileAsync` lookahead and nearest-first async prewarm (both *more* long frames: the async compiler still runs on the main thread and warms meshes that are never seen). The real fix is fewer `InstancedMesh` objects: bigger chunks per model, or `BatchedMesh` per material. | — |

Other readings: low tier holds 60 fps (vsync) on this Mac; late game (hole ≈ 9 m) holds 60 with a handful of
slow frames; grass costs little. The "Multiple instances of Three.js" warning is dev-server only (Vite pre-bundling);
the production build loads one copy. The overlay's GPU ms is not trustworthy on this setup (it reads 30–90 ms while
holding 60 fps): judge GPU headroom by fps with features toggled (`?noao`, `?noshafts`, `?grass=0`, `?q=`).

## Phase 2 (the region)

The region is 3 km of land with ten settlements, ~500 buildings and 34k trees, hedges and rocks, seen from up to ~700 m.

| Risk | What was done | Result |
|---|---|---|
| **Building the region stalls the game.** Terrain (1.3 s) and the forest scatter (2.6 s) were single long tasks. | The terrain build and scatter are generators run in 3 ms slices in the background while the town is still being eaten; the scatter's overlap test is a hash grid (it scanned every earlier placement: also speeds up every town load). Only the unsliceable part (instanced meshes, roads) runs at the breakout, under the slow-motion camera lift. | Breakout swap ~1.7 s, no long tasks |
| **First-sight shader builds** (one per InstancedMesh, see above). | Region chunks are 400 m (one mesh per model per settlement); the new meshes compile during the breakout. | ~80 new meshes instead of ~800 |
| **LOD and shadows in fixed metres** (15/60 m LOD, 35 m shadows) with a camera 150-700 m away. | Both scale with the hole (`lodScale`); tiny things hide by their share of the hole, people and cars stay visible as specks for longer. | ~100 draws, 0.4-1.2M tris at r = 12-40 |
| **34k crumbs culled one by one** (2.3 ms a frame). | Crumbs are bucketed once into 128 m cells; each frame only cells in the view or shadow frustum are packed. They are also out of the per-entity update loop: only grid cells under a hole are tested. | 0.13 ms a frame |
| **Depth precision** at 700 m (roads and paving are stacked a few cm apart). | The near plane follows the camera distance (2%); far plane = 4x the distance. | no z-fighting |
| **The crumble** would need its own material per building type. | The buildings' own instanced meshes carry per-vertex part centres and a per-instance progress slot; one crumble variant of the toy material. | no extra pipelines |

### Phase 2 on the real device (Apple Silicon, Chrome, WebGPU, visible window)

| Where | High tier | Low tier, WebGL2 fallback |
|---|---|---|
| Village (r = 12) | 60 fps (vsync), p95 17.6 ms, 112 draws, 0.72M tris | — |
| Market town (r = 18) | 60 fps, p95 17.8 ms, 119 draws, 0.69M tris | 51 fps |
| Industrial valley (r = 24) | 60 fps, p95 17.5 ms | — |
| Densest forest cell (r = 14 / 30) | 60 fps, 86–100 draws, 0.54–0.72M tris | — |
| Capital (r = 40) | 58–60 fps, 100–114 draws, 1.0–1.5M tris | 54 fps |

**The breakout on a visible run** (long-animation-frame attribution):

| Found | Fix | Result |
|---|---|---|
| The region pack (36 models, 108 files) decoded all at once when the prebuild started: a ~1 s freeze 6 s into every town. | `loadPack(..., { gentle: true })`: one model per frame. | gone |
| Prebuild steps up to 230 ms between yields (field layout, the terrain build's tail, the crumb list; `fieldAt` scanned ~300 fields per vertex). | Everything sliced; `fieldAt` uses a 64 m grid. | no step over 16 ms |
| The swap: drawing the whole new world on its first frame froze for 1.2 s (first-sight shader builds). Precompiling it (canvas or scene-pass target) froze for 1–5 s instead. | The region's meshes reveal five per frame under the dust; finish and the grass mask in separate frames. | worst frame ~200 ms, reveal frames 65–90 ms for ~0.7 s |
| The breakout dust was fill-rate bound (dozens of 30–40 m sprites). | Fewer, smaller puffs. | — |

## Phase 3 (the planet) — WP-D measurements

Method: the Browser pane is *hidden* during agent runs and throttles `requestAnimationFrame` to 1 Hz, so the numbers below are not rAF timings. `window.__bench` (tools/bench-snippet.js) steps the game with `__tick(1/60)` and waits for the GPU
(`device.queue.onSubmittedWorkDone()` on WebGPU, a 1-pixel `readPixels` on WebGL) every 10 frames: ms per frame = CPU and GPU together, no vsync. Apple Silicon, seed 4242, hole set with `__planet.setR` and settled
for 120 ticks; pixel ratio 1 is the game's own cap (`look.js`), pixel ratio 2 is the iPad / retina stress case.

| ms / frame (pr 1 / pr 2) | T1 40 km | T2 150 km | T3 450 km | T4 1200 km |
|---|---|---|---|---|
| WebGPU high | 8.1 / 26.1 | 5.5 / 18.9 | 4.8 / 15.9 | 5.2 / 14.5 |
| WebGPU `?q=low` | 6.5 / 21.0 | 4.7 / 16.3 | 4.0 / 13.9 | 3.9 / 11.7 |
| `?webgl` high | 5.5 / 19.6 | 5.7 / 19.8 | 5.3 / 18.0 | 5.2 / 15.3 |
| `?webgl&q=low` | 7.2 / 23.1 | 5.5 / 18.5 | 4.7 / 15.5 | 4.0 / 12.0 |

- **Budgets (§6.7):** draws 34-46 (budget 75 / 60), triangles 0.25-0.28 M high and 0.09-0.10 M low (budget 1.0 M / 0.45 M), CPU game step 0.6-0.9 ms per frame in `__tick` (budget 4 ms). Everything is far inside; the game is fill-bound.
- **Pixel ratio 1: 120+ fps equivalent at every tier, every backend.** Pixel ratio 2 is 38-69 fps (T1 is the heaviest: 26 ms on WebGPU high). The game caps its pixel ratio at 1, so this only matters for a device that forces a higher one; the dynamic-resolution watchdog (`post.watch`) covers it.
- **Cost of the new mid-scale terrain (WP-D):** at pixel ratio 3, T1: 42.6 ms (`?off=mid`) vs 53.9 ms: +27% of a fill-bound frame, 6.1 vs 8.2 ms at pixel ratio 1. The noise is hill octaves (3 evaluations of 4 octaves for the shading gradient) and the drainage. `?q=low` keeps two octaves and the main river only. It is gated by pixel size, so it costs nothing where a pixel outgrows it (the rivers are skipped by an `If` above 2.6 km a pixel).
- **D2 (T1 fill cost), not done, with the reason:** the dead texture fetches at T1 (`fields` A/B, `urban`, scan B: 4 of 11) priced at about 5% (`?off=fields,urban,pbr`: 24.9 vs 26.1 ms at pixel ratio 2; run-to-run noise on this pane is the same size). A no-close material variant would add a shader compile and a swap for that. Left alone.
- **Allocations (D4):** the game step allocates ~5 KB per frame (`__headless` ticks, coarse `performance.memory`), a render frame ~19 KB: no sawtooth worth chasing. The D4 rewrites were not done.
- **Texture memory:** surf 6 MB + night 3 MB + bite 6 MB + trail 0.25 MB + the baked ground (fields 4 MB, canopy / urban / relief 1 MB each, with mips ~9 MB) ~ 25 MB; `renderer.info.memory.textures` = 61-62.
- **Tier-up and first-frame hitches (`__tick` time, 40 frames after each `setR`):** the worst frame at 20 -> 45 -> 70 -> 110 km is 17-18 ms (the patch rebuilds are sliced), and at 160 / 300 / 450 / 800 / 1200 / 2000 km 2-6 ms. The one hitch is the **first frame drawn after load: ~330-350 ms** (the first `post.render` of the patch material in a page whose pane was hidden); it sits under the loading line in a visible page but should be re-checked with a visible `__perf()`.
- **Finale at `?q=low`:** `Finale.prepare` already builds fewer shards (30, icosphere level 5) and streaks on the low tier; the lens runs in the post pass (closed form, only within ~9 shadow radii). Not re-measured visibly.

### Audio level probe (`window.__sfxProbe(scenario, secs)`)

An `OfflineAudioContext` renders the heaviest moments through the same graph. Peak / RMS in dBFS at the output:

| Scenario | Peak | RMS | Same without the compressor / clip |
|---|---|---|---|
| nuke + hit + grind + rumble + klaxon + tear, bed on at T3 DEFCON 1 | -10.5 | -21.4 | -9.7 / -22.8 |
| the finale's fall (every lane busy, rupture, hits, last mouthful) | -3.4 | -11.6 | **+0.8** / -12.6 |
| everything at once (finale + cracker + Aegis + level-up) | -3.1 | -11.5 | -1.6 / -12.5 |

Without the limiter the finale clipped (+0.8 dBFS); the finale's own bus also bypassed the master gain (it was 1.0, the rest 0.35): it is now 0.4. Chrome's compressor adds make-up gain (+9 dB on the nuke scene); a 0.6 trim after it brings the loudness back to the old mix. The output stage is
`master (duck) -> tier lowpass -> bus (mute) -> compressor -> trim -> tanh soft clip`, so it is bounded to +-1 by construction.

## Measuring on the target machine

- `?fps`: frame rate, CPU split (game logic / render submission), GPU time, draws, triangles, tier, dynamic-resolution steps.
- `?nowatch`: turns off the automatic quality fallback, so the numbers you see are for the tier you picked.
- `?q=high|medium|low`: pick the tier.
- `?noao`, `?noshafts`, `?nopost`, `?grass=0`, `?off=pom,cav,...`: switch single features off to find the cost.

If the overlay's GPU time is close to the frame time, the GPU is the limit: try `?grass=0` and `?off=pom` to see
which feature costs most. If CPU time is close, it's the game logic or draw submission: compare the two CPU numbers.

## Sources

- [100 Three.js tips that actually improve performance](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [Building efficient three.js scenes (Codrops)](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/)
- [Optimizing three.js: draw calls, instancing and batching](https://bersus.io/insights/creative-dev/threejs-optimizing-instancing-and-batching/)
- [Draw calls: the silent killer (Three.js Roadmap)](https://threejsroadmap.com/blog/draw-calls-the-silent-killer)
- [When is LOD actually beneficial in three.js? (forum)](https://discourse.threejs.org/t/when-is-it-actually-beneficial-to-use-lod-in-three-js-for-performance/87697)
- [Occlusion culling discussion (forum)](https://discourse.threejs.org/t/performance-issues-occlusion-culling/63511)
- [Per-instance frustum culling on InstancedMesh (forum)](https://discourse.threejs.org/t/ideas-on-performing-fast-per-instance-frustum-culling-on-instancedmesh/85156)
- [ComputeBatchCulling: GPU culling with WebGPU](https://www.threejs-blocks.com/docs/ComputeBatchCulling)
- [Shadow map `autoUpdate` / caching (forum)](https://discourse.threejs.org/t/renderer-shadowmap-autoupdate-false/50401)
- [Three.js performance guide (gist)](https://gist.github.com/iErcann/2a9dfa51ed9fc44854375796c8c24d92)

### Island pass (see-through, detail reach, cracks, rivals, minimap, rubble, capsules)

Visible window, Apple Silicon, Chrome, high tier, 1627×1071 at 1.5x:

| Scene | WebGPU | WebGL2 fallback |
|---|---|---|
| Town, start and 12 m | 60 fps (vsync), worst 18–19 ms, CPU ~5 ms, 130–165 draws | 60 fps, worst 18 ms, GPU ~13 ms |
| Island, 20–25 m | 60 fps, worst 18 ms, ~100 draws, 0.7M tris | 60 fps, worst 18–19 ms, GPU ~20 ms |
| Capital, 45 m hole | 60 fps, worst 18 ms, ~120 draws, 1.85M tris | |

Loading: ~3–4 s to the menu on WebGPU, ~20 s on WebGL2 (shader compiles; the precompile wait is capped at 8 s so a
background tab can't stall it, since three's WebGL backend polls compiles with requestAnimationFrame).

### Frame-time analysis and the breakout stall (`?fps`)

The `?fps` overlay now records every frame:
- **Numbers:** now, 10 s average, 1% low, min and max fps, worst frame (10 s and since load).
- **Hitch counts:** frames over 33, 50 and 100 ms.
- **Graph:** a 10 s frame-time graph.
- **Hitch log:** every frame over 50 ms, with its JS time, render-submit time and what the game was doing (phase,
  breakout, region reveal).
- **API:** `__perf()` returns all of it, and `__perf(true)` resets it.
- **Hidden pages:** frames while the page is hidden are skipped, because the browser throttles them (a sleeping laptop
  screen counts as hidden).

Measure with `nowatch`, or the quality watchdog changes resolution under you. A/B the steady state only on a quiet
machine; the pane inside the desktop app varies by ±10 fps between identical runs. Stalls over ~150 ms are unambiguous.

**What the stats found (seed 4242, visible window):**
- **One shader program per instanced mesh.** Below the uniform-buffer limit three.js reads instance matrices from a
  uniform array whose block it names per mesh. The island then needed 862 vertex programs for 311 meshes. WebGL
  compiles each program on the main thread: about 650 ms, measured with a long-task observer, even through
  `compileAsync`. That caused a 4.6 s frame at the swap and 200–600 ms frames as the island revealed.
- **The fix:** `getUniformBufferLimit` returns 0 (`look.js`), so instance matrices are always vertex attributes and
  meshes share programs. The island went from 862 programs to 58. Steady state is unchanged: WebGL 59–60 fps with the
  worst frame about 20 ms; WebGPU 54–57 fps with the worst about 22 ms.
- **The precompile built the wrong variants.** It used `renderer.compileAsync(scene, camera)` on the canvas, but the
  game draws through the post pipeline's scene pass (its own target and MRT), so the first real draw compiled again.
  `post.precompile()` now compiles in the pass's context:
  - Loading on WebGL: one mesh per material and geometry layout (every program exists before play); each mesh's own
    ~25 ms node build happens as it comes into view.
  - Loading on WebGPU: on-screen only (queueing all 1,261 town meshes cost 8 s of load and a stuttery first minute).
  - At the breakout: the island's meshes, one per frame. three's own loop ran the builds back to back and dropped
    the cinematic to 10 fps. Instanced meshes at count 0 (culled traffic, crumbs) are included.
- **Culled instance buffers** upload only the drawn prefix (`upload()` in city.js).
- **The reveal** slows to one mesh per frame while frames run long.
- **WebGL loading** dropped from 20 s to about 4 s.

| Breakout (town, switch, island) | Before | After |
|---|---|---|
| WebGL: swap frame | 4.0–4.6 s | 1.3–1.4 s |
| WebGL: reveal | ~15 frames of 200–600 ms | 3–7 frames of 90–160 ms |
| WebGL: steady island | 59 fps | 60 fps, worst frame 20 ms |
| WebGPU: swap frame | ~300 ms | 340 ms |
| WebGPU: cinematic | smooth | smooth (a few 90–130 ms frames) |
| WebGPU: reveal | 7–10 frames of 100–140 ms | 6 frames of 80–145 ms |

**Still open:** the swap frame compiles about 7 programs that exist only once the switch happens (probably the new
systems: army units, rival holes, capsules), and shadow-pass shaders aren't covered by any precompile.

## Phase 3 loop 2: real-time play, visible window (PHASE3-REVIEW-2 P1-5)

Browser pane at 1085 x 714, devicePixelRatio 2, `document.visibilityState = visible`, rAF 58 Hz, WebGPU high, `?planet&seed=7&fps`, `__planet.setR(r)`, 2.5 s settle then `__perf()` over 8 s, nothing else on the GPU:

| tier (r) | avg fps | 1% low | worst frame | JS ms | submit ms |
|---|---|---|---|---|---|
| T1 (40 km) | 52.3 | 38.2 | 30 ms | 0.66 | 1.26 |
| T2 (150 km) | 47.5 | 41.2 | 54 ms | 0.88 | 1.15 |
| T3 (450 km) | 43.7 | 31.6 | 290 ms (one hitch, a patch build) | 1.46 | 2.30 |
| T4 (1200 km) | 39.8 | 34.0 | 31 ms | 1.88 | 1.53 |

- The game is GPU-bound at this window and DPR 2 (JS 1-2 ms a frame): it holds 40-52 fps, not 60. Not reproducing the doc's 8.1 / 4.8 / 5.2 ms (pixel ratio 1).
- `__bench` (tools/bench-snippet.js) in the same visible window, with the game's own rAF loop still running (so it is inflated, about 2x): pixel ratio 1 gives 20.2 / 26.5 / 32.1 / 27.6 ms and pixel ratio 2 gives 68 / 85 / 108 / 96 ms for T1 / T2 / T3 / T4. T1 at pr 1 is over the 12 ms line in the review, so **D2 (the no-close terrain variant) is still open**: not done in this loop; do it before a low-end target.
- Not measured: `?off=mid` at T1, WebGL fps, a 25-minute continuous run. The sweeps' time stays headless.
