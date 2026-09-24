// Materials for the palette-atlas world (ART.md "Surface detail"), written in TSL for the WebGPU renderer.
// Every palette swatch maps to a scanned PBR layer (src/pbr.js) with its own scale, how much of the scan's
// natural colour shows through (chroma) and relief strength. Props sample in object space so detail sticks
// to moving things; ground tiles sample in world space so no two blocks look the same.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, uniformArray, texture, uv, vec3, vec4, float, int, floor, clamp, mix, smoothstep, max, dot, pow,
  normalize, positionGeometry, normalGeometry, positionWorld, normalWorldGeometry, normalViewGeometry, positionView,
  positionLocal, attribute, instanceIndex, sin, cos, abs, sign, step, length, Discard, If, luminance, select, fract,
  time, oneMinus,
} from 'three/tsl';
import { triplanar, layerMean, waterGrad, macro, L } from './pbr.js';
import { Q } from './quality.js';
import { MAX_HOLES } from './hole.js';

export const surfaceTime = uniform(0); // legacy tick (kept for callers); shaders use it for hole pulses
export const surfaceOn = uniform(1); // 0 on low-spec devices (set by the fps watchdog)
export const glow = uniform(1.4); // emissive strength (time of day)
// Shared world state: player hole (x, z, r, vacuum), night amount, edible-glow colour.
export const world = { hole: uniform(new THREE.Vector4()), night: uniform(0), edCol: uniform(new THREE.Color(0xb58cff)) };
export const pedTime = uniform(0);

