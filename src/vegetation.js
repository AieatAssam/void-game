// Living vegetation: procedurally grown trees and bushes (bark tubes + leaf-cluster cards cut from scanned
// leaves), wind that bends trunks and flutters leaves, and thrashing when the hole passes underneath.
// Replaces the toy tree models' geometry while keeping their gameplay size (tier/height from the manifest).
import * as THREE from 'three/webgpu';
import {
  texture, uv, vec3, vec4, attribute, positionGeometry, positionLocal, positionWorld, normalViewGeometry, sin, cos,
  mix, smoothstep, max, dot, normalize, pow, length, time, uniform, mx_noise_float, cameraPosition, int, fract,
} from 'three/tsl';
import { pbrCol, pbrNrm, pbrRha, L, uvGrad } from './pbr.js';
import { world } from './surface.js';
import { sunDir, sunCol } from './look.js';

const base = import.meta.env.BASE_URL;
const loader = new THREE.TextureLoader();
const texCache = new Map();
function tex(name, srgb) {
  if (texCache.has(name)) return texCache.get(name);
  const t = loader.load(`${base}tex/${name}`);
  texCache.set(name, t);
  t.flipY = false;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- wind: one field shared by trees, bushes and grass ----------
export const wind = { dir: uniform(new THREE.Vector2(0.8, 0.6).normalize()), strength: uniform(1) };
/** Gusts travel across the world: a slow swell plus rolling noise. Returns a 0..~1.5 gust amount. */
export const gust = (wxz) => {
  const along = dot(wxz, wind.dir);
  const swell = sin(along.mul(0.08).sub(time.mul(1.3))).mul(0.5).add(0.5);
  const n = mx_noise_float(vec3(wxz.mul(0.04).sub(wind.dir.mul(time.mul(0.35))), time.mul(0.1))).mul(0.5).add(0.5);
  return swell.mul(0.6).add(n.mul(0.9)).mul(wind.strength);
};
/** Extra thrash near the player's hole (it pulls at everything around it). */
const holeRustle = (wxz) => {
  const h = world.hole;
  return smoothstep(h.z.add(5), h.z.add(0.5), length(wxz.sub(h.xy))).mul(h.z.greaterThan(0).select(1, 0));
};

// ---------- tiny seeded rng ----------
function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- geometry builders ----------
class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.wind = []; this.idx = []; this.groups = []; }
  get count() { return this.pos.length / 3; }
  vert(p, n, u, v, w) { this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.uv.push(u, v); this.wind.push(w[0], w[1], w[2]); return this.count - 1; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 3));
    g.setIndex(this.idx);
    for (const [start, count, mat] of this.groups) g.addGroup(start, count, mat);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** Tapered tube along points (with radii) using parallel-transport frames. flex[i] = wind bend weight. */
