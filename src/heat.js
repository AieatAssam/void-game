// Heat levels (docs/REPLAYABILITY.md #2, after Hades' Pact of Punishment): once a city is cleared it can be replayed
// at Heat 1-10. Each level adds the next modifier on top of the ones before, and pays more dust. The best Heat
// cleared is kept per city and shown on the picker. Opt-in: new players never see it until they've earned it.
import { save, persist } from './meta.js';

// mods read by main.js / director.js / rivals.js / powerups.js (each level adds its own on top of the lower ones)
export const HEAT = [
  { name: 'Hungry', desc: 'Your belly drains 15% faster.', apply: (h) => { h.hunger *= 1.15; } },
  { name: 'Alert', desc: 'Notoriety builds 25% faster.', apply: (h) => { h.noto *= 1.25; } },
  { name: 'Bold Rivals', desc: 'Rivals start 30% bigger.', apply: (h) => { h.rivalSize *= 1.3; } },
  { name: 'Short Fuse', desc: 'Heat stars come at 80% of the size.', apply: (h) => { h.heatSize *= 0.8; } },
  { name: 'Lean Start', desc: 'No free snacks near you in the first minute.', apply: (h) => { h.snackDelay = 60; } },
  { name: 'Hard Knocks', desc: 'Hits hurt 20% more.', apply: (h) => { h.hurt *= 1.2; } },
  { name: 'Scarce Capsules', desc: 'Power-up capsules drop half as often.', apply: (h) => { h.capsules *= 2; } },
  { name: 'Crowded', desc: 'One more rival hole.', apply: (h) => { h.rivals += 1; } },
  { name: 'Wanted', desc: 'Heat never drops below one star.', apply: (h) => { h.minStars = 1; } },
  { name: 'Against the Clock', desc: 'Clear the city within 7:00.', apply: (h) => { h.limit = 420; } },
];

export function heatMods(level) {
  const h = { hunger: 1, noto: 1, rivalSize: 1, heatSize: 1, snackDelay: 0, hurt: 1, capsules: 1, rivals: 0, minStars: 0, limit: 0 };
  for (let i = 0; i < level; i++) HEAT[i].apply(h);
  return h;
}

/** Dust multiplier for a run at `level` (+15% per level). */
export const heatPay = (level) => 1 + level * 0.15;

/** Highest Heat you may pick for a city: one above the best you've cleared, once the city has been cleared at all. */
export function heatMax(mood) {
  if (!save.cleared?.[mood]) return 0;
  return Math.min(HEAT.length, (save.heatBest?.[mood] ?? -1) + 2);
}

export const heatBest = (mood) => save.heatBest?.[mood] ?? (save.cleared?.[mood] ? 0 : -1);

/** Record a cleared run at `level`. Returns true if it's a new best for the city. */
export function recordHeat(mood, level) {
  save.heatBest ??= {};
  if ((save.heatBest[mood] ?? -1) >= level) return false;
  save.heatBest[mood] = level;
  persist();
  return true;
}
