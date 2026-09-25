// Content packs (HANDOVER §6): which optional model packs a run needs. Pack models live in public/models/packs.json
// and are fetched on demand by assets.js loadPack(), so a city only downloads the districts it actually has.

/** Small packs every run uses (chain-reaction props, power-up capsules, the mutator duck, city events). */
export const CORE_PACKS = ['chain', 'powerups', 'mutators', 'events'];

/** District packs per mood (see city.js MOODS). */
export const MOOD_PACKS = {
  'Fun Fair': ['fair'],
  'Airport City': ['airport'],
  'Railway Town': ['rail'],
  'County Fair': ['farmfair'],
};

/** Everything a run in `mood` needs before it can start. */
export function packsFor(mood) {
  return [...CORE_PACKS, ...(MOOD_PACKS[mood] || [])];
}

/** Loading-screen line while a district's pack downloads. */
export const PACK_LABEL = {
  fair: 'Setting up the fair…', airport: 'Clearing the runway…', rail: 'Laying the tracks…', farmfair: 'Judging the pumpkins…',
  events: 'Planning a surprise…', region: 'Mobilising the army…', chain: 'Filling the gas pumps…', powerups: 'Charging capsules…', mutators: 'Inflating ducks…',
};