function tube(B, pts, radii, flex, sides, phase) {
  const rings = [];
  let normal = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const tan = (i < pts.length - 1 ? _t.subVectors(pts[i + 1], pts[i]) : _t.subVectors(pts[i], pts[i - 1])).normalize().clone();
    if (i === 0) { normal = Math.abs(tan.y) < 0.9 ? new THREE.Vector3().crossVectors(tan, _up).normalize() : new THREE.Vector3(1, 0, 0); }
    else { normal.sub(tan.clone().multiplyScalar(normal.dot(tan))).normalize(); }
    const binormal = new THREE.Vector3().crossVectors(tan, normal);
    rings.push({ tan, normal: normal.clone(), binormal, p: pts[i], r: radii[i] });
  }
  let along = 0;
  const first = B.count;
  for (let i = 0; i < rings.length; i++) {
    if (i) along += rings[i].p.distanceTo(rings[i - 1].p);
    const { normal: nn, binormal, p, r } = rings[i];
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      _n.copy(nn).multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
      _p.copy(p).addScaledVector(_n, r);
      B.vert(_p, _n, (s / sides) * Math.max(1, Math.round(r * 2 * Math.PI / 0.35)) * 0.5, along * 0.7, [flex[i], 0, phase]);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = first + i * (sides + 1) + s, b = a + sides + 1;
      B.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

/** A leaf-cluster card: quad centred at c, facing roughly `out`, tilted, using one of the 2x2 atlas cells. */
function card(B, c, out, size, cell, rng, crownC, flex, phase, occ = 1) {
  const n = out.clone().add(new THREE.Vector3(rng() - 0.5, rng() * 0.6, rng() - 0.5)).normalize();
  const tangent = new THREE.Vector3().crossVectors(Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : _up, n).normalize();
  const spin = rng() * Math.PI * 2;
  const t2 = tangent.clone().applyAxisAngle(n, spin);
  const b2 = new THREE.Vector3().crossVectors(n, t2);
  // canopy-shaped normals: mostly the direction from the crown centre, a little of the card's own
  const sn = c.clone().sub(crownC).normalize().multiplyScalar(0.75).add(n.clone().multiplyScalar(0.25)).normalize();
  const u0 = (cell % 2) * 0.5, v0 = Math.floor(cell / 2) * 0.5;
  const h = size / 2, first = B.count;
  for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    _p.copy(c).addScaledVector(t2, du * h).addScaledVector(b2, dv * h);
    // atlas v: row 0 at the top of the PNG (flipY off). Twig base (bottom of the cell) sits toward the branch.
    B.vert(_p, sn, u0 + (du + 1) * 0.25, v0 + (1 - (dv + 1) / 2) * 0.5, [flex, occ, phase]);
  }
  B.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
}

/**
 * Grow a tree. kind: 'broad' (rounded deciduous), 'fine' (birch-like, airy), 'pine' (conifer), 'bush'.
 * height/crownR in metres. detail 0..2 (LOD). Returns geometry with groups: 0 bark, 1 leaves.
 */
