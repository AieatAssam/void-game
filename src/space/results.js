// Phase 4 results (docs/PHASE4.md): shown when the universe is eaten. The numbers, the time each tier took, six stars, the dust banked and the best times. Dev runs (bots, test flags) bank nothing.
import { save, persist } from '../meta.js';
import { devRun } from '../progress.js';
import { TIERS } from './tiers.js';
import { MUTATORS, LEGACY, offers } from './modes.js';

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const STARS = [
  ['The universe in under 30 minutes', (s, t) => t < 1800],
  ['A 60-chain', (s) => s.peakChain >= 60],
  ['Eat six rival holes', (s) => s.rivalsEaten >= 6],
  ['Never bitten by a rival', (s) => s.bites === 0],
  ['Dodge 20 flares, take at most 3 hits', (s) => s.flaresDodged >= 20 && s.flareHits <= 3],
  ['Collect 25 power-ups', (s) => s.powerups >= 25],
];
const CSS = `#spres{position:fixed;inset:0;z-index:41;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 40%,#0a0420cc,#020108f2);font-family:system-ui,sans-serif;color:#eef0ff;padding:16px;overflow:auto;animation:spin 1.4s ease}
@keyframes spin{from{opacity:0}to{opacity:1}}
#spres .pn{width:min(860px,100%);display:grid;gap:16px;padding:24px 28px;border-radius:22px;background:linear-gradient(#150a30dd,#0b0620ee);box-shadow:0 0 0 1px #ffffff14,0 30px 80px #000a}
#spres h1{margin:0;font:300 clamp(22px,4vw,42px)/1.05 system-ui;letter-spacing:.3em;padding-left:.3em;text-align:center;text-shadow:0 0 30px #8a5cff88}
#spres .sub{text-align:center;font:600 11px system-ui;letter-spacing:.28em;color:#9d99d0;text-transform:uppercase;margin-top:-8px}
#spres .big{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
#spres .big div{padding:12px;border-radius:14px;background:#ffffff0a;box-shadow:0 0 0 1px #ffffff12;text-align:center}
#spres .big b{display:block;font:700 clamp(18px,2.8vw,28px)/1.1 system-ui;color:#fff}#spres .big small{font:600 10px system-ui;letter-spacing:.2em;color:#9d99d0;text-transform:uppercase}
#spres h3{margin:0 0 8px;font:700 11px system-ui;letter-spacing:.24em;color:#a79fe8;text-transform:uppercase}
#spres .tiers{display:flex;height:28px;border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px #ffffff14}
#spres .tiers i{display:flex;align-items:center;justify-content:center;font:700 10px system-ui;letter-spacing:.08em;color:#fff;white-space:nowrap;overflow:hidden}
#spres .two{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:700px){#spres .two{grid-template-columns:1fr}}
#spres .st{display:grid;gap:5px;font:500 13px system-ui}#spres .st i{font-style:normal;color:#7c78a8}#spres .st i.on{color:#ffe08a}#spres .st i.new{text-shadow:0 0 12px #ffcf5a}
#spres .rows{display:grid;grid-template-columns:1fr auto;gap:4px 14px;font:500 13px system-ui}#spres .rows span:nth-child(even){text-align:right;font-weight:800;color:#fff}
#spres .perks{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}#spres .perks button{font:inherit;text-align:left;padding:10px 12px;border-radius:12px;border:1.5px solid #ffffff22;background:#ffffff08;color:#e9e6ff;cursor:pointer}#spres .perks button b{display:block;font-size:13px}#spres .perks button small{font-size:11px;color:#a8a4d6}#spres .perks button.on{border-color:#c9a8ff;background:#4a2cc044}
#spres .go{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
#spres .go button{font:800 14px system-ui;letter-spacing:.12em;text-transform:uppercase;min-height:44px;padding:11px 24px;border-radius:999px;border:1.5px solid #8a7cff99;background:#120a2acc;color:#e8dcff;cursor:pointer}
#spres .go button.pri{background:linear-gradient(#6a48e8,#4a2cc0);border-color:#c9a8ff;color:#fff}`;

