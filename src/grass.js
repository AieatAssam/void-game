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
import { gust, wind } from './vegetation.js';

const PATCH = 12; // metres per patch
const MASK_RES = 2048;

/** A tapered blade: 4 levels, y 0..1 along the blade, x -0.5..0.5 across. */
function bladeGeometry() {
  const pos = [], uvs = [], idx = [];
  const levels = 3;
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

export class Grass {
  /**
   * renderer: used once for the mask pass. groundMeshes: meshes to rasterise, each with userData.grassMask
   * (a NodeMaterial writing vec4(density, height, wild, 1)). extent: half-size of the masked square (m).
   */
  constructor(renderer, groundMeshes, extent, holeField, { density = 1, far: withFar = true } = {}) {
    this.extent = extent;
    this.group = new THREE.Group();
    if (density > 0) { // no blades: no mask target, no mask pass
      this.mask = new THREE.RenderTarget(MASK_RES, MASK_RES, { type: THREE.HalfFloatType, depthBuffer: true });
      this.mask.texture.minFilter = this.mask.texture.magFilter = THREE.LinearFilter;
      this.renderMask(renderer, groundMeshes);
    }
    this.origin = uniform(new THREE.Vector2());
    this.fadeCentre = uniform(new THREE.Vector2());
    this.fadeFar = uniform(40);
    this.zoomFade = uniform(1);
    const holes = uniformArray(holeField.value, 'vec3');
    // near ring: 5x5 patches, dense; far ring: 11x11 minus the middle, sparse and wider
    const near = [], far = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) near.push(new THREE.Vector2(i, j));
    for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) if (Math.abs(i) > 2 || Math.abs(j) > 2) far.push(new THREE.Vector2(i, j));
    this.layers = density <= 0 ? [] : [this.layer(near, Math.round(PATCH * PATCH * 85 * density), 1, holes)];
    if (density > 0 && withFar) this.layers.push(this.layer(far, Math.round(PATCH * PATCH * 16 * density), 2.3, holes));
  }

  renderMask(renderer, meshes) {
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
    renderer.setRenderTarget(this.mask);
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

  layer(offsets, perPatch, widthScale, holes) {
    const side = Math.ceil(Math.sqrt(perPatch));
    const spacing = PATCH / side;
    const offs = uniformArray(offsets, 'vec2');
    const mat = new THREE.MeshPhysicalNodeMaterial({ side: THREE.DoubleSide, roughness: 0.9, specularIntensity: 0.12 });
    const e = this.extent;
    const maskTex = this.mask.texture;
    const origin = this.origin, fadeCentre = this.fadeCentre, fadeFar = this.fadeFar, zoomFade = this.zoomFade;

    // ---- per-blade values (vertex stage)
    const id = float(instanceIndex);
    // interleaved: consecutive instances cycle through the patches, so lowering mesh.count thins every patch evenly
    const np = int(offsets.length);
    const patch = int(instanceIndex).mod(np);
    const j = int(instanceIndex).div(np);
    const gx = float(j.mod(int(side))), gz = float(j.div(int(side)));
    const h1 = hash(id.mul(8).add(1)), h2 = hash(id.mul(8).add(2)), h3 = hash(id.mul(8).add(3));
    const h4 = hash(id.mul(8).add(4)), h5 = hash(id.mul(8).add(5));
    const cell = offs.element(patch).mul(PATCH).add(origin);
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
    for (let i = 0; i < 4; i++) {
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
    mat.colorNode = Fn(() => {
      for (let i = 0; i < 4; i++) { // never draw grass over an open hole
        const q = holes.element(i);
        If(q.z.greaterThan(0).and(length(positionWorld.xz.sub(q.xy)).lessThan(q.z)), () => { Discard(); });
      }
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

    const mesh = new THREE.InstancedMesh(bladeGeometry(), mat, offsets.length * side * side);
    mesh.userData.full = mesh.count;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Follow the camera target; patches snap to the patch grid so blades never swim. Zoomed-out = fewer blades. */
  update(target, camDist, lowSpec) {
    this.origin.value.set(Math.floor(target.x / PATCH) * PATCH, Math.floor(target.z / PATCH) * PATCH);
    this.fadeCentre.value.set(target.x, target.z);
    this.fadeFar.value = Math.min(66, 26 + camDist * 0.55);
    // blades are sub-pixel once the camera pulls far back: shrink them away and let the ground texture take over
    this.zoomFade.value = 1 - THREE.MathUtils.smoothstep(camDist, 42, 75);
    // the far ring (beyond +-30 m) only matters once blades are drawn that far out
    if (this.layers[1]) this.layers[1].visible = !lowSpec && camDist < 60 && this.fadeFar.value > 34;
    for (const l of this.layers) l.count = Math.round(l.userData.full * (lowSpec ? 0.5 : 1)); // slow GPUs: half the blades
    this.group.visible = this.zoomFade.value > 0.01;
  }

  dispose() {
    this.mask?.dispose();
    for (const l of this.layers) { l.geometry.dispose(); l.material.dispose(); }
  }
}