export function growTree(seed, kind, height, crownR, detail = 0) {
  const rng = rand(seed);
  const B = new Builder();
  const keep = [1, 0.45, 0.18][detail];
  const sides = [7, 5, 4][detail];
  const pine = kind === 'pine', bush = kind === 'bush';
  const trunkH = bush ? 0.05 : height * (pine ? 0.95 : kind === 'fine' ? 0.55 : 0.42);
  const trunkR = bush ? 0.03 : Math.max(0.07, height * (pine ? 0.028 : 0.032));
  const crownC = new THREE.Vector3(0, bush ? height * 0.5 : pine ? height * 0.45 : trunkH + (height - trunkH) * 0.5, 0);
  const crownV = bush ? height * 0.5 : pine ? height * 0.5 : (height - trunkH) * 0.55;
  const branchEnds = [];

  // ---- trunk with a little lean, root flare at the base
  if (!bush) {
    const pts = [], radii = [], flex = [];
    const lean = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).multiplyScalar(height * 0.05);
    const segs = 7;
    const top = pine ? height : trunkH + (height - trunkH) * 0.35;
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      pts.push(new THREE.Vector3(lean.x * f * f, top * f, lean.z * f * f));
      radii.push(trunkR * (1 - f * (pine ? 0.9 : 0.55)) * (1 + 0.9 * Math.exp(-f * 18)));
      flex.push((f * top / height) ** 2);
    }
    const start = B.idx.length;
    tube(B, pts, radii, flex, sides + 1, rng());
    // main branches
    const nb = pine ? Math.round(18 * keep + 4) : Math.round((kind === 'fine' ? 7 : 6) * Math.max(keep, 0.5));
    for (let k = 0; k < nb; k++) {
      const f = pine ? 0.15 + 0.8 * (k / nb) : 0.72 + rng() * 0.28;
      const y = (pine ? height : trunkH) * f + (pine ? 0 : (height - trunkH) * 0.2 * rng());
      const a = k * 2.399 + rng() * 0.6;
      const reach = pine ? crownR * (1 - f) * 1.1 + 0.15 : crownR * (0.55 + rng() * 0.35);
      const rise = pine ? -0.15 : 0.55 + rng() * 0.5;
      const dir = new THREE.Vector3(Math.cos(a), rise, Math.sin(a)).normalize();
      const p0 = new THREE.Vector3(lean.x * f * f, y, lean.z * f * f);
      const bp = [p0], br = [], bf = [];
      const n = 4;
      for (let i = 1; i <= n; i++) {
        const q = bp[i - 1].clone().addScaledVector(dir, reach / n);
        q.y += (pine ? -0.05 : 0.06 * (rng() - 0.3)) * reach;
        dir.add(new THREE.Vector3((rng() - 0.5) * 0.3, pine ? -0.06 : 0.05, (rng() - 0.5) * 0.3)).normalize();
        bp.push(q);
      }
      for (let i = 0; i <= n; i++) { br.push(trunkR * (pine ? 0.28 : 0.45) * (1 - i / (n + 1.5))); bf.push(Math.min(1, (bp[i].y / height) ** 2 + i * 0.08)); }
      if (keep > 0.3 || !pine) tube(B, bp, br, bf, Math.max(3, sides - 2), rng());
      branchEnds.push(...bp.slice(2));
    }
    // roots: below the ground, so the ground-cut shader only shows them inside a hole ("roots too wide")
    if (detail < 2) {
      const nr = detail ? 4 : 6;
      for (let k = 0; k < nr; k++) {
        const a = (k / nr) * Math.PI * 2 + rng() * 0.8;
        const reach = crownR * (0.75 + rng() * 0.45) * (pine ? 0.8 : 1);
        const rp = [], rr = [], rf = [];
        for (let i = 0; i <= 4; i++) {
          const f = i / 4;
          rp.push(new THREE.Vector3(Math.cos(a) * reach * f, 0.05 - (0.25 + reach * 0.3) * Math.sin(f * 2.2) - f * 0.15, Math.sin(a) * reach * f));
          rr.push(trunkR * 0.7 * (1 - f * 0.85));
          rf.push(0);
        }
        tube(B, rp, rr, rf, Math.max(3, sides - 3), rng());
      }
    }
    B.groups.push([start, B.idx.length - start, 0]);
  }

  // ---- foliage cards: clumpy lobes around branch tips (cumulus-like silhouette), dense on top
  const lstart = B.idx.length;
  const target = Math.round((pine ? 460 : bush ? 70 : kind === 'fine' ? 240 : 330) * keep * (bush ? Math.max(1, height * 1.4) : Math.max(0.7, crownR / 1.8)));
  const cardSize = (pine ? 1.05 : bush ? 0.62 : 1.15) * Math.max(0.75, crownR / 1.8) * (detail ? 1 + detail * 0.4 : 1) * (bush ? Math.max(0.85, height) : 1);
  const lobes = [];
  if (!pine) {
    if (bush) for (let k = 0; k < 5; k++) { const a = k * 2.4 + rng(); lobes.push(new THREE.Vector3(Math.cos(a) * crownR * 0.45, height * (0.35 + rng() * 0.3), Math.sin(a) * crownR * 0.45)); }
    else {
      const tips = branchEnds.filter((_, i) => i % 3 === 2);
      for (const t of tips) lobes.push(t.clone().lerp(crownC, 0.25));
      lobes.push(crownC.clone().add(new THREE.Vector3(0, crownV * 0.55, 0)));
      lobes.push(crownC.clone().add(new THREE.Vector3((rng() - 0.5) * crownR * 0.4, crownV * 0.1, (rng() - 0.5) * crownR * 0.4)));
    }
  }
  const lobeR = bush ? crownR * 0.6 : crownR * 0.55;
  for (let k = 0; k < target; k++) {
    let c;
    if (pine) { // stacked drooping tiers
      const f = 0.08 + 0.9 * Math.sqrt(rng());
      const tier = Math.floor(f * 9) / 9 + rng() * 0.08;
      const y = height * (0.2 + 0.78 * (1 - tier));
      const rad = crownR * tier * (0.35 + 0.65 * Math.sqrt(rng()));
      const a = rng() * Math.PI * 2;
      c = new THREE.Vector3(Math.cos(a) * rad, y - rad * 0.25, Math.sin(a) * rad);
    } else {
      const L0 = lobes[Math.floor(rng() * lobes.length)];
      const u = rng() * 2 - 1, a = rng() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
      const shell = 0.45 + 0.55 * Math.cbrt(rng());
      c = L0.clone().add(new THREE.Vector3(Math.cos(a) * sq, u * 0.8, Math.sin(a) * sq).multiplyScalar(lobeR * shell));
      if (bush) c.y = Math.max(c.y, cardSize * 0.3);
    }
    // occlusion: cards deep inside / low in the crown get less sky
    const rel = c.clone().sub(crownC);
    const depth = Math.min(1, rel.length() / Math.max(crownR, 0.1));
    const occ = Math.min(1, 0.35 + 0.45 * depth + 0.3 * Math.max(0, rel.y / Math.max(crownV, 0.1)));
    const out = rel.clone().setY(rel.y * 0.5).normalize();
    const flex = bush ? 0.3 + c.y / height * 0.5 : Math.min(1, (c.y / height) ** 2 + 0.15);
    card(B, c, out, cardSize * (0.75 + rng() * 0.5), Math.floor(rng() * 4), rng, crownC, flex, rng(), occ);
  }
  B.groups.push([lstart, B.idx.length - lstart, 1]);
  return B.build();
}

