import * as THREE from 'three/webgpu';
import { createRenderer, createScene, followSun, applyTime, setFogRange, TIMES } from './look.js';
import { loadAll, pedTime, glow } from './assets.js';
import { City, rng, BUILDINGS, PEOPLE } from './city.js';
import { Hole, holeField } from './hole.js';
import { Rivals } from './rivals.js';
import { SKINS } from './skins.js';
import { CARDS, VEHICLES, offer, dailyCard } from './cards.js';
import { record, renderBook, title, bookEntries, thumb, warmThumbs } from './book.js';
import { Director } from './director.js';
import { installBot } from './bot.js';
import { UPGRADES, save, persist, level, buy, todaySeed } from './meta.js';
import * as sfx from './sfx.js';
import { Post } from './post.js';
import { Sparks, Debris, SMOKE } from './fx.js';
import { surfaceTime, surfaceOn, world } from './surface.js';
import { Grass } from './grass.js';

const $ = (id) => document.getElementById(id);
const renderer = await createRenderer($('c'));
const look = createScene();
const { scene, sun } = look;
// Longer lens: less perspective distortion on tall props and a truer miniature/tilt-shift read.
const FOV = 26, LENS = Math.tan(THREE.MathUtils.degToRad(19)) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 1600);
const PITCH = THREE.MathUtils.degToRad(55);
const post = new Post(renderer, scene, camera);
const sparks = new Sparks();
scene.add(sparks.points);
const debris = new Debris();
scene.add(debris.group);
const LOW_FX = location.search.includes('low');
// debug framing for screenshots: ?view=x,z,dist[,yaw,pitch]
const VIEW = new URLSearchParams(location.search).get('view')?.split(',').map(Number);
const smokeCol = new THREE.Color();

// ---------- starvation tuning (PLAN.md: keep moving or the ground seals) ----------
const BELLY_DRAIN = 1 / 8; // a full belly lasts 8s
const MEAL = 0.15; // eating this fraction of the hole's own area fills the belly
const DECAY_FED = 0.014; // area fraction lost per second while the belly has food
const DECAY_STARVING = 0.09; // ... while it is empty
const DEAD_R = 0.26;
const MAX_HIT = 0.25; // rule 3: no single hit takes more than 25%

const assets = await loadAll((p) => { $('load').querySelector('b').textContent = `${Math.round(p * 100)}%`; });
$('load').hidden = true;
$('menu').hidden = false;

// Size-up moments: each milestone is reached when every example in it fits the hole (sizes come from the manifest).
const MILESTONES = [['people', ['ped_business', 'ped_granny', 'ped_kid']], ['benches & bikes', ['bench', 'bicycle', 'vending']],
  ['cars', ['car', 'taxi', 'car_c']], ['vans & buses', ['icecream_van', 'police_car', 'bus']], ['houses', ['house', 'shop', 'cafe']],
  ['apartments', ['apartment', 'office', 'hotel']], ['skyscrapers', ['skyscraper', 'clock_tower', 'crane']]]
  .map(([label, names]) => { names = names.filter((n) => assets[n]); return { label, names, need: Math.max(...names.map((n) => assets[n].meta.tier)) / 0.95 }; })
  .sort((a, b) => a.need - b.need);
