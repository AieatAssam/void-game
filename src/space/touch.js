// Phase 4 touch HUD (docs/PHASE4.md): the steering itself is main.js's drag joystick (canvas pointer events); this draws it, tightens the HUD for small screens and tells a first-time
// touch player what to do. Nothing here changes the controls.
const CSS = `
#spstick{position:fixed;left:0;top:0;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;z-index:7;pointer-events:none;opacity:0;transition:opacity .15s;
  background:radial-gradient(circle,#b58cff14 55%,#b58cff33 100%);box-shadow:0 0 0 2px #c9a8ff66,0 0 24px #8a5cff55 inset}
#spstick.on{opacity:1}
#spstick i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff,#c9a8ff 60%,#7a52e0);box-shadow:0 2px 12px #000a,0 0 18px #b58cff99}
@media (pointer:coarse),(max-width:560px){
  #hud.p3{padding-top:max(8px,env(safe-area-inset-top));padding-left:max(8px,env(safe-area-inset-left));padding-right:max(8px,env(safe-area-inset-right));gap:5px}
  #hud.p3 .pill{font-size:12px;padding:3px 9px}
  #hud.p3 .meter{max-width:34vw}
  #sppow{font-size:11px !important}
  #levelup{width:92vw;text-align:center;top:25% !important}#levelup b{white-space:normal !important;font-size:clamp(17px,6vw,30px) !important;line-height:1.1 !important}
  #hint{bottom:calc(76px + env(safe-area-inset-bottom))}
  #spres{padding:10px 10px calc(10px + env(safe-area-inset-bottom))}
  #spres .go button{flex:1 1 140px}
}`;

export function installTouch(g, ctx) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'spstick'; el.innerHTML = '<i></i>'; document.body.appendChild(el);
  const knob = el.firstChild, c = ctx.renderer.domElement; let id = null, ox = 0, oy = 0;
  const down = (e) => {
    if (e.pointerType === 'mouse' || id !== null) return;
    id = e.pointerId; ox = e.clientX; oy = e.clientY;
    el.style.left = `${ox}px`; el.style.top = `${oy}px`; knob.style.transform = 'translate(0,0)'; el.classList.add('on');
  };
  const move = (e) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - ox, dy = e.clientY - oy, l = Math.hypot(dx, dy) || 1, k = Math.min(l, 52) / l;
    knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  };
  const up = (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove('on'); };
  c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  let shown = false;
  try { shown = localStorage.getItem('void-space-touch') === '1'; } catch { /* storage blocked */ }
  const first = (e) => { if (e.pointerType === 'mouse' || shown) return; shown = true; try { localStorage.setItem('void-space-touch', '1'); } catch { /* storage blocked */ } ctx.hint('Drag anywhere to steer · the farther you drag, the faster'); };
  c.addEventListener('pointerdown', first, { once: false });
  return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); c.removeEventListener('pointerdown', first); el.remove(); st.remove(); };
}
