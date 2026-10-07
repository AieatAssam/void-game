// Live regression checks for control response and wall-time movement.
// Start Vite first: npm run dev -- --host 127.0.0.1 --port 5174
import assert from 'node:assert/strict';
import { chromium, channel } from './browser.mjs';

const browser = await chromium.launch({ headless: true, channel, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const url = (q) => `http://127.0.0.1:${process.env.PORT || 5174}/${q}`;
const near = (a, b, pct, label) => assert.ok(Math.abs(a - b) <= Math.max(0.02, Math.max(a, b) * pct), `${label}: ${a.toFixed(3)} vs ${b.toFixed(3)}`);

try {
  await page.goto(url('?webgl&nothumbs&q=low&grass=0&nomagnet&noarmy&nothreat&nowatch&seed=3&nofinale'));
  await page.waitForSelector('#menu:not([hidden])');
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__game?.().state.playing);
  await page.evaluate(() => {
    window.__headless = true; window.__pause = true;
    const { hole: h, state: s } = window.__game();
    h.area = Math.PI * 0.4 ** 2; h.x = h.z = h.sx = h.sz = 0;
    s.phase = 1; s.draft = null; s.hitstop = 0; s.slowmo = 1; s.breakoutSlowmo = null;
    s.mods.speed = 1; s.kick = { x: 0, z: 0 };
    window.dispatchEvent(new Event('blur'));
  });

  // Keyboard responds quickly, reverses inside a turn interval, and neutral releases immediately.
  await page.keyboard.down('d');
  await page.evaluate(() => window.__tick(1 / 60, 5));
  const forward = await page.evaluate(() => { const h = window.__game().hole; return [h.sx, h.sz]; });
  assert.ok(Math.hypot(...forward) > 0.7, `keyboard start was sluggish at 83 ms: ${forward}`);
  await page.keyboard.up('d'); await page.keyboard.down('a');
  await page.evaluate(() => window.__tick(1 / 60, 5));
  const reverse = await page.evaluate(() => { const h = window.__game().hole; return [h.sx, h.sz]; });
  assert.ok(reverse[0] * forward[0] < 0, `reversal did not take: ${forward} -> ${reverse}`);
  await page.keyboard.up('a');
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.__tick(1 / 60, 1); });
  assert.deepEqual(await page.evaluate(() => [window.__game().hole.sx, window.__game().hole.sz]), [0, 0], 'release/blur must stop motion immediately');

  const travel = async (kind) => {
    await page.evaluate((mode) => {
      const { hole: h, state: s } = window.__game();
      h.x = h.z = h.sx = h.sz = 0; h.area = Math.PI * 0.4 ** 2;
      s.kick = { x: 0, z: 0 }; s.hitstop = mode === 'hitstop' ? 1 : 0;
      s.slowmo = mode === 'slowmo' ? 0.3 : 1; s.breakoutSlowmo = null; s.draft = null;
    }, kind);
    await page.keyboard.down('d');
    await page.evaluate(() => window.__tick(1 / 60, 30));
    await page.keyboard.up('d'); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    return page.evaluate(() => { const h = window.__game().hole; return Math.hypot(h.x, h.z); });
  };
  const healthy = await travel('healthy'), hitstop = await travel('hitstop'), slowmo = await travel('slowmo');
  near(hitstop, healthy, 0.03, 'hitstop travel'); near(slowmo, healthy, 0.03, 'slowmo travel');

  await page.evaluate(() => {
    const { hole: h, state: s } = window.__game(); h.x = h.z = h.sx = h.sz = 0; s.draft = ['pause']; s.time = 12;
  });
  await page.keyboard.down('d'); await page.evaluate(() => window.__tick(1 / 60, 30)); await page.keyboard.up('d');
  assert.deepEqual(await page.evaluate(() => { const { hole: h, state: s } = window.__game(); return [h.x, h.z, s.time]; }), [0, 0, 12], 'draft must pause movement and game time');
  const townBite = await page.evaluate(() => {
    const { hole: h, city: c } = window.__game();
    const e = c.entities.find((q) => q.alive && !q.falling && !q.noSwallow && q.meta.tier < h.r * 0.95);
    if (!e) throw new Error('no swallowable town entity for pause check');
    e.x = h.x; e.z = h.z; e.mover = null;
    window.__tick(1 / 60, 3);
    return e.alive && !e.falling;
  });
  assert.equal(townBite, true, 'draft must suppress town/region collision and swallow updates');
  await page.evaluate(() => { window.__game().state.draft = null; window.dispatchEvent(new Event('blur')); });

  // Exercise captured touch pointers using actual browser-generated PointerEvents.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const box = await page.locator('canvas').first().boundingBox();
  assert.ok(box, 'game canvas not found');
  const center = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  const touch = (x, y, id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(center.x, center.y, 1)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(center.x + 70, center.y, 1)] });
  await page.evaluate(() => window.__tick(1 / 60, 5));
  const touchStart = await page.evaluate(() => Math.hypot(window.__game().hole.sx, window.__game().hole.sz));
  assert.ok(touchStart > 0.65 && touchStart < 0.78, `touch response at 83 ms did not match the fixed turn curve: ${touchStart}`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(center.x + 70, center.y, 1), touch(center.x, center.y, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(center.x + 70, center.y, 1), touch(center.x, center.y + 90, 2)] });
  await page.evaluate(() => window.__tick(1 / 60, 2));
  const multi = await page.evaluate(() => [window.__game().hole.sx, window.__game().hole.sz]);
  assert.ok(multi[0] > 0.77 && Math.abs(multi[1]) < 0.1, `secondary touch hijacked active stick: ${multi}`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.evaluate(() => window.__tick(1 / 60, 1));
  assert.deepEqual(await page.evaluate(() => [window.__game().hole.sx, window.__game().hole.sz]), [0, 0], 'touch cancel must clear stick');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });

  // Phase 3: radius does not change turn response, normalized travel or wound movement speed.
  await page.goto(url('?planet&r=40000&webgl&nothumbs&q=low&nomap&nowatch&noworker&noarmy&nofinale&seed=7'));
  await page.waitForFunction(() => !!window.__planet, null, { timeout: 900000 });
  await page.evaluate(() => { window.__headless = true; window.__pause = true; });
  const planetPause = await page.evaluate(() => {
    const P = window.__planet, { state } = P.ctx, B = P.W.bite, lf = B.lf;
    let job = null;
    for (let L = 1; L <= 4 && !job; L++) for (let u = 1; u < lf.lv[L].n; u++) {
      if (lf.lv[L].left[u] > 1e-6 && lf.parcels(L, u).some((pk) => !B.ptear[pk] && lf.lv[0].left[pk] > 1e-6)) {
        job = B.startTear(L, u, P.W.hdir, 'tear');
        if (job) break;
      }
    }
    if (!job) throw new Error('no tear job available for planet pause check');
    const before = { sum: B.sum, next: job.next, events: B.events.length, time: state.time };
    state.draft = ['pause'];
    window.__tick(1 / 60, 5);
    return { before, after: { sum: B.sum, next: job.next, events: B.events.length, time: state.time } };
  });
  assert.deepEqual(planetPause.after, planetPause.before, `draft must pause planet bites and tear work: ${JSON.stringify(planetPause)}`);
  await page.evaluate(() => { window.__game().state.draft = null; });
  const p3 = await page.evaluate(async () => {
    const P = window.__planet, { R } = await import('/src/planetgen.js'), { growthK } = await import('/src/phase3.js');
    const run = (r, wound = 0) => {
      P.reset(); P.setR(r);
      const before = P.W.hdir.clone(), h = P.ctx.hole;
      P.ctx.state.wound = wound; P.ctx.state.stun = 0; P.ctx.state.ash = false; P.ctx.state.slow = 0;
      P.run(5, () => [1, 0], 1 / 60);
      const distance = before.angleTo(P.W.hdir) * R;
      return { response: h.sx, travel: distance / r, woundSpeed: Math.hypot(h.vx, h.vz) / r };
    };
    return { small: run(40000), large: run(1200000), wounded: run(40000, 0.9), growth: [growthK({}), growthK({ wound: 0.9 })] };
  });
  assert.ok(p3.small.response > 0.7 && p3.large.response > 0.7, `Phase 3 turn response at 83 ms: ${JSON.stringify(p3)}`);
  assert.ok(p3.small.travel > 0.03 && p3.large.travel > 0.03, `Phase 3 travel was blocked: ${JSON.stringify(p3)}`);
  near(p3.small.response, p3.large.response, 0.01, 'Phase 3 turn response across radii');
  near(p3.small.travel, p3.large.travel, 0.08, 'Phase 3 normalized travel across radii');
  near(p3.small.woundSpeed, p3.wounded.woundSpeed, 0.08, 'wound movement speed');
  assert.ok(p3.growth[1] < p3.growth[0], `wound must affect growth credit only: ${p3.growth}`);
  const tearPulse = await page.evaluate(() => {
    const { game, ctx } = window.__planet, el = document.getElementById('size');
    game.tearAnticipateAt = -9;
    ctx.sfx.tearAnticipate = () => {}; // keep this check silent
    game.swallow({ type: 'accepted', kind: 'tear', L: 2, u: -1, area0: 1e6, rEq: ctx.hole.r * 0.5 }, ctx);
    const afterAccepted = el.classList.contains('anticipate');
    game.swallow({ type: 'start', kind: 'tear', L: 0, u: -2, area0: 1, rEq: 0 }, ctx);
    return { afterAccepted, afterUnrelatedStart: el.classList.contains('anticipate') };
  });
  assert.deepEqual(tearPulse, { afterAccepted: true, afterUnrelatedStart: true }, `unrelated parcel starts must not cancel the large-tear cue: ${JSON.stringify(tearPulse)}`);
  assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ keyboard: 'pass', distance: { healthy, hitstop, slowmo }, draft: 'pass', pointer: 'pass', phase3: p3, tearPulse, errors }));
} finally {
  await browser.close();
}
