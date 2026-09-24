import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [out, query, variant = '0'] = process.argv.slice(2);
const V = [
  { channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] },
  { channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] },
  { channel: undefined, args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--enable-features=Vulkan', '--use-vulkan=swiftshader'] },
  { channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--in-process-gpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader'] },
  { channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-dawn-features=allow_unsafe_apis', '--use-webgpu-adapter=swiftshader', '--disable-dawn-features=disallow_unsafe_apis', '--use-gl=angle', '--use-angle=swiftshader-webgl'] },
][+variant];
const b = await chromium.launch({ headless: true, ...V });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('console', (m) => { const t = m.text(); if (!/GPU stall|GroupMarker|vite|experimental/.test(t)) console.log(m.type(), t.slice(0, 400)); });
p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 400)));
p.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
await p.goto('http://127.0.0.1:5174/test.html' + query);
await p.waitForTimeout(+(process.env.WAIT || 20000));
await p.screenshot({ path: out });
await b.close();
