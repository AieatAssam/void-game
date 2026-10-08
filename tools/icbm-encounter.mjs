// Isolated single-ICBM encounter probe: node tools/icbm-encounter.mjs
import { chromium, channel } from './browser.mjs';

const root = `http://127.0.0.1:${process.env.PORT || 5174}/`;
const cases = ['straight', 'naive', 'dodge350', 'dive350'];
const browser = await chromium.launch({ headless: true, channel, args: ['--ignore-gpu-blocklist'] });

try {
  for (const [tier, radius] of [[1, 50_000], [3, 500_000]]) {
    const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    page.on('pageerror', (e) => console.error('pageerror', e.message.slice(0, 300)));
    await page.goto(`${root}?planet&seed=7&r=${radius}&webgl&q=low&grass=0&nothumbs`);
    await page.waitForFunction(() => window.__planet?.run && window.__threat?.force && window.__planetSteer, null, { timeout: 900000 });
    for (const policy of cases) {
      const result = await page.evaluate(({ policy, radius }) => {
        const P = window.__planet, th = window.__threat, h = P.ctx.hole, state = P.ctx.state;
        P.reset();
        th.hold(true);
        const originalRandom = Math.random, originalBot = window.__bot, originalHeadless = window.__headless;
        const startR = h.r, startArea = h.area, damage0 = state.ledger.dmg || 0;
        const poseDot = P.W.hdir.dot(P.W.P.startDir);
        if (Math.abs(startR - radius) > 1 || state.time !== 0 || state.belly !== 1 || h.sx !== 0 || h.sz !== 0 || state.tier !== (radius < 150_000 ? 1 : 3) || poseDot < 0.9999) throw new Error(`reset mismatch: ${JSON.stringify({ startR, time: state.time, belly: state.belly, sx: h.sx, sz: h.sz, tier: state.tier, poseDot })}`);
        try {
        let rng = 0x1cb;
        Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
        if (!th.force('nuke')) throw new Error('force(nuke) failed to create an isolated ICBM');
        const n = th.t.nukes.find((x) => x.on && !x.mirv);
        if (!n) throw new Error('forced ICBM is not live');
        const initialHeading = [1, 0], naive = window.__planetSteer('naive');
        let lock = null, impact = null, lockAge = null;
        window.__headless = true;
        window.__bot = (hole) => {
          if (policy === 'straight' || policy === 'naive') return policy === 'naive' ? naive(hole) : initialHeading;
          if (!n.locked || n.age - lockAge < 0.35) return initialHeading;
          const d = th.rings().find((x) => x.kind === 'nuke' && x.id === `n${n.uid}`);
          if (!d) return initialHeading;
          const dist = Math.hypot(d.x, d.z) || 1;
          if (policy === 'dodge350') return [-d.x / dist, -d.z / dist];
          if (dist <= d.inner * 0.25) return [0, 0];
          return [d.x / dist, d.z / dist];
        };
        const local = (dir) => { const o = {}; th.t.offsetOf(dir, o); return { x: +o.x.toFixed(0), z: +o.z.toFixed(0) }; };
        for (let i = 0; i < 1200; i++) {
          window.__tick(1 / 60, 1);
          if (!lock && n.locked) { lockAge = n.age; lock = { launchToLock: +n.age.toFixed(3), lockToImpact: +n.lock.toFixed(3), target: local(n.to), hole: local(th.t.W.hdir) }; }
          if (!impact && n.phase === 'burn') {
            const distance = th.t.W.distTo(n.to);
            const hitLoss = -((state.ledger.dmg || 0) - damage0), areaBeforeHit = h.area + hitLoss;
            impact = { at: +n.age.toFixed(3), outcome: n.out, distance: +distance.toFixed(0), distanceR: +(distance / n.r0).toFixed(3), blast: +n.B.toFixed(0), inner: +n.inner.toFixed(0), damagePctCurrent: +(100 * hitLoss / areaBeforeHit).toFixed(3), target: local(n.to), hole: local(th.t.W.hdir) };
            break;
          }
        }
        return { policy, tier: state.tier, startRadius: Math.round(startR), lock, impact, stats: { nukes: th.stats.nukes, locks: th.stats.locks, hits: th.stats.hits, swallowed: th.stats.swallowed, mercy: th.stats.mercy }, damageOfStartPct: +((-(state.ledger.dmg || 0) + damage0) / startArea * 100).toFixed(3), finalRadius: Math.round(h.r), finalTier: state.tier, timeout: !impact };
        } finally { Math.random = originalRandom; window.__bot = originalBot; window.__headless = originalHeadless; }
      }, { policy, radius });
      console.log(JSON.stringify({ tier, ...result }));
    }
    await page.close();
  }
} finally {
  await browser.close();
}
