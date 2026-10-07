// Move the phase-2 hole across shoreline SDF recenter boundaries with the
// render clock and camera fixed, while leaving updateWaterSdf live.
// Usage: PORT=5203 SOFTWARE=1 node tools/water-sdf-motion.mjs [query]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, channel } from './browser.mjs';

const query = process.argv[2] || '?q=software&region&webgl&waterSdf';
if (query === '--help') {
  console.log('Usage: PORT=5203 SOFTWARE=1 node tools/water-sdf-motion.mjs [query]');
  console.log('Requires a Vite dev server and the optional shoreline field (?waterSdf). SOFTWARE=1 requires SwiftShader/llvmpipe.');
  process.exit(0);
}
const out = `.shots/water-sdf-motion-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(out, { recursive: true });
const args = ['--ignore-gpu-blocklist'];
if (process.env.SOFTWARE === '1') args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const browser = await chromium.launch({ headless: true, channel, args });
let page, setupSaved = false;
try {
  page = await browser.newPage({ viewport: { width: +(process.env.WIDTH || 390), height: +(process.env.HEIGHT || 844) }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  const url = new URL(`http://127.0.0.1:${process.env.PORT || 5174}/${query}`);
  url.searchParams.set('seed', '7'); url.searchParams.set('time', 'golden'); url.searchParams.set('nothumbs', ''); url.searchParams.set('nowatch', '');
  await page.goto(url.toString());
  await page.waitForSelector('#menu:not([hidden])');
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__game?.().state.phase === 2 && !window.__game().state.breaking);
  const renderer = await page.evaluate(() => {
    const gl = window.__game().renderer.backend.gl, ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl?.getParameter(ext?.UNMASKED_RENDERER_WEBGL || gl.RENDERER) || 'WebGPU';
  });
  if (process.env.SOFTWARE === '1' && !/swiftshader|llvmpipe|software/i.test(renderer)) throw new Error(`Software renderer requested but got ${renderer}`);

  setupSaved = true;
  await page.evaluate(async () => {
    const g = window.__game();
    window.__waterSdfMotionRestore = { playing: g.state.playing, draft: g.state.draft, draftsDue: g.state.draftsDue };
    g.state.playing = false; g.state.draft = null;
    await window.__views('coast');
  });
  await page.waitForFunction(() => window.__game().city.reveal >= window.__game().city.meshes.length, null, { timeout: 180000 });
  await page.waitForFunction(() => window.__game().city.terrain.waterSdfStats?.uploads > 0 && !window.__game().city.terrain.waterSdfBuild, null, { timeout: 180000 });

  await page.evaluate(() => {
    const g = window.__game(), nf = g.renderer._nodes?.nodeFrame, terrain = g.city.terrain;
    if (!terrain.waterSdfActive?.value || !terrain.waterSdfTexture || typeof terrain.updateWaterSdf !== 'function') throw new Error('Shore field unavailable; load with ?waterSdf.');
    if (!nf || typeof nf.update !== 'function') throw new Error('Expected renderer._nodes.nodeFrame.update; this diagnostic uses a private Three.js r186 API.');
    const saved = window.__waterSdfMotionRestore;
    Object.assign(saved, { nf, update: nf.update, time: nf.time, terrain, updateWaterSdf: terrain.updateWaterSdf, camera: g.camera, cameraPosition: g.camera.position.clone(), cameraQuaternion: g.camera.quaternion.clone(), cameraLookAt: g.camera.lookAt, hole: g.hole, holeX: g.hole.x, holeZ: g.hole.z, packed: terrain.holes.value[0].clone() });
    saved.camera.lookAt = function (...args) {
      saved.cameraLookAt.apply(this, args);
      this.position.copy(saved.cameraPosition); this.quaternion.copy(saved.cameraQuaternion); this.updateMatrixWorld(true);
    };
    nf.update = function () { this.frameId++; this.deltaTime = 0; this.lastTime = performance.now(); g.renderer.info.frame = this.frameId; };
    g.state.playing = true; g.state.draft = []; g.state.draftsDue = 0;
    window.__waterSdfMotionFrames = [];
    window.__waterSdfMotionRecording = false;
    let previous;
    const sample = t => {
      if (window.__waterSdfMotionRecording) {
        const b = terrain.waterSdfBuild;
        window.__waterSdfMotionFrames.push({ t, gap: previous === undefined ? 0 : t - previous, uploads: terrain.waterSdfStats.uploads, rebuilds: terrain.waterSdfStats.rebuilds, slices: terrain.waterSdfStats.slices, lastSliceMs: terrain.waterSdfStats.lastSliceMs, phase: b?.phase ?? 'idle' });
        previous = t;
      } else previous = undefined;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  const initial = await page.evaluate(() => {
    const g = window.__game(), t = g.city.terrain;
    const bx = t.waterSdfCenter.x, bz = t.waterSdfCenter.z;
    g.hole.x = bx; g.hole.z = bz; t.holes.value[0].set(bx, bz, g.hole.r);
    return { x: bx, z: bz, center: { ...t.waterSdfCenter }, stats: { ...t.waterSdfStats } };
  });
  // The snapped base stays in the already uploaded 64 m cell.
  await page.waitForTimeout(500);
  const baselineUpload = await page.evaluate(() => window.__game().city.terrain.waterSdfStats.uploads);
  const baseline = await snapshotField(page);
  // Hide DOM overlays: Playwright's canvas screenshot includes composited siblings over the canvas.
  await page.evaluate(() => { for (const el of document.body.children) if (el.id !== 'c') el.style.setProperty('display', 'none', 'important'); });
  const startShot = await page.locator('canvas').first().screenshot({ path: `${out}/same-endpoint-before.png` });
  await page.evaluate(() => { window.__waterSdfMotionFrames.length = 0; window.__waterSdfMotionRecording = true; });

  const xNext = initial.x + 33;
  const zNext = initial.z + 33;
  const steps = [
    { name: 'cross-x', x: xNext, z: initial.z },
    { name: 'cross-z', x: xNext, z: zNext },
    { name: 'return-x', x: initial.x, z: zNext },
    { name: 'return-z', x: initial.x, z: initial.z },
  ];
  const records = [];
  let previousField = baseline;
  let uploadTarget = baselineUpload;
  for (const step of steps) {
    await page.evaluate(({ x, z }) => {
      const g = window.__game(), packed = g.city.terrain.holes.value[0];
      g.hole.x = x; g.hole.z = z;
      packed.set(x, z, g.hole.r);
    }, step);
    uploadTarget++;
    await page.waitForFunction(target => {
      const t = window.__game().city.terrain;
      return t.waterSdfStats.uploads >= target && !t.waterSdfBuild;
    }, uploadTarget, { timeout: 180000 });
    const field = await snapshotField(page);
    assert.equal(field.uploads, uploadTarget, `${step.name}: expected exactly one completed upload`);
    const overlap = await page.evaluate(({ oldOrigin, newOrigin, oldBytes }) => {
      const t = window.__game().city.terrain, a = oldBytes, b = t.waterSdfTexture.image.data;
      const dx = Math.round((newOrigin[0] - oldOrigin[0]) / 2), dz = Math.round((newOrigin[1] - oldOrigin[1]) / 2);
      if (!Number.isInteger((newOrigin[0] - oldOrigin[0]) / 2) || !Number.isInteger((newOrigin[1] - oldOrigin[1]) / 2)) throw new Error('SDF origins are not on the same 2 m texel grid.');
      let compared = 0, mismatches = 0;
      for (let j = Math.max(0, -dz); j < Math.min(256, 256 - dz); j++) for (let i = Math.max(0, -dx); i < Math.min(256, 256 - dx); i++) {
        const oi = ((j + dz) * 256 + (i + dx)) * 2, ni = (j * 256 + i) * 2;
        compared += 2;
        if (a[oi] !== b[ni]) mismatches++;
        if (a[oi + 1] !== b[ni + 1]) mismatches++;
      }
      return { comparedBytes: compared, mismatches, shiftPixels: [dx, dz] };
    }, { oldOrigin: previousField.origin, newOrigin: field.origin, oldBytes: previousField.bytes });
    assert.ok(overlap.comparedBytes > 0, `${step.name}: no overlapping field data`);
    assert.equal(overlap.mismatches, 0, `${step.name}: overlapping SDF bytes changed`);
    records.push({ ...step, field: { ...field, bytes: undefined }, overlap });
    previousField = field;
  }
  const telemetry = await page.evaluate(() => { window.__waterSdfMotionRecording = false; return window.__waterSdfMotionFrames; });
  const finalShot = await page.locator('canvas').first().screenshot({ path: `${out}/same-endpoint-after.png` });
  const stableEndpointPng = startShot.equals(finalShot);
  assert.ok(telemetry.some(f => f.uploads > baselineUpload), 'frame telemetry did not observe a completed upload');
  const gaps = telemetry.map(f => f.gap).filter(x => x > 0).sort((a, b) => a - b);
  const pct = p => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] ?? 0;
  const report = {
    renderer, requestedSoftware: process.env.SOFTWARE === '1', query, initial, steps: records,
    frames: { count: telemetry.length, p50GapMs: pct(.5), p95GapMs: pct(.95), worstGapMs: gaps.at(-1) ?? 0, maxSliceMs: Math.max(0, ...telemetry.map(f => f.lastSliceMs)), samples: telemetry },
    stableEndpointPng, screenshots: ['same-endpoint-before.png', 'same-endpoint-after.png'], output: out,
  };
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, frames: { ...report.frames, samples: `${telemetry.length} per-frame samples` } }, null, 2));
} finally {
  if (setupSaved) await page.evaluate(() => {
    const s = window.__waterSdfMotionRestore;
    if (!s) return;
    s.hole.x = s.holeX; s.hole.z = s.holeZ; s.terrain.holes.value[0].copy(s.packed);
    s.camera.lookAt = s.cameraLookAt;
    s.nf.update = s.update; s.nf.time = s.time; s.nf.deltaTime = 0; s.nf.lastTime = performance.now();
    const g = window.__game(); g.state.draft = s.draft; g.state.playing = s.playing; g.state.draftsDue = s.draftsDue;
    delete window.__waterSdfMotionRestore; delete window.__waterSdfMotionFrames; delete window.__waterSdfMotionRecording;
  }).catch(() => {});
  await browser.close();
}

async function snapshotField(page) {
  return page.evaluate(() => {
    const t = window.__game().city.terrain, s = t.waterSdfStats;
    return { origin: [t.waterSdfOrigin.value.x, t.waterSdfOrigin.value.y], uploads: s.uploads, rebuilds: s.rebuilds, slices: s.slices, lastSliceMs: s.lastSliceMs, maxSliceMs: s.maxSliceMs, bytes: Array.from(t.waterSdfTexture.image.data) };
  });
}
