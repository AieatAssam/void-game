import * as THREE from 'three/webgpu';
import { createRenderer, createScene, followSun, applyTime, setFogRange, TIMES } from './look.js';
import { loadAll, loadPack, loadPacks, packReady, pedTime, glow } from './assets.js';
import { City, rng, BUILDINGS, PEOPLE, moodFor, forcedMood, SHADOW_LAYER } from './city.js';
import { packsFor, PACK_LABEL, MOOD_PACKS } from './packs.js';
import { Hole, holeField } from './hole.js';
import { Rivals } from './rivals.js';
import { SKINS } from './skins.js';
import { CARDS, VEHICLES, offer, dailyCard } from './cards.js';
import { record, renderBook, title, bookEntries, thumb, warmThumbs } from './book.js';
import { Director } from './director.js';
import { Events } from './events.js';
import { Chains } from './chains.js';
import { Powerups, POWERS } from './powerups.js';
import { Abilities, ABILITIES, owned, slots, buyAbility, equip } from './abilities.js';
import { thisWeek, recordWeek, MUTATORS } from './mutators.js';
import { newStats, scoreRun, renderPicker, unlocked, totalStars, LANDMARK } from './progress.js';
import { installBot } from './bot.js';
import { UPGRADES, ECON, save, persist, level, buy, todaySeed } from './meta.js';
import * as sfx from './sfx.js';
import { Post } from './post.js';
import { Sparks, Debris, SMOKE, Wisps, Birds, Rubble } from './fx.js';
import { surfaceTime, surfaceOn, world, lightsTime, lightsPulse, viewScale } from './surface.js';
import { Grass } from './grass.js';
import { Q } from './quality.js';
import { PERKS, DRAFT_AT, offerPerks, modsFor } from './perks.js';
import { HEAT, heatMods, heatPay, heatMax, heatBest, recordHeat } from './heat.js';
import { today as todaysContracts, streak, scoreContracts } from './contracts.js';
import { Region, slicer } from './region.js';
import { Army } from './army.js';
import { Minimap } from './minimap.js';
import { P2, News, residents, quietDirector, quietEvents, quietChains, quietRivals } from './phase2.js';

const $ = (id) => document.getElementById(id);
const renderer = await createRenderer($('c'));
const look = createScene();
const { scene, sun } = look;
sun.shadow.camera.layers.enable(SHADOW_LAYER); // shadow-only stand-ins (city.js shadowProxies)
// Longer lens: less perspective distortion on tall props and a truer miniature/tilt-shift read.
const FOV = 26, LENS = Math.tan(THREE.MathUtils.degToRad(19)) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 1600);
const PITCH = THREE.MathUtils.degToRad(55);
const post = new Post(renderer, scene, camera);
const sparks = new Sparks();
scene.add(sparks.points);
const debris = new Debris();
scene.add(debris.group);
const wisps = new Wisps(); // Phase 2: low cloud between the camera and the land
scene.add(wisps.sprite);
const birds = new Birds(); // Phase 2: flocks over the countryside
const rubble = new Rubble(); // Phase 2: what spills over the rim
const minimap = new Minimap(); // Phase 2
scene.add(birds.sprite, rubble.mesh);
const LOW_FX = /[?&]low\b/.test(location.search); // ?low: skip extra particles and smoke
// debug framing for screenshots: ?view=x,z,dist[,yaw,pitch]
const VIEW = new URLSearchParams(location.search).get('view')?.split(',').map(Number);
const smokeCol = new THREE.Color();
const dustCol = new THREE.Color(0xb3a28c);

// ---------- starvation tuning (PLAN.md: keep moving or the ground seals) ----------
const BELLY_DRAIN = 1 / 8; // a full belly lasts 8s (at the start: the void gets hungrier as the run goes on)
const HUNGER_RAMP = 240; // seconds for the belly to drain twice as fast
const MEAL = 0.15; // eating this fraction of the hole's own area fills the belly
const DECAY_FED = 0.016; // area fraction lost per second while the belly has food
const DECAY_STARVING = 0.09; // ... while it is empty
const DEAD_R = 0.26;
const MAX_HIT = 0.25; // rule 3: no single hit takes more than 25%

// Loading: files are ~80% of the bar, then building the first city and compiling its shaders (each stage paints first).
// compile pipelines up front, but never wait on it forever: three's WebGL backend polls parallel compiles with
// requestAnimationFrame, which never fires in a background tab (the load used to stall at 90% there)
async function precompile() {
  try { await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))]); } catch (e) { console.warn('precompile skipped', e); }
}
const nextPaint = () => new Promise((r) => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => setTimeout(r, 0)))); // (no rAF in a background tab)
let lastLabel = '';
const TIPS = ['Swallow what fits. Everything bigger waits until you grow.', 'Clear the town and the hole breaks out across the island.',
  'Villages, castles, cities: the whole island is on the menu.', 'Woods and herds keep you fed on the long roads between towns.',
  'Red rings mean something is about to land on you. Move!', 'Shrink too far and the army drops a lid on the hole for good.'];
let tipI = Math.floor(Math.random() * TIPS.length);
const tipEl = $('tip'), showTip = () => { tipEl.textContent = TIPS[tipI++ % TIPS.length]; tipEl.classList.remove('in'); void tipEl.offsetWidth; tipEl.classList.add('in'); };
showTip();
const tipTimer = setInterval(showTip, 3600);
function setLoad(label, p) {
  const [l, n] = $('load').querySelectorAll('p:first-of-type span, p:first-of-type b');
  l.textContent = label;
  n.textContent = `${Math.round(p * 100)}%`;
  $('load').style.setProperty('--p', p);
  if (label !== lastLabel) console.info(`[load] ${(performance.now() / 1000).toFixed(1)}s ${lastLabel = label}`);
}
setLoad('Unpacking the toybox…', 0);
const assets = await loadAll((p) => setLoad(p < 1 ? 'Unpacking the toybox…' : 'Growing trees…', p * 0.8));
setLoad('Growing the countryside…', 0.82);
await nextPaint();

// Size-up moments: each milestone is reached when every example in it fits the hole (sizes come from the manifest).
const MILESTONES = [['people', ['ped_business', 'ped_granny', 'ped_kid']], ['benches & bikes', ['bench', 'bicycle', 'vending']],
  ['cars', ['car', 'taxi', 'car_c']], ['vans & buses', ['icecream_van', 'police_car', 'bus']], ['houses', ['house', 'shop', 'cafe']],
  ['apartments', ['apartment', 'office', 'hotel']], ['skyscrapers', ['skyscraper', 'clock_tower', 'crane']]]
  .map(([label, names]) => { names = names.filter((n) => assets[n]); return { label, names, need: Math.max(...names.map((n) => assets[n].meta.tier)) / 0.95 }; })
  .sort((a, b) => a.need - b.need);
// Collection thumbnails render lazily, one at a time, milestone icons first, and never while a run is being played.
if (!location.search.includes('nothumbs')) {
  setTimeout(() => warmThumbs(assets, MILESTONES.flatMap((m) => m.names), () => state?.playing), 3000);
}
const levelEl = Object.assign(document.createElement('div'), { id: 'levelup' });
document.body.append(levelEl);
let bannerUntil = 0; // while the size-up banner owns the top of the screen, friendly toasts and combos wait their turn
function sizeUp(m) {
  bannerUntil = performance.now() + 1800;
  hole.shockwave();
  sfx.levelUp();
  levelEl.innerHTML = `<small>Size up · ${hole.r.toFixed(1)} m</small><b>Now eating ${m.label}!</b><span>${m.names.map((n) => thumb(assets[n])).filter(Boolean).map((u) => `<img alt="" src="${u}">`).join('')}</span>`;
  levelEl.classList.remove('show');
  void levelEl.offsetWidth;
  levelEl.classList.add('show');
}

// Panicked shouts over fleeing people (a small pool of DOM bubbles that follow their owner).
const bubbles = Array.from({ length: 6 }, () => {
  const b = Object.assign(document.createElement('div'), { className: 'shout', hidden: true });
  document.body.append(b);
  return { b, e: null, t: 0 };
});
const SHOUTS = ['!', 'Aah!', 'Eek!', 'Run!', 'Help!', '!!', 'Nooo!'];
function shout(e) {
  const s = bubbles.find((q) => q.t <= 0);
  if (!s) return;
  Object.assign(s, { e, t: 1.1 });
  s.b.textContent = SHOUTS[Math.floor(Math.random() * SHOUTS.length)];
  s.b.hidden = false;
  s.b.classList.remove('pop');
  void s.b.offsetWidth;
  s.b.classList.add('pop');
}

