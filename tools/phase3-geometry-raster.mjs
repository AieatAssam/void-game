// Diagnostic only: attribute globe/patch draw cost to coverage and relief texture work.
// `off=relief` is a load-time shader diagnostic; no app source is changed.
import assert from 'node:assert/strict';
import { chromium, channel } from './browser.mjs';

const variant = process.argv[2] || 'baseline';
if (!['baseline', 'off=relief'].includes(variant)) throw new Error('Usage: node tools/phase3-geometry-raster.mjs [baseline|off=relief]');
const query = `?planet&q=low&webgl&nowatch&nothumbs&noarmy&nomap&nothreat&r=40000&seed=7&time=golden&at=city${variant === 'baseline' ? '' : `&${variant}`}`;
const port = process.env.PORT || 5196;
const browser = await chromium.launch({
  headless: true, channel,
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`${r.status()} ${r.url()}`); });

try {
  await page.goto(`http://127.0.0.1:${port}/${query}`);
  await page.waitForFunction(() => window.__planet?.globe?.globe && window.__planet.globe.patch?.visible && window.__game?.().state.phase === 3 && window.__game().state.playing, null, { timeout: 180000 });
  await page.waitForTimeout(5000);
  const report = await page.evaluate(async () => {
    const g = window.__game(), p = window.__planet, renderer = g.renderer, backend = renderer.backend, gl = backend.gl;
    const targets = [p.globe.globe, p.globe.patch];
    if (!gl || !backend.isWebGLBackend || typeof renderer.setRenderObjectFunction !== 'function') throw Error('Expected Three r186 WebGLBackend scene-pass draw hook.');
    if (backend.trackTimestamp) throw Error('Renderer timestamp queries are active; refusing nested TIME_ELAPSED queries.');
    if (!targets.every(Boolean) || targets[0] === targets[1]) throw Error('Expected distinct window.__planet.globe.globe and .patch targets.');
    if (!targets.every(o => o.visible && o.parent)) throw Error('Both target meshes must be visible and attached before sampling.');
    if (!backend.state?.scissor || typeof backend.setScissorTest !== 'function') throw Error('Expected cached WebGLBackend scissor state API.');
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext || typeof gl.createQuery !== 'function') throw Error('EXT_disjoint_timer_query_webgl2 unavailable.');
    const scenePass = g.post?.scenePass;
    if (!scenePass?.updateBefore) throw Error('Expected FXAA scene-pass updateBefore hook.');

    const nf = renderer._nodes?.nodeFrame;
    if (!nf || typeof nf.update !== 'function') throw Error('Expected Three r186 NodeFrame update for frozen shader time.');
    const save = { playing: g.state.playing, update: nf.update, frameId: nf.frameId, time: nf.time, deltaTime: nf.deltaTime, lastTime: nf.lastTime,
      globeUpdate: p.globe.update,
      positionSet: g.camera.position.set, lookAt: g.camera.lookAt, projectionUpdate: g.camera.updateProjectionMatrix,
      near: g.camera.near, far: g.camera.far, nearDescriptor: Object.getOwnPropertyDescriptor(g.camera, 'near'), farDescriptor: Object.getOwnPropertyDescriptor(g.camera, 'far') };
    // Canonicalize each fresh page before capturing the lock: the startup camera eases
    // toward homeCam, so identical query parameters alone do not guarantee identical views.
    window.__planet.setR(40000);
    g.camDist = 0;
    g.state.playing = false;
    g.state.time = 0;
    p.globe._t = 0;
    p.globe.u.uTime.value = 0;
    window.__planet.game.frame(0, window.__planet.ctx, 0, 0, 0);
    g.state.playing = false;
    // PlanetGame updates its camera while paused. Hold the live camera at this frame's
    // P3 view, including its projection planes, for the duration of the draw samples.
    g.camera.position.set = function () { return this; };
    g.camera.lookAt = function () { return this; };
    g.camera.near = save.near; g.camera.far = save.far;
    Object.defineProperties(g.camera, {
      near: { configurable: true, enumerable: true, get: () => save.near, set: () => {} },
      far: { configurable: true, enumerable: true, get: () => save.far, set: () => {} }
    });
    g.camera.updateProjectionMatrix = function () {};
    nf.update = function () { this.frameId++; this.deltaTime = 0; this.lastTime = performance.now(); renderer.info.frame = this.frameId; };
    p.globe.update = function (camera, _dt, viewH) { return save.globeUpdate.call(this, camera, 0, viewH); };
    const vec = v => [v.x, v.y, v.z];
    const quat = q => [q.x, q.y, q.z, q.w];
    const meshStamp = o => ({ uuid: o.uuid, visible: o.visible, geometry: o.geometry.uuid, material: o.material.uuid,
      positionCount: o.geometry.attributes.position?.count || 0, indexCount: o.geometry.index?.count || 0 });
    const snapshot = () => ({ camera: { position: vec(g.camera.position), quaternion: quat(g.camera.quaternion), fov: g.camera.fov, aspect: g.camera.aspect, near: g.camera.near, far: g.camera.far,
      projection: Array.from(g.camera.projectionMatrix.elements) },
      hole: { position: [g.hole.x, g.hole.z], radius: g.hole.r, area: g.hole.area }, time: g.state.time,
      globeTime: p.globe._t, globeUniformTime: p.globe.u.uTime.value,
      globe: meshStamp(targets[0]), patch: meshStamp(targets[1]) });
    const frozen = snapshot();
    const extRenderer = gl.getExtension('WEBGL_debug_renderer_info');
    const masked = gl.getParameter(gl.RENDERER), unmasked = extRenderer && gl.getParameter(extRenderer.UNMASKED_RENDERER_WEBGL);
    if (!/swiftshader|software/i.test(`${masked} ${unmasked || ''}`)) throw Error(`SwiftShader was required; renderer is ${unmasked || masked}.`);
    const oldHook = renderer.getRenderObjectFunction?.() ?? null;
    if (oldHook) throw Error('A render-object hook is already installed.');

    const modes = [
      { target: targets[0], name: 'globe', coverage: 'full' }, { target: targets[0], name: 'globe', coverage: 'center' },
      { target: targets[1], name: 'patch', coverage: 'full' }, { target: targets[1], name: 'patch', coverage: 'center' }
    ];
    const counts = Object.fromEntries(modes.map(m => [`${m.name}/${m.coverage}`, 0]));
    const pending = new Set(), valid = Object.fromEntries(modes.map(m => [`${m.name}/${m.coverage}`, []]));
    const skipped = { disjoint: 0, unavailable: 0, beginFailed: 0 };
    const callbackFrames = [], frameCounts = new Map();
    let serial = 0, activeFrame = -1, lastSampledFrame = -1, issued = 0, activeQuery = false, instrumenting = true;
    const sampledFrames = new Set();
    let afterFrozen = null;
    const capture = () => {
      if (activeFrame >= 0) {
        const hist = [...frameCounts].sort((a, b) => a[0].localeCompare(b[0]));
        callbackFrames.push(JSON.stringify(hist));
      }
      frameCounts.clear(); activeFrame = serial;
    };
    const poll = () => {
      serial++;
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) for (const q of pending) q.disjoint = true;
      for (const q of [...pending]) {
        if (!gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE)) continue;
        const ns = gl.getQueryParameter(q.query, gl.QUERY_RESULT);
        gl.deleteQuery(q.query); pending.delete(q);
        if (q.disjoint) skipped.disjoint++;
        else if (Number.isFinite(ns) && ns >= 0) valid[q.key].push(ns / 1e6);
        else skipped.unavailable++;
      }
      if (instrumenting || pending.size) requestAnimationFrame(poll);
    };
    const summarize = xs => {
      const a = [...xs].sort((x, y) => x - y);
      return { n: a.length, p50: a[Math.floor((a.length - 1) * 0.5)], p90: a[Math.floor((a.length - 1) * 0.9)], mean: a.reduce((s, x) => s + x, 0) / a.length };
    };
    const targetDraw = (object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId) => {
      if (activeFrame !== serial) capture();
      const key = `${object.uuid}|${passId || 'main'}`;
      frameCounts.set(key, (frameCounts.get(key) || 0) + 1);
      const m = modes[serial % modes.length];
      const cohort = `${m.name}/${m.coverage}`;
      const inFlight = [...pending].filter(q => q.key === cohort).length;
      const shouldSample = instrumenting && serial !== lastSampledFrame && object === m.target && valid[cohort].length + inFlight < 20 && !activeQuery;
      let query = null, scissorSaved = null, scissorOn = false;
      if (shouldSample) {
        const viewport = Array.from(gl.getParameter(gl.VIEWPORT));
        const [x, y, w, h] = viewport;
        scissorSaved = Array.from(gl.getParameter(gl.SCISSOR_BOX));
        scissorOn = gl.isEnabled(gl.SCISSOR_TEST);
        const rect = m.coverage === 'center' ? [x + Math.floor(w / 4), y + Math.floor(h / 4), Math.floor(w / 2), Math.floor(h / 2)] : viewport;
        // Use Three's cached backend state for both the box and test flag. Restore before returning to its renderer.
        backend.state.scissor(...rect);
        backend.setScissorTest(true);
        try {
          try {
            query = gl.createQuery();
            gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          } catch {
            if (query) { gl.deleteQuery(query); query = null; }
            skipped.beginFailed++;
          }
          if (query) {
            activeQuery = true; issued++; lastSampledFrame = serial; sampledFrames.add(serial);
            try {
              renderer.renderObject(object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId);
              gl.endQuery(ext.TIME_ELAPSED_EXT);
              activeQuery = false;
              pending.add({ query, key: cohort, disjoint: false });
              counts[cohort]++;
              query = null;
            } finally {
              if (activeQuery) { try { gl.endQuery(ext.TIME_ELAPSED_EXT); } catch {} activeQuery = false; }
              if (query) { gl.deleteQuery(query); query = null; }
            }
          } else {
            renderer.renderObject(object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId);
          }
        } finally {
          // Restore backend caches and GL state before another object or pass runs.
          backend.state.scissor(...scissorSaved);
          backend.setScissorTest(scissorOn);
        }
      } else {
        renderer.renderObject(object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId);
      }
    };
    const originalUpdate = scenePass.updateBefore;
    scenePass.updateBefore = function (...args) {
      const previous = renderer.getRenderObjectFunction();
      renderer.setRenderObjectFunction(targetDraw);
      try { return originalUpdate.apply(this, args); }
      finally { renderer.setRenderObjectFunction(previous); }
    };
    try {
      requestAnimationFrame(poll);
      const deadline = performance.now() + 240000;
      while (performance.now() < deadline && Object.values(valid).some(xs => xs.length < 20)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      instrumenting = false;
      if (pending.size) requestAnimationFrame(poll);
      const drain = performance.now() + 4000;
      while (pending.size && performance.now() < drain) await new Promise(resolve => setTimeout(resolve, 25));
      afterFrozen = snapshot();
    } finally {
      instrumenting = false;
      scenePass.updateBefore = originalUpdate;
      renderer.setRenderObjectFunction(oldHook);
      for (const q of pending) { gl.deleteQuery(q.query); skipped.unavailable++; }
      pending.clear();
      nf.update = save.update; nf.frameId = save.frameId; nf.time = save.time; nf.deltaTime = save.deltaTime; nf.lastTime = save.lastTime;
      p.globe.update = save.globeUpdate;
      g.state.playing = save.playing;
      g.camera.position.set = save.positionSet; g.camera.lookAt = save.lookAt; g.camera.updateProjectionMatrix = save.projectionUpdate;
      if (save.nearDescriptor) Object.defineProperty(g.camera, 'near', save.nearDescriptor); else delete g.camera.near;
      if (save.farDescriptor) Object.defineProperty(g.camera, 'far', save.farDescriptor); else delete g.camera.far;
    }
    if (activeFrame >= 0) callbackFrames.push(JSON.stringify([...frameCounts].sort((a, b) => a[0].localeCompare(b[0]))));
    if (JSON.stringify(frozen) !== JSON.stringify(afterFrozen)) throw Error(`Frozen P3 state changed: before=${JSON.stringify(frozen)} after=${JSON.stringify(afterFrozen)}`);
    if (new Set(callbackFrames).size !== 1) throw Error(`Scene callback/draw counts changed across frozen frames (${new Set(callbackFrames).size} callback histograms).`);
    if (Object.values(valid).some(xs => xs.length < 20)) throw Error(`Insufficient valid samples: ${JSON.stringify(Object.fromEntries(Object.entries(valid).map(([k, xs]) => [k, xs.length])))}`);
    if (issued !== Object.values(counts).reduce((a, b) => a + b, 0)) throw Error('Query count did not match sampled target draws.');
    if (issued !== sampledFrames.size) throw Error(`Expected one or fewer TIME_ELAPSED queries per RAF frame, got ${issued} across ${sampledFrames.size} frames.`);
    const lockMesh = o => ({ visible: o.visible, positionCount: o.geometry.attributes.position?.count || 0, indexCount: o.geometry.index?.count || 0 });
    const lock = { camera: frozen.camera, hole: frozen.hole, time: frozen.time, globeTime: frozen.globeTime, globeUniformTime: frozen.globeUniformTime,
      globe: lockMesh(targets[0]), patch: lockMesh(targets[1]), viewport: Array.from(gl.getParameter(gl.VIEWPORT)) };
    return { variant: new URLSearchParams(location.search).get('off') || 'baseline', query: location.search,
      renderer: { masked, unmasked, backend: backend.constructor.name }, viewport: Array.from(gl.getParameter(gl.VIEWPORT)), lock, frozen,
      samples: Object.fromEntries(Object.entries(valid).map(([k, xs]) => [k, summarize(xs)])),
      centerCoverage: 'central half-width × half-height (25% of the viewport)', queriesIssued: issued, uniqueQueryFrames: sampledFrames.size, validSamples: counts,
      skipped, sceneCallbacksPerFrame: JSON.parse(callbackFrames[0]), frozenCallbackFrames: callbackFrames.length, freezeVerified: JSON.stringify(frozen) === JSON.stringify(afterFrozen) };
  });
  assert.equal(errors.length, 0, `Browser errors: ${errors.join('; ')}`);
  report.errors = errors;
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
