// The Phase 3 results screen (docs/PHASE3.md 4.4, 12.13): what a world was. Opens from the finale's card (or on its own when the finale could not play). A glass panel over the
// black hole (or the dead globe): the headline numbers, the land eaten over time with the tiers marked, the time each tier took, the set pieces, the six world stars, the legacy
// (worlds eaten, records, the skin unlocked) and the New World choice: one legacy perk of three carries over.
import { save, persist } from './meta.js';
import { PERKS, offerPerks } from './perks.js';

const CSS = `
#wres{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 40%,#0a0420cc,#020108ee);font-family:system-ui,sans-serif;color:#e9e6ff;animation:wresin .8s ease both;overflow:auto;padding:18px;box-sizing:border-box}
@keyframes wresin{from{opacity:0}to{opacity:1}}
#wres .pn{width:min(880px,100%);display:grid;gap:18px;padding:26px 30px 24px;border-radius:22px;background:linear-gradient(#150a30dd,#0b0620ee);box-shadow:0 0 0 1px #8a7cff44,0 30px 90px #000a,0 0 80px #5a38d044 inset}
#wres h1{margin:0;font:300 clamp(22px,4.2vw,44px)/1.05 system-ui,sans-serif;letter-spacing:.3em;padding-left:.3em;text-align:center;text-shadow:0 0 30px #8a5cff66}
#wres .sub{text-align:center;font:600 11px system-ui;letter-spacing:.28em;color:#9d99d0;text-transform:uppercase;margin-top:-8px}
#wres .big{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
#wres .big div{padding:12px 14px;border-radius:14px;background:#ffffff0a;box-shadow:0 0 0 1px #ffffff12;text-align:center}
#wres .big b{display:block;font:700 clamp(20px,3vw,30px)/1.1 system-ui;color:#fff}#wres .big small{font:600 10px system-ui;letter-spacing:.2em;color:#9d99d0;text-transform:uppercase}
#wres .two{display:grid;grid-template-columns:1.3fr 1fr;gap:18px}@media(max-width:700px){#wres .two{grid-template-columns:1fr}}
#wres h3{margin:0 0 8px;font:700 11px system-ui;letter-spacing:.24em;color:#a79fe8;text-transform:uppercase}
#wres svg{width:100%;height:auto;display:block}
#wres .tiers{display:flex;height:26px;border-radius:8px;overflow:hidden;margin-top:10px;box-shadow:0 0 0 1px #ffffff14}
#wres .tiers i{display:flex;align-items:center;justify-content:center;font:700 10px system-ui;letter-spacing:.1em;color:#fff;white-space:nowrap;overflow:hidden}
#wres .rows{display:grid;grid-template-columns:1fr auto;gap:4px 14px;font:500 13px system-ui}#wres .rows span:nth-child(even){text-align:right;font-weight:800;color:#fff}
#wres .st{display:grid;gap:5px;font:500 13px system-ui}#wres .st i{font-style:normal;color:#7c78a8}#wres .st i.on{color:#ffe08a}#wres .st i.new{text-shadow:0 0 12px #ffcf4a}
#wres .legacy{font:500 13px/1.5 system-ui;color:#c9c6ee}#wres .legacy b{color:#fff}
#wres .perks{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px}
#wres .perks button{font:inherit;text-align:left;padding:10px 12px;border-radius:12px;border:1.5px solid #ffffff22;background:#ffffff08;color:#e9e6ff;cursor:pointer;display:grid;gap:3px}
#wres .perks button b{font-size:13px}#wres .perks button small{font-size:11px;color:#a8a4d6;line-height:1.3}#wres .perks button.on{border-color:#c9a8ff;background:#4a2cc055;box-shadow:0 0 18px #8a5cff55}
#wres .go{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
#wres .go button{font:800 14px system-ui;letter-spacing:.12em;text-transform:uppercase;padding:12px 26px;border-radius:999px;border:1.5px solid #8a7cff99;background:#120a2acc;color:#e8dcff;cursor:pointer}
#wres .go button.pri{background:linear-gradient(#6a48e8,#4a2cc0);border-color:#c9a8ff;color:#fff}#wres .go button:hover{filter:brightness(1.2)}`;

const tm = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const popStr = (p) => (p >= 1e9 ? `${(p / 1e9).toFixed(2)} B` : p >= 1e6 ? `${(p / 1e6).toFixed(0)} M` : `${Math.round(p / 1e3)} k`);
const KM = (m) => (m >= 1e5 ? `${(m / 1000).toFixed(0)} km` : `${(m / 1000).toFixed(1)} km`);
const TIER_COL = ['#4a7fd8', '#6a5cd8', '#9a4cd8', '#d84c9a'], TIER_NAME = ['Regions', 'Nations', 'Continents', 'The World'];

