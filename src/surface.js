// Materials for the palette-atlas world (ART.md "Surface detail"), written in TSL for the WebGPU renderer.
// Every palette swatch maps to a scanned PBR layer (src/pbr.js) with its own scale, how much of the scan's
// natural colour shows through (chroma) and relief strength. Props sample in object space so detail sticks
// to moving things; ground tiles sample in world space so no two blocks look the same.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, uniformArray, texture, uv, vec3, vec4, float, int, floor, clamp, mix, smoothstep, max, dot, pow,
  normalize, positionGeometry, normalGeometry, positionWorld, normalWorldGeometry, normalViewGeometry, positionView,
  positionLocal, attribute, instanceIndex, sin, cos, abs, sign, step, length, Discard, If, luminance, select, fract,
  time, oneMinus, hash, atan, cameraPosition, dFdx, dFdy, min,
} from 'three/tsl';
import { triplanar, layerMean, waterGrad, macro, L, brushedGrad, pomOffset } from './pbr.js';
import { sunDir, sunCol } from './look.js';
import { Q } from './quality.js';
import { MAX_HOLES } from './hole.js';

export const surfaceTime = uniform(0); // legacy tick (kept for callers); shaders use it for hole pulses
export const surfaceOn = uniform(1); // 0 on low-spec devices (set by the fps watchdog)
export const glow = uniform(1.4); // emissive strength (time of day)
// Shared world state: player hole (x, z, r, vacuum), night amount, edible-glow colour.
export const world = { hole: uniform(new THREE.Vector4()), night: uniform(0), edCol: uniform(new THREE.Color(0xb58cff)) };
export const pedTime = uniform(0);
// show lights: one clock + a gentle breathing pulse shared by every chase (ferris rims, carousel, festoons, runway)
export const lightsTime = uniform(0);
export const lightsPulse = uniform(1);

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
const MET = [L.metal, 1.4, 0, 0.06]; // ground only now (cast-iron covers, grates)
const SHINE = [-1, 1, 0, 0]; // polished metals: no scan; ORM metalness + IBL + a brushed-anisotropy normal (ART.md)
const OBJECT = [
  P, P, P, P, P, P, [L.asphalt, 0.5, 0.3, 0.8], [L.asphalt, 0.5, 0.3, 0.8],
  P, P, P, P, P, P, P, P,
  P, P, P, P, [L.concrete, 0.45, 0.25, 0.9], [L.metal, 0.9, 0, 0.25], P, P,
  NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE,
  SHINE, SHINE, SHINE, NONE, NONE, [L.plaster, 1, 0, 0.04], SHINE, P,
  [L.wood, 1.2, 0.45, 0.9], [L.foliage, 0.8, 0.5, 1], [L.foliage, 0.8, 0.45, 1], [L.roof, 0.55, 0.55, 1.1], [L.brick, 0.8, 0.7, 1.1],
  [L.dirt, 0.4, 0.6, 1], [W, 1, 0, 1], [L.foliage, 0.8, 0.4, 1],
];
const SW = { steel: 21, gold: 32, chrome: 33, copper: 34, glass: 35, roseGold: 38 };
const OFF = new Set((typeof location !== 'undefined' && new URLSearchParams(location.search).get('off')?.split(',')) || []); // dev: ?off=glass,cav,...
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

  // The palette/scan colour graph lives in toyColorNode, not colorNode: three's shadow pass evaluates a material's
  // whole colorNode just to read its alpha (always 1 here), which made every shadow-map fragment pay for 9 scan
  // fetches, noise and glass interiors. With colorNode null the shadow shader is depth-only.
  setupDiffuseColor(builder) {
    if (!this.toyColorNode) return super.setupDiffuseColor(builder);
    this.colorNode = this.toyColorNode;
    try { return super.setupDiffuseColor(builder); } finally { this.colorNode = null; }
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
function buildToy(mat, { ground = false, holes = null, seed = float(instanceIndex) } = {}) {
  const sw = swatchIndex();
  const info = (ground ? GND_TABLE : OBJ_TABLE).element(sw);
  const pal = texture(palTex, uv());
  const orm = texture(ormTex, uv());
  const isBuilding = objectFlags.y.greaterThan(0.5);
  // flags.w: 1 vehicle (clearcoat), 2 fabric (sheen, flutter, glow-through), 3 show lights (chase patterns)
  const fw = objectFlags.w;
  const isVehicle = fw.greaterThan(0.5).and(fw.lessThan(1.5));
  const isFabric = fw.greaterThan(1.5).and(fw.lessThan(2.5));
  const isLights = fw.greaterThan(2.5);
  const high = Q.tier === 'high', full = Q.surface !== 'lite';
  // buildings: painted walls become rendered stucco with real relief
  const paint = info.x.equal(L.plaster).and(info.w.lessThan(0.2));
  const strength = select(paint.and(isBuilding), float(0.75), info.w);
  const scale = select(paint.and(isBuilding), float(0.45), info.y);
  const layerF = clamp(info.x, 0, 15);
  const layer = int(layerF);
  const water = info.x.greaterThan(15.5);
  const dist = length(positionView);
  const fade = smoothstep(160, 30, dist).mul(surfaceOn);
  const n = ground ? normalWorldGeometry : normalize(normalGeometry);
  // steel keeps the tread-plate scan only where it is a floor or a cart bed (faces pointing up); elsewhere it's brushed
  const plateOK = ground ? float(1).greaterThan(0) : sw.notEqual(SW.steel).or(n.y.greaterThan(0.7));
  const has = info.x.greaterThanEqual(0).and(info.x.lessThan(15.5)).and(plateOK);
  const metal = orm.b.greaterThan(0.5).or(sw.equal(SW.steel).and(plateOK.not()));
  let p = ground ? positionWorld : positionGeometry;
  if (ground && high && !OFF.has('pom')) {
    // parallax occlusion on flat ground (asphalt, paving, brick, dirt, verges): 10 steps on high, faded with distance
    const flat = n.y.greaterThan(0.7).and(has).and(water.not());
    const off = pomOffset(positionWorld, layer, scale, 10, strength.mul(0.035).mul(fade));
    p = vec3(positionWorld.x.add(select(flat, off.x, float(0))), positionWorld.y, positionWorld.z.add(select(flat, off.y, float(0))));
  }
  const tri = triplanar(p, n, layer, scale);
  const mean = layerMean.element(layer);
  const k = select(has, fade, float(0));
  const glass = sw.equal(SW.glass);

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
      // repeated props aren't clones: a small per-instance warm/cool + value jitter (never on buildings)
      const j1 = hash(seed.mul(1.37).add(objectFlags.z.mul(17.1))), j2 = hash(seed.mul(3.11).add(5.3));
      const jit = vec3(float(1).add(j1.sub(0.5).mul(0.07)), 1, float(1).sub(j1.sub(0.5).mul(0.07))).mul(j2.sub(0.5).mul(0.09).add(1));
      if (!OFF.has('jit')) c.mulAssign(select(isBuilding, vec3(1), jit));
      if (high && !OFF.has('cav')) {
        // cavity/curvature: concave creases darken, convex bevels catch a little light (ART.md AO)
        const dp = dFdx(positionWorld), dq = dFdy(positionWorld), nw = normalWorldGeometry;
        const curv = dot(dFdx(nw), dp).div(max(dot(dp, dp), 1e-6)).add(dot(dFdy(nw), dq).div(max(dot(dq, dq), 1e-6)));
        c.mulAssign(clamp(float(1).add(curv.mul(0.05)), 0.72, 1.08));
      }
      // glass: dark, deep interiors instead of opaque paint; on high, buildings get parallax 'fake rooms'
      // (interior mapping in world space: rooms 3.6 x 3.1 m, each with its own wall tint and a floor/ceiling)
      if (!OFF.has('glass')) {
        let inside = pal.rgb.mul(0.18);
        if (high) {
          const room = vec3(3.6, 3.1, 3.6);
          const d = normalize(positionWorld.sub(cameraPosition));
          const q = positionWorld.sub(normalWorldGeometry.mul(0.02)).div(room); // (geometric normal: normalWorld would feed back from normalNode)
          const cell = floor(q), f = q.sub(cell);
          const t = vec3(select(d.x.greaterThan(0), float(1).sub(f.x), f.x).div(max(abs(d.x), 1e-3)),
            select(d.y.greaterThan(0), float(1).sub(f.y), f.y).div(max(abs(d.y), 1e-3)),
            select(d.z.greaterThan(0), float(1).sub(f.z), f.z).div(max(abs(d.z), 1e-3))).mul(room);
          const tm = min(t.x, min(t.y, t.z));
          const onY = t.y.lessThanEqual(tm.add(1e-4));
          const rnd = hash(cell.x.mul(7.1).add(cell.y.mul(31.7)).add(cell.z.mul(3.3)));
          const wall = mix(vec3(0.55, 0.47, 0.38), vec3(0.42, 0.46, 0.52), rnd);
          const hitY = select(d.y.greaterThan(0), vec3(0.7, 0.68, 0.62), vec3(0.32, 0.22, 0.15));
          const shade = select(onY, hitY, wall).mul(smoothstep(9, 1.5, tm).mul(0.7).add(0.3));
          inside = select(isBuilding, mix(shade.mul(0.32), pal.rgb.mul(0.12), 0.35), inside);
        }
        c.assign(select(glass, inside, c));
      }
    }
    return vec4(c, 1);
  })();
  mat.toyColorNode = colorNode; // (see ToyNodeMaterial.setupDiffuseColor)

  // ---- roughness / metalness: scan roughness on textured swatches, remapped around the swatch's finish
  const scanRough = clamp(tri.rough.mul(0.6).add(orm.g.mul(0.5)), 0.04, 1);
  mat.roughnessNode = select(water, float(0.04), mix(orm.g, scanRough, k.mul(select(paint, float(0.3), float(1)))));
  mat.metalnessNode = ground ? select(sw.equal(21), float(0.6), orm.b) : select(sw.equal(SW.steel).and(plateOK.not()), float(0.85), orm.b);
  if (!ground && full) {
    // vehicles: glossy clearcoat over the body paint
    mat.clearcoatNode = select(paint.and(isVehicle), float(1), float(0));
    mat.clearcoatRoughnessNode = float(0.06);
    // fabric (tents, awnings, bunting, the balloon float): a soft sheen lobe on the cloth
    if (!OFF.has('sheen')) mat.sheenNode = select(isFabric.and(paint), pal.rgb.mul(0.7), vec3(0));
    if (!OFF.has('sheen')) mat.sheenRoughnessNode = float(0.45);
  }

  // ---- normal: surface gradient from the scan (or animated waves on water), faded with distance;
  // polished metals get a faint brushed grain instead of a scan
  mat.normalNode = Fn(() => {
    let g = select(water, waterGrad(positionWorld).mul(fade.mul(0.9).add(0.1)), tri.grad.mul(strength).mul(k));
    if (!ground && full && !OFF.has('brush')) g = g.add(select(metal.and(has.not()), brushedGrad(positionGeometry).mul(fade), vec3(0)));
    return normalize(normalViewGeometry.sub(g));
  })();

  // ---- ambient occlusion from the scans (indirect light)
  mat.aoNode = mix(float(1), tri.ao, k);

  // ---- emissive: palette glow, lived-in windows at night, edible-rim glow near the hole, show-light chases
  mat.emissiveNode = Fn(() => {
    const e = texture(emitTex, uv()).rgb.mul(glow).toVar();
    // ferris wheel, carousel, fair festoons, runway edge lights: bulbs chase round and up (one shared clock)
    const ang = atan(positionGeometry.z, positionGeometry.x);
    const chase = step(0.5, fract(ang.mul(6 / 6.2832).add(positionGeometry.y.mul(0.18)).sub(lightsTime.mul(1.3))));
    e.mulAssign(select(isLights, chase.mul(0.75).add(0.45).mul(lightsPulse), float(1)));
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
      // thin cloth glows where the sun shines through it (inflatables, awnings): soft transmission, cheap
      const through = pow(max(dot(normalize(positionWorld.sub(cameraPosition)), sunDir), 0), 3).mul(0.3).add(0.03);
      e.addAssign(select(isFabric.and(paint), pal.rgb.mul(sunCol).mul(through).mul(0.35), vec3(0)));
    }
    return e;
  })();
  return mat;
}


