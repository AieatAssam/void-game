// Phase 4 bots for balance runs (docs/PHASE4.md): ?bot (greedy: perfect, instant), ?bot=human (decides 5 times a second, a little late, keeps a target, aims a few degrees off, notices power-ups
// and hazards late, and sometimes does nothing for a moment), ?bot=sloppy (the same, worse). ?suite=seed:mutator:legacy,... runs the configs one after another through page loads, storing each result
// in localStorage ('void-suite-results'); read it with __suiteResults().
import { K } from './tiers.js';

const TAU = Math.PI * 2;
const PROFILE = {
  human: { tick: 0.2, lag: 0.15, aim: 0.14, lapse: 0.03, lapseT: 0.4, stick: 0.7, noise: 0.3, puRange: 14, hazardLate: 0.4 },
  sloppy: { tick: 0.35, lag: 0.3, aim: 0.35, lapse: 0.08, lapseT: 0.7, stick: 0.5, noise: 0.5, puRange: 8, hazardLate: 0.8 },
};

export const botMethods = {
  botMode() { const m = new URLSearchParams(location.search).get('bot'); return m === 'human' || m === 'sloppy' ? m : 'greedy'; },

  steerBot() { return this.botMode() === 'greedy' ? this.autoSteer() : this.humanSteer(); },

  humanSteer() {
    const P = PROFILE[this.botMode()], r = this.r, t = this.t, H = this.hb ??= { next: 0, tgt: null, queue: [], idle: 0, last: [0, 0], rnd: this.rnd || Math.random };
    if (t >= H.next) { // a decision
      H.next = t + P.tick * (0.8 + 0.4 * Math.random());
      let want = null;
      if (Math.random() < P.lapse) H.idle = t + P.lapseT;
      // what is worth going for: fits-or-nibbles by value over distance, noisy, with a bonus for what it is already chasing
      let best = null, bs = 0, cur = 0;
      for (const o of this.bodies) {
        if (o.state) continue;
        const ex = o.x - this.hx, ez = o.z - this.hz, d = Math.hypot(ex, ez) + 0.5 * r;
        const fits = o.b <= 0.85 * r, eff = Math.max(0.1, Math.min(1, (o.b0 / r) / 0.1) ** 0.8);
        let s = (fits ? o.w * eff : o.w * 0.4 * Math.min(1, (r / o.b) ** 2)) / (d / r + 1) ** 1.5;
        if (d > 30 * r) s *= 0.3; // a person does not see that far
        if (o.gold && d < 20 * r) s *= 1.4;
        s *= 1 - P.noise + 2 * P.noise * Math.random();
        if (o === H.tgt) cur = s;
        if (s > bs) { bs = s; best = o; }
      }
      if (H.tgt && !H.tgt.state && cur >= P.stick * bs) best = H.tgt;
      H.tgt = best;
      if (best) { const ex = best.x - this.hx, ez = best.z - this.hz, d = Math.hypot(ex, ez) || 1; want = [ex / d, ez / d]; }
      // power-ups: noticed within a range
      const it = this.pu?.item;
      if (it) { const ex = it.x - this.hx, ez = it.z - this.hz, d = Math.hypot(ex, ez); if (d < P.puRange * r) want = [ex / d, ez / d]; }
      // the rival: run from a bigger one, chase a smaller one; flares: step away from the ring when it is close (late)
      const R = this.rival;
      if (R) { const rx = this.hx - R.x, rz = this.hz - R.z, d = Math.hypot(rx, rz); if (R.b > r * 1.1 && d < 5 * r) want = [rx / d, rz / d]; else if (r > R.b * 1.2 && d < 18 * r) want = [-rx / d, -rz / d]; }
      const F = this.sflare;
      if (F && !F.hit && F.t > P.hazardLate) { const dx = this.hx - F.x, dz = this.hz - F.z, d = Math.hypot(dx, dz); if (d < F.Rmax + 1.5 * r && F.t < 2.2 + 3.2 && Math.random() > P.hazardLate * 0.4) want = [dx / (d || 1), dz / (d || 1)]; } // (a flare: get outside its final ring)
      if (this.tier.field && Math.hypot(this.hx, this.hz) > this.tier.field * 0.9) { const d = Math.hypot(this.hx, this.hz); want = [-this.hx / d, -this.hz / d]; } // (a person turns back from the empty dark)
      H.queue.push([t + P.lag, want]);
    }
    while (H.queue.length && H.queue[0][0] <= t) H.last = H.queue.shift()[1] || [0, 0];
    if (t < H.idle) return [0, 0];
    const v = H.last; if (!v[0] && !v[1]) return [0, 0];
    const a = Math.atan2(v[1], v[0]) + P.aim * Math.sin(t * 1.7 + (H.ph ??= Math.random() * TAU));
    return [Math.cos(a), Math.sin(a)];
  },

  /** Suite runs: record a finished run and go to the next config (or stop). */
  suiteNext(result) {
    const q = new URLSearchParams(location.search), list = (q.get('suite') || '').split(',').filter(Boolean), idx = +q.get('idx') || 0;
    if (!list.length) return false;
    let all = []; try { all = JSON.parse(localStorage.getItem('void-suite-results') || '[]'); } catch { /* fresh */ }
    all.push({ cfg: list[idx], ...result }); try { localStorage.setItem('void-suite-results', JSON.stringify(all)); } catch { /* storage blocked */ }
    if (idx + 1 >= list.length) { try { localStorage.setItem('void-suite-done', '1'); } catch { /* */ } return true; }
    const [seed, mut, legacy] = list[idx + 1].split(':'), u = new URL(location.href);
    u.searchParams.set('seed', seed); u.searchParams.set('mut', mut || 'none'); if (legacy) u.searchParams.set('legacy', legacy); else u.searchParams.delete('legacy'); u.searchParams.set('idx', idx + 1);
    setTimeout(() => { location.href = u.href; }, 500);
    return true;
  },
};
