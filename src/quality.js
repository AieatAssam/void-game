// Quality tiers. Decided once at startup (materials are built from it), with a runtime fallback in post.js.
//   low:    software renderers, phones, ?low. DPR 1, no AO / bloom / grain, FXAA, 1K shadows, single-projection scans, sparse grass that does not sample the shadow map
//   medium: integrated GPUs and the WebGL2 fallback. DPR 1, cheap AO, no bloom / grain, FXAA, 1K shadows, single-projection scans
//   high:   a discrete GPU. DPR climbs toward 2 while frames hold, 2K shadows, full scans, grass receives shadows
//   safari: its own measured 60 fps settings (a watchdog rebuild freezes it)
// Override with ?q=low|medium|high.
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('q') : null;
const nav = typeof navigator !== 'undefined' ? navigator : {};
const ua = nav.userAgent || '';
const touch = (nav.maxTouchPoints || 0) > 1;
// iPadOS reports a Mac user agent: touch points give it away
const mobile = /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (touch && /Macintosh/.test(ua));
const lowFlag = typeof location !== 'undefined' && /[?&]low\b/.test(location.search);
const forceGL = typeof location !== 'undefined' && /[?&]webgl\b/.test(location.search);

// desktop Safari: its WebGPU pays more per pass and per draw than Chrome's, and each watchdog step that rebuilds the post
// pipeline froze it for seconds (shader recompiles), so it starts on settings measured to hold 60 there (fixed-scene
// bisect, laptop GPU): 1x, cheap AO (0.35x, 6 samples), bloom, near grass, and the shadow map redrawn every 2nd frame
export const SAFARI = /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua) && !mobile;

/** The WebGL renderer string, probed once. Software and integrated GPUs must not start on the desktop tier. */
function gpuRenderer() {
  if (typeof document === 'undefined') return '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { powerPreference: 'high-performance' }) || c.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl.getParameter(gl.RENDERER) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name || '');
  } catch { return ''; }
}
const GPU = gpuRenderer();
const SOFTWARE = /SwiftShader|llvmpipe|softpipe|Microsoft Basic|VirtualBox|VMware|SVGA3D/i.test(GPU);
// Intel UHD / HD / Iris and the phone GPUs. Bare "Intel" would also match Arc, which is a discrete card.
const INTEGRATED = /UHD Graphics|HD Graphics|Iris|Mali-|Adreno|PowerVR|VideoCore|Tegra|Radeon\(TM\) Graphics/i.test(GPU);
// no WebGPU API at all: the game will be on the WebGL2 fallback, which cannot afford the high tier
const NO_WEBGPU = typeof navigator !== 'undefined' && !navigator.gpu;
const mem = nav.deviceMemory || 0;

function autoTier() {
  if (lowFlag || mobile || SOFTWARE || mem && mem <= 2) return 'low';
  if (SAFARI) return 'safari';
  if (INTEGRATED || NO_WEBGPU || forceGL || (mem && mem <= 4)) return 'medium';
  return 'high';
}
export const TIER = ['low', 'medium', 'high', 'safari'].includes(q) ? q : autoTier();

// grassShadow: blades sample the shadow map. Off wherever the shadow pass is already the thing missing 60 fps.
const TIERS = {
  low: { dpr: 1, ao: false, aoRes: 0.25, aoSamples: 4, bloom: false, aa: 'fxaa', shadow: 1024, grass: 0.35, grassFar: false, grassShadow: false, surface: 'lite', terrainStep: 3, trees: 0.55, grain: false, shadowEvery: 2, minCasterTier: 1 },
  medium: { dpr: 1, ao: true, aoRes: 0.25, aoSamples: 6, bloom: false, aa: 'fxaa', shadow: 1024, grass: 0.5, grassFar: false, grassShadow: false, surface: 'lite', terrainStep: 2, trees: 0.7, grain: false, shadowEvery: 2, minCasterTier: 1 },
  safari: { shadowEvery: 3, minCasterTier: 1.5, dpr: 1, ao: true, aoRes: 0.35, aoSamples: 6, bloom: true, aa: 'smaa', shadow: 2048, grass: 0.7, grassFar: false, surface: 'full', terrainStep: 2, trees: 0.8, grain: true },
  high: { dpr: 2, ao: true, aoRes: 0.35, aoSamples: 8, bloom: true, aa: 'smaa', shadow: 2048, grass: 1, grassFar: true, surface: 'full', terrainStep: 2, trees: 1, grain: true },
};

export const Q = { tier: TIER, shadowEvery: 1, minCasterTier: 0, grassShadow: true, ...TIERS[TIER] };
const why = mobile ? 'mobile' : SOFTWARE ? 'software renderer' : INTEGRATED ? 'integrated GPU' : NO_WEBGPU ? 'no WebGPU' : forceGL && !q ? 'WebGL fallback' : SAFARI ? 'Safari' : '';
console.info(`quality: ${TIER}${why ? ` (${why})` : ''}${GPU ? ` [${GPU.slice(0, 80)}]` : ''}`);
