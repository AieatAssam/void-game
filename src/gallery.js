// Showroom: every asset on the tabletop, sorted by tier, clips playing. Click a name to frame it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRenderer, createScene, COLORS } from './look.js';
import { loadAll } from './assets.js';

const renderer = createRenderer(document.getElementById('c'));
const { scene } = createScene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const table = new THREE.Mesh(new THREE.CircleGeometry(200, 64), new THREE.MeshStandardMaterial({ color: COLORS.ground }));
table.rotation.x = -Math.PI / 2;
table.receiveShadow = true;
scene.add(table);

const assets = await loadAll();
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
  controls.update();
  renderer.render(scene, camera);
});
