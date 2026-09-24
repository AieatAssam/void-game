// Star challenges + city progression (HANDOVER §5.5, §5.6). Three goals per city, saved as a 3-bit mask per mood.
// Cities unlock in order: clear the previous one, or earn 2 of its stars. Stars also unlock skins (skins.js).
import { save, persist } from './meta.js';

export const ORDER = ['Old Town', 'Suburbia', 'Waterfront', 'County Fair', 'Seaside', 'Fun Fair', 'Railway Town', 'Boomtown', 'Neon Nights', 'Airport City'];
// the landmark shown on each city's picker card (thumbnail once rendered; the emoji until then)
export const LANDMARK = {
  'Old Town': ['clock_tower', '🕰️'], Suburbia: ['house', '🏡'], Waterfront: ['rowboat', '🚣'], 'County Fair': ['prize_pumpkin', '🎃'],
  Seaside: ['lifeguard_tower', '🏖️'], 'Fun Fair': ['ferris_wheel', '🎡'], 'Railway Town': ['locomotive', '🚂'], Boomtown: ['crane', '🏗️'],
  'Neon Nights': ['arcade', '🕹️'], 'Airport City': ['airliner', '✈️'],
};

// ---------- run stats the challenges read (filled in by main.js) ----------
export function newStats() {
  return { ate: {}, times: {}, rams: 0, poison: 0, concrete: 0, spotted: 0, rivalMeets: 0, maxCombo: 0, starved: false,
    tides: 0, tideLoss: 0, movingTrain: 0, eventLive: null, starAt: [0, Infinity, Infinity, Infinity, Infinity], initial: {} };
}
const n = (s, ...names) => names.reduce((a, k) => a + (s.ate[k] || 0), 0);
const first = (s, name) => s.times[name]?.[0] ?? Infinity;
/** Most of `names` eaten inside any `win` seconds. */
function burst(s, names, win) {
  const t = names.flatMap((k) => s.times[k] || []).sort((a, b) => a - b);
  let best = 0;
  for (let i = 0, j = 0; i < t.length; i++) { while (t[i] - t[j] > win) j++; best = Math.max(best, i - j + 1); }
  return best;
}

// end(s, won, time) -> earned? Goals that say "never" or "no" count only on a clear (dying early isn't careful play).
const C = (mood, text, end) => ({ mood, text, end });
export const CHALLENGES = [
  C('Old Town', 'Clear the city in under 5:00', (s, won, t) => won && t < 300),
  C('Old Town', 'Eat the clock tower before ★★★', (s) => first(s, 'clock_tower') < s.starAt[3]),
  C('Old Town', 'Clear without being rammed', (s, won) => won && s.rams === 0),
  C('Suburbia', 'Eat 50 garden gnomes', (s) => n(s, 'gnome', 'golden_gnome') >= 50),
  C('Suburbia', 'Clear without eating poison', (s, won) => won && s.poison === 0),
  C('Suburbia', 'Clear with at most 2 rival encounters', (s, won) => won && s.rivalMeets <= 2),
  C('Waterfront', 'Eat 10 rowboats', (s) => n(s, 'rowboat') >= 10),
  C('Waterfront', 'Clear without the belly ever running empty', (s, won) => won && !s.starved),
  C('Waterfront', 'Reach a 40× combo', (s) => s.maxCombo >= 40),
  C('County Fair', 'Eat 3 prize pumpkins', (s) => n(s, 'prize_pumpkin') >= 3),
  C('County Fair', 'Eat 10 hay bales', (s) => n(s, 'hay_bale') >= 10),
  C('County Fair', 'Eat every scarecrow', (s) => (s.initial.scarecrow || 0) > 0 && n(s, 'scarecrow') >= s.initial.scarecrow),
  C('Seaside', 'Eat every lifeguard tower', (s) => (s.initial.lifeguard_tower || 0) > 0 && n(s, 'lifeguard_tower') >= s.initial.lifeguard_tower),
  C('Seaside', 'Survive 3 tides without shrinking', (s) => s.tides >= 3 && s.tideLoss === 0),
  C('Seaside', 'Eat 20 crabs', (s) => n(s, 'crab') >= 20),
  C('Fun Fair', 'Eat the ferris wheel', (s) => n(s, 'ferris_wheel') >= 1),
  C('Fun Fair', 'Eat 8 bumper cars', (s) => n(s, 'bumper_car') >= 8),
  C('Fun Fair', 'Clear the city during the parade', (s, won) => won && s.eventLive === 'parade'),
  C('Railway Town', 'Swallow a moving train', (s) => s.movingTrain > 0),
  C('Railway Town', 'Eat the station in under 3:00', (s) => first(s, 'station') < 180),
  C('Railway Town', 'Eat 3 carriages within 10 s', (s) => burst(s, ['carriage'], 10) >= 3),
  C('Boomtown', 'Eat the crane in under 3:00', (s) => first(s, 'crane') < 180),
  C('Boomtown', 'Eat 10 cement trucks', (s) => n(s, 'cement_truck') >= 10),
  C('Boomtown', 'Clear without a concrete hit', (s, won) => won && s.concrete === 0),
  C('Neon Nights', 'Reach a 30× combo', (s) => s.maxCombo >= 30),
  C('Neon Nights', 'Clear without being caught in a searchlight', (s, won) => won && s.spotted === 0),
  C('Neon Nights', 'Eat 3 arcades within 60 s', (s) => burst(s, ['arcade'], 60) >= 3),
  C('Airport City', 'Eat the airliner', (s) => n(s, 'airliner') >= 1),
  C('Airport City', 'Eat 5 baggage trains', (s) => n(s, 'baggage_tug') >= 5),
  C('Airport City', 'Clear without being rammed', (s, won) => won && s.rams === 0),
];
export const forMood = (mood) => CHALLENGES.filter((c) => c.mood === mood);

