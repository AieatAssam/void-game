// Same-page Phase 3 globe topology A/B/A/B on SwiftShader; only globe geometry changes.
// Start Vite first, then: node tools/phase3-geometry-abab.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, channel } from './browser.mjs';

const port = process.env.PORT || 5196;
const outDir = resolve(process.env.OUT_DIR || '/tmp/phase3-geometry-abab');
const samplesPerBlock = 20;
const browser = await chromium.launch({ headless: true, channel,
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
const cdp = await page.context().newCDPSession(page);
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !(m.location().url || '').endsWith('/favicon.ico')) errors.push(`console: ${m.text()}`); });
page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`http ${r.status()}: ${r.url()}`); });

try {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`http://127.0.0.1:${port}/?planet&webgl&q=software&nothumbs&nomap&nowatch&noarmy&nothreat&nofinale&seed=7&time=golden&at=city&r=40000`);
  await page.waitForFunction(() => window.__planet?.setR && window.__game?.().state.phase === 3 && window.__game().state.playing, null, { timeout: 900000 });
  await page.evaluate(async () => {
    const { Q } = await import('/src/quality.js');
    const g = window.__game(), gl = g.renderer.backend.gl;
    g.renderer.setPixelRatio(0.4);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    window.__ababRuntime = { renderer: gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL || gl.RENDERER),
      viewport: [innerWidth, innerHeight], deviceScaleFactor: devicePixelRatio,
      pixelRatio: g.renderer.getPixelRatio(), drawingBuffer: [g.renderer.domElement.width, g.renderer.domElement.height],
      softwareProfile: Q.software, phase: g.state.phase, playing: g.state.playing };
  });
  const runtime = await page.evaluate(() => window.__ababRuntime);
  assert.match(runtime.renderer, /swiftshader/i, `Expected SwiftShader, got ${runtime.renderer}`);
  assert.equal(runtime.softwareProfile, true, 'Q.software was not enabled');
  assert.deepEqual(runtime.viewport, [390, 844]);
  assert.equal(runtime.deviceScaleFactor, 1);
  assert.ok(Math.abs(runtime.pixelRatio - 0.4) < 0.001);

  const setup = await page.evaluate(async () => {
    const { cubeSphere } = await import('/src/planetglobe.js');
    const g = window.__game(), p = window.__planet, globe = p.globe, renderer = g.renderer, backend = renderer.backend, gl = backend.gl;
    const scenePass = g.post?.scenePass, ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!backend.isWebGLBackend || !ext || !gl.createQuery) throw Error('Expected WebGL2 disjoint timer query support.');
    if (backend.trackTimestamp) throw Error('Three timestamp tracking is active; refusing competing GPU queries.');
    if (!scenePass?.updateBefore || gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) throw Error('Scene pass missing or a GPU query is already active.');
    if (!globe?.globe?.visible || !globe.patch?.visible) throw Error('Expected visible Phase 3 globe and local patch.');
    if (globe.n !== 64) throw Error(`Expected the software profile's 64-subdivision globe, got ${globe.n}.`);
    const mesh = globe.globe, patch = globe.patch, originalGeometry = mesh.geometry;
    const originalMaterial = mesh.material, patchGeometry = patch.geometry, patchMaterial = patch.material;
    const uniforms = globe.u, surf = p.W.bake.surf;
    if (!surf || surf.length !== globe.N * globe.N * 6 * 4) throw Error('Could not reuse the live globe surface bake.');
    const nf = renderer._nodes?.nodeFrame;
    if (!nf?.update) throw Error('Expected Three r186 NodeFrame.');
    const geometry32 = cubeSphere(32, surf, globe.N);
    const save = { playing: g.state.playing, gameTime: g.state.time, globeTime: globe._t, uniformTime: uniforms.uTime.value,
      update: nf.update, frameId: nf.frameId, time: nf.time, deltaTime: nf.deltaTime, lastTime: nf.lastTime,
      globeUpdate: globe.update, worldUpdate: p.W.update, gameFrame: p.game.frame, subdivisions: globe.n,
      cameraPositionSet: g.camera.position.set, cameraLookAt: g.camera.lookAt,
      projectionUpdate: g.camera.updateProjectionMatrix, near: g.camera.near, far: g.camera.far,
      nearDescriptor: Object.getOwnPropertyDescriptor(g.camera, 'near'), farDescriptor: Object.getOwnPropertyDescriptor(g.camera, 'far') };

    // Match all four blocks by holding the live Phase 3 view, bite, and shader time fixed.
    window.__planet.setR(40000); g.camDist = 0; g.state.playing = false; g.state.time = 0; globe._t = 0; uniforms.uTime.value = 0;
    p.game.frame(0, p.ctx, 0, 0, 0); g.state.playing = false; g.state.time = 0; globe._t = 0; uniforms.uTime.value = 0;
    g.camera.position.set = function () { return this; }; g.camera.lookAt = function () { return this; };
    Object.defineProperties(g.camera, { near: { configurable: true, enumerable: true, get: () => save.near, set: () => {} },
      far: { configurable: true, enumerable: true, get: () => save.far, set: () => {} } });
    g.camera.updateProjectionMatrix = function () {};
    nf.update = function () { this.frameId++; this.deltaTime = 0; this.lastTime = performance.now(); renderer.info.frame = this.frameId; };
    // Keep PlanetGame.frame's renderer path alive while freezing simulation/world writes.
    p.W.update = function () {};
    p.game.frame = function () { return save.gameFrame.call(this, 0, p.ctx, 0, 0, 0); };

    const vec = v => [v.x, v.y, v.z];
    const quat = q => [q.x, q.y, q.z, q.w];
    const lock = () => ({ camera: { position: vec(g.camera.position), quaternion: quat(g.camera.quaternion), fov: g.camera.fov,
      aspect: g.camera.aspect, near: g.camera.near, far: g.camera.far, projection: Array.from(g.camera.projectionMatrix.elements) },
      hole: { x: g.hole.x, z: g.hole.z, radius: g.hole.r, area: g.hole.area }, gameTime: g.state.time,
      globeTime: globe._t, uniformTime: uniforms.uTime.value, globeMaterial: mesh.material.uuid,
      patch: { material: patch.material.uuid, geometry: patch.geometry.uuid,
        positionCount: patch.geometry.attributes.position.count, indexCount: patch.geometry.index.count } });
    const state = window.__phase3ABAB = { slot: null, instrument: false, samples: { A1: [], B1: [], A2: [], B2: [] },
      pending: new Set(), skipped: { disjoint: 0, unavailable: 0, beginFailed: 0 }, done: false, targetSamples: 20,
      frozen: lock(), originalGeometry, geometry32, originalMaterial, patchGeometry, patchMaterial, mesh, patch, save, nf, renderer, gl, ext, scenePass };
    mesh.geometry = originalGeometry;
    const originalUpdate = scenePass.updateBefore;
    scenePass.updateBefore = function (...args) {
      let query = null;
      if (state.instrument && state.slot && state.samples[state.slot].length + [...state.pending].filter(q => q.slot === state.slot).length < state.targetSamples) {
        try { query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); }
        catch { if (query) gl.deleteQuery(query); query = null; state.skipped.beginFailed++; }
      }
      try { return originalUpdate.apply(this, args); }
      finally { if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); state.pending.add({ query, slot: state.slot, disjoint: false }); } }
    };
    const poll = () => {
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) for (const q of state.pending) q.disjoint = true;
      for (const q of [...state.pending]) {
        if (!gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE)) continue;
        const ns = gl.getQueryParameter(q.query, gl.QUERY_RESULT); gl.deleteQuery(q.query); state.pending.delete(q);
        if (q.disjoint) state.skipped.disjoint++;
        else if (Number.isFinite(ns) && ns >= 0) state.samples[q.slot].push(ns / 1e6);
        else state.skipped.unavailable++;
      }
      if (state.instrument || state.pending.size) requestAnimationFrame(poll);
      else state.done = true;
    };
    state.setSlot = (slot, subdivisions) => {
      state.instrument = false; state.slot = null; state.nextSlot = slot;
      [globe.n, mesh.geometry] = subdivisions === 64 ? [64, originalGeometry] : [32, geometry32];
    };
    state.start = () => { state.done = false; state.slot = state.nextSlot; state.instrument = true; requestAnimationFrame(poll); };
    state.stop = () => { state.instrument = false; state.slot = null; };
    state.restore = () => {
      if (state.restored) return;
      state.restored = true;
      state.stop(); scenePass.updateBefore = originalUpdate; [globe.n, mesh.geometry] = [save.subdivisions, originalGeometry]; mesh.material = originalMaterial;
      patch.geometry = patchGeometry; patch.material = patchMaterial;
      nf.update = save.update; nf.frameId = save.frameId; nf.time = save.time; nf.deltaTime = save.deltaTime; nf.lastTime = save.lastTime;
      globe.update = save.globeUpdate; p.W.update = save.worldUpdate; p.game.frame = save.gameFrame; g.state.playing = save.playing; g.state.time = save.gameTime;
      globe._t = save.globeTime; uniforms.uTime.value = save.uniformTime;
      g.camera.position.set = save.cameraPositionSet; g.camera.lookAt = save.cameraLookAt; g.camera.updateProjectionMatrix = save.projectionUpdate;
      if (save.nearDescriptor) Object.defineProperty(g.camera, 'near', save.nearDescriptor); else delete g.camera.near;
      if (save.farDescriptor) Object.defineProperty(g.camera, 'far', save.farDescriptor); else delete g.camera.far;
      geometry32.dispose();
    };
    state.snapshot = lock;
    state.originalUpdate = originalUpdate;
    return { renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL || gl.RENDERER),
      phase: g.state.phase, wasPlaying: save.playing, radius: g.hole.r, subdivisions: { A: globe.n, B: 32 },
      vertices: { A: originalGeometry.attributes.position.count, B: geometry32.attributes.position.count },
      indices: { A: originalGeometry.index.count, B: geometry32.index.count },
      sameMaterial: mesh.material === originalMaterial, sameUniforms: globe.u === uniforms,
      patchUnchanged: patch.geometry === patchGeometry && patch.material === patchMaterial, lock: state.frozen };
  });
  assert.equal(setup.phase, 3);
  assert.equal(setup.wasPlaying, true);
  assert.deepEqual(setup.subdivisions, { A: 64, B: 32 });
  assert.deepEqual(setup.vertices, { A: 25350, B: 6534 });
  assert.deepEqual(setup.indices, { A: 147456, B: 36864 });
  assert.ok(setup.sameMaterial && setup.sameUniforms && setup.patchUnchanged);

  await mkdir(outDir, { recursive: true });
  const screenshots = {};
  const blocks = [['A1', 64], ['B1', 32], ['A2', 64], ['B2', 32]];
  for (const [slot, subdivisions] of blocks) {
    await page.evaluate(({ slot, subdivisions }) => window.__phase3ABAB.setSlot(slot, subdivisions), { slot, subdivisions });
    await page.waitForTimeout(1500); // settle geometry upload and alternate-mode warmup
    {
      const path = resolve(outDir, `${slot}.png`);
      await page.screenshot({ path, animations: 'disabled' });
      screenshots[slot] = path;
    }
    await page.evaluate(() => window.__phase3ABAB.start());
    await page.waitForFunction(({ slot, count }) => window.__phase3ABAB.samples[slot].length >= count,
      { slot, count: samplesPerBlock }, { timeout: 240000 });
    await page.evaluate(() => window.__phase3ABAB.stop());
    const blockLock = await page.evaluate(() => window.__phase3ABAB.snapshot());
    assert.deepEqual(blockLock, setup.lock, `${slot} camera/hole/time/material/patch changed`);
  }
  await page.evaluate(() => window.__phase3ABAB.stop());
  await page.waitForFunction(() => window.__phase3ABAB.done);
  const result = await page.evaluate(() => {
    const s = window.__phase3ABAB;
    return { samples: s.samples, lock: s.snapshot(), skipped: s.skipped,
      retained: { globeMaterial: s.mesh.material === s.originalMaterial,
        patchGeometry: s.patch.geometry === s.patchGeometry, patchMaterial: s.patch.material === s.patchMaterial } };
  });
  for (const [slot] of blocks) assert.equal(result.samples[slot].length, samplesPerBlock, `${slot} sample count`);
  assert.deepEqual(result.lock, setup.lock, 'final camera/hole/time/material/patch lock');
  assert.ok(Object.values(result.retained).every(Boolean), 'Original live objects/materials were not retained');
  assert.equal(errors.length, 0, errors.join('\n'));

  const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
  const stats = Object.fromEntries(Object.entries(result.samples).map(([key, values]) => [key, {
    n: values.length, p50Ms: +percentile(values, 0.5).toFixed(3), p95Ms: +percentile(values, 0.95).toFixed(3), valuesMs: values
  }]));
  for (const path of Object.values(screenshots)) {
    const image = await readFile(path), size = (await stat(path)).size;
    assert.equal(image.toString('ascii', 1, 4), 'PNG');
    assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], [390, 844]);
    assert.ok(size > 10000, `Screenshot is unexpectedly small: ${path} (${size} bytes)`);
  }
  const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  for (const [a, b] of [['A1', 'A2'], ['B1', 'B2']]) assert.equal(await digest(screenshots[a]), await digest(screenshots[b]), `${a}/${b} screenshots differ`);
  await page.evaluate(() => window.__phase3ABAB.restore());
  const restored = await page.evaluate(() => {
    const s = window.__phase3ABAB;
    return s.mesh.geometry === s.originalGeometry && s.mesh.material === s.originalMaterial && s.patch.geometry === s.patchGeometry && s.patch.material === s.patchMaterial;
  });
  assert.ok(restored, 'Original live objects/materials were not restored');
  const report = { runtime: { ...runtime, ...setup, cpuThrottle: 4, softwareVerified: true },
    method: 'One asynchronous EXT_disjoint_timer_query_webgl2 TIME_ELAPSED query around each Three.js FXAA scenePass.updateBefore. Same page, 64/32/64/32; 20 valid samples per block; disjoint results discarded. Camera, hole, simulation time, globe shader time, material/uniforms, and local patch held constant.',
    gpuScenePassMs: stats, screenshotPaths: screenshots, qualityChecks: {
      swiftshader: true, geometryCounts: true, sameGlobeMaterialAndUniforms: setup.sameMaterial && setup.sameUniforms,
      localPatchPreserved: setup.patchUnchanged && result.retained.patchGeometry && result.retained.patchMaterial,
      cameraHoleTimeMatched: true, screenshotsReadableAnd390x844: true, repeatScreenshotsMatched: true,
      restorationVerified: restored, browserErrors: errors
    }, skipped: result.skipped, frozenState: result.lock };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.evaluate(() => window.__phase3ABAB?.restore?.()).catch(() => {});
  await browser.close();
}
