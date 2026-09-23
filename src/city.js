// Seeded Toybox Town: tile grid, buildings, street furniture, pedestrians, traffic.
// Static things are instanced per (asset, chunk) so off-screen chunks are culled;
// movers are instanced per asset; animated landmarks are cloned with a mixer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toyMaterial } from './assets.js';

export const TILE = 40;
const CHUNK = 40;
const LOD_DIST = 45; // metres from camera to chunk edge beyond which LOD1 is drawn
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(), _qt = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const WALK_DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // travel direction per side of a walk loop (v > 0)

export function rng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.range = (lo, hi) => lo + r() * (hi - lo);
  return r;
}

/** Bake a glTF scene (with quantized attributes + child nodes) into one float geometry. */
const flatCache = new Map();
export function flatGeometry(asset, lod = false) {
  const key = asset.name + (lod ? '|lod' : '');
  if (flatCache.has(key)) return flatCache.get(key);
  const src = lod ? asset.lod : asset.scene;
  src.updateMatrixWorld(true);
  const parts = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const g = new THREE.BufferGeometry();
    for (const n of ['position', 'normal', 'uv']) {
      const a = o.geometry.attributes[n];
      const arr = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) {
        arr[i * a.itemSize] = a.getX(i);
        arr[i * a.itemSize + 1] = a.getY(i);
        if (a.itemSize > 2) arr[i * a.itemSize + 2] = a.getZ(i);
      }
      g.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize));
    }
    g.setIndex(Array.from(o.geometry.index.array));
    g.applyMatrix4(o.matrixWorld);
    parts.push(g);
  });
  const geo = mergeGeometries(parts);
  geo.computeBoundingSphere();
  flatCache.set(key, geo);
  return geo;
}

