// Phase 2 (docs/PHASE2.md) support for main.js: tuning, the news ticker, and quiet stand-ins for the Phase 1
// systems that only make sense inside a town (police heat, city events, chain reactions) until their regional
// versions arrive.

/** Phase 2 tuning (starting values; bot balance in docs/BALANCE.md). */
export const P2 = {
  surge: 1.25, // breakout: the hole's radius jumps by this
  slowmo: 0.3, // world speed during the breakout cinematic
  bellyDrain: 1 / 24, // a full belly lasts 24 s: a leg between settlements takes a human-paced player ~30 s (human-like bot)
  meal: 0.08, // eating this fraction of the hole's area fills the belly
  crumb: 0.025, // each crumb (a tree, a hedge, a cow) tops the belly up this much: woods feed you, they don't grow you
  growth: 0.8, // every bite grows you 80% of a town bite (60% left a human-paced player unable to climb the ladder)
  capitalGrowth: 0.9, // ... except the capital: the climax pays out (enough to fit the stadium, its last and biggest piece)
  crumbGrowth: 0.4, // ... and grows you at 40% of a normal bite (the settlements are what grow you)
  stuckGrowth: 0.6, // ... or 60% when nothing standing fits you (no dead ends, but a careless player can still lose)
  decayFed: 0.0012, // area fraction lost per second while fed (travel legs between settlements are long)
  decayStarving: 0.01, // ... while starving (a long leg costs size, not the run)
  dead: 7.5, // below this the army's lid drops at once (army.js seal)
  critical: 9, // below this (back toward town scale) the army moves in to seal the hole: grow back past recover or be capped
  recover: 9.6,
  sealTime: 14, // seconds to recover before the lid drops
  // the army's cadence at threat 3-4 (was every 22-30 s and 30 s: a human-paced run spends 8-15 min on the island, and
  // strikes and lids took 4-8x what they took from the greedy bot, 2-3 min there)
  jetEvery: 32, // + up to 10 s
  liftEvery: 44,
  // their hits (were 0.12 and 0.18: 2 human-paced runs in 6 lost 3500+ m2 to each before the lid sealed them, 11-13 min in)
  jetHit: 0.08,
  lidHit: 0.12,
  capperHit: 0.1, // the Capper's slam (was 0.15 every 10 s: 11 hits ground a human-paced player down near the capital)
  capperCool: 14,
  speed: (r) => Math.min(80, 1.55 * (18 + r * 0.5)), // stays close to late-city pace as the hole grows; the region remains crossable
  turn: (r) => 0.09 + Math.min(0.2, r / 400), // steering smoothing time constant (s): near-city response at breakout, with modest weight at scale
};

export const quietDirector = () => ({
  stars: 0, noto: 0, bonusT: 0, cool: {}, units: [], drops: [], sizeK: 1, notorietyMult: 1,
  notice() {}, update() {}, dispose() {},
});
export const quietEvents = () => ({ live: false, kind: null, focus: null, update() {}, dispose() {} });
export const quietChains = () => ({ reach: 1, fireNoto: 1, onFall() {}, update() {}, dispose() {} });
export const quietRivals = () => ({ list: [], holes: [], sizeK: 1, hungerK: 1, update: () => [], labels() {}, hideLabels() {}, fed() {}, dispose() {} });

/** The lower-third news ticker: carries the scale in words ("Ashby swallowed - 420 evacuated"). */
export class News {
  constructor() {
    this.el = Object.assign(document.createElement('div'), { id: 'news', hidden: true });
    this.el.innerHTML = '<b>BREAKING</b><span></span><i></i>';
    document.body.append(this.el);
    this.queue = [];
    this.t = 0;
  }

  say(text) { this.queue.push(text); }

  /** pop: population swallowed (shown on the right of the bar). */
  update(dt, pop, show) {
    this.el.hidden = !show;
    if (!show) return;
    this.t -= dt;
    if (this.t <= 0 && this.queue.length) {
      this.t = 6;
      const s = this.el.children[1];
      s.textContent = this.queue.shift();
      s.classList.remove('run');
      void s.offsetWidth;
      s.classList.add('run');
    }
    this.el.children[2].textContent = `Population swallowed ${pop >= 1e8 ? `${(pop / 1e9).toFixed(2)} billion` : Math.round(pop).toLocaleString()}`;
  }
}

/** People a building held (the population counter): rough, by size and kind. */
export function residents(name, tier) {
  if (/city_block/.test(name)) return 420;
  if (/tower|supertall|skyscraper|office|hotel|apartment/.test(name)) return Math.round(tier * tier * 4);
  if (/stadium/.test(name)) return 30000;
  if (/parliament|cathedral|town_hall|market_hall|church/.test(name)) return 120;
  if (/factory|cooling|gasholder/.test(name)) return 60;
  if (/townhouse/.test(name)) return 16;
  if (/cottage|house|farmhouse|inn|shop|cafe/.test(name)) return 4;
  return 0;
}
