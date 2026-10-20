// Quality tiers. Decided once at startup (materials are built from it), with a runtime fallback in post.js.
//   low:    phones, ?low. DPR 1, no AO / bloom / grain, FXAA, 1K shadows, single-projection scans, sparse grass
//   software: SwiftShader or ?q=software. Lower DPR/pixel budget, no realtime shadows or grass
//   medium: integrated GPUs and the WebGL2 fallback. DPR 1, cheap AO, no bloom / grain, FXAA, 1K shadows, single-projection scans
//   high:   a discrete GPU. DPR climbs toward 2 while frames hold, 2K shadows, full scans, grass receives shadows
//   safari: its own measured 60 fps settings
// Override with ?q=software|low|medium|high. `software` also applies automatically to SwiftShader-class renderers.
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
export const TIER = q === 'software' || SOFTWARE ? 'low' : ['low', 'medium', 'high', 'safari'].includes(q) ? q : autoTier();

// grassShadow: blades sample the shadow map. Off wherever the shadow pass is already the thing missing 60 fps.
const TIERS = {
  low: { dpr: 1, ao: false, aoRes: 0.25, aoSamples: 4, bloom: false, aa: 'fxaa', shadow: 1024, grass: 0.18, grassFar: false, grassShadow: false, surface: 'lite', terrainStep: 3, trees: 0.55, grain: false, shadowEvery: 2, minCasterTier: 1 },
  medium: { dpr: 1, ao: true, aoRes: 0.25, aoSamples: 6, bloom: false, aa: 'fxaa', shadow: 1024, grass: 0.5, grassFar: false, grassShadow: false, surface: 'lite', terrainStep: 2, trees: 0.7, grain: false, shadowEvery: 2, minCasterTier: 1 },
  safari: { shadowEvery: 3, minCasterTier: 1.5, dpr: 1, ao: true, aoRes: 0.35, aoSamples: 6, bloom: true, aa: 'smaa', shadow: 2048, grass: 0.7, grassFar: false, surface: 'full', terrainStep: 2, trees: 0.8, grain: true },
  high: { dpr: 2, ao: true, aoRes: 0.35, aoSamples: 8, bloom: true, aa: 'smaa', shadow: 2048, grass: 1, grassFar: true, surface: 'full', terrainStep: 2, trees: 1, grain: true },
};

export const Q = { tier: TIER, software: q === 'software' || SOFTWARE, shadowEvery: 1, minCasterTier: 0, grassShadow: true, ...TIERS[TIER] };
if (Q.software) Object.assign(Q, {
  pixelBudget: 300_000,
  dpr: Math.min(0.65, Math.sqrt(300_000 / ((innerWidth || 1) * (innerHeight || 1)))),
  shadow: 512, grass: 0, grassFar: false, grassShadow: false, ao: false, bloom: false, aa: 'fxaa', grain: false,
});
// Phones start at 1x (look.js) and may climb to 1.5x while frames hold 60: on a 2.6x screen 1x is soft, and the
// governor below steps back down (and remembers) as soon as the extra pixels cost frames.
if (mobile && !Q.software) Q.dpr = Math.max(Q.dpr, 1.5);
// Per-phase pixel-ratio ceilings. The planet (Phase 3) is one full-screen fragment shader (13 draws, so the GPU time is
// all per pixel: noise octaves, the atmosphere scatter, the threat rings), about 10x the town's cost per pixel on
// SwiftShader. On a phone it stays at 1x however fast the frames are; the governor can still go lower.
Q.mobile = mobile;
Q.phaseDpr = mobile || Q.software ? { 3: 1 } : {};
const why = q === 'software' ? 'software profile' : mobile ? 'mobile' : SOFTWARE ? 'software renderer' : INTEGRATED ? 'integrated GPU' : NO_WEBGPU ? 'no WebGPU' : forceGL && !q ? 'WebGL fallback' : SAFARI ? 'Safari' : '';
console.info(`quality: ${TIER}${why ? ` (${why})` : ''}${GPU ? ` [${GPU.slice(0, 80)}]` : ''}`);

