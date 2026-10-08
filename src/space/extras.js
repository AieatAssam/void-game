// Phase 4 adversity and power-ups (docs/PHASE4.md), mixed into SpaceGame (src/space.js): flares, tidal pulls from huge bodies, and four power-ups. Nothing here can end a run or trap
// the hole: a flare shoves you clear and stuns you for a second, a tidal pull is slower than your speed, and every penalty is a few percent of the tier.
import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, float, uniform, length, smoothstep, positionGeometry, exp, abs } from 'three/tsl';
import { K, looseProp } from './tiers.js';

const TAU = Math.PI * 2;
const POW = {
  magnet: { name: 'MAGNET', color: [0.3, 0.85, 1.0], css: '#4fd8ff', dur: 7, blurb: 'pulls in everything, twice as far' },
  surge: { name: 'SURGE', color: [1.0, 0.62, 0.2], css: '#ffa03a', dur: 6, blurb: 'faster · every gulp pays more' },
  shield: { name: 'SHIELD', color: [0.4, 1.0, 0.55], css: '#6dff9a', dur: 9, blurb: 'flares and rivals cannot touch you' },
  nova: { name: 'NOVA', color: [1.0, 0.95, 0.85], css: '#fff1d8', dur: 0, blurb: 'drags everything near into the hole' },
};
const KINDS = Object.keys(POW);

