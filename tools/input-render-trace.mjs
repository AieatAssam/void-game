// Live keyboard-to-RAF and Chrome trace proxies; no game runtime hooks or fixed ticks.
// Start Vite first, then: node tools/input-render-trace.mjs
import { chromium, channel } from './browser.mjs';

const port = process.env.PORT || 5174;
const radii = [40000, 1200000];
const phases = [0, 3, 7, 12, 18];
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
  await page.goto(`http://127.0.0.1:${port}/?planet&webgl&q=software&nothumbs&nomap&nowatch&noarmy&nothreat&nofinale&seed=7&time=golden&at=city&r=${radii[0]}`);
  await page.waitForFunction(() => window.__planet?.setR && window.__game?.().state.playing, null, { timeout: 900000 });
  const runtime = await page.evaluate(async () => {
    const { Q } = await import('/src/quality.js');
    const renderer = window.__game().renderer, gl = renderer.backend.gl;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: gl ? gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL || gl.RENDERER) : 'WebGPU',
      viewport: [innerWidth, innerHeight], deviceScaleFactor: devicePixelRatio,
      qualityParam: new URLSearchParams(location.search).get('q'), softwareProfile: Q.software,
      rendererPixelRatio: renderer.getPixelRatio(), drawingBuffer: [gl?.drawingBufferWidth, gl?.drawingBufferHeight],
      seed: new URLSearchParams(location.search).get('seed'),
    };
  });
  if (!/angle.*vulkan.*swiftshader/i.test(runtime.renderer)) throw new Error(`Expected verified ANGLE/Vulkan SwiftShader; got ${runtime.renderer}`);
  if (!runtime.softwareProfile) throw new Error('The game did not enable Q.software.');
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

  let trace = [];
  const traceDone = new Promise(resolve => cdp.on('Tracing.tracingComplete', resolve));
  cdp.on('Tracing.dataCollected', e => trace.push(...e.value));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing,input,latencyInfo,viz,cc', transferMode: 'ReportEvents' });
  const byRadius = [];
  for (const r of radii) {
    await page.evaluate(radius => window.__planet.setR(radius), r);
    await page.waitForFunction(radius => Math.abs(window.__game().hole.r - radius) < radius * .01, r, { timeout: 15000 });
    const first = await page.evaluate(() => window.__inputRenderTrace.events.length);
    const frameStart = await page.evaluate(() => window.__inputRenderTrace.frames.length);
    for (let i = 0; i < phases.length; i++) {
      const offset = phases[i], n = first + i * 4;
      await page.evaluate(ms => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, ms))), offset);
      await page.keyboard.down('d');
      await page.waitForFunction(n => window.__inputRenderTrace.events[n]?.raf, n, { timeout: 5000 });
      await page.keyboard.up('d');
      await page.waitForFunction(n => window.__inputRenderTrace.events[n]?.raf, n + 1, { timeout: 5000 });
      await page.keyboard.down('a');
      await page.waitForFunction(n => window.__inputRenderTrace.events[n]?.raf, n + 2, { timeout: 5000 });
      await page.keyboard.up('a');
      await page.waitForFunction(n => window.__inputRenderTrace.events[n]?.raf, n + 3, { timeout: 5000 });
      const axes = await page.evaluate(indices => indices.map(n => window.__inputRenderTrace.events[n].raf.sx), [n, n + 1, n + 2, n + 3]);
      if (!(axes[0] > 0 && axes[1] === 0 && axes[2] < 0 && axes[3] === 0)) {
        throw new Error(`Unexpected first-RAF steering responses for start/release/reversal/release: ${axes}`);
      }
    }
    await page.waitForTimeout(750);
    byRadius.push(await page.evaluate(({ radius, frameStart }) => {
      const t = window.__inputRenderTrace, es = t.events.slice(-20), fs = t.frames.slice(frameStart);
      const groups = {};
      for (const e of es) {
        const action = `${e.type}:${e.key}`;
        (groups[action] ??= []).push(e);
      }
      return { radiusKm: radius / 1000, actualRadius: window.__game().hole.r,
        input: Object.fromEntries(Object.entries(groups).map(([k, a]) => [k, {
          handlerProxyMs: a.map(e => e.handlerMs), firstRafMs: a.map(e => e.raf?.ms),
          phasesMs: a.map(e => e.rafPhaseMs), response: a.map(e => e.raf && ({ sx: +e.raf.sx.toFixed(3), sz: +e.raf.sz.toFixed(3) })),
        }])), cadenceMs: fs.slice(1).map((f, i) => f.at - fs[i].at) };
    }, { radius: r, frameStart }));
  }
  await cdp.send('Tracing.end');
  await traceDone;
  const traceCounts = new Map();
  for (const e of trace) if (/presentation|framepresent|eventdispatch|inputlatency|latencyinfo/i.test(e.name)) {
    const key = `${e.name}\t${e.cat}`;
    traceCounts.set(key, (traceCounts.get(key) || 0) + 1);
  }
  const traceCandidates = [...traceCounts].map(([key, count]) => {
    const [name, category] = key.split('\t');
    return { name, category, count };
  }).sort((a, b) => Number(/present|frame/i.test(b.name)) - Number(/present|frame/i.test(a.name)) || b.count - a.count)
    .slice(0, 12);
  const summaries = byRadius.map(x => ({ ...x, input: Object.fromEntries(Object.entries(x.input).map(([k, v]) => [k, {
    handlerProxyMs: stats(v.handlerProxyMs), firstRafMs: stats(v.firstRafMs), phasesMs: v.phasesMs, response: v.response,
  }])), cadenceMs: stats(x.cadenceMs) }));
  const radiusChanges = Object.fromEntries(Object.keys(summaries[0].input).map(action => {
    const a = summaries[0].input[action], b = summaries[1].input[action];
    return [action, { handlerProxyP50Ms: +(b.handlerProxyMs.p50 - a.handlerProxyMs.p50).toFixed(2),
      firstRafP50Ms: +(b.firstRafMs.p50 - a.firstRafMs.p50).toFixed(2) }];
  }));
  const report = {
    runtime: { ...runtime, cpuThrottle: 4, softwareVerified: true },
    method: 'Playwright keyboard events; handler proxy is a post-registration window listener; response is first live RAF sample after event.',
    presentation: 'Chrome trace candidates are diagnostic proxies; no physical input-to-photon claim or guaranteed input/frame correlation.',
    byRadius: summaries, radiusChangesMs: radiusChanges,
    chromeTrace: { eventCount: trace.length, candidateNames: traceCandidates }, errors,
  };
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
