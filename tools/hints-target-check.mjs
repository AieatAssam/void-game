import assert from 'node:assert/strict';
import { chromium, channel } from './browser.mjs';

const browser = await chromium.launch({ headless: true, channel, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.addInitScript(() => localStorage.setItem('void-hole-city-v1', JSON.stringify({ dust: 0, levels: {}, best: 0, daily: {} })));
  await page.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?seed=7&time=golden&nothumbs&q=low`);
  await page.waitForSelector('#menu:not([hidden])', { timeout: 180000 });
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__game?.().state.playing, null, { timeout: 180000 });

  const result = await page.evaluate(() => {
    const g = window.__game(), key = 'void-hole-city-v1';
    g.state.time = 31;
    window.__tick(0);
    const savedAt31 = JSON.parse(localStorage.getItem(key) || '{}').hinted === true;
    g.state.time = 46;
    window.__tick(0);
    const savedAt46 = JSON.parse(localStorage.getItem(key) || '{}').hinted === true;

    const oldPhase = g.state.phase, oldTime = g.state.time;
    g.state.phase = 2;
    const chosen = { x: 1, z: 0, r: 1, left: 1 };
    const next = { x: 2, z: 0, r: 1, left: 1 };
    let calls = 0, candidate = chosen;
    g.city.target = () => { calls++; return candidate; };
    g.city.targetScore = (q) => q === chosen && !q.left ? 0 : 1;
    const cadence = {};
    for (const hz of [15, 30, 60]) {
      calls = 0;
      g.state.target = null;
      g.state.targetAt = undefined;
      const at = [];
      for (let i = 0; i < hz * 2; i++) {
        g.state.time = i / hz;
        window.__nextSettlement();
        if (calls > at.length) at.push(g.state.time);
      }
      cadence[hz] = at;
    }
    g.state.target = chosen;
    g.state.time = 10;
    g.state.targetAt = 11;
    candidate = next;
    const beforeInvalidRefresh = calls;
    chosen.left = 0;
    const refreshed = window.__nextSettlement() === next;
    const invalidRefreshCalls = calls - beforeInvalidRefresh;
    g.state.phase = oldPhase;
    g.state.time = oldTime;
    return { savedAt31, savedAt46, cadence, refreshed, invalidRefreshCalls };
  });

  assert.equal(result.savedAt31, false, 'hints must remain available after the first three finish');
  assert.equal(result.savedAt46, true, 'hint completion persists after the final hint');
  for (const hz of [15, 30, 60]) {
    const times = result.cadence[hz];
    assert.ok(times.length >= 6 && times.length <= 7, `${hz} Hz: expected about six rescoring decisions in two seconds, got ${times.length}`);
    for (let i = 1; i < times.length; i++) {
      const interval = times[i] - times[i - 1];
      assert.ok(interval >= 1 / 3 - 1e-6 && interval <= 1 / 3 + 1 / hz + 1e-6, `${hz} Hz: unexpected decision interval ${interval}`);
    }
  }
  assert.equal(result.refreshed, true, 'an invalid current target is replaced immediately');
  assert.equal(result.invalidRefreshCalls, 1, 'invalid target bypasses the deadline');
  assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);

  const migratedPage = await browser.newPage({ viewport: { width: 640, height: 400 } });
  migratedPage.on('pageerror', (error) => errors.push(error.message));
  await migratedPage.addInitScript(() => localStorage.setItem('void-hole-city-v1', JSON.stringify({ dust: 0, levels: {}, best: 0, daily: {}, hinted: true })));
  await migratedPage.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?seed=7&time=golden&nothumbs&q=low`);
  await migratedPage.waitForSelector('#menu:not([hidden])', { timeout: 180000 });
  await migratedPage.locator('#play').click();
  await migratedPage.waitForFunction(() => window.__game?.().state.playing, null, { timeout: 180000 });
  const migrated = await migratedPage.evaluate(() => {
    const g = window.__game();
    g.state.time = 31;
    window.__tick(0);
    const mid = JSON.parse(localStorage.getItem('void-hole-city-v1'));
    g.state.time = 46;
    window.__tick(0);
    const done = JSON.parse(localStorage.getItem('void-hole-city-v1'));
    return { midHinted: mid.hinted, version: mid.hintsV, doneHinted: done.hinted };
  });
  assert.equal(migrated.midHinted, false, 'legacy completion is cleared until the 45 s hint is shown');
  assert.equal(migrated.version, 2, 'legacy progress migration is persisted');
  assert.equal(migrated.doneHinted, true, 'legacy users complete after the final hint');
  assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
  console.log('hint completion and settlement cadence checks passed', JSON.stringify(result));
} finally {
  await browser.close();
}
