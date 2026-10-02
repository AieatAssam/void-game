// Headless balance check: node tools/botrun.mjs "<query>" seconds [sloppy] [who]  -> prints the bot log + run economy
//   who = town (default: __runBot) | region (__regionBot, Phase 2) | planet (__planetBot, Phase 3; query should carry &planet, e.g. '&planet&seed=7')
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [query = '', seconds = '600', sloppy = '0', who = 'town'] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
const planet = who === 'planet';
await p.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?${planet ? '' : 'bot&'}webgl&q=low&grass=0&nothumbs${query}`);
// town / region: the menu is the "ready" signal. planet: ?planet starts straight in (no menu): wait for the world and the bot entry
if (planet) await p.waitForFunction(() => window.__planet && window.__planetBot, null, { timeout: 900000 });
else await p.waitForSelector('#menu:not([hidden])', { timeout: 900000 });
const out = await p.evaluate(([s, sl, w]) => {
  window.__sloppy = sl === '1';
  if (w === 'planet') return { log: window.__planetBot(+s, sl === '1' ? 'greedy' : 'human'), econ: { ledger: window.__game().state.ledger } };
  const log = w === 'region' ? window.__regionBot(+s) : window.__runBot(+s);
  const { state } = window.__game();
  return { log, econ: { ...(window.__econ?.() ?? { score: state.score, bonus: state.bonus, time: state.time }), perks: state.perks, heat: state.heat, mode: state.mode } };
}, [seconds, sloppy, who]);
console.log(out.log.join('\n'));
console.log('econ', JSON.stringify(out.econ));
await b.close();
