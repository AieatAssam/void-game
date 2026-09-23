import * as THREE from 'three';
import { createRenderer, createScene, followSun } from './look.js';
import { loadAll } from './assets.js';
import { City } from './city.js';
import { Hole } from './hole.js';

const $ = (id) => document.getElementById(id);
const renderer = createRenderer($('c'));
const { scene, sun } = createScene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 900);
const PITCH = THREE.MathUtils.degToRad(55);

// ---------- starvation tuning (PLAN.md: keep moving or the ground seals) ----------
const FULL_FOR = 6; // seconds a meal keeps the belly meter from emptying
const DECAY_FED = 0.012; // area fraction lost per second while fed
const DECAY_STARVING = 0.09; // ... while the meter is empty
const DEAD_R = 0.26;

const assets = await loadAll((p) => { $('load').querySelector('b').textContent = `${Math.round(p * 100)}%`; });
$('load').hidden = true;
$('play').hidden = false;

let city, hole, state;
function newRun(seed = (Math.random() * 2 ** 31) | 0) {
  if (city) { scene.remove(city.group, hole.group); city.dispose(); hole.dispose(); }
  hole = new Hole(assets, 6, 4);
  city = new City(assets, seed, hole.uniform);
  const plaza = city.tiles.find((t) => t.type === 'plaza');
  hole.x = plaza.cx + 7;
  hole.z = plaza.cz + 5;
  scene.add(city.group, hole.group);
  state = { playing: false, time: 0, sinceMeal: 0, eaten: 0, best: hole.r, reverse: 0 };
}
newRun();
window.__game = () => ({ hole, city, state, renderer }); // debug + playtest hook

// ---------- input: steer toward pointer / drag / keys ----------
const input = { x: 0, z: 0, keys: new Set(), drag: null, mouse: null };
addEventListener('keydown', (e) => input.keys.add(e.key.toLowerCase()));
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
  const full = Math.max(0, 1 - state.sinceMeal / FULL_FOR);
  $('hunger').style.width = `${full * 100}%`;
  $('hunger').parentElement.classList.toggle('low', full < 0.3);
}

$('play').onclick = () => {
  if (!state.playing && state.over) newRun();
  $('screen').hidden = true;
  $('hud').hidden = false;
  state.playing = true;
};

function gameOver() {
  state.playing = false;
  state.over = true;
  $('screen').hidden = false;
  $('screen').querySelector('h1').innerHTML = 'The ground<br><span>sealed</span>';
  $('load').hidden = false;
  $('load').innerHTML = `You swallowed <b>${state.eaten}</b> things and grew to <b>${state.best.toFixed(1)} m</b>.`;
  $('play').textContent = 'Dig again';
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
    state.sinceMeal += dt;
    state.reverse = Math.max(0, state.reverse - dt);
    const [sx, sz] = steer();
    const speed = 5 + hole.r * 1.6;
    const lim = city.half - 2;
    hole.x = THREE.MathUtils.clamp(hole.x + sx * speed * dt, -lim, lim);
    hole.z = THREE.MathUtils.clamp(hole.z + sz * speed * dt, -lim, lim);

    const hungry = state.sinceMeal > FULL_FOR;
    hole.area *= 1 - (hungry ? DECAY_STARVING : DECAY_FED) * dt;
    if (hole.r < DEAD_R) gameOver();
  }

  const eaten = city.update(dt, hole);
  for (const e of eaten) {
    hole.grow(e.meta.mass);
    state.eaten++;
    state.sinceMeal = 0;
  }
  state.best = Math.max(state.best, hole.r);
  city.mixers.forEach((m) => m.update(dt));
  hole.update(dt, state.time, Math.max(0, state.sinceMeal / FULL_FOR - 0.5));

  // camera: pull back as the hole grows
  camDist += (14 + hole.r * 8 - camDist) * Math.min(1, dt * 2);
  camTarget.lerp(_v.set(hole.x, 0, hole.z), Math.min(1, dt * 6));
  camera.position.set(camTarget.x, Math.sin(PITCH) * camDist, camTarget.z + Math.cos(PITCH) * camDist);
  camera.lookAt(camTarget);
  city.budget(camera, hole.r);
  followSun(sun, camTarget);
  const sc = sun.shadow.camera, ext = Math.max(25, camDist * 0.9);
  if (sc.right !== ext) { sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.updateProjectionMatrix(); }

  if (state.playing) hud();
  renderer.render(scene, camera);
}
