// Phase 4 growth read-out (docs/PHASE4.md section 7): the world is drawn in units of the hole's radius, so growth cannot be seen as the hole getting bigger. This draws a log-scale ladder
// (Earth, Jupiter, the Sun, an AU, a light-year, the Milky Way, the Local Group, the universe) with a pointer at the hole's real radius: things you have outgrown light up as you pass them.
const LY = 9.4607e12;
const MARKS = [ // [log10 km, label]
  [3.81, 'Earth'], [4.85, 'Jupiter'], [5.84, 'Sun'], [8.18, '1 AU'], [10.0, 'Neptune'], [12.98, '1 ly'], [14.98, '100 ly'], [17.98, 'Milky Way'], [19.98, 'Local Group'], [22.0, 'Virgo'], [23.65, 'Universe'],
];
const LO = 3.3, HI = 24;
const CSS = `#spladder{position:fixed;left:50%;bottom:calc(120px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(560px,86vw);z-index:5;pointer-events:none;font:700 10px system-ui,sans-serif;letter-spacing:.08em;color:#8d89b8}
#spladder .ax{position:relative;height:22px}#spladder .ln{position:absolute;left:0;right:0;top:15px;height:2px;border-radius:2px;background:linear-gradient(90deg,#8a5cff 0,#8a5cff var(--p),#ffffff22 var(--p))}
#spladder .mk{position:absolute;top:10px;width:2px;height:10px;margin-left:-1px;background:#ffffff44;border-radius:1px}#spladder .mk.on{background:#c9a8ff}
#spladder .mk b{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);font-weight:700;white-space:nowrap;opacity:0;transition:opacity .4s;text-shadow:0 1px 3px #000}
#spladder .mk.near b,#spladder .mk.on b{opacity:.95}#spladder .mk.on b{color:#e8dcff}
#spladder .ptr{position:absolute;top:8px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff,#c9a8ff 55%,#6a48e8);box-shadow:0 0 12px #b58cff}
#spladder .rd{text-align:center;margin-top:2px;font-size:11px;color:#c9c6ee}#spladder .rd b{color:#fff}
@media (max-width:560px){#spladder{bottom:calc(112px + env(safe-area-inset-bottom));font-size:9px}}`;
const fmt = (km) => (km >= 9.4607e21 ? `${(km / LY / 1e9).toFixed(1)} bn ly` : km >= 9.4607e18 ? `${(km / LY / 1e6).toFixed(km >= 9.4607e19 ? 0 : 1)} M ly` : km >= 9.4607e15 ? `${(km / LY / 1e3).toFixed(km >= 9.4607e16 ? 0 : 1)} k ly` : km >= 9.4607e11 ? `${(km / LY).toFixed(km >= 9.4607e12 ? 0 : 1)} ly` : km >= 1e9 ? `${(km / 1e9).toFixed(1)} bn km` : km >= 1e6 ? `${(km / 1e6).toFixed(1)} M km` : `${Math.round(km).toLocaleString('en')} km`);

export function installLadder() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'spladder';
  el.innerHTML = `<div class="ax"><div class="ln"></div>${MARKS.map(([l, n]) => `<div class="mk" style="left:${100 * (l - LO) / (HI - LO)}%" data-l="${l}"><b>${n}</b></div>`).join('')}<div class="ptr"></div></div><div class="rd"></div>`;
  document.body.appendChild(el);
  const ptr = el.querySelector('.ptr'), ln = el.querySelector('.ln'), rd = el.querySelector('.rd'), mks = [...el.querySelectorAll('.mk')];
  let shown = LO, lastOn = -1;
  return {
    /** logR: log10 of the hole's radius in km. */
    update(logR, label) {
      shown += (logR - shown) * 0.12; // (the pointer glides: a gulp is a surge, not a jump)
      const p = 100 * (shown - LO) / (HI - LO);
      ptr.style.left = `${p}%`; ln.style.setProperty('--p', `${p}%`);
      let on = 0; mks.forEach((m, i) => { if (+m.dataset.l < shown) on = i + 1; }); // (only the last thing you passed and the next one are named: they would overlap otherwise)
      mks.forEach((m, i) => { m.classList.toggle('on', i === on - 1); m.classList.toggle('near', i === on); });
      if (on !== lastOn) { lastOn = on; el.animate([{ transform: 'translateX(-50%) scale(1.08)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 350, easing: 'ease-out' }); }
      rd.innerHTML = label;
    },
    dispose() { el.remove(); st.remove(); },
  };
}
export { fmt as ladderFmt };
