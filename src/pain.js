// Hit feedback ("real pain", docs/PHASE3.md 12.12): one place every damage source routes through, so the hole visibly RECOILS in every phase.
//   What a hit does: the post pass pushes a shock ring out of the hole with a zoom punch, split colour channels, a red vignette and a drained picture (post.pk0 / pk1);
//   the planet shader dents the cap's rim on the side of the hit, ripples it away from there, flares it white-hot and cracks the ground around it (u.uPain / u.uPainP, planetglobe.js);
//   the hole's drawn size springs from the old radius to the new one with an undershoot (shrink); the camera is shoved away from the hit and rolls (cam); the size pill gets a red
//   "-X%" chip and a draining red segment; sfx.pain slams, ducks the mix and rings in the ears; a "wound" level lingers for seconds (ember rim, a heartbeat) scaled by what was lost lately.
//   Everything is uniform-driven (no per-frame allocation): update(dt) writes numbers, the shader and the post pass read them.
import * as THREE from 'three/webgpu';

export const PAIN_CSS = `#painchip{position:fixed;left:0;top:0;z-index:7;pointer-events:none;font:900 30px system-ui,sans-serif;color:#ff5a47;text-shadow:0 2px 0 #3a0508,0 0 18px #ff2a1acc;white-space:nowrap;opacity:0}
#painchip small{display:block;font:800 11px system-ui,sans-serif;letter-spacing:.08em;color:#ffd0c0;text-align:center;text-shadow:0 1px 0 #3a0508}
#painchip.go{animation:pchip 1.5s cubic-bezier(.2,.9,.3,1) forwards}
@keyframes pchip{0%{opacity:0;transform:translate(0,6px) scale(2.2)}10%{opacity:1;transform:translate(-2px,0) scale(1.35) rotate(-3deg)}20%{transform:translate(3px,0) scale(1.15) rotate(2deg)}32%{transform:translate(0,0) scale(1.1)}78%{opacity:1;transform:translate(0,-18px) scale(1)}100%{opacity:0;transform:translate(0,-34px) scale(.95)}}
#painbar{position:fixed;z-index:6;pointer-events:none;height:5px;border-radius:3px;background:#0006;overflow:hidden;opacity:0;transition:opacity .25s}
#painbar i{position:absolute;right:0;top:0;bottom:0;width:100%;background:linear-gradient(90deg,#ff7a4a,#ff1f1f);box-shadow:0 0 8px #ff3a2a;transform-origin:right;transform:scaleX(0)}
#size.hurt{animation:szhurt .7s ease-out}@keyframes szhurt{0%{background:#ff2a1af0;transform:translateX(-5px) scale(1.06)}15%{transform:translateX(5px) scale(1.04)}30%{transform:translateX(-3px)}55%{background:#5a0a10e0}100%{}}`;

const lerp = (a, b, k) => a + (b - a) * k;

