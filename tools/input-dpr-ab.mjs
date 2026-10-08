// Same-page Phase 3 DPR comparison; diagnostic only, no game runtime hooks.
// Start Vite first, then: node tools/input-dpr-ab.mjs
import { chromium, channel } from './browser.mjs';

const port = process.env.PORT || 5174;
const radius = 40000;
const trials = [0.65, 0.4, 0.65, 0.4];
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
  await page.goto(`http://127.0.0.1:${port}/?planet&webgl&q=software&fps&nothumbs&nomap&nowatch&noarmy&nothreat&nofinale&seed=7&time=golden&at=city&r=${radius}`);
  await page.waitForFunction(() => window.__planet?.setR && window.__game?.().state.phase === 3 && window.__game().state.playing, null, { timeout: 900000 });
  const runtime = await page.evaluate(async () => {
    const { Q } = await import('/src/quality.js');
    const renderer = window.__game().renderer, gl = renderer.backend.gl;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: gl ? gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL || gl.RENDERER) : 'WebGPU',
      viewport: [innerWidth, innerHeight], deviceScaleFactor: devicePixelRatio,
      qualityParam: new URLSearchParams(location.search).get('q'), softwareProfile: Q.software,
      initialPixelRatio: renderer.getPixelRatio(), drawingBuffer: [gl?.drawingBufferWidth, gl?.drawingBufferHeight],
      phase: window.__game().state.phase, playing: window.__game().state.playing,
      seed: new URLSearchParams(location.search).get('seed'),
    };
  });
  if (!/swiftshader/i.test(runtime.renderer)) throw new Error(`Expected verified SwiftShader; got ${runtime.renderer}`);
  if (!runtime.softwareProfile) throw new Error('The game did not enable Q.software.');
  if (runtime.viewport.join('x') !== '390x844' || runtime.deviceScaleFactor !== 1) throw new Error(`Unexpected viewport/DPR: ${JSON.stringify(runtime)}`);
  await page.evaluate(() => {
    const t = window.__inputRenderTrace = { events: [], frames: [], last: null };
    for (const type of ['keydown', 'keyup']) addEventListener(type, e => {
      const at = performance.now(), last = t.last;
      t.events.push({ type, key: e.key.toLowerCase(), at, eventAt: e.timeStamp,
        handlerMs: +(at - e.timeStamp).toFixed(2), rafPhaseMs: last == null ? null : +(at - last).toFixed(2), raf: null });
    });
    const sample = now => {
      const h = window.__game().hole;
      t.frames.push({ at: now, r: h.r });
      for (const e of t.events) if (!e.raf && now >= e.at) e.raf = { at: now, ms: +(now - e.at).toFixed(2), sx: h.sx, sz: h.sz, r: h.r };
      t.last = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  const byTrial = [];
  for (const [trial, dpr] of trials.entries()) {
    await page.evaluate(async ratio => {
      const renderer = window.__game().renderer;
      renderer.setPixelRatio(ratio);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (Math.abs(renderer.getPixelRatio() - ratio) > 0.001) throw new Error(`DPR switch failed: requested ${ratio}, got ${renderer.getPixelRatio()}`);
      const { state } = window.__game();
      if (state.phase !== 3 || !state.playing) throw new Error('Phase 3 simulation stopped during DPR switch.');
    }, dpr);
    await page.waitForTimeout(1500); // Let renderer and simulation settle at this ratio.
    const start = await page.evaluate(() => {
      window.__planet.setR(40000);
      window.__perf(true);
      return { eventStart: window.__inputRenderTrace.events.length, frameStart: window.__inputRenderTrace.frames.length,
        dbg: window.__planetDbg(), pixelRatio: window.__game().renderer.getPixelRatio(),
        drawingBuffer: [window.__game().renderer.domElement.width, window.__game().renderer.domElement.height] };
    });
    const eventIds = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const [key, type] of [['d', 'keydown'], ['d', 'keyup'], ['a', 'keydown'], ['a', 'keyup']]) {
        const id = await page.evaluate(() => window.__inputRenderTrace.events.length);
        await page.keyboard[type === 'keydown' ? 'down' : 'up'](key);
        await page.waitForFunction(i => window.__inputRenderTrace.events[i]?.raf, id, { timeout: 15000 });
        eventIds.push(id);
      }
    }
    const actions = await page.evaluate(ids => ids.map(i => {
      const e = window.__inputRenderTrace.events[i];
      return { type: e.type, key: e.key, handlerProxyMs: e.handlerMs, firstRafMs: e.raf.ms,
        rafPhaseMs: e.rafPhaseMs, response: { sx: +e.raf.sx.toFixed(3), sz: +e.raf.sz.toFixed(3) }, radius: e.raf.r };
    }), eventIds);
    for (let cycle = 0; cycle < 3; cycle++) {
      const [down, released, reverse, stopped] = actions.slice(cycle * 4, cycle * 4 + 4).map(a => a.response.sx);
      if (!(down > 0 && released === 0 && reverse < 0 && stopped === 0)) throw new Error(`Unexpected start/release/reversal response at DPR ${dpr}: ${[down, released, reverse, stopped]}`);
    }
    await page.waitForTimeout(1200);
    byTrial.push(await page.evaluate(({ dpr, trial, start, actions }) => {
      const t = window.__inputRenderTrace, frames = t.frames.slice(start.frameStart);
      const cadenceMs = frames.slice(1).map((f, i) => f.at - frames[i].at);
      return { trial: trial + 1, dpr, pixelRatioAtStart: start.pixelRatio, drawingBufferAtStart: start.drawingBuffer,
        actions, cadenceMs,
        perf: window.__perf(), planetDebugStart: start.dbg, planetDebugEnd: window.__planetDbg(),
        radiusAtEnd: window.__game().hole.r };
    }, { dpr, trial, start, actions }));
  }
  const byDpr = [...new Set(trials)].map(dpr => {
    const group = byTrial.filter(x => x.dpr === dpr), actionGroups = {};
    for (const x of group) for (const a of x.actions) {
      const key = `${a.type}:${a.key}`;
      (actionGroups[key] ??= []).push(a);
    }
    const perfSummary = field => {
      const values = group.map(x => x.perf[field]).filter(Boolean);
      return Object.fromEntries(['avgFps', 'lowFps1', 'worstMs', 'avgJs', 'avgSubmit', 'over33', 'over50', 'over100'].map(k => [k, stats(values.map(v => v[k]))]));
    };
    return { dpr, trials: group.length,
      actions: Object.fromEntries(Object.entries(actionGroups).map(([k, a]) => [k, {
        handlerProxyMs: stats(a.map(x => x.handlerProxyMs)), firstRafMs: stats(a.map(x => x.firstRafMs)),
        rafPhaseMs: stats(a.map(x => x.rafPhaseMs)), response: a.map(x => x.response),
      }])),
      cadenceMs: stats(group.flatMap(x => x.cadenceMs)),
      perfLast10s: perfSummary('last10s'), perfLast1s: perfSummary('last1s') };
  });
  console.log(JSON.stringify({
    runtime: { ...runtime, cpuThrottle: 4, softwareVerified: true, simulation: 'live; no pause or fixed ticks', radiusKm: radius / 1000 },
    method: 'Same page, renderer.setPixelRatio() sequence 0.65/0.4/0.65/0.4; trusted Playwright keyboard down/up for d/release/a/release, three cycles per trial. First RAF is the first live RAF sample after each key event.',
    presentation: 'First-RAF delay is an input-to-next-RAF proxy, not a physical input-to-photon measurement. __perf CPU/JS/render-submit values are diagnostics from the game loop.',
    byDpr, byTrial, errors,
  }));
} finally {
  await browser.close();
}
