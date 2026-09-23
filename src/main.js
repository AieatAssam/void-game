import * as THREE from 'three';
import { createRenderer, createScene, followSun, applyTime, TIMES } from './look.js';
import { loadAll, toyMaterial } from './assets.js';
import { City, rng, BUILDINGS } from './city.js';
import { Hole } from './hole.js';
import { Director } from './director.js';
import { installBot } from './bot.js';
import { UPGRADES, save, persist, level, buy, todaySeed } from './meta.js';
import * as sfx from './sfx.js';
import { Post } from './post.js';
import { Sparks } from './fx.js';

const $ = (id) => document.getElementById(id);
const renderer = createRenderer($('c'));
const look = createScene();
const { scene, sun } = look;
const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 900);
const PITCH = THREE.MathUtils.degToRad(55);
const post = new Post(renderer, scene, camera);
const sparks = new Sparks();
scene.add(sparks.points);

// ---------- starvation tuning (PLAN.md: keep moving or the ground seals) ----------
const BELLY_DRAIN = 1 / 6; // a full belly lasts 6s
const MEAL = 0.15; // eating this fraction of the hole's own area fills the belly
const DECAY_FED = 0.02; // area fraction lost per second while the belly has food
const DECAY_STARVING = 0.12; // ... while it is empty
const DEAD_R = 0.26;
const MAX_HIT = 0.25; // rule 3: no single hit takes more than 25%

const assets = await loadAll((p) => { $('load').querySelector('b').textContent = `${Math.round(p * 100)}%`; });
$('load').hidden = true;
$('menu').hidden = false;