if (!location.search.includes('nothumbs')) setTimeout(async () => { await warmThumbs(assets); for (const m of MILESTONES) m.icons = m.names.map((n) => thumb(assets[n])); }, 1200); // pre-render, never mid-run
const levelEl = Object.assign(document.createElement('div'), { id: 'levelup' });
document.body.append(levelEl);
function sizeUp(m) {
  hole.shockwave();
  sfx.levelUp();
  levelEl.innerHTML = `<small>Size up · ${hole.r.toFixed(1)} m</small><b>Now eating ${m.label}!</b><span>${(m.icons || []).map((u) => `<img alt="" src="${u}">`).join('')}</span>`;
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
let city, hole, state, director, rivals, grass;
function newRun(seed = (Math.random() * 2 ** 31) | 0, daily = false, card = 'none') {
  if (city) { scene.remove(city.group, hole.group, grass.group); city.dispose(); hole.dispose(); director.dispose(); rivals.dispose(); grass.dispose(); }
  const debugR = +new URLSearchParams(location.search).get('r') || 0; // screenshot/debug: start bigger
  hole = new Hole(assets, field, 0, { r: debugR || 0.45 + level('headstart') * 0.07, skin: save.skin || 'void' });
  hole.pull = 1 + level('gravity') * 0.1;
  city = new City(assets, seed, field);
  director = new Director(city, scene, { hurt, toll, spotted, ram, siren: sfx.siren, warn: (t) => flash(t, false) }, card === 'hot' ? 2 : 0);
  rivals = new Rivals(assets, field, city, scene, card === 'crowded' ? 3 : card === 'lonely' ? 0 : 2, save.skin || 'void');
  // Randomised start: time of day, and a calm open tile (never a downtown lot) at a random spot on it.
  const r = rng(seed ^ 0x5eed);
  const time = new URLSearchParams(location.search).get('time') || (city.mood.night ? 'night' : r.pick(DAY_TIMES));
  const preset = applyTime(look, renderer, time);
  look.grade = preset.grade;
  glow.value = preset.glow;
  world.night.value = TIMES[time]?.night ? 1 : 0;
  world.edCol.value.set(SKINS[save.skin || 'void'].rim);
  const open = city.tiles.filter((t) => ['plaza', 'park', 'residential', 'canal', 'parking', 'beach', 'neon'].includes(t.type));
  const t = r.pick(open);
  const a = r() * Math.PI * 2;
  hole.x = t.cx + Math.cos(a) * 13.5;
  hole.z = t.cz + Math.sin(a) * 13.5;
  // breadcrumbs: a few wandering snacks right around the start so the first seconds always have food
  for (let k = 0; k < 10; k++) {
    const b = r() * Math.PI * 2, d = 2.5 + r() * 6;
    city.revive(r.pick([...PEOPLE, 'pigeon']), hole.x + Math.cos(b) * d, hole.z + Math.sin(b) * d, hole.x, hole.z);
  }
  $('where').textContent = `${city.mood.name} · ${city.N}×${city.N} blocks · ${time}`;
  grass = new Grass(renderer, city.groundMeshes, city.half + 80, field, { density: +(new URLSearchParams(location.search).get('grass') ?? (LOW_FX ? 0.5 : 1)) });
  scene.add(city.group, hole.group, grass.group);
  state = { playing: false, seed, daily, card, time: 0, belly: 1, eaten: 0, score: 0, best: hole.r, stars: 0,
    reverse: 0, jam: 0, slow: 0, invuln: 0, shake: 0, sealing: 0, hits: [], left: city.buildingsLeft(), combo: 0, comboT: 0, bonus: 0,
    rareDust: 0, rivalsEaten: 0, hitstop: 0, punch: 0, finale: 0, mi: MILESTONES.filter((m) => hole.r >= m.need).length };
}
const URL_SEED = new URLSearchParams(location.search).get('seed');
newRun(URL_SEED ? +URL_SEED : undefined);
window.__game = () => ({ hole, city, state, renderer, director, rivals });
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

function steer() {
  let x = 0, z = 0;
  const k = input.keys;
  if (k.has('a') || k.has('arrowleft')) x -= 1;
  if (k.has('d') || k.has('arrowright')) x += 1;
  if (k.has('w') || k.has('arrowup')) z -= 1;
  if (k.has('s') || k.has('arrowdown')) z += 1;
  let v = input.drag ? { x: input.drag.dx, y: input.drag.dy } : input.mouse;
  if (v && !input.drag) { // mouse: steer from where the hole is drawn, not the screen centre (the camera trails a little)
    _v.set(hole.x, 0, hole.z).project(camera);
    v = { x: v.x - _v.x * innerWidth / 2, y: v.y + _v.y * innerHeight / 2 };
  }
  if (!x && !z && v) {
    const full = Math.min(innerWidth, innerHeight) * 0.16, len = Math.hypot(v.x, v.y);
    if (len > 8) { const m = Math.min(1, len / full) / len; x = v.x * m; z = v.y * m; }
  }
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return state.reverse > 0 ? [-x, -z] : [x, z];
}

// ---------- HUD ----------
function hud() {
  $('size').querySelector('b').textContent = hole.r.toFixed(2);
  $('eaten').querySelector('b').textContent = state.eaten;
  $('hunger').style.width = `${state.belly * 100}%`;
  $('hunger').parentElement.classList.toggle('low', state.belly < 0.3);
  $('stars').textContent = '★'.repeat(director.stars) + '☆'.repeat(4 - director.stars);
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
  const st = [state.reverse > 0 && 'Controls reversed', state.jam > 0 && 'Jammed', state.slow > 0 && 'Slowed', state.flooded && 'Tide! Slow + hungry',
    director.bonusT > 0 && 'Spotted'].filter(Boolean);
  const c = CARDS[state.card];
  $('card').hidden = state.card === 'none';
  $('card').textContent = state.card === 'rush' ? `${c.name} · ${clock(Math.max(0, 300 - state.time))}` : `${c.name} ×${c.mult}`;
  $('status').textContent = st.join(' · ');
}

// ---------- first-run hints (once per browser) ----------
const HINTS = [
  [1, 'Steer onto things smaller than you'],
  [9, 'Keep eating — the purple bar is your belly'],
  [18, 'Big bites make you grow faster'],
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
  hole.area *= 1 - Math.min(frac * glass * (1 - level('hardhat') * 0.15), MAX_HIT * glass);
  state.hits.push(why);
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
function flash(text, red = true) {
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
  hurt(0.04, 'Rammed by police!');
}
function spotted() {
  flash('Spotted! ★+1', false);
  sfx.star();
}
function poison(effect) {
  if (state.card === 'clean') { endRun(false, 'Poisoned — Clean Diet broken'); return; }
  if (effect === 'shrink') hurt(0.12, 'Gas can! Shrunk');
  if (effect === 'reverse') { state.reverse = 3; flash('Toxic! Controls reversed'); }
  if (effect === 'jam') { state.jam = 2; flash('Spiky art! Jammed'); }
}

// ---------- menus ----------
let pickedCard = 'none';
function start(seed, daily) {
  sfx.unlock();
  const card = daily ? dailyCard(rng(seed)) : pickedCard;
  // Play the city shown behind the menu; reroll for daily/replays or when the card changes the city.
  const fresh = state.over || state.time > 0 || false;
  if (seed !== undefined || fresh || card !== 'none') newRun(seed ?? (fresh ? undefined : state.seed), daily, card);
  $('screen').hidden = true;
  $('hud').hidden = false;
  state.playing = true;
}
$('play').onclick = () => start(undefined, false);
$('daily').onclick = () => start(todaySeed(), true);
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
  $('daily').textContent = dailyBest ? `Daily city · best ${dailyBest.clear ? `cleared ${clock(dailyBest.clear)}` : `${dailyBest.r.toFixed(1)} m`}` : 'Daily city';
  $('shop').replaceChildren(closeBtn('shop'), ...Object.entries(UPGRADES).map(([id, u]) => {
    const lv = level(id), cost = u.costs[lv];
    const b = document.createElement('button');
    b.className = 'card';
    b.disabled = cost === undefined || save.dust < cost;
    b.innerHTML = `<b>${u.name}</b><small>${u.desc}</small><span>${'●'.repeat(lv)}${'○'.repeat(u.costs.length - lv)}</span><em>${cost === undefined ? 'max' : cost + ' dust'}</em>`;
    b.onclick = () => { if (buy(id)) renderShop(); };
    return b;
  }), ...skinCards());
}

function skinCards() {
  const head = document.createElement('p');
  head.className = 'shop-head';
  head.textContent = 'Hole skins';
  return [head, ...Object.entries(SKINS).map(([id, sk]) => {
    const owned = id === 'void' || save.skins?.includes(id), on = (save.skin || 'void') === id;
    const b = document.createElement('button');
    b.className = 'card skin' + (on ? ' on' : '');
    b.style.setProperty('--rim', '#' + new THREE.Color(sk.rim).getHexString());
    b.style.setProperty('--deep', '#' + new THREE.Color(sk.top || sk.deep).getHexString());
    b.disabled = !owned && save.dust < sk.cost;
    b.innerHTML = `<i class="swatch"></i><b>${sk.name}</b><em>${on ? 'equipped' : owned ? 'equip' : sk.cost + ' dust'}</em>`;
    b.onclick = () => {
      if (!owned) { if (save.dust < sk.cost) return; save.dust -= sk.cost; (save.skins ??= []).push(id); }
      save.skin = id;
      persist();
      renderShop();
      if (!state.playing) newRun(state.seed, state.daily, state.card); // preview the new skin behind the menu
    };
    return b;
  })];
}
renderShop();

/** Ends a run. won = every building swallowed; why = how a lost run ended. */
function endRun(won, why) {
  if (!state.playing) return;
  state.playing = false;
  rivals.hideLabels();
  offered = offer(rng((Math.random() * 2 ** 31) | 0));
  pickedCard = 'none';
  renderCards();
  state.over = true;
  if (won) { sfx.star(); state.finale = 3.4; }
  else { state.sealing = 1.2; sfx.seal(); }
  const mult = CARDS[state.card].mult;
  const dust = Math.floor((Math.floor(2 * Math.sqrt(state.score)) + Math.floor(state.bonus / 4) + state.rareDust + (won ? 150 : 0)) * mult);
  save.dust += dust;
  save.best = Math.max(save.best, state.best);
  if (won) save.fastest = Math.min(save.fastest || Infinity, state.time);
  if (state.daily) {
    const d = { r: 0, ...save.daily[state.seed] };
    d.r = Math.max(d.r, state.best);
    if (won) d.clear = Math.min(d.clear || Infinity, state.time);
    save.daily[state.seed] = d;
  }
  persist();
  setTimeout(() => {
    $('hud').hidden = true;
    $('screen').hidden = false;
    $('title').innerHTML = won ? 'You swallowed<br><span>the city</span>' : why ? `${why.split(' — ')[0]}<br><span>${why.split(' — ')[1] || 'game over'}</span>` : 'The ground<br><span>sealed</span>';
    $('result').hidden = false;
    $('result').innerHTML = (won
      ? `Every building gone in <b>${clock(state.time)}</b>${state.daily ? ' — today\'s city' : ''}. Fastest ever <b>${clock(save.fastest)}</b>.`
      : `You swallowed <b>${state.eaten}</b> things and grew to <b>${state.best.toFixed(1)} m</b>${state.daily ? ' in today\'s city' : ''}. <b>${state.left}</b> buildings still stand.`)
      + (state.bite ? `<span class="bite"><img alt="" src="${state.bite}"><small>Biggest bite · ${title(state.biteName)}</small></span>` : '<br>')
      + `+<b>${dust}</b> void dust${mult > 1 ? ` (×${mult} ${CARDS[state.card].name})` : ''}${state.rivalsEaten ? ` · ate ${state.rivalsEaten} rival${state.rivalsEaten > 1 ? 's' : ''}` : ''} · best ever <b>${save.best.toFixed(1)} m</b>`;
    $('play').textContent = 'Dig again';
    renderShop();
  }, won ? 3600 : 1300);
}

// ---------- loop ----------
const timer = new THREE.Clock();
const camTarget = new THREE.Vector3(hole.x, 0, hole.z);
const _v = new THREE.Vector3();
let camDist = 14 * LENS, camYaw = 0;

renderer.setAnimationLoop(() => frame(Math.min(timer.getDelta(), 1 / 20)));
window.__tick = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); };

