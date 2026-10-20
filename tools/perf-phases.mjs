// Per-phase performance on a phone profile: node tools/perf-phases.mjs [--out f.json] [--md f.md] [--secs 24] [--phases 1,2,3,4]
//   [--configs pixel7,pixel7-cpu4] [--view 160x356] [--then-space] [--transitions | --transitions-only] [--tview 160x356] [--profile] [--url http://localhost:4173/] [--extra "&q=low"]
// Serve the production build first (npm run build && npx vite preview --port 4173). For each config and phase it opens a fresh
// page (Pixel 7: 412x915, DPR 2.625, touch, Android UA; the GPU name reads as Mali-G710 so quality.js takes the phone path, not
// the SwiftShader profile), plays with the bot and samples every 2 s: frame times (rAF intervals), draw calls, triangles,
// geometries and textures in memory (renderer.info), render size and JS heap (CDP), so a leak shows as a rising column.
// `pixel7-cpu4` adds 4x CPU throttling (Emulation.setCPUThrottlingRate): the main thread of a mid phone; the GPU is still
// SwiftShader, so frame times are relative, not phone fps. --transitions plays town -> island -> planet -> space in one
// page and records memory at each stage, in a smaller viewport (--tview, CSS px, same DPR): a SwiftShader planet frame
// at full size takes ~30 s and the Ascension cinematic would run for hours. --profile records 8 s of CPU profile per phase (CDP Profiler) and lists the hot
// functions by self time. WebGL2 (?webgl): SwiftShader's WebGPU fails buffer creation here.
import { chromium } from './browser.mjs';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const has = (k) => process.argv.includes('--' + k);
const BASE = arg('url', 'http://localhost:4173/'), SECS = +arg('secs', 24), EXTRA = arg('extra', '');
const PHASES = String(arg('phases', '1,2,3,4')).split(',').map(Number).filter(Boolean);
const CONFIGS = String(arg('configs', 'pixel7,pixel7-cpu4')).split(',');
const PIXEL7 = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };
// phase -> query and whether the menu's play button starts it (the old flags, so the same tool measures older builds)
const START = { 1: ['seed=4242&bot', true], 2: ['seed=4242&bot&region', true], 3: ['seed=7&planet', false], 4: ['seed=7&space&bot', false] };

// page side: rAF intervals (works without ?fps) and a circling steer for phases whose ?bot does not drive
function pageInit() {
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const gp = C.prototype.getParameter;
    C.prototype.getParameter = function (k) { return k === 0x9246 ? 'Mali-G710' : k === 0x9245 ? 'ARM' : gp.call(this, k); };
  }
  const ft = (window.__ft = []);
  let last = 0;
  const tick = (t) => { if (last) ft.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__circle = () => { let a = 0; return () => { a += 0.004; return [Math.cos(a), Math.sin(a * 0.7)]; }; };
}
const snap = () => {
  const g = window.__game?.(), r = g?.renderer, ft = window.__ft.splice(0), sorted = [...ft].sort((a, b) => a - b);
  const mean = ft.reduce((a, b) => a + b, 0) / (ft.length || 1);
  const p = window.__perf?.().last10s, gov = window.__perfHook?.();
  return {
    phase: g?.state.phase, r: g?.hole.r, frames: ft.length, mean: +mean.toFixed(1), p95: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(1),
    over20: ft.length ? +(100 * ft.filter((v) => v > 20).length / ft.length).toFixed(0) : 0,
    draws: r?.info.render.drawCalls, tris: r?.info.render.triangles, geo: r?.info.memory.geometries, tex: r?.info.memory.textures,
    pr: r?.getPixelRatio(), px: r ? `${r.domElement.width}x${r.domElement.height}` : null, js: p ? +p.avgJs.toFixed(1) : null, submit: p ? +p.avgSubmit.toFixed(1) : null,
    tier: gov ? `${gov.tier} notch ${gov.notchLabel}` : null,
  };
};

