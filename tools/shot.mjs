// Screenshot harness for visual iteration: node tools/shot.mjs out.png "?time=golden&seed=7" [play=1] [wait=6000] [w] [h]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [out = 'shot.png', query = '', play = '1', wait = '6000', w = '1280', h = '720'] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, channel: 'chromium',
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', (m) => { if (process.env.ALL || ['error', 'warning'].includes(m.type()) || m.text().startsWith('[shot]')) console.log('console.' + m.type(), m.text().slice(0, 3000)); });
p.on('pageerror', async (e) => { console.log('pageerror', e.message.slice(0, 800)); await p.screenshot({ path: out, timeout: 600000 }); process.exit(1); });
await p.goto('http://127.0.0.1:5174/' + query, { waitUntil: 'load' });
await p.waitForSelector('#menu:not([hidden])', { timeout: 900000 });
if (play === '1') await p.evaluate(() => document.getElementById('play').click());
await p.waitForTimeout(+wait);
await p.addStyleTag({ content: '#screen,#hud,#mute,#hint,#toast,#status,#levelup,.rival-tag{display:none!important}' });
await p.waitForTimeout(1500);
await p.screenshot({ path: out, timeout: 600000 });
const fps = await p.evaluate(() => window.__fps?.() ?? null);
console.log('saved', out, 'fps', fps);
await b.close();
