// Same-page local patch index density A/B/A/B at 40 km. Start Vite first.
// Run: node tools/patch-density-abab.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, channel } from './browser.mjs';

const port = process.env.PORT || 5196;
const outDir = resolve(process.env.OUT_DIR || '/tmp/patch-density-abab');
const samplesPerBlock = 20;
const browser = await chromium.launch({ headless: true, channel,
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !(m.location().url || '').endsWith('/favicon.ico')) errors.push(`console: ${m.text()}`); });
page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`http ${r.status()}: ${r.url()}`); });

try {
  await page.goto(`http://127.0.0.1:${port}/?planet&webgl&q=software&nothumbs&nomap&nowatch&noarmy&nothreat&nofinale&seed=7&time=golden&at=city&r=40000`);
  await page.waitForFunction(() => window.__planet?.setR && window.__game?.().state.phase === 3 && window.__game().state.playing, null, { timeout: 900000 });
  const setup = await page.evaluate(async () => {
    const { Q } = await import('/src/quality.js');
    const g = window.__game(), p = window.__planet, renderer = g.renderer, backend = renderer.backend, gl = backend.gl;
    renderer.setPixelRatio(0.4);
    const scenePass = g.post?.scenePass, ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!backend.isWebGLBackend || !ext || !gl.createQuery || backend.trackTimestamp) throw Error('Expected exclusive WebGL2 disjoint timer query support.');
    if (!scenePass?.updateBefore || gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) throw Error('Scene pass missing or a GPU query is already active.');
    const globe = p.globe, mesh = globe.patch, geometry = mesh?.geometry, index = geometry?.index;
    if (!mesh?.visible || globe.PN !== 97 || !index || index.count !== 57600) throw Error('Expected visible 97×97 local patch with 57,600 baseline indices.');
    const attributes = geometry.attributes, originalAttributes = { ...geometry.attributes }, originalIndex = index.array, nf = renderer._nodes?.nodeFrame;
    if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) throw Error('Expected the default unlimited geometry draw range.');
    if (!nf?.update) throw Error('Expected Three r186 NodeFrame.');
    const grid = 97 * 97, reduced = [];
    const border = (s, k) => s === 0 ? k : s === 1 ? 96 * 97 + k : s === 2 ? k * 97 : k * 97 + 96;
    for (let j = 0; j < 49; j++) for (let i = 0; i < 49; i++) {
      if (i === 48 || j === 48) continue;
      const a = j * 2 * 97 + i * 2, b = a + 2, c = a + 194, d = c + 2;
      reduced.push(a, c, b, b, c, d);
    }
    for (let s = 0; s < 4; s++) for (let k = 0; k < 48; k++) {
      const a = border(s, k * 2), b = border(s, (k + 1) * 2);
      const a2 = grid + s * 97 + k * 2, b2 = a2 + 2;
      reduced.push(a, a2, b, b, a2, b2);
    }
    const reducedIndex = new Uint32Array(reduced);
    const reducedIndexAttribute = new index.constructor(reducedIndex, 1, index.normalized);
    reducedIndexAttribute.setUsage(index.usage);
    const save = { playing: g.state.playing, gameTime: g.state.time, globeTime: globe._t, uniformTime: globe.u.uTime.value,
      update: nf.update, frameId: nf.frameId, time: nf.time, deltaTime: nf.deltaTime, lastTime: nf.lastTime,
      globeUpdate: globe.update, worldUpdate: p.W.update, gameFrame: p.game.frame, gameCamDist: p.game.camDist,
      cameraPositionSet: g.camera.position.set, cameraLookAt: g.camera.lookAt,
      projectionUpdate: g.camera.updateProjectionMatrix, near: g.camera.near, far: g.camera.far,
      nearDescriptor: Object.getOwnPropertyDescriptor(g.camera, 'near'), farDescriptor: Object.getOwnPropertyDescriptor(g.camera, 'far') };
    window.__planet.setR(40000); p.game.camDist = 0; g.state.playing = false;
    g.state.time = 0; globe._t = 0; globe.u.uTime.value = 0;
    p.game.frame(0, p.ctx, 0, 0, 0); g.state.playing = false; g.state.time = 0; globe._t = 0; globe.u.uTime.value = 0;
    const lockedNear = g.camera.near, lockedFar = g.camera.far;
    g.camera.position.set = function () { return this; }; g.camera.lookAt = function () { return this; };
    Object.defineProperties(g.camera, { near: { configurable: true, enumerable: true, get: () => lockedNear, set: () => {} },
      far: { configurable: true, enumerable: true, get: () => lockedFar, set: () => {} } });
    g.camera.updateProjectionMatrix = function () {};
    nf.update = function () { this.frameId++; this.deltaTime = 0; this.lastTime = performance.now(); renderer.info.frame = this.frameId; };
    globe.update = function () {};
    p.W.update = function () {};
    p.game.frame = function () { return save.gameFrame.call(this, 0, p.ctx, 0, 0, 0); };
    const vec = v => [v.x, v.y, v.z], quat = q => [q.x, q.y, q.z, q.w];
    const lock = () => ({ camera: { position: vec(g.camera.position), quaternion: quat(g.camera.quaternion), fov: g.camera.fov,
      aspect: g.camera.aspect, near: g.camera.near, far: g.camera.far, projection: Array.from(g.camera.projectionMatrix.elements) },
      hole: { x: g.hole.x, z: g.hole.z, radius: g.hole.r, area: g.hole.area }, gameTime: g.state.time,
      globeTime: globe._t, uniformTime: globe.u.uTime.value,
      material: mesh.material.uuid, attributes: Object.fromEntries(Object.keys(attributes).map(k => [k, attributes[k] === originalAttributes[k]])),
      index: { isOriginal: geometry.index === index, isCandidate: geometry.index === reducedIndexAttribute,
        count: geometry.index.count }, drawRange: { start: geometry.drawRange.start, count: geometry.drawRange.count },
      textures: Object.fromEntries(Object.entries(globe).filter(([k]) => /Tex$/.test(k)).map(([k, v]) => [k, v?.uuid])),
      uniforms: Object.fromEntries(Object.entries(globe.u).map(([k, v]) => [k, v.value?.uuid ?? v.value])) });
    const state = window.__densityABAB = { slot: null, instrument: false, samples: { A1: [], B1: [], A2: [], B2: [] },
      pending: new Set(), skipped: { disjoint: 0, unavailable: 0, beginFailed: 0 }, done: false, targetSamples: 20,
      frozen: lock(), originalIndexAttribute: index, reducedIndexAttribute, reducedIndex, attributes, mesh, globe, save, nf, renderer, gl, ext, scenePass };
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
      if (state.instrument || state.pending.size) requestAnimationFrame(poll); else state.done = true;
    };
    state.setSlot = (slot, small) => {
      state.instrument = false; state.slot = null; state.nextSlot = slot;
      geometry.setIndex(small ? reducedIndexAttribute : index);
      geometry.index.needsUpdate = true;
      if (geometry.index.count !== (small ? 14976 : 57600)) throw Error(`Wrong ${small ? 'candidate' : 'baseline'} index count: ${geometry.index.count}`);
    };
    state.start = () => { state.done = false; state.slot = state.nextSlot; state.instrument = true; requestAnimationFrame(poll); };
    state.stop = () => { state.instrument = false; state.slot = null; };
    state.restore = () => {
      if (state.restored) return;
      state.restored = true; state.stop(); scenePass.updateBefore = originalUpdate;
      geometry.setIndex(index); index.needsUpdate = true;
      nf.update = save.update; nf.frameId = save.frameId; nf.time = save.time; nf.deltaTime = save.deltaTime; nf.lastTime = save.lastTime;
      globe.update = save.globeUpdate; p.W.update = save.worldUpdate; p.game.frame = save.gameFrame;
      p.game.camDist = save.gameCamDist;
      g.state.playing = save.playing; g.state.time = save.gameTime; globe._t = save.globeTime; globe.u.uTime.value = save.uniformTime;
      g.camera.position.set = save.cameraPositionSet; g.camera.lookAt = save.cameraLookAt; g.camera.updateProjectionMatrix = save.projectionUpdate;
      if (save.nearDescriptor) Object.defineProperty(g.camera, 'near', save.nearDescriptor); else delete g.camera.near;
      if (save.farDescriptor) Object.defineProperty(g.camera, 'far', save.farDescriptor); else delete g.camera.far;
    };
    state.snapshot = lock; state.originalUpdate = originalUpdate;
    return { renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL || gl.RENDERER),
      phase: g.state.phase, wasPlaying: save.playing, radius: g.hole.r, samples: { baseline: 97, reduced: 49, stride: 2 },
      triangles: { baseline: 19200, candidateGrid: 4608, candidateSkirt: 384, candidate: 4992 },
      indices: { baseline: originalIndex.length, candidate: reducedIndex.length }, sameMaterial: mesh.material === globe.patchMat,
      indexAttribute: { originalCount: index.count, candidateCount: reducedIndexAttribute.count },
      drawRange: { start: geometry.drawRange.start, count: geometry.drawRange.count },
      attributesUntouched: geometry.index === index && geometry.attributes === attributes,
      lock: state.frozen, quality: Q.software };
  });
  assert.equal(setup.phase, 3); assert.equal(setup.wasPlaying, true); assert.equal(setup.radius, 40000);
  assert.deepEqual(setup.triangles, { baseline: 19200, candidateGrid: 4608, candidateSkirt: 384, candidate: 4992 });
  assert.deepEqual(setup.indices, { baseline: 57600, candidate: 14976 });
  assert.ok(setup.sameMaterial && setup.attributesUntouched);
  await mkdir(outDir, { recursive: true });
  const screenshots = {}, blocks = [['A1', false], ['B1', true], ['A2', false], ['B2', true]];
  for (const [slot, small] of blocks) {
    await page.evaluate(({ slot, small }) => window.__densityABAB.setSlot(slot, small), { slot, small });
    await page.waitForTimeout(1500);
    const path = resolve(outDir, `${slot}.png`); await page.screenshot({ path, animations: 'disabled' }); screenshots[slot] = path;
    await page.evaluate(() => window.__densityABAB.start());
    await page.waitForFunction(({ slot, count }) => window.__densityABAB.samples[slot].length >= count,
      { slot, count: samplesPerBlock }, { timeout: 240000 });
    await page.evaluate(() => window.__densityABAB.stop());
    const blockLock = await page.evaluate(() => window.__densityABAB.snapshot());
    const expectedLock = structuredClone(setup.lock);
    if (small) expectedLock.index = { isOriginal: false, isCandidate: true, count: 14976 };
    assert.deepEqual(blockLock, expectedLock, `${slot} camera/hole/time/material/attribute/index lock`);
  }
  await page.evaluate(() => window.__densityABAB.stop());
  await page.waitForFunction(() => window.__densityABAB.done);
  const result = await page.evaluate(() => {
    const s = window.__densityABAB;
    return { samples: s.samples, lock: s.snapshot(), skipped: s.skipped,
      retained: { candidateIndexAttribute: s.mesh.geometry.index === s.reducedIndexAttribute,
        candidateIndexCount: s.mesh.geometry.index.count === 14976,
        attributes: s.mesh.geometry.attributes === s.attributes, material: s.mesh.material === s.globe.patchMat } };
  });
  for (const [slot] of blocks) assert.equal(result.samples[slot].length, samplesPerBlock, `${slot} sample count`);
  const b2Lock = structuredClone(setup.lock);
  b2Lock.index = { isOriginal: false, isCandidate: true, count: 14976 };
  assert.deepEqual(result.lock, b2Lock, 'B2 camera/hole/time/material/attribute/index/draw-range lock');
  assert.ok(Object.values(result.retained).every(Boolean), 'Live patch state was not retained');
  assert.equal(errors.length, 0, errors.join('\n'));
  const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
  const stats = Object.fromEntries(Object.entries(result.samples).map(([key, values]) => [key, {
    n: values.length, p50Ms: +percentile(values, 0.5).toFixed(3), p95Ms: +percentile(values, 0.95).toFixed(3), valuesMs: values
  }]));
  for (const path of Object.values(screenshots)) {
    const image = await readFile(path), size = (await stat(path)).size;
    assert.equal(image.toString('ascii', 1, 4), 'PNG'); assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], [390, 844]);
    assert.ok(size > 10000, `Screenshot is unexpectedly small: ${path} (${size} bytes)`);
  }
  const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  for (const [a, b] of [['A1', 'A2'], ['B1', 'B2']]) assert.equal(await digest(screenshots[a]), await digest(screenshots[b]), `${a}/${b} screenshots differ`);
  await page.evaluate(() => window.__densityABAB.restore());
  const restored = await page.evaluate(() => {
    const s = window.__densityABAB;
    return s.mesh.geometry.index === s.originalIndexAttribute && s.mesh.geometry.index.count === 57600 &&
      s.mesh.geometry.drawRange.start === 0 && s.mesh.geometry.drawRange.count === Infinity;
  });
  assert.ok(restored, 'Original index buffer was not restored');
  console.log(JSON.stringify({ runtime: setup, method: '20 valid asynchronous EXT_disjoint_timer_query_webgl2 TIME_ELAPSED samples per A/B/A/B block around the whole FXAA scenePass.updateBefore; same page, 40 km hole, frozen camera and simulation time; only patch index array changes.', gpuScenePassMs: stats,
    screenshotPaths: screenshots, skipped: result.skipped, restored, errors }, null, 2));
} finally {
  await page.evaluate(() => window.__densityABAB?.restore?.()).catch(() => {});
  await browser.close();
}
