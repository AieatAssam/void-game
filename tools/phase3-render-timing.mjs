// Compare Phase 3 scene-pass and full post-render GPU time without nested queries.
// Start Vite first, then: node tools/phase3-render-timing.mjs
import { chromium, channel } from './browser.mjs';

const port = process.env.PORT || 5174;
const radius = 40000;
const errors = [];
const browser = await chromium.launch({
  headless: true, channel,
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const cdp = await page.context().newCDPSession(page);
page.on('pageerror', e => errors.push({ type: 'pageerror', text: e.message }));
page.on('console', m => { if (m.type() === 'error') errors.push({ type: 'console', text: m.text(), location: m.location() }); });
page.on('requestfailed', r => errors.push({ type: 'requestfailed', url: r.url(), reason: r.failure()?.errorText }));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push({ type: 'http', status: r.status(), url: r.url() }); });

const percentile = (xs, p) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? +a[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)].toFixed(2) : null;
};
const stats = xs => ({ n: xs.length, p50: percentile(xs, .5), p95: percentile(xs, .95) });

try {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`http://127.0.0.1:${port}/?planet&webgl&q=software&nothumbs&nomap&nowatch&noarmy&nothreat&nofinale&seed=7&time=golden&at=city&r=${radius}`);
  await page.waitForFunction(() => window.__planet?.setR && window.__game?.().state.phase === 3 && window.__game().state.playing, null, { timeout: 900000 });
  const runtime = await page.evaluate(async ratio => {
    const { Q } = await import('/src/quality.js');
    const g = window.__game(), renderer = g.renderer, gl = renderer.backend.gl;
    renderer.setPixelRatio(ratio);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl ? gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL || gl.RENDERER) : 'WebGPU',
      viewport: [innerWidth, innerHeight], deviceScaleFactor: devicePixelRatio,
      pixelRatio: renderer.getPixelRatio(), drawingBuffer: [renderer.domElement.width, renderer.domElement.height],
      qualityParam: new URLSearchParams(location.search).get('q'), softwareProfile: Q.software,
      phase: g.state.phase, playing: g.state.playing, radius: g.hole.r, seed: new URLSearchParams(location.search).get('seed') };
  }, 0.4);
  if (!/swiftshader/i.test(runtime.renderer)) throw new Error(`Expected verified SwiftShader; got ${runtime.renderer}`);
  if (!runtime.softwareProfile) throw new Error('The game did not enable Q.software.');
  if (runtime.viewport.join('x') !== '390x844' || runtime.deviceScaleFactor !== 1 || Math.abs(runtime.pixelRatio - 0.4) > .001) throw new Error(`Unexpected display setup: ${JSON.stringify(runtime)}`);

  const setup = await page.evaluate(async r => {
    const g = window.__game(), p = g.post, renderer = g.renderer, backend = renderer.backend, gl = backend.gl;
    const scenePass = p?.scenePass, ext = gl?.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!gl || !backend.isWebGLBackend || !ext || typeof gl.createQuery !== 'function') throw Error('Expected WebGL2 EXT_disjoint_timer_query_webgl2.');
    if (backend.trackTimestamp) throw Error('Three timestamp tracking is active; refusing a competing TIME_ELAPSED query.');
    if (!p?.enabled || typeof p.render !== 'function' || !scenePass || typeof scenePass.updateBefore !== 'function') throw Error('Expected enabled Post.render() and scenePass.updateBefore() entry points.');
    if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) throw Error('A TIME_ELAPSED query is already active.');
    window.__planet.setR(r);
    if (!g.state.playing || g.state.phase !== 3) throw Error('Expected live Phase 3 simulation.');
    const originalPostRender = p.render, originalSceneUpdate = scenePass.updateBefore;
    const state = window.__phase3Timing = { started: performance.now(), deadline: performance.now() + 240000,
      instrumenting: true, active: null, pending: new Set(), serial: 0, sampledSerial: -1, kind: null,
      samples: { fullPostRender: [], scenePass: [] }, skipped: { disjoint: 0, unavailable: 0, beginFailed: 0 },
      frames: [], events: [], lastRaf: null, errors: [], done: false };
    const enough = name => state.samples[name].length + [...state.pending].filter(q => q.name === name).length >= 20;
    const begin = name => {
      if (!state.instrumenting || state.active || state.sampledSerial === state.serial || enough(name)) return null;
      state.sampledSerial = state.serial;
      if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) throw Error('Found an active TIME_ELAPSED query before begin.');
      const query = gl.createQuery();
      try { gl.beginQuery(ext.TIME_ELAPSED_EXT, query); }
      catch (error) { gl.deleteQuery(query); state.skipped.beginFailed++; state.errors.push(String(error)); return null; }
      return state.active = { query, name, serial: state.serial };
    };
    const end = entry => {
      if (!entry) return;
      try {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        state.pending.add({ ...entry, disjoint: false });
      } finally { state.active = null; }
    };
    p.render = function (...args) {
      const serial = ++state.serial;
      state.kind = serial % 2 ? 'fullPostRender' : 'scenePass';
      const entry = state.kind === 'fullPostRender' ? begin(state.kind) : null;
      try { return originalPostRender.apply(this, args); }
      finally { end(entry); state.kind = null; }
    };
    scenePass.updateBefore = function (...args) {
      const entry = state.kind === 'scenePass' ? begin('scenePass') : null;
      try { return originalSceneUpdate.apply(this, args); }
      finally { end(entry); }
    };
    const restore = () => {
      state.instrumenting = false;
      p.render = originalPostRender;
      scenePass.updateBefore = originalSceneUpdate;
    };
    state.restore = restore;
    const poll = () => {
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) for (const q of state.pending) q.disjoint = true;
      for (const q of [...state.pending]) {
        if (!gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE)) continue;
        const ns = gl.getQueryParameter(q.query, gl.QUERY_RESULT);
        gl.deleteQuery(q.query); state.pending.delete(q);
        if (q.disjoint) state.skipped.disjoint++;
        else if (Number.isFinite(ns) && ns >= 0) state.samples[q.name].push(ns / 1e6);
        else state.skipped.unavailable++;
      }
      if (state.instrumenting && state.samples.fullPostRender.length >= 20 && state.samples.scenePass.length >= 20) restore();
      if (state.instrumenting && performance.now() >= state.deadline) {
        state.errors.push('Timed out before collecting 20 valid samples in each mode.');
        restore();
      }
      if (!state.instrumenting && !state.pending.size) { state.done = true; return; }
      requestAnimationFrame(poll);
    };
    for (const type of ['keydown', 'keyup']) addEventListener(type, e => {
      const at = performance.now();
      state.events.push({ type, key: e.key.toLowerCase(), at, eventAt: e.timeStamp, handlerMs: +(at - e.timeStamp).toFixed(2), raf: null });
    });
    const cadence = now => {
      const g = window.__game(), h = g.hole;
      state.frames.push({ at: now, r: h.r });
      for (const e of state.events) if (!e.raf && now >= e.at) e.raf = { at: now, ms: +(now - e.at).toFixed(2), sx: h.sx, sz: h.sz, r: h.r };
      state.lastRaf = now;
      requestAnimationFrame(cadence);
    };
    window.__perf(true);
    requestAnimationFrame(poll);
    requestAnimationFrame(cadence);
    return { renderer: backend.constructor.name, viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
      pixelRatio: renderer.getPixelRatio(), drawingBuffer: [renderer.domElement.width, renderer.domElement.height],
      radiusStart: g.hole.r, radiusTarget: r, playing: g.state.playing, phase: g.state.phase,
      methods: { postRender: typeof originalPostRender, scenePassUpdate: typeof originalSceneUpdate }, querySupport: true };
  }, radius);

  const actionIds = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const [key, type] of [['d', 'keydown'], ['d', 'keyup'], ['a', 'keydown'], ['a', 'keyup']]) {
      const id = await page.evaluate(() => window.__phase3Timing.events.length);
      await page.keyboard[type === 'keydown' ? 'down' : 'up'](key);
      await page.waitForFunction(i => window.__phase3Timing.events[i]?.raf, id, { timeout: 15000 });
      actionIds.push(id);
    }
  }
  await page.waitForFunction(() => window.__phase3Timing.done, null, { timeout: 260000 });
  const result = await page.evaluate(ids => {
    const t = window.__phase3Timing, g = window.__game();
    const actions = ids.map(i => {
      const e = t.events[i];
      return { type: e.type, key: e.key, handlerProxyMs: e.handlerMs, firstRafMs: e.raf.ms,
        response: { sx: +e.raf.sx.toFixed(3), sz: +e.raf.sz.toFixed(3) }, radius: e.raf.r };
    });
    const cadence = t.frames.slice(1).map((f, i) => f.at - t.frames[i].at);
    return { samples: Object.fromEntries(Object.entries(t.samples).map(([k, xs]) => [k, xs])),
      actions, cadenceMs: cadence, perf: window.__perf(), planetDebug: window.__planetDbg(), radiusAtEnd: g.hole.r,
      skipped: t.skipped, instrumentationErrors: t.errors, durationMs: performance.now() - t.started };
  }, actionIds);
  for (let cycle = 0; cycle < 3; cycle++) {
    const [down, released, reverse, stopped] = result.actions.slice(cycle * 4, cycle * 4 + 4).map(a => a.response.sx);
    if (!(down > 0 && released === 0 && reverse < 0 && stopped === 0)) throw new Error(`Unexpected steering response: ${[down, released, reverse, stopped]}`);
  }
  const modeStats = Object.fromEntries(Object.entries(result.samples).map(([name, values]) => [name, stats(values)]));
  if (Object.values(result.samples).some(x => x.length !== 20)) throw new Error(`Expected 20 valid samples per mode: ${JSON.stringify(modeStats)}`);
  if (result.instrumentationErrors.length) throw new Error(result.instrumentationErrors.join('; '));
  const report = { runtime: { ...runtime, ...setup, cpuThrottle: 4, softwareVerified: true,
      simulation: 'live; no pause or fixed ticks', radiusKm: radius / 1000 },
    method: 'One non-nested TIME_ELAPSED query per selected render: odd Post.render() calls time the full post pipeline; even calls time scenePass.updateBefore(). Results are read asynchronously and disjoint samples are discarded. Trusted Playwright keydown/keyup events test d/start, release, a/reversal, release.',
    gpuTimeMs: modeStats, cadenceMs: stats(result.cadenceMs), actions: result.actions,
    perf: result.perf, planetDebug: result.planetDebug, skipped: result.skipped,
    sampleValuesMs: result.samples,
    durationMs: result.durationMs, errors };
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
