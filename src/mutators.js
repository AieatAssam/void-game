// Weekly mutators (HANDOVER §5.8): the Weekly button plays one city per ISO week with one rule twist.
// The city reads the active mutator while it lays itself out (city.js), main.js applies the rest.
import { save, persist } from './meta.js';

export const MUTATORS = {
  lowgrav: { name: 'Low Gravity', icon: '🪐', desc: 'Falls take 2.5× longer and things float up as they tip in. You move 10% faster.' },
  ducks: { name: 'Everything Is Ducks', icon: '🦆', desc: 'Every prop is a rubber duck of the same size. Buildings stay put.' },
  mini: { name: 'Miniature', icon: '🔎', desc: 'Half-size props, twice as many. The camera leans in.' },
  night: { name: 'Night Shift', icon: '🌙', desc: 'Forced night, searchlights in every district, every window lit.' },
  rush: { name: 'Rush Hour', icon: '🚗', desc: 'Twice the traffic at 1.5× speed.' },
};

/** ISO-8601 week of a date: { year, week } (weeks start Monday; week 1 holds the first Thursday). */
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - y0) / 86400000 + 1) / 7) };
}

/** This week's seed (e.g. 202639) and mutator; ?mutator=ducks overrides for testing. */
export function thisWeek(date) {
  const { year, week } = isoWeek(date);
  const seed = year * 100 + week;
  const ids = Object.keys(MUTATORS);
  const force = typeof location !== 'undefined' && new URLSearchParams(location.search).get('mutator');
  const id = MUTATORS[force] ? force : ids[(seed * 2654435761 >>> 0) % ids.length];
  return { seed, id, key: `${year}-W${String(week).padStart(2, '0')}`, ...MUTATORS[id] };
}

/** Keep the best result per week. */
export function recordWeek(key, r, clear) {
  save.weekly ??= {};
  const w = { r: 0, ...save.weekly[key] };
  w.r = Math.max(w.r, r);
  if (clear) w.clear = Math.min(w.clear || Infinity, clear);
  save.weekly[key] = w;
  persist();
}
