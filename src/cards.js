// Challenge cards (item 14): one rule twist per run for a dust multiplier. Daily city gets a fixed card.
export const VEHICLES = new Set(['car', 'car_b', 'car_c', 'taxi', 'bus', 'icecream_van', 'police_car', 'cement_truck', 'tank', 'heli',
  'scooter', 'bicycle', 'mayor_limo', 'rowboat', 'hotdog_cart',
  'supercar', 'classic_car', 'bumper_car', 'tractor', 'baggage_tug', 'locomotive', 'carriage', 'airliner']);

export const CARDS = {
  none: { name: 'No card', desc: 'The classic city.', mult: 1 },
  vehicles: { name: 'Car Crusher', desc: 'Vehicles grow you 1.5×, everything else only 0.25×.', mult: 1.6 },
  clean: { name: 'Clean Diet', desc: 'Swallow any poison and the run ends.', mult: 1.4 },
  rush: { name: 'Rush Hour', desc: 'Clear the city within 5:00.', mult: 2 },
  hot: { name: 'Hot Start', desc: 'Heat never drops below ★2.', mult: 1.5 },
  crowded: { name: 'Crowded', desc: 'Three rival holes instead of two.', mult: 1.6 },
  glass: { name: 'Glass Cannon', desc: 'Grow 50% faster. Hits hurt twice as much.', mult: 1.3 },
  lonely: { name: 'Lone Hole', desc: 'No rivals, but you shrink 30% faster.', mult: 1.2 },
};

const PICKABLE = Object.keys(CARDS).filter((k) => k !== 'none');

/** Three distinct cards for a seed (the offer shown before a run). */
export function offer(r) {
  const pool = [...PICKABLE];
  const out = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

export function dailyCard(r) { return PICKABLE[Math.floor(r() * PICKABLE.length)]; }