/** Small JPEG of the frame just drawn (for the "biggest bite" polaroid). */
function snapshot() {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = Math.round(320 * canvas.height / canvas.width);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

const field = holeField();
const DAY_TIMES = Object.keys(TIMES).filter((k) => !TIMES[k].night);
let city, hole, state, director, rivals, grass, events, chains, powerups, abilities;
const randomSeed = () => (Math.random() * 2 ** 31) | 0;
// Normal runs play the city picked in the menu; daily/weekly (and the playtest bot) roll the seed's own mood.
const BOT = location.search.includes('bot');
// Phase 2 (docs/PHASE2.md): clearing the town breaks the hole out into the countryside. Bot balance runs keep the old
// ending unless they ask (?region starts straight in Phase 2; ?nophase2 turns it off).
const START_REGION = /[?&]region\b/.test(location.search);
const PHASE2 = !/[?&]nophase2\b/.test(location.search) && (!BOT || START_REGION);
let pickedCity = forcedMood()?.name || (save.city && unlocked(save.city) ? save.city : 'Old Town');
const runMood = (seed, daily) => (daily || BOT || forcedMood() ? moodFor(seed).name : pickedCity);

/** Download (once) every pack a mood needs, with the staged loading line. Resolves true if anything was fetched. */
async function ensurePacks(moodName, show = setLoad) {
  const need = packsFor(moodName).filter((p) => !packReady(assets, p));
  if (!need.length) return false;
  const label = PACK_LABEL[need.find((p) => Object.values(MOOD_PACKS).flat().includes(p)) || need[0]];
  await loadPacks(assets, need, (p) => show(label, p));
  if (!location.search.includes('nothumbs')) warmThumbs(assets, [], () => state?.playing); // book pages for the new models
  return true;
}

const BLITZ = 120; // Blitz: grow as big as you can in two minutes
// ?heat=N / ?mode=blitz: start that way (bot balance runs, testing)
const URL_HEAT = Math.min(HEAT.length, +new URLSearchParams(location.search).get('heat') || 0);
let pickedHeat = URL_HEAT;
const pickedMode = new URLSearchParams(location.search).get('mode') === 'blitz' ? 'blitz' : 'city';
function newRun(seed = randomSeed(), daily = false, card = 'none', mood = null, mutator = null, heat = 0, mode = 'city') {
  minimap.stop();
  rubble.clear();
  const hm = heatMods(heat);
  if (state?.slice) { // a region was being prebuilt for the last run: drop it
    state.slice.cancelled = true;
    state.regionJob?.then((r) => { if (r && !r.finished) r.terrain.dispose(); });
  }
  if (city) { powerups.dispose(); scene.remove(city.group, hole.group, grass.group); city.dispose(); hole.dispose(); director.dispose(); rivals.dispose(); grass.dispose(); events.dispose(); chains.dispose(); }
  const debugR = +new URLSearchParams(location.search).get('r') || 0; // screenshot/debug: start bigger
  hole = new Hole(assets, field, 0, { r: debugR || 0.45 + level('headstart') * 0.04, skin: save.skin || 'void' });
  hole.pull = 1 + level('gravity') * 0.06;
  city = new City(assets, seed, field, { mood, mutator });
  director = new Director(city, scene, { hurt, toll, spotted, ram, drain, siren: sfx.siren, warn: (t) => flash(t, false), tide }, Math.max(card === 'hot' ? 2 : 0, hm.minStars));
  director.sizeK = hm.heatSize;
  director.cool.snack = hm.snackDelay;
  director.notorietyMult = 1 - level('quiet') * 0.1;
  chains = new Chains(city, scene, debris, sparks, {
    shake: (k) => { state.shake = Math.max(state.shake, k); }, boom: sfx.boom, crackle: sfx.crackle,
    notice: (n) => director.notice(n), flash: (t) => flash(t, false), chain: () => { state.stats.chains++; },
  });
  powerups = new Powerups(assets, city, field, seed, save.skin || 'void', {
    flash: (t) => flash(t, false), star: () => { sfx.star(); sfx.whoosh(); }, slotTaken: (i) => i <= rivals.list.length,
    took: () => { state.stats.capsules++; },
  });
  // ?abil=quake,dash: the playtest bot equips these (and fires them greedily) regardless of the save
  const botAbil = new URLSearchParams(location.search).get('abil')?.split(',').filter((a) => ABILITIES[a]);
  abilities = new Abilities(botAbil || slots(totalStars()), {
    shake: (k) => { state.shake = Math.max(state.shake, k); state.punch = 1; }, boom: sfx.boom, whoosh: sfx.whoosh,
    ripple: () => hole.shockwave(),
  });
  renderAbilityButtons();
  events = new Events(city, scene, { warn: (t) => { flash(t, false); sfx.drums(); }, boom: sfx.boom });
  rivals = new Rivals(assets, field, city, scene, card === 'crowded' ? 3 : card === 'lonely' ? 0 : Math.min(3, 2 + hm.rivals), save.skin || 'void');
  rivals.sizeK = hm.rivalSize;
  // Randomised start: time of day, and a calm open tile (never a downtown lot) at a random spot on it.
  const r = rng(seed ^ 0x5eed);
  const time = new URLSearchParams(location.search).get('time') || (city.mood.night || mutator === 'night' ? 'night' : r.pick(DAY_TIMES));
  const preset = applyTime(look, renderer, time);
  look.grade = preset.grade;
  post.setPreset(preset);
  glow.value = preset.glow;
  world.night.value = TIMES[time]?.night ? 1 : 0;
  world.edCol.value.set(SKINS[save.skin || 'void'].rim);
  const want = new URLSearchParams(location.search).get('start'); // screenshot/debug: start on a given tile type
  let open = city.tiles.filter((t) => ['plaza', 'park', 'residential', 'canal', 'parking', 'beach', 'neon', 'fair', 'rail'].includes(t.type));
  if (want && open.some((t) => t.type === want)) open = open.filter((t) => t.type === want);
  const t = r.pick(open);
  const a = r() * Math.PI * 2;
  hole.x = t.cx + Math.cos(a) * 13.5;
  hole.z = t.cz + Math.sin(a) * 13.5;
  // breadcrumbs: a few wandering snacks right around the start so the first seconds always have food
  for (let k = 0; k < (hm.snackDelay ? 0 : 10); k++) { // (Heat "Lean Start": none)
    const b = r() * Math.PI * 2, d = 2.5 + r() * 6;
    city.revive(r.pick([...PEOPLE, 'pigeon']), hole.x + Math.cos(b) * d, hole.z + Math.sin(b) * d, hole.x, hole.z);
  }
  $('where').textContent = `${city.mood.name} · ${city.N}×${city.N} blocks · ${time}${mutator ? ` · ${MUTATORS[mutator].icon} ${MUTATORS[mutator].name}` : ''}${heat ? ` · 🔥 Heat ${heat}` : ''}${mode === 'blitz' ? ' · ⏱ Blitz' : ''}`;
  grass = new Grass(renderer, city.groundMeshes, city.half + 80, field, { density: +(new URLSearchParams(location.search).get('grass') ?? Q.grass), far: Q.grassFar,
    lawns: city.tiles.filter((t) => t.type === 'park').map((t) => [t.cx, t.cz]) });
  scene.add(city.group, hole.group, grass.group);
  state = { playing: false, seed, daily, card, time: 0, belly: 1, eaten: 0, score: 0, best: hole.r, stars: 0,
    reverse: 0, jam: 0, slow: 0, invuln: 0, shake: 0, sealing: 0, hits: [], left: city.buildingsLeft(), combo: 0, comboT: 0, bonus: 0,
    rares: 0, rivalsEaten: 0, hitstop: 0, punch: 0, finale: 0, mi: MILESTONES.filter((m) => hole.r >= m.need * city.scaleK).length, mutator,
    crave: null, craveCool: 18, cravings: 0, wet: 0, mood: city.mood.name, stats: newStats(),
    heat, hm, mode, perks: [], mods: modsFor([]), drafts: 0, draftsDue: 0, draft: null, happy: 0, phase: 1, pop: 0, slowmo: 1,
    // Happy Hour: about every other run, once, somewhere in the middle - a surprise 20 s feast (variable reward)
    happyAt: r() < 0.55 ? 60 + r() * 150 : Infinity };
  Object.assign(state.stats, { buildings: 0, chains: 0, capsules: 0, eventMeals: 0 });
  applyMods();
  for (const e of city.entities) if (e.alive && (e.name === 'scarecrow' || e.name === 'lifeguard_tower')) state.stats.initial[e.name] = (state.stats.initial[e.name] || 0) + 1;
}
/** Push the run's perk + Heat numbers into the systems that read them. */
function applyMods() {
  const m = state.mods, hm = state.hm;
  hole.pull = (1 + level('gravity') * 0.06) * m.pull;
  director.notorietyMult = (1 - level('quiet') * 0.1) * m.noto * hm.noto;
  chains.reach = m.chain;
  chains.fireNoto = m.fireworksNoto;
  powerups.gapK = m.capsules * hm.capsules;
  rivals.hungerK = m.rivalHunger;
  perkChips();
}

// ---------- perk drafts (docs/REPLAYABILITY.md #1): at some size-ups the world slows and you pick 1 of 3 ----------
const draftEl = Object.assign(document.createElement('div'), { id: 'draft', hidden: true });
const perksEl = Object.assign(document.createElement('div'), { id: 'perks' });
document.body.append(draftEl, perksEl);
function openDraft() {
  if (!state.playing || state.draft || !state.draftsDue) return;
  state.draftsDue--;
  const opts = offerPerks(state.seed, state.drafts++, state.perks);
  if (!opts.length) return;
  if (BOT) { takePerk(opts[0]); return; } // the playtest bot takes the first offer, instantly
  state.draft = opts;
  draftEl.innerHTML = `<p>The void mutates · pick one <small>(1-${opts.length})</small></p>`;
  draftEl.append(...opts.map((id, i) => {
    const pk = PERKS[id], b = document.createElement('button');
    b.className = 'chal perk';
    b.innerHTML = `<b>${pk.icon} ${pk.name}</b><small>${pk.desc}</small><em>${i + 1}</em>`;
    b.onclick = () => takePerk(id);
    return b;
  }));
  draftEl.hidden = false;
  sfx.star();
}
function takePerk(id) {
  state.perks.push(id);
  state.mods = modsFor(state.perks);
  applyMods();
  state.draft = null;
  draftEl.hidden = true;
  hole.shockwave();
  sfx.levelUp();
  flash(`${PERKS[id].icon} ${PERKS[id].name}`, false);
  if (state.draftsDue) setTimeout(openDraft, 600);
}
addEventListener('keydown', (e) => {
  const i = +e.key - 1;
  if (state?.draft && i >= 0 && i < state.draft.length) { e.preventDefault(); e.stopImmediatePropagation(); takePerk(state.draft[i]); }
}, true);
function perkChips() {
  perksEl.replaceChildren(...state.perks.map((id) => Object.assign(document.createElement('span'), { textContent: PERKS[id].icon, title: `${PERKS[id].name}: ${PERKS[id].desc}` })));
  perksEl.hidden = !state.perks.length;
}

const URL_SEED = new URLSearchParams(location.search).get('seed');
const firstSeed = URL_SEED ? +URL_SEED : randomSeed();
await ensurePacks(runMood(firstSeed, false), (label, p) => setLoad(label, 0.82 + p * 0.06));
// ?mutator=<id> builds the menu city with this week's twist (testing / screenshots)
newRun(firstSeed, false, 'none', runMood(firstSeed, false), MUTATORS[new URLSearchParams(location.search).get('mutator')] ? new URLSearchParams(location.search).get('mutator') : null);
// compile every pipeline now, behind the loading screen, instead of stuttering through the first seconds of play
setLoad('Warming up shaders…', 0.9);
await nextPaint();
await precompile();
setLoad('Opening the ground…', 0.98);
await nextPaint();
$('load').hidden = true;
$('menu').hidden = false;
$('screen').classList.remove('loading');
clearInterval(tipTimer);
window.__game = () => ({ hole, city, state, renderer, director, rivals, events, chains, powerups, camera, scene, grass, THREE });
window.__abil = () => abilities;
window.__info = () => { const r = renderer.info.render; return { calls: r.drawCalls, tris: r.triangles, frameCalls: r.frameCalls }; };
if (location.search.includes('bot')) installBot();

// ---------- input: steer toward pointer / drag / keys ----------
const input = { keys: new Set(), drag: null, mouse: null };
addEventListener('keydown', (e) => {
  input.keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'm') muteToggle();
});
addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') input.drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; });
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') input.mouse = { x: e.clientX - innerWidth / 2, y: e.clientY - innerHeight / 2 };
  else if (input.drag) { input.drag.dx = e.clientX - input.drag.x; input.drag.dy = e.clientY - input.drag.y; }
});
addEventListener('pointerup', () => { input.drag = null; });
canvas.addEventListener('pointerleave', () => { input.mouse = null; });

/**
 * Steering. Mouse = "go here": the hole arrives at the ground point under the cursor and settles there (speed eases
 * off inside a few metres, stops inside its own rim), and if something it can swallow is near that point the aim
 * snaps onto it. Distances are in world metres, so it feels the same at every zoom. Keys and touch-drag are a
 * joystick with a gentle bend toward edible things just ahead.
 */
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
function steer() {
  let x = 0, z = 0;
  const k = input.keys;
  if (k.has('a') || k.has('arrowleft')) x -= 1;
  if (k.has('d') || k.has('arrowright')) x += 1;
  if (k.has('w') || k.has('arrowup')) z -= 1;
  if (k.has('s') || k.has('arrowdown')) z += 1;
  aim.visible = false;
  if (!x && !z && input.mouse && !input.drag) {
    // where on the ground the cursor points
    _ndc.set(input.mouse.x / (innerWidth / 2), -input.mouse.y / (innerHeight / 2));
    _ray.setFromCamera(_ndc, camera);
    if (_ray.ray.intersectPlane(_ground, _hit)) {
      let tx = _hit.x, tz = _hit.z;
      const snap = stickyLock(tx, tz, Math.max(1.2, hole.r * 0.9));
      if (snap) { tx = snap.x; tz = snap.z; }
      const dx = tx - hole.x, dz = tz - hole.z, d = Math.hypot(dx, dz);
      // a locked target (often running away) is chased at full speed right onto it; bare ground eases in and parks
      const dead = snap ? 0 : hole.r * 0.35, ease = snap ? 0.4 : Math.max(2.5, hole.r * 2.2);
      const f = THREE.MathUtils.clamp((d - dead) / ease, 0, 1);
      if (d > 1e-3) { x = (dx / d) * f; z = (dz / d) * f; }
      showAim(tx, tz, snap);
    }
  } else {
    lock = null;
    const v = input.drag ? { x: input.drag.dx, y: input.drag.dy } : null;
    if (!x && !z && v) {
      const full = Math.min(innerWidth, innerHeight) * 0.22, len = Math.hypot(v.x, v.y);
      if (len > 10) { const m = Math.min(1, (len - 10) / full) / len; x = v.x * m; z = v.y * m; }
    }
    // joystick assist: bend a little toward the best edible thing just ahead
    const len0 = Math.hypot(x, z);
    if (len0 > 0.2) {
      const best = aimAhead(x / len0, z / len0);
      if (best) {
        const bx = best.x - hole.x, bz = best.z - hole.z, bl = Math.hypot(bx, bz) || 1;
        x = x * 0.65 + (bx / bl) * len0 * 0.35;
        z = z * 0.65 + (bz / bl) * len0 * 0.35;
      }
    }
  }
  [x, z] = rimMagnet(x, z);
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return state.reverse > 0 ? [-x, -z] : [x, z];
}

const NOMAGNET = /[?&]nomagnet\b/.test(location.search); // A/B testing the assist
/** Aim lock with a little stickiness: keep the locked target until the cursor wanders well away from it (no flicker). */
let lock = null;
function stickyLock(px, pz, R) {
  if (lock && edibleNow(lock) && (lock.x - px) ** 2 + (lock.z - pz) ** 2 < (R * 1.6 + lock.meta.tier * 0.8) ** 2) return lock;
  return (lock = aimTarget(px, pz, R));
}

/**
 * Rim magnet: something edible just outside the rim, ahead or beside the way you're going, gently bends the course
 * onto it (up to ~20°, stronger the closer it is). Speed is kept, and nothing happens while you stand still.
 */
