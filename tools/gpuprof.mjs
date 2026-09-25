// Relative render cost per feature (SwiftShader rasterises on the CPU, so shader/fill work shows up as frame time).
// node tools/gpuprof.mjs "<base query>" "variant1" "variant2" ...   e.g. "" "&noshafts" "&off=pom"
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [base = '', ...variants] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist'] });
for (const v of ['', ...variants]) {
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  await p.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?webgl&nothumbs&nowatch&seed=3&r=2${base}${v}`);
  await p.waitForSelector('#menu:not([hidden])', { timeout: 900000 });
  const ms = await p.evaluate(async () => {
    document.getElementById('play').click();
    const { renderer } = window.__game();
    renderer.setPixelRatio(1);
    const wait = (t) => new Promise((r) => setTimeout(r, t));
    await wait(4000); // warm-up: pipelines, grass, first shadows
    const t = [];
    let last = performance.now();
    await new Promise((res) => { const f = () => { const n = performance.now(); t.push(n - last); last = n; if (t.length < 6) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    t.sort((a, b) => a - b);
    return t[Math.floor(t.length / 2)];
  });
  console.log(`${(v || 'base').padEnd(28)} median frame ${ms.toFixed(0)} ms`);
  await p.close();
}
await b.close();
