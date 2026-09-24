// Contact sheet from the showroom: node tools/sheet.mjs out.jpg "name1,name2" [cols] [cell] [dirsJSON] [ref]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const [out = 'sheet.jpg', names = '', cols = '4', cell = '384', dirs = 'null', ref = ''] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 500)));
await p.goto('http://127.0.0.1:5174/gallery.html?packs&webgl&q=high');
await p.waitForFunction(() => window.__sheet, null, { timeout: 900000 });
await p.waitForTimeout(3000);
const url = await p.evaluate(([n, c, s, d, r]) => { if (r) window.__sheetRef = r; return window.__sheet(n.split(','), +c, +s, JSON.parse(d)); }, [names, cols, cell, dirs, ref]);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('saved', out);
await b.close();