async function open(browser, cfg, viewport = PIXEL7.viewport) {
  const ctx = await browser.newContext({ ...PIXEL7, viewport });
  await ctx.addInitScript(pageInit);
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page), errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/vibrate|AudioContext/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await cdp.send('Performance.enable');
  if (cfg.endsWith('cpu4')) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return { ctx, page, cdp, errors };
}
const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
const heap = async (cdp) => +((await metrics(cdp)).JSHeapUsedSize / 1048576).toFixed(1);
// main-thread time per rendered frame from Chrome's own counters: script, style recalc, layout (DOM work the HUD causes)
const MAIN = { ScriptDuration: 'scriptMs', RecalcStyleDuration: 'styleMs', LayoutDuration: 'layoutMs', TaskDuration: 'taskMs' };
async function sample(page, cdp, secs, out) {
  await page.evaluate(() => window.__ft.splice(0));
  let m0 = await metrics(cdp);
  for (let t = 2; t <= secs; t += 2) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(snap), m1 = await metrics(cdp), row = { t, ...s, heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1) };
    for (const [k, n] of Object.entries(MAIN)) row[n] = +((m1[k] - m0[k]) * 1000 / Math.max(1, s.frames)).toFixed(2); // (seconds -> ms per frame)
    m0 = m1;
    out.push(row);
  }
  return out;
}
async function go(page, phase) {
  const [q, play] = START[phase];
  await page.goto(`${BASE}?webgl&nothumbs&fps&perfhook&${q}${EXTRA}`);
  if (play) { await page.waitForSelector('#menu:not([hidden])', { timeout: 600000 }); await page.evaluate(() => document.getElementById('play').click()); }
  await page.waitForFunction((n) => window.__game?.().state.phase === n && window.__game().state.playing && !window.__game().state.breaking, phase, { timeout: 600000, polling: 500 });
  if (phase === 3) await page.evaluate(() => { window.__bot = window.__planetSteer?.('human') || window.__circle(); });
}
async function profile(cdp, ms) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  await new Promise((r) => setTimeout(r, ms));
  const { profile: p } = await cdp.send('Profiler.stop');
  const self = new Map(), byId = new Map(p.nodes.map((n) => [n.id, n]));
  let total = 0;
  p.samples.forEach((id, i) => {
    const n = byId.get(id), dt = (p.timeDeltas[i + 1] ?? 0) / 1000, cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + dt); total += dt;
  });
  // (program) is native time outside JS (on SwiftShader mostly the GL command buffer waiting on the rasterizer): reported, not ranked
  const idle = self.get('(idle) :0') || 0, prog = self.get('(program) :0') || 0, js = total - idle - prog;
  return { totalMs: Math.round(total), idleMs: Math.round(idle), programMs: Math.round(prog), jsMs: Math.round(js),
    top: [...self].filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ fn: k, ms: Math.round(v), pctJs: +(100 * v / js).toFixed(1) })) };
}
const summary = (s) => {
  const w = s.slice(1); // (the first window includes the settle)
  const avg = (k) => +(w.reduce((a, x) => a + (x[k] || 0), 0) / (w.length || 1)).toFixed(1);
  const last = s.at(-1) || {};
  return { mean: avg('mean'), p95: avg('p95'), over20: avg('over20'), draws: Math.round(avg('draws')), trisK: Math.round(avg('tris') / 1000), js: avg('js'), submit: avg('submit'),
    scriptMs: avg('scriptMs'), styleMs: avg('styleMs'), layoutMs: avg('layoutMs'), taskMs: avg('taskMs'),
    geo0: w[0]?.geo, geo1: last.geo, tex0: w[0]?.tex, tex1: last.tex, heap0: w[0]?.heapMB, heap1: last.heapMB, pr: last.pr, px: last.px, tier: last.tier };
};

