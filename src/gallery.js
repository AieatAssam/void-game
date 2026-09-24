// Showroom: every asset on the tabletop, sorted by tier, clips playing. Click a name to frame it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRenderer, createScene, applyTime, followSun, COLORS } from './look.js';
import { loadAll } from './assets.js';

const renderer = createRenderer(document.getElementById('c'));
const look = createScene();
const { scene } = look;
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const table = new THREE.Mesh(new THREE.CircleGeometry(200, 64), new THREE.MeshStandardMaterial({ color: COLORS.ground }));
table.rotation.x = -Math.PI / 2;
table.receiveShadow = true;
scene.add(table);

const assets = await loadAll();
import('./assets.js').then(({ toyMaterial }) => applyTime(look, renderer, new URLSearchParams(location.search).get('time') || 'golden', toyMaterial));
const mixers = [];
const list = document.getElementById('list');
const sorted = Object.values(assets).sort((p, q) => p.meta.tier - q.meta.tier);
let x = 0;
for (const a of sorted) {
  const r = Math.max(a.meta.tier, 0.3);
  x += r;
  a.scene.position.x = x;
  x += r + 1;
  scene.add(a.scene);
  if (a.clips.length) {
    const m = new THREE.AnimationMixer(a.scene);
    a.clips.forEach((c) => m.clipAction(c).play());
    mixers.push(m);
  }
  const b = document.createElement('button');
  b.innerHTML = `<span>${a.name} <small>${a.meta.kind} · tier ${a.meta.tier}</small></span><small>${(a.meta.tris / 1000).toFixed(1)}k △ ${a.clips.length ? '▶' : ''}</small>`;
  b.onclick = () => focus(a, b);
  list.append(b);
}

function focus(a, btn) {
  list.querySelectorAll('button').forEach((e) => e.classList.toggle('on', e === btn));
  const box = new THREE.Box3().setFromObject(a.scene);
  const c = box.getCenter(new THREE.Vector3());
  const d = box.getSize(new THREE.Vector3()).length() * 1.4 + 1;
  controls.target.copy(c);
  camera.position.set(c.x + d * 0.6, c.y + d * 0.55, c.z + d * 0.6);
}
focus(sorted[0], list.firstChild);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const w = innerWidth, h = innerHeight;
  if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const dt = clock.getDelta();
  mixers.forEach((m) => m.update(dt));
  followSun(look.sun, controls.target);
  controls.update();
  renderer.render(scene, camera);
});

// capture hook for docs: render + read back in one task (buffer isn't preserved between frames)
window.__shot = (dist = 1) => {
  camera.position.sub(controls.target).multiplyScalar(dist).add(controls.target);
  controls.update();
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/jpeg', 0.9);
};

// contact sheet for art review: every asset framed in a grid, returned as one image
window.__sheet = (names = sorted.map((a) => a.name), cols = 6, cell = 256, dirs = null) => {
  // dirs: optional list of camera directions; each name is rendered once per direction (for clipping review)
  if (dirs) names = names.flatMap((n) => dirs.map((d) => [n, d]));
  const rows = Math.ceil(names.length / cols);
  const out = document.createElement('canvas');
  out.width = cols * cell;
  out.height = rows * cell;
  const ctx = out.getContext('2d');
  const size = renderer.getSize(new THREE.Vector2());
  renderer.setSize(cell, cell, false);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  names.forEach((entry, i) => {
    const [n, dir] = Array.isArray(entry) ? entry : [entry, [0.62, 0.62, 0.62]];
    const a = assets[n];
    const box = new THREE.Box3().setFromObject(a.scene), c = box.getCenter(new THREE.Vector3()), d = box.getSize(new THREE.Vector3()).length() * 1.1 + 0.5;
    camera.position.set(c.x + d * dir[0], c.y + d * dir[1], c.z + d * dir[2]);
    camera.lookAt(c);
    followSun(look.sun, c);
    renderer.render(scene, camera);
    ctx.drawImage(renderer.domElement, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
    ctx.fillStyle = '#22222a';
    ctx.font = '14px sans-serif';
    ctx.fillText(n, (i % cols) * cell + 6, Math.floor(i / cols) * cell + 18);
  });
  renderer.setSize(size.x, size.y, false);
  return out.toDataURL('image/jpeg', 0.85);
};