function rimMagnet(x, z) {
  const len = Math.hypot(x, z);
  if (len < 0.15 || NOMAGNET) return [x, z];
  const ux = x / len, uz = z / len, band = Math.max(0.8, hole.r * 0.5), reach = hole.r + band + 1;
  let best = null, bw = 0;
  for (const e of city.entities) {
    const dx = e.x - hole.x, dz = e.z - hole.z;
    if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
    const d = Math.hypot(dx, dz), gap = d - hole.r * (hole.pull || 1) + e.meta.tier * 0.25; // distance still to close
    if (gap <= 0 || gap > band || (dx * ux + dz * uz) / (d || 1) < -0.1 || !edibleNow(e)) continue;
    const w = Math.sqrt(1 - gap / band) * (0.6 + Math.min(0.4, e.meta.tier / hole.r)); // closer and meatier pulls harder
    if (w > bw) { bw = w; best = e; }
  }
  if (!best) return [x, z];
  const bx = best.x - hole.x, bz = best.z - hole.z, bl = Math.hypot(bx, bz) || 1, k = 0.35 * bw;
  const nx = ux * (1 - k) + (bx / bl) * k, nz = uz * (1 - k) + (bz / bl) * k, nl = Math.hypot(nx, nz) || 1;
  return [(nx / nl) * len, (nz / nl) * len];
}

/** Can the player's hole swallow this right now (fits, not poison, not airborne, not a capsule)? */
const edibleNow = (e) => e.alive && !e.falling && !e.flying && !e.noSwallow && e.meta.kind !== 'poison' && e.meta.kind !== 'tile'
  && e.meta.tier < hole.r * 0.95 && e.meta.tier > hole.r * 0.04;

/** The biggest edible thing within `R` of a ground point (bigger meals win ties of distance). */
function aimTarget(px, pz, R) {
  let best = null, score = 0;
  for (const e of city.entities) {
    const dx = e.x - px, dz = e.z - pz;
    if (dx > R + 3 || dx < -R - 3 || dz > R + 3 || dz < -R - 3) continue;
    const reach = R + e.meta.tier * 0.8, d2 = dx * dx + dz * dz;
    if (d2 > reach * reach || !edibleNow(e)) continue;
    const s = (e.meta.tier + 0.2) / (Math.sqrt(d2) + 0.5);
    if (s > score) { score = s; best = e; }
  }
  return best;
}

/** Joystick assist: the best edible thing inside a 35 degree cone ahead, within a few radii. */
function aimAhead(ux, uz) {
  let best = null, score = 0;
  const R = hole.r * 3 + 3;
  for (const e of city.entities) {
    const dx = e.x - hole.x, dz = e.z - hole.z;
    if (dx > R || dx < -R || dz > R || dz < -R) continue;
    const d = Math.hypot(dx, dz);
    if (d > R || d < 0.1 || (dx * ux + dz * uz) / d < 0.82 || !edibleNow(e)) continue;
    const s = (e.meta.tier + 0.2) / (d + 1);
    if (s > score) { score = s; best = e; }
  }
  return best;
}

// a soft ring on the ground where the mouse is steering (brighter when it has locked onto something edible)
const aim = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xb58cff, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false }));
aim.renderOrder = 9;
aim.visible = false;
scene.add(aim);
function showAim(x, z, snap) {
  if (!state.playing) return;
  aim.visible = true;
  aim.position.set(x, 0.3, z);
  aim.scale.setScalar(snap ? Math.max(0.5, snap.meta.tier * 1.1) : Math.max(0.35, hole.r * 0.3));
  aim.material.opacity = snap ? 0.75 : 0.3;
  aim.material.color.set(snap ? 0xffd166 : 0xb58cff);
}

// ---------- HUD ----------
function hud() {
  $('size').querySelector('b').textContent = hole.r.toFixed(2);
  $('eaten').querySelector('b').textContent = state.eaten;
  $('hunger').style.width = `${state.belly * 100}%`;
  $('hunger').parentElement.classList.toggle('low', state.belly < 0.3);
  $('stars').firstChild.textContent = '★'.repeat(director.stars) + '☆'.repeat(Math.max(0, (director.max ?? 4) - director.stars));
  $('noto').style.width = `${director.noto}%`; // notoriety: how hard the city is looking for you
  const cr = state.crave;
  $('crave').hidden = !cr;
  if (cr) {
    $('crave').innerHTML = `Craving <b>${cr.got}/${cr.need}</b> ${cr.label}<i style="width:${(cr.t / cr.T) * 100}%"></i>`;
    $('crave').classList.toggle('low', cr.t < 5);
  }
  $('left').querySelector('b').textContent = state.left;
  // endgame compass: point at the nearest standing building when only a few remain
  const arrow = $('arrow');
  arrow.hidden = !(state.left > 0 && state.left <= 5);
  if (!arrow.hidden) {
    let best = null, bd = Infinity;
    for (const e of city.entities) {
      if (!e.alive || !BUILDINGS.has(e.name)) continue;
      const d = Math.hypot(e.x - hole.x, e.z - hole.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const a = Math.atan2(best.z - hole.z, best.x - hole.x), rad = Math.min(innerWidth, innerHeight) * 0.36;
      arrow.style.transform = `translate(${Math.cos(a) * rad}px, ${Math.sin(a) * rad}px) rotate(${a}rad)`;
    }
  }
  const pu = powerups.items[0];
  edgeArrow('pu', pu && [pu.e.x, pu.e.z], POWERS[pu?.kind]?.icon, POWERS[pu?.kind]?.color);
  powerChips();
  abilityHud();
  if (state.phase === 2) {
    const q = nextSettlement();
    const ok = q && q.list.some((e) => e.alive && e.meta.tier < hole.r * 0.95); // something there fits now
    edgeArrow('town', q && Math.hypot(q.x - hole.x, q.z - hole.z) > q.r * 0.6 && [q.x, q.z], q ? `${q.name}${ok ? '' : ` · ${(q.big / 0.95).toFixed(0)} m`}` : '', ok ? '#9ed9bf' : '#ff8a3d');
  } else edgeArrow('town', null);
  const ef = events.focus;
  edgeArrow('event', ef, { parade: '🎺', marathon: '🏃', carshow: '🏎️', ufo: '🛸' }[events.kind], '#ffd166');
  const st = [state.reverse > 0 && 'Controls reversed', state.jam > 0 && (director.seal?.state === 'drop' ? 'The lid is coming down' : 'Jammed'), state.wet > 0 ? 'Wet concrete! Get out' : state.slow > 0 && 'Slowed', state.flooded && 'Tide! Slow + hungry',
    director.bonusT > 0 && 'Spotted'].filter(Boolean);
  const c = CARDS[state.card];
  $('card').hidden = state.card === 'none';
  $('card').textContent = state.card === 'rush' ? `${c.name} · ${clock(Math.max(0, 300 - state.time))}` : `${c.name} ×${c.mult}`;
  const limit = state.mode === 'blitz' ? BLITZ : state.hm.limit;
  if (limit) st.unshift(`⏱ ${clock(Math.max(0, limit - state.time))}`);
  if (state.happy > 0) st.unshift(`🍹 Happy Hour ${Math.ceil(state.happy)}s`);
  if (state.phase === 2 && city.surface) st.push(city.surface);
  const seal = director.seal;
  if (seal && (seal.state === 'in' || seal.state === 'hover')) st.unshift(`⚠ Sealing in ${Math.ceil(seal.left)}s: grow past ${P2.recover} m`);
  $('status').textContent = st.join(' · ');
  $('status').classList.toggle('good', state.happy > 0 || (!!limit && st.length === 1));
}

/** Edge-of-screen compass arrows (the event, a power-up capsule): point from the screen centre at a world spot. */
const edgeArrows = {};
function edgeArrow(id, target, glyph, color) {
  let el = edgeArrows[id];
  if (!el) {
    el = edgeArrows[id] = Object.assign(document.createElement('div'), { className: 'edge-arrow', hidden: true });
    el.innerHTML = `<b>➜</b><i></i>`;
    document.body.append(el);
  }
  el.hidden = !target || !state.playing;
  if (el.hidden) return;
  const a = Math.atan2(target[1] - hole.z, target[0] - hole.x), rad = Math.min(innerWidth, innerHeight) * 0.4;
  el.style.transform = `translate(${Math.cos(a) * rad}px, ${Math.sin(a) * rad}px)`;
  el.firstChild.style.transform = `rotate(${a}rad)`;
  el.lastChild.textContent = glyph;
  el.style.setProperty('--c', color);
}

/** Active power-ups: an icon with a draining radial timer each. */
const chipsEl = Object.assign(document.createElement('div'), { id: 'powers' });
document.body.append(chipsEl);
function powerChips() {
  const list = powerups.chips();
  const key = list.map((c) => c.kind).join();
  if (chipsEl.dataset.key !== key) {
    chipsEl.dataset.key = key;
    chipsEl.replaceChildren(...list.map((c) => Object.assign(document.createElement('span'), { className: 'chip', innerHTML: `<i></i><b>${c.icon}</b>`, title: c.name })));
  }
  list.forEach((c, i) => { const el = chipsEl.children[i]; el.style.setProperty('--p', c.left / c.T); el.style.setProperty('--c', c.color); });
  chipsEl.hidden = !list.length || !state.playing;
}

// ---------- abilities: Space / right-click / E, or the on-screen buttons (touch) ----------
// (created on first use: newRun builds the buttons before this part of the module has run)
function abilBox() { return $('abil') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'abil' })); }
function useAbility(i) {
  if (abilities?.use(i, { hole, city, director, state })) sfx.whoosh();
}
function renderAbilityButtons() {
  abilBox().replaceChildren(...abilities.list.map((a, i) => {
    const b = document.createElement('button');
    b.className = 'abil';
    b.innerHTML = `<i></i><b>${a.icon}</b><small>${i ? 'E' : 'Space'}</small>`;
    b.title = `${a.name} — ${a.desc}`;
    b.onpointerdown = (e) => { e.stopPropagation(); e.preventDefault(); useAbility(i); };
    return b;
  }));
}
function abilityHud() {
  const box = abilBox();
  box.hidden = !state.playing || !abilities.list.length;
  abilities.list.forEach((a, i) => {
    const el = box.children[i];
    if (!el) return;
    el.style.setProperty('--p', 1 - a.left / a.cd);
    el.classList.toggle('ready', a.left <= 0);
  });
}
addEventListener('keydown', (e) => {
  if (!state?.playing || e.repeat) return;
  if (e.key === ' ') { e.preventDefault(); useAbility(0); }
  if (e.key.toLowerCase() === 'e') useAbility(1);
});
addEventListener('contextmenu', (e) => { if (state?.playing) { e.preventDefault(); useAbility(abilities.list.length > 1 ? 1 : 0); } });

/** Dash afterimages: rim-coloured ghosts of the hole left along the path. */
function dashFx() {
  if ((state.dashFxT = (state.dashFxT || 0) - 1 / 60) > 0) return;
  state.dashFxT = 0.03;
  debris.puff(hole.x, 0.35, hole.z, 0, 0.2, 0, hole.r * 1.6, -hole.r * 1.2, 0.35, smokeCol.set(SKINS[save.skin || 'void'].rim), 0.45);
}

/** Surge: a comet trail behind the hole, and the crowd ahead scatters the way you're heading. */
function surgeFx(dt) {
  if ((state.trailT = (state.trailT || 0) - dt) > 0) return;
  state.trailT = 0.04;
  const v = Math.hypot(hole.vx, hole.vz) || 1;
  sparks.burst(hole.x - (hole.vx / v) * hole.r, hole.z - (hole.vz / v) * hole.r, hole.r * 0.4, 0.2);
  for (const e of city.walkers ??= city.entities.filter((q) => q.mover?.type === 'walk' || q.mover?.type === 'loop')) {
    const dx = e.x - hole.x, dz = e.z - hole.z;
    if (e.alive && dx * hole.vx + dz * hole.vz > 0 && dx * dx + dz * dz < 625) e.panic = 1.5;
  }
}

