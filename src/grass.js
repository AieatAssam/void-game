// GPU grass: lawns and meadows get real blades that bend in travelling gusts and lean into the hole.
// A one-off top-down "mask" pass records where grass grows (R), the ground height (G) and how wild it is
// (B: 0 mown lawn, 1 meadow). Blades are procedural: position, height, facing and tint all come from hashes
// of instanceIndex inside camera-snapped patches, so there are no per-blade buffers at all.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, uniformArray, texture, vec2, vec3, vec4, float, int, instanceIndex, positionGeometry, hash, sin, cos, mix,
  smoothstep, max, length, normalize, pow, cameraViewMatrix, varying, positionWorld, Discard, If, uv, time,
} from 'three/tsl';
import { world } from './surface.js';
import { MAX_HOLES } from './hole.js';
import { gust, wind } from './vegetation.js';

const PATCH = 12; // metres per patch
const MASK_RES = 2048;
const COVER_RES = 512; // CPU copy of the mask (about 1 m per texel): which patches have any grass at all

/**
 * A tapered blade, y 0..1 along it, x -0.5..0.5 across. levels 3 = 5 triangles (near ring: the bend reads);
 * levels 1 = a single triangle (far ring, beyond ~24 m, where a blade is a few pixels wide: same silhouette, 1/5 the work).
 */
