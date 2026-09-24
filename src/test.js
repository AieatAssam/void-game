// Dev-only render test bench: isolates materials/passes. /test.html?mat=toy&post=1
import * as THREE from 'three/webgpu';
import { createRenderer, createScene, applyTime, setFogRange } from './look.js';
const q = new URLSearchParams(location.search);
const renderer = await createRenderer(document.getElementById('c'));
renderer.setSize(innerWidth, innerHeight, false);
const look = createScene();
const { scene } = look;
if (q.get('env') !== '0') applyTime(look, renderer, q.get('time') || 'golden');
setFogRange(300);
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 500);
cam.position.set(4, 5, 8); cam.lookAt(0, 0, 0);
let mat = new THREE.MeshStandardMaterial({ color: 0xcc8844 });
const kind = q.get('mat') || 'std';
if (kind !== 'std') {
  const s = await import('./surface.js');
  const { loadPBR } = await import('./pbr.js');
  await loadPBR();
  mat = kind === 'ground' ? s.groundMaterial({ value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] }) : s.toyMaterial();
}
if (kind === 'fx') {
  const { Sparks, Debris } = await import('./fx.js');
  const sp = new Sparks(), db = new Debris();
  scene.add(sp.points, db.group);
  sp.burst(0, 0, 1, 1.5);
  const hole = { x: 0, z: 0, r: 1 };
  db.collapse({ x: 3, z: 0, meta: { tier: 3, height: 6 } }, hole, false);
  for (let i = 0; i < 12; i++) { sp.update(1 / 60); db.update(1 / 60); }
  window.__fxTick = () => { sp.update(1 / 60); db.update(1 / 60); };
} else if (kind === 'grass') {
  const { Grass } = await import('./grass.js');
  const tsl = await import('three/tsl');
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a5a25 }));
  ground.userData.grassMask = new THREE.MeshBasicNodeMaterial();
  ground.userData.grassMask.colorNode = tsl.vec4(1, 0, +(q.get('wild') || 0), 1);
  scene.add(ground);
  const field = { value: [new THREE.Vector3(3, 3, 1.2), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] };
  const grass = new Grass(renderer, [ground], 60, field, { density: +(q.get('grass') || 1) });
  grass.update(new THREE.Vector3(0, 0, 0), 20, false);
  scene.add(grass.group);
  cam.position.set(0, +(q.get('cy') || 14), +(q.get('cz') || 10)); cam.lookAt(0, 0, 0);
} else if (kind === 'trees') {
  const { loadPBR } = await import('./pbr.js');
  await loadPBR();
  const v = await import('./vegetation.js');
  const specs = [['fine', 3.65, 1.37], ['broad', 6.1, 2.25], ['pine', 11, 2.2], ['bush', 1.05, 0.65]];
  specs.forEach(([k, h, r], i) => {
    const lod = +(q.get('lod') || 0);
    const t = new THREE.Mesh(v.growTree(7 + i, k, h, r, lod), v.treeMaterials(k, h));
    t.position.set((i - 1.5) * 5.5, 0, 0);
    t.castShadow = t.receiveShadow = true;
    scene.add(t);
  });
  cam.position.set(0, +(q.get('cy') || 9), +(q.get('cz') || 22)); cam.lookAt(0, 3.5, 0);
} else {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat); m.castShadow = true; m.position.y = 1;
  scene.add(m);
}
const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f7a45, roughness: 0.95 })); g.receiveShadow = true;
scene.add(g);
look.sun.position.set(-30, 40, 20); look.sun.target.position.set(0, 0, 0);
let post = null;
if (q.get('post') === '1') { const { Post } = await import('./post.js'); post = new Post(renderer, scene, cam); }
for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 1500)); post ? post.render([1, 1, 1]) : renderer.render(scene, cam); }
console.log('[shot] rendered ok');
document.getElementById('menu').hidden = false;