// ---------- first-run hints (once per browser) ----------
const HINTS = [
  [1, 'Steer onto things smaller than you'],
  [9, 'Keep eating — the purple bar is your belly'],
  [18, 'Big bites grow you — crumbs barely count'],
  [45, 'Eating police and buildings makes the city hunt you — lay low to cool off'],
];
function hints() {
  if (save.hinted) return;
  for (const h of HINTS) if (!h.done && state.time > h[0]) { h.done = true; hint(h[1]); }
  if (state.time > 30) { save.hinted = true; persist(); }
}
function hint(text) {
  const el = $('hint');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// ---------- damage (PLAN.md rule 3: capped, never chained) ----------
function hurt(frac, why) {
  if (!state.playing || state.invuln > 0) return;
  const glass = state.card === 'glass' ? 2 : 1;
  hole.area *= 1 - Math.min(frac * glass * (1 - level('hardhat') * 0.1) * state.mods.hurt * state.hm.hurt, MAX_HIT * glass);
  state.hits.push(why);
  if (why.startsWith('Concrete')) state.stats.concrete++;
  state.invuln = 1.2;
  state.shake = 0.5;
  sfx.hurt();
  flash(why);
}
function toll() {
  if (hole.r < DEAD_R * 1.6) return; // a toll alone can never end the run
  hole.area *= 0.96;
  state.slow = 0.8;
  state.hits.push('toll');
  sfx.hurt();
  flash('Barricade!');
}
/** Standing in wet concrete: slow, and it sets around you (steady shrink; never blocks movement, rule 1). */
function drain(dt) {
  if (!state.playing) return;
  hole.area *= 1 - 0.05 * dt;
  state.slow = Math.max(state.slow, 0.15);
  state.wet = 0.2;
}
function flash(text, red = true) {
  const wait = bannerUntil - performance.now();
  if (!red && wait > 0) { setTimeout(() => flash(text, red), wait); return; } // queue behind the banner; hits stay instant
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  if (!red) return;
  document.body.classList.remove('hurt');
  void document.body.offsetWidth;
  document.body.classList.add('hurt');
}
function combo(n) {
  if (performance.now() < bannerUntil) return; // the next bite re-shows it
  const el = $('combo');
  el.textContent = `×${n} combo`;
  el.style.fontSize = `${Math.min(44, 18 + n * 1.5)}px`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}
/** A police car rammed us: knock the hole back and dent it a little. */
function ram(dx, dz) {
  if (!state.playing) return;
  state.kick = { x: dx * 14, z: dz * 14 };
  sfx.thump();
  state.stats.rams++;
  hurt(0.04, 'Rammed by police!');
}
function spotted() {
  state.stats.spotted++;
  flash('Spotted! ★+1', false);
  sfx.star();
}
/** Seaside tides: did the hole come out of the flood smaller than it went in? (star challenge) */
function tide(phase) {
  if (!state.playing) return;
  const st = state.stats;
  if (phase === 'in') st.tideR0 = hole.r;
  else if (st.tideR0) { st.tides++; if (hole.r < st.tideR0 - 0.02) st.tideLoss++; }
}
function poison(effect) {
  state.stats.poison++;
  if (state.card === 'clean') { endRun(false, 'Poisoned — Clean Diet broken'); return; }
  if (effect === 'shrink') hurt(0.12, 'Gas can! Shrunk');
  if (effect === 'reverse') { state.reverse = 3; flash('Toxic! Controls reversed'); }
  if (effect === 'jam') { state.jam = 2; flash('Spiky art! Jammed'); }
  if (effect === 'zap') { state.jam = 1; state.shake = 0.4; sparks.burst(hole.x, hole.z, hole.r, 6); flash('Zapped! Power lines'); sfx.hurt(); }
}

// ---------- growth, notoriety, cravings ----------
/** Share of a bite that becomes growth: crumbs much smaller than the hole barely count, so you have to chase real meals. */
function growthShare(tier, r) {
  const k = THREE.MathUtils.smoothstep(tier / r, 0.1, 0.5);
  return 0.06 + 0.94 * k;
}

/** How much the city notices a meal (heat builds from aggression, not just size). */
function notoriety(e) {
  return notorietyBase(e) * (e.meta.event === 'parade' ? 1.5 : 1); // spoiling the parade gets noticed
}
function notorietyBase(e) {
  const n = e.name, k = e.meta.kind;
  if (k === 'unit' || n === 'police_car') return 12;
  if (BUILDINGS.has(n)) return 5 + e.meta.tier;
  if (VEHICLES.has(n)) return 2.2;
  if (PEOPLE.includes(n)) return 0.8;
  return 0.35;
}

// Cravings: every so often the void wants something specific, soon. Satisfy it for a full belly, a combo kick and dust.
const PETS = new Set(['pigeon', 'rainbow_pigeon', 'dog', 'crab']);
const CAR_NAMES = new Set(['car', 'car_b', 'car_c', 'taxi', 'mayor_limo', 'police_car', 'icecream_van', 'bus']);
const STREET = new Set(['bench', 'hydrant', 'trashcan', 'mailbox', 'newsbox', 'vending', 'phone_booth', 'lamp', 'planter', 'flower_pot', 'cone', 'bicycle', 'scooter']);
const CRAVES = [
  { label: 'people', need: 4, test: (n) => PEOPLE.includes(n) },
  { label: 'cars', need: 3, test: (n) => CAR_NAMES.has(n) },
  { label: 'street furniture', need: 4, test: (n) => STREET.has(n) },
  { label: 'trees & bushes', need: 3, test: (n) => n.startsWith('tree') || n === 'bush' },
  { label: 'pigeons & pets', need: 3, test: (n) => ['pigeon', 'dog', 'crab', 'rainbow_pigeon'].includes(n) },
  { label: 'buildings', need: 2, test: (n) => BUILDINGS.has(n) },
];
function cravings(dt) {
  if (state.phase === 2) { state.crave = null; return; } // (town cravings: the region is fed by whole settlements)
  const c = state.crave;
  if (c) {
    c.t -= dt;
    if (c.t <= 0) { // missed: the void sulks
      state.crave = null;
      state.craveCool = 26 + Math.random() * 14;
      state.belly = Math.max(0, state.belly - 0.25);
      flash(`Craving missed — ${c.label}`, false);
    }
    return;
  }
  if ((state.craveCool -= dt) > 0) return;
  // only crave what fits now and is actually around
  const options = CRAVES.filter((cr) => {
    let n = 0;
    for (const e of city.entities) {
      if (!e.alive || e.falling || e.meta.tier >= hole.r * 0.95 || e.meta.tier < hole.r * 0.08 || !cr.test(e.name)) continue;
      if ((e.x - hole.x) ** 2 + (e.z - hole.z) ** 2 < 70 ** 2 && ++n >= cr.need * 2) return true;
    }
    return false;
  });
  if (!options.length) { state.craveCool = 5; return; }
  const cr = options[Math.floor(Math.random() * options.length)];
  const need = Math.max(1, cr.need + state.mods.craveNeed);
  state.crave = { ...cr, need, got: 0, t: 18 + cr.need * 2, T: 18 + cr.need * 2 };
  sfx.star();
  flash(`Craving: ${need} ${cr.label}!`, false);
}
function craveEat(e) {
  const c = state.crave;
  if (!c || !c.test(e.name) || ++c.got < c.need) return;
  state.crave = null;
  state.craveCool = 28 + Math.random() * 14;
  state.cravings++;
  state.belly = 1;
  state.combo += 5;
  state.comboT = 1.5;
  hole.shockwave();
  sfx.levelUp();
  flash(`Craving satisfied! +${ECON.craving} dust`, false);
}

/** Dust for a finished run, itemised. Scarce on purpose (meta.js ECON). */
function runDust(won) {
  const e = ECON;
  if (state.phase === 2) { // the region pays on top of the town (banked at the breakout): meals at half rate, whole settlements
    const k = won ? 1 : e.lossShare;
    const parts = {
      meals: e.perScore * Math.sqrt(Math.max(0, state.score - state.townScore)) * 0.5 * k,
      combos: e.comboDust * Math.sqrt(Math.max(0, state.bonus - state.townBonus)) * 0.5 * k,
      country: city.settlements.filter((q) => q.left === 0).length * e.settlement + (city.capital?.left === 0 ? e.capital : 0),
    };
    const mult = +(CARDS[state.card].mult * heatPay(state.heat)).toFixed(2);
    return { parts, mult, total: Math.floor(Object.values(parts).reduce((a, b) => a + b, 0) * mult) };
  }
  const parts = {
    meals: e.perScore * Math.sqrt(state.score) * (won ? 1 : e.lossShare),
    combos: e.comboDust * Math.sqrt(state.bonus) * (won ? 1 : e.lossShare),
    cravings: state.cravings * e.craving,
    rares: state.rares * e.rare,
    rivals: state.rivalsEaten * e.rival,
    win: won ? e.winBonus : 0,
    speed: won ? e.speedBonus * THREE.MathUtils.clamp((720 - (state.cityTime ?? state.time)) / 420, 0, 1) : 0,
    daily: won && state.daily && !save.daily[state.seed]?.clear ? e.dailyFirstClear : 0,
  };
  const mult = +(CARDS[state.card].mult * heatPay(state.heat)).toFixed(2);
  const total = Math.floor(Object.values(parts).reduce((a, b) => a + b, 0) * mult);
  return { parts, mult, total };
}
window.__econ = () => ({ ...runDust(state.left === 0), score: state.score, bonus: state.bonus, time: state.time });

// ---------- menus ----------
let pickedCard = 'none';
let starting = false, nextSeed = null;
async function start(seed, daily, mutator = null, mode = 'city') {
  if (starting) return;
  const heat = daily || mutator ? 0 : pickedHeat; // Heat is for the picked city; daily + weekly stay the same for everyone
  sfx.unlock();
  const card = daily ? dailyCard(rng(seed)) : mutator ? 'none' : pickedCard;
  // Play the city shown behind the menu; reroll for daily/replays or when the card changes the city.
  const fresh = state.over || state.time > 0 || false;
  if (seed !== undefined || fresh || card !== 'none' || mutator || heat !== state.heat || mode !== state.mode) {
    const s = seed ?? (fresh ? nextSeed ?? randomSeed() : state.seed);
    const mood = runMood(s, daily || !!mutator); // daily + weekly: every mood, rolled by the seed
    // stays synchronous when the packs are already here (the bot and quick replays never wait a frame)
    if (packsFor(mood).some((p) => !packReady(assets, p))) {
      starting = true;
      $('menu').hidden = true;
      $('load').hidden = false;
      try {
        await ensurePacks(mood);
        newRun(s, daily, card, mood, mutator, heat, mode);
        setLoad('Warming up shaders…', 1);
        await nextPaint();
        await precompile();
      } finally {
        starting = false;
        $('load').hidden = true;
        $('menu').hidden = false;
      }
    } else newRun(s, daily, card, mood, mutator, heat, mode);
  }
  $('screen').hidden = true;
  $('hud').hidden = false;
  state.playing = true;
  if (START_REGION && state.phase === 1) { // ?region: straight into Phase 2 at 10 m (or ?r=)
    hole.area = Math.PI * (+new URLSearchParams(location.search).get('r') || 10) ** 2;
    state.mi = MILESTONES.length; // (no size-up banners or drafts for the jump)
    breakout(true);
  }
}
$('play').onclick = () => start(undefined, false, null, pickedMode);
$('blitz').onclick = () => start(undefined, false, null, 'blitz');
$('daily').onclick = () => start(todaySeed(), true);
$('weekly').onclick = () => { const w = thisWeek(); start(w.seed, false, w.id); };
function panel(id) {
  for (const p of ['shop', 'book']) $(p).hidden = p !== id || !$(p).hidden;
  if (!$('shop').hidden) renderShop();
  if (!$('book').hidden) renderBook($('book'), assets);
  if (!$('book').hidden) $('book').prepend(closeBtn('book'));
}
function closeBtn(p) {
  const b = document.createElement('button');
  b.className = 'sheet-close';
  b.textContent = '✕';
  b.onclick = () => { $(p).hidden = true; };
  return b;
}
addEventListener('keydown', (e) => { if (e.key === 'Escape') for (const p of ['shop', 'book']) $(p).hidden = true; });
$('shopBtn').onclick = () => panel('shop');
$('bookBtn').onclick = () => panel('book');

let offered = offer(rng((Math.random() * 2 ** 31) | 0));
function renderCards() {
  $('cards').replaceChildren(...['none', ...offered].map((id) => {
    const c = CARDS[id], b = document.createElement('button');
    b.className = 'chal' + (id === pickedCard ? ' on' : '');
    b.innerHTML = `<b>${c.name}</b><small>${c.desc}</small><em>${c.mult > 1 ? `×${c.mult} dust` : ''}</em>`;
    b.onclick = () => { pickedCard = id; renderCards(); };
    return b;
  }));
}
renderCards();
function muteToggle() { $('mute').textContent = sfx.toggleMute() ? '♪̸' : '♪'; }
$('mute').onclick = muteToggle;

const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function renderShop() {
  $('dust').textContent = save.dust;
  $('bookBtn').querySelector('b').textContent = `${bookEntries(assets).filter((a) => save.book?.[a.name]).length}/${bookEntries(assets).length}`;
  const dailyBest = save.daily[todaySeed()];
  const wk = thisWeek(), wb = save.weekly?.[wk.key];
  $('weekly').textContent = `Weekly ${wk.icon}${wb ? ` · ${wb.clear ? clock(wb.clear) : `${wb.r.toFixed(1)} m`}` : ''}`;
  $('weekly').title = `${wk.name}: ${wk.desc}`;
  $('daily').textContent = dailyBest ? `Daily city · best ${dailyBest.clear ? `cleared ${clock(dailyBest.clear)}` : `${dailyBest.r.toFixed(1)} m`}` : 'Daily city';
  $('shop').replaceChildren(closeBtn('shop'), ...Object.entries(UPGRADES).map(([id, u]) => {
    const lv = level(id), cost = u.costs[lv];
    const b = document.createElement('button');
    b.className = 'card';
    b.disabled = cost === undefined || save.dust < cost;
    b.innerHTML = `<b>${u.name}</b><small>${u.desc}</small><span>${'●'.repeat(lv)}${'○'.repeat(u.costs.length - lv)}</span><em>${cost === undefined ? 'max' : cost + ' dust'}</em>`;
    b.onclick = () => { if (buy(id)) renderShop(); };
    return b;
  }), ...abilityCards(), ...skinCards());
}

function abilityCards() {
  const stars = totalStars(), eq = slots(stars);
  const head = document.createElement('p');
  head.className = 'shop-head';
  head.textContent = `Abilities · ${eq.length}/${stars >= 10 ? 2 : 1} equipped${stars >= 10 ? '' : ' · 2nd slot at ★10'}`;
  return [head, ...Object.entries(ABILITIES).map(([id, a]) => {
    const has = owned(id), on = eq.includes(id);
    const b = document.createElement('button');
    b.className = 'card' + (on ? ' on-abil' : '');
    b.disabled = !has && save.dust < a.cost;
    b.innerHTML = `<b>${a.icon} ${a.name}</b><small>${a.desc} Cooldown ${a.cd} s.</small><em>${on ? 'equipped' : has ? 'equip' : a.cost + ' dust'}</em>`;
    b.onclick = () => {
      if (!has && !buyAbility(id)) return;
      equip(id, stars);
      renderShop();
      if (!state.playing) { abilities = new Abilities(slots(stars), abilities.hooks); renderAbilityButtons(); }
    };
    return b;
  })];
}

function skinCards() {
  const head = document.createElement('p');
  head.className = 'shop-head';
  head.textContent = 'Hole skins';
  const stars = totalStars();
  return [head, ...Object.entries(SKINS).map(([id, sk]) => {
    const owned = id === 'void' || save.skins?.includes(id) || (sk.stars && stars >= sk.stars), on = (save.skin || 'void') === id;
    const b = document.createElement('button');
    b.className = 'card skin' + (on ? ' on' : '');
    b.style.setProperty('--rim', '#' + new THREE.Color(sk.rim).getHexString());
    b.style.setProperty('--deep', '#' + new THREE.Color(sk.top || sk.deep).getHexString());
    b.disabled = !owned && (sk.stars || save.dust < sk.cost);
    b.innerHTML = `<i class="swatch"></i><b>${sk.name}</b><em>${on ? 'equipped' : owned ? 'equip' : sk.stars ? `★ ${stars}/${sk.stars}` : sk.cost + ' dust'}</em>`;
    b.onclick = () => {
      if (!owned) { if (sk.stars || save.dust < sk.cost) return; save.dust -= sk.cost; (save.skins ??= []).push(id); }
      save.skin = id;
      persist();
      renderShop();
      if (!state.playing) newRun(state.seed, state.daily, state.card, state.mood, null, state.heat, state.mode); // preview the new skin behind the menu
    };
    return b;
  })];
}
renderShop();

// ---------- city picker (progression): pick an unlocked city; the menu rebuilds it behind the buttons ----------
function renderCities() {
  renderPicker($('cities'), pickedCity, pickCity, (n) => (assets[n] ? thumb(assets[n]) : ''));
  $('play').textContent = state?.over ? 'Dig again' : `Open the ground · ${pickedCity}`;
  renderHeat();
  renderContracts();
}

// ---------- Heat (docs/REPLAYABILITY.md #2): replay a cleared city with stacking modifiers for more dust ----------
function renderHeat() {
  const max = heatMax(pickedCity), el = $('heat');
  pickedHeat = Math.min(pickedHeat, Math.max(max, URL_HEAT));
  el.hidden = !max;
  if (!max) return;
  const best = heatBest(pickedCity), h = pickedHeat;
  const step = (d) => { const b = document.createElement('button'); b.className = 'ghost'; b.textContent = d < 0 ? '−' : '+'; b.disabled = h + d < 0 || h + d > max; b.onclick = () => setHeat(h + d); return b; };
  const mid = document.createElement('div');
  mid.innerHTML = h ? `<span><b>🔥 Heat ${h}</b> · ×${heatPay(h).toFixed(2)} dust</span><small>${HEAT.slice(0, h).map((q) => q.name).join(' · ')}<br>new: ${HEAT[h - 1].desc}</small>`
    : `<b>Heat 0</b><small>Cleared it? Turn up the Heat for more dust${best > 0 ? ` · best 🔥${best}` : ''}</small>`;
  el.replaceChildren(step(-1), mid, step(1));
}
function setHeat(h) {
  if (starting || state.playing) return;
  pickedHeat = h;
  newRun(nextSeed ?? state.seed, false, pickedCard, pickedCity, null, h);
  renderHeat();
}

// ---------- daily contracts + streak (docs/REPLAYABILITY.md #4) ----------
function renderContracts() {
  const list = todaysContracts(), sk = streak();
  $('contracts').innerHTML = `<small>Today's contracts${sk.len ? ` · 🔥 ${sk.len}-day streak${sk.today ? '' : ' — finish one to keep it'}` : ''}${sk.freeze ? '' : ' · freeze used'}</small>`
    + list.map((c) => `<i class="${c.paid ? 'done' : ''}">${c.paid ? '✔' : '○'} ${c.text}${c.goal > 1 && !c.paid ? ` <b>${c.got}/${c.goal}</b>` : ''} <em>+${c.pay}</em></i>`).join('');
}
async function pickCity(mood) {
  if (starting || mood === pickedCity && !state.over) return;
  pickedCity = save.city = mood;
  persist();
  renderCities();
  starting = true;
  try {
    await ensurePacks(mood, (label, p) => { $('where').textContent = `${label} ${Math.round(p * 100)}%`; });
    const s = randomSeed();
    pickedHeat = Math.min(pickedHeat, heatMax(mood));
    newRun(s, false, pickedCard, mood, null, pickedHeat);
    nextSeed = null;
    renderCities();
  } finally { starting = false; }
}
renderCities();
// landmark thumbnails for the picker render first, then the book
if (!location.search.includes('nothumbs')) {
  setTimeout(() => warmThumbs(assets, Object.values(LANDMARK).map(([n]) => n), () => state?.playing).then(renderCities), 1500);
}

// ---------- Phase 2: breakout (docs/PHASE2.md §2) ----------
const news = new News();
/**
 * The last building fell: the ground gives way, the hole surges and the camera climbs while the region is built behind
 * the slowed-down cinematic; then the world swaps and the countryside is the map. quick: ?region (no cinematic).
 */
async function breakout(quick = false) {
  if (state.breaking || state.phase === 2) return;
  state.breaking = true;
  state.cityTime = state.time;
  state.townScore = state.score;
  state.townBonus = state.bonus;
  if (!quick) { // the town is cleared: bank it now (records, stars, contracts, dust), so leaving mid-region loses nothing
    state.bank = bankTown(true);
    flash(`${state.mood} cleared in ${clock(state.time)} · +${state.bank.pay.total} dust`, false);
  } else state.bank = { pay: { total: 0, parts: {}, mult: 1 }, stars: { list: [], opened: [] }, deals: { completed: [] }, heatUp: false, heatOpen: false, skinsBefore: 0 }; // (?region: no town)
  const hold = quick ? 0 : 1300; // the swap waits for the dust to cover the town
  if (!quick) {
    state.slowmo = P2.slowmo;
    state.finale = 7;
    state.shake = 0.8;
    hole.shockwave();
    sfx.boom?.();
    sfx.levelUp();
    flash('The ground gives way!', false);
    // the town's ground breaks up: rings of dust roll out from the hole to the city limits and beyond
    const dust = new THREE.Color(0xb8a58a), dark = new THREE.Color(0x8c7a64), hx = hole.x, hz = hole.z, H = city.half;
    // (sizes and counts kept in check: huge overlapping sprites make the breakout fill-rate bound)
    const rings = [[0, hole.r, 25, 32, 10, 3.5, dust], [350, hole.r * 2, 45, 32, 16, 4, dark], [800, H * 0.5, 70, 32, 24, 5, dust], [1150, H * 0.9, 90, 32, 30, 6, dark]];
    for (const [ms, r0, v, n, size, life, col] of rings) setTimeout(() => {
      if (!state.breaking) return;
      debris.dustRing(hx, 1, hz, r0, v, LOW_FX ? n / 2 : n, size, life, col);
      hole.shockwave();
      state.shake = Math.max(state.shake, 0.6);
      sfx.boom?.();
    }, ms);
  }
  news.say(`Void hole escapes ${city.mood.name} — army mobilised`);
  const t0 = performance.now();
  await loadPacks(assets, ['region']);
  const old = city;
  // normally prebuilt in the background during the town (prebuildRegion); if not, finish it now in bigger slices
  if (!state.regionJob) prebuildRegion();
  state.slice.budget = quick ? 1000 : 40; // (?region: nothing to show meanwhile, just build it)
  const [reg] = await Promise.all([state.regionJob, new Promise((r) => setTimeout(r, hold))]);
  if (!reg) { state.breaking = false; state.slowmo = 1; endRun(true); return; }
  reg.finish();
  await nextPaint(); // (finish and the grass mask render in separate frames)
  // the grass mask renders now (off-screen); the region's meshes reveal a few per frame after the swap (Region.budget):
  // compiling them all up front, or drawing them all at once, both froze the game for a second or more
  const grass2 = new Grass(renderer, reg.groundMeshes, Math.min(reg.bound, 700), field, { density: +(new URLSearchParams(location.search).get('grass') ?? Q.grass) * 0.6, far: Q.grassFar, lawns: [] });
  reg.reveal = 0;
  // swap under a fresh wave of dust: the new world goes in, the old systems go out
  if (!quick) {
    debris.dustRing(hole.x, 1, hole.z, hole.r * 1.5, 60, LOW_FX ? 14 : 24, 30, 5, new THREE.Color(0xb8a58a), 0.8);
    hole.shockwave();
    sfx.boom?.();
  }
  scene.remove(old.group, grass.group);
  for (const o of [director, events, chains, powerups, rivals]) o.dispose();
  old.dispose();
  grass.dispose();
  city = reg;
  city.capital = city.settlements.find((q) => q.kind === 'capital');
  // the hometown's emptied blocks keep what didn't fit down the hole
  for (const t of old.tiles) if (!/beach|runway|rail|canal|plaza/.test(t.type)) rubble.scatter(t.cx, t.cz, 13, 6, (x, z) => city.groundY(x, z));
  events = quietEvents(); chains = quietChains();
  powerups = new Powerups(assets, city, field, state.seed, save.skin || 'void', {
    flash: (t) => flash(t, false), star: () => { sfx.star(); sfx.whoosh(); }, slotTaken: (i) => i <= rivals.list.length,
    took: () => { state.stats.capsules++; },
  });
  rivals = /[?&]norivals\b/.test(location.search) || state.card === 'lonely' ? quietRivals() : new Rivals(assets, field, city, scene, 2, save.skin || 'void', (t) => news.say(t));
  for (const rv of rivals.list) rv.respawn = 40 + rivals.list.indexOf(rv) * 50; // let the country settle before company arrives
  director = /[?&]noarmy\b/.test(location.search) ? quietDirector() : new Army(city, scene, {
    hurt, toll, drain, warn: (t) => flash(t, false), news: (t) => news.say(t), boom: sfx.boom, siren: sfx.airRaid,
    jam: (s) => { state.jam = Math.max(state.jam, s); }, kick: (dx, dz) => { state.kick = { x: dx * 60, z: dz * 60 }; }, shake: (k) => { state.shake = Math.max(state.shake, k); },
    lock: () => { state.jam = 99; }, // the lid is coming down: nothing more to eat
    sealed: () => endRun(false, 'Sealed — the army capped the hole'),
  }, debris, sparks);
  grass = grass2;
  scene.add(city.group, grass.group);
  console.info(`[phase2] region ready in ${((performance.now() - t0) / 1000).toFixed(1)}s: ${city.settlements.length} settlements, ${city.entities.length} entities, ${city.crumbs.length} crumbs`, city.times);
  if (!quick) state.surgeTo = hole.area * P2.surge ** 2; // grows over the next second or so (frame)
  state.phase = 2;
  state.belly = 1;
  state.left = city.buildingsLeft();
  state.breaking = false;
  if (quick) state.slowmo = 1;
  else setTimeout(() => { state.slowmo = 1; }, 1600); // the slow climb continues over the new world
  $('where').textContent = `${city.mood.name} countryside · ${city.settlements.length} settlements`;
  minimap.start(city);
  news.say(`${city.capital?.name || 'The capital'} on alert as the hole heads for the countryside`);
  if (!quick) {
    levelEl.innerHTML = `<small>Breakout · ${hole.r.toFixed(1)} m</small><b>The whole country is on the menu</b>`;
    levelEl.classList.remove('show');
    void levelEl.offsetWidth;
    levelEl.classList.add('show');
    bannerUntil = performance.now() + 2600;
  }
}
window.__breakout = () => breakout(true);
const phase2Run = () => PHASE2 && state.mode === 'city' && !state.mutator;

/** Start building the region between frames while the town is still being eaten (3 ms a slice). */
function prebuildRegion() {
  state.slice = slicer(3, () => post.fps > 0 && post.fps < 55); // (pauses while the game is below 55 fps)
  state.regionJob = loadPack(assets, 'region', null, { gentle: true }).then(() => Region.create(assets, city, field, state.slice, false))
    .catch((e) => { if (!state.slice?.cancelled) console.warn('region prebuild failed', e); return null; });
}

/** The settlement to head for: the best meal per metre of travel; if nothing is edible yet, the nearest one left. */
function nextSettlement() {
  if ((state.targetT = (state.targetT || 0) - 1) > 0 && state.target?.left) return state.target;
  state.targetT = 20; // (re-chosen every 20 frames)
  let best = city.target(hole);
  if (!best) {
    let bd = Infinity;
    for (const q of city.settlements) { const d = Math.hypot(q.x - hole.x, q.z - hole.z); if ((q.left ?? q.total) && d < bd) { bd = d; best = q; } }
  }
  return (state.target = best);
}

/**
 * The town's results: clear time, daily/weekly records, stars, contracts, Heat and its dust. Called by endRun, or at the
 * breakout (Phase 2 banks the town at once, so leaving mid-region never loses a clear).
 */
function bankTown(cleared) {
  const clearT = state.cityTime ?? state.time;
  if (state.phase === 1 && !state.cityTime) { state.townScore = state.score; state.townBonus = state.bonus; }
  const pay = runDust(cleared);
  save.dust += pay.total;
  save.best = Math.max(save.best, state.best);
  if (cleared) save.fastest = Math.min(save.fastest || Infinity, clearT);
  if (state.mutator) recordWeek(thisWeek().key, state.best, cleared && clearT);
  if (state.daily) {
    const d = { r: 0, ...save.daily[state.seed] };
    d.r = Math.max(d.r, state.best);
    if (cleared) d.clear = Math.min(d.clear || Infinity, clearT);
    save.daily[state.seed] = d;
  }
  const skinsBefore = Object.values(SKINS).filter((k) => k.stars && totalStars() >= k.stars).length;
  state.stats.eventLive = events.live ? events.kind : null;
  const clearedBefore = !!save.cleared?.[state.mood];
  const stars = scoreRun(state.mood, state.stats, cleared, clearT);
  Object.assign(state.stats, { cravings: state.cravings, rivals: state.rivalsEaten, rares: state.rares, best: state.best });
  const deals = BOT ? { completed: [], dust: 0 } : scoreContracts(state.stats, { won: cleared, time: clearT, heat: state.heat, mode: state.mode });
  const heatUp = cleared && state.heat > 0 && recordHeat(state.mood, state.heat);
  const heatOpen = cleared && !clearedBefore; // first clear: Heat unlocks for this city
  persist();
  return { pay, stars, deals, heatUp, heatOpen, skinsBefore };
}

/** Ends a run. won = every building swallowed; why = how a lost run ended. */
function endRun(won, why) {
  if (!state.playing) return;
  state.playing = false;
  rivals.hideLabels();
  minimap.stop();
  for (const el of Object.values(edgeArrows)) el.hidden = true;
  state.draft = null;
  draftEl.hidden = true;
  perksEl.hidden = true;
  offered = offer(rng((Math.random() * 2 ** 31) | 0));
  pickedCard = 'none';
  renderCards();
  state.over = true;
  // the next city rolls now so its district pack can download while the results screen is up
  nextSeed = randomSeed();
  ensurePacks(runMood(nextSeed, false), () => {}).catch((e) => console.warn('pack preload failed', e));
  if (won) { sfx.star(); state.finale = 3.4; }
  else { state.sealing = 1.2; sfx.seal(); }
  // Phase 2: the town was banked at the breakout (bankTown); this run adds the region's pay on top
  const region = state.phase === 2, clearT = state.cityTime ?? state.time;
  const bank = state.bank ?? bankTown(won);
  const pay = region ? runDust(won) : bank.pay, dust = pay.total + (region ? bank.pay.total : 0), mult = pay.mult;
  if (region) save.dust += pay.total;
  save.best = Math.max(save.best, state.best);
  if (state.daily) save.daily[state.seed] = { ...save.daily[state.seed], r: Math.max(save.daily[state.seed]?.r || 0, state.best) };
  const { stars, deals, heatUp, heatOpen, skinsBefore } = bank;
  const towns = region ? city.settlements.filter((q) => q.left === 0).length : 0;
  let blitzBest = false;
  if (state.mode === 'blitz') {
    save.blitz ??= {};
    blitzBest = state.best > (save.blitz[state.mood] || 0);
    if (blitzBest) save.blitz[state.mood] = state.best;
  }
  const newSkins = Object.values(SKINS).filter((k) => k.stars && totalStars() >= k.stars).slice(skinsBefore).map((k) => k.name);
  persist();
  setTimeout(() => {
    $('hud').hidden = true;
    $('screen').hidden = false;
    $('title').innerHTML = state.mode === 'blitz' && !won ? `Blitz over<br><span>${state.best.toFixed(1)} m</span>` : won ? `You swallowed<br><span>the ${region ? 'country' : 'city'}</span>` : why ? `${why.split(' — ')[0]}<br><span>${why.split(' — ')[1] || 'game over'}</span>` : 'The ground<br><span>sealed</span>';
    $('result').hidden = false;
    $('result').innerHTML = (state.mode === 'blitz' && !won
      ? `Two minutes, <b>${state.eaten}</b> things swallowed, grew to <b>${state.best.toFixed(1)} m</b>. ${blitzBest ? '<b>New Blitz best!</b>' : `Blitz best <b>${(save.blitz[state.mood] || 0).toFixed(1)} m</b>`}`
      : region
      ? `${state.mood} gone in <b>${clock(clearT)}</b>, then <b>${towns}</b> of ${city.settlements.length} settlements${won ? `, ${city.capital?.name || 'the capital'} last` : ''}. Grew to <b>${state.best.toFixed(1)} m</b>, <b>${Math.round(state.pop).toLocaleString()}</b> people swallowed.${won ? '' : '<br>Too weak to swallow a Void Lid, it was capped for good. Every run starts over from a fresh town.'}`
      : won
      ? `Every building gone in <b>${clock(state.time)}</b>${state.daily ? ' — today\'s city' : ''}. Fastest ever <b>${clock(save.fastest)}</b>.`
      : `You swallowed <b>${state.eaten}</b> things and grew to <b>${state.best.toFixed(1)} m</b>${state.daily ? ' in today\'s city' : ''}. <b>${state.left}</b> buildings still stand.`)
      + (state.bite ? `<span class="bite"><img alt="" src="${state.bite}"><small>Biggest bite · ${title(state.biteName)}</small></span>` : '<br>')
      + `+<b>${dust}</b> void dust${mult > 1 ? ` (×${mult}${state.card !== 'none' ? ` ${CARDS[state.card].name}` : ''}${state.heat ? ` 🔥${state.heat}` : ''})` : ''} · best ever <b>${save.best.toFixed(1)} m</b>`
      + (region ? `<small class="pay">town ${bank.pay.total} · country ${pay.total}</small>` : '')
      + `<small class="pay">${Object.entries(pay.parts).filter(([, v]) => v >= 0.5).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · ')}</small>`
      + `<span class="goals"><small>${state.mood} stars</small>${stars.list.map((c, i) => `<i class="${c.done ? 'done' : ''}${c.fresh ? ' fresh' : ''}" style="--d:${i * 0.25}s">${c.done ? '★' : '☆'} ${c.text}</i>`).join('')}</span>`
      + stars.opened.map((m) => `<span class="unlock">🔓 New city: <b>${m}</b></span>`).join('')
      + newSkins.map((n) => `<span class="unlock">✨ New skin: <b>${n}</b></span>`).join('')
      + (state.perks.length ? `<small class="pay">Build: ${state.perks.map((id) => `${PERKS[id].icon} ${PERKS[id].name}`).join(' · ')}</small>` : '')
      + (heatUp ? `<span class="unlock">🔥 Heat ${state.heat} cleared — Heat ${Math.min(HEAT.length, state.heat + 1)} open</span>` : '')
      + (heatOpen ? `<span class="unlock">🔥 Heat unlocked for <b>${state.mood}</b></span>` : '')
      + deals.completed.map((c) => `<span class="unlock">📜 Contract: ${c}</span>`).join('');
    renderShop();
    renderCities();
  }, won ? 3600 : 1300);
}

// ---------- loop ----------
const timer = new THREE.Clock();
const camTarget = new THREE.Vector3(hole.x, 0, hole.z);
const _v = new THREE.Vector3();
let camDist = 14 * LENS, camYaw = 0;

// ?fps: live performance overlay (frame rate, frame time, draw calls, triangles, tier and any quality steps taken)
const fpsEl = new URLSearchParams(location.search).has('fps') ? Object.assign(document.createElement('div'), { id: 'fps' }) : null;
if (fpsEl) document.body.append(fpsEl);
const perf = { t0: performance.now(), n: 0, worst: 0, last: performance.now(), cpu: 0, sub: 0, gpu: null, gpuN: 0, gpuBusy: false };
function perfOverlay() {
  const now = performance.now();
  perf.worst = Math.max(perf.worst, now - perf.last);
  perf.last = now;
  perf.n++;
  // GPU time per frame (WebGPU timestamp queries; resolved every frame, so the total covers about one frame)
  perf.gpuN++;
  if (renderer.backend.trackTimestamp && !perf.gpuBusy) {
    perf.gpuBusy = true;
    const frames = perf.gpuN;
    perf.gpuN = 0;
    renderer.resolveTimestampsAsync('render').then((ms) => { if (ms > 0) perf.gpu = ms / Math.max(1, frames); }).catch(() => {}).finally(() => { perf.gpuBusy = false; });
  }
  if (now - perf.t0 < 500) return;
  const fps = (perf.n * 1000) / (now - perf.t0), r = renderer.info.render, o = post.opts || {};
  const tris = r.triangles > 1e6 ? `${(r.triangles / 1e6).toFixed(2)}M` : `${Math.round(r.triangles / 1e3)}k`;
  fpsEl.textContent = `${fps.toFixed(0)} fps · ${(1000 / fps).toFixed(1)} ms (worst ${perf.worst.toFixed(0)})\n`
    + `CPU ${(perf.cpu / perf.n).toFixed(1)} ms (game ${((perf.cpu - perf.sub) / perf.n).toFixed(1)} · render submit ${(perf.sub / perf.n).toFixed(1)}) · GPU ${renderer.backend.trackTimestamp ? (perf.gpu == null ? '…' : `${perf.gpu.toFixed(1)} ms`) : 'n/a'}\n`
    + `${r.drawCalls} draws · ${tris} tris\n`
    + `${Q.tier} · ${renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2'} · ${renderer.getPixelRatio()}x · ${renderer.domElement.width}×${renderer.domElement.height}\n`
    + `AO ${o.ao ? `${o.aoRes}x` : 'off'} · bloom ${o.bloom ? 'on' : 'off'} · grass ${grass.layers.length ? (post.lowSpec ? 'half' : 'on') : 'off'}`
    + (post.steps ? `\nfallback: ${post.steps.join(' → ')}` : '');
  Object.assign(perf, { t0: now, n: 0, worst: 0, cpu: 0, sub: 0 });
}
renderer.setAnimationLoop(() => {
  const t0 = fpsEl && performance.now();
  frame(Math.min(timer.getDelta(), 1 / 20));
  if (fpsEl) { perf.cpu += performance.now() - t0; perfOverlay(); }
});
// (stepping outside the animation loop: advance three's frame counter too, or per-frame passes won't re-render)
window.__tick = (dt = 1 / 60, n = 1) => {
  for (let i = 0; i < n; i++) { const nf = renderer._nodes?.nodeFrame; if (nf) { nf.update(); renderer.info.frame = nf.frameId; } frame(dt); }
};
// dev: step, then save the frame to .shots/<name>.jpg (vite.config.js) - works with the window in the background
if (import.meta.env.DEV) window.__snap = async (name = 'shot', n = 1) => {
  window.__tick(1 / 60, n);
  // render the graded frame into a target and read it back (a background window never presents its canvas)
  const w = canvas.width, h = canvas.height, rt = new THREE.RenderTarget(w, h);
  renderer.setRenderTarget(rt);
  post.render(look.grade || [1, 1, 1]);
  renderer.setRenderTarget(null);
  const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
  rt.dispose();
  const c2 = Object.assign(document.createElement('canvas'), { width: w, height: h }), ctx = c2.getContext('2d');
  const img = ctx.createImageData(w, h);
  const stride = px.length === w * h * 4 ? w * 4 : Math.ceil((w * 4) / 256) * 256; // (WebGPU pads rows to 256 bytes)
  for (let y = 0; y < h; y++) img.data.set(px.subarray(y * stride, y * stride + w * 4), y * w * 4);
  ctx.putImageData(img, 0, 0);
  return fetch(`/__shot?name=${name}`, { method: 'POST', body: c2.toDataURL('image/jpeg', 0.85) }).then((r) => r.text());
};

function frame(dt) {
  if (state.hitstop > 0) { state.hitstop -= dt; dt *= 0.1; } // hit-stop: the world freezes for a beat on a big bite
  if (state.draft) dt *= 0.04; // perk draft: the world all but stops while you choose
  dt *= state.slowmo; // Phase 2 breakout cinematic
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    post.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  if (state.playing) {
    state.time += dt;
    hints();
    for (const k of ['reverse', 'jam', 'slow', 'invuln', 'shake', 'comboT']) state[k] = Math.max(0, state[k] - dt);
    if (!state.comboT) state.combo = 0;
    const tide = state.flooded ? 2 : 1;
    state.wet = Math.max(0, state.wet - dt);
    const ramp = 1 + state.time / HUNGER_RAMP; // the void gets hungrier the longer the run goes on
    const drain = state.phase === 2 ? P2.bellyDrain : BELLY_DRAIN * ramp * Math.min(1, 0.3 + state.time / 25); // (gentle first 20 s)
    state.belly = Math.max(0, state.belly - drain * state.mods.hunger * state.hm.hunger * tide * dt);
    cravings(dt);
    const [sx, sz] = window.__bot ? window.__bot(hole, city) : steer();
    const surge = (powerups.active.boost ? 1.8 : 1) * abilities.update(dt, hole) * (state.mutator === 'lowgrav' ? 1.1 : 1);
    if (BOT && abilities.list.length) abilities.auto({ hole, city, director, state }, window.__botTarget);
    if (hole.dash > 0) dashFx();
    // Phase 2: the ground matters - roads, fields, woods, water - and so do the hills (slower up, a little quicker down)
    const slope = state.phase === 2 ? city.groundTilt?.(hole.x, hole.z, hole.r) : null;
    const hill = slope ? THREE.MathUtils.clamp(1 - (slope.nx * hole.sx + slope.nz * hole.sz) * 1.4, 0.62, 1.2) : 1;
    const base = state.phase === 2 ? P2.speed(hole.r) * (city.surfaceSpeed?.(hole.x, hole.z) ?? 1) * hill : 6.5 + hole.r * 1.8;
    const speed = base * state.mods.speed * (state.slow > 0 ? 0.45 : 1) * (state.flooded ? 0.6 : 1) * surge;
    // a little weight (~0.1s to turn / reach speed), not a boat; in Phase 2 it gets heavier as it grows
    const kv = 1 - Math.exp(-dt / (state.phase === 2 ? P2.turn(hole.r) : 1 / 11));
    hole.sx = (hole.sx || 0) + (sx - (hole.sx || 0)) * kv;
    hole.sz = (hole.sz || 0) + (sz - (hole.sz || 0)) * kv;
    const lim = Math.max(2, (state.phase === 2 ? city.bound + 400 : city.half) - hole.r * 0.95); // keep the whole hole disc on the map
    const px = hole.x, pz = hole.z;
    const kick = state.kick || { x: 0, z: 0 };
    hole.x = THREE.MathUtils.clamp(hole.x + (hole.sx * speed + kick.x) * dt, -lim, lim);
    hole.z = THREE.MathUtils.clamp(hole.z + (hole.sz * speed + kick.z) * dt, -lim, lim);
    if (state.phase === 2) { // the island's coast is the edge: the hole can wade into the shallows, no further
      const rr = Math.hypot(hole.x, hole.z), cr = city.terrain.coastR(hole.x, hole.z) + 25 - hole.r * 0.5;
      if (rr > cr) { hole.x *= cr / rr; hole.z *= cr / rr; }
      const wall = (x, z) => city.terrain.mountain(x, z) > 0.22; // the mountains: slide along the foothills
      if (wall(hole.x, hole.z)) {
        if (!state.saidWall) { state.saidWall = true; flash('Too steep: the mountains wall off the island', false); }
        if (!wall(hole.x, pz)) hole.z = pz; else if (!wall(px, hole.z)) hole.x = px; else { hole.x = px; hole.z = pz; } }
    }
    hole.vac = Math.max(0, (hole.vac || 0) - dt * state.mods.vacDecay);
    if (state.surgeTo) { // breakout surge
      hole.area += (state.surgeTo - hole.area) * Math.min(1, dt * 1.5);
      if (hole.area > state.surgeTo * 0.99) state.surgeTo = 0;
    }
    kick.x *= Math.max(0, 1 - dt * 5);
    kick.z *= Math.max(0, 1 - dt * 5);
    hole.vx = (hole.x - px) / dt;
    hole.vz = (hole.z - pz) / dt;

    const slower = (1 - level('appetite') * 0.06) * (state.card === 'lonely' ? 1.3 : 1);
    const fed = state.phase === 2 ? P2.decayFed : DECAY_FED / (1 + hole.r * 0.1); // big holes need proportionally bigger meals already
    hole.area *= 1 - (state.belly > 0 ? fed : state.phase === 2 ? P2.decayStarving : DECAY_STARVING) * slower * dt;
    director.update(dt, hole, state);
    events.update(dt, hole, state);
    city.alarm = director.stars; // at high heat the city evacuates: people hide indoors
    if (state.belly <= 0) state.stats.starved = true;
    for (let k = 1; k <= director.stars; k++) state.stats.starAt[k] = Math.min(state.stats.starAt[k], state.time);
    for (const rv of rivals.list) { // near misses and fights with rivals (star challenge)
      if (rv.dead || Math.hypot(rv.hole.x - hole.x, rv.hole.z - hole.z) > rv.hole.r + hole.r + 4 || rv.meetT > state.time) continue;
      rv.meetT = state.time + 15;
      state.stats.rivalMeets++;
    }
    if (director.stars > state.stars) {
      sfx.star();
      flash('★'.repeat(director.stars) + (state.phase === 2 ? ' The army closes in' : ' The city fights back'), false);
      if (!save.hinted && director.stars === 1) setTimeout(() => hint('Red rings = something is about to land. Move!'), 1500);
    }
    state.stars = director.stars;
    if ((state.leftTimer = (state.leftTimer || 0) - dt) <= 0) {
      state.leftTimer = 0.5;
      state.left = city.buildingsLeft();
      if (state.phase === 2) { // no dead ends (PLAN rule 2): if nothing standing fits, the countryside grows you at full rate
        const was = state.starved2;
        state.starved2 = !city.settlements.some((q) => q.list.some((e) => e.alive && !e.noSwallow && e.meta.tier < hole.r * 0.95));
        if (state.starved2 && !was) hint('Nothing in town fits: feast on the woods and herds to grow');
      }
    }
    const rv = rivals.update(dt, hole, true, state.time, powerups);
    if (rv === 'eaten') endRun(false, `Eaten — by ${rivals.list.find((q) => !q.dead && q.hole.r > hole.r)?.name || 'a rival'}`);
    else for (const q of rv) {
      hole.area += q.hole.area * 0.6 * state.mods.rivalMeal;
      state.rivalsEaten++;
      director.notice(15);
      state.score += q.hole.area;
      flash(`Swallowed ${q.name}!`, false);
      sfx.star();
      sparks.burst(hole.x, hole.z, hole.r, 6);
    }
    if (!state.playing) { /* eaten above */ }
    else if (hole.r < (state.phase === 2 ? 3 : DEAD_R)) endRun(false); // (Phase 2 ends with the army's seal first: army.js)
    else if (state.phase === 2 && city.capital?.left === 0) endRun(true, 'capital');
    // Phase 2 follows a normal town clear (not Blitz, not the weekly mutator runs: their twist is the whole run)
    else if (state.left === 0 && state.phase === 1) { if (phase2Run()) breakout(); else endRun(true); }
    if (phase2Run() && state.phase === 1 && !state.regionJob && state.time > 6) prebuildRegion();
    // (time limits are for the town: after the breakout the clock is the town's clear time)
    else if (state.phase === 1 && state.card === 'rush' && state.time > 300) endRun(false, 'Too slow — Rush Hour over');
    else if (state.phase === 1 && state.hm.limit && state.time > state.hm.limit) endRun(false, 'Too slow — Against the Clock');
    else if (state.mode === 'blitz' && state.time >= BLITZ) endRun(false, 'Time! — Blitz over');
    if (state.playing && state.time >= state.happyAt) { // Happy Hour starts
      state.happyAt = Infinity;
      state.happy = 20;
      hole.shockwave();
      sfx.levelUp();
      flash('🍹 Happy Hour! Everything grows you 50% more', false);
    }
    state.happy = Math.max(0, state.happy - dt);
    if (state.phase === 2) for (const q of city.settlements) { // the hole comes near: bells, sirens, the roads fill
      if (!q.alarmed && Math.hypot(q.x - hole.x, q.z - hole.z) < q.r + 180 + hole.r * 4) {
        q.alarmed = true;
        if (q.kind === 'village' || q.kind === 'farm') sfx.bells(); else sfx.airRaid();
        news.say(`${q.name} evacuates as the hole approaches`);
        city.evacuate?.(q);
      }
    }
    if (state.phase === 2) for (const q of city.settlements) { // a settlement falls
      if (q.left === 0 && !q.gone) {
        q.gone = true;
        hole.shockwave();
        sfx.levelUp();
        flash(`${q.name} is gone`, false);
        news.say(`${q.name} swallowed whole${q.kind === 'capital' ? ' — the capital has fallen' : ''}`);
        if (q.kind !== 'farm' && q.kind !== 'capital') { state.draftsDue++; if (BOT) openDraft(); else setTimeout(openDraft, 1100); } // a real settlement: the void mutates
      }
    }
  } else if (state.sealing > 0) {
    state.sealing = Math.max(0, state.sealing - dt);
    hole.area *= Math.max(0, 1 - dt * 6);
  }

  if (!state.playing) rivals.update(dt, hole, false);
  const twins = state.playing ? powerups.update(dt, hole, rivals, scene, true) : [];
  abilities.hold(hole);
  if (powerups.active.boost && state.playing) surgeFx(dt);
  const eaten = city.update(dt, [hole, ...rivals.holes, ...twins], state.jam > 0 || !state.playing);
  if (state.phase === 2) rubble.update([hole, ...rivals.holes]);
  for (const ev of city.events) {
    if (ev.type === 'fall') {
      const e = ev.e, t = e.meta.tier, mine = e.eater === hole && state.playing;
      if (t >= 2.5) {
        debris.collapse(e, e.eater || hole, LOW_FX || post.lowSpec);
        if (state.phase === 2 && t >= 3 && e.mesh?.userData.crumble) rubble.spill(e, e.eater || hole, (x, z) => city.groundY(x, z));
        // big buildings: a dust front rolls out across the streets, sized to the building (scale reads in the dust)
        if (t >= 5 && !ev.crumb) debris.dustRing(e.x, e.gy || 0, e.z, t * 0.7, t * 0.45, LOW_FX || post.lowSpec ? 8 : 16, t * 0.8, 3.2 + t * 0.03, dustCol);
        if (mine) state.shake = Math.max(state.shake, Math.min(0.5, t * 0.04));
      }
      if (mine && t >= 0.5 && t > hole.r * 0.6 && state.time > (state.stopCool || 0)) {
        state.stopCool = state.time + 1;
        state.hitstop = 0.05 + Math.min(0.08, t * 0.012);
        state.punch = 1;
        sfx.bigGulp(t);
      }
      if (e.name === 'balloon_stand') debris.balloons(e.x, 2.5, e.z, 10 + Math.floor(Math.random() * 5));
      if (state.playing) chains.onFall(e, e.eater || hole, hole);
      if (mine && e.mover?.type === 'rail' && e.mover.train.v > 0.5) state.stats.movingTrain++;
      if (mine && t >= 0.5 && t > (state.biteTier || 0)) { state.biteTier = t; state.biteName = e.name; state.snapAt = state.time + 0.25; }
    }
    if (ev.type === 'scream' && state.playing) { shout(ev.e); sfx.eek(); }
    if (ev.type === 'honk' && state.playing) sfx.honk(ev.d);
    if (ev.type === 'clog' && state.playing) { state.jam = Math.max(state.jam, 1.5); flash('Clogged!'); sfx.hurt(); }
    if (ev.type === 'tooBig' && state.playing && !(state.time < (state.tooBigT || 0))) {
      state.tooBigT = state.time + 6;
      const need = (ev.e.meta.tier / 0.95).toFixed(1);
      hint(ev.e.name.startsWith('tree') ? `Roots too wide — grow to ${need} m` : `Too big — grow to ${need} m`);
    }
  }
  for (const e of eaten) {
    if (e.eater && e.eater !== hole && e.eater !== powerups.twin) { // a rival's meal (the split twin eats for you)
      const before = e.eater.area;
      // rubber band: rivals keep pace with you but never run away with the city
      const ahead = e.eater.r > hole.r * 1.4 + 1;
      if (e.meta.kind !== 'poison') e.eater.grow(e.meta.tier, (ahead ? 0.12 : 0.5) * growthShare(e.meta.tier, e.eater.r));
      rivals.fed(e.eater, before);
      continue;
    }
    if (!state.playing) continue;
    if (state.phase === 2) {
      state.pop += residents(e.name, e.meta.tier);
      if (e.mover?.crumb || e.meta.tier < hole.r * 0.12) { // crumbs (trees, hedges, cars at this size): no fanfare each
        const before = hole.area;
        hole.grow(e.meta.tier, growthShare(e.meta.tier, hole.r) * P2.growth * (e.mover?.crumb ? (state.starved2 ? P2.stuckGrowth : P2.crumbGrowth) : 1)); // (starved2: no dead ends, below)
        state.belly = Math.min(1, state.belly + (hole.area - before) / (before * P2.meal) + P2.crumb);
        state.eaten++;
        state.score += Math.PI * e.meta.tier ** 2;
        if ((state.crumbT = (state.crumbT || 0) - 1) <= 0) { state.crumbT = 6; sfx.gulp(e.meta.tier); sparks.burst(hole.x, hole.z, hole.r, 0.5); }
        continue;
      }
    }
    sfx.gulp(e.meta.tier);
    hole.vac = Math.min(1, (hole.vac || 0) + 0.35); // whirlpool: a short burst of suction after each bite
    if (record(e.name)) flash(`New in the book: ${title(e.name)}`, false);
    const st = state.stats;
    st.ate[e.name] = (st.ate[e.name] || 0) + 1;
    (st.times[e.name] ??= []).push(state.time);
    if (e.meta.rare) { state.rares++; sparks.burst(hole.x, hole.z, hole.r, 4); sfx.star(); }
    director.notice(notoriety(e));
    craveEat(e);
    if (e.meta.kind === 'poison') { poison(e.meta.effect); continue; }
    if (e.meta.effect === 'combo') { state.combo += 3; state.comboT = 1.2; }
    if (e.name === 'drummer') { state.combo += 1; state.comboT = Math.max(state.comboT, 1); } // each drummer is +1 combo
    const before = hole.area;
    const m = state.mods;
    const kind = VEHICLES.has(e.name) ? m.vehicleGrow : e.name.startsWith('tree') || e.name === 'bush' ? m.plantGrow
      : PEOPLE.includes(e.name) || PETS.has(e.name) ? m.peopleGrow : 1;
    const mult = (state.card === 'vehicles' ? (VEHICLES.has(e.name) ? 1.5 : 0.25) : state.card === 'glass' ? 1.5 : 1) * kind * (state.happy > 0 ? 1.5 : 1);
    if (BUILDINGS.has(e.name)) st.buildings++;
    if (e.meta.event) st.eventMeals++;
    hole.grow(e.meta.tier, mult * growthShare(e.meta.tier, hole.r) * (state.phase === 2 ? (e.home?.kind === 'capital' ? P2.capitalGrowth : P2.growth) : 1));
    // a full meal is MEAL of the hole's area, capped at a 6 m hole's worth so late game stays feedable
    const meal = (state.phase === 2 ? P2.meal : MEAL) * (1 + level('appetite') * 0.04);
    state.belly = Math.min(1, state.belly + (hole.area - before) / ((state.phase === 2 ? before : Math.min(before, Math.PI * 36)) * meal));
    state.eaten++;
    state.score += Math.PI * e.meta.tier ** 2;
    hole.bump = Math.min(0.25, (hole.bump || 0) + e.meta.tier / hole.r * 0.3);
    sparks.burst(hole.x, hole.z, hole.r, e.meta.tier);
    if (e.meta.tier > hole.r * 0.12) debris.crumbs(hole, e.meta.tier);
    state.combo = state.comboT > 0 ? state.combo + 1 : 1;
    state.comboT = 0.9 + m.comboT + (state.happy > 0 ? 0.3 : 0);
    state.bonus += Math.min(state.combo - 1, 8) * m.comboPay; // long chains are fun, not a money printer
    if (state.combo >= 3) combo(state.combo);
    st.maxCombo = Math.max(st.maxCombo, state.combo);
  }
  state.best = Math.max(state.best, hole.r);
  if (state.playing) {
    let top = null;
    let drafts = 0;
    while (state.mi < MILESTONES.length && hole.r >= MILESTONES[state.mi].need * city.scaleK) { if (DRAFT_AT.has(state.mi)) drafts++; top = MILESTONES[state.mi++]; }
    if (top) sizeUp(top); // several at once (ate a rival): announce only the biggest
    if (drafts) { state.draftsDue += drafts; if (BOT) openDraft(); else setTimeout(openDraft, 1100); } // after the banner
  }
  // chimney + street-food smoke near the camera
  if (!LOW_FX && !post.lowSpec) for (const e of city.smokers ??= city.entities.filter((q) => SMOKE[q.name])) {
    if (!e.alive || e.falling || (e.smokeT = (e.smokeT ?? Math.random()) - dt) > 0) continue;
    const [lx, ly, lz, c, k = 1] = SMOKE[e.name], cs = Math.cos(e.rot), sn = Math.sin(e.rot), q = Math.sqrt(k);
    e.smokeT = (0.35 + Math.random() * 0.3) * (k > 3 ? q / 2 : 1); // big plumes: fewer, bigger puffs
    if (Math.abs(e.x - camTarget.x) > camDist * 0.8 || Math.abs(e.z - camTarget.z) > camDist * 0.8) continue;
    const gs = e.gs || 1, big = k > 3; // (e.gy: Phase 2 ground height)
    debris.puff(e.x + (lx * cs + lz * sn) * gs, ly * gs + e.y + (e.gy || 0), e.z + (-lx * sn + lz * cs) * gs, (0.25 + Math.random() * 0.2) * (big ? q : 1),
      (0.8 + Math.random() * 0.4) * (big ? q * 0.6 : 1), (Math.random() - 0.5) * 0.2 * (big ? q : 1), 0.3 * k, 0.7 * k * (big ? 0.35 : 1), 2.6 * q * (big ? 1.3 : 1),
      smokeCol.set(c), Math.min(big ? 0.4 : 0.5, 0.35 + 0.05 * (k - 1)));
  }
  city.mixers.forEach((m) => m.update(dt));
  city.syncBatches();
  hole.update(dt, state.time, Math.max(0, 0.5 - state.belly) * 2, city.groundSpan(hole.x, hole.z, hole.r), city.groundTilt?.(hole.x, hole.z, hole.r));

  // camera: pull back as the hole grows
  const portrait = Math.max(1, 1.2 / camera.aspect) ** 0.7; // phones see as much width as desktops
  state.finale = Math.max(0, state.finale - dt);
  state.punch = Math.max(0, state.punch - dt * 2.5);
  const lift = state.finale > 0 ? 2.2 : 1; // victory: pull up over the emptied city
  const mini = city.scaleK < 1 ? 0.7 : 1; // Miniature: the camera leans in
  camDist += ((14 + hole.r * 8) * portrait * LENS * lift * mini - camDist) * Math.min(1, dt * (state.finale > 0 ? 0.8 : 2));
  camTarget.lerp(_v.set(hole.x, 0, hole.z), Math.min(1, dt * 6));
  const sh = state.shake * camDist * 0.02;
  // attract mode: slow orbit behind the menu; snaps back to north-up for play (steering is screen-relative)
  camYaw = state.finale > 0 ? camYaw + dt * 0.3 : state.playing || state.over ? Math.atan2(Math.sin(camYaw), Math.cos(camYaw)) * Math.max(0, 1 - dt * 4) : camYaw + dt * 0.06;
  if (VIEW) { camTarget.set(VIEW[0], 0, VIEW[1]); camDist = VIEW[2]; camYaw = VIEW[3] || 0; }
  // the finale (breakout, victory) drops to a lower, kaiju angle as it orbits and climbs
  state.lowK = THREE.MathUtils.lerp(state.lowK || 0, state.finale > 0 ? 1 : 0, Math.min(1, dt * 1.5));
  const pitch = VIEW?.[4] ? THREE.MathUtils.degToRad(VIEW[4]) : PITCH - state.lowK * 0.22;
  const camD = camDist * (1 - state.punch * 0.07); // punch-in on big bites
  const horiz = Math.cos(pitch) * camD;
  camera.position.set(camTarget.x + Math.sin(camYaw) * horiz + (Math.random() - 0.5) * sh, Math.sin(pitch) * camD,
    camTarget.z + Math.cos(camYaw) * horiz + (Math.random() - 0.5) * sh);
  camera.lookAt(camTarget);
  // Phase 2: the view reaches kilometres; the near plane follows so depth precision holds for paving and roads
  const far = Math.max(1600, camDist * 4), near = Math.max(0.5, camDist * 0.02);
  if (Math.abs(camera.far - far) > far * 0.1 || Math.abs(camera.near - near) > near * 0.2) { camera.far = far; camera.near = near; camera.updateProjectionMatrix(); }
  const low = post.lowSpec || LOW_FX;
  surfaceOn.value = 1; // low tiers use the lite (single-projection) shader instead of losing detail
  city.budget(camera, hole.r, low);
  followSun(sun, camTarget);
  city.shadowCam = sun.shadow.camera; // the batched landmarks pack only what the shadow map can see
  city.cullTraffic(camera); // city-wide traffic: only what the camera or the shadow map sees
  grass.update(camTarget, camDist / LENS, low, camera);
  setFogRange(camDist);
  viewScale.value = Math.max(1, camDist / 45); // surface detail must reach the ground at every size, or the town goes flat and milky
  post.setViewScale(Math.max(1, camDist / 130)); // (AO reach: only once the camera is really high)
  const sc = sun.shadow.camera, ext = Math.max(25, (camDist / LENS) * 0.9);
  if (sc.right !== ext) { sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.updateProjectionMatrix(); }

  sparks.update(dt);
  debris.update(dt);
  wisps.update(dt, camTarget, camDist, look.sun.color);
  birds.update(dt, state.phase === 2 && world.night.value < 0.5, camTarget, camDist, hole); // (no birds at night)
  chains.update(dt, hole, director);
  for (const s of bubbles) {
    if (s.t <= 0) continue;
    s.t -= dt;
    if (s.t <= 0 || !s.e.alive || s.e.falling || !state.playing) { s.t = 0; s.b.hidden = true; continue; }
    _v.set(s.e.x, s.e.y + s.e.meta.height + 0.3, s.e.z).project(camera);
    s.b.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-10%, -100%)`;
  }
  world.hole.value.set(hole.x, hole.z, hole.hidden || !state.playing ? 0 : hole.r, hole.vac || 0);
  world.holeY.value = hole.ry ?? 0;
  pedTime.value += dt;
  lightsTime.value += dt;
  lightsPulse.value = 0.85 + 0.15 * Math.sin(lightsTime.value * 2.2);
  surfaceTime.value += dt;
  for (const q of rivals.list) q.hole.update(dt, state.time, 0, city.groundSpan(q.hole.x, q.hole.z, q.hole.r), city.groundTilt?.(q.hole.x, q.hole.z, q.hole.r));
  const tw = powerups.twin;
  if (tw) tw.update(dt, state.time, 0, city.groundSpan(tw.x, tw.z, tw.r));
  if (state.playing) { hud(); rivals.labels(camera); }
  news.update(dt, state.pop, state.playing && state.phase === 2);
  if (state.phase === 2) minimap.update(dt, { hole, rivals: rivals.holes, boss: director.boss?.alive ? director.boss : null, heli: director.seal?.heli });
  if (!window.__headless) {
    if (state.playing && document.visibilityState === 'visible') post.watch(dt);
    const ts = fpsEl && performance.now();
    post.render(look.grade || [1, 1, 1]);
    if (fpsEl) perf.sub += performance.now() - ts;
    if (state.snapAt && state.time >= state.snapAt) { state.snapAt = 0; state.bite = snapshot(); }
  }
}
