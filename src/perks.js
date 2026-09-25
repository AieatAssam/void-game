// Perk drafts (docs/REPLAYABILITY.md #1): at size-ups the void chooses a mutation - 3 offered, pick 1. Perks
// stack, so every run builds differently ("variety within consistency": the core loop stays, the build changes).
// Draws come from the run's seed, so the daily/weekly city offers everyone the same choices.
import { rng } from './city.js';

// Each perk only sets numbers on `mods` (read by main.js / city.js / director.js); nothing else.
export const PERKS = {
  glutton: { name: 'Glutton', icon: '🚗', desc: 'Vehicles grow you 35% more.', apply: (m) => { m.vehicleGrow *= 1.35; } },
  roots: { name: 'Deep Roots', icon: '🌳', desc: 'Trees and bushes grow you 60% more.', apply: (m) => { m.plantGrow *= 1.6; } },
  crowd: { name: 'Crowd Pleaser', icon: '🧍', desc: 'People and pets grow you 40% more.', apply: (m) => { m.peopleGrow *= 1.4; } },
  whirl: { name: 'Whirlwind', icon: '🌀', desc: 'The whirlpool after each bite lasts 60% longer.', apply: (m) => { m.vacDecay *= 0.62; } },
  maw: { name: 'Wide Maw', icon: '👄', desc: 'Swallow from 8% further out.', apply: (m) => { m.pull *= 1.08; } },
  slow: { name: 'Slow Burn', icon: '🫖', desc: 'Your belly drains 18% slower.', apply: (m) => { m.hunger *= 0.82; } },
  combo: { name: 'Combo King', icon: '🔥', desc: 'Combos last 0.4 s longer and pay double.', apply: (m) => { m.comboT += 0.4; m.comboPay *= 2; } },
  shell: { name: 'Hard Shell', icon: '🛡️', desc: 'Hits hurt 25% less.', apply: (m) => { m.hurt *= 0.75; } },
  quiet: { name: 'Low Profile', icon: '🤫', desc: 'Notoriety builds 25% slower.', apply: (m) => { m.noto *= 0.75; } },
  swift: { name: 'Swift', icon: '💨', desc: 'Move 12% faster.', apply: (m) => { m.speed *= 1.12; } },
  chain: { name: 'Chain Master', icon: '💥', desc: 'Gas station blasts reach twice as far; fireworks go unnoticed.', apply: (m) => { m.chain *= 2; m.fireworksNoto = 0; } },
  scav: { name: 'Scavenger', icon: '🧲', desc: 'Power-up capsules drop two-thirds more often.', apply: (m) => { m.capsules *= 0.6; } },
  bane: { name: 'Rival Bane', icon: '⚔️', desc: 'Rivals starve 50% faster; eating one grows you double.', apply: (m) => { m.rivalHunger *= 1.5; m.rivalMeal *= 2; } },
  crave: { name: 'Picky Eater', icon: '🍽️', desc: 'Cravings need one fewer item.', apply: (m) => { m.craveNeed -= 1; } },
};

export function baseMods() {
  return { vehicleGrow: 1, plantGrow: 1, peopleGrow: 1, vacDecay: 1, pull: 1, hunger: 1, comboT: 0, comboPay: 1, hurt: 1, noto: 1,
    speed: 1, chain: 1, fireworksNoto: 1, capsules: 1, rivalHunger: 1, rivalMeal: 1, craveNeed: 0 };
}

/**
 * Size-up milestones (index into main.js MILESTONES, sorted by size) that open a draft: benches (~0.95 m, the first
 * half-minute), houses (~4.4 m) and apartments (~8.6 m). People are passed at spawn; skyscrapers come too late to matter.
 */
export const DRAFT_AT = new Set([1, 3, 5]);

/** Three distinct perks for draft #k of a run (seeded; already-taken perks are never offered again). */
export function offerPerks(seed, k, taken) {
  const r = rng((seed ^ 0xd4af7) + k * 7919);
  const pool = Object.keys(PERKS).filter((id) => !taken.includes(id));
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

/** Recompute mods from the perks taken so far. */
export function modsFor(taken) {
  const m = baseMods();
  for (const id of taken) PERKS[id].apply(m);
  return m;
}