/** Tiles get a material that discards fragments inside the hole (the ground "opens"). */
export function groundMaterial(holeUniform) {
  const mat = toyMaterial.clone();
  mat.onBeforeCompile = (s) => {
    s.uniforms.uHole = holeUniform;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vWorldP = (modelMatrix * wp).xyz;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nuniform vec3 uHole;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (distance(vWorldP.xz, uHole.xy) < uHole.z) discard;`);
  };
  return mat;
}

const SIDEWALK = ['lamp', 'tree_small', 'bench', 'hydrant', 'trashcan', 'mailbox', 'newsbox', 'vending', 'phone_booth',
  'planter', 'flower_pot', 'bicycle', 'scooter', 'cone', 'tree_small', 'bench'];
const PARK = ['tree_small', 'tree_big', 'bench', 'picnic_table', 'flower_pot', 'dog', 'planter', 'hotdog_cart', 'tree_small'];
const TRAFFIC = ['car', 'car_b', 'taxi', 'car', 'car_b', 'icecream_van', 'bus'];
const PEDS = ['peg_a', 'peg_b', 'peg_c'];
const CLONED = new Set(['fountain', 'clock_tower']);

export class City {
  constructor(assets, seed, holeUniform, N = 6) {
    this.assets = assets;
    this.N = N;
    this.half = (N * TILE) / 2;
    this.group = new THREE.Group();
    this.entities = [];
    this.mixers = [];
    this.dirty = new Set();
    this.groundMat = groundMaterial(holeUniform);
    this.r = rng(seed);
    this.layout();
    this.build();
  }

  // ---------- layout: a list of placements, no three.js objects yet ----------
  add(name, x, z, rot = 0, mover = null) {
    const a = this.assets[name];
    if (mover) mover.t ??= 0;
    this.entities.push({ name, meta: a.meta, x, z, y: 0, rot, tilt: 0, tiltDir: 0, s: 1, alive: true, falling: false, vy: 0, mover });
  }

  layout() {
    const { r, N } = this;
    this.tiles = [];
    const plazaAt = [Math.floor((N - 1) / 2), Math.floor((N - 1) / 2)];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const cx = (i - (N - 1) / 2) * TILE, cz = (j - (N - 1) / 2) * TILE;
        const ring = Math.max(Math.abs(i - (N - 1) / 2), Math.abs(j - (N - 1) / 2));
        let type = 'lot';
        if (i === plazaAt[0] && j === plazaAt[1]) type = 'plaza';
        else if (ring > 1 && r() < 0.22) type = 'park';
        else if (ring > 1 && r() < 0.08) type = 'plaza';
        this.tiles.push({ type, cx, cz, ring });
      }
    }
    for (const t of this.tiles) {
      this.tile(t);
      this.sidewalk(t);
    }
    this.traffic();
  }

  tile(t) {
    const { r } = this;
    const { cx, cz, ring } = t;
    this.tileEntities ??= [];
    this.tileEntities.push({ name: 'tile_' + t.type, x: cx, z: cz, rot: Math.floor(r() * 4) * Math.PI / 2 });
    if (t.type === 'lot') {
      const big = ring < 1 ? ['skyscraper', 'hotel', 'office'] : ring < 2 ? ['apartment', 'office', 'apartment', 'hotel'] : ['apartment'];
      const small = ring < 2 ? ['shop', 'cafe', 'clock_tower', 'shop'] : ['house', 'house', 'shop', 'cafe'];
      if (ring < 1 || (ring < 2 && r() < 0.6) || r() < 0.15) {
        this.add(r.pick(big), cx, cz, Math.floor(r() * 4) * Math.PI / 2);
      } else {
        let tower = false;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          let n = r.pick(small);
          if (n === 'clock_tower') { if (tower) n = 'shop'; tower = true; }
          // Front (+x) faces the nearer street on x.
          this.add(n, cx + sx * 6, cz + sz * 6, sx > 0 ? 0 : Math.PI);
        }
      }
      if (r() < 0.35) this.add('gas_can', cx + r.range(-10, 10), cz + 11.5, 0);
    } else if (t.type === 'park') {
      for (let k = 0; k < 16; k++) {
        const x = cx + r.range(-12, 12), z = cz + r.range(-12, 12);
        if (Math.abs(x - cx) < 2 || Math.abs(z - cz) < 2) continue; // keep paths clear
        this.add(r.pick(PARK), x, z, r() * Math.PI * 2);
      }
      for (let k = 0; k < 6; k++) this.add('pigeon', cx + r.range(-10, 10), cz + r.range(-10, 10), r() * 6.28, { type: 'peck', t: r() * 10 });
      for (let k = 0; k < 5; k++) this.walker(cx, cz, 9);
    } else {
      this.add('fountain', cx, cz, 0);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        this.add('bench', cx + Math.cos(a) * 6, cz + Math.sin(a) * 6, -a);
      }
      this.add('kiosk', cx + 10, cz - 10, Math.PI / 2);
      this.add('hotdog_cart', cx - 10, cz + 9, r() * 6.28);
      if (ring > 0) this.add('spiky', cx - 9, cz - 9, 0);
      for (let k = 0; k < 14; k++) {
        const a = r() * 6.28, d = r.range(3.5, 11);
        this.add('pigeon', cx + Math.cos(a) * d, cz + Math.sin(a) * d, r() * 6.28, { type: 'peck', t: r() * 10 });
      }
      for (let k = 0; k < 8; k++) this.walker(cx, cz, 11);
    }
  }

  /** Street furniture along the sidewalk ring + pedestrians + parked cars. */
  sidewalk(t) {
    const { r } = this;
    const { cx, cz } = t;
    for (let side = 0; side < 4; side++) {
      const yaw = side * Math.PI / 2; // side 0 = +x edge
      const ox = Math.cos(yaw), oz = -Math.sin(yaw); // outward normal
      const tx = -oz, tz = ox; // along the edge
      for (let d = -12; d <= 12; d += 3) {
        const x = cx + ox * 14.2 + tx * d, z = cz + oz * 14.2 + tz * d;
        if (Math.abs(d) === 12) this.add('lamp', x, z, yaw);
        else if (r() < 0.55) this.add(r.pick(SIDEWALK), x, z, yaw + (r() < 0.5 ? 0 : Math.PI));
        if (r() < 0.04) this.add('toxic_barrel', x - ox * 1.2, z - oz * 1.2, 0);
      }
      for (let d = -10; d <= 10; d += 7) {
        if (r() < 0.4) this.add(r.pick(['car', 'car_b', 'taxi']), cx + ox * 16 + tx * d, cz + oz * 16 + tz * d, yaw + Math.PI / 2);
      }
    }
    for (let k = 0; k < 4; k++) this.walker(cx, cz, 13.2);
  }

  walker(cx, cz, h) {
    const { r } = this;
    this.add(r.pick(PEDS), cx, cz, 0, { type: 'walk', cx, cz, h, s: r() * 8 * h, v: r.range(0.9, 1.6) * (r() < 0.5 ? 1 : -1), t: r() * 10 });
  }

  traffic() {
    const { r, N } = this;
    for (let k = 0; k <= N; k++) {
      const line = (k - N / 2) * TILE;
      for (const axis of ['x', 'z']) {
        for (const dir of [1, -1]) {
          const n = 1 + Math.floor(r() * 2);
          for (let c = 0; c < n; c++) {
            const lane = line + dir * 2.2;
            const along = r.range(-this.half, this.half);
            const x = axis === 'x' ? along : lane, z = axis === 'x' ? lane : along;
            this.add(r.pick(TRAFFIC), x, z, 0, { type: 'drive', axis, dir: axis === 'x' ? dir : -dir, v: r.range(5, 8) });
          }
        }
      }
    }
  }

  // ---------- build three.js objects ----------
  build() {
    const groups = new Map();
    const chunkKey = (x, z) => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    for (const t of this.tileEntities) {
      const k = `${t.name}|${chunkKey(t.x, t.z)}`;
      if (!groups.has(k)) groups.set(k, { name: t.name, list: [], ground: true });
      groups.get(k).list.push({ ...t, y: 0, tilt: 0, s: 1 });
    }
    for (const e of this.entities) {
      if (CLONED.has(e.name)) {
        const a = this.assets[e.name];
        e.obj = a.scene.clone();
        this.group.add(e.obj);
        if (a.clips.length) {
          const m = new THREE.AnimationMixer(e.obj);
          a.clips.forEach((c) => m.clipAction(c).play());
          this.mixers.push(m);
        }
        this.place(e);
        continue;
      }
      const roams = e.mover?.type === 'drive';
      const home = e.mover?.type === 'walk' ? chunkKey(e.mover.cx, e.mover.cz) : chunkKey(e.x, e.z);
      const k = roams ? `${e.name}|roam` : `${e.name}|${home}|${e.mover ? 'm' : 's'}`;
      if (!groups.has(k)) groups.set(k, { name: e.name, list: [], mover: !!e.mover, roams });
      groups.get(k).list.push(e);
    }
    this.meshes = [];
    for (const g of groups.values()) {
      const a = this.assets[g.name];
      const full = flatGeometry(a), lod = flatGeometry(a, true);
      const mesh = new THREE.InstancedMesh(full, g.ground ? this.groundMat : toyMaterial, g.list.length);
      mesh.castShadow = !g.ground;
      mesh.receiveShadow = true;
      mesh.userData = { full, lod, tier: g.ground ? Infinity : a.meta.tier, ground: !!g.ground, roams: g.roams };
      g.list.forEach((e, i) => { e.mesh = mesh; e.index = i; this.place(e); });
      mesh.instanceMatrix.setUsage(g.mover ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
      if (g.roams) mesh.frustumCulled = false;
      else {
        mesh.computeBoundingSphere();
        if (g.mover) mesh.boundingSphere.radius += 16; // walkers loop around their tile
      }
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.dirty.clear();
  }

  /** Per-frame render budget: LOD by distance, drop shadows and hide what is too small to see. */
  budget(camera, holeR) {
    for (const m of this.meshes) {
      const u = m.userData;
      if (u.ground) { m.geometry = u.full; continue; }
      m.visible = u.tier >= holeR * 0.03;
      m.castShadow = u.tier >= holeR * 0.12;
      const far = u.roams ? holeR > 2.5 : camera.position.distanceTo(m.boundingSphere.center) - m.boundingSphere.radius > LOD_DIST;
      m.geometry = far ? u.lod : u.full;
    }
  }

  dispose() {
    for (const m of this.meshes) m.dispose();
    for (const mx of this.mixers) mx.stopAllAction();
    this.groundMat.dispose();
  }

  /** Write an entity's transform to its instance slot or cloned object. */
  place(e) {
    _q.setFromAxisAngle(UP, e.rot);
    if (e.tilt) {
      // tip the top toward the hole center: axis = up x (direction to hole)
      _ax.set(-Math.sin(e.tiltDir), 0, Math.cos(e.tiltDir));
      _q.premultiply(_qt.setFromAxisAngle(_ax, e.tilt));
    }
    _p.set(e.x, e.y, e.z);
    _s.setScalar(e.s);
    if (e.obj) {
      e.obj.position.copy(_p);
      e.obj.quaternion.copy(_q);
      e.obj.scale.copy(_s);
      return;
    }
    e.mesh.setMatrixAt(e.index, _m.compose(_p, _q, _s));
    this.dirty.add(e.mesh);
  }

  /** Movers + falling + swallow checks. Returns list of entities consumed this frame. */
  update(dt, hole) {
    const eaten = [];
    const H = this.half;
    for (const e of this.entities) {
      if (!e.alive) continue;
      const m = e.mover;
      if (e.falling) {
        this.fall(e, dt, hole, eaten);
        continue;
      }
      if (m) {
        m.t += dt;
        if (m.type === 'walk') {
          m.s = (m.s + m.v * dt + 8 * m.h * 100) % (8 * m.h);
          const side = Math.floor(m.s / (2 * m.h)), u = (m.s % (2 * m.h)) - m.h;
          const P = [[m.h, u], [-u, m.h], [-m.h, -u], [u, -m.h]][side];
          e.x = m.cx + P[0];
          e.z = m.cz + P[1];
          const [dx, dz] = WALK_DIR[side], sg = Math.sign(m.v);
          e.rot = Math.atan2(-dz * sg, dx * sg);
          const w = m.t * 9 * Math.abs(m.v);
          e.y = Math.abs(Math.sin(w)) * 0.07; // the toy waddle-hop
          e.tilt = 0;
          e.rot += Math.sin(w) * 0.12;
        } else if (m.type === 'drive') {
          const d = m.v * m.dir * dt;
          if (m.axis === 'x') { e.x += d; if (e.x > H) e.x -= 2 * H; if (e.x < -H) e.x += 2 * H; e.rot = m.dir > 0 ? 0 : Math.PI; }
          else { e.z -= d; if (e.z > H) e.z -= 2 * H; if (e.z < -H) e.z += 2 * H; e.rot = m.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
          e.y = Math.abs(Math.sin(m.t * 7)) * 0.03;
        } else if (m.type === 'peck') {
          e.y = Math.max(0, Math.sin(m.t * 3)) * 0.02;
          e.s = 1;
          e.rot += Math.sin(m.t * 1.3) * 0.01;
        }
        this.place(e);
      }
      // swallow test: fits in the hole and mostly over it
      const dx = e.x - hole.x, dz = e.z - hole.z;
      const tier = e.meta.tier;
      if (tier < hole.r * 0.95 && dx * dx + dz * dz < (hole.r - tier * 0.5) ** 2) {
        e.falling = true;
        e.vy = 0;
        e.tiltDir = Math.atan2(dz, dx);
      }
    }
    for (const mesh of this.dirty) mesh.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
    return eaten;
  }

  fall(e, dt, hole, eaten) {
    const k = Math.min(1, dt * 2.5);
    e.x += (hole.x - e.x) * k;
    e.z += (hole.z - e.z) * k;
    e.vy += 30 * dt;
    e.y -= e.vy * dt;
    e.tilt = Math.min(1.2, e.tilt + dt * 3);
    this.place(e);
    if (e.y < -(e.meta.height + 1.5)) {
      e.alive = false;
      e.s = 0;
      this.place(e);
      eaten.push(e);
    }
  }
}