// ---------------------------------------------------------------------------------------------------- frame cap
// Phones: render at most 60 frames a second. A 90/120 Hz phone runs requestAnimationFrame at the panel's rate, so the
// game drew every frame twice as often as on a 60 Hz screen: twice the GPU and CPU work for no gameplay gain, and the
// heat that makes a fast phone throttle after a few minutes. ?fpscap=N picks another cap, ?fpscap=0 turns it off.
const capQ = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fpscap') : null;
export const FPS_CAP = capQ != null ? Math.max(0, +capQ || 0) : mobile ? 60 : 0;
/** A rAF gate: returns true when this callback should render. Accumulates time so a 90 Hz panel still averages the cap. */
export function frameGate(cap = FPS_CAP) {
  if (!cap) return () => true;
  const step = 1000 / cap, slack = 2; // (2 ms: a 120 Hz panel's 8.33 ms callbacks jitter; 2 of them must pass as one 60 Hz frame)
  let acc = step, last = 0;
  return (now) => {
    acc = Math.min(step * 2, acc + (last ? now - last : step));
    last = now;
    if (acc < step - slack) return false;
    acc = Math.max(0, acc - step);
    return true;
  };
}

// ---------------------------------------------------------------------------------------------------- governor
// Adaptive quality: one ladder of notches from the sharpest picture to the cheapest. The first notches are render
// scale (pixel ratio in ~10% steps from the ceiling to the floor), then feature steps, least visible first. Every second
// the governor reads the mean real frame time: two slow seconds in a row step down one notch (one very slow second
// steps two), five quick seconds in a row step back up one. A notch that failed (the game stepped back down from it
// within 12 s) is not tried again for 30 s, doubling each failure up to 5 min, so it can't hunt up and down.
// Features change uniforms and pass resolutions only (post.js applies them): no shader rebuild, so no freeze.
export const FEATURE_STEPS = [
  // [id, label, applies(opts, Q)]: steps the tier doesn't use (no AO on low, say) are left out of its ladder
  ['shadow2', 'shadows every 2nd frame', (o) => o.shadowEvery < 2],
  ['shafts', 'light shafts off', (o) => o.shafts],
  ['aoBloomRes', 'AO and bloom at lower resolution', (o) => o.ao || o.bloom],
  ['shadow3', 'shadows every 3rd frame', (o) => o.shadowEvery < 3],
  ['lowSpec', 'half grass, no LOD0, fewer particles', () => true],
  ['ao', 'AO off', (o) => o.ao],
  ['bloom', 'bloom off', (o) => o.bloom],
  ['grain', 'grain off', (o) => o.grain],
  ['shadow4', 'shadows every 4th frame', () => true],
];
const GOV_OFF = typeof location !== 'undefined' && /[?&]nowatch\b/.test(location.search); // profiling: hold the settings as set