// ---------- save schema ----------
save.stars ??= {}; // mood -> 3-bit mask
save.cleared ??= {}; // mood -> true
if (!save.progress1) { // migration: seasoned players (best >= 6 m) start with the first four cities open
  save.progress1 = true;
  if (save.best >= 6) save.openTo = 4;
  persist();
}

export const starMask = (mood) => save.stars[mood] || 0;
export const starCount = (mood) => [0, 1, 2].filter((i) => starMask(mood) & (1 << i)).length;
export const totalStars = () => ORDER.reduce((a, m) => a + starCount(m), 0);

/** A city is open if it is first, was opened by migration, or the city before it was cleared / earned 2 stars. */
export function unlocked(mood) {
  const i = ORDER.indexOf(mood);
  if (i <= 0 || location.search.includes('allcities')) return true;
  if (i < (save.openTo || 1)) return true;
  const prev = ORDER[i - 1];
  return !!save.cleared[prev] || starCount(prev) >= 2;
}

/**
 * Score a finished run: returns the challenges newly earned ({ index, text }) and the full state of all three.
 * Daily/weekly runs score for their city too.
 */
export function scoreRun(mood, stats, won, time) {
  const list = forMood(mood);
  const before = starMask(mood);
  let mask = before;
  const out = list.map((c, i) => {
    let ok = false;
    try { ok = !!c.end(stats, won, time); } catch { ok = false; }
    if (ok) mask |= 1 << i;
    return { text: c.text, done: !!(mask & (1 << i)), fresh: ok && !(before & (1 << i)) };
  });
  const wasOpen = ORDER.filter(unlocked);
  save.stars[mood] = mask;
  if (won) save.cleared[mood] = true;
  const nowOpen = ORDER.filter(unlocked).filter((m) => !wasOpen.includes(m));
  persist();
  return { list: out, fresh: out.filter((c) => c.fresh).length, opened: nowOpen };
}

/** The horizontal city picker: landmark, name, stars, lock. onPick(mood) for open cities. */
export function renderPicker(el, selected, onPick, thumbOf) {
  el.replaceChildren(...ORDER.map((mood) => {
    const open = unlocked(mood), [land, emoji] = LANDMARK[mood], img = thumbOf(land);
    const b = document.createElement('button');
    b.className = `city${mood === selected ? ' on' : ''}${open ? '' : ' locked'}`;
    b.disabled = !open;
    const st = starMask(mood);
    b.innerHTML = `${img ? `<img alt="" src="${img}">` : `<i>${emoji}</i>`}<b>${mood}</b>`
      + `<span>${[0, 1, 2].map((k) => (st & (1 << k) ? '★' : '☆')).join('')}</span>${open ? '' : '<em>🔒</em>'}`;
    b.title = open ? forMood(mood).map((c, k) => `${st & (1 << k) ? '★' : '☆'} ${c.text}`).join('\n')
      : `Clear ${ORDER[ORDER.indexOf(mood) - 1]} or earn 2 of its stars`;
    b.onclick = () => open && onPick(mood);
    return b;
  }));
  el.querySelector('.on')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
}