let city, hole, state, director;
function newRun(seed = (Math.random() * 2 ** 31) | 0, daily = false) {
  if (city) { scene.remove(city.group, hole.group); city.dispose(); hole.dispose(); director.dispose(); }
  hole = new Hole(assets, 0, 0, 0.45 + level('headstart') * 0.07);
  hole.pull = 1 + level('gravity') * 0.1;
  city = new City(assets, seed, hole.uniform);
  director = new Director(city, scene, { hurt, toll });
  // Randomised start: time of day, and a calm open tile (never a downtown lot) at a random spot on it.
  const r = rng(seed ^ 0x5eed);
  const time = new URLSearchParams(location.search).get('time') || r.pick(Object.keys(TIMES));
  look.grade = applyTime(look, renderer, time, toyMaterial).grade;
  const open = city.tiles.filter((t) => ['plaza', 'park', 'residential', 'canal', 'parking'].includes(t.type));
  const t = r.pick(open);
  const a = r() * Math.PI * 2;
  hole.x = t.cx + Math.cos(a) * 13.5;
  hole.z = t.cz + Math.sin(a) * 13.5;
  // breadcrumbs: a few wandering snacks right around the start so the first seconds always have food
  for (let k = 0; k < 10; k++) {
    const b = r() * Math.PI * 2, d = 2.5 + r() * 6;
    city.revive(r.pick(['peg_a', 'peg_b', 'peg_c', 'pigeon', 'peg_d']), hole.x + Math.cos(b) * d, hole.z + Math.sin(b) * d, hole.x, hole.z);
  }
  $('where').textContent = `${city.mood.name} · ${city.N}×${city.N} blocks · ${time}`;
  scene.add(city.group, hole.group);
  state = { playing: false, seed, daily, time: 0, belly: 1, eaten: 0, score: 0, best: hole.r, stars: 0,
    reverse: 0, jam: 0, slow: 0, invuln: 0, shake: 0, sealing: 0, hits: [], left: city.buildingsLeft(), combo: 0, comboT: 0, bonus: 0 };
}
newRun();
window.__game = () => ({ hole, city, state, renderer, director });
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
  const v = input.drag ? { x: input.drag.dx, y: input.drag.dy } : input.mouse;
  if (!x && !z && v) {
    const full = Math.min(innerWidth, innerHeight) * 0.25, len = Math.hypot(v.x, v.y);
    if (len > 12) { const m = Math.min(1, len / full) / len; x = v.x * m; z = v.y * m; }
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
  const st = [state.reverse > 0 && 'Controls reversed', state.jam > 0 && 'Jammed', state.slow > 0 && 'Slowed'].filter(Boolean);
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
  hole.area *= 1 - Math.min(frac * (1 - level('hardhat') * 0.15), MAX_HIT);
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
function poison(effect) {
  if (effect === 'shrink') hurt(0.12, 'Gas can! Shrunk');
  if (effect === 'reverse') { state.reverse = 3; flash('Toxic! Controls reversed'); }
  if (effect === 'jam') { state.jam = 2; flash('Spiky art! Jammed'); }
}

// ---------- menus ----------
function start(seed, daily) {
  sfx.unlock();
  // Play the city shown behind the menu; only reroll for daily/replays.
  if (seed !== undefined || state.over || state.time > 0) newRun(seed, daily);
  $('screen').hidden = true;
  $('hud').hidden = false;
  state.playing = true;
}
$('play').onclick = () => start(undefined, false);
$('daily').onclick = () => start(todaySeed(), true);
$('shopBtn').onclick = () => { $('shop').hidden = !$('shop').hidden; renderShop(); };
function muteToggle() { $('mute').textContent = sfx.toggleMute() ? '♪̸' : '♪'; }
$('mute').onclick = muteToggle;

const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function renderShop() {
  $('dust').textContent = save.dust;
  const dailyBest = save.daily[todaySeed()];
  $('daily').textContent = dailyBest ? `Daily city · best ${dailyBest.clear ? `cleared ${clock(dailyBest.clear)}` : `${dailyBest.r.toFixed(1)} m`}` : 'Daily city';
  $('shop').replaceChildren(...Object.entries(UPGRADES).map(([id, u]) => {
    const lv = level(id), cost = u.costs[lv];
    const b = document.createElement('button');
    b.className = 'card';
    b.disabled = cost === undefined || save.dust < cost;
    b.innerHTML = `<b>${u.name}</b><small>${u.desc}</small><span>${'●'.repeat(lv)}${'○'.repeat(u.costs.length - lv)}</span><em>${cost === undefined ? 'max' : cost + ' dust'}</em>`;
    b.onclick = () => { if (buy(id)) renderShop(); };
    return b;
  }));
}
renderShop();

/** Ends a run. won = every building swallowed. */
function endRun(won) {
  state.playing = false;
  state.over = true;
  if (won) sfx.star();
  else { state.sealing = 1.2; sfx.seal(); }
  const dust = Math.floor(2 * Math.sqrt(state.score)) + Math.floor(state.bonus / 4) + (won ? 150 : 0);
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
    $('title').innerHTML = won ? 'You swallowed<br><span>the city</span>' : 'The ground<br><span>sealed</span>';
    $('result').hidden = false;
    $('result').innerHTML = (won
      ? `Every building gone in <b>${clock(state.time)}</b>${state.daily ? ' — today\'s city' : ''}. Fastest ever <b>${clock(save.fastest)}</b>.`
      : `You swallowed <b>${state.eaten}</b> things and grew to <b>${state.best.toFixed(1)} m</b>${state.daily ? ' in today\'s city' : ''}. <b>${state.left}</b> buildings still stand.`)
      + `<br>+<b>${dust}</b> void dust${won ? ' (incl. 150 clear bonus)' : ''} · best ever <b>${save.best.toFixed(1)} m</b>`;
    $('play').textContent = 'Dig again';
    renderShop();
  }, 1300);
}

// ---------- loop ----------
const timer = new THREE.Clock();
const camTarget = new THREE.Vector3(hole.x, 0, hole.z);
const _v = new THREE.Vector3();
let camDist = 14, camYaw = 0;

renderer.setAnimationLoop(() => frame(Math.min(timer.getDelta(), 1 / 20)));
window.__tick = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); };

