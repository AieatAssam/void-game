// Headless balance check: node tools/botrun.mjs "<query>" seconds [sloppy]  -> prints the bot log + run economy
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [query = '', seconds = '600', sloppy = '0'] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
await p.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?bot&webgl&q=low&grass=0&nothumbs${query}`);
await p.waitForSelector('#menu:not([hidden])', { timeout: 900000 });
const out = await p.evaluate(([s, sl]) => {
  window.__sloppy = sl === '1';
  const log = window.__runBot(+s);
  const { state } = window.__game();
  return { log, econ: { ...(window.__econ?.() ?? { score: state.score, bonus: state.bonus, time: state.time }), perks: state.perks, heat: state.heat, mode: state.mode } };
}, [seconds, sloppy]);
console.log(out.log.join('\n'));
console.log('econ', JSON.stringify(out.econ));
await b.close();
