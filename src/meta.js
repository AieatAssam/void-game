// Between-run progression, saved in localStorage (per-browser; the game still works if storage is blocked).
const KEY = 'void-hole-city-v1';

export const UPGRADES = {
  appetite: { name: 'Slow Metabolism', desc: 'Shrink 12% slower per level', costs: [60, 180, 450] },
  gravity: { name: 'Deep Gravity', desc: 'Pull things in from 10% further', costs: [80, 220, 520] },
  hardhat: { name: 'Hard Hat', desc: 'Hits hurt 15% less', costs: [70, 200, 480] },
  headstart: { name: 'Head Start', desc: 'Start 0.07 m wider', costs: [50, 150, 400] },
};

function load() {
  try { return { dust: 0, levels: {}, best: 0, daily: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { dust: 0, levels: {}, best: 0, daily: {} }; }
}

export const save = load();

export function persist() {
  if (location.search.includes('bot')) return; // playtest bots never touch the player's save
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage blocked: progress lasts this session */ }
}

export const level = (id) => save.levels[id] || 0;

export function buy(id) {
  const cost = UPGRADES[id].costs[level(id)];
  if (cost === undefined || save.dust < cost) return false;
  save.dust -= cost;
  save.levels[id] = level(id) + 1;
  persist();
  return true;
}

export function todaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
