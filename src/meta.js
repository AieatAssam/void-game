// Between-run progression, saved in localStorage (per-browser; the game still works if storage is blocked).
const KEY = 'void-hole-city-v1';

// Upgrades are small edges, not win buttons: each level is a few percent, and most carry a cost.
export const UPGRADES = {
  appetite: { name: 'Slow Metabolism', desc: 'Shrink 6% slower per level — but meals fill 4% less', costs: [120, 320, 750] },
  gravity: { name: 'Deep Gravity', desc: 'Swallow from 6% further per level — poison included', costs: [140, 360, 800] },
  hardhat: { name: 'Hard Hat', desc: 'Hits hurt 10% less per level', costs: [130, 340, 780] },
  headstart: { name: 'Head Start', desc: 'Start 0.04 m wider per level', costs: [100, 280, 650] },
  quiet: { name: 'Quiet Void', desc: 'Notoriety builds 10% slower per level', costs: [150, 380, 850] },
};

// Run economy (dust). Scarce on purpose: a strong clear pays ~150-250 before its card multiplier, a loss 15-60.
export const ECON = {
  perScore: 1.0, // dust = perScore * sqrt(score) where score = footprint area eaten (m²)
  winBonus: 50,
  speedBonus: 30, // full at a 5:00 clear, nothing at 12:00
  comboDust: 0.55, // x sqrt(capped combo bonus)
  rare: 10,
  craving: 3,
  rival: 10,
  dailyFirstClear: 50,
  lossShare: 0.5, // a run that ends in defeat keeps half of what its meals and combos earned
};

function load() {
  try { return { dust: 0, levels: {}, best: 0, daily: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { dust: 0, levels: {}, best: 0, daily: {} }; }
}

export const save = load();
// Economy v2 (scarcity rework): runs used to pay tens of thousands of dust. Bring old banks back to earth once.
if (!save.econ2) {
  save.econ2 = true;
  save.dust = Math.min(save.dust, 300);
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage blocked */ }
}

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
