// Phase 2 (docs/PHASE2.md) support for main.js: tuning, the news ticker, and quiet stand-ins for the Phase 1
// systems that only make sense inside a town (police heat, city events, capsules, rivals) until their regional
// versions arrive.

/** Phase 2 tuning (starting values; bot balance in docs/BALANCE.md). */
export const P2 = {
  surge: 1.25, // breakout: the hole's radius jumps by this
  slowmo: 0.3, // world speed during the breakout cinematic
  bellyDrain: 1 / 16, // a full belly lasts 16 s (settlements are a few hundred metres apart)
  meal: 0.08, // eating this fraction of the hole's area fills the belly
  crumb: 0.018, // each crumb (a tree, a hedge, a cow) tops the belly up this much: woods feed you, they don't grow you
  decayFed: 0.003, // area fraction lost per second while fed
  decayStarving: 0.025, // ... while starving
  dead: 6, // below this radius the ground seals
  speed: (r) => Math.min(40, 18 + r * 0.5), // sub-linear: big feels heavy, the map stays crossable
  turn: (r) => 0.1 + Math.min(0.35, r / 170), // steering smoothing time constant (s): heavier as it grows
};

export const quietDirector = () => ({
  stars: 0, noto: 0, bonusT: 0, cool: {}, units: [], drops: [], sizeK: 1, notorietyMult: 1,
  notice() {}, update() {}, dispose() {},
});
export const quietEvents = () => ({ live: false, kind: null, focus: null, update() {}, dispose() {} });
export const quietChains = () => ({ reach: 1, fireNoto: 1, onFall() {}, update() {}, dispose() {} });
export const quietPowerups = () => ({ active: {}, twin: null, items: [], gapK: 1, chips: () => [], nearest: () => null, update: () => [], dispose() {} });
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
    this.el.children[2].textContent = `Population swallowed ${Math.round(pop).toLocaleString()}`;
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