export class Pain {
  constructor(sfx) {
    this.sfx = sfx;
    this.amp0 = 0; this.age = 9; this.imp = 0; this.wound = 0; this.crack = 0; this.heart = 0; this.hb = 0; this.recent = 0;
    this.src = new THREE.Vector3(); this.hasSrc = false; this.lx = 0; this.lz = 0; // the hit's direction: a planet-space point (the shader) and a local unit vector (x, z; the camera)
    this.s = 0; this.sv = 0; // shrink spring: the drawn radius = real x (1 + s)
    this.cx = 0; this.cz = 0; this.cvx = 0; this.cvz = 0; this.roll = 0; this.rvel = 0; // camera shove (units of 3% of the camera distance) and roll (rad)
    this.lost = 0; this.lostT = 0; this.near = 0; this.n = 0;
    if (typeof document !== 'undefined') {
      if (!document.getElementById('pain-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'pain-css', textContent: PAIN_CSS }));
      this.chip = Object.assign(document.createElement('div'), { id: 'painchip' }); this.bar = Object.assign(document.createElement('div'), { id: 'painbar' }); this.bar.append(document.createElement('i'));
      document.body.append(this.chip, this.bar);
      this.barFill = this.bar.firstChild;
    }
  }

  bind(post) { this.post = post; return this; }

  /**
   * The hole lost `frac` of its area. o: { src (planet-space unit vector toward the cause, or none = all around), dx, dz (local unit vector toward it), why, cont (a beam's tick: no slam) }.
   * Returns nothing: callers book the damage; this is only what the player sees, hears and feels.
   */
  hit(frac, o = {}) {
    const a = Math.min(1, 0.32 + frac * 4.2), k = Math.min(1, frac * 3.2);
    this.n++;
    this.amp0 = Math.min(1, this.imp * 0.6 + a); this.age = 0; this.imp = this.amp0;
    this.wound = Math.min(1, this.wound + 0.12 + frac * 3.6); this.crack = Math.min(1, this.crack + 0.3 + frac * 4); this.recent = Math.min(1, this.recent + frac * 3);
    if (o.src) { this.src.copy(o.src); this.hasSrc = true; const l = Math.hypot(o.dx || 0, o.dz || 0); this.lx = l > 1e-6 ? o.dx / l : 0; this.lz = l > 1e-6 ? o.dz / l : 0; } else { this.hasSrc = false; this.lx = this.lz = 0; }
    this.s = Math.min(0.7, this.s + (1 / Math.sqrt(Math.max(0.2, 1 - frac)) - 1)); // the drawn hole starts at the old size and falls through the new one
    this.sv -= 0.5 * a;
    const sh = 5.5 * a; this.cvx += -this.lx * sh; this.cvz += -this.lz * sh; this.rvel += (this.lx >= 0 ? 1 : -1) * 3.2 * a * (this.lx || this.lz ? 1 : 0.5);
    this.sfx.pain(k);
    this.chipShow(frac, o.why);
  }

  /** A near miss (the mercy cap): a lesser shake only, no damage feelings. */
  nearMiss(o = {}) {
    this.cvx += -(o.dx || 0) * 1.6; this.cvz += -(o.dz || 0) * 1.6; this.rvel += 0.4; this.near = 1;
  }

  /** A beam's tick (hurtCont): the wound deepens and the rim flickers; no slam, no chip per tick. */
  cont(frac, o = {}) {
    this.wound = Math.min(1, this.wound + 0.5 + frac * 8); this.crack = Math.min(1, this.crack + 0.25);
    this.amp0 = Math.max(this.imp, 0.22); this.imp = this.amp0; this.age = Math.min(this.age, 0.25); this.recent = Math.min(1, this.recent + frac * 2);
    this.cvx += -(o.dx || 0) * 0.9; this.cvz += -(o.dz || 0) * 0.9;
  }

  chipShow(frac, why) {
    if (!this.chip) return;
    const pill = document.getElementById('size'), r = pill ? pill.getBoundingClientRect() : { left: 24, bottom: 56, width: 160 }, el = this.chip;
    el.innerHTML = `−${(frac * 100).toFixed(frac < 0.1 ? 1 : 0)}%${why ? `<small>${why.replace(/[!—].*$/, '').trim().toUpperCase()}</small>` : ''}`;
    el.style.left = `${r.left + 8}px`; el.style.top = `${r.bottom + 6}px`;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    if (pill) { pill.classList.remove('hurt'); void pill.offsetWidth; pill.classList.add('hurt'); }
    this.lost = Math.min(1, this.lost + frac * 3.2); this.lostT = 1.4;
    const b = this.bar; b.style.left = `${r.left}px`; b.style.top = `${r.bottom + 3}px`; b.style.width = `${r.width}px`; b.style.opacity = '1';
  }

  /** Per frame (dt already carries hit-stop and slow-mo: the impact freezes with the world). */
  update(dt) {
    if (dt <= 0) return;
    this.age = Math.min(9, this.age + dt);
    this.imp = this.amp0 * Math.exp(-this.age * 1.2); if (this.imp < 0.003) this.imp = 0;
    this.recent = Math.max(0, this.recent - dt * 0.06);
    this.wound = Math.max(0, this.wound - dt * (0.05 + 0.1 * (1 - this.recent))); // (lingers for seconds, longer after a lot of damage)
    this.crack = Math.max(0, this.crack - dt * (this.age > 1.0 ? 0.2 : 0));
    this.near = Math.max(0, this.near - dt * 3);
    // springs (semi-implicit)
    const sw = 12, sz = 0.42; this.sv += (-sw * sw * this.s - 2 * sz * sw * this.sv) * dt; this.s += this.sv * dt; if (Math.abs(this.s) < 1e-4 && Math.abs(this.sv) < 1e-3) this.s = this.sv = 0;
    const cw = 13, cz = 0.3, k = Math.min(dt, 0.033);
    this.cvx += (-cw * cw * this.cx - 2 * cz * cw * this.cvx) * k; this.cx += this.cvx * k; this.cvz += (-cw * cw * this.cz - 2 * cz * cw * this.cvz) * k; this.cz += this.cvz * k;
    this.rvel += (-cw * cw * this.roll - 2 * cz * cw * this.rvel) * k; this.roll += this.rvel * k;
    this.cx = Math.max(-2.2, Math.min(2.2, this.cx)); this.cz = Math.max(-2.2, Math.min(2.2, this.cz)); this.roll = Math.max(-0.12, Math.min(0.12, this.roll)); // (the trauma budget: a pile of hits cannot throw the camera further than this)
    // the heartbeat of a wounded hole
    if (this.wound > 0.06) {
      const prev = this.hb; this.hb += dt * (1.0 + 1.5 * this.wound);
      if (Math.floor(this.hb) !== Math.floor(prev)) this.sfx.heart(this.wound);
      const p = this.hb % 1; this.heart = Math.exp(-p * 7) + 0.6 * Math.exp(-(((p - 0.28) * 9) ** 2));
    } else { this.heart = 0; this.hb = 0; }
    // the HUD's draining red segment
    if (this.lost > 0) {
      this.lostT -= dt; if (this.lostT < 0) this.lost = Math.max(0, this.lost - dt * 0.9);
      if (this.barFill) this.barFill.style.transform = `scaleX(${Math.min(1, this.lost).toFixed(3)})`;
      if (this.lost <= 0 && this.bar) this.bar.style.opacity = '0';
    }
    const p = this.post;
    if (p) { p.pk0.value.z = this.age; p.pk0.value.w = this.amp0; p.pk1.value.x = this.wound; p.pk1.value.y = this.heart; p.pk1.value.z = innerWidth / innerHeight; }
  }

  /** Where the hole is on screen (uv, y down). */
  setCenter(u, v) { if (this.post) this.post.pk0.value.x = u, this.post.pk0.value.y = v; }

  clear() { this.amp0 = this.imp = 0; this.age = 9; this.wound = this.crack = this.recent = this.s = this.sv = this.cx = this.cz = this.cvx = this.cvz = this.roll = this.rvel = this.lost = 0; this.bar && (this.bar.style.opacity = '0'); }
}