export class Governor {
  /** maxPR / minPR: the render-scale range; startPR: where it starts (desktops start at 1x and climb); opts: post.js's options at the tier's top. */
  constructor({ maxPR, minPR, startPR, opts, budgetMs = 1000 / 60 }) {
    let prs = [];
    for (let p = maxPR; p > minPR + 0.01; p *= 0.9) prs.push(+p.toFixed(3));
    prs.push(+minPR.toFixed(3));
    startPR = Math.min(maxPR, Math.max(minPR, startPR)); // (the start is a notch of its own: 1x stays exactly 1x)
    prs = [...prs.filter((p) => Math.abs(p - startPR) > 0.04), +startPR.toFixed(3)].sort((a, b) => b - a);
    this.prs = prs;
    this.features = FEATURE_STEPS.filter(([, , ok]) => ok(opts, Q));
    this.notches = prs.length + this.features.length; // notch i < prs.length: pixel ratio prs[i], no feature steps; above: prs.at(-1) and the first (i - prs.length + 1) features
    this.notch = prs.indexOf(+startPR.toFixed(3));
    this.slowMs = budgetMs * 1.1; // (18.3 ms: under ~55 fps)
    this.severeMs = budgetMs * 1.7; // (28 ms: under ~35 fps)
    this.quickMs = budgetMs * 1.03; // (17.2 ms: holding ~58 fps or better)
    this.bad = 0; this.good = 0; this.settle = 0; this.frames = 0; this.time = 0; this.long = 0;
    this.failUntil = new Map(); this.hold = new Map(); this.upAt = -1e9; this.upFrom = -1;
    this.log = []; this.top = 0; // (top: the highest notch allowed, see ceiling())
    this.off = GOV_OFF;
  }
  /** Cap the render scale at `pr` (a phase's ceiling; Infinity = none): the notch drops to it now and never climbs above it. */
  ceiling(pr = Infinity) {
    const i = this.prs.findIndex((p) => p <= pr + 0.01);
    this.top = i < 0 ? this.prs.length - 1 : i;
    if (this.notch < this.top) { this.notch = this.top; this.settle = 1; return true; }
    return false;
  }
  get pr() { return this.prs[Math.min(this.notch, this.prs.length - 1)]; }
  /** The feature steps in force at this notch (ids). */
  get steps() { return this.features.slice(0, Math.max(0, this.notch - this.prs.length + 1)).map((f) => f[0]); }
  get label() { const s = this.features[this.notch - this.prs.length]; return `${this.notch}/${this.notches - 1}${s ? ` (${s[1]})` : ''}`; }
  /**
   * One rendered frame of `ms` real time. Returns the new notch when it changes, else -1. One-off hitches over 250 ms are
   * ignored; three in a row count as 4 fps seconds, so a page that has really stalled still steps down.
   */
  sample(ms, now = performance.now()) {
    if (this.off) return -1;
    if (ms > 250) { if (++this.long < 3) return -1; ms = 250; } else this.long = 0;
    this.frames++; this.time += ms;
    if (this.time < 1000) return -1;
    const mean = this.time / this.frames;
    this.fps = 1000 / mean; this.mean = mean;
    this.frames = this.time = 0;
    if (this.settle > 0) { this.settle--; return -1; } // (the second after a change shows the old cost and the switch)
    if (mean > this.slowMs) {
      this.good = 0;
      if (mean < this.severeMs && ++this.bad < 2) return -1;
      this.bad = 0;
      if (this.notch >= this.notches - 1) return -1;
      // the notch we came up to just failed: hold off it, longer each time
      if (this.upFrom >= 0 && now - this.upAt < 12000) {
        const h = Math.min(300000, (this.hold.get(this.notch) || 15000) * 2);
        this.hold.set(this.notch, h); this.failUntil.set(this.notch, now + h);
      }
      this.upFrom = -1;
      return this.move(Math.min(this.notches - 1, this.notch + (mean >= this.severeMs ? 2 : 1)), mean, now);
    }
    this.bad = 0;
    if (mean <= this.quickMs && this.notch > this.top && ++this.good >= 5) {
      this.good = 0;
      const to = this.notch - 1;
      if ((this.failUntil.get(to) || 0) > now) return -1;
      this.upFrom = this.notch; this.upAt = now;
      return this.move(to, mean, now);
    }
    if (mean > this.quickMs) this.good = 0;
    return -1;
  }
  /** Forget the failed notches (a new phase has a different cost); the notch itself stays. */
  reset() { this.failUntil.clear(); this.hold.clear(); this.bad = this.good = 0; this.upFrom = -1; this.settle = 1; }
  move(to, mean, now) {
    this.log.push({ t: +(now / 1000).toFixed(1), from: this.notch, to, ms: +mean.toFixed(1) });
    if (this.log.length > 50) this.log.shift();
    this.notch = to; this.settle = 1; this.good = 0;
    return to;
  }
}
