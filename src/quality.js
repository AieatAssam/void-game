// Quality tiers. Decided once at startup (materials are built from it), with a runtime fallback in post.js.
// Tablets and phones start on 'low'; desktops on 'high'. Override with ?q=low|medium|high.
//   low:    DPR 1, single-projection scans, 0.35x AO, 2K shadows, sparse near grass (tablets/phones)
//   medium: DPR <= 1.5, near grass only
//   high:   DPR <= 2, 4K shadows, 12-sample AO, near + far grass
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('q') : null;
const nav = typeof navigator !== 'undefined' ? navigator : {};
const ua = nav.userAgent || '';
const touch = (nav.maxTouchPoints || 0) > 1;
// iPadOS reports a Mac user agent: touch points give it away
const mobile = /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (touch && /Macintosh/.test(ua));
const lowFlag = typeof location !== 'undefined' && /[?&]low\b/.test(location.search);

// desktop Safari: its WebGPU paid ~3x Chrome's GPU time for the same frame here (19 fps behind the menu at 1.5x), and each
// watchdog step that rebuilds the post pipeline froze it for seconds (shader recompiles): it starts where the watchdog
// ended up in a measured run (53 fps) instead of stepping there mid-game
export const SAFARI = /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua) && !mobile;
export const TIER = ['low', 'medium', 'high', 'safari'].includes(q) ? q : lowFlag || mobile ? 'low' : SAFARI ? 'safari' : 'high';

// Mobile keeps the whole look (AO, bloom, filmic grade, grain, grass); it just renders at 1x, samples each scan once
// instead of three times, uses lower-res AO, sparser near-only grass, a coarser countryside mesh and fewer far trees.
const TIERS = {
  low: { dpr: 1, ao: true, aoRes: 0.35, aoSamples: 6, bloom: true, aa: 'smaa', shadow: 2048, grass: 0.4, grassFar: false, surface: 'lite', terrainStep: 3, trees: 0.6, grain: true },
  medium: { dpr: 1.5, ao: true, aoRes: 0.5, aoSamples: 8, bloom: true, aa: 'smaa', shadow: 2048, grass: 0.7, grassFar: false, surface: 'full', terrainStep: 2, trees: 0.8, grain: true },
  safari: { shadowEvery: 3, dpr: 1, ao: false, aoRes: 0.3, aoSamples: 6, bloom: false, aa: 'smaa', shadow: 2048, grass: 0.5, grassFar: false, surface: 'full', terrainStep: 2, trees: 0.8, grain: true },
  high: { dpr: 2, ao: true, aoRes: 0.5, aoSamples: 12, bloom: true, aa: 'smaa', shadow: 4096, grass: 1, grassFar: true, surface: 'full', terrainStep: 2, trees: 1, grain: true },
};

export const Q = { tier: TIER, shadowEvery: 1, ...TIERS[TIER] };
console.info(`quality: ${TIER}${mobile ? ' (mobile default)' : SAFARI ? ' (Safari default)' : ''}`);
