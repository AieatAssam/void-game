// Phase 4 game loop (docs/PHASE4.md): the black hole eats the sky. main.js hands it a `ctx` (the same one Phase 3 gets) and calls frame() each tick while state.phase === 4.
// Render space is in units of the hole's radius: the hole sits at the origin with r = 1, the world moves under it. Positions are doubles in the tier's own unit (src/space/tiers.js).
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, uniform, instancedBufferAttribute, varying, normalize, dot, cross, length, max, min, mix, smoothstep, clamp, pow, sin, abs, floor, fract, positionLocal, positionGeometry, positionView,
  normalView, vertexColor, mx_noise_float, mx_fractal_noise_float, mx_cell_noise_vec3, select, uv, dFdx, dFdy, atan, exp, cubeTexture, mat3, texture,
} from 'three/tsl';
import { TIERS, K, buildTier, looseRock, rng } from './space/tiers.js';
import { steerAxis } from './phase2.js';
import { portraitK } from './phase3.js';
import { holeSphere, holeHalo } from './blackhole.js';
import { Q } from './quality.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { extraMethods } from './space/extras.js';
import { showSpaceResults } from './space/results.js';
import { installTouch } from './space/touch.js';
import { makeK, mutatorFor, MUTATORS, LEGACY } from './space/modes.js';
import { save } from './meta.js';

const qs = new URLSearchParams(location.search);
const num = (k, d) => (qs.has(k) && qs.get(k) !== '' && Number.isFinite(+qs.get(k)) ? +qs.get(k) : d);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sm = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const CAP = 1500, CAPG = 700, CAPR = 96, CAPT = 24; // instances (bodies in range + falling + chunks)
const CHUNKS = 48; // nibbled bits in flight
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere();
const BASE_DIST = 19, PITCH = THREE.MathUtils.degToRad(56), SPEED = 0.95, NIB = 0.9;
const LY = 9.4607e12;
const km = (v) => (v >= 9.4607e19 ? `${(v / LY / 1e9).toFixed(1)} bn ly` : v >= 9.4607e16 ? `${(v / LY / 1e6).toFixed(v >= 9.4607e17 ? 0 : 1)} M ly` : v >= 9.4607e13 ? `${(v / LY / 1e3).toFixed(v >= 9.4607e14 ? 0 : 1)} k ly` : v >= 9.4607e11 ? `${(v / LY).toFixed(v >= 9.4607e12 ? 0 : 1)} ly` : v >= 1e9 ? `${(v / 1e9).toFixed(1)} bn km` : v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)} M km` : v >= 1e3 ? `${Math.round(v).toLocaleString('en')} km` : `${v.toFixed(0)} km`);
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _y = new THREE.Vector3(0, 1, 0), _c = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------ materials
/** One material for every body: kind (rock / world / giant / star / comet) per instance, all procedural. */
function bodyMaterial(U) {
  const makeAttr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aT = makeAttr(), aA = makeAttr(), aB = makeAttr();
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  const T0 = instancedBufferAttribute(aT), A0 = instancedBufferAttribute(aA), B0 = instancedBufferAttribute(aB);
  m.positionNode = Fn(() => { // lumps: rocks and comet nuclei are not spheres
    const d = normalize(positionLocal), lumpy = T0.x.lessThan(0.5).or(T0.x.greaterThan(3.5).and(T0.x.lessThan(4.5)));
    const n = mx_noise_float(d.mul(T0.z.mul(0.6).add(1.2)).add(T0.y.mul(13.7)));
    return positionLocal.mul(float(1).add(select(lumpy, n.mul(0.3).sub(0.04), float(0))));
  })();
  m.colorNode = Fn(() => {
    const T = varying(T0, 'vSpT'), A = varying(A0, 'vSpA'), B = varying(B0, 'vSpB');
    const kind = T.x;
    const d = normalize(positionGeometry), nV = normalize(normalView), V = normalize(positionView.negate()); // (positionLocal would carry the instance's offset and scale: the direction from the body's centre is the raw attribute)
    const facet = normalize(cross(dFdx(positionView), dFdy(positionView)));
    const isRock = kind.lessThan(0.5).or(kind.greaterThan(3.5).and(kind.lessThan(4.5))), isCluster = kind.greaterThan(4.5), isWorld = kind.greaterThan(0.5).and(kind.lessThan(1.5)), isGiant = kind.greaterThan(1.5).and(kind.lessThan(2.5)), isStar = kind.greaterThan(2.5).and(kind.lessThan(3.5));
    const n = select(isRock, facet, nV), ndl = dot(n, U.sun), ndv = clamp(dot(nV, V), 0, 1);
    // the pattern atlas (art/space/bake_bodies.py, baked in Blender): one fetch. Longitude is turned per instance; the wrap seam takes its derivative from the continuous side.
    const lon = atan(d.z, d.x).mul(1 / TAU).add(T.y.mul(0.37)), lat = d.y.clamp(-1, 1).asin().mul(1 / Math.PI).add(0.5);
    const uA = fract(lon), uB = fract(lon.add(0.5));
    const gx = select(abs(dFdx(uA)).lessThan(abs(dFdx(uB))), dFdx(uA), dFdx(uB)), gy = select(abs(dFdy(uA)).lessThan(abs(dFdy(uB))), dFdy(uA), dFdy(uB));
    const tile = vec2(select(isWorld.or(isStar).or(isCluster), float(0.5), float(0)), select(isGiant.or(isStar).or(isCluster), float(0.5), float(0)));
    const tex = texture(U.atlas, vec2(uA.mul(0.495).add(0.0025), lat.mul(0.495).add(0.0025)).add(tile));
    const R = tex.x, G = tex.y, M = tex.z;
    // height from G: a cheap bump, lit from the sun's side (the craters read)
    const bump = float(1).sub(dFdx(G).mul(U.sun.x).sub(dFdy(G).mul(U.sun.y)).mul(isRock.select(float(26), float(8))).clamp(-0.6, 0.6));
    const rock = mix(B.rgb, A.rgb, smoothstep(0.1, 0.9, R)).mul(float(0.75).add(G.mul(0.5))).mul(bump);
    const world = mix(mix(B.rgb, A.rgb.mul(float(0.8).add(G.mul(0.5))), smoothstep(0.42, 0.58, R)), vec3(0.93, 0.96, 1.0), M.mul(0.92)).mul(bump);
    const giant = mix(mix(A.rgb, B.rgb, smoothstep(0.1, 0.9, R)).mul(float(0.82).add(G.mul(0.4))), vec3(0.8, 0.38, 0.25), M.mul(0.7));
    const wrap = smoothstep(-0.12, 0.85, ndl), lit = float(U.amb).add(wrap.mul(1.25));
    const atmo = pow(float(1).sub(ndv), 3).mul(wrap.mul(0.8).add(0.12));
    const rim = select(isWorld, vec3(0.45, 0.65, 1.0).mul(atmo).mul(0.9), select(isGiant, A.rgb.mul(atmo).mul(0.5), vec3(0)));
    const albedo = select(isRock, rock, select(isWorld, world, giant));
    const lighting = select(isRock, float(U.amb).add(clamp(ndl.mul(0.9).add(0.1), 0, 1).mul(1.3)), lit);
    // star: granulation and spots from the atlas, hotter in the middle, HDR so the bloom takes it
    const star = mix(B.rgb, A.rgb, smoothstep(0.1, 0.9, R.mul(0.7).add(pow(ndv, 0.7).mul(0.4)))).pow(1.25).mul(float(1.7).add(R.mul(1.3))).mul(float(1).sub(M.mul(0.45))).mul(float(0.22).add(pow(ndv, 0.5).mul(0.78))).add(vec3(1.0, 0.95, 0.85).mul(pow(ndv, 5).mul(1.8)));
    // a cluster: a fuzzy ball of light, brighter in the middle, speckled by the star tile
    const fuzz = mix(B.rgb, A.rgb, smoothstep(0.2, 0.9, R)).mul(pow(ndv, 2.6).mul(float(0.5).add(R.mul(1.1))).add(pow(ndv, 12).mul(1.4)));
    const col = select(isCluster, fuzz, select(isStar, star, albedo.mul(lighting).add(rim)));
    return vec4(col.add(vec3(1.0, 0.55, 0.2).mul(B.w).mul(2.2)).add(vec3(1, 0.9, 0.7).mul(B.w.mul(B.w)).mul(1.6)), 1); // (B.w: the heat of a body going down the hole)
  })();
  return { m, aT, aA, aB };
}

/** Comet tails (ion + dust), one instanced quad per comet lying in the plane, root at the head. */
function tailMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.colorNode = Fn(() => {
    const u = uv().x, v = uv().y.sub(0.5).mul(2), body = pow(float(1).sub(u), 1.6), edge = pow(clamp(float(1).sub(abs(v)), 0, 1), 1.3);
    const streak = mx_noise_float(vec3(u.mul(9), v.mul(5), 0.7)).mul(0.5).add(0.75);
    const ion = vec3(0.45, 0.7, 1.0).mul(body).mul(pow(clamp(float(1).sub(abs(v).mul(1.6)), 0, 1), 2.2)).mul(1.5);
    const dust = vec3(1.0, 0.86, 0.6).mul(body).mul(edge).mul(0.5);
    return vec4(ion.add(dust).mul(streak).mul(smoothstep(0.0, 0.04, u)), 1);
  })();
  const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  const mesh = new THREE.InstancedMesh(g, m, CAPT);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 5;
  return mesh;
}

/** Galaxies and nebulae: flat sprites lying in the plane (tilted per instance), drawn additively from the Blender-baked atlas (art/space/bake_galaxies.py). */
function galaxyMaterial(atlas) {
  const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(CAPG * 4), 4).setUsage(THREE.DynamicDrawUsage), aT = mk(), aC = mk();
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const T = varying(instancedBufferAttribute(aT), 'vGalT'), C = varying(instancedBufferAttribute(aC), 'vGalC');
  const tile = vec2(T.x.mod(2).mul(0.5), floor(T.x.mul(0.5)).mul(0.5));
  m.colorNode = Fn(() => {
    const t = texture(atlas, uv().mul(0.99).add(0.005).mul(0.5).add(tile)).rgb;
    return vec4(t.mul(C.rgb).mul(T.y).mul(1.4), 1);
  })();
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m, CAPG);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 2;
  return { mesh, aT, aC };
}

/** Star glare: one additive quad per star or cluster: a hot core, a halo and four faint diffraction spikes. Drawn behind the bodies' own discs (they are HDR and take the bloom as well). */
function glowMaterial() {
  const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(CAPG * 4), 4).setUsage(THREE.DynamicDrawUsage), aC = mk();
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const C = varying(instancedBufferAttribute(aC), 'vGlowC');
  m.colorNode = Fn(() => {
    const p = uv().sub(0.5).mul(2), r = length(p), core = exp(r.mul(-6.5)), halo = exp(r.mul(-2.4)).mul(0.22), hollow = C.a.lessThan(0);
    const atm = exp(r.sub(0.8).div(0.1).pow(2).negate()).mul(0.9).add(exp(r.sub(0.8).mul(-7)).mul(smoothstep(0.78, 0.84, r)).mul(0.25)); // (a planet's air: a thin bright rim just outside its disc)
    const spike = exp(abs(p.x).mul(-55)).mul(exp(abs(p.y).mul(-3.2))).add(exp(abs(p.y).mul(-55)).mul(exp(abs(p.x).mul(-3.2)))).mul(0.35);
    return vec4(C.rgb.mul(select(hollow, atm, core.mul(1.1).add(halo).add(spike))).mul(C.a.abs()).mul(float(1).sub(smoothstep(0.85, 1.0, r))), 1);
  })();
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m, CAPG);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 3;
  return { mesh, aC };
}

/** The Blender-built hero props (art/space/build_props.py): vertex-coloured low-poly GLBs, lit by the sun, a vertex alpha for what glows. Each model is one small instanced mesh. */
const PROPS = { telescope: [0.2, 0.1], probe: [0.3, -0.2], sat_comm: [0.2, -0.3], station: [0.1, -0.2], capsule: [0.3, 0.2], rocket_stage: [0.2, 0.3], monolith: [0.5, 0.1], ringworld: [-Math.PI / 2 + 0.6, 0], neutron_star: [0.8, 0], dyson: [0.3, 0] }; // (a base tilt per model: rings face the camera, craft lie in the plane)
const PROP_CAP = { telescope: 3, probe: 6, sat_comm: 14, station: 4, capsule: 8, rocket_stage: 10, monolith: 2, ringworld: 8, neutron_star: 16, dyson: 10 };
async function loadProps(U) {
  const loader = new GLTFLoader(), m = new THREE.MeshBasicNodeMaterial({ fog: false });
  m.colorNode = Fn(() => {
    const vc = vertexColor(), n = normalize(normalView), ndl = dot(n, U.sun), wrap = smoothstep(-0.2, 0.9, ndl), lit = float(U.amb).add(0.16).add(wrap.mul(1.1));
    return vec4(mix(vc.rgb.mul(lit), vc.rgb.mul(2.4), vc.a), 1);
  })();
  const out = {};
  await Promise.all(Object.keys(PROPS).map(async (name) => {
    try {
      const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/space/${name}.glb`); let geo = null;
      g.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry; });
      const mesh = new THREE.InstancedMesh(geo, m, PROP_CAP[name] || 40); mesh.frustumCulled = false; mesh.count = 0; out[name] = mesh;
    } catch (e) { console.warn('space prop', name, e); }
  }));
  return out;
}

