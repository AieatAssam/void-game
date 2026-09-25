// Daily contracts + streak (docs/REPLAYABILITY.md #4): three small goals a day, playable in any city, that add up
// across runs. Finishing at least one keeps a streak going; the streak raises contract pay (capped at 7 days) and a
// freeze covers one missed day a week, so a busy day never wipes it out ("streaks without shame").
import { save, persist, todaySeed } from './meta.js';
import { rng } from './city.js';

// progress(stats, run) -> how much this run adds; goal: total needed today. run = { won, time, heat, mode }
const C = (id, text, goal, progress, pay) => ({ id, text, goal, progress, pay });
const n = (s, ...names) => names.reduce((a, k) => a + (s.ate[k] || 0), 0);
const PEOPLE = ['ped_business', 'ped_jogger', 'ped_tourist', 'ped_granny', 'ped_student', 'ped_chef', 'ped_worker', 'ped_kid'];
const CARS = ['car', 'car_b', 'car_c', 'taxi', 'mayor_limo', 'police_car', 'icecream_van', 'bus', 'supercar', 'classic_car'];
export const POOL = [
  C('people', 'Swallow 60 people', 60, (s) => n(s, ...PEOPLE), 20),
  C('cars', 'Swallow 20 cars', 20, (s) => n(s, ...CARS), 25),
  C('pigeons', 'Swallow 30 pigeons', 30, (s) => n(s, 'pigeon', 'rainbow_pigeon'), 15),
  C('buildings', 'Swallow 15 buildings', 15, (s) => s.buildings || 0, 25),
  C('combo', 'Reach a 20x combo', 1, (s) => (s.maxCombo >= 20 ? 1 : 0), 25),
  C('chains', 'Set off 3 chain reactions', 3, (s) => s.chains || 0, 25),
  C('capsules', 'Grab 2 power-up capsules', 2, (s) => s.capsules || 0, 20),
  C('event', 'Swallow 10 things from a city event', 10, (s) => s.eventMeals || 0, 25),
  C('crave', 'Satisfy 3 cravings', 3, (s) => s.cravings || 0, 20),
  C('rival', 'Swallow a rival hole', 1, (s) => s.rivals || 0, 30),
  C('clear', 'Clear any city', 1, (s, run) => (run.won ? 1 : 0), 35),
  C('fast', 'Clear any city in under 4:30', 1, (s, run) => (run.won && run.time < 270 ? 1 : 0), 40),
  C('heat', 'Clear any city at Heat 1 or more', 1, (s, run) => (run.won && run.heat >= 1 ? 1 : 0), 45),
  C('blitz', 'Grow past 6 m in a Blitz', 1, (s, run) => (run.mode === 'blitz' && s.best >= 6 ? 1 : 0), 25),
  C('rares', 'Swallow 2 golden rares', 2, (s) => s.rares || 0, 25),
];

/** Today's three contracts (seeded by the date: the same for everyone). */
export function today(date = todaySeed()) {
  const r = rng(date ^ 0xc047);
  const pool = [...POOL];
  const picks = [];
  while (picks.length < 3) picks.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  save.contracts ??= {};
  const st = (save.contracts[date] ??= { progress: [0, 0, 0], paid: [false, false, false] });
  return picks.map((c, i) => ({ ...c, got: Math.min(c.goal, st.progress[i]), paid: st.paid[i] }));
}

const dayIndex = (seed) => { const y = Math.floor(seed / 10000), m = Math.floor(seed / 100) % 100, d = seed % 100; return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

/** Streak state: current length, whether today already counts, freezes left this week. */
export function streak() {
  const s = (save.streak ??= { len: 0, last: 0, freezeWeek: -1 });
  const t = dayIndex(todaySeed());
  if (s.last && t - s.last > 1) {
    const week = Math.floor(t / 7);
    // one missed day a week is covered by the freeze; more than that and the streak starts over
    if (t - s.last === 2 && s.freezeWeek !== week) { s.freezeWeek = week; s.last = t - 1; persist(); }
    else if (t - s.last > 1) { s.len = 0; }
  }
  return { len: s.len, today: s.last === t, freeze: s.freezeWeek !== Math.floor(t / 7) };
}

/**
 * Add a finished run to today's contracts. Returns { list, dust, completed: [texts], streak } - dust already banked.
 */
export function scoreContracts(stats, run) {
  const date = todaySeed();
  const list = today(date);
  const st = save.contracts[date];
  const sk = streak();
  const mult = 1 + Math.min(7, sk.len + (sk.today ? 0 : 1)) * 0.1; // up to +70% on a week's streak
  let dust = 0;
  const completed = [];
  list.forEach((c, i) => {
    if (st.paid[i]) return;
    st.progress[i] = Math.min(c.goal, st.progress[i] + Math.max(0, c.progress(stats, run) || 0));
    if (st.progress[i] >= c.goal) {
      st.paid[i] = true;
      const pay = Math.round(c.pay * mult);
      dust += pay;
      completed.push(`${c.text} (+${pay})`);
    }
  });
  if (completed.length && !sk.today) { // first contract of the day extends the streak
    const s = save.streak;
    s.len += 1;
    s.last = dayIndex(date);
  }
  save.dust += dust;
  persist();
  return { list: today(date), dust, completed, streak: streak() };
}