const base = import.meta.env.BASE_URL;
const loader = new THREE.TextureLoader();
function paletteTexture(file, srgb) {
  const t = loader.load(base + file);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false; // glTF UV convention
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const palTex = paletteTexture('palette.png', true);
const emitTex = paletteTexture('palette_emit.png', true);
const ormTex = paletteTexture('palette_orm.png', false);

// ---------- swatch -> layer tables: (layer, repeats per metre, chroma, relief strength). layer -1 = smooth; 16 = water
const W = 16;
const P = [L.plaster, 0.6, 0, 0.1]; // satin toy paint: a whisper of orange-peel
const NONE = [-1, 1, 0, 0];
const MET = [L.metal, 1.4, 0, 0.06];
const OBJECT = [
  P, P, P, P, P, P, [L.asphalt, 0.5, 0.3, 0.8], [L.asphalt, 0.5, 0.3, 0.8],
  P, P, P, P, P, P, P, P,
  P, P, P, P, [L.concrete, 0.45, 0.25, 0.9], [L.metal, 0.9, 0, 0.25], P, P,
  NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE,
  MET, MET, MET, NONE, NONE, [L.plaster, 1, 0, 0.04], MET, P,
  [L.wood, 1.2, 0.45, 0.9], [L.foliage, 0.8, 0.5, 1], [L.foliage, 0.8, 0.45, 1], [L.roof, 0.55, 0.55, 1.1], [L.brick, 0.8, 0.7, 1.1],
  [L.dirt, 0.4, 0.6, 1], [W, 1, 0, 1], [L.foliage, 0.8, 0.4, 1],
];
const PAVE = [L.paving, 0.42, 0.35, 0.9];
const GRASS = [L.grass, 0.3, 0.3, 1.1];
const PCON = [L.concrete, 0.4, 0.05, 0.4];
const GROUND = [
  PAVE, [L.paving, 0.42, 0.15, 0.5], [L.sand, 0.3, 0.6, 1], [L.dirt, 0.35, 0.6, 1], [L.paving, 0.42, 0.3, 0.9], [L.paving, 0.5, 0.35, 0.9],
  [L.asphalt, 0.22, 0.7, 1], [L.asphalt, 0.22, 0.55, 1],
  GRASS, GRASS, GRASS, [W, 1, 0, 1], [W, 1, 0, 1], [L.sand, 0.3, 0.5, 1], [L.sand, 0.3, 0.5, 1], [L.paving, 0.42, 0.25, 0.9],
  PCON, PCON, PCON, PCON, [L.concrete, 0.3, 0.45, 1], [L.metal, 1.6, 0.6, 1], PCON, PCON, // steel on the ground = cast-iron covers
  NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE,
  MET, MET, MET, NONE, NONE, NONE, MET, P,
  [L.wood, 1.2, 0.5, 0.9], GRASS, GRASS, PAVE, [L.brick, 0.6, 0.7, 1], [L.dirt, 0.35, 0.7, 1], [W, 1, 0, 1], GRASS,
];
const toVec = (t) => uniformArray(t.map((v) => new THREE.Vector4(...v)), 'vec4');
const OBJ_TABLE = toVec(OBJECT), GND_TABLE = toVec(GROUND);

/** Per-object flags (x tree, y building, z edible tier): one shared material, read from mesh.userData.toyFlags. */
const NO_FLAGS = new THREE.Vector4();
const _flags = new THREE.Vector4();
// (clone() JSON-copies userData, so flags may arrive as a plain {x, y, z, w} object)
const objectFlags = uniform(new THREE.Vector4()).onObjectUpdate(({ object }) => {
  const f = object.userData.toyFlags;
  return f ? _flags.set(f.x, f.y, f.z, f.w) : NO_FLAGS;
});

/** Material subclass whose `preInstanceNode` deforms vertices in object space before instancing is applied. */
// low tier: the standard BRDF (no clearcoat layer to evaluate on every prop)
const ToyBase = Q.surface === 'lite' ? THREE.MeshStandardNodeMaterial : THREE.MeshPhysicalNodeMaterial;
export class ToyNodeMaterial extends ToyBase {
  setupPosition(builder) {
    if (this.preInstanceNode) positionLocal.assign(this.preInstanceNode);
    return super.setupPosition(builder);
  }
}

const swatchIndex = () => {
  const u = uv();
  return clamp(int(floor(u.x.mul(8))).add(int(floor(u.y.mul(6))).mul(8)), 0, 47);
};

/**
 * Build the TSL graph for a palette material.
 * ground: world-space ground table + wear; holes: uniformArray of vec3(x, z, r) cut out of the ground.
 */
function buildToy(mat, { ground = false, holes = null } = {}) {
  const sw = swatchIndex();
  const info = (ground ? GND_TABLE : OBJ_TABLE).element(sw);
  const pal = texture(palTex, uv());
  const orm = texture(ormTex, uv());
  const isBuilding = objectFlags.y.greaterThan(0.5);
  // buildings: painted walls become rendered stucco with real relief
  const paint = info.x.equal(L.plaster).and(info.w.lessThan(0.2));
  const strength = select(paint.and(isBuilding), float(0.75), info.w);
  const scale = select(paint.and(isBuilding), float(0.45), info.y);
  const layerF = clamp(info.x, 0, 15);
  const layer = int(layerF);
  const has = info.x.greaterThanEqual(0).and(info.x.lessThan(15.5));
  const water = info.x.greaterThan(15.5);
  const dist = length(positionView);
  const fade = smoothstep(160, 30, dist).mul(surfaceOn);
  const p = ground ? positionWorld : positionGeometry;
  const n = ground ? normalWorldGeometry : normalize(normalGeometry);
  const tri = triplanar(p, n, layer, scale);
  const mean = layerMean.element(layer);
  const k = select(has, fade, float(0));

  // ---- albedo
  const colorNode = Fn(() => {
    if (holes) {
      for (let i = 0; i < MAX_HOLES; i++) {
        const h = holes.element(i);
        If(h.z.greaterThan(0).and(length(positionWorld.xz.sub(h.xy)).lessThan(h.z)), () => { Discard(); });
      }
    }
    const tinted = pal.rgb.mul(tri.col.div(max(mean, vec3(0.02))));
    const natural = tri.col.mul(luminance(pal.rgb).div(max(luminance(mean), 0.02)));
    let c = mix(pal.rgb, mix(tinted, natural, info.z), k).toVar();
    if (ground) {
      // lawns: a living green (the scan's detail on it), keeping each swatch's relative brightness
      const lawn = vec3(0.07, 0.15, 0.03).mul(luminance(tri.col).div(max(luminance(mean), 0.02))).mul(luminance(pal.rgb).div(0.5).add(0.35));
      c.assign(select(info.x.equal(L.grass), mix(c, lawn, k.mul(0.85)), c));
      // large-scale variation so repeats never read as a grid: patches of lusher/drier grass, worn asphalt
      const m = macro(positionWorld, 0.05), m2 = macro(positionWorld, 0.37);
      c.mulAssign(mix(0.82, 1.14, m).mul(mix(0.93, 1.05, m2)));
      // cavity darkening from the scan's AO (direct light too - fills the grooves between pavers and tiles)
      c.mulAssign(mix(1, pow(tri.ao, 1.5), k));
      c.mulAssign(select(info.x.equal(L.grass), mix(1, 0.6, surfaceOn), float(1))); // soil in the shade of the blades
      c.assign(select(water, mix(vec3(0.015, 0.05, 0.055), pal.rgb, 0.12), c)); // deep, reads through its reflections
      c.mulAssign(select(sw.equal(21), float(0.3), float(1))); // cast iron
    } else {
      c.mulAssign(mix(1, tri.ao, k.mul(0.7)));
      // grounding: a little darker where things meet the floor
      c.mulAssign(mix(0.82, 1.0, smoothstep(0.0, 0.7, positionGeometry.y)));
      c.assign(select(water, mix(vec3(0.02, 0.06, 0.07), pal.rgb, 0.2), c));
    }
    return vec4(c, 1);
  })();
  mat.colorNode = colorNode;

  // ---- roughness / metalness: scan roughness on textured swatches, remapped around the swatch's finish
  const scanRough = clamp(tri.rough.mul(0.6).add(orm.g.mul(0.5)), 0.04, 1);
  mat.roughnessNode = select(water, float(0.04), mix(orm.g, scanRough, k.mul(select(paint, float(0.3), float(1)))));
  mat.metalnessNode = ground ? select(sw.equal(21), float(0.6), orm.b) : orm.b;
  if (!ground && Q.surface !== 'lite') { // vehicles: glossy clearcoat over the body paint (flags.w)
    const body = paint.and(objectFlags.w.greaterThan(0.5));
    mat.clearcoatNode = select(body, float(1), float(0));
    mat.clearcoatRoughnessNode = float(0.06);
  }

  // ---- normal: surface gradient from the scan (or animated waves on water), faded with distance
  mat.normalNode = Fn(() => {
    const g = select(water, waterGrad(positionWorld).mul(fade.mul(0.9).add(0.1)), tri.grad.mul(strength).mul(k));
    return normalize(normalViewGeometry.sub(g));
  })();

  // ---- ambient occlusion from the scans (indirect light)
  mat.aoNode = mix(float(1), tri.ao, k);

  // ---- emissive: palette glow, lived-in windows at night, edible-rim glow near the hole
  mat.emissiveNode = Fn(() => {
    const e = texture(emitTex, uv()).rgb.mul(glow).toVar();
    if (!ground) {
      const hole = world.hole;
      // night windows: glass swatch on buildings, per-room random on/off
      const cell = floor(positionGeometry.mul(vec3(1.1, 0.8, 1.1)));
      const hsh = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
      const win = isBuilding.and(sw.equal(35)).and(world.night.greaterThan(0));
      e.addAssign(select(win, vec3(1.0, 0.7, 0.36).mul(step(0.42, hsh)).mul(world.night).mul(hsh.mul(0.6).add(0.7)).mul(1.6), vec3(0)));
      const tier = objectFlags.z;
      const edible = tier.greaterThan(0).and(hole.z.greaterThan(0)).and(tier.lessThan(hole.z.mul(0.95)));
      const near = smoothstep(hole.z.mul(1.6).add(5), hole.z.add(0.5), length(positionWorld.xz.sub(hole.xy)));
      const rim = pow(oneMinus(clamp(dot(normalize(normalViewGeometry), normalize(positionView.negate())), 0, 1)), 4);
      const small = smoothstep(hole.z.mul(0.95), hole.z.mul(0.4), tier);
      const pulse = sin(time.mul(5)).mul(0.2).add(0.8);
      e.addAssign(select(edible, world.edCol.mul(rim.mul(0.55).add(0.07)).mul(near).mul(small).mul(pulse), vec3(0)));
    }
    return e;
  })();
  return mat;
}

/** The shared prop material (one pipeline for every static/moving prop). */
export function toyMaterial() {
  return buildToy(new ToyNodeMaterial());
}

/** People walk: arms/legs carry _swing (+-1 legs, +-2 arms, sign = side) and _pivot (hip/shoulder height). */
export function pedMaterial() {
  const m = new ToyNodeMaterial();
  const swing = attribute('_swing', 'float'), pivot = attribute('_pivot', 'float');
  const ph = pedTime.mul(8).add(float(instanceIndex).mul(1.618));
  const arm = step(1.5, abs(swing));
  const moving = step(0.5, abs(swing));
  const ang = sin(ph).mul(sign(swing)).mul(mix(0.5, -0.65, arm)).mul(moving);
  const q = positionGeometry.sub(vec3(0, pivot, 0));
  const c = cos(ang), s = sin(ang);
  m.preInstanceNode = vec3(q.x.mul(c).sub(q.y.mul(s)), q.x.mul(s).add(q.y.mul(c)), q.z).add(vec3(0, pivot, 0));
  return buildToy(m);
}

/** Ground tiles: world-space detail and a cut-out wherever a hole is open. */
export function groundMaterial(holeField) {
  const holes = uniformArray(holeField.value, 'vec3');
  return buildToy(new ToyNodeMaterial(), { ground: true, holes });
}


/** Grass mask pass (src/grass.js): R = lawn density from the swatch table, G = ground height, B = wildness. */
export function groundMaskMaterial(wild = 0, density = 1) {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  const info = GND_TABLE.element(swatchIndex());
  const grass = info.x.equal(L.grass).select(float(density), float(0));
  m.colorNode = vec4(grass, positionWorld.y, wild, 1);
  return m;
}
