// Like probe.mjs but renders normally (no bot, no headless): node tools/probe2.mjs "<query>" "<async js expr>"
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [query = '', expr = '1'] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
await p.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?webgl&nothumbs${query}`);
await p.waitForSelector('#menu:not([hidden])', { timeout: 900000 });
console.log(JSON.stringify(await p.evaluate(async (e) => await (0, eval)(e), expr)));
await b.close();