/** w: the world's numbers (planetgame.worldStats). ctx: for the legacy perk draw and the New World link. */
export function showResults(ctx, w, opt = {}) {
  document.getElementById('wres')?.remove();
  if (!document.getElementById('wres-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'wres-css', textContent: CSS }));
  const el = Object.assign(document.createElement('div'), { id: 'wres' });
  // the land timeline: an SVG polyline, tier bands behind it
  const T = Math.max(60, w.time), X = (t) => 8 + (t / T) * 284, Y = (l) => 62 - l * 54;
  const bands = w.tiers.map((q, i) => (q.from == null ? '' : `<rect x="${X(q.from).toFixed(1)}" y="6" width="${Math.max(0, X(q.to) - X(q.from)).toFixed(1)}" height="58" fill="${TIER_COL[i]}" opacity=".16"/>`)).join('');
  const pts = (w.landLog || []).map(([t, l]) => `${X(t).toFixed(1)},${Y(l).toFixed(1)}`).join(' ');
  const spark = `<svg viewBox="0 0 300 76"><g>${bands}</g><line x1="8" y1="62" x2="292" y2="62" stroke="#ffffff22"/><line x1="8" y1="8" x2="292" y2="8" stroke="#ffffff14" stroke-dasharray="3 3"/><polyline points="${pts} ${X(w.time).toFixed(1)},${Y(1).toFixed(1)}" fill="none" stroke="#c9a8ff" stroke-width="1.8" stroke-linejoin="round"/><text x="8" y="74" font-size="7" fill="#7c78a8">0:00</text><text x="292" y="74" font-size="7" fill="#7c78a8" text-anchor="end">${tm(w.time)}</text><text x="10" y="15" font-size="7" fill="#7c78a8">100%</text></svg>`;
  const tot = w.tiers.reduce((a, q) => a + (q.from == null ? 0 : q.to - q.from), 0) || 1;
  const tiers = `<div class="tiers">${w.tiers.map((q, i) => (q.from == null ? '' : `<i style="flex:${(q.to - q.from) / tot};background:${TIER_COL[i]}" title="${TIER_NAME[i]}">${TIER_NAME[i]} ${tm(q.to - q.from)}</i>`)).join('')}</div>`;
  const row = (a, b) => `<span>${a}</span><span>${b}</span>`;
  const rows = [row('ICBMs swallowed', `${w.nukes} / ${w.nukesFired}`), row('Rods caught', `${w.rodGulps} / ${w.rods}`), row('Satellites', w.sats), row('Rivals eaten', `${w.rivalEaten} / ${w.rivals}`), row('The Moon', w.moonGulps ? `${w.moonGulps} / 9 pieces` : '—'),
    row('Aegis broken', w.aegisBroke ? 'yes' : w.aegis ? 'no' : '—'), row('Cracker fizzled', w.fizzles ? 'yes' : w.cracker ? 'no' : '—'), row('Hits taken', w.hits), row('Weapons seen', `${w.seen} kinds`)].join('');
  const stars = w.stars?.list.map((c) => `<i class="${c.done ? 'on' : ''}${c.fresh ? ' new' : ''}">${c.done ? '★' : '☆'} ${c.text}</i>`).join('') || '';
  const pay = w.pay ? Object.entries(w.pay.parts).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(' · ') : '';
  const best = save.worldBest?.[w.seed], worlds = save.worlds || 1;
  const offer = offerPerks((w.seed || 7) * 31 + worlds, 77, [], true);
  el.innerHTML = `<div class="pn"><h1>THE WORLD IS CONSUMED</h1><div class="sub">${w.pay?.practice ? 'practice · ' : ''}world ${w.seed} · ${worlds === 1 ? 'your first' : `world number ${worlds}`}</div>
    <div class="big"><div><b>${tm(w.time)}</b><small>time</small></div><div><b>${popStr(w.pop)}</b><small>swallowed</small></div><div><b>${KM(w.best)}</b><small>peak size</small></div><div><b>+${w.pay?.total ?? 0}</b><small>void dust</small></div></div>
    <div class="two"><div><h3>Land eaten</h3>${spark}${tiers}</div><div><h3>The run</h3><div class="rows">${rows}</div></div></div>
    <div class="two"><div><h3>World stars</h3><div class="st">${stars}</div></div><div class="legacy"><h3>Legacy</h3>Worlds eaten <b>${worlds}</b> · fastest <b>${save.worldFastest ? tm(save.worldFastest) : tm(w.time)}</b>${best ? ` · this world <b>${tm(best)}</b>` : ''}<br>${pay ? `<span style="color:#8d89c0">${pay}</span><br>` : ''}${worlds === 1 ? '<b>Unlocked:</b> the Event Horizon and Black Hole skins.<br>' : ''}Choose one gift for the next world:
      <div class="perks">${offer.map((id) => `<button data-id="${id}"><b>${PERKS[id].icon} ${PERKS[id].name}</b><small>${PERKS[id].desc}</small></button>`).join('')}</div></div></div>
    <div class="go"><button class="pri" id="wr-new">New World</button><button id="wr-menu">Menu</button><button id="wr-close">Close</button></div></div>`;
  document.body.append(el);
  const sel = save.legacyPerk && offer.includes(save.legacyPerk) ? save.legacyPerk : null;
  const mark = (id) => el.querySelectorAll('.perks button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  if (sel) mark(sel);
  el.querySelectorAll('.perks button').forEach((b) => { b.onclick = () => { save.legacyPerk = b.dataset.id; persist(); mark(b.dataset.id); }; });
  el.querySelector('#wr-close').onclick = () => { el.remove(); opt.onClose?.(); };
  el.querySelector('#wr-menu').onclick = () => ctx.toMenu();
  el.querySelector('#wr-new').onclick = () => { const u = new URL(location.href); u.search = `?planet&ng=1&seed=${Math.floor(Math.random() * 9e5) + 1000}`; location.href = u.href; };
  return el;
}
