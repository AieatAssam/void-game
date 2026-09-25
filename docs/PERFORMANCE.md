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
| **Texture compression (KTX2 / Basis).** Less VRAM and memory bandwidth per sample. | Open. The scanned surface set is small (512² JPEGs, 7.7 MB). Moving it to KTX2 (UASTC for normal/ORM, ETC1S for colour) would cut sampling bandwidth in the triplanar ground/toy shaders. It needs the `toktx`/`basisu` encoder in the asset pipeline, and a before/after on the M3. |
| **Static shadow caching** (render the shadow map only when something moves). | Open, and hard here: the sun's shadow box follows the camera and traffic moves every frame. A split static/dynamic shadow map is possible but not in three.js out of the box. |
| **Impostors for distant models.** | Not needed: the far LOD is already ~8% of the triangles, and the camera never sees far across the map. |

## Measuring on the target machine

- `?fps`: frame rate, CPU split (game logic / render submission), GPU time, draws, triangles, tier, dynamic-resolution steps.
- `?nowatch`: turns off the automatic quality fallback, so the numbers you see are for the tier you picked.
- `?q=high|medium|low`: pick the tier.

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
