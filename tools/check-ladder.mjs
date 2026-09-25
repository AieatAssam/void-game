// No-dead-end rule 2 (PLAN.md): every edible size step must be <= 1.3x the previous one,
// so a hole of any size always has something slightly smaller to eat. Reads exported GLB metadata.
// Checked for the base game alone and for the base game plus each content pack on its own (packs appear per city).
import { readFileSync, existsSync } from 'node:fs';

const MAX_STEP = 1.3;
const START_EDIBLE = 0.45 * 0.95; // a new hole already eats everything below this, so gaps down there can't trap anyone
const EDIBLE = new Set(['prop', 'poison', 'unit', 'hazard']);
const base = JSON.parse(readFileSync('public/models/index.json', 'utf8'));
const packs = existsSync('public/models/packs.json') ? JSON.parse(readFileSync('public/models/packs.json', 'utf8')) : {};
const packNames = [...new Set(Object.values(packs).map((a) => a.pack))].sort();

function check(label, m, verbose) {
  const tiers = Object.entries(m).filter(([, a]) => EDIBLE.has(a.kind) && a.kind !== 'poison')
    .map(([name, a]) => [name, a.tier]).sort((a, b) => a[1] - b[1]);
  let ok = true;
  for (let i = 1; i < tiers.length; i++) {
    const r = tiers[i][1] / tiers[i - 1][1];
    const bad = r > MAX_STEP && tiers[i][1] > START_EDIBLE;
    ok &&= !bad;
    if (verbose || bad) console.log(`${bad ? 'GAP ' : '    '}${tiers[i - 1][0].padEnd(16)} ${tiers[i - 1][1].toFixed(2).padStart(6)} -> ${tiers[i][0].padEnd(16)} ${tiers[i][1].toFixed(2).padStart(6)}  x${r.toFixed(2)}`);
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  return ok;
}

let ok = check('base', base, true);
for (const p of packNames) {
  const extra = Object.fromEntries(Object.entries(packs).filter(([, a]) => a.pack === p));
  ok = check(`base + ${p}`, { ...base, ...extra }, false) && ok;
}
if (!ok) { console.error(`\nSize ladder has gaps > x${MAX_STEP}. Add a prop in between.`); process.exit(1); }
console.log('\nSize ladder OK');
