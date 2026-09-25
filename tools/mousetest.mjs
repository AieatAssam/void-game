// Mouse-control check: point the real mouse at edible things near the hole and see whether they get swallowed.
// node tools/mousetest.mjs "<query>" [targets=6] [sloppy=0]  (sloppy: static targets, aim 4 m past with the rim MISS m wide, default 0.15)   (game time is stepped headlessly, so it runs the same without a GPU)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [query = '', n = '6', sloppy = '0'] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
await p.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?webgl&nothumbs&q=low&grass=0${query}`);
await p.waitForSelector('#menu:not([hidden])', { timeout: 900000 });
await p.evaluate(() => { document.getElementById('play').click(); window.__headless = true; window.__tick(1 / 30, 30); });
let ok = 0;
for (let i = 0; i < +n; i++) {
  // pick an edible target 3-12 m away and aim the mouse at it (re-projected every 150 ms, like a player tracking it)
  const t = await p.evaluate((sl) => {
    const { hole, city, state } = window.__game();
    if (!state.playing) return null;
    const c = city.entities.filter((e) => e.alive && !e.falling && !e.noSwallow && e.meta.kind === 'prop' && e.meta.tier < hole.r * 0.9 && e.meta.tier > hole.r * 0.1 && (!sl || !e.mover))
      .map((e) => [e, Math.hypot(e.x - hole.x, e.z - hole.z)]).filter(([, d]) => d > 3 && d < 12).sort((a, b) => a[1] - b[1]);
    if (!c.length) return null;
    window.__mt = c[0][0];
    window.__mtDir = null;
    return { name: c[0][0].name, d: +c[0][1].toFixed(1), r: +hole.r.toFixed(2) };
  }, sloppy === '1');
  if (!t) { console.log('no target'); break; }
  let eaten = false, steps = 0;
  while (steps < 48) { // up to 8 s of game time, re-aiming every 1/6 s like a player tracking it
    steps++;
    const s = await p.evaluate(([sl, miss]) => {
      const e = window.__mt, { camera, hole } = window.__game();
      let ax = e.x, az = e.z;
      if (sl) { // a hurried player: the course runs just wide of the target and the cursor sits well past it
        if (!window.__mtDir) { const dx = e.x - hole.x, dz = e.z - hole.z, d = Math.hypot(dx, dz) || 1; window.__mtDir = [dx / d, dz / d]; }
        const [ux, uz] = window.__mtDir, side = hole.r + miss;
        ax = e.x + ux * 4 - uz * side; az = e.z + uz * 4 + ux * side;
      }
      const v = new camera.position.constructor(ax, 0.3, az).project(camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, gone: !e.alive || e.falling };
    }, [sloppy === '1', +(process.env.MISS || 0.15)]);
    if (s.gone) { eaten = true; break; }
    await p.mouse.move(s.x, s.y);
    await p.evaluate(() => window.__tick(1 / 30, 5));
  }
  ok += eaten;
  console.log(`${eaten ? 'ate ' : 'MISS'} ${t.name} d=${t.d} r=${t.r} in ${(steps / 6).toFixed(1)} s game time`);
}
console.log(`${ok}/${n} swallowed`);
await b.close();