const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-precise-memory-info', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const save = () => { if (arg('out')) writeFileSync(arg('out'), JSON.stringify(result, null, 1)); };
const result = { url: BASE, extra: EXTRA, secs: SECS, date: new Date().toISOString(), phases: {}, transitions: null };
for (const cfg of CONFIGS) for (const ph of (has('transitions-only') ? [] : PHASES)) {
  // --view WxH: a smaller CSS viewport (same DPR) for the per-phase pages; a full-size SwiftShader planet frame takes 10 s and more
  const view = arg('view') ? (([w, h]) => ({ width: w, height: h }))(String(arg('view')).split('x').map(Number)) : undefined;
  const { ctx, page, cdp, errors } = await open(browser, cfg, view);
  const row = { samples: [], errors, view: view ? `${view.width}x${view.height}` : null };
  try {
    await go(page, ph);
    await page.waitForTimeout(3000);
    await sample(page, cdp, SECS, row.samples);
    if (has('profile')) row.profile = await profile(cdp, 8000);
    if (ph === 3 && has('then-space')) { // --then-space: the planet's GPU memory once the cosmos takes over (what leaving a phase frees)
      await cdp.send('HeapProfiler.collectGarbage');
      const before = await page.evaluate(snap);
      await page.evaluate(() => window.__planet.ctx.enterSpace());
      await page.waitForFunction(() => window.__game().state.phase === 4, null, { timeout: 300000, polling: 500 });
      await page.waitForTimeout(4000); await cdp.send('HeapProfiler.collectGarbage');
      const after = await page.evaluate(snap);
      row.leave = { planet: { geo: before.geo, tex: before.tex, heapMB: before.heapMB }, space: { geo: after.geo, tex: after.tex, heapMB: await heap(cdp) } };
      console.log('  planet -> space:', JSON.stringify(row.leave));
    }
  } catch (e) { row.fail = String(e.message).slice(0, 300); }
  row.summary = summary(row.samples);
  (result.phases[cfg] ??= {})[ph] = row;
  save();
  console.log(cfg, 'phase', ph, JSON.stringify(row.summary), row.fail || '', errors.length ? `errors: ${errors.length}` : '');
  if (row.profile) console.log(`  profile: js ${row.profile.jsMs} ms, native ${row.profile.programMs} ms, idle ${row.profile.idleMs} ms of ${row.profile.totalMs}`, '\n' + row.profile.top.slice(0, 8).map((x) => `  ${x.pctJs}% ${x.fn}`).join('\n'));
  await ctx.close();
}
if (has('transitions') || has('transitions-only')) {
  const [tw, th] = String(arg('tview', '160x356')).split('x').map(Number);
  const { ctx, page, cdp, errors } = await open(browser, CONFIGS[0], { width: tw, height: th });
  const stages = [], tr = { stages, errors };
  const stage = async (name, secs = 16) => {
    const s = await sample(page, cdp, secs, []);
    await cdp.send('HeapProfiler.collectGarbage');
    stages.push({ name, ...summary(s), after: { ...(await page.evaluate(snap)), heapMB: await heap(cdp) } });
    result.transitions = tr; save();
    console.log('transition', name, JSON.stringify(stages.at(-1).after));
  };
  try {
    await page.goto(`${BASE}?webgl&nothumbs&fps&perfhook&seed=4242${EXTRA}`);
    await page.waitForSelector('#menu:not([hidden])', { timeout: 600000 });
    await page.evaluate(() => { document.getElementById('play').click(); window.__bot = window.__circle(); });
    await page.waitForTimeout(3000);
    await stage('1 town');
    await page.evaluate(() => window.__breakout(true));
    await page.waitForFunction(() => window.__game().state.phase === 2 && !window.__game().state.breaking, null, { timeout: 600000, polling: 500 });
    await page.evaluate(() => { window.__bot = window.__circle(); });
    await stage('2 island');
    page.evaluate(() => window.__ascend(true));
    await page.waitForFunction(() => window.__game().state.phase === 3 && !window.__game().state.asc && window.__game().state.playing, null, { timeout: 900000, polling: 1000 });
    await page.evaluate(() => { window.__bot = window.__circle(); });
    await stage('3 planet');
    await page.evaluate(() => window.__planet.ctx.enterSpace());
    await page.waitForFunction(() => window.__game().state.phase === 4, null, { timeout: 600000, polling: 500 });
    await page.evaluate(() => { window.__bot = window.__circle(); });
    await stage('4 space');
    await stage('4 space, later');
  } catch (e) { tr.fail = String(e.message).slice(0, 300); console.log('transition failed', tr.fail); }
  result.transitions = tr;
  await ctx.close();
}
await browser.close();

// markdown tables
const md = ['| config | phase | mean ms | p95 ms | % > 20 ms | game JS ms | render submit ms | style + layout ms | draws | tris k | geometries | textures | heap MB | pixel ratio |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const [cfg, ps] of Object.entries(result.phases)) for (const [ph, { summary: s, fail }] of Object.entries(ps))
  md.push(fail ? `| ${cfg} | ${ph} | failed: ${fail.slice(0, 60)} |` : `| ${cfg} | ${ph} | ${s.mean} | ${s.p95} | ${s.over20} | ${s.js} | ${s.submit} | ${s.styleMs != null ? +(s.styleMs + s.layoutMs).toFixed(2) : '-'} | ${s.draws} | ${s.trisK} | ${s.geo0}→${s.geo1} | ${s.tex0}→${s.tex1} | ${s.heap0}→${s.heap1} | ${s.pr} (${s.px}) |`);
if (result.transitions) {
  md.push('', '| stage (one page) | mean ms | geometries | textures | heap MB after GC | draws |', '|---|---|---|---|---|---|');
  for (const s of result.transitions.stages) md.push(`| ${s.name} | ${s.mean} | ${s.after.geo} | ${s.after.tex} | ${s.after.heapMB} | ${s.after.draws} |`);
}
result.markdown = md.join('\n');
console.log(result.markdown);
if (arg('out')) writeFileSync(arg('out'), JSON.stringify(result, null, 1));
if (arg('md')) writeFileSync(arg('md'), result.markdown + '\n');
