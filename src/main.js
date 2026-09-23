import * as THREE from 'three';
import { createRenderer, createScene, followSun } from './look.js';
import { loadAll } from './assets.js';
import { City } from './city.js';
import { Hole } from './hole.js';
import { Director } from './director.js';
import { installBot } from './bot.js';
import { UPGRADES, save, persist, level, buy, todaySeed } from './meta.js';
import * as sfx from './sfx.js';

const $ = (id) => document.getElementById(id);
const renderer = createRenderer($('c'));
const { scene, sun } = createScene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 900);
const PITCH = THREE.MathUtils.degToRad(55);

// ---------- starvation tuning (PLAN.md: keep moving or the ground seals) ----------
const BELLY_DRAIN = 1 / 7; // a full belly lasts 7s
const MEAL = 0.12; // eating this fraction of the hole's own area fills the belly
const DECAY_FED = 0.012; // area fraction lost per second while the belly has food
const DECAY_STARVING = 0.09; // ... while it is empty
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
  const plaza = city.tiles.find((t) => t.type === 'plaza');
  hole.x = plaza.cx + 7;
  hole.z = plaza.cz + 5;
  scene.add(city.group, hole.group);
  state = { playing: false, seed, daily, time: 0, belly: 1, eaten: 0, score: 0, best: hole.r, stars: 0,
    reverse: 0, jam: 0, slow: 0, invuln: 0, shake: 0, sealing: 0, hits: [] };
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
  const st = [state.reverse > 0 && 'Controls reversed', state.jam > 0 && 'Jammed', state.slow > 0 && 'Slowed'].filter(Boolean);
  $('status').textContent = st.join(' · ');
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
function flash(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  document.body.classList.remove('hurt');
  void document.body.offsetWidth;
  document.body.classList.add('hurt');
}
function poison(effect) {
  if (effect === 'shrink') hurt(0.12, 'Gas can! Shrunk');
  if (effect === 'reverse') { state.reverse = 3; flash('Toxic! Controls reversed'); }
  if (effect === 'jam') { state.jam = 2; flash('Spiky art! Jammed'); }
}

// ---------- menus ----------
function start(seed, daily) {
  sfx.unlock();
  newRun(seed, daily);
  $('screen').hidden = true;
  $('hud').hidden = false;
  state.playing = true;
}
$('play').onclick = () => start(undefined, false);
$('daily').onclick = () => start(todaySeed(), true);
$('shopBtn').onclick = () => { $('shop').hidden = !$('shop').hidden; renderShop(); };
function muteToggle() { $('mute').textContent = sfx.toggleMute() ? '♪̸' : '♪'; }
$('mute').onclick = muteToggle;

function renderShop() {
  $('dust').textContent = save.dust;
  const dailyBest = save.daily[todaySeed()];
  $('daily').textContent = dailyBest ? `Daily city · best ${dailyBest.toFixed(1)} m` : 'Daily city';
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

function gameOver() {
  state.playing = false;
  state.over = true;
  state.sealing = 1.2;
  sfx.seal();
  const dust = Math.floor(state.score / 8);
  save.dust += dust;
  save.best = Math.max(save.best, state.best);
  if (state.daily) save.daily[state.seed] = Math.max(save.daily[state.seed] || 0, state.best);
  persist();
  setTimeout(() => {
    $('hud').hidden = true;
    $('screen').hidden = false;
    $('title').innerHTML = 'The ground<br><span>sealed</span>';
    $('result').hidden = false;
    $('result').innerHTML = `You swallowed <b>${state.eaten}</b> things and grew to <b>${state.best.toFixed(1)} m</b>`
      + `${state.daily ? ' in today\'s city' : ''}.<br>+<b>${dust}</b> void dust · best ever <b>${save.best.toFixed(1)} m</b>`;
    $('play').textContent = 'Dig again';
    renderShop();
  }, 1300);
}

// ---------- loop ----------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3(hole.x, 0, hole.z);
const _v = new THREE.Vector3();
let camDist = 14;

renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 1 / 20)));
window.__tick = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); };

function frame(dt) {
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  if (state.playing) {
    state.time += dt;
    for (const k of ['reverse', 'jam', 'slow', 'invuln', 'shake']) state[k] = Math.max(0, state[k] - dt);
    state.belly = Math.max(0, state.belly - BELLY_DRAIN * dt);
    const [sx, sz] = window.__bot ? window.__bot(hole, city) : steer();
    const speed = (5 + hole.r * 1.6) * (state.slow > 0 ? 0.45 : 1);
    const lim = city.half - 2;
    const px = hole.x, pz = hole.z;
    hole.x = THREE.MathUtils.clamp(hole.x + sx * speed * dt, -lim, lim);
    hole.z = THREE.MathUtils.clamp(hole.z + sz * speed * dt, -lim, lim);
    hole.vx = (hole.x - px) / dt;
    hole.vz = (hole.z - pz) / dt;

    const slower = 1 - level('appetite') * 0.12;
    hole.area *= 1 - (state.belly > 0 ? DECAY_FED : DECAY_STARVING) * slower * dt;
    director.update(dt, hole, state);
    if (director.stars > state.stars) { state.stars = director.stars; sfx.star(); flash('★'.repeat(state.stars) + ' The city fights back'); }
    if (hole.r < DEAD_R) gameOver();
  } else if (state.sealing > 0) {
    state.sealing = Math.max(0, state.sealing - dt);
    hole.area *= Math.max(0, 1 - dt * 6);
  }

  const eaten = city.update(dt, hole, state.jam > 0 || !state.playing);
  for (const e of eaten) {
    if (!state.playing) continue;
    sfx.gulp(e.meta.tier);
    if (e.meta.kind === 'poison') { poison(e.meta.effect); continue; }
    const before = hole.area;
    hole.grow(e.meta.tier);
    state.belly = Math.min(1, state.belly + (hole.area - before) / (before * MEAL));
    state.eaten++;
    state.score += Math.PI * e.meta.tier ** 2;
    hole.bump = Math.min(0.25, (hole.bump || 0) + e.meta.tier / hole.r * 0.3);
  }
  state.best = Math.max(state.best, hole.r);
  city.mixers.forEach((m) => m.update(dt));
  hole.update(dt, state.time, Math.max(0, 0.5 - state.belly) * 2);

  // camera: pull back as the hole grows
  const portrait = Math.max(1, 1.2 / camera.aspect) ** 0.7; // phones see as much width as desktops
  camDist += ((14 + hole.r * 8) * portrait - camDist) * Math.min(1, dt * 2);
  camTarget.lerp(_v.set(hole.x, 0, hole.z), Math.min(1, dt * 6));
  const sh = state.shake * camDist * 0.02;
  camera.position.set(camTarget.x + (Math.random() - 0.5) * sh, Math.sin(PITCH) * camDist, camTarget.z + Math.cos(PITCH) * camDist + (Math.random() - 0.5) * sh);
  camera.lookAt(camTarget);
  city.budget(camera, hole.r);
  followSun(sun, camTarget);
  const sc = sun.shadow.camera, ext = Math.max(25, camDist * 0.9);
  if (sc.right !== ext) { sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.updateProjectionMatrix(); }

  if (state.playing) hud();
  if (!window.__headless) renderer.render(scene, camera);
}
