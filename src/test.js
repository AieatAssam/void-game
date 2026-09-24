// Dev-only render test bench: isolates materials/passes. /test.html?mat=toy&post=1
import * as THREE from 'three/webgpu';
import { createRenderer, createScene, applyTime } from './look.js';
const q = new URLSearchParams(location.search);
const renderer = await createRenderer(document.getElementById('c'));
renderer.setSize(innerWidth, innerHeight, false);
const look = createScene();
const { scene } = look;
if (q.get('env') !== '0') applyTime(look, renderer, 'golden');
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
const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat); m.castShadow = true; m.position.y = 1;
scene.add(m);
const g = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x888888 })); g.receiveShadow = true;
scene.add(g);
look.sun.position.set(5, 10, 3);
let post = null;
if (q.get('post') === '1') { const { Post } = await import('./post.js'); post = new Post(renderer, scene, cam); }
for (let i = 0; i < 3; i++) { post ? post.render([1, 1, 1]) : renderer.render(scene, cam); await new Promise((r) => setTimeout(r, 200)); }
console.log('[shot] rendered ok');
document.getElementById('menu').hidden = false;