function frame(dt) {
  if (state.hitstop > 0) { state.hitstop -= dt; dt *= 0.1; } // hit-stop: the world freezes for a beat on a big bite
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
    state.belly = Math.max(0, state.belly - BELLY_DRAIN * tide * Math.min(1, 0.3 + state.time / 25) * dt); // gentle first 20s
    const [sx, sz] = window.__bot ? window.__bot(hole, city) : steer();
    const speed = (6.5 + hole.r * 1.8) * (state.slow > 0 ? 0.45 : 1) * (state.flooded ? 0.6 : 1);
    // a little weight (~0.1s to turn / reach speed), not a boat
    const kv = 1 - Math.exp(-dt * 11);
    hole.sx = (hole.sx || 0) + (sx - (hole.sx || 0)) * kv;
    hole.sz = (hole.sz || 0) + (sz - (hole.sz || 0)) * kv;
    const lim = Math.max(2, city.half - hole.r * 0.95); // keep the whole hole disc inside town
    const px = hole.x, pz = hole.z;
    const kick = state.kick || { x: 0, z: 0 };
    hole.x = THREE.MathUtils.clamp(hole.x + (hole.sx * speed + kick.x) * dt, -lim, lim);
    hole.z = THREE.MathUtils.clamp(hole.z + (hole.sz * speed + kick.z) * dt, -lim, lim);
    hole.vac = Math.max(0, (hole.vac || 0) - dt);
    kick.x *= Math.max(0, 1 - dt * 5);
    kick.z *= Math.max(0, 1 - dt * 5);
    hole.vx = (hole.x - px) / dt;
    hole.vz = (hole.z - pz) / dt;

    const slower = (1 - level('appetite') * 0.12) * (state.card === 'lonely' ? 1.3 : 1);
    const fed = DECAY_FED / (1 + hole.r * 0.15); // big holes need proportionally bigger meals already
    hole.area *= 1 - (state.belly > 0 ? fed : DECAY_STARVING) * slower * dt;
    director.update(dt, hole, state);
    if (director.stars > state.stars) {
      sfx.star();
      flash('★'.repeat(director.stars) + ' The city fights back', false);
      if (!save.hinted && director.stars === 1) setTimeout(() => hint('Red rings = something is about to land. Move!'), 1500);
    }
    state.stars = director.stars;
    if ((state.leftTimer = (state.leftTimer || 0) - dt) <= 0) { state.leftTimer = 0.5; state.left = city.buildingsLeft(); }
    const rv = rivals.update(dt, hole, true, state.time);
    if (rv === 'eaten') endRun(false, `Eaten — by ${rivals.list.find((q) => !q.dead && q.hole.r > hole.r)?.name || 'a rival'}`);
    else for (const q of rv) {
      hole.area += q.hole.area * 0.6;
      state.rivalsEaten++;
      state.score += q.hole.area;
      flash(`Swallowed ${q.name}!`, false);
      sfx.star();
      sparks.burst(hole.x, hole.z, hole.r, 6);
    }
    if (!state.playing) { /* eaten above */ }
    else if (hole.r < DEAD_R) endRun(false);
    else if (state.left === 0) endRun(true);
    else if (state.card === 'rush' && state.time > 300) endRun(false, 'Too slow — Rush Hour over');
  } else if (state.sealing > 0) {
    state.sealing = Math.max(0, state.sealing - dt);
    hole.area *= Math.max(0, 1 - dt * 6);
  }

  if (!state.playing) rivals.update(dt, hole, false);
  const eaten = city.update(dt, [hole, ...rivals.holes], state.jam > 0 || !state.playing);
  for (const ev of city.events) {
    if (ev.type === 'fall') {
      const e = ev.e, t = e.meta.tier, mine = e.eater === hole && state.playing;
      if (t >= 2.5) {
        debris.collapse(e, e.eater || hole, LOW_FX || post.lowSpec);
        if (mine) state.shake = Math.max(state.shake, Math.min(0.5, t * 0.04));
      }
      if (mine && t >= 0.5 && t > hole.r * 0.6 && state.time > (state.stopCool || 0)) {
        state.stopCool = state.time + 1;
        state.hitstop = 0.05 + Math.min(0.08, t * 0.012);
        state.punch = 1;
        sfx.bigGulp(t);
      }
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
    if (e.eater && e.eater !== hole) { // a rival's meal
      const before = e.eater.area;
      // rubber band: rivals keep pace with you but never run away with the city
      const ahead = e.eater.r > hole.r * 1.4 + 1;
      if (e.meta.kind !== 'poison') e.eater.grow(e.meta.tier, ahead ? 0.12 : 0.5);
      rivals.fed(e.eater, before);
      continue;
    }
    if (!state.playing) continue;
    sfx.gulp(e.meta.tier);
    hole.vac = Math.min(1.4, (hole.vac || 0) + 0.55); // whirlpool: each bite keeps the suction going (chains)
    if (record(e.name)) flash(`New in the book: ${title(e.name)}`, false);
    if (e.meta.rare) { state.rareDust += 25; sparks.burst(hole.x, hole.z, hole.r, 4); sfx.star(); }
    if (e.meta.kind === 'poison') { poison(e.meta.effect); continue; }
    if (e.meta.effect === 'combo') { state.combo += 3; state.comboT = 1.2; }
    const before = hole.area;
    const mult = state.card === 'vehicles' ? (VEHICLES.has(e.name) ? 1.5 : 0.25) : state.card === 'glass' ? 1.5 : 1;
    hole.grow(e.meta.tier, mult);
    // a full meal is MEAL of the hole's area, capped at a 6 m hole's worth so late game stays feedable
    state.belly = Math.min(1, state.belly + (hole.area - before) / (Math.min(before, Math.PI * 36) * MEAL));
    state.eaten++;
    state.score += Math.PI * e.meta.tier ** 2;
    hole.bump = Math.min(0.25, (hole.bump || 0) + e.meta.tier / hole.r * 0.3);
    sparks.burst(hole.x, hole.z, hole.r, e.meta.tier);
    if (e.meta.tier > hole.r * 0.12) debris.crumbs(hole, e.meta.tier);
    state.combo = state.comboT > 0 ? state.combo + 1 : 1;
    state.comboT = 0.9;
    state.bonus += state.combo - 1;
    if (state.combo >= 3) combo(state.combo);
  }
  state.best = Math.max(state.best, hole.r);
  if (state.playing) {
    let top = null;
    while (state.mi < MILESTONES.length && hole.r >= MILESTONES[state.mi].need) top = MILESTONES[state.mi++];
    if (top) sizeUp(top); // several at once (ate a rival): announce only the biggest
  }
  // chimney + street-food smoke near the camera
  if (!LOW_FX && !post.lowSpec) for (const e of city.smokers ??= city.entities.filter((q) => SMOKE[q.name])) {
    if (!e.alive || e.falling || (e.smokeT = (e.smokeT ?? Math.random()) - dt) > 0) continue;
    e.smokeT = 0.35 + Math.random() * 0.3;
    if (Math.abs(e.x - camTarget.x) > camDist * 0.8 || Math.abs(e.z - camTarget.z) > camDist * 0.8) continue;
    const [lx, ly, lz, c] = SMOKE[e.name], cs = Math.cos(e.rot), sn = Math.sin(e.rot);
    debris.puff(e.x + lx * cs + lz * sn, ly + e.y, e.z - lx * sn + lz * cs, 0.25 + Math.random() * 0.2, 0.8 + Math.random() * 0.4,
      (Math.random() - 0.5) * 0.2, 0.3, 0.7, 2.6, smokeCol.set(c), 0.4);
  }
  city.mixers.forEach((m) => m.update(dt));
  hole.update(dt, state.time, Math.max(0, 0.5 - state.belly) * 2, city.groundSpan(hole.x, hole.z, hole.r));

  // camera: pull back as the hole grows
  const portrait = Math.max(1, 1.2 / camera.aspect) ** 0.7; // phones see as much width as desktops
  state.finale = Math.max(0, state.finale - dt);
  state.punch = Math.max(0, state.punch - dt * 2.5);
  const lift = state.finale > 0 ? 2.2 : 1; // victory: pull up over the emptied city
  camDist += ((14 + hole.r * 8) * portrait * LENS * lift - camDist) * Math.min(1, dt * (state.finale > 0 ? 0.8 : 2));
  camTarget.lerp(_v.set(hole.x, 0, hole.z), Math.min(1, dt * 6));
  const sh = state.shake * camDist * 0.02;
  // attract mode: slow orbit behind the menu; snaps back to north-up for play (steering is screen-relative)
  camYaw = state.finale > 0 ? camYaw + dt * 0.3 : state.playing || state.over ? Math.atan2(Math.sin(camYaw), Math.cos(camYaw)) * Math.max(0, 1 - dt * 4) : camYaw + dt * 0.06;
  if (VIEW) { camTarget.set(VIEW[0], 0, VIEW[1]); camDist = VIEW[2]; camYaw = VIEW[3] || 0; }
  const pitch = VIEW?.[4] ? THREE.MathUtils.degToRad(VIEW[4]) : PITCH;
  const camD = camDist * (1 - state.punch * 0.07); // punch-in on big bites
  const horiz = Math.cos(pitch) * camD;
  camera.position.set(camTarget.x + Math.sin(camYaw) * horiz + (Math.random() - 0.5) * sh, Math.sin(pitch) * camD,
    camTarget.z + Math.cos(camYaw) * horiz + (Math.random() - 0.5) * sh);
  camera.lookAt(camTarget);
  const low = post.lowSpec || location.search.includes('low');
  surfaceOn.value = low ? 0 : 1;
  city.budget(camera, hole.r, low);
  followSun(sun, camTarget);
  grass.update(camTarget, camDist / LENS, low);
  setFogRange(camDist);
  const sc = sun.shadow.camera, ext = Math.max(25, (camDist / LENS) * 0.9);
  if (sc.right !== ext) { sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.updateProjectionMatrix(); }

  sparks.update(dt);
  debris.update(dt);
  for (const s of bubbles) {
    if (s.t <= 0) continue;
    s.t -= dt;
    if (s.t <= 0 || !s.e.alive || s.e.falling || !state.playing) { s.t = 0; s.b.hidden = true; continue; }
    _v.set(s.e.x, s.e.y + s.e.meta.height + 0.3, s.e.z).project(camera);
    s.b.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-10%, -100%)`;
  }
  world.hole.value.set(hole.x, hole.z, hole.hidden || !state.playing ? 0 : hole.r, hole.vac || 0);
  pedTime.value += dt;
  surfaceTime.value += dt;
  for (const q of rivals.list) q.hole.update(dt, state.time, 0, city.groundSpan(q.hole.x, q.hole.z, q.hole.r));
  if (state.playing) { hud(); rivals.labels(camera); }
  if (!window.__headless) {
    if (state.playing && document.visibilityState === 'visible') post.watch(dt);
    post.render(look.grade || [1, 1, 1]);
    if (state.snapAt && state.time >= state.snapAt) { state.snapAt = 0; state.bite = snapshot(); }
  }
}