/** Planetary rings: a flat annulus per ringed planet, banded and see-through. */
function ringMaterial(U) {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const t = length(positionGeometry.xz).sub(0.57).div(0.43);
  const bands = sin(t.mul(31)).mul(sin(t.mul(7.3).add(1.2))).mul(0.5).add(0.5), gap = smoothstep(0.5, 0.53, t).mul(float(1).sub(smoothstep(0.57, 0.6, t))), fade = smoothstep(0.0, 0.08, t).mul(float(1).sub(smoothstep(0.93, 1.0, t)));
  m.colorNode = mix(vec3(0.62, 0.55, 0.44), vec3(0.93, 0.85, 0.7), bands).mul(float(U.amb).add(0.95));
  m.opacityNode = fade.mul(float(0.2).add(bands.mul(0.5))).mul(float(1).sub(gap.mul(0.9)));
  const g = new THREE.RingGeometry(0.57, 1, 48, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(g, m, CAPR);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 4;
  return mesh;
}

/** The sky is expensive per pixel (stars in three cell scales + a fractal nebula), so it is drawn once into a cube map per tier; the dome the player sees is one fetch. */
function skyMaterialProcedural(S) {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.BackSide, depthWrite: false });
  m.colorNode = Fn(() => {
    const dir = normalize(positionLocal), col = vec3(0).toVar();
    const layer = (scale, thr, size, bright) => {
      const q = dir.mul(scale), c = floor(q), f = q.sub(c), h = mx_cell_noise_vec3(c), pres = mx_cell_noise_vec3(c.add(31.7)).x;
      const dd = length(f.sub(h.mul(0.6).add(0.2))), s = float(1).sub(smoothstep(0.0, size, dd)), tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), h.z);
      return tint.mul(s.mul(s)).mul(select(pres.greaterThan(thr), float(bright), float(0)));
    };
    col.addAssign(layer(34, 0.86, 0.12, 1.4)); col.addAssign(layer(75, 0.9, 0.16, 1.1)); col.addAssign(layer(160, 0.93, 0.2, 0.9)); col.addAssign(layer(340, 0.95, 0.24, 0.8));
    const neb = mx_fractal_noise_float(dir.mul(1.9).add(S.o), 4, 2.0, 0.55).mul(0.5).add(0.5), band = exp(dot(dir, normalize(vec3(0.3, 0.8, 0.5))).pow(2).mul(-9));
    col.addAssign(mix(S.a, S.b, mx_noise_float(dir.mul(3.1)).mul(0.5).add(0.5)).mul(pow(neb, 2.2)).mul(S.k).mul(float(0.5).add(band.mul(1.4))));
    return vec4(col, 1);
  })();
  return m;
}
class Sky {
  constructor(S, renderer, size) {
    this.renderer = renderer;
    this.rt = new THREE.CubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.cam = new THREE.CubeCamera(1, 5000, this.rt);
    this.scene = new THREE.Scene(); this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(2500, 24, 12), skyMaterialProcedural(S)));
    this.rot = uniform(new THREE.Matrix3());
    const m = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.BackSide, depthWrite: false });
    m.colorNode = vec4(cubeTexture(this.rt.texture, this.rot.mul(normalize(positionLocal))).rgb, 1);
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(2500, 24, 12), m); this.mesh.frustumCulled = false; this.mesh.renderOrder = -10;
  }
  bake() { this.cam.update(this.renderer, this.scene); }
  dispose() { this.rt.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.scene.children[0].geometry.dispose(); this.scene.children[0].material.dispose(); }
}