/**
 * Per-instance identity for jitter and walk phase. Static groups use their instance index; city-wide traffic is
 * re-packed every frame (only what's in view gets drawn), so it carries a stable seed attribute instead.
 */
const seedOf = (seeded) => (seeded ? attribute('iseed', 'float') : float(instanceIndex));

/** The shared prop material (one pipeline for every static/moving prop). seeded: the variant for culled traffic. */
export function toyMaterial({ seeded = false } = {}) {
  const m = new ToyNodeMaterial();
  // fabric flutters: awnings, bunting and flags ripple above ~2 m, riding the shared wind clock
  const pg = positionGeometry, isFabric = objectFlags.w.greaterThan(1.5).and(objectFlags.w.lessThan(2.5));
  const amp = select(isFabric, smoothstep(2.0, 4.5, pg.y).mul(0.035), float(0));
  const ph = time.mul(6.5).add(pg.x.mul(2.3)).add(pg.z.mul(1.9));
  m.preInstanceNode = pg.add(vec3(sin(ph), sin(ph.mul(1.3)).mul(0.3), cos(ph.mul(0.8))).mul(amp));
  return buildToy(m, { seed: seedOf(seeded) });
}

/**
 * Buildings crumble instead of dropping whole (docs/PHASE2.md §9). Every vertex knows the centre of the modelled part it
 * belongs to (aPart: each box, roof, column is its own connected piece), so parts break away rigidly - no stretched
 * triangles. aCrumble per instance: x progress (0 = standing), y/z the hole centre in object space, w model height.
 * Parts tremble, then let go in a staggered pancake - the side over the hole and the lower storeys first - tumbling,
 * shrinking into rubble and sliding toward the hole as they sink below the rim.
 */