/** Score and bank a finished (or abandoned at the end) run; returns the numbers the panel shows. */
export function scoreSpace(g, time) {
  const s = g.stats, mask = STARS.reduce((m, [, ok], i) => m | (ok(s, time) ? 1 << i : 0), 0), nStars = STARS.filter((_, i) => mask >> i & 1).length;
  const parts = { universe: 250, tiers: 20 * s.tierTimes.length, rivals: 10 * s.rivalsEaten, powerups: 3 * s.powerups, stars: Math.round(40 * nStars * (g.k?.starPay || 1)) };
  const dust = Object.values(parts).reduce((a, b) => a + b, 0), dev = devRun() || g.devUsed || /[?&](bot|tier|simx)\b/.test(location.search); // (a bot, a skipped tier or a debug hook: practice, nothing is banked)
  const before = save.cosmos?.stars | 0, c = save.cosmos ??= { runs: 0, fastest: 0, stars: 0 };
  let record = false;
  if (!dev) { c.runs++; if (g.daily) { const k = String(g.seed); c.daily ??= {}; if (!c.daily[k] || time < c.daily[k]) { c.daily[k] = Math.round(time); record = true; } } else if (!c.fastest || time < c.fastest) { c.fastest = Math.round(time); record = true; } c.stars |= mask; save.dust = (save.dust || 0) + dust; persist(); }
  return { mask, before, nStars, parts, dust: dev ? 0 : dust, record, dev, best: c.fastest };
}

export function showSpaceResults(g, ctx, { onAgain, onMenu }) {
  const time = ctx.state.time, R = scoreSpace(g, time), s = g.stats;
  document.getElementById('spres')?.remove();
  const st = document.createElement('style'); st.textContent = CSS;
  const el = document.createElement('div'); el.id = 'spres';
  const total = s.tierTimes.reduce((a, b) => a + b, 0) || 1, hue = (i) => `hsl(${250 + i * 9}deg 55% ${36 + (i % 2) * 6}%)`;
  el.innerHTML = `<div class="pn"><h1>THE UNIVERSE IS CONSUMED</h1><div class="sub">${g.daily ? 'daily universe · ' : ''}${g.mut && g.mut !== 'none' ? MUTATORS[g.mut].name + ' · ' : ''}${R.record ? 'new fastest · ' : ''}${R.dev ? 'practice run · nothing banked' : `+${R.dust} void dust`}</div>
  <div class="big"><div><b>${fmt(time)}</b><small>time</small></div><div><b>${g.swallowed.toLocaleString('en')}</b><small>swallowed</small></div><div><b>${s.peakChain}</b><small>best chain</small></div><div><b>${s.rivalsEaten}</b><small>rivals eaten</small></div><div><b>${s.flaresDodged}/${s.flaresDodged + s.flareHits}</b><small>flares dodged</small></div><div><b>${s.powerups}</b><small>power-ups</small></div><div><b>${s.golds | 0}</b><small>golden</small></div></div>
  <div><h3>Time per tier</h3><div class="tiers">${s.tierTimes.map((t, i) => `<i style="flex:${t};background:${hue(i)}" title="${TIERS[i].name} ${fmt(t)}">${t / total > 0.07 ? TIERS[i].name : ''}</i>`).join('')}</div></div>
  <div class="two"><div><h3>Stars · ${R.nStars}/${STARS.length}</h3><div class="st">${STARS.map(([t], i) => `<i class="${R.mask >> i & 1 ? 'on' : ''}${(R.mask >> i & 1) && !(R.before >> i & 1) && !R.dev ? ' new' : ''}">${R.mask >> i & 1 ? '★' : '☆'} ${t}</i>`).join('')}</div></div>
  <div><h3>Pay</h3><div class="rows">${Object.entries(R.parts).map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}<span>best time</span><span>${R.best ? fmt(R.best) : '-'}</span></div></div></div>
  <div><h3>Carry one into the next universe</h3><div class="perks">${offers(g.seed || 7).map((id) => `<button data-id="${id}"><b>${LEGACY[id].name}</b><small>${LEGACY[id].blurb}</small></button>`).join('')}</div></div>
  <div class="go"><button class="pri" id="spagain">Begin again</button><button id="spmenu">Menu</button></div></div>`;
  el.prepend(st);
  document.body.appendChild(el);
  let pick = null;
  for (const b of el.querySelectorAll('.perks button')) b.onclick = () => { pick = b.dataset.id; for (const o of el.querySelectorAll('.perks button')) o.classList.toggle('on', o === b); };
  el.querySelector('#spagain').onclick = () => { if (pick && !R.dev) { (save.cosmos ??= {}).legacy = pick; persist(); } onAgain(pick); }; el.querySelector('#spmenu').onclick = onMenu;
  return el;
}