/** Motion cue: a drift of dust round the hole that streams past as it moves (scale is told by this and by what falls in, not by the camera). */
function dustField(n) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 70; pos[i * 3 + 1] = (Math.random() - 0.5) * 8 - 1; pos[i * 3 + 2] = (Math.random() - 0.5) * 70; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, size: 2.2 });
  m.colorNode = vec4(0.62, 0.7, 1.0, 0.5);
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 3;
  return p;
}

// ------------------------------------------------------------------------------------------------ the game
export class SpaceGame {
  constructor() {
    this.tierIdx = 0; this.fields = null; this.t = 0; this.r = 1; this.hx = 0; this.hz = 0; this.swallowed = 0; this.camDist = 0; this.lead = new THREE.Vector2();
    this.sim = Math.max(1, Math.min(30, num('simx', 1))); this.combo = 0; this.comboT = 0; this.boostT = 0; this.stormT = 0; this.storm = null; this.pitchK = 0; this.eatenW = 0; this.chunkT = 0; this.chunks = []; this.phase = 'play'; this.sweepT = 0; this.flashK = 0; this.hud = { t: 0 };
  }

  /** Build the scene objects (once) and enter tier `n` (1-based). */
  async begin(ctx) {
    const { scene, camera, post, state, hole, sun, renderer, look } = ctx;
    this.ctx = ctx;
    if (state.phase === 1) ctx.dropTown(); // (?space: straight from the menu; after Phase 3 the town is long gone)
    this.saved = { bg: scene.background, fog: scene.fogNode, env: scene.environmentIntensity, near: camera.near, far: camera.far, sky: look.sky.visible, envSky: look.envSky.visible };
    scene.background = new THREE.Color(0x000000); scene.fogNode = null; scene.environmentIntensity = 0; look.sky.visible = false; look.envSky.visible = false;
    sun.intensity = 0; sun.shadow.autoUpdate = false;
    hole.hidden = true; hole.x = hole.z = 0; hole.vx = hole.vz = 0; hole.sx = hole.sz = 0; hole.area = Math.PI; // (r is derived from the area: 1)
    const atlas = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/space/bodies.png`); atlas.colorSpace = THREE.NoColorSpace; atlas.anisotropy = 4; atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
    this.U = { sun: uniform(new THREE.Vector3(0.5, 0.8, 0.3)), amb: uniform(0.07), t: uniform(0), atlas };
    this.S = { a: uniform(new THREE.Vector3(0.05, 0.07, 0.16)), b: uniform(new THREE.Vector3(0.14, 0.06, 0.2)), k: uniform(0.7), o: uniform(new THREE.Vector3()) };
    this.root = new THREE.Group(); this.root.name = 'space';
    this.sky = new Sky(this.S, renderer, Q.tier === 'low' ? 512 : 1024); this.root.add(this.sky.mesh);
    this.bmHi = bodyMaterial(this.U); this.bmLo = bodyMaterial(this.U); this.bmBg = bodyMaterial(this.U); // (two meshes, two attribute sets: a near body is drawn with a fine sphere, a speck with a coarse one)
    this.hi = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, Q.software ? 2 : Q.tier === 'low' ? 3 : 4), this.bmHi.m, CAP); this.lo = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.bmLo.m, CAP);
    this.bg = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, Q.software ? 4 : Q.tier === 'low' ? 5 : 6), this.bmBg.m, 12); // (a few huge bodies, the Sun: a smooth silhouette)
    for (const o of [this.hi, this.lo, this.bg]) { o.frustumCulled = false; o.count = 0; o.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(o); }
    const galAtlas = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/space/galaxies.png`); galAtlas.colorSpace = THREE.NoColorSpace; galAtlas.anisotropy = 4; galAtlas.wrapS = galAtlas.wrapT = THREE.ClampToEdgeWrapping;
    this.gal = galaxyMaterial(galAtlas); this.root.add(this.gal.mesh);
    this.props = await loadProps(this.U); for (const m of Object.values(this.props)) this.root.add(m);
    this.glow = glowMaterial(); this.root.add(this.glow.mesh);
    this.tails = tailMaterial(); this.rings = ringMaterial(this.U); this.root.add(this.tails, this.rings);
    this.dust = dustField(Q.tier === 'low' ? 220 : 420); this.root.add(this.dust);
    this.bh = holeSphere(); this.bh.visible = true; this.bh.material.userData.U.uK.value = 1; this.bh.material.depthTest = false; this.bh.material.depthWrite = false; this.bh.renderOrder = 50;
    this.halo = holeHalo(); this.halo.visible = true; this.halo.material.userData.U.uK.value = 0.8; this.halo.material.depthTest = false; this.halo.renderOrder = 51;
    this.rbh = holeSphere(); this.rbh.material = this.rbh.material.clone(); this.rbh.material.userData.U = this.bh.material.userData.U; // (the rival: the same void, a hot orange rim)
    this.rbh.material.depthTest = false; this.rbh.material.depthWrite = false; this.rbh.renderOrder = 48; this.rbh.visible = false;
    this.rhalo = holeHalo(); this.rhalo.material.userData.U.uK.value = 0.55; this.rhalo.material.userData.U.uHeat.value = 0.95; this.rhalo.material.depthTest = false; this.rhalo.renderOrder = 49; this.rhalo.visible = false;
    this.root.add(this.bh, this.halo, this.rbh, this.rhalo);
    scene.add(this.root);
    { const seed = num('seed', 7), runs = save.cosmos?.runs | 0, mut = qs.get('mut') in MUTATORS ? qs.get('mut') : mutatorFor(seed, runs), legacy = qs.get('legacy') in LEGACY ? qs.get('legacy') : save.cosmos?.legacy;
      this.seed = num('seed', 7); this.mut = mut; this.legacy = legacy in LEGACY ? legacy : null; this.k = makeK(mut, this.legacy); }
    this.initExtras(ctx); this.untouch = installTouch(this, ctx);
    camera.fov = ctx.baseFov; camera.near = 0.5; camera.far = 6000; camera.updateProjectionMatrix();
    post.suspendAO?.(true);
    state.phase = 4; state.playing = false; state.belly = 1; state.sealed = false; state.over = false; state.won = false; state.time = 0; state.pop = 0; state.slowmo = 1; state.shake = 0; state.hitstop = 0; state.slowT = state.slowDuration = 0; state.stun = 0; state.wound = 0;
    document.getElementById('hud').hidden = false; document.getElementById('hud').classList.add('p3');
    for (const id of ['stars', 'crave', 'card', 'defcon']) { const e = document.getElementById(id); if (e) e.hidden = true; }
    this.enterTier(Math.max(0, Math.min(TIERS.length - 1, num('tier', 1) - 1)));
    this.installDebug();
    try { this.U.sun.value.set(0.5, 0.8, 0.3).normalize(); this.placeCamera(0.016); await post.precompile(this.root, 12000); } catch (e) { console.warn('space precompile', e); }
    ctx.sfx.unlock?.(); ctx.sfx.space.start(); const wake = () => ctx.sfx.wake?.(); addEventListener('pointerdown', wake, { once: true }); addEventListener('keydown', wake, { once: true }); // (?space starts without a click: the first touch or key wakes the audio)
    state.playing = true;
    document.getElementById('load')?.setAttribute('hidden', '');
    ctx.card(`TIER ${this.tier.id}`, this.tier.name.toUpperCase());
    if (this.tierIdx === num('tier', 1) - 1 && (this.mut !== 'none' || this.legacy)) setTimeout(() => ctx.hint(`${this.mut !== 'none' ? MUTATORS[this.mut].name + ' · ' + MUTATORS[this.mut].blurb : ''}${this.mut !== 'none' && this.legacy ? ' · ' : ''}${this.legacy ? LEGACY[this.legacy].name : ''}`), 3600);
    setTimeout(() => ctx.hint(this.tierIdx === 0 ? 'Swallow what fits · bigger things are eaten from the rim' : this.tier.blurb), 1800);
  }

  /** A fresh field for tier i: the hole starts at r = 1 (its radius at the start of the tier, `unit` km). */
  enterTier(i) {
    const seed = num('seed', 7), tier = this.tier = TIERS[i]; this.tierIdx = i;
    const f = this.field = buildTier(tier, seed);
    this.bodies = f.bodies; this.total = f.total; this.eatenW = 0; this.r = 1; this.rT = 1; this.t = 0; this.chunks.length = 0; this.live = f.bodies.length;
    this.hx = tier.start[0]; this.hz = tier.start[1];
    const S = this.S; S.a.value.set(...tier.sky.a); S.b.value.set(...tier.sky.b); S.k.value = tier.sky.k; S.o.value.set(seed * 1.3, tier.id * 7.1, 0); this.sky?.bake();
    this.sunAt = tier.sun === 'key' ? this.field.key : tier.sun;
    this.phase = 'play'; this.sweepT = 0; this.tierGulps = 0; this.combo = 0; this.comboT = 0; this.boostT = 0; this.storm = null; this.stormT = 22 + this.t * 0; this.rnd = rng(seed * 31 + tier.id); this.rival = null; this.rivalT = 18 * this.k.rivalT; this.rivalHit = 0;
    this.ctx.state.tier = tier.id;
    this.rings.visible = this.bodies.some((b) => b.ring); // (no ring bodies in this tier: the ring mesh is not drawn at all)
    this.propUse = new Set(this.bodies.filter((b) => b.k === K.prop).map((b) => b.model)); // (a model this tier never uses is not drawn at all)
  }

  placeCamera(dt) {
    const { camera } = this.ctx, portrait = portraitK(camera.aspect);
    let want = BASE_DIST * this.ctx.LENS * portrait;
    for (const o of this.bodies) { // a body much bigger than the hole that we are inside: the camera climbs out of it
      if (o.state || o.b / this.r < 7 || o.k >= K.galaxy) continue; // (flat sprites do not engulf the camera)
      const dx = o.x - this.hx, dz = o.z - this.hz, d = Math.hypot(dx, dz) / this.r, b = o.b / this.r;
      if (d < b + 8) want = Math.max(want, (b * 1.25 + 2) * Math.min(1, (b + 8 - d) / 8));
    }
    this.camDist = this.camDist ? this.camDist + (want - this.camDist) * Math.min(1, dt * (want > this.camDist ? 2.5 : 1)) : want;
    const pitch = this.pitch = PITCH + (0.2 - PITCH) * this.pitchK, d = this.camDist * (1 + 0.35 * this.pitchK), hz = Math.cos(pitch) * d, st = this.ctx.state, tr = st.shake || 0, sh = tr * tr * d * 0.012;
    this.lead.x += ((this.ctx.hole.sx || 0) * 0.5 - this.lead.x) * Math.min(1, dt * 4); this.lead.y += ((this.ctx.hole.sz || 0) * 0.5 - this.lead.y) * Math.min(1, dt * 4);
    camera.position.set(this.lead.x + (sh ? Math.sin(this.t * 41) * sh : 0), Math.sin(pitch) * d, this.lead.y + hz);
    camera.up.set(0, 1, 0); camera.lookAt(this.lead.x, 0, this.lead.y - 0.16 * d); // (aimed ahead: the hole rides low in the frame)
    camera.near = Math.max(0.5, d * 0.03); camera.far = 6000;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }

  /** The hole's growth target in tier units, from progress. */
  progress() { return clamp01(this.eatenW / (this.total * this.tier.goal)); }

  frame(dt, ctx, controlDt = dt, moveDt = dt, cameraDt = controlDt) {
    const { state, post, renderer, hole } = ctx;
    if (!this.root) return;
    if (state.playing && !state.draft) for (let i = 0, n = this.sim || 1; i < n; i++) { state.time += dt; this.t += dt; this.step(dt, ctx, controlDt, moveDt); } // (?simx=N: N steps a frame, for the pacing runs)
    this.U.t.value = this.t; this.hole0 = hole;
    if (state.playing) ctx.sfx.space.set(Math.min(1, Math.hypot(hole.sx || 0, hole.sz || 0)), this.tier.id, this.nibS || 0);
    this.flashK = Math.max(0, this.flashK - cameraDt * 0.9); // (the tier-up's white-out always fades: it was the stuck white sky of every tier after the first)
    this.pitchK += ((this.phase === 'sweep' ? 1 : 0) - this.pitchK) * Math.min(1, cameraDt * (this.phase === 'sweep' ? 1.4 : 0.9));
    this.placeCamera(cameraDt);
    this.draw(ctx, dt);
    this.lens(ctx);
    this.drawHud(ctx);
    ctx.sparks.update(dt); ctx.debris.update(dt);
    ctx.news.update(dt, state.pop || 0, !!state.playing);
    if (!window.__headless) {
      if (document.visibilityState === 'visible' && !qs.has('nowatch')) post.watch(dt);
      const ts = ctx.fpsEl && performance.now();
      post.render([1, 1, 1]);
      if (ctx.fpsEl) ctx.perf.sub += performance.now() - ts;
    }
  }

  step(dt, ctx, controlDt, moveDt) {
    const { state, hole } = ctx, r = this.r, tier = this.tier;
    const [sx, sz] = this.phase === 'play' ? (qs.has('bot') ? this.autoSteer() : window.__bot ? window.__bot(hole, ctx.city) : ctx.steer()) : [0, 0];
    hole.sx = steerAxis(hole.sx || 0, sx, controlDt); hole.sz = steerAxis(hole.sz || 0, sz, controlDt);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    this.boostT = Math.max(0, this.boostT - dt);
    const sp = SPEED * r * this.k.speed * (state.mods?.speed ?? 1) * (this.boostT > 0 ? 1.6 : 1) * (this.pw('surge') ? 1.7 : 1) * (this.stunT > 0 ? 0.45 : 1);
    const dx = hole.sx * sp * moveDt, dz = hole.sz * sp * moveDt;
    this.hx += dx; this.hz += dz; hole.vx = moveDt > 0 ? dx / moveDt : 0; hole.vz = moveDt > 0 ? dz / moveDt : 0; hole.x = hole.z = 0;
    this.moved = (this.moved || 0) + Math.hypot(dx, dz) / r;
    // ---- the world moves
    const F = tier.field;
    for (const o of this.bodies) {
      if (o.state) continue;
      if (o.orbit) { const a = o.ang + o.om * this.t; o.x = Math.cos(a) * o.a; o.z = Math.sin(a) * o.a; }
      else if (o.vx || o.vz) { o.x += o.vx * dt; o.z += o.vz * dt; if (F && o.x * o.x + o.z * o.z > (F * 1.5) ** 2) { o.x -= 2 * o.x * 0.9; o.z -= 2 * o.z * 0.9; } } // (comets wrap round the solar tiers' field; the scale-aware fields just drift)
      o.spin += o.spinV * dt;
      if (o.eph && (o.eph -= dt) <= 0) { o.state = 2; this.live--; }
    }
    if (this.phase === 'play') { this.stormStep(dt, ctx); this.rivalStep(dt, ctx); } this.extrasStep(dt, ctx);
    // ---- the hole against the bodies
    let eatenNow = 0; this.nibS = 0;
    this.chunkT -= dt;
    for (const o of this.bodies) {
      if (o.state === 2) continue;
      if (o.state === 1) { // going down: spiral in, stretch, glow; paid at the bottom
        o.f += dt / o.T;
        if (o.f >= 1) { o.state = 2; this.pay(o, o.w * o.hp, ctx); eatenNow++; this.live--; }
        continue;
      }
      const ex = o.x - this.hx, ez = o.z - this.hz, d = Math.hypot(ex, ez), b = o.b;
      if (d > 8 * r + b && this.phase === 'play') continue;
      if (b <= 0.85 * r) {
        const reach = (this.pw('magnet') ? 5.6 : 2.6) * this.k.reach * r + b;
        if (d < reach && this.phase === 'play') { const k = 1 - Math.max(0, d - b) / reach, pull = (this.pw('magnet') ? 3.6 : 2.2) * r * k * k * dt; if (d > 1e-6) { o.x -= ex / d * pull; o.z -= ez / d * pull; o.orbit = false; o.vx = o.vz = 0; } }
        if (d < r + 0.15 * b) this.capture(o, ex, ez, d, r);
      } else if (d < b + 0.5 * r) { // too big to swallow: eaten from the rim, a chunk at a time
        const s = clamp01((b + 0.5 * r - d) / r), dh = Math.min(o.hp, NIB * (r / b) ** 2 * s * dt);
        if (dh > 0) {
          this.nibS = Math.max(this.nibS, s * Math.min(1, 0.25 * b / r)); o.hp -= dh; o.b = o.b0 * Math.cbrt(Math.max(o.hp, 0.02)); this.pay(o, o.w * dh, ctx, true);
          if (this.chunkT <= 0) { this.chunkT = 0.05; this.spawnChunk(o, ex, ez, d, r); }
          state.shake = Math.max(state.shake || 0, Math.min(0.3, 0.05 + 0.2 * (o.b / r) / 6));
        }
        if (o.hp <= 0.03) { o.state = 2; this.live--; if (o.key) this.keyDone = true; }
      }
    }
    // chunks fly to the hole
    for (let i = this.chunks.length - 1; i >= 0; i--) { const c = this.chunks[i]; c.f += dt / c.T; if (c.f >= 1) this.chunks.splice(i, 1); }
    // ---- growth: r eases toward its progress target (the world is lighter the bigger the hole is)
    const f = this.progress(), tgt = Math.pow(tier.growth, f);
    { const lr = Math.log(this.r), lt = Math.log(tgt), step = (lt - lr) * (1 - Math.exp(-dt * 2.2)); this.r = Math.exp(lr + Math.min(step, 0.45 * dt)); } // (log growth is capped: a flood of credit swells the hole over a few seconds, it does not snap)
    this.rT = tgt;
    state.pop = this.swallowed;
    if (this.phase === 'play' && (f >= 0.95 || this.keyDone)) this.finishTier(ctx); // (the last crumbs are swept in: a few percent of scattered food is not a chore)
    if (this.phase === 'sweep') this.sweep(dt, ctx);
    if (eatenNow > 3) state.shake = Math.max(state.shake || 0, 0.12);
    state.shake = Math.max(0, (state.shake || 0) - dt * 0.8);
  }

  capture(o, ex, ez, d, r) {
    o.state = 1; o.f = 0; o.d0 = Math.max(d, 1e-3) / r; o.a0 = Math.atan2(ez, ex); o.T = THREE.MathUtils.clamp(0.45 + 0.7 * Math.sqrt(o.b / r), 0.45, 1.3); o.rc = r;
  }

  spawnChunk(o, ex, ez, d, r) {
    if (this.chunks.length >= CHUNKS) return;
    const a = Math.atan2(ez, ex) + (Math.random() - 0.5) * 1.1, rad = r * (0.07 + 0.16 * Math.random()); // (bits are sized by the hole, not by what is being eaten)
    this.chunks.push({ a, d0: Math.min(d, o.b + 0.5 * r) / r + (Math.random() - 0.3) * 0.4, f: 0, T: 0.5 + Math.random() * 0.4, s: rad / r * (0.5 + Math.random()), A: o.A, B: o.B, spin: Math.random() * 6 });
  }

  /** Credit w (weight) toward the tier; `part`: a nibble (no gulp). */
  pay(o, w, ctx, part = false) {
    this.eatenW += this.k.pay * (this.pw('surge') ? 1.25 : 1) * w * (o.eph || o.storm ? 1 : Math.max(0.1, Math.min(1, (o.b0 / this.r) / 0.1) ** 0.8)); // (dust is worth less the bigger the hole is: no farming specks, and no runaway)
    if (part) return;
    this.swallowed++; this.tierGulps++;
    const { sfx, sparks } = ctx, big = Math.min(1, o.b / this.r);
    const play = this.phase === 'play';
    if (big > 0.06 && play) this.chain(ctx, o);
    if (o.storm && this.storm) this.storm.eaten++;
    if (big > 0.5 && play) ctx.sfx.space.gulpBig(Math.min(1, big));
    if (o.k === K.comet && play) { ctx.sfx.space.ion(); this.boostT = 4.5; ctx.hint('ION RUSH · faster for a moment'); ctx.state.shake = Math.max(ctx.state.shake || 0, 0.3); this.flare = 1.4; }
    if (big > 0.06 && this.t - (this.gulpT || -9) > 0.07) { this.gulpT = this.t; sfx.gulp(Math.min(8, 1 + Math.round(big * 6))); } // (dust is silent, and a swarm is not a machine gun)
    if (big > 0.06) sparks.burst(0, 0, 1, 0.3 + big);
    this.flare = Math.max(this.flare || 0, 0.35 + big);
    if (o.name && o.b >= 0.4 * this.r) ctx.news.say?.(`${o.name} is gone.`);
    if (o.model === 'monolith') { this.eatenW += this.total * this.tier.goal * 0.03; ctx.card('THE MONOLITH', 'IT WAS ALWAYS GOING TO BE EATEN'); ctx.sfx.space.victory?.(); }
    if (o.b > 0.4 * this.r) ctx.state.shake = Math.max(ctx.state.shake || 0, 0.25 + 0.3 * big);
  }

  /** Gulps within 1.8 s of each other chain: a rising count, a bonus every fifth, a kick on the camera. */
  chain(ctx, o) {
    this.comboT = 1.8 * this.k.chain; this.combo++;
    const n = this.combo;
    if (n >= 2) ctx.sfx.space.chain(n);
    if (n >= 3) { const el = document.getElementById('combo'); if (el) { el.textContent = `×${n} chain`; el.style.fontSize = `${Math.min(46, 18 + n * 1.6)}px`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); } }
    if (n % 5 === 0) {
      this.eatenW += this.total * this.tier.goal * Math.min(0.006, 0.002 + 0.0002 * n); this.flare = Math.max(this.flare || 0, 1.1);
      ctx.state.shake = Math.max(ctx.state.shake || 0, 0.22); ctx.sfx.gulp(0);
      if (n === 10 || n === 25) ctx.card(`${n} CHAIN`, n === 10 ? 'FEEDING FRENZY' : 'UNSTOPPABLE');
    }
  }

  /** A meteor storm every 35-60 s: a stream of rocks through the hole's neighbourhood. Eat most of it for a bonus. */
  stormStep(dt, ctx) {
    const rnd = this.rnd, r = this.r, st = this.storm;
    if (st) {
      st.t -= dt;
      if (st.t <= 0) {
        this.storm = null; this.stormT = 35 + rnd() * 25;
        if (st.eaten >= st.n * 0.55) { this.stats.storms++; this.eatenW += this.total * this.tier.goal * 0.015; this.flare = 1.6; ctx.card('STORM DEVOURED', `${st.eaten} rocks · bonus`); ctx.sfx.levelUp?.(); }
      }
      return;
    }
    if ((this.stormT -= dt) > 0) return;
    const n = 34, a = rnd() * TAU, sp = 2.3 * r, dx = Math.cos(a), dz = Math.sin(a), off = (rnd() - 0.5) * 5 * r, cx = this.hx + dx * 16 * r - dz * off, cz = this.hz + dz * 16 * r + dx * off;
    for (let i = 0; i < n; i++) { // a ragged stream: sizes 0.08-0.7 r, spread across and along the line
      const along = (rnd() - 0.5) * 5 * r, across = (rnd() - 0.5) * 9 * r, b = r * (0.08 + 0.62 * rnd() ** 1.6);
      const o = looseRock(rnd, b, cx - dx * along - dz * across, cz - dz * along + dx * across, -dx * sp * (0.8 + 0.4 * rnd()), -dz * sp * (0.8 + 0.4 * rnd()), 14);
      o.storm = true; o.w = this.total * this.tier.goal * 0.001 * (0.5 + b / r); this.bodies.push(o); this.live++; // (a storm pays a share of the tier, not by size: it must not swamp the pacing)
    }
    this.storm = { n, eaten: 0, t: 13 };
    ctx.card('METEOR STORM', 'FEAST'); ctx.sfx.space.storm();
  }

  /**
   * A rival hole (from about a third of the way through a tier): it eats the bodies you want, grows, and when it is bigger than you it hunts you. A bite costs a little progress and shoves you
   * clear (never more: no dead ends); when you are bigger you can eat it for a big payout. After it is eaten it is back, smaller, in about 40 s.
   */
  rivalStep(dt, ctx) {
    const r = this.r, rnd = this.rnd, R = this.rival;
    if (this.k.noRival) return;
    if (!R) {
      if ((this.rivalT -= dt) > 0 || this.progress() < 0.3) return;
      const a = rnd() * TAU, d = 15 * r;
      this.rival = { x: this.hx + Math.cos(a) * d, z: this.hz + Math.sin(a) * d, b: r * (this.rivalN ? 0.55 : 0.8) * this.k.rivalSize, vx: 0, vz: 0, hit: 0 };
      this.rivalN = (this.rivalN || 0) + 1;
      ctx.card('RIVAL HOLE', this.rival.b > r ? 'IT HUNTS YOU' : 'EAT IT BEFORE IT GROWS'); ctx.sfx.rivalGrowl?.();
      return;
    }
    // it grows slowly and feeds on what it touches
    R.b *= 1 + dt * 0.012;
    const rx = this.hx - R.x, rz = this.hz - R.z, dp = Math.hypot(rx, rz), bigger = R.b > r * 1.12, smaller = r > R.b * 1.15;
    let tx = 0, tz = 0, best = 1e18;
    if (R.flee > 0) { R.flee -= dt; tx = -rx; tz = -rz; best = 0; } // (after a bite it is fed and backs off)
    else if (bigger && dp < 14 * r) { tx = rx; tz = rz; best = 0; }
    else if (smaller && dp < 7 * r) { tx = -rx; tz = -rz; best = 0; } // (it runs from a bigger player)
    else for (const o of this.bodies) {
      if (o.state || o.b > 0.85 * R.b) continue;
      const dx = o.x - R.x, dz = o.z - R.z, d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; tx = dx; tz = dz; }
    }
    const tl = Math.hypot(tx, tz) || 1, sp = 0.55 * this.k.rivalSpeed * R.b; // (slower than you: it can always be outrun)
    R.vx += (tx / tl * sp - R.vx) * Math.min(1, dt * 2.5); R.vz += (tz / tl * sp - R.vz) * Math.min(1, dt * 2.5);
    R.x += R.vx * dt; R.z += R.vz * dt;
    for (const o of this.bodies) { // it eats
      if (o.state || o.b > 0.85 * R.b || o.k >= K.galaxy && o.b > 0.5 * R.b) continue;
      const dx = o.x - R.x, dz = o.z - R.z;
      if (dx * dx + dz * dz < (R.b + 0.15 * o.b) ** 2) { o.state = 2; this.live--; R.b *= 1 + 0.5 * (o.b / R.b) ** 2 * 0.2; }
    }
    R.b = Math.min(Math.max(R.b, 0.5 * r), 1.35 * r); // (it keeps pace with you: never a runaway, never a speck)
    R.hit -= dt;
    if (bigger && dp < R.b + 0.3 * r && R.hit <= 0 && !this.pw('shield')) { // it bites: a little progress lost, a shove
      R.hit = 4; this.stats.bites++; ctx.sfx.rivalBite?.(); navigator.vibrate?.([60, 40, 90]); this.eatenW = Math.max(0, this.eatenW - this.total * this.tier.goal * 0.03 * this.k.bite);
      const k = (3 * r) / (dp || 1); this.hx += rx * k; this.hz += rz * k; ctx.state.shake = Math.max(ctx.state.shake || 0, 0.7); ctx.hint('The rival bit you · grow bigger than it'); R.bites = (R.bites || 0) + 1; R.flee = 6; R.b *= 0.85; if (R.bites >= 2) { this.rival = null; this.rivalT = 45; ctx.card('THE RIVAL LEAVES', 'IT WILL BE BACK'); }
    }
    if (smaller && dp < r * 0.7) { // you eat it
      this.rival = null; this.rivalT = 40 * this.k.rivalT; this.eatenW += this.total * this.tier.goal * 0.04 * this.k.rivalPay; this.flare = 1.8; ctx.state.shake = Math.max(ctx.state.shake || 0, 0.6);
      ctx.card('RIVAL EATEN', 'YOU ARE THE VOID'); ctx.sfx.rivalEaten?.(); navigator.vibrate?.(120); this.chain(ctx, { b: r }); this.swallowed++; this.stats.rivalsEaten++;
    }
  }

  finishTier(ctx) {
    this.stats.tierTimes.push(this.t); this.stats.tierGulps.push(this.tierGulps);
    this.phase = 'sweep'; this.sweepT = 0;
    const last = this.tierIdx + 1 >= TIERS.length;
    ctx.card('TIER COMPLETE', this.tier.name.toUpperCase());
    ctx.sfx.space.tierUp(this.tierIdx + 1); navigator.vibrate?.([40, 30, 40, 30, 140]);
    this.last = last;
  }

  /** What is left is pulled in, nearest first, and the next tier is laid out under a flash. */
  sweep(dt, ctx) {
    this.sweepT += dt;
    const T = this.sweepT;
    for (const o of this.bodies) {
      if (o.state) continue;
      const ex = o.x - this.hx, ez = o.z - this.hz, d = Math.hypot(ex, ez) / this.r;
      if (T > d * 0.045) { o.b = Math.min(o.b, 0.8 * this.r); this.capture(o, ex, ez, d * this.r, this.r); o.T = 0.5 + Math.random() * 0.5; }
    }
    this.r += (Math.pow(this.tier.growth, 1) - this.r) * (1 - Math.exp(-dt * 2));
    if (T > 3.2 && !this.swapped) { this.swapped = true; this.flashK = 1; }
    if (this.swapped) {
      if (this.flashK < 0.6 && !this.entered) {
        this.entered = true;
        if (this.last) this.end(ctx);
        else { this.enterTier(this.tierIdx + 1); ctx.card(`TIER ${this.tier.id}`, this.tier.name.toUpperCase()); ctx.hint(this.tier.blurb); }
        this.swapped = this.entered = false; this.keyDone = false;
      }
    }
  }

  /** The end of the content that exists so far (slice 1: the solar system). */
  end(ctx) {
    ctx.sfx.space.victory(); this.phase = 'end'; ctx.state.playing = false; ctx.state.won = true; this.puEl?.replaceChildren();
    const again = (pick) => { const u = new URL(location.href); u.search = `?space&seed=${Math.floor(Math.random() * 9e5) + 1000}${pick ? `&legacy=${pick}` : ''}${/[?&]bot\b/.test(location.search) ? '&bot' : ''}`; location.href = u.href; }; // (a new universe: the big bang)
    this.endEl = showSpaceResults(this, ctx, { onAgain: again, onMenu: () => ctx.toMenu() });
  }

  /** A greedy bot for pacing runs (?bot): the best body that fits per unit of distance, else the biggest nibble. */
  autoSteer() {
    const r = this.r; let best = null, bs = 0;
    { const it = this.pu?.item; if (it) { const ex = it.x - this.hx, ez = it.z - this.hz, d = Math.hypot(ex, ez); if (d < 22 * r) return [ex / d, ez / d]; } } // (the bot grabs power-ups)
    { const R = this.rival; if (R) { const rx = this.hx - R.x, rz = this.hz - R.z, d = Math.hypot(rx, rz); if (R.b > r * 1.1 && d < 5 * r) return [rx / d, rz / d]; if (r > R.b * 1.2 && d < 25 * r) return [-rx / d, -rz / d]; } } // (flee a bigger rival, chase a smaller one)
    for (const o of this.bodies) {
      if (o.state) continue;
      const ex = o.x - this.hx, ez = o.z - this.hz, d = Math.hypot(ex, ez) + 0.5 * r;
      const fits = o.b <= 0.85 * r, eff = Math.max(0.1, Math.min(1, (o.b0 / r) / 0.1) ** 0.8), s = (fits ? o.w * eff : o.w * 0.4 * Math.min(1, (r / o.b) ** 2)) / (d / r + 1) ** 1.6;
      if (s > bs) { bs = s; best = [ex, ez, d]; }
    }
    if (!best) return [0, 0];
    return [best[0] / best[2], best[1] / best[2]];
  }

  // ------------------------------------------------------------------------------------------------ drawing
  draw(ctx, dt) {
    const r = this.r, hi = this.hi, lo = this.lo, ir = 1 / r;
    let nh = 0, nl = 0, nt = 0, nr = 0, ng = 0, ngl = 0, nb = 0; const cnt = {};
    const sun = this.sunAt; let sx = 0, sz = 0;
    if (Array.isArray(sun)) { sx = sun[0]; sz = sun[1]; } else if (sun) { sx = sun.x; sz = sun.z; }
    // the light: from the sun's side, in view space
    _c.set(sx - this.hx, 0, sz - this.hz); if (_c.lengthSq() < 1e-6) _c.set(0.5, 0.5, 0.3); _c.y = Math.max(0.35 * _c.length(), 12); _c.normalize().transformDirection(ctx.camera.matrixWorldInverse);
    this.U.sun.value.copy(_c);
    const put = (mesh, bm, idx, kind, o, px, pz, s3, sy, sz2, yaw, heat, spinTilt = true) => {
      const at = bm.aT.array, aa = bm.aA.array, ab = bm.aB.array;
      _p.set(px, 0, pz);
      if (spinTilt) { _e.set(o.k === K.rock || o.k === K.comet ? 0.35 * Math.sin(o.id) : -Math.PI / 2 + 0.5 * Math.sin(o.id), o.spin, 0.45 * Math.cos(o.id * 1.7)); _q.setFromEuler(_e); } // (a world's pole points up the screen, tilted: its bands read as bands) else _q.setFromAxisAngle(_y, yaw);
      _s.set(s3, sy, sz2);
      _m.compose(_p, _q, _s); mesh.setMatrixAt(idx, _m);
      const i = idx * 4;
      at[i] = kind; at[i + 1] = (o.id * 0.137) % 7; at[i + 2] = o.p1; at[i + 3] = o.p2;
      aa[i] = o.A[0]; aa[i + 1] = o.A[1]; aa[i + 2] = o.A[2]; aa[i + 3] = 1;
      ab[i] = o.B[0]; ab[i + 1] = o.B[1]; ab[i + 2] = o.B[2]; ab[i + 3] = heat;
    };
    _pm.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
    for (const o of this.bodies) {
      if (o.state === 2) continue;
      let px, pz, s = o.b * ir, sy, sz2, yaw = 0, heat = 0, tilt = true, sx2 = o.b * ir;
      if (o.state === 1) { // spaghettification: along the line to the hole, thinner and longer, spiralling, hotter
        const f = o.f, e = f * f, dist = o.d0 * Math.pow(1 - f, 1.7) * (o.rc / r), ang = o.a0 + 5 * e;
        px = Math.cos(ang) * dist; pz = Math.sin(ang) * dist; const st = 1 + 5 * e; sy = s / Math.sqrt(st) * (1 - 0.7 * e * f); sx2 = s * st * (1 - 0.5 * f * f); sz2 = sy; yaw = -(ang + Math.PI / 2 * 0); heat = e; tilt = false;
        s = sx2;
      } else {
        px = (o.x - this.hx) * ir; pz = (o.z - this.hz) * ir;
        _sp.center.set(px, 0, pz); _sp.radius = s * (o.ring ? 2.4 : o.k === K.prop ? 3.6 : 1.6) + (o.k === K.comet ? o.tail * 1.5 : 0); if (!_fr.intersectsSphere(_sp)) continue;
        sy = sz2 = s;
      }
      if (o.pulse) heat = Math.max(heat, o.pulse);
      if (s < 0.008 && o.state === 0) continue;
      if (o.k === K.prop) { // a Blender prop: its own small instanced mesh, drawn at full capacity (spares collapsed)
        const pm = this.props[o.model]; if (!pm || (cnt[o.model] | 0) >= pm.instanceMatrix.count) continue;
        const base = PROPS[o.model] || [0, 0];
        if (o.state === 1) { _q.setFromAxisAngle(_y, yaw); _s.set(sx2, sy, sz2); } else { _e.set(base[0] + 0.25 * Math.sin(o.id), o.spin * 0.6 + base[1], 0.3 * Math.cos(o.id * 1.3)); _q.setFromEuler(_e); _s.set(s, s, s); }
        _p.set(px, 0, pz); _m.compose(_p, _q, _s); pm.setMatrixAt(cnt[o.model] = (cnt[o.model] | 0), _m); cnt[o.model]++;
        if ((o.model === 'dyson' || o.model === 'neutron_star') && ngl < CAPG - 2) { // the light inside: a glare behind the model
          const gi = ngl * 4, gs = s * (o.model === 'dyson' ? 2.6 : 3.4), ga = this.glow.aC.array; _p.set(px, -0.01, pz); _q.identity(); _s.set(gs, 1, gs); _m.compose(_p, _q, _s); this.glow.mesh.setMatrixAt(ngl, _m);
          const c = o.model === 'dyson' ? [1.0, 0.82, 0.5] : [0.55, 0.75, 1.0]; ga[gi] = c[0]; ga[gi + 1] = c[1]; ga[gi + 2] = c[2]; ga[gi + 3] = (o.model === 'dyson' ? 0.9 : 1.4) * (1 + 2 * heat) / (1 + 0.004 * s * s); ngl++;
        }
        continue;
      }
      if (o.k >= K.galaxy) { // a galaxy or a nebula: a tilted sprite, additive
        if (ng >= CAPG - 2) continue;
        const gA = this.gal.aT.array, gC = this.gal.aC.array, gi = ng * 4;
        if (o.state === 1) { _q.setFromAxisAngle(_y, yaw); _s.set(2 * sx2, 1, 2 * sz2); } else { _e.set(o.tilt || 0, o.spin * 0.05, 0); _q.setFromEuler(_e); _s.set(2 * s, 1, 2 * s); }
        _p.set(px, 0, pz); _m.compose(_p, _q, _s); this.gal.mesh.setMatrixAt(ng, _m);
        gA[gi] = o.k === K.cloud ? 3 : o.tile; gA[gi + 1] = (o.k === K.cloud ? 0.55 : 1) * (1 + 2.5 * heat) / (1 + 0.03 * s * s); gC[gi] = o.A[0]; gC[gi + 1] = o.A[1]; gC[gi + 2] = o.A[2]; ng++; // (a sprite much bigger than the view stacks to white: its surface brightness falls with its size)
        continue;
      }
      if ((o.k === K.star || o.k === K.cluster) && s > 0.012 && ngl < CAPG - 2) { // glare, behind the disc
        const gi = ngl * 4, gs = s * (o.k === K.star ? 1.3 + 3 / (1 + s) : 3.0 / (1 + 0.1 * s)), bright = (o.k === K.star ? 1.0 : 0.7) * (1 + 2 * heat) / (1 + 0.004 * s * s);
        _p.set(px, -0.01, pz); _q.identity(); _s.set(gs, 1, gs); _m.compose(_p, _q, _s); this.glow.mesh.setMatrixAt(ngl, _m);
        const ga = this.glow.aC.array; ga[gi] = o.A[0]; ga[gi + 1] = o.A[1]; ga[gi + 2] = o.A[2]; ga[gi + 3] = bright; ngl++;
      }
      if ((o.k === K.world || o.k === K.giant) && s > 0.04 && ngl < CAPG - 2) { // atmosphere
        const gi = ngl * 4, gs = s * 2.5, ga = this.glow.aC.array; _p.set(px, -0.01, pz); _q.identity(); _s.set(gs, 1, gs); _m.compose(_p, _q, _s); this.glow.mesh.setMatrixAt(ngl, _m);
        const c = o.k === K.world ? [0.45, 0.65, 1.0] : o.A; ga[gi] = c[0]; ga[gi + 1] = c[1]; ga[gi + 2] = c[2]; ga[gi + 3] = -(o.k === K.world ? 0.9 : 0.5) / (1 + 0.01 * s * s); ngl++;
      }
      const small = s < 0.05, huge = s > 5 && nb < 12;
      if (o.k === K.comet && o.state === 0 && nt < CAPT) { // the tail, away from the sun
        let tx = o.x - sx, tz = o.z - sz; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const len = o.tail * 1.0 * (o.b * ir + 0.15) * 10 * Math.min(1, 2.5 * ir ** 0.3), wid = Math.max(0.25, o.b * ir * 6);
        _p.set(px, 0, pz); _q.setFromAxisAngle(_y, -Math.atan2(tz, tx)); _s.set(len, 1, wid); _m.compose(_p, _q, _s); this.tails.setMatrixAt(nt++, _m);
      }
      if (o.ring && o.state === 0 && nr < CAPR) { _p.set(px, 0, pz); _e.set(0.38, o.spin * 0.02, 0.1); _q.setFromEuler(_e); const rs = s * 2.25; _s.set(rs, rs, rs); _m.compose(_p, _q, _s); this.rings.setMatrixAt(nr++, _m); }
      if (huge) put(this.bg, this.bmBg, nb++, o.k, o, px, pz, s, sy, sz2, yaw, heat, tilt);
      else if (small && nl < CAP - CHUNKS - 4) put(lo, this.bmLo, nl++, o.k, o, px, pz, s, sy, sz2, yaw, heat, tilt);
      else if (nh < CAP - CHUNKS - 4) put(hi, this.bmHi, nh++, o.k, o, px, pz, s, sy, sz2, yaw, heat, tilt);
    }
    // the nibbled bits
    for (const c of this.chunks) {
      const f = c.f, e = f * f, dist = c.d0 * (1 - f) ** 1.5, ang = c.a + 3 * e, s = c.s * (1 - 0.6 * f);
      _p.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist); _q.setFromAxisAngle(_y, -ang); _s.set(s * (1 + 3 * e), s, s); _m.compose(_p, _q, _s); hi.setMatrixAt(nh, _m);
      const at = this.bmHi.aT.array, aa = this.bmHi.aA.array, ab = this.bmHi.aB.array, i = nh * 4; at[i] = 0; at[i + 1] = c.spin; at[i + 2] = 2; at[i + 3] = 0; aa[i] = c.A[0]; aa[i + 1] = c.A[1]; aa[i + 2] = c.A[2]; aa[i + 3] = 1; ab[i] = c.B[0]; ab[i + 1] = c.B[1]; ab[i + 2] = c.B[2]; ab[i + 3] = e;
      nh++;
    }
    hi.count = nh; lo.count = nl; this.bg.count = nb; this.bg.instanceMatrix.needsUpdate = true; this.hideRest(this.tails, nt, CAPT); this.hideRest(this.rings, nr, CAPR); for (const k in this.props) { const pm = this.props[k]; pm.visible = this.propUse.has(k); if (pm.visible) this.hideRest(pm, cnt[k] | 0, pm.instanceMatrix.count); this.props[k].instanceMatrix.needsUpdate = true; } this.gal.mesh.count = ng; ngl = this.extrasDraw(ctx, ir, ngl); this.glow.mesh.count = ngl; this.glow.mesh.instanceMatrix.needsUpdate = true; this.glow.aC.needsUpdate = true; this.gal.mesh.instanceMatrix.needsUpdate = true; this.gal.aT.needsUpdate = this.gal.aC.needsUpdate = true;  // (tails and rings draw their full capacity, the spare instances collapsed: the WebGPU backend sizes an instance buffer from the first non-zero count it sees)
    for (const o of [hi, lo, this.tails, this.rings]) o.instanceMatrix.needsUpdate = true;
    for (const bm of [this.bmHi, this.bmLo, this.bmBg]) bm.aT.needsUpdate = bm.aA.needsUpdate = bm.aB.needsUpdate = true;
    // dust: stream past the hole
    const P = this.dust.geometry.attributes.position, a = P.array, mx = this.moved || 0;
    if (mx) {
      const hs = ctx.hole, ddx = (this.lastHx ?? this.hx) - this.hx, ddz = (this.lastHz ?? this.hz) - this.hz;
      for (let i = 0; i < a.length; i += 3) { a[i] += ddx * ir; a[i + 2] += ddz * ir; a[i] = ((a[i] + 35) % 70 + 70) % 70 - 35; a[i + 2] = ((a[i + 2] + 35) % 70 + 70) % 70 - 35; }
      P.needsUpdate = true;
    }
    this.lastHx = this.hx; this.lastHz = this.hz; this.moved = 0;
    { const k = 0.0004 / Math.max(1, Math.log2(r + 1)); _e.set(this.hz * k, this.hx * k, 0); _m.makeRotationFromEuler(_e); this.sky.rot.value.setFromMatrix4(_m); } // (parallax: the stars turn a little as the hole travels)
    { // the rival hole
      const R = this.rival, on = !!R && this.phase === 'play';
      this.rbh.visible = this.rhalo.visible = on;
      if (on) {
        const rs = R.b * ir; this.rbh.position.set((R.x - this.hx) * ir, 0, (R.z - this.hz) * ir); this.rbh.scale.setScalar(rs);
        this.rhalo.position.copy(this.rbh.position); this.rhalo.scale.setScalar(rs * 2.2); this.rhalo.quaternion.copy(ctx.camera.quaternion); this.rhalo.material.userData.U.uA.value = 0.35; this.rhalo.material.userData.U.uT.value = this.t;
      }
    }
    // the hole itself
    this.bh.scale.setScalar(1); const hU = this.bh.material.userData.U, ha = this.halo.material.userData.U;
    this.flare = Math.max(0, (this.flare || 0) - dt * 2.4);
    hU.uHeat.value = this.flare; hU.uT.value = this.t; ha.uHeat.value = this.flare; ha.uT.value = this.t;
    this.halo.scale.setScalar(2.4); this.halo.quaternion.copy(ctx.camera.quaternion); this.halo.material.userData.U.uA.value = 0.5;
  }

  /** Collapse instances n..cap-1 to a zero-size matrix (they are drawn but cover nothing). */
  hideRest(mesh, n, cap) {
    const a = mesh.instanceMatrix.array;
    for (let i = n; i < cap; i++) a.fill(0, i * 16, i * 16 + 16);
    mesh.count = cap;
  }

  /** Lens, shadow and accretion disk: the finale's black hole, as the player's avatar (src/blackhole.js, post.js). */
  lens(ctx) {
    const { camera, post } = ctx, L = post.lens, off = qs.has('nolens');
    _c.set(0, 0, 0).project(camera);
    const d = camera.position.length(), th = Math.asin(Math.min(0.99, 1 / d)), rs = 0.5 * Math.tan(th) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    L.A.value.set(_c.x * 0.5 + 0.5, 0.5 - _c.y * 0.5, rs, off ? 0 : 1); L.P.value.set(num('ths', 0.7), 1, 0, 0); // (exact Schwarzschild deflection for the sky; ths = how close the camera is, in shadow radii of sky)
    L.B.value.set(0.3 - 0.16 * this.pitchK, 0, this.t * 0.5, off ? 0 : 0.95 + 0.3 * this.pitchK); // (the tier-up swings the camera low: the disk bends over the top and under the shadow, the Interstellar picture)
    L.C.value.set(1.3, 3.1, 0.62, 1.0);
    post.fxu.value.set(0, 0, 0, 0);
    if (this.flashK > 0) post.fxu.value.set(Math.min(1, this.flashK) * 0.9, 0, 0, 1);
  }

  drawHud(ctx) {
    const { state, hole } = ctx;
    if (state.playing === false && this.phase !== 'sweep') return;
    if ((this.hud.t -= 1) > 0) return; this.hud.t = 6;
    const el = (id) => document.getElementById(id), tier = this.tier, f = this.progress();
    el('size').innerHTML = `${tier.name} · <b>${km(this.r * tier.unit)}</b> · tier ${tier.id}/${TIERS.length}`;
    el('eaten').hidden = false; el('eaten').innerHTML = `<b>${this.swallowed.toLocaleString('en')}</b> swallowed`;
    const key = this.field.key;
    el('left').hidden = false; el('left').innerHTML = key && !key.state ? `${key.name} <b>${Math.round(key.hp * 100)}%</b> left · tier <b>${Math.round(f * 100)}%</b>` : `Tier <b>${Math.round(f * 100)}%</b> devoured`;
    this.extrasHud();
    el('hunger').style.width = `${f * 100}%`; el('hunger').parentElement.classList.remove('low');
    // the arrow: the nearest worthwhile body
    let b = null, bs = 0;
    for (const o of this.bodies) { if (o.state) continue; const ex = o.x - this.hx, ez = o.z - this.hz, d = Math.hypot(ex, ez) / this.r; if (d < 6) continue; const s = o.w / (1 + d) ** 1.6; if (s > bs) { bs = s; b = [ex / this.r, ez / this.r, o]; } }
    ctx.edgeArrow('town', b && [b[0], b[1]], b ? b[2].name || '' : '', '#9ed9bf');
  }

  installDebug() {
    const self = this;
    window.__space = {
      get r() { return self.r; }, get tier() { return self.tier.id; }, get progress() { return self.progress(); }, bodies: () => self.bodies, game: self,
      tierTo: (n) => { self.devUsed = true; self.enterTier(n - 1); }, power: (k) => { self.devUsed = true; self.takePower(k, self.ctx); }, flareNow: () => { self.flareT = 0; }, rivalNow: () => { self.devUsed = true; self.rivalT = 0; self.eatenW = Math.max(self.eatenW, self.total * self.tier.goal * 0.31); }, results: () => { self.devUsed = true; self.end(self.ctx); }, setProgress: (p) => { self.devUsed = true; self.eatenW = p * self.total * self.tier.goal; }, tp: (x, z) => { self.devUsed = true; self.hx = x; self.hz = z; },
      stats: () => ({ t: self.ctx.state.time, tier: self.tier.id, r: self.r, p: self.progress(), swallowed: self.swallowed, live: self.live, chunks: self.chunks.length, hi: self.hi.count, lo: self.lo.count }),
    };
  }

  leave(ctx) {
    this.endEl?.remove(); this.disposeExtras(); this.untouch?.(); ctx.sfx.space.stop();
    const { scene, camera, look, post } = ctx, s = this.saved;
    scene.remove(this.root);
    for (const o of this.root.children) { o.geometry?.dispose(); o.material?.dispose(); }
    this.sky.dispose();
    scene.background = s.bg; scene.fogNode = s.fog; scene.environmentIntensity = s.env; camera.near = s.near; camera.far = s.far; camera.updateProjectionMatrix(); look.sky.visible = s.sky; look.envSky.visible = s.envSky;
    post.lens.A.value.w = 0; post.fxu.value.set(0, 0, 0, 0);
    this.root = null;
  }
}

Object.assign(SpaceGame.prototype, extraMethods); // (hazards, power-ups: src/space/extras.js)