// ---------- materials ----------
function barkMaterial() {
  const barkMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const bu = uv().mul(vec3(1, 0.8, 0).xy);
  const col = texture(pbrCol, bu).depth(int(L.bark));
  const nm = texture(pbrNrm, bu).depth(int(L.bark)).xyz.mul(2).sub(1);
  const rha = texture(pbrRha, bu).depth(int(L.bark));
  barkMat.colorNode = col.rgb.mul(vec3(0.85, 0.8, 0.75)).mul(rha.z.mul(0.5).add(0.5));
  barkMat.roughnessNode = rha.x.mul(0.3).add(0.65);
  barkMat.normalNode = normalize(normalViewGeometry.sub(uvGrad(nm, bu, 1.5)));
  return barkMat;
}

function leafMaterial(file, tint) {
  const col = tex(`${file}_col.png`, true);
  const nrmT = tex(`${file}_nrm.jpg`, false);
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.45, roughness: 0.92 });
  const c = texture(col, uv());
  const w = attribute('aWind', 'vec3');
  // per-card hue/brightness variation + sun-bleached outer leaves
  const v = fract(w.z.mul(91.7));
  const tinted = c.rgb.mul(tint).mul(mix(0.78, 1.12, v)).mul(mix(vec3(1), vec3(1.08, 1.04, 0.8), v.mul(v))).mul(pow(w.y, 1.3));
  m.colorNode = vec4(tinted, c.a);
  m.opacityNode = c.a;
  const nm = texture(nrmT, uv()).xyz.mul(2).sub(1);
  m.normalNode = normalize(normalViewGeometry.sub(uvGrad(nm, uv(), 0.25)));
  // thin-leaf translucency: sunlight glowing through when looking toward the sun
  const vdir = normalize(positionWorld.sub(cameraPosition));
  const through = pow(max(dot(vdir, sunDir), 0), 3).mul(0.35).add(0.05);
  m.emissiveNode = tinted.mul(sunCol).mul(through).mul(0.35);
  return m;
}

