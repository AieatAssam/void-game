// Natural Phase 1 breakout + Phase 2 ascension trace on the ordinary RAF loop.
// Start a fresh server: npm run dev -- --host 127.0.0.1 --port 5174
// Verify served source: curl -fsS http://127.0.0.1:5174/src/main.js | head
// Run: PORT=5174 node tools/transition-timing-check.mjs [query]
// Optional: SOFTWARE=1 WIDTH=390 HEIGHT=844 PORT=5174 node tools/transition-timing-check.mjs
// Repeatable transition-only trigger: TRIGGER=debug PORT=5174 node tools/transition-timing-check.mjs
// Installs the existing human-like bot as steering input; deliberately never uses ?bot or __tick.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, channel } from './browser.mjs';

const rawQuery = process.argv[2] || '?q=low&seed=7&nothumbs&noarmy&norivals';
const query = rawQuery.replace(/^\?/, '');
if (new URLSearchParams(query).has('bot')) throw new Error('Remove ?bot: it suppresses natural transition checks.');
const maxMs = +(process.env.MAX_MS || 60 * 60 * 1000);
const debugTrigger = process.env.TRIGGER === 'debug';
const software = process.env.SOFTWARE === '1';
const browser = await chromium.launch({ headless: true, channel, args: ['--ignore-gpu-blocklist', ...(software ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
const page = await browser.newPage({ viewport: { width: +(process.env.WIDTH || 960), height: +(process.env.HEIGHT || 640) } });
const errors = [];
page.on('response', (response) => {
  if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push({ type: 'http', status: response.status(), url: response.url() });
});
page.on('requestfailed', (request) => errors.push({ type: 'requestfailed', url: request.url(), reason: request.failure()?.errorText }));
page.on('pageerror', (error) => errors.push({ type: 'pageerror', text: error.stack || String(error) }));
page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push({ type: 'console.error', text: message.text() }); });

try {
  await page.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?${query}`);
  await page.waitForSelector('#menu:not([hidden])', { timeout: 900000 });
  await page.evaluate(([trigger, soft]) => { window.__transitionDebugTrigger = trigger; window.__transitionSoftwareRequested = soft; }, [debugTrigger, software]);
  await page.evaluate(() => {
    if (typeof window.__humanBot !== 'function') throw new Error('The existing human-like steering input is unavailable.');
    window.__bot = window.__humanBot();
    const samples = [], runs = {}, maxPre = 5000;
    let previous = null, rafCount = 0;
    const g0 = window.__game(), gl = g0.renderer.backend.gl, ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = gl ? gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL || gl.RENDERER) : 'WebGPU';
    const runtime = { renderer, softwareRequested: window.__transitionSoftwareRequested, softwareVerified: /swiftshader|llvmpipe|software/i.test(renderer), viewport: [innerWidth, innerHeight], pixels: [g0.renderer.domElement.width, g0.renderer.domElement.height] };
    window.__transitionTiming = { done: false, ended: null, trigger: window.__transitionDebugTrigger ? 'production-transition-hooks' : 'humanBot-natural', runs, rafCount, runtime };
    const getState = (now) => {
      const g = window.__game(), s = g.state, c = g.city;
      return { at: +now.toFixed(2), gap: previous == null ? null : +(now - previous).toFixed(2), phase: s.phase,
        playing: !!s.playing, breaking: !!s.breaking, ascending: !!s.ascending,
        loading: !document.querySelector('#load')?.hidden || document.querySelector('#screen')?.classList.contains('loading'),
        reveal: c?.reveal ?? null, revealTotal: c?.meshes?.length ?? null };
    };
    const tick = (now) => {
      const sample = getState(now);
      previous = now;
      samples.push(sample);
      while (samples.length && now - samples[0].at > maxPre) samples.shift();
      const breakoutStarted = sample.breaking && !runs.breakout;
      const ascendStarted = sample.ascending && !runs.ascension;
      if (breakoutStarted) runs.breakout = { startedAt: sample.at, pre: samples.slice(0, -1), frames: [], completedAt: null, endAt: null };
      if (ascendStarted) runs.ascension = { startedAt: sample.at, pre: samples.slice(0, -1), frames: [], completedAt: null, endAt: null };
      for (const [name, run] of Object.entries(runs)) {
        if (run.endAt != null) continue;
        run.frames.push(sample);
        const complete = name === 'breakout' ? sample.phase === 2 && !sample.breaking : !sample.ascending && (run.startedAt < sample.at);
        if (complete && run.completedAt == null) run.completedAt = sample.at;
        if (run.completedAt != null && sample.at - run.completedAt >= 5000) run.endAt = sample.at;
      }
      rafCount++;
      const g = window.__game();
      window.__transitionTiming.rafCount = rafCount;
      if (g.state.over || (runs.breakout?.endAt != null && runs.ascension?.endAt != null)) {
        window.__transitionTiming.done = true;
        window.__transitionTiming.ended = g.state.over ? 'run-over' : 'complete';
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator('#play').click();
  let timedOut = false;
  const deadline = Date.now() + maxMs;
  const waitFor = (fn) => page.waitForFunction(fn, null, { timeout: Math.max(1, deadline - Date.now()) });
  try {
    if (debugTrigger) {
      await page.evaluate(() => setTimeout(() => {
        // Start with the normal region handoff radius so this diagnostic doesn't end on the town's first tiny-radius check.
        const { hole, state } = window.__game();
        hole.area = Math.PI * 10 ** 2;
        state.mi = 100;
        window.__breakout(false).catch((error) => { console.error(error.stack || String(error)); });
      }, 5000));
      await waitFor(() => window.__transitionTiming?.runs?.breakout?.endAt != null || window.__transitionTiming?.done);
      if (!await page.evaluate(() => window.__transitionTiming?.done)) {
        await page.evaluate(() => window.__ascend(false).catch((error) => { console.error(error.stack || String(error)); }));
      }
    }
    await waitFor(() => window.__transitionTiming?.done);
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    timedOut = true;
  }
  const trace = await page.evaluate(() => window.__transitionTiming || null);
  if (software && !trace?.runtime?.softwareVerified) throw new Error(`SwiftShader was requested but renderer is ${trace?.runtime?.renderer ?? 'unavailable'}`);
  const perf = await page.evaluate(() => window.__perf?.() ?? null);
  const result = { url: page.url(), timedOut, maxMs, trigger: trace?.trigger ?? (debugTrigger ? 'production-transition-hooks' : 'humanBot-natural'), errors, trace, perf };
  mkdirSync('.shots', { recursive: true });
  const path = `.shots/transitions-${new Date().toISOString().replaceAll(':', '-')}.json`;
  writeFileSync(path, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ path, timedOut, trigger: result.trigger, ended: trace?.ended ?? 'no transition capture', runtime: trace?.runtime, rafCount: trace?.rafCount,
    breakout: trace?.runs?.breakout ? { frames: trace.runs.breakout.frames.length, pre: trace.runs.breakout.pre.length, completedAt: trace.runs.breakout.completedAt, endAt: trace.runs.breakout.endAt } : 'not reached',
    ascension: trace?.runs?.ascension ? { frames: trace.runs.ascension.frames.length, pre: trace.runs.ascension.pre.length, completedAt: trace.runs.ascension.completedAt, endAt: trace.runs.ascension.endAt } : 'not reached', errors, path }, null, 2));
  if (!trace?.runs?.breakout || !trace?.runs?.ascension || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