export const extraMethods = {
  initExtras(ctx) {
    this.stats = { flaresDodged: 0, flareHits: 0, bites: 0, rivalsEaten: 0, powerups: 0, peakChain: 0, storms: 0, tierTimes: [], tierGulps: [] };
    this.pu = { item: null, t: 18, active: {}, n: 0 };
    this.stunT = 0; this.sflare = null; this.flareT = 30;
    // the flare: an expanding ring in the plane, additive
    this.flareU = { a: uniform(0) };
    const m = new THREE.MeshBasicNodeMaterial({ fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthTest: false });
    const rho = length(positionGeometry.xz);
    m.colorNode = Fn(() => {
      const t = rho.sub(0.86).div(0.14), edge = smoothstep(0.0, 0.7, t).mul(float(1).sub(smoothstep(0.7, 1.0, t)));
      return vec4(vec3(1.0, 0.45, 0.12).mul(edge.mul(2.4).add(exp(t.sub(0.7).mul(-9)).mul(0.6))).mul(this.flareU.a), 1);
    })();
    this.flareMesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 128, 1).rotateX(-Math.PI / 2), m);
    this.flareMesh.frustumCulled = false; this.flareMesh.renderOrder = 47; this.flareMesh.visible = false; this.root.add(this.flareMesh);
    // the chips under the HUD
    const el = this.puEl = document.createElement('div'); el.id = 'sppow';
    el.style.cssText = 'position:fixed;top:64px;left:0;right:0;display:flex;justify-content:center;gap:8px;z-index:6;pointer-events:none;font:800 12px system-ui,sans-serif;letter-spacing:.1em';
    document.body.appendChild(el);
  },

  disposeExtras() { this.puEl?.remove(); this.flareMesh?.geometry.dispose(); this.flareMesh?.material.dispose(); },

  /** Active power-up multipliers read by the step. */
  pw(k) { if (k === 'shield' && this.k?.noShield) return false; return (this.pu?.active[k] || 0) > 0; },

  extrasStep(dt, ctx) {
    const st = ctx.state, r = this.r, tier = this.tier, rnd = this.rnd;
    this.stunT = Math.max(0, this.stunT - dt);
    for (const k of KINDS) if (this.pu.active[k] > 0) this.pu.active[k] = Math.max(0, this.pu.active[k] - dt);
    this.stats.peakChain = Math.max(this.stats.peakChain, this.combo || 0);
    if (this.phase !== 'play') { this.sflare = null; return; }
    // ---- tidal pull: a body far bigger than the hole leans on it (slower than you, never a trap)
    if (tier.hazards.includes('tidal')) {
      let px = 0, pz = 0;
      for (const o of this.bodies) {
        if (o.state || o.b < 2.5 * r || o.k >= K.galaxy) continue;
        const dx = o.x - this.hx, dz = o.z - this.hz, d = Math.hypot(dx, dz), reach = 2.2 * o.b;
        if (d > reach || d < 1e-6) continue;
        const k = (1 - d / reach) ** 2 * 0.3 * r; px += dx / d * k; pz += dz / d * k;
      }
      this.hx += px * dt; this.hz += pz * dt;
    }
    // ---- supernova (tier 4+): a star nearby telegraphs for 3 s, then goes: a big flare ring, and a neutron star is left behind to eat
    if (tier.hazards.includes('supernova') && !this.k.noHaz) {
      const N = this.snova;
      if (!N) {
        if ((this.snT = (this.snT ?? 40) - dt) <= 0) {
          let star = null, bd = 1e9;
          for (const o of this.bodies) { if (o.state || o.k !== K.star || o.b < 0.5 * r || o.b > 8 * r) continue; const d = Math.hypot(o.x - this.hx, o.z - this.hz) / r; if (d > 4 && d < 18 && d < bd) { bd = d; star = o; } }
          if (star) { this.snova = { o: star, t: 0 }; ctx.card('SUPERNOVA', 'A STAR IS ABOUT TO GO'); ctx.sfx.space.flareWarn(); } else this.snT = 8;
        }
      } else {
        N.t += dt; const o = N.o; o.pulse = Math.min(1, N.t / 3) * (0.55 + 0.45 * Math.sin(N.t * (8 + N.t * 8)));
        if (N.t >= 3 || o.state) {
          this.snova = null; this.snT = 55 + rnd() * 35; o.pulse = 0;
          if (!o.state) {
            o.state = 2; this.live--;
            this.sflare = { x: o.x, z: o.z, t: 1.6, hit: false, w: 2.6 * r, Rmax: 18 * r, name: '' };
            this.bodies.push(looseProp(tier, 'neutron_star', Math.max(0.2 * r, o.b * 0.25), o.x, o.z)); this.live++; this.propUse.add('neutron_star');
            ctx.card('SUPERNOVA', 'EAT WHAT IT LEFT'); ctx.sfx.space.flareHit(); st.shake = Math.max(st.shake || 0, 0.5); this.flare = 2;
          }
        }
      }
    }
    // ---- flares
    if (tier.hazards.includes('flare') && !this.k.noHaz) {
      const F = this.sflare;
      if (!F) {
        if ((this.flareT -= dt) <= 0) {
          let src = null, bs = 0;
          for (const o of this.bodies) { if (o.state || o.b < 0.6 * r || o.k === K.comet) continue; const d = Math.hypot(o.x - this.hx, o.z - this.hz) / r; if (d > 5 && d < 22 && o.b > bs) { bs = o.b; src = o; } }
          const a = rnd() * TAU, x = src ? src.x : this.hx + Math.cos(a) * 12 * r, z = src ? src.z : this.hz + Math.sin(a) * 12 * r;
          this.sflare = { x, z, t: 0, hit: false, w: 1.8 * r, Rmax: 12 * r, name: src?.name || '' };
          ctx.hint(`${src?.name ? src.name + ' ' : ''}FLARE · stay out of the ring`); ctx.sfx.space.flareWarn();
        }
      } else {
        F.t += dt;
        const WARN = 1.6, SPAN = 2.8;
        if (F.t > WARN) {
          const u = Math.min(1, (F.t - WARN) / SPAN), R = F.Rmax * (1 - (1 - u) ** 1.6);
          const dx = this.hx - F.x, dz = this.hz - F.z, d = Math.hypot(dx, dz);
          if (!F.hit && Math.abs(d - R) < F.w * 0.5 + 0.25 * r) {
            F.hit = true;
            if (this.pw('shield') && !this.k.noShield) { ctx.card('SHIELDED', 'THE FLARE BREAKS ON YOU'); this.sflare = null; this.flareT = (24 + rnd() * 14) * this.k.flare; this.stats.flaresDodged++; return; }
            const k = (3 * r) / (d || 1); this.hx += dx * k; this.hz += dz * k; this.stunT = 1.3 * this.k.stun; this.stats.flareHits++;
            this.eatenW = Math.max(0, this.eatenW - this.total * tier.goal * 0.015 * this.k.flareCost);
            st.shake = Math.max(st.shake || 0, 0.8); ctx.hint('Flare hit · steering dazed'); ctx.sfx.space.flareHit(); navigator.vibrate?.([80, 40, 120]);
          }
          if (u >= 1) { if (!F.hit) { this.stats.flaresDodged++; this.eatenW += this.total * tier.goal * 0.004; } this.sflare = null; this.flareT = (24 + rnd() * 14) * this.k.flare; }
        }
      }
    }
    // ---- power-ups
    const P = this.pu;
    if (!P.item) {
      if (!this.k.noPu && (P.t -= dt) <= 0) {
        const pool = this.k.noShield ? KINDS.filter((x) => x !== 'shield') : KINDS, kind = pool[(P.n++ * 7 + ((rnd() * 4) | 0)) % pool.length], a = rnd() * TAU, d = (6 + rnd() * 6) * r;
        P.item = { kind, x: this.hx + Math.cos(a) * d, z: this.hz + Math.sin(a) * d, ttl: 20 };
        ctx.hint(`${POW[kind].name} nearby`);
      }
    } else {
      const it = P.item; it.ttl -= dt;
      const d = Math.hypot(it.x - this.hx, it.z - this.hz) / r;
      if (d < 1.5) this.takePower(it.kind, ctx), P.item = null, P.t = (26 + rnd() * 16) * this.k.pu;
      else if (it.ttl <= 0) { P.item = null; P.t = 14 + rnd() * 10; }
    }
  },

  takePower(kind, ctx) {
    const def = POW[kind], r = this.r;
    this.stats.powerups++;
    ctx.card(def.name, def.blurb.toUpperCase()); ctx.sfx.space.power(kind); navigator.vibrate?.(50); ctx.state.shake = Math.max(ctx.state.shake || 0, 0.3);
    this.flare = Math.max(this.flare || 0, 1.5);
    if (kind === 'nova') {
      let n = 0;
      for (const o of this.bodies) {
        if (o.state || o.b > 0.85 * r) continue;
        const ex = o.x - this.hx, ez = o.z - this.hz, d = Math.hypot(ex, ez);
        if (d < 7 * r && n < 70) { this.capture(o, ex, ez, d, r); o.T = 0.5 + d / r * 0.12; n++; }
      }
      this.flare = 2.2;
    } else this.pu.active[kind] = def.dur;
  },

  /** The flare ring, the pick-up glow and the chips; returns the glow instance count. */
  extrasDraw(ctx, ir, ngl) {
    const F = this.sflare, U = this.flareU, mesh = this.flareMesh;
    if (F && F.t > 0) {
      const WARN = 1.6, SPAN = 2.8, warn = F.t <= WARN, u = Math.min(1, Math.max(0, (F.t - WARN) / SPAN)), R = warn ? F.Rmax * 0.04 * (1 + 0.2 * Math.sin(F.t * 18)) : F.Rmax * (1 - (1 - u) ** 1.6);
      mesh.visible = true; mesh.position.set((F.x - this.hx) * ir, 0, (F.z - this.hz) * ir); mesh.scale.setScalar(Math.max(0.2, R * ir));
      U.a.value = warn ? 0.5 + 0.5 * Math.sin(F.t * 14) : 1.1 * (1 - 0.5 * u);
    } else mesh.visible = false;
    // the pick-up: a pulsing glare
    const it = this.pu.item;
    if (it && ngl < 698) {
      const c = POW[it.kind].color, pulse = 0.8 + 0.2 * Math.sin(this.t * 6), gi = ngl * 4, fade = Math.min(1, it.ttl / 3);
      const _m = this._m4 ??= new THREE.Matrix4(), _p = this._v3 ??= new THREE.Vector3(), _q = this._q4 ??= new THREE.Quaternion(), _s = this._s3 ??= new THREE.Vector3();
      _p.set((it.x - this.hx) * ir, 0, (it.z - this.hz) * ir); _s.set(1.5 * pulse, 1, 1.5 * pulse); _m.compose(_p, _q.identity(), _s); this.glow.mesh.setMatrixAt(ngl, _m);
      const ga = this.glow.aC.array; ga[gi] = c[0]; ga[gi + 1] = c[1]; ga[gi + 2] = c[2]; ga[gi + 3] = 2.6 * fade; ngl++;
      ctx.edgeArrow('pu', [(it.x - this.hx) * ir, (it.z - this.hz) * ir], POW[it.kind].name, POW[it.kind].css);
    } else ctx.edgeArrow('pu', null);
    return ngl;
  },

  extrasHud() {
    const el = this.puEl; if (!el) return;
    const hb = document.getElementById('hud')?.getBoundingClientRect().bottom; if (hb) el.style.top = `${Math.round(hb + 6)}px`; // (under the HUD, wherever it wrapped to)
    const on = KINDS.filter((k) => this.pu.active[k] > 0);
    el.innerHTML = [...(this.frenzyT > 0 ? [`<span style="background:#3a1a00cc;color:#ffd070;border:1.5px solid #ffb030;padding:3px 10px;border-radius:999px">FRENZY ×2 ${this.frenzyT.toFixed(0)}</span>`] : []), ...(this.stunT > 0 ? [`<span style="background:#5a1a1acc;color:#ffb0a0;padding:3px 10px;border-radius:999px">DAZED</span>`] : []), ...on.map((k) => `<span style="background:#0d0820cc;color:${POW[k].css};border:1.5px solid ${POW[k].css};padding:3px 10px;border-radius:999px">${POW[k].name} ${this.pu.active[k].toFixed(0)}</span>`)].join('');
  },
};

export { POW };
