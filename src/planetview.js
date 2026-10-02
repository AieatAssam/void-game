// ?planet=view: a debug viewer for the planet. A lit globe on an orbit camera (drag to rotate, wheel to zoom), no game.
// Params: seed=N, cam=<lat>,<lon>,<dist in R> (e.g. cam=20,40,2.6), sun=<deg> (sun azimuth about the pole), relief=E, clouds=0..1, noworker (main-thread bake), target=moon, q=low|high, nowatch.
import * as THREE from 'three/webgpu';
import { Post } from './post.js';
import { Q } from './quality.js';
import { bakePlanet, PlanetGlobe, R } from './planetglobe.js';
import { makePlanet } from './planetgen.js';

const _o = new THREE.Vector3();
export async function run(renderer, canvas) {
  const qs = new URLSearchParams(location.search), num = (k, d) => (qs.has(k) && qs.get(k) !== '' ? +qs.get(k) : d);
  document.getElementById('screen')?.remove();
  for (const id of ['hud', 'status', 'toast', 'combo', 'hint', 'arrow', 'mute']) document.getElementById(id)?.remove();
  document.body.style.cssText += ';margin:0;background:#000;overflow:hidden';
  const label = Object.assign(document.createElement('div'), { id: 'pv', textContent: 'Forming the world…' });
  label.style.cssText = 'position:fixed;left:0;right:0;top:46%;text-align:center;font:600 15px system-ui;color:#c9b8ff;letter-spacing:.08em;z-index:5';
  document.body.append(label);

  const seed = num('seed', 7);
  const bake = await bakePlanet(seed, 512, { workers: !qs.has('noworker') });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(30, 1, 1e5, 1e9);
  const globe = new PlanetGlobe(bake, { quality: Q.tier === 'low' ? 'low' : Q.tier === 'medium' ? 'medium' : 'high', relief: num('relief', 4) });
  scene.add(globe.group, globe.sky);
  const sunAz = THREE.MathUtils.degToRad(num('sun', 35));
  globe.u.uClouds.value = num('clouds', 1);
  globe.setSun(new THREE.Vector3(Math.cos(sunAz) * Math.cos(0.4), Math.sin(0.4), Math.sin(sunAz) * Math.cos(0.4)));
  renderer.toneMappingExposure = num('exp', 1.0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dpr, num('dpr', 2)));
  const post = new Post(renderer, scene, camera);
  post.opts.ao = false; post.opts.shafts = false; post.build(); // (no AO on a planet; shafts need the shared sunDir)
  post.setPreset({ lut: { shadow: [0.97, 1.0, 1.05], high: [1.03, 1.0, 0.97], sat: 1.1, con: 1.05 }, shafts: 0 });

  // orbit camera: lat/lon on the unit sphere, distance in planet radii
  const cam = (qs.get('cam') || '22,-30,4.4').split(',').map(Number);
  let lat = cam[0] * Math.PI / 180, lon = cam[1] * Math.PI / 180, dist = cam[2] || 4.4, auto = !qs.has('cam') && !qs.has('still');
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; auto = false; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = 0.0045 * Math.max(0.15, (dist - 1) / 2);
    lon -= (e.clientX - drag[0]) * k; lat = Math.max(-1.5, Math.min(1.5, lat + (e.clientY - drag[1]) * k));
    drag = [e.clientX, e.clientY];
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.max(1.03, Math.min(26, dist * Math.exp(e.deltaY * 0.001))); auto = false; }, { passive: false });
  const place = () => {
    const moon = qs.get('target') === 'moon', c0 = moon ? globe.moon.position : _o;
    camera.position.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).multiplyScalar(dist * R).add(c0);
    camera.up.set(0, 1, 0);
    camera.lookAt(c0);
    const alt = (dist - (moon ? 0.28 : 1)) * R;
    camera.near = Math.max(300, alt * 0.12); camera.far = Math.max(1.1e8, dist * R * 30);
    camera.updateProjectionMatrix();
  };
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1 ? 42 : 30; camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();
  label.remove();
  const fpsEl = Object.assign(document.createElement('div'), { id: 'pvfps' });
  fpsEl.style.cssText = 'position:fixed;left:8px;top:6px;font:12px ui-monospace,monospace;color:#9a8fc4;z-index:5;white-space:pre';
  if (qs.has('fps')) document.body.append(fpsEl);
  let last = performance.now(), frames = 0, acc = 0, fps = 0;
  window.__planet = { globe, P: makePlanet(seed), camera, bake, set: (la, lo, d) => { lat = la * Math.PI / 180; lon = lo * Math.PI / 180; dist = d; auto = false; }, fps: () => fps };
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1);
    last = now; frames++; acc += dt;
    if (acc >= 1) { fps = frames / acc; frames = acc = 0; fpsEl.textContent = `${fps.toFixed(0)} fps · ${renderer.getPixelRatio().toFixed(2)}x · bake ${window.__planetBakeMs.toFixed(0)} ms`; }
    if (auto) lon += dt * 0.05;
    place();
    globe.update(camera, dt);
    if (!qs.has('nowatch')) post.watch(dt);
    post.render([1, 1, 1]);
  });
  // dev: save the graded frame to .shots/<name>.jpg (vite.config.js), like main.js's __snap
  window.__snap = async (name = 'globe') => {
    await new Promise((r) => setTimeout(r, 50));
    const w = canvas.width, h = canvas.height, rt = new THREE.RenderTarget(w, h);
    place(); globe.update(camera, 0);
    renderer.setRenderTarget(rt); post.render([1, 1, 1]); renderer.setRenderTarget(null);
    const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
    rt.dispose();
    const c2 = Object.assign(document.createElement('canvas'), { width: w, height: h }), ctx = c2.getContext('2d'), img = ctx.createImageData(w, h);
    const stride = px.length === w * h * 4 ? w * 4 : Math.ceil((w * 4) / 256) * 256;
    for (let y = 0; y < h; y++) img.data.set(px.subarray(y * stride, y * stride + w * 4), y * w * 4);
    ctx.putImageData(img, 0, 0);
    return fetch(`/__shot?name=${name}`, { method: 'POST', body: c2.toDataURL('image/jpeg', 0.9) }).then((r) => r.text());
  };
}