/** Wind for tree-like meshes: trunk bend grows with height^2, leaves flutter, the hole makes them thrash. */
function applyWind(mat, height) {
  const w = attribute('aWind', 'vec3'); // x flex, y leaf, z phase
  mat.positionNode = (() => {
    const p = positionLocal; // instanced (world-ish) position
    const wxz = p.xz;
    const g = gust(wxz);
    const thrash = holeRustle(wxz);
    const bend = w.x.mul(g.mul(0.12).add(thrash.mul(0.35))).mul(height);
    const sway = sin(time.mul(1.7).add(w.z.mul(6.28)).add(wxz.x.mul(0.3))).mul(0.25).add(0.75);
    const dir = vec3(wind.dir.x, 0, wind.dir.y);
    const flutterPh = time.mul(mix(7, 18, thrash)).add(w.z.mul(40)).add(positionGeometry.y.mul(3));
    const flutter = vec3(sin(flutterPh), cos(flutterPh.mul(1.3)), sin(flutterPh.mul(0.7))).mul(w.y.greaterThan(0).select(1, 0).mul(g.mul(0.03).add(0.01).add(thrash.mul(0.08))));
    const shake = vec3(sin(time.mul(23).add(w.z.mul(9))), 0, cos(time.mul(19))).mul(thrash.mul(w.x).mul(0.06).mul(height));
    return p.add(dir.mul(bend.mul(sway))).add(flutter).add(shake).sub(vec3(0, bend.mul(bend).mul(0.08), 0));
  })();
}

const LEAVES = {
  broad: ['leaves_broad', vec3(0.92, 1.0, 0.85)],
  fine: ['leaves_fine', vec3(1.0, 1.0, 0.9)],
  bush: ['leaves_bush', vec3(0.88, 0.97, 0.82)],
  pine: ['leaves_fine', vec3(0.45, 0.62, 0.5)],
};

const matCache = new Map();
/** [bark, leaves] pair for a tree kind at a given nominal height (wind amplitude scales with size). */
export function treeMaterials(kind, height) {
  const key = kind + '|' + Math.round(height);
  if (!matCache.has(key)) {
    const b = barkMaterial(), l = leafMaterial(...LEAVES[kind]);
    applyWind(b, height);
    applyWind(l, height);
    matCache.set(key, [b, l]);
  }
  return matCache.get(key);
}

// Which procedural species replaces each toy model (and scenery-only additions).
export const SPECIES = {
  tree_small: { kind: 'fine', variants: 3 },
  tree_big: { kind: 'broad', variants: 3 },
  tree_pine: { kind: 'pine', variants: 3, meta: { tier: 2.2, mass: 60, kind: 'scenery', height: 11 } },
  bush: { kind: 'bush', variants: 3, meta: { tier: 0.62, mass: 0.3, kind: 'prop', height: 1.05 } },
};

/**
 * Swap procedural geometry into the asset table: asset.flatVariants[variant][lod] geometries, a [bark, leaves]
 * material pair and a preview scene for thumbnails. Adds tree_pine (scenery) and bush (edible prop).
 */
export function installVegetation(assets) {
  for (const [name, sp] of Object.entries(SPECIES)) {
    let a = assets[name];
    if (!a) {
      a = assets[name] = { name, clips: [], meta: { ...sp.meta, tris: 0 }, flags: new THREE.Vector4(0, 0, sp.meta.kind === 'prop' ? sp.meta.tier : 0, 0) };
    }
    const h = a.meta.height;
    const crownR = sp.kind === 'pine' ? a.meta.tier * 1.0 : sp.kind === 'bush' ? a.meta.tier * 1.05 : a.meta.tier * 1.25;
    a.material = treeMaterials(sp.kind, h);
    a.flatVariants = [];
    for (let v = 0; v < sp.variants; v++) {
      const seed = (name.length * 7919 + v * 104729) >>> 0;
      a.flatVariants.push([0, 1, 2].map((lod) => growTree(seed, sp.kind, h * (0.92 + v * 0.06), crownR * (0.95 + v * 0.07), lod)));
    }
    const mk = (lod) => {
      const m = new THREE.Mesh(a.flatVariants[0][lod], a.material);
      m.castShadow = m.receiveShadow = true;
      return new THREE.Group().add(m);
    };
    a.scene = mk(0);
    a.lod = mk(1);
    a.lod2 = mk(2);
    a.meta.tris = a.flatVariants[0][0].index.count / 3;
  }
}

