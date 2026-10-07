import assert from 'node:assert/strict';
import { chromium, channel } from './browser.mjs';

const browser = await chromium.launch({ headless: true, channel, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`); });

try {
  await page.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?planet&q=low&webgl&nowatch&nothumbs&seed=7&time=golden`);
  await page.waitForFunction(() => window.__planet?.run && window.__threat?.t && window.__game().state.playing, null, { timeout: 180000 });
  const served = await page.evaluate(async () => (await fetch('/src/threat.js')).text());
  assert.match(served, /mercyEvents/);

  const result = await page.evaluate(() => {
    const th = window.__threat.t, { hole, state } = window.__game();
    const reset = () => { th.clear(); hole.area = 1; state.mods = null; state.ng = false; state.gRate = 0; };

    reset();
    for (let i = 0; i < 30; i++) { th.t = i / 100; th.hurt(0.005, 'check', 'check'); }
    const entries = th.mercyEvents.length - th.mercyHead;
    const retainedSum = th.mercySum();

    reset();
    for (let i = 1; i <= 720; i++) { th.t = i / 60; th.hurtCont(0.02, 1 / 60, 'check', 'laser', 0); }
    const longLaserEntries = th.mercyEvents.length - th.mercyHead;
    const longLaserSum = th.mercySum();
    const longLaserDirect = th.hurt(0.049, 'check', 'check');
    const longLaserAfterDirect = th.mercySum();

    reset();
    th.mercyPush(0.24);
    th.cont.laser = { t: 0, hint: -9, fxAcc: 0 };
    for (let i = 1; i <= 8; i++) { th.t = i / 60; th.hurtCont(0.02, 1 / 60, 'check', 'laser', 0); }
    const combinedBeforeDirect = th.mercySum();
    th.t = 9 / 60;
    const directAfterContinuous = th.hurt(0.01, 'check', 'check');
    const combinedAfterDirect = th.mercySum();

    reset();
    th.hurt(0.1, 'check', 'check');
    th.t = 29.999;
    const beforeExpiry = th.mercySum();
    th.t = 30;
    const atExpiry = th.mercySum();
    const emptyTotal = th.mercyTotal;

    th.mercyPush(0.1);
    th.cont.laser = { t: th.t, hint: -9, fxAcc: 0 };
    th.clear();
    const afterClear = { sum: th.mercySum(), events: th.mercyEvents.length, head: th.mercyHead, cont: Object.keys(th.cont).length };
    hole.area = 1;
    state.mods = null; state.ng = false; state.gRate = 0;
    const acceptedAfterClear = th.hurt(0.25, 'check', 'check');
    return { entries, retainedSum, longLaserEntries, longLaserSum, longLaserDirect, longLaserAfterDirect, combinedBeforeDirect, directAfterContinuous, combinedAfterDirect, beforeExpiry, atExpiry, emptyTotal, afterClear, acceptedAfterClear };
  });

  assert.equal(result.entries, 30, 'all 30 accepted hits should remain in the window');
  assert.ok(Math.abs(result.retainedSum - 0.15) < 1e-9, `30 hits should total 15%, got ${result.retainedSum}`);
  assert.equal(result.longLaserEntries, 720, 'all accepted laser ticks should remain in the 30 s window');
  assert.ok(Math.abs(result.longLaserSum - 0.24) < 1e-9, `12 s laser window should total 24%, got ${result.longLaserSum}`);
  assert.equal(result.longLaserDirect, 0, 'a 4.9% direct hit must be rejected after the 12 s laser');
  assert.ok(result.longLaserAfterDirect <= 0.25 + 1e-9, 'the full laser window plus direct hit must stay under 25%');
  assert.ok(result.combinedBeforeDirect <= 0.25 + 1e-9, 'continuous ticks must fit under the mercy cap');
  assert.equal(result.directAfterContinuous, 0, 'a discrete hit must see still-pending continuous damage');
  assert.ok(result.combinedAfterDirect <= 0.25 + 1e-9, 'combined accepted damage must not exceed 25%');
  assert.equal(result.beforeExpiry, 0.1, 'damage remains before the 30 s expiry');
  assert.equal(result.atExpiry, 0, 'damage expires at exactly 30 s');
  assert.equal(result.emptyTotal, 0, 'expiry must clear floating point residue');
  assert.deepEqual(result.afterClear, { sum: 0, events: 0, head: 0, cont: 0 }, 'clear must reset every mercy ledger');
  assert.equal(result.acceptedAfterClear, 0.25, 'a cleared ledger must allow a fresh full cap');
  assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
