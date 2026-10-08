// Phase 4 replayability (docs/PHASE4.md): a seeded MUTATOR changes how a universe plays, and a LEGACY perk (one of three offered on the results screen) carries into the next run.
// Both only turn a few numbers (`g.k`); nothing here can make a run unwinnable.
export const MUTATORS = {
  none: { name: 'Calm universe', blurb: 'the standard run', k: {} },
  flares: { name: 'Flare season', blurb: 'twice as many flares, each a little weaker', k: { flare: 0.5, stun: 0.7, bite: 1 } },
  predator: { name: 'Predator', blurb: 'the rival comes sooner, bites harder, pays double', k: { rivalT: 0.5, bite: 1.6, rivalPay: 2, rivalSpeed: 1.25 } },
  twitch: { name: 'Twitch', blurb: 'faster hole, shorter reach', k: { speed: 1.3, reach: 0.8 } },
  feast: { name: 'Feast', blurb: 'power-ups twice as often, but no shield', k: { pu: 0.5, noShield: true } },
  iron: { name: 'Iron run', blurb: 'no power-ups; stars pay double', k: { noPu: true, starPay: 2 } },
  quiet: { name: 'Quiet cosmos', blurb: 'no flares, no supernovae, no rival: just the feast', k: { noHaz: true, noRival: true, pay: 1.2 } },
};
const ORDER = ['none', 'flares', 'predator', 'twitch', 'feast', 'iron', 'quiet'];
export const LEGACY = {
  reach: { name: 'Wide mouth', blurb: '+20% pull reach', k: { reach: 1.2 } },
  sprint: { name: 'Sprinter', blurb: '+12% speed', k: { speed: 1.12 } },
  chain: { name: 'Chain keeper', blurb: 'chains last 50% longer', k: { chain: 1.5 } },
  fireproof: { name: 'Fireproof', blurb: 'flares daze you for half as long and cost half', k: { stun: 0.5, flareCost: 0.5 } },
  hunter: { name: 'Hunter', blurb: 'rivals start smaller and pay double', k: { rivalSize: 0.7, rivalPay: 2 } },
  lucky: { name: 'Lucky', blurb: 'power-ups come 30% more often', k: { pu: 0.7 } },
};

/** The default mutator for a seed (the first universe after a win is always the calm one). */
export function mutatorFor(seed, runs = 0) { return runs === 0 ? 'none' : ORDER[(Math.imul(seed | 0, 2654435761) >>> 0) % ORDER.length]; }

/** Multipliers for a run: product of the mutator's and the legacy perk's numbers. */
export function makeK(mut, legacy) {
  const k = { speed: 1, reach: 1, chain: 1, stun: 1, pu: 1, flare: 1, bite: 1, rivalT: 1, rivalPay: 1, rivalSize: 1, rivalSpeed: 1, flareCost: 1, pay: 1, starPay: 1, noHaz: false, noRival: false, noPu: false, noShield: false };
  for (const src of [MUTATORS[mut]?.k, LEGACY[legacy]?.k]) for (const [a, b] of Object.entries(src || {})) k[a] = typeof b === 'number' && typeof k[a] === 'number' ? k[a] * b : b;
  return k;
}
/** Three legacy offers, seeded by the run. */
export function offers(seed) { const ids = Object.keys(LEGACY), o = []; let h = seed | 0; while (o.length < 3) { h = Math.imul(h ^ (h >>> 15), 2246822519) + 374761393 | 0; const id = ids[(h >>> 0) % ids.length]; if (!o.includes(id)) o.push(id); } return o; }
