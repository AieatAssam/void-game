// Evaluate an expression in the loaded game (headless): node tools/probe.mjs "<query>" "<js expression>" [tickSeconds]
// Waits for the menu, optionally starts a run and ticks it (headless) before evaluating. Prints JSON.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [query = '', expr = '1', ticks = '0'] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 500)));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console.' + m.type(), m.text().slice(0, 400)); });
await p.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?bot&webgl&q=low&grass=0&nothumbs${query}`);
await p.waitForSelector('#menu:not([hidden])', { timeout: 900000 });
const out = await p.evaluate(async ([e, t]) => {
  if (+t > 0) { window.__headless = true; document.getElementById('play').click(); window.__tick(1 / 30, Math.round(+t * 30)); }
  return await (0, eval)(e);
}, [expr, ticks]);
console.log(JSON.stringify(out, null, 1));
await b.close();