function bladeGeometry(levels = 3) {
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i < levels; i++) {
    const y = i / levels;
    pos.push(-0.5, y, 0, 0.5, y, 0);
    uvs.push(0, y, 1, y);
  }
  pos.push(0, 1, 0);
  uvs.push(0.5, 1);
  for (let i = 0; i < levels - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  idx.push((levels - 1) * 2, (levels - 1) * 2 + 1, levels * 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

const _frustum = new THREE.Frustum(), _box = new THREE.Box3(), _m = new THREE.Matrix4();

export class Grass {
  /**
   * renderer: used once for the mask pass. groundMeshes: meshes to rasterise, each with userData.grassMask
   * (a NodeMaterial writing vec4(density, height, wild, 1)). extent: half-size of the masked square (m).
   */
  constructor(renderer, groundMeshes, extent, holeField, { density = 1, far: withFar = true, lawns = [] } = {}) {
    this.lawns = lawns; // tile centres that are mostly lawn (parks): used to tell which way up the readback came
    this.extent = extent;
    this.group = new THREE.Group();
    if (density > 0) { // no blades: no mask target, no mask pass
      this.mask = new THREE.RenderTarget(MASK_RES, MASK_RES, { type: THREE.HalfFloatType, depthBuffer: true });
      this.mask.texture.minFilter = this.mask.texture.magFilter = THREE.LinearFilter;
      this.renderMask(renderer, groundMeshes, this.mask);
      // Blades used to be spawned on every patch round the camera and scaled to nothing over roads, roofs and plazas
      // (in town most of them). A small readback tells which 12 m patches hold any grass, so only those get blades.
      const cover = new THREE.RenderTarget(COVER_RES, COVER_RES, { type: THREE.UnsignedByteType, depthBuffer: true });
      this.renderMask(renderer, groundMeshes, cover);
      renderer.readRenderTargetPixelsAsync(cover, 0, 0, COVER_RES, COVER_RES).then((px) => this.buildCoverage(px)).catch(() => {}).finally(() => cover.dispose());
    }
    this.origin = uniform(new THREE.Vector2());
    this.fadeCentre = uniform(new THREE.Vector2());
    this.fadeFar = uniform(40);
    this.zoomFade = uniform(1);
    const holes = uniformArray(holeField.value, 'vec3');
    // near ring: 60 m square in 4 m cells, dense (fine cells so lawn corners don't pay for the pavement round them);
    // far ring: 11x11 patches of 12 m minus the middle, sparse and wider
    const near = [], far = [];
    for (let i = -6; i <= 8; i++) for (let j = -6; j <= 8; j++) near.push(new THREE.Vector2(i, j));
    for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) if (Math.abs(i) > 2 || Math.abs(j) > 2) far.push(new THREE.Vector2(i, j));
    this.layers = density <= 0 ? [] : [this.layer(near, Math.round(4 * 4 * 85 * density), 1, holes, 4)];
    if (density > 0 && withFar) this.layers.push(this.layer(far, Math.round(PATCH * PATCH * 16 * density), 2.3, holes, PATCH, 1));
  }

  /**
   * CPU coverage map from the readback: one byte per texel (about 1 m), 1 where grass grows. The backends return rows
   * in opposite orders (GL bottom-up, WebGPU top-down); the known lawn tiles decide which way up it is.
   */
  buildCoverage(px) {
    const N = COVER_RES, grid = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) grid[i] = px[i * 4] > 8 ? 1 : 0;
    const per = N / (2 * this.extent);
    const at = (x, z, flip) => {
      const tx = Math.floor((x + this.extent) * per), tz = Math.floor((z + this.extent) * per);
      if (tx < 0 || tz < 0 || tx >= N || tz >= N) return 0;
      return grid[(flip ? N - 1 - tz : tz) * N + tx];
    };
    let a = 0, b = 0;
    for (const [x, z] of this.lawns) for (let k = 0; k < 9; k++) { a += at(x - 6 + (k % 3) * 6, z - 6 + Math.floor(k / 3) * 6, false); b += at(x - 6 + (k % 3) * 6, z - 6 + Math.floor(k / 3) * 6, true); }
    this.coverage = { grid, N, per, flip: b > a };
    this.lastOrigin = null; // re-pick cells next frame
  }

  /** Any grass in the square [x, x + size) x [z, z + size) (plus a 1 m margin for jitter and lean)? */
  hasGrass(x, z, size) {
    const c = this.coverage;
    if (!c) return true; // until the map arrives, draw everything (the old behaviour)
    const { grid, N, per, flip } = c;
    const x0 = Math.max(0, Math.floor((x - 1 + this.extent) * per)), x1 = Math.min(N - 1, Math.floor((x + size + 1 + this.extent) * per));
    const z0 = Math.max(0, Math.floor((z - 1 + this.extent) * per)), z1 = Math.min(N - 1, Math.floor((z + size + 1 + this.extent) * per));
    for (let tz = z0; tz <= z1; tz++) {
      const row = (flip ? N - 1 - tz : tz) * N;
      for (let tx = x0; tx <= x1; tx++) if (grid[row + tx]) return true;
    }
    return false;
  }

  renderMask(renderer, meshes, target) {
    const e = this.extent;
    const cam = new THREE.OrthographicCamera(-e, e, e, -e, -200, 400);
    cam.position.set(0, 300, 0);
    cam.up.set(0, 0, -1); // +z down the texture, so uv.y = (z + e) / 2e
    cam.lookAt(0, 0, 0);
    cam.layers.set(7);
    const scene = new THREE.Scene();
    const saved = [];
    for (const m of meshes) {
      saved.push([m, m.material, m.parent, m.layers.mask]);
      m.material = m.userData.grassMask;
      m.layers.set(7);
      scene.add(m); // (removed from its parent while we draw)
    }
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    for (const [m, mat, parent, layers] of saved) {
      m.material = mat;
      m.layers.mask = layers;
      parent ? parent.add(m) : scene.remove(m);
    }
  }

  layer(offsets, perPatch, widthScale, holes, cellSize, levels = 3) {
    const side = Math.ceil(Math.sqrt(perPatch));
    const spacing = cellSize / side;
    // the patches actually drawn this frame (the ones with grass) are packed at the front; active = how many
    const all = offsets.map((o) => o.clone());
    const offs = uniformArray(offsets.map((o) => o.clone()), 'vec2');
    const active = uniform(offsets.length);
    // standard BRDF (grass never needed clearcoat/sheen); physical cost more per blade fragment
    const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.9 });
    const e = this.extent;
    const maskTex = this.mask.texture;
    const origin = this.origin, fadeCentre = this.fadeCentre, fadeFar = this.fadeFar, zoomFade = this.zoomFade;

    // ---- per-blade values (vertex stage)
    const id = float(instanceIndex);
    // interleaved: consecutive instances cycle through the patches, so lowering mesh.count thins every patch evenly
    const np = int(active);
    const patch = int(instanceIndex).mod(np);
    const j = int(instanceIndex).div(np);
    const gx = float(j.mod(int(side))), gz = float(j.div(int(side)));
    const h1 = hash(id.mul(8).add(1)), h2 = hash(id.mul(8).add(2)), h3 = hash(id.mul(8).add(3));
    const h4 = hash(id.mul(8).add(4)), h5 = hash(id.mul(8).add(5));
    const cell = offs.element(patch).mul(cellSize).add(origin);
    const wxz = cell.add(vec2(gx.add(h1), gz.add(h2)).mul(spacing));
    const m = texture(maskTex, wxz.add(e).div(2 * e)).level(0);
    // clumps: blades bunch up and share height, so lawns don't look like carpet
    const clump = hash(wxz.mul(0.9).floor().add(4096).dot(vec2(1, 8192)));
    const wild = m.b;
    const fade = smoothstep(fadeFar, fadeFar.mul(0.72), length(wxz.sub(fadeCentre))).mul(zoomFade);
    const keep = h3.lessThan(m.r.mul(0.98));
    const bladeH = mix(mix(0.2, 0.32, clump), mix(0.4, 0.8, h4), wild).mul(h4.mul(0.5).add(0.75)).mul(fade).mul(keep.select(1, 0));
    const ang = h5.mul(6.2832);
    const facing = vec2(cos(ang), sin(ang));
    // wind + hole suction: bend grows with y^2 along the blade
    const g = gust(wxz);
    const hole = world.hole;
    const toHole = hole.xy.sub(wxz);
    const hd = length(toHole);
    const suck = smoothstep(hole.z.mul(2.2).add(2), hole.z, hd).mul(hole.z.greaterThan(0).select(1, 0)).mul(hole.w.mul(0.8).add(0.35));
    let inHole = float(0);
    for (let i = 0; i < MAX_HOLES; i++) {
      const q = holes.element(i);
      inHole = max(inHole, q.z.greaterThan(0).and(length(wxz.sub(q.xy)).lessThan(q.z.add(0.05))).select(1, 0));
    }
    const lean = vec2(wind.dir).mul(g.mul(0.55).add(0.12).add(sin(time.mul(2.3).add(h1.mul(6.3))).mul(0.05)))
      .add(normalize(toHole.add(1e-4)).mul(suck.mul(1.4)))
      .add(facing.mul(h2.sub(0.5).mul(0.5)));
    const y = positionGeometry.y;
    const bend = y.mul(y);
    const width = mix(0.05, 0.065, wild).mul(widthScale).mul(h1.mul(0.5).add(0.75));
    const across = vec2(facing.y.negate(), facing.x).mul(positionGeometry.x.mul(width).mul(float(1).sub(y.mul(0.85))));
    const off = lean.mul(bend).mul(bladeH);
    const topY = bladeH.mul(y).mul(float(1).sub(length(lean).mul(bend).mul(0.35)));
    const groundY = m.g.add(0.005);
    mat.positionNode = vec3(wxz.x.add(across.x).add(off.x), groundY.add(topY).sub(inHole.mul(20)), wxz.y.add(across.y).add(off.y));

    // ---- shading: base-to-tip gradient, dry tips on wild grass, soft normals that lean toward the sky
    const vTint = varying(vec4(mix(0.85, 1.12, clump), h4, wild, m.a), 'vGrassTint');
    const bladeN = vec3(facing.x, 0.0, facing.y);
    const nW = varying(normalize(mix(bladeN, vec3(0, 1, 0), mix(0.62, 0.78, wild)).add(vec3(lean.x, 0, lean.y).mul(0.3))), 'vGrassN');
    mat.normalNode = normalize(cameraViewMatrix.mul(vec4(nW, 0)).xyz);
    // (no fragment discard: blades rooted in a hole are already sunk 20 m in the vertex stage, and a discard would
    // switch off hidden-surface removal for every grass fragment on tile-based GPUs like Apple's)
    mat.colorNode = Fn(() => {
      const t = uv().y;
      const lawnBase = vec3(0.02, 0.05, 0.01), lawnTip = mix(vec3(0.11, 0.26, 0.03), vec3(0.2, 0.3, 0.06), pow(vTint.y, 3));
      // meadow blades follow the ground's moisture: lush in hollows, straw on dry crests
      const dry = vTint.w;
      const wildBase = mix(vec3(0.035, 0.075, 0.018), vec3(0.09, 0.085, 0.035), dry);
      const wildTip = mix(mix(vec3(0.12, 0.26, 0.04), vec3(0.3, 0.28, 0.1), dry), vec3(0.42, 0.37, 0.15), pow(vTint.y, 5));
      const base = mix(lawnBase, wildBase, vTint.z), tip = mix(lawnTip, wildTip, vTint.z);
      const c = mix(base, tip, pow(t, mix(0.8, 0.5, vTint.z))).mul(vTint.x);
      return vec4(c, 1);
    })();
    // thin blades glow a little when back-lit (cheap translucency)
    mat.emissiveNode = vec3(0.02, 0.035, 0.01).mul(uv().y);
    mat.aoNode = mix(0.35, 1, pow(uv().y, 0.7));

    const mesh = new THREE.InstancedMesh(bladeGeometry(levels), mat, offsets.length * side * side);
    mesh.userData = { full: mesh.count, perPatch: side * side, all, offs, active, cellSize };
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Follow the camera target; patches snap to the patch grid so blades never swim. Zoomed-out = fewer blades. */
  update(target, camDist, lowSpec, camera) {
    this.origin.value.set(Math.floor(target.x / PATCH) * PATCH, Math.floor(target.z / PATCH) * PATCH);
    this.fadeCentre.value.set(target.x, target.z);
    this.fadeFar.value = Math.min(66, 26 + camDist * 0.55);
    // blades are sub-pixel once the camera pulls far back: shrink them away and let the ground texture take over
    this.zoomFade.value = 1 - THREE.MathUtils.smoothstep(camDist, 42, 75);
    // the far ring (beyond +-30 m) only matters once blades are drawn that far out
    if (this.layers[1]) this.layers[1].visible = !lowSpec && camDist < 60 && this.fadeFar.value > 34;
    // only patches with grass get blades (the grass test re-runs when the patch grid moves or the coverage map arrives)
    const key = `${this.origin.value.x},${this.origin.value.y},${!!this.coverage}`;
    if (key !== this.lastOrigin) {
      this.lastOrigin = key;
      for (const l of this.layers) {
        const u = l.userData;
        u.grassy = u.all.filter((o) => this.hasGrass(this.origin.value.x + o.x * u.cellSize, this.origin.value.y + o.y * u.cellSize, u.cellSize));
      }
    }
    // ...and of those, only the ones in view and inside the fade radius (every frame: a few hundred box tests)
    if (camera) {
      camera.updateMatrixWorld();
      _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_m, camera.coordinateSystem);
    }
    const fx = this.fadeCentre.value.x, fz = this.fadeCentre.value.y, far2 = (this.fadeFar.value + 1) ** 2;
    for (const l of this.layers) {
      const u = l.userData, list = u.offs.array, cs = u.cellSize;
      let k = 0;
      for (const o of u.grassy) {
        const x = this.origin.value.x + o.x * cs, z = this.origin.value.y + o.y * cs;
        const dx = Math.max(x - fx, 0, fx - x - cs), dz = Math.max(z - fz, 0, fz - z - cs);
        if (dx * dx + dz * dz > far2) continue; // blades out here are faded to nothing
        if (camera) {
          _box.min.set(x - 1, -20, z - 1);
          _box.max.set(x + cs + 1, 40, z + cs + 1);
          if (!_frustum.intersectsBox(_box)) continue;
        }
        list[k++].copy(o);
      }
      u.activeN = k;
      u.active.value = Math.max(1, k);
    }
    for (const l of this.layers) { // slow GPUs: half the blades
      const u = l.userData;
      l.count = Math.round(u.activeN * u.perPatch * (lowSpec ? 0.5 : 1));
      if (!u.activeN) l.count = 0;
    }
    this.group.visible = this.zoomFade.value > 0.01;
  }

  dispose() {
    this.mask?.dispose();
    for (const l of this.layers) { l.geometry.dispose(); l.material.dispose(); }
  }
}

