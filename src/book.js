// Collection book (item 17): every swallowable thing gets a page the first time you eat it. Rares shine.
import * as THREE from 'three/webgpu';
import { save, persist } from './meta.js';

const TITLES = { ped_business: 'Businessman', ped_jogger: 'Jogger', ped_tourist: 'Tourist', ped_granny: 'Granny', ped_student: 'Student',
  ped_chef: 'Chef', ped_worker: 'Construction worker', ped_kid: 'Kid with balloon',
  car_b: 'Estate car', car_c: 'Sports coupé', icecream_van: 'Ice-cream van', hotdog_cart: 'Hot-dog cart', gas_can: 'Gas can',
  toxic_barrel: 'Toxic barrel', spiky: 'Spiky sculpture', police_car: 'Police car', cement_truck: 'Cement truck', heli: 'Police helicopter' };
export const title = (n) => TITLES[n] || n.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const BOOK_KINDS = new Set(['prop', 'poison', 'unit', 'hazard']);

export function bookEntries(assets) {
  return Object.values(assets).filter((a) => BOOK_KINDS.has(a.meta.kind))
    .sort((a, b) => (a.meta.rare ? 1 : 0) - (b.meta.rare ? 1 : 0) || a.meta.tier - b.meta.tier);
}

/** Record a swallow. Returns true the first time this type is eaten. */
export function record(name) {
  save.book ??= {};
  const first = !save.book[name];
  save.book[name] = (save.book[name] || 0) + 1;
  if (first) persist();
  return first;
}

// ---------- thumbnails: rendered once, up front, with a tiny offscreen WebGPU renderer ----------
let thumbR, thumbScene, thumbCam;
const thumbs = new Map();

/** Cached thumbnail data URL ('' until warmThumbs has rendered it). */
export function thumb(asset) {
  return thumbs.get(asset.name) || '';
}

/**
 * Render collection-book thumbnails lazily: `first` names up front, then the rest, one per ~80 ms, pausing while
 * `busy()` (a run is being played) so it never competes with gameplay.
 */
export async function warmThumbs(assets, first = [], busy = () => false) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!thumbR) {
    const canvas = document.createElement('canvas');
    thumbR = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: location.search.includes('webgl') });
    await thumbR.init();
    thumbR.setSize(160, 160, false);
    thumbR.toneMapping = THREE.AgXToneMapping;
    thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.HemisphereLight(0xfff4e0, 0x9a7a5b, 2.2));
    const sun = new THREE.DirectionalLight(0xffe2b8, 3.2);
    sun.position.set(-3, 5, 4);
    thumbScene.add(sun);
    thumbCam = new THREE.PerspectiveCamera(30, 1, 0.05, 500);
  }
  const order = [...first.map((n) => assets[n]).filter(Boolean), ...bookEntries(assets)];
  for (const asset of order) {
    if (thumbs.has(asset.name)) continue;
    while (busy()) await wait(500);
    await wait(80);
    const obj = asset.scene.clone();
    thumbScene.add(obj);
    const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), d = box.getSize(new THREE.Vector3()).length();
    thumbCam.position.set(c.x + d * 1.1, c.y + d * 0.8, c.z + d * 1.4);
    thumbCam.lookAt(c);
    thumbR.render(thumbScene, thumbCam);
    thumbs.set(asset.name, thumbR.domElement.toDataURL('image/png'));
    thumbScene.remove(obj);
  }
}

export function renderBook(el, assets) {
  const entries = bookEntries(assets);
  const found = entries.filter((a) => save.book?.[a.name]).length;
  el.replaceChildren();
  const head = document.createElement('p');
  head.className = 'book-head';
  head.innerHTML = `<b>${found}</b> / ${entries.length} discovered`;
  el.append(head);
  const grid = document.createElement('div');
  grid.className = 'book-grid';
  for (const a of entries) {
    const n = save.book?.[a.name] || 0;
    const card = document.createElement('div');
    card.className = `book-card${n ? '' : ' locked'}${a.meta.rare ? ' rare' : ''}`;
    card.innerHTML = `<img alt="" src="${thumb(a)}"><b>${n ? title(a.name) : a.meta.rare ? 'Rare ???' : '???'}</b><small>${n ? `×${n}` : `${a.meta.tier.toFixed(1)} m`}</small>`;
    grid.append(card);
  }
  el.append(grid);
}
