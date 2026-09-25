// Draw calls + triangles (incl. shadow pass) after a few seconds of play: node tools/perf.mjs "<query>" [waitMs]
// Renders through the real loop (not headless), so numbers match the ?fps overlay. Use PORT for another server.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [query = '', wait = '15000'] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?webgl&nothumbs${query}`);
await p.waitForSelector('#menu:not([hidden])', { timeout: 900000 });
await p.evaluate(() => document.getElementById('play').click());
await p.waitForTimeout(+wait);
const info = await p.evaluate(() => ({ ...window.__info(), mood: window.__game().city.mood.name, r: +window.__game().hole.r.toFixed(2) }));
console.log(JSON.stringify(info));
await b.close();
