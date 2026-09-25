// Mouse-control check: point the real mouse at edible things near the hole and see whether they get swallowed.
// node tools/mousetest.mjs "<query>" [targets=6]   (game time is stepped headlessly, so it runs the same without a GPU)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [query = '', n = '6'] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
await p.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?webgl&nothumbs&q=low&grass=0${query}`);
await p.waitForSelector('#menu:not([hidden])', { timeout: 900000 });
await p.evaluate(() => { document.getElementById('play').click(); window.__headless = true; window.__tick(1 / 30, 30); });
let ok = 0;
for (let i = 0; i < +n; i++) {
  // pick an edible target 3-12 m away and aim the mouse at it (re-projected every 150 ms, like a player tracking it)
  const t = await p.evaluate(() => {
    const { hole, city, state } = window.__game();
    if (!state.playing) return null;
    const c = city.entities.filter((e) => e.alive && !e.falling && !e.noSwallow && e.meta.kind === 'prop' && e.meta.tier < hole.r * 0.9 && e.meta.tier > hole.r * 0.1)
      .map((e) => [e, Math.hypot(e.x - hole.x, e.z - hole.z)]).filter(([, d]) => d > 3 && d < 12).sort((a, b) => a[1] - b[1]);
    if (!c.length) return null;
    window.__mt = c[0][0];
    return { name: c[0][0].name, d: +c[0][1].toFixed(1), r: +hole.r.toFixed(2) };
  });
  if (!t) { console.log('no target'); break; }
  let eaten = false, steps = 0;
  while (steps < 48) { // up to 8 s of game time, re-aiming every 1/6 s like a player tracking it
    steps++;
    const s = await p.evaluate(() => {
      const e = window.__mt, { camera } = window.__game();
      const v = new camera.position.constructor(e.x, 0.3, e.z).project(camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, gone: !e.alive || e.falling };
    });
    if (s.gone) { eaten = true; break; }
    await p.mouse.move(s.x, s.y);
    await p.evaluate(() => window.__tick(1 / 30, 5));
  }
  ok += eaten;
  console.log(`${eaten ? 'ate ' : 'MISS'} ${t.name} d=${t.d} r=${t.r} in ${(steps / 6).toFixed(1)} s game time`);
}
console.log(`${ok}/${n} swallowed`);
await b.close();