function frame(dt) {
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
    state.belly = Math.max(0, state.belly - BELLY_DRAIN * Math.min(1, 0.3 + state.time / 25) * dt); // gentle first 20s
    const [sx, sz] = window.__bot ? window.__bot(hole, city) : steer();
    const speed = (5 + hole.r * 1.6) * (state.slow > 0 ? 0.45 : 1);
    const lim = Math.max(2, city.half - hole.r * 0.95); // keep the whole hole disc inside town
    const px = hole.x, pz = hole.z;
    hole.x = THREE.MathUtils.clamp(hole.x + sx * speed * dt, -lim, lim);
    hole.z = THREE.MathUtils.clamp(hole.z + sz * speed * dt, -lim, lim);
    hole.vx = (hole.x - px) / dt;
    hole.vz = (hole.z - pz) / dt;

    const slower = 1 - level('appetite') * 0.12;
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
    if (hole.r < DEAD_R) endRun(false);
    else if (state.left === 0) endRun(true);
  } else if (state.sealing > 0) {
    state.sealing = Math.max(0, state.sealing - dt);
    hole.area *= Math.max(0, 1 - dt * 6);
  }

  const eaten = city.update(dt, hole, state.jam > 0 || !state.playing);
  for (const ev of city.events) {
    if (ev.type === 'clog' && state.playing) { state.jam = Math.max(state.jam, 1.5); flash('Clogged!'); sfx.hurt(); }
  }
  for (const e of eaten) {
    if (!state.playing) continue;
    sfx.gulp(e.meta.tier);
    if (e.meta.kind === 'poison') { poison(e.meta.effect); continue; }
    const before = hole.area;
    hole.grow(e.meta.tier);
    // a full meal is MEAL of the hole's area, capped at a 6 m hole's worth so late game stays feedable
    state.belly = Math.min(1, state.belly + (hole.area - before) / (Math.min(before, Math.PI * 36) * MEAL));
    state.eaten++;
    state.score += Math.PI * e.meta.tier ** 2;
    hole.bump = Math.min(0.25, (hole.bump || 0) + e.meta.tier / hole.r * 0.3);
    sparks.burst(hole.x, hole.z, hole.r, e.meta.tier);
    state.combo = state.comboT > 0 ? state.combo + 1 : 1;
    state.comboT = 0.9;
    state.bonus += state.combo - 1;
    if (state.combo >= 3) combo(state.combo);
  }
  state.best = Math.max(state.best, hole.r);
  city.mixers.forEach((m) => m.update(dt));
  hole.update(dt, state.time, Math.max(0, 0.5 - state.belly) * 2);

  // camera: pull back as the hole grows
  const portrait = Math.max(1, 1.2 / camera.aspect) ** 0.7; // phones see as much width as desktops
  camDist += ((14 + hole.r * 8) * portrait - camDist) * Math.min(1, dt * 2);
  camTarget.lerp(_v.set(hole.x, 0, hole.z), Math.min(1, dt * 6));
  const sh = state.shake * camDist * 0.02;
  // attract mode: slow orbit behind the menu; snaps back to north-up for play (steering is screen-relative)
  camYaw = state.playing || state.over ? Math.atan2(Math.sin(camYaw), Math.cos(camYaw)) * Math.max(0, 1 - dt * 4) : camYaw + dt * 0.06;
  const horiz = Math.cos(PITCH) * camDist;
  camera.position.set(camTarget.x + Math.sin(camYaw) * horiz + (Math.random() - 0.5) * sh, Math.sin(PITCH) * camDist,
    camTarget.z + Math.cos(camYaw) * horiz + (Math.random() - 0.5) * sh);
  camera.lookAt(camTarget);
  city.budget(camera, hole.r, post.lowSpec || location.search.includes('low'));
  followSun(sun, camTarget);
  const sc = sun.shadow.camera, ext = Math.max(25, camDist * 0.9);
  if (sc.right !== ext) { sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.updateProjectionMatrix(); }

  sparks.update(dt);
  if (state.playing) hud();
  if (!window.__headless) {
    if (state.playing && document.visibilityState === 'visible') post.watch(dt);
    post.render(look.grade || [1, 1, 1]);
  }
}