export function crumbleMaterial() {
  const m = new ToyNodeMaterial();
  const pg = positionGeometry, c = attribute('aCrumble', 'vec4'), part = attribute('aPart', 'vec3');
  m.preInstanceNode = Fn(() => {
    const p = pg.toVar();
    If(c.x.greaterThan(0), () => {
      const h = max(c.w, 1);
      const rnd = hash(part.x.mul(13.13).add(part.y.mul(7.71)).add(part.z.mul(3.37)));
      const toHole = c.yz.sub(part.xz), dh = length(toHole);
      const delay = clamp(part.y.div(h), 0, 1).mul(0.3).add(rnd.mul(0.22)).add(clamp(dh.div(h.add(10)), 0, 1).mul(0.3));
      const q = clamp(c.x.sub(delay).div(0.55), 0, 1);
      const shake = smoothstep(0, 0.08, c.x).mul(float(1).sub(q)).mul(0.05).mul(h.mul(0.02).add(1));
      // tumble: the part's offset from its centre turns about y and x as it goes, and crumbles smaller
      const off = p.sub(part), a1 = q.mul(rnd.sub(0.5)).mul(5), a2 = q.mul(rnd.mul(3.1).fract().sub(0.5)).mul(4);
      const c1 = cos(a1), s1 = sin(a1), c2 = cos(a2), s2 = sin(a2);
      const r1 = vec3(off.x.mul(c1).sub(off.z.mul(s1)), off.y, off.x.mul(s1).add(off.z.mul(c1)));
      const r2 = vec3(r1.x, r1.y.mul(c2).sub(r1.z.mul(s2)), r1.y.mul(s2).add(r1.z.mul(c2))).mul(float(1).sub(q.mul(0.45)));
      const slide = smoothstep(0.05, 1, q).mul(0.9), fall = q.mul(q).mul(part.y.add(h.mul(0.7)).add(8));
      const jit = vec3(sin(time.mul(47).add(rnd.mul(20))), sin(time.mul(39).add(rnd.mul(9))).mul(0.4), cos(time.mul(43).add(rnd.mul(13)))).mul(shake);
      p.assign(part.add(r2).add(vec3(toHole.x.mul(slide), fall.negate(), toHole.y.mul(slide))).add(jit));
    });
    return p;
  })();
  return buildToy(m, { seed: seedOf(false) });
}

/** People walk: arms/legs carry _swing (+-1 legs, +-2 arms, sign = side) and _pivot (hip/shoulder height). */
export function pedMaterial({ seeded = false } = {}) {
  const m = new ToyNodeMaterial();
  const swing = attribute('_swing', 'float'), pivot = attribute('_pivot', 'float');
  const seed = seedOf(seeded);
  const ph = pedTime.mul(8).add(seed.mul(1.618));
  const arm = step(1.5, abs(swing));
  const moving = step(0.5, abs(swing));
  const ang = sin(ph).mul(sign(swing)).mul(mix(0.5, -0.65, arm)).mul(moving);
  const q = positionGeometry.sub(vec3(0, pivot, 0));
  const c = cos(ang), s = sin(ang);
  m.preInstanceNode = vec3(q.x.mul(c).sub(q.y.mul(s)), q.x.mul(s).add(q.y.mul(c)), q.z).add(vec3(0, pivot, 0));
  return buildToy(m, { seed });
}

/** Ground tiles: world-space detail and a cut-out wherever a hole is open. */
export function groundMaterial(holeField) {
  const holes = holeField ? uniformArray(holeField.value, 'vec3') : null;
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
