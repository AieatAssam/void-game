// The planet as a drawable: bake driver (workers, with a chunked main-thread fallback), the cube-sphere globe, `planetMaterial`
// (land / ocean / lighting / night lights / clouds / aerial haze / wound / hole caps), the atmosphere shell, stars and the Moon.
// Everything lives in PLANET space with a unit-radius globe (mesh.scale = R metres). The group is what a game places and rotates:
//   globe.group.quaternion.copy(holeQ).invert(); globe.group.position.set(0, -(R + h0), 0);   (invert() mutates: copy first)
// Lighting, haze and glint are computed in planet space from `uSun` (planet space) and `uCam` (the camera in planet units),
// both refreshed by globe.update(camera), so a rotated group is automatically right.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, int, uniform, texture, attribute, positionGeometry, positionLocal, normalize, dot, cross, length, sqrt, exp,
  pow, max, min, abs, atan, acos, mix, smoothstep, clamp, select, step, sin, mx_noise_float, mx_noise_vec3,
  mx_fractal_noise_float, mx_worley_noise_float, mx_cell_noise_vec3, instancedBufferAttribute, uv, cameraPosition,
  floor, fract, If, Discard, positionWorld, dFdx, dFdy, fwidth, sign,
} from 'three/tsl';
import { makePlanet, bakeRows, faceDir, dirFace, R, SQ_MIN, SQ_STEP, decodeHeight } from './planetgen.js';
import { MAX_HOLES } from './hole.js';
import { bakeGroundTextures, FIELD_TILE, CANOPY_TILE, URBAN_TILE, RELIEF_TILE, RELIEF_GMAX, NOISE_TILE } from './groundtex.js';

export { R, faceST, sampleFace, sstep, srgb, heightOf }; // (planetmap.js reuses the face sampling and palette helpers)
const PI = Math.PI;
const DBG = typeof location !== 'undefined' ? +(new URLSearchParams(location.search).get('dbg') || 0) : 0; // dev: ?dbg=1 albedo, 2 normal, 3 terrain occlusion / shadow, 4 sun term, 5 pxM
const OFF = new Set((typeof location !== 'undefined' && new URLSearchParams(location.search).get('off')?.split(',')) || []); // dev: ?off=ground,atmo,cloud,wound,wave,fine to price each part

// ---------------------------------------------------------------- bake
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Bake the `surf` (6 x N x N RGBA8) and `night` (6 x N x N RG8) arrays for a seed. Workers first (faces split across up to 3),
 * the main thread in ~8 ms chunks if Worker is unavailable or errors. Returns { surf, night, N, ms, mode }.
 */
export async function bakePlanet(seed, N = 512, { workers = true } = {}) {
  const t0 = performance.now(), faceLen = N * N;
  const surf = new Uint8Array(6 * faceLen * 4), night = new Uint8Array(6 * faceLen * 2);
  const done = (mode) => { const ms = performance.now() - t0; window.__planetBakeMs = ms; console.info(`planet bake: ${ms.toFixed(0)} ms (${mode})`); return { surf, night, N, ms, mode }; };
  if (workers && typeof Worker !== 'undefined') {
    try {
      const nw = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
      const ws = [], got = new Set();
      await new Promise((resolve, reject) => {
        for (let w = 0; w < nw; w++) {
          const wk = new Worker(new URL('./planet.worker.js', import.meta.url), { type: 'module' });
          ws.push(wk);
          wk.onerror = (e) => reject(new Error(e.message || 'planet worker failed'));
          wk.onmessage = (ev) => {
            const { face, surf: s, night: n } = ev.data;
            surf.set(new Uint8Array(s), face * faceLen * 4);
            night.set(new Uint8Array(n), face * faceLen * 2);
            got.add(face);
            if (got.size === 6) resolve();
          };
          wk.postMessage({ seed, N, faces: [0, 1, 2, 3, 4, 5].filter((f) => f % nw === w) });
        }
      }).finally(() => ws.forEach((w) => w.terminate()));
      return done(`${nw} workers`);
    } catch (e) { console.warn('planet worker unavailable, baking on the main thread', e); }
  }
  const P = makePlanet(seed);
  for (let f = 0; f < 6; f++) {
    const s = new Uint8Array(faceLen * 4), n = new Uint8Array(faceLen * 2);
    for (let j = 0; j < N;) { // chunks of rows, ~8 ms each
      const t = performance.now();
      while (j < N && performance.now() - t < 8) { bakeRows(P, f, N, j, j + 4, s, n); j += 4; }
      await tick();
    }
    surf.set(s, f * faceLen * 4); night.set(n, f * faceLen * 2);
  }
  return done('main thread');
}

const dataArray = (data, N, depth, format, filter = THREE.LinearFilter) => {
  const t = new THREE.DataArrayTexture(data, N, N, depth);
  t.format = format; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = filter;
  t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
};

// ---------------------------------------------------------------- geometry
/** 6 x n x n quads, unit radius, tan-warped; `aH` = height (m, ocean 0) for the vertex displacement. */
export function cubeSphere(n, surf, N) {
  const v1 = n + 1, count = 6 * v1 * v1, pos = new Float32Array(count * 3), aH = new Float32Array(count), idx = new Uint32Array(6 * n * n * 6);
  const d = { x: 0, y: 0, z: 0 };
  const hAt = (f, s, t) => { // bilinear height from the bake (texel centres lie on the face edge)
    const x = (s * 0.5 + 0.5) * (N - 1), y = (t * 0.5 + 0.5) * (N - 1), x0 = Math.min(N - 2, Math.floor(x)), y0 = Math.min(N - 2, Math.floor(y)), fx = x - x0, fy = y - y0;
    const g = (i, j) => surf[((f * N + j) * N + i) * 4];
    const b = g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
    return Math.max(0, decodeHeight(b));
  };
  let k = 0, ii = 0;
  for (let f = 0; f < 6; f++) {
    const base = k;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++, k++) {
      const s = (i / n) * 2 - 1, t = (j / n) * 2 - 1;
      faceDir(f, s, t, d);
      pos[k * 3] = d.x; pos[k * 3 + 1] = d.y; pos[k * 3 + 2] = d.z;
      aH[k] = surf ? hAt(f, s, t) : 0;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = base + j * v1 + i, b = a + 1, c = a + v1, e = c + 1; // CCW seen from outside (right x up = fwd on every face)
      idx[ii++] = a; idx[ii++] = b; idx[ii++] = c; idx[ii++] = b; idx[ii++] = e; idx[ii++] = c;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01);
  return g;
}

// ---------------------------------------------------------------- shader pieces
const srgb = (r, g, b) => vec3(r, g, b).pow(2.2); // palette authored in sRGB
// smoothstep that also accepts reversed numeric edges (WGSL leaves smoothstep(a, b, x) with a >= b undefined)
const sstep = (a, b, x) => (typeof a === 'number' && typeof b === 'number' && a > b ? float(1).sub(smoothstep(b, a, x)) : smoothstep(a, b, x));
const heightOf = (s) => { const x = s.mul(255 * SQ_STEP).sub(SQ_MIN); return x.mul(abs(x)); }; // (the decodeHeight of planetgen.js)

/** Direction -> (s, t, face) of the tan-warped cube (the same mapping as planetgen.faceDir/dirFace). */
const faceST = Fn(([d]) => {
  const a = d.abs();
  const isX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
  const isY = isX.not().and(a.y.greaterThanEqual(a.z));
  const m = select(isX, a.x, select(isY, a.y, a.z));
  const sv = select(isX, d.x, select(isY, d.y, d.z));
  const pos = sv.greaterThanEqual(0);
  const sg = select(pos, float(1), float(-1));
  const u = select(isX, sg.negate().mul(d.z), select(isY, d.x, sg.mul(d.x))).div(m);
  const v = select(isX, d.y, select(isY, sg.negate().mul(d.z), d.y)).div(m);
  const face = select(isX, float(0), select(isY, float(2), float(4))).add(select(pos, float(0), float(1)));
  return vec3(atan(u).mul(4 / PI), atan(v).mul(4 / PI), face);
});
const uvOf = (st, N) => st.xy.mul(0.5).add(0.5).mul((N - 1) / N).add(0.5 / N);
const sampleFace = (tex, N, d) => { const f = faceST(d).toVar(); return texture(tex, uvOf(f, N)).depth(int(f.z)); };

// atmosphere constants (unit = planet radius; the shell is exaggerated: 2.5% of R, scale heights ~40 / 14 km)
const RA = 1.03, HR = 0.0085, HM = 0.0026;
const BETA_R = [15, 32, 72], BETA_M = 9, SUN_I = 4;

/**
 * Single-scatter along a view ray through the shell: `n` samples, Rayleigh + Mie, with an analytic sun path per sample and a
 * horizon cut for the planet's shadow (soft terminator in the haze). Returns vec4(in-scattered rgb, view transmittance).
 */
function atmosphere(ro, rd, tmax, L, n, k = float(1)) {
  const bR = vec3(...BETA_R).mul(k), bM = k.mul(BETA_M), b = dot(ro, rd), c = dot(ro, ro).sub(RA * RA), sq = sqrt(max(b.mul(b).sub(c), 0));
  const t0 = max(b.negate().sub(sq), 0).toVar(), t1 = min(b.negate().add(sq), tmax), len = max(t1.sub(t0), 0), dt = len.div(n);
  let odR = float(0), odM = float(0), sumR = vec3(0), sumM = vec3(0);
  for (let i = 0; i < n; i++) {
    const p = ro.add(rd.mul(t0.add(dt.mul(i + 0.5)))), pl = length(p), h = max(pl.sub(1), 0);
    const dR = exp(h.div(-HR)).mul(dt), dM = exp(h.div(-HM)).mul(dt);
    odR = odR.add(dR); odM = odM.add(dM);
    const mu = dot(p.div(pl), L), horizon = sqrt(max(float(1).sub(float(1).div(pl.mul(pl))), 0)).negate();
    const vis = sstep(horizon.sub(0.07), horizon.add(0.14), mu); // planet shadow, soft
    const pf = float(1).div(max(mu.mul(0.9).add(0.2), 0.07)); // sun path ~ H / (mu + a bit)
    const lightT = exp(bR.mul(exp(h.div(-HR)).mul(HR)).add(exp(h.div(-HM)).mul(HM).mul(bM)).mul(pf).negate());
    const viewT = exp(bR.mul(odR).add(odM.mul(bM)).negate());
    sumR = sumR.add(viewT.mul(lightT).mul(dR).mul(vis));
    sumM = sumM.add(viewT.mul(lightT).mul(dM).mul(vis));
  }
  const cs = dot(rd, L), g = 0.78;
  const phR = cs.mul(cs).add(1).mul(0.0596831), phM = float(1 - g * g).div(pow(float(1 + g * g).sub(cs.mul(2 * g)), 1.5)).mul(0.0795775);
  const inS = sumR.mul(bR).mul(phR).add(sumM.mul(bM).mul(phM)).mul(SUN_I);
  const T = exp(bR.mul(odR).add(odM.mul(bM)).negate());
  return vec4(inS, T.y);
}

// ---------------------------------------------------------------- the material
/** Uniforms shared by the globe, the patch (and later the minimap globe). */
export function planetUniforms() {
  return {
    uSun: uniform(new THREE.Vector3(0.8, 0.25, 0.55).normalize()), uCam: uniform(new THREE.Vector3(0, 0, 3)),
    uRelief: uniform(3), uDetail: uniform(1), uCloudRot: uniform(new THREE.Vector2(1, 0)), uBorders: uniform(0), uClouds: uniform(1),
    uHoles: Array.from({ length: MAX_HOLES }, () => uniform(new THREE.Vector4(0, 1, 0, 2))), uTime: uniform(0),
    uHoleD: uniform(new THREE.Vector4(0, 1, 0, 0.001)), // the player's hole: dir.xyz, angular radius (clouds keep clear of it)
    uCut: uniform(0), // hole radius (m) of the flat cut in RENDER space (the hole sits at the origin); 0 = none (cap mode)
    uPatch: uniform(new THREE.Vector4(0, 1, 0, 2)), // the globe is discarded inside this disc (xyz anchor dir, w cos radius; w > 1 = off)
    uWoundG: uniform(3000), // metres a fully eaten bite-map texel sinks
    uWoundP: uniform(800), // metres a full fine-trail texel sinks (patch)
    uBiteWp: uniform(0), // how much of the bite map the patch shows (0 while the hole is far smaller than a texel)
    uAtmoH: uniform(0.35), // 0.35 at T1 .. 1: how much of the shell's outer glow is kept
    uAtmo: uniform(1), // scattering density x (the shell is exaggerated; the T1 camera sits in it: thinner there so the ground stays crisp)
    uShock: Array.from({ length: 4 }, () => uniform(new THREE.Vector4(0, 1, 0, 0))), // shock rings: dir.xyz, start angle (rad)
    uShockP: Array.from({ length: 4 }, () => uniform(new THREE.Vector4(-99, 0, 0, 0))), // start time (uTime), speed (rad/s), life (s), strength
    uRim: uniform(0), // the cap's rim band widens with the credit rate
    uGcellA: uniform(1e4), uGfr: uniform(0), uGroundK: uniform(1), uGroundM: uniform(1), // (K: parcels, hedges, rows, street grids, lakes, rivers = the close ground; M: relief, woods, settlements = the km-scale ground that a landmass keeps)
    // close-ground pattern scale: cells per face unit, octave blend, strength
    uPx: uniform(0.0005), // metres per pixel per metre of view distance
    uRoadW: uniform(230), // metres from a road line at which the patch map's road distance field reaches 0 (3 texels)
  };
}

// ---------------------------------------------------------------- the ground (patch): baked patterns, scanned layers, relief
const rot2 = (p, a) => vec2(p.x.mul(Math.cos(a)).sub(p.y.mul(Math.sin(a))), p.x.mul(Math.sin(a)).add(p.y.mul(Math.cos(a))));
const fadeTo = (lam, px) => float(1).sub(smoothstep(lam * 0.1, lam * 0.42, px)); // a feature of period lam (m) goes when the pixel (m) outgrows it
const luma = (c) => dot(c, vec3(0.3, 0.55, 0.15));

/**
 * planetMaterial({ surf, night, bite, trail, map, gt, N, B, quality, patch, u }) -> NodeMaterial with .userData.u (uniforms).
 * patch = false: the globe (positionGeometry = unit direction, `aH` = height). patch = true: the local detail patch: positions are
 * relative to the patch anchor (float precision), `aDir` the unit direction, `aH` the real signed height, `aHm` the height used to
 * morph the rim into the globe, `aG` the slope vector, `aS` (terrain occlusion, sun shadow), `aUV` the trail-map coordinates.
 * Uniforms: uSun (planet space), uCam (camera in planet units), uRelief (E), uDetail, uCloudRot, uBorders, uHoles[i] (vec4: dir.xyz,
 * cos(angle); w > 1 = empty), uCut (flat hole cut, metres, render space), uPatch (globe discard disc), uWoundG/uWoundP (wound depth, m).
 * `map` = the patch's RGBA map (R settlement, G woods, B roads, A wake foam) in patch space, painted by food.js; `gt` = groundtex.js.
 */
export function planetMaterial({ surf, night, bite, trail = null, map = null, gt = null, N = 512, B = 1024, quality = 'high', patch = false, u = planetUniforms() }) {
  const low = quality === 'low';
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  const aH = attribute('aH', 'float');
  const dirV = patch ? attribute('aDir', 'vec3') : positionGeometry; // (a varying: a vertex-stage value in the colour graph)
  // ---- vertex: relief (E live) and the wound sink
  const remV = sampleFace(bite, B, normalize(dirV)).r;
  const landV = sstep(-4, 25, aH);
  if (patch) {
    const aHm = attribute('aHm', 'float'), aUV = attribute('aUV', 'vec2');
    const trV = texture(trail, aUV).r;
    const sink = max(trV.mul(u.uWoundP), float(1).sub(remV).mul(u.uWoundG).mul(u.uBiteWp)).mul(landV);
    mat.positionNode = positionGeometry.add(dirV.mul(u.uRelief.sub(1).mul(aHm).sub(sink)));
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
  } else {
    const sink = float(1).sub(remV).mul(u.uWoundG).mul(landV);
    mat.positionNode = positionGeometry.mul(float(1).add(max(aH, 0).mul(u.uRelief).sub(sink).div(R)));
  }
  mat.userData.u = u;

  mat.colorNode = Fn(() => {
    const dir = normalize(dirV).toVar();
    // the flat cut under the hole (r < 110 km): the hole sits at the render origin
    If(positionWorld.xz.length().lessThan(u.uCut), () => { Discard(); });
    if (!patch) If(dot(dir, u.uPatch.xyz).greaterThan(u.uPatch.w), () => { Discard(); }); // the patch draws this part
    const L = u.uSun;
    const ro = u.uCam;
    const P = patch ? dir.mul(float(1).add(max(aH, 0).mul(u.uRelief).div(R))) : positionLocal;
    const toCam = ro.sub(P), dist = length(toCam).toVar(), V = toCam.div(dist).toVar();
    // ---- the bake
    const S = sampleFace(surf, N, dir).toVar();
    const st = faceST(dir).toVar();
    const nRaw = sampleFace(night, N, dir).toVar(); // (R lights = habitability x population; G clouds)
    const pxM = dist.mul(R).mul(u.uPx).toVar(); // metres per pixel here
    const wp = st.xy.mul(5.0e6).add(vec2(st.z.mul(113.7e3), st.z.mul(57.1e3))).toVar(); // surface metres on the cube face (continuous within a face, so detail never swims)
    const GR = patch && !!gt && !OFF.has('ground'), PB = !low && !OFF.has('pbr');
    // ---- every texture the ground needs, fetched here in uniform control flow (derivatives inside the land / sea branches would not be defined)
    let fA, fB, fC, cA, cB, uB, rA, rB, nz, scA, scB, mapV, gwx, gwy, riverN, riverFw;
    if (patch && map) mapV = texture(map, attribute('aUV', 'vec2')).toVar();
    if (GR) {
      const T_ = (k, mk) => (OFF.has(k) ? vec4(0.5, 0.5, 0.5, 0.5).toVar() : mk().toVar()); // (?off=fields,canopy,urban,relief prices each baked pattern)
      fA = T_('fields', () => texture(gt.fields, vec2(wp.x, wp.y.div(1.35)).div(FIELD_TILE)));
      fB = T_('fields', () => texture(gt.fields, rot2(wp, 0.62).div(FIELD_TILE * 0.6).add(vec2(0.37, 0.11))));
      fC = T_('fields', () => texture(gt.fields, rot2(wp, 0.3).div(FIELD_TILE * 9).add(vec2(0.2, 0.7))));
      cA = T_('canopy', () => texture(gt.canopy, wp.div(CANOPY_TILE)));
      cB = T_('canopy', () => texture(gt.canopy, rot2(wp, 1.1).div(CANOPY_TILE * 2.7).add(vec2(0.31, 0.57))));
      uB = T_('urban', () => texture(gt.urban, wp.div(URBAN_TILE)));
      const rw = mx_noise_vec3(vec3(wp.div(7300), 2.1)).xy.mul(900), wq = wp.add(rw); // (a slow warp so the tile never reads as a pattern)
      rA = T_('relief', () => texture(gt.relief, wq.div(RELIEF_TILE)));
      rB = T_('relief', () => texture(gt.relief, rot2(wq, 0.9).div(RELIEF_TILE * 0.29).add(vec2(0.13, 0.41))));
      nz = T_('noise', () => texture(gt.noise, wp.div(NOISE_TILE)));
      if (PB) { // (the scanned detail: rock normal + luminance at 260 m, grass luminance at 71 m)
        scA = T_('pbr', () => texture(gt.scan, wp.div(260)));
        scB = T_('pbr', () => texture(gt.scan, rot2(wp, 0.4).div(71)));
      }
      // the tangent frame of the surface (screen-space, planet metres): gradients of the metre coordinates, for normal-mapped detail
      const dM = dir.mul(R), dpx = dFdx(dM), dpy = dFdy(dM);
      const r1 = cross(dpy, dir), r2 = cross(dir, dpx), det = dot(dpx, r1), kk = sign(det).div(max(abs(det), 1e-4));
      gwx = r1.mul(dFdx(wp.x)).add(r2.mul(dFdy(wp.x))).mul(kk).toVar();
      gwy = r1.mul(dFdx(wp.y)).add(r2.mul(dFdy(wp.y))).mul(kk).toVar();
      gwx.assign(gwx.mul(min(float(1), float(2).div(max(length(gwx), 1e-4))))); gwy.assign(gwy.mul(min(float(1), float(2).div(max(length(gwy), 1e-4))))); // (a face seam breaks the metre coordinates: no spikes)
      const rw1 = mx_noise_float(dir.mul(38)); riverN = mx_noise_float(dir.mul(13).add(vec3(rw1, rw1.mul(0.7), rw1.mul(-0.8)).mul(0.5))).toVar(); // (a river is where this crosses zero: a line of fixed pixel width)
      riverFw = max(fwidth(riverN), 1e-6).toVar();
    }
    let e, nrm, slope;
    const dn = mx_fractal_noise_float(dir.mul(80), 2, 2.3, 0.5, 1).mul(u.uDetail).toVar(); // fractal coasts and relief detail
    let aS = vec2(1, 1);
    if (patch) { // the real heights, interpolated; the slope vector from the CPU; terrain occlusion and sun shadow per vertex
      e = aH.toVar();
      const aG = attribute('aG', 'vec3');
      aS = attribute('aS', 'vec2');
      const shK = float(2.0).add(float(3.4).div(u.uRelief)); // (shading relief: the ground reads with gentle light; stronger while E is 1)
      nrm = normalize(dir.sub(aG.mul(u.uRelief).mul(shK))).toVar();
      slope = length(aG).mul(u.uRelief).toVar();
    } else {
      const e0 = heightOf(S.r);
      e = e0.add(dn.mul(mix(10, 110, sstep(-30, 60, e0)))).toVar();
      // relief normal from two more taps (about one texel out)
      const ax = select(abs(dir.y).lessThan(0.99), vec3(0, 1, 0), vec3(1, 0, 0));
      const t1 = normalize(cross(dir, ax)), t2 = cross(dir, t1), del = 0.0042;
      const hh = (d2) => max(heightOf(sampleFace(surf, N, normalize(d2)).r), 0);
      const hc = max(e0, 0), g1 = hh(dir.add(t1.mul(del))).sub(hc).div(del), g2 = hh(dir.add(t2.mul(del))).sub(hc).div(del);
      const k = u.uRelief.div(R).mul(2.0);
      nrm = normalize(dir.sub(t1.mul(g1.mul(k))).sub(t2.mul(g2.mul(k)))).toVar();
      slope = length(vec2(g1, g2)).mul(k.mul(0.5)).toVar();
    }
    const T0 = S.g, M = S.b;
    const nlGeo = dot(dir, L).toVar();
    const day = sstep(-0.2, 0.22, nlGeo).toVar(); // (shared by the sea, the land and the water on it: .toVar() so the first use inside a branch doesn't own it)
    // ---- light
    const warm = mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.95, 0.88), sstep(0.0, 0.42, nlGeo));
    const sunLit = warm.mul(3.0).toVar(); // (sunlit white must stay under the bloom threshold, or snow veils the hole)
    const skyDay = sstep(-0.35, 0.45, nlGeo).toVar();
    const amb = vec3(0.17, 0.2, 0.26).mul(skyDay).add(vec3(0.011, 0.018, 0.038)).toVar(); // (night side: starlit, so the ground stays readable)
    const landMask = sstep(-0.5, 1.5, e).toVar();
    const nm = mx_fractal_noise_float(dir.mul(34).add(vec3(3.1, 1.7, 5.2)), 3, 2, 0.5, 1).toVar();
    const near = sstep(2.2, 0.35, dist).toVar(); // fine detail only when close
    // ---- wound (bite map + the patch's fine trail): eaten land sinks; strata walls over a glowing mantle
    const rem = sampleFace(bite, B, dir).r.toVar();
    const trF = patch ? texture(trail, attribute('aUV', 'vec2')).r : float(0);
    const wRaw = max(trF, float(1).sub(rem).mul(patch ? u.uBiteWp : float(1))).toVar();
    // torn edges (§12.5): the wound's ~10 km texel stairs are thresholded with a fractal, so they read as torn rock
    If(wRaw.greaterThan(0.004).and(wRaw.lessThan(0.996)), () => {
      const tornN = mx_fractal_noise_float(dir.mul(1100), 3, 2.1, 0.5, 1);
      wRaw.assign(clamp(wRaw.add(tornN.mul(0.9).mul(wRaw).mul(float(1).sub(wRaw)).mul(4)), 0, 1));
    });
    const wound = wRaw.mul(landMask).toVar();
    // ---- clouds (drifting) and their shadow on the ground: only seen from a few hundred km up
    const cloud = float(0).toVar(), cn = float(0).toVar(), cloudRaw = float(0).toVar(), shadow = float(1).toVar();
    const dr = vec3(dir.x.mul(u.uCloudRot.x).add(dir.z.mul(u.uCloudRot.y)), dir.y, dir.z.mul(u.uCloudRot.x).sub(dir.x.mul(u.uCloudRot.y)));
    const hr = u.uHoleD.w.mul(R); // the hole's radius, m
    if (!OFF.has('cloud')) If(dist.greaterThan(0.0015), () => {
      cn.assign(mx_noise_float(dr.mul(80)).mul(0.17).add(mx_noise_float(dr.mul(230)).mul(0.12)).add(mx_noise_float(dr.mul(640)).mul(0.05)).mul(u.uDetail));
      cloudRaw.assign(sampleFace(night, N, normalize(dr)).g);
      const clear = smoothstep(u.uHoleD.w.mul(3.5), u.uHoleD.w.mul(9), length(dir.sub(u.uHoleD.xyz))); // (no cloud skin up against the lens)
      cloud.assign(sstep(0.3, 0.68, cloudRaw.add(cn)).mul(u.uClouds).mul(sstep(0.0015, 0.02, dist)).mul(clear));
      if (!low) { // shadows: thicker cloud only, soft, light, and only from T2 up (where a cloud is a few pixels, not a stain on the sea of fields)
        const ds = normalize(dr.add(L.sub(dr.mul(dot(dr, L))).mul(0.006)));
        const thick = sstep(0.46, 0.92, sampleFace(night, N, ds).g.add(cn.mul(1.6)));
        shadow.assign(float(1).sub(thick.mul(0.3).mul(sstep(0, 0.3, nlGeo)).mul(sstep(0.0015, 0.02, dist)).mul(clear).mul(sstep(2500, 9000, hr))));
      }
    });
    const oceanCol = vec3(0).toVar(), landCol = vec3(0).toVar(), dbgV = vec3(0).toVar();
    const urbV = patch ? sstep(0.45, 0.95, nRaw.r) : float(0), woodV = mapV ? mapV.g : float(0), roadV = mapV ? mapV.b : float(0);
    // the water's lighting: sun glint, Fresnel to the sky, a body colour and a little diffuse
    const shadeWater = (oc, on, iceO, nrmL) => {
      const Hh = normalize(L.add(V)), nh = max(dot(on, Hh), 0), nv = max(dot(on, V), 0);
      const fres = float(0.02).add(pow(float(1).sub(nv), 5).mul(0.98));
      const glint = pow(nh, 2200).mul(10).add(pow(nh, 260).mul(0.3)).mul(fres.mul(8).add(0.4)).mul(step(0, nlGeo)).mul(sstep(0, 0.05, dot(on, L)));
      const diffO = max(dot(on, L), 0).mul(0.9).add(0.05);
      const skyRef = vec3(0.16, 0.3, 0.6).mul(sstep(-0.3, 0.5, nlGeo).mul(0.9).add(0.04));
      return oc.mul(sunLit.mul(diffO).mul(day).mul(nrmL).add(amb)).add(skyRef.mul(fres).mul(1.1)).add(sunLit.mul(glint).mul(float(1).sub(iceO).mul(0.55)).mul(nrmL));
    };
    // ---- the sea
    If(landMask.lessThan(0.999), () => {
      const depth = max(e.negate(), 0);
      const iceO = sstep(0.16, 0.07, T0.add(nm.mul(0.05)));
      // a seabed seen through the water: sand in the shallows, then the water's own colour by depth
      const seabed = srgb(0.55, 0.5, 0.38).mul(float(0.85).add(nm.mul(0.3)));
      let wcol = mix(srgb(0.1, 0.36, 0.4), srgb(0.04, 0.25, 0.4), sstep(5, 130, depth));
      wcol = mix(wcol, srgb(0.02, 0.17, 0.36), sstep(80, 1200, depth));
      wcol = mix(wcol, srgb(0.008, 0.09, 0.25), sstep(900, 3000, depth));
      wcol = mix(wcol, srgb(0.003, 0.04, 0.15), sstep(2600, 4600, depth));
      wcol = wcol.mul(float(1).add(nm.mul(0.3)).add(mx_noise_float(vec3(wp.div(1700), 4.1)).mul(0.22).mul(fadeTo(6000, pxM)))); // broad tint variation
      const seen = exp(depth.negate().div(4.5)).mul(0.7); // how much of the seabed shows through
      let oc = mix(wcol, seabed.mul(wcol.mul(1.6).add(0.12)), seen);
      oc = mix(oc, srgb(0.84, 0.92, 0.98).mul(float(0.92).add(nm.mul(0.14))), iceO); // sea ice
      // waves: broad swell from the globe's noise, two fine octaves in metres (they fade as the pixel outgrows them)
      let wv = low || OFF.has('wave') ? vec3(0) : mx_noise_vec3(dir.mul(1500).add(vec3(u.uTime.mul(0.04), 0, 0))).mul(0.014).mul(u.uDetail);
      if (!low && !OFF.has('wave') && patch) {
        const tq = u.uTime;
        wv = wv.add(mx_noise_vec3(vec3(wp.div(95), tq.mul(0.18))).mul(0.09).mul(fadeTo(95, pxM)).mul(vec3(1, 0.3, 1)));
        wv = wv.add(mx_noise_vec3(vec3(wp.div(31).add(vec2(tq.mul(0.3), 0)), tq.mul(0.35))).mul(0.07).mul(fadeTo(31, pxM)).mul(vec3(1, 0.3, 1)));
      }
      const on = normalize(dir.add(wv));
      oc = mix(oc, srgb(0.36, 0.74, 0.66), sstep(26, 0, depth).mul(0.3).mul(float(1).sub(iceO))); // shallows near a coast: lighter
      // surf: bands of foam lapping in toward the shore, broken up; plus a bright rim at the waterline
      const lap = sin(depth.mul(0.55).sub(u.uTime.mul(1.3)).add(mx_noise_float(vec3(wp.div(70), 1.3)).mul(3))).mul(0.5).add(0.5);
      const brk = sstep(0.32, 0.7, mx_noise_float(vec3(wp.div(17), u.uTime.mul(0.25))).mul(0.5).add(0.5));
      const foam = max(sstep(4, 0.8, depth).mul(sstep(0.62, 1.0, lap)).mul(brk).mul(0.6), sstep(1.0, 0.05, depth).mul(0.5)).mul(fadeTo(34, pxM).mul(0.7).add(0.3)).mul(float(1).sub(iceO));
      oc = mix(oc, vec3(0.88, 0.95, 0.98), foam.mul(0.8));
      oceanCol.assign(shadeWater(oc, on, iceO, float(1)));
    });
    // ---- the land: climate (T, M) + altitude + slope, then the close ground, then the wound
    If(landMask.greaterThan(0.001), () => {
      const Te = T0.sub(max(e.sub(400), 0).div(9000)).add(nm.mul(0.05)).toVar();
      const hot = sstep(0.52, 0.74, Te), cold = sstep(0.42, 0.2, Te);
      const mildC = mix(mix(srgb(0.66, 0.57, 0.38), srgb(0.5, 0.52, 0.28), sstep(0.06, 0.22, M)), mix(srgb(0.38, 0.5, 0.2), srgb(0.17, 0.33, 0.15), sstep(0.4, 0.68, M)), sstep(0.22, 0.42, M));
      const warmC = mix(mix(srgb(0.78, 0.63, 0.42), srgb(0.66, 0.57, 0.31), sstep(0.18, 0.42, M)), mix(srgb(0.36, 0.48, 0.17), srgb(0.09, 0.28, 0.11), sstep(0.6, 0.85, M)), sstep(0.42, 0.62, M));
      const coolC = mix(srgb(0.5, 0.5, 0.43), srgb(0.15, 0.26, 0.18), sstep(0.35, 0.55, M));
      const land = mix(mix(mildC, warmC, hot), coolC, cold).toVar();
      const fine = mx_fractal_noise_float(dir.mul(300), 3, 2.2, 0.5, 1).mul(near).mul(u.uDetail);
      land.mulAssign(float(1).add(nm.mul(0.4)).add(fine.mul(0.3)));
      const rockC = mix(srgb(0.42, 0.38, 0.34), srgb(0.55, 0.49, 0.41), sstep(-0.3, 0.4, nm)), rockAmt = max(sstep(0.22, 0.6, slope), sstep(1900, 3800, e.add(nm.mul(600)))).toVar();
      const sr = vec2(st.x.mul(0.906).sub(st.y.mul(0.423)), st.x.mul(0.423).add(st.y.mul(0.906))); // (the wound's crack pattern: a turn from the cube's axes)
      const gK = u.uGroundK.mul(near).toVar();
      const nrmD = nrm.toVar(); // the shading normal: the heightfield's, plus the detail relief below
      const rough = float(0.6).toVar(); // how much of the sky the ground sees (valleys and forest floors see less)
      const snowK = float(0).toVar(), urE = float(0).toVar(), woodK = float(0).toVar();
      if (GR) {
        const gOn = u.uGroundK, gM = u.uGroundM;
        // ---- relief: slopes of baked fractals in metres (rolling hills on the lowlands, crags in the mountains), then the scans' normal maps
        const GM = RELIEF_GMAX * 2;
        const ridgeK = max(sstep(0.12, 0.5, slope), sstep(700, 2200, e)).toVar();
        const gA = mix(rA.xy.sub(0.5), rA.zw.sub(0.5), ridgeK).mul(GM);
        const gB = rot2(mix(rB.xy.sub(0.5), rB.zw.sub(0.5), ridgeK).mul(GM), -0.9);
        const relAmt = mix(0.3, 0.95, sstep(60, 700, e)).mul(float(0.7).add(u.uRelief.mul(0.3))).mul(gOn).mul(float(1).sub(sstep(300, 6000, pxM).mul(0.8)));
        const ds = gA.mul(fadeTo(9000, pxM).mul(0.55).add(0.1)).add(gB.mul(0.45).mul(fadeTo(500, pxM))).mul(relAmt).toVar();
        const bump = gwx.mul(ds.x).add(gwy.mul(ds.y)).toVar();
        if (PB) {
          const rs = scA.rg.sub(0.5).mul(2.2);
          bump.addAssign(gwx.mul(rs.x).add(gwy.mul(rs.y)).mul(rockAmt.mul(0.55).add(0.08)).mul(fadeTo(260, pxM)));
        }
        nrmD.assign(normalize(nrm.sub(bump)));
        // ---- farmland: where people live and the land is gentle: parcels (hedges are a soft line, rows a ripple), regional crop palettes
        const hab = sstep(1000, 300, e).mul(sstep(0.26, 0.4, Te)).mul(sstep(0.12, 0.24, M)).mul(float(1).sub(sstep(0.18, 0.34, slope))).mul(float(1).sub(sstep(0.8, 0.95, Te))).mul(float(1).sub(rockAmt));
        const pop = sstep(0.03, 0.3, nRaw.r).mul(0.5).add(0.5);
        const cult = hab.mul(pop).toVar();
        const dryK = float(1).sub(sstep(0.22, 0.5, M));
        const fsel = sstep(-0.06, 0.06, nz.b.sub(0.5).mul(1.4)); // two regional field orientations
        const F = mix(fA, fB, fsel);
        const r0 = F.r, hedStr = sstep(0.25, 0.75, F.a);
        let crop = srgb(0.4, 0.49, 0.25); // pasture
        crop = mix(crop, srgb(0.34, 0.45, 0.2), step(0.2, r0)); // green crop
        crop = mix(crop, srgb(0.44, 0.54, 0.25), step(0.38, r0)); // young rows
        crop = mix(crop, srgb(0.68, 0.6, 0.35), step(float(0.56).sub(dryK.mul(0.22)), r0)); // ripe grain
        crop = mix(crop, srgb(0.45, 0.35, 0.27), step(0.72, r0)); // ploughed
        crop = mix(crop, srgb(0.6, 0.55, 0.4), step(0.84, r0)); // stubble
        crop = mix(crop, srgb(0.78, 0.7, 0.22), step(0.975, r0).mul(sstep(0.3, 0.6, M))); // rapeseed, rarely
        crop = mix(crop, crop.mul(vec3(1.15, 1.0, 0.8)), dryK.mul(0.8)); // drier country: everything a little more straw
        const rows = F.b.sub(0.5);
        const rowK = fadeTo(30, pxM);
        const bigR = fC.r; // 2 km parcels, what is left of the pattern once a pixel is 100 m
        const parcel = cult.mul(fadeTo(260, pxM)).mul(gOn);
        const bigK = cult.mul(sstep(40, 160, pxM)).mul(float(1).sub(sstep(1500, 5000, pxM))).mul(gOn);
        const fcol = mix(land, crop.mul(float(0.9).add(fine.mul(0.25))), 0.66).mul(float(1).add(rows.mul(0.12).mul(rowK)));
        const hedgeCol = land.mul(vec3(0.34, 0.46, 0.28));
        const hed = float(1).sub(sstep(0.04, 0.5, F.g)).mul(float(0.3).add(hedStr.mul(0.7))).mul(0.55);
        land.assign(mix(land, mix(fcol, hedgeCol, hed.mul(fadeTo(120, pxM).mul(0.6).add(0.4))), parcel));
        let bigCol = srgb(0.37, 0.49, 0.21);
        bigCol = mix(bigCol, srgb(0.3, 0.44, 0.17), step(0.25, bigR));
        bigCol = mix(bigCol, srgb(0.7, 0.62, 0.33), step(float(0.5).sub(dryK.mul(0.2)), bigR));
        bigCol = mix(bigCol, srgb(0.45, 0.35, 0.24), step(0.75, bigR));
        bigCol = mix(bigCol, srgb(0.58, 0.54, 0.36), step(0.88, bigR));
        const bigEdge = float(1).sub(sstep(0.0, 0.3, fC.g)).mul(0.28);
        land.assign(mix(land, mix(bigCol, land.mul(0.5), bigEdge), bigK.mul(0.6)));
        const mot = mx_fractal_noise_float(dir.mul(650), 3, 2.1, 0.5, 1).mul(1.6).add(0.5).toVar(); // (smooth gradient noise: the baked value-noise tile shows its 5 km lattice as a plaid at this scale)
        urE.assign(sstep(0.35, 0.85, urbV.mul(mot.mul(1.1).add(0.35)).add(mot.sub(0.5).mul(0.5))).mul(0.55).mul(gM)); // (a city is a mottled tan patch in the green: from 477 km a metro belt is blotches, not a sheet) // (settlement: a ragged edge, the suburbs fray into the fields)
        // ---- woods: stands (a few km), canopy clumps, glades; a conifer / broadleaf / jungle mix by climate
        const sn = mix(nz.r.sub(0.5).mul(0.72).add(nz.g.sub(0.5).mul(0.48)), mx_fractal_noise_float(dir.mul(380), 3, 2.0, 0.5, 1).mul(1.4), sstep(150, 600, pxM)); // stands: patches of a few km up close, smooth fractal blotches (no lattice) from a landmass
        const cover = sstep(0.5, 0.9, M.add(cold.mul(0.15))).mul(1.2).add(sn.mul(0.8)).add(nm.mul(0.3)).sub(0.25).sub(cult.mul(0.4)).sub(urE.mul(0.5)); // wet land is wooded in patches; fields clear it
        const wood = sstep(0.0, 0.14, cover).mul(sstep(0.7, 0.4, Te).max(0.35)).mul(float(1).sub(rockAmt)).toVar();
        const cvv = mix(cA, cB, 0.4);
        const cons = float(1).sub(sstep(0.3, 0.66, Te)).add(cvv.g.sub(0.5).mul(0.9)).clamp(0, 1);
        const jung = sstep(0.68, 0.8, Te).mul(sstep(0.62, 0.8, M));
        let can = mix(srgb(0.22, 0.35, 0.11), srgb(0.12, 0.24, 0.12), cons);
        can = mix(can, srgb(0.06, 0.22, 0.1), jung);
        const canL0 = float(0.55).add(cvv.r.mul(1.15)).mul(float(1).sub(cvv.b.mul(0.45))), canL = mix(float(1.18), canL0, fadeTo(450, pxM).mul(0.85).add(0.15)); // (the canopy tile is 1.5 km: it must be gone before a pixel is 60 m) // dark gaps, bright crown tops, glades
        const canopy = can.mul(canL);
        woodK.assign(max(wood, woodV.mul(0.9)).mul(gM));
        land.assign(mix(land, canopy, woodK.mul(fadeTo(900, pxM).mul(0.8).add(0.2))));
        rough.assign(mix(rough, 0.35, woodK));
        // ---- the dry lands: sand and scree grain
        if (PB) {
          const grainL = mix(vec3(1), vec3(scB.a.mul(2)), 0.3).mul(fadeTo(71, pxM).mul(0.8).add(0.2));
          land.mulAssign(mix(vec3(1), grainL, float(1).sub(woodK).mul(float(1).sub(rockAmt)).mul(gOn)));
        }
        // ---- settlements: dense urban fabric under the skyline kit, fraying into suburbs (gardens) at the edge
        const ur = urbV, uK = fadeTo(110, pxM); // (the street grid only from ~50 m a pixel: from a landmass it aliases into a plaid)
        const lotC = mix(srgb(0.44, 0.4, 0.34), srgb(0.6, 0.55, 0.46), mix(float(0.5), uB.g, uK).mul(0.6).add(mot.mul(0.5)));
        const garden = mix(land.mul(vec3(0.85, 1.1, 0.8)), srgb(0.2, 0.34, 0.14), 0.4);
        const dense = sstep(0.55, 0.95, ur);
        let fab = mix(garden, lotC.mul(float(1).sub(mix(float(0.5), uB.b, uK).mul(0.22))), dense.mul(0.8).add(0.2).mul(sstep(0.0, 0.5, ur)).mul(mot.mul(0.8).add(0.35)).clamp(0, 1));
        fab = mix(fab, garden, mix(float(0.15), uB.a, uK).mul(0.8));
        fab = mix(fab, srgb(0.2, 0.2, 0.21), uB.r.mul(uK).mul(0.85).mul(dense.mul(0.8).add(0.2)));
        land.assign(mix(land, fab, urE));
        // ---- roads between settlements: a thin, pale line on a distance field painted per patch
        const rdD = float(1).sub(roadV); // 0 on the line .. 1 at W metres from it
        const rw = mix(18, 32, sstep(0, 1, urbV)); // metres (full width)
        const roadA = float(1).sub(sstep(0.3, 1.0, rdD.mul(u.uRoadW).div(max(rw.mul(0.5), pxM.mul(0.75))))).mul(fadeTo(900, pxM).mul(0.8).add(0.2)).mul(sstep(0.02, 0.2, roadV));
        land.assign(mix(land, mix(srgb(0.56, 0.52, 0.45), srgb(0.3, 0.3, 0.3), urE).mul(luma(land).mul(0.5).add(0.75)), roadA.mul(0.8).mul(gOn)));
        rough.assign(mix(rough, 0.5, urE));
      }
      // ---- scree and rock
      const rockCol = GR && PB ? rockC.mul(mix(float(1), scA.b.mul(2), 0.7)) : rockC;
      land.assign(mix(land, rockCol, rockAmt.mul(0.9)));
      // ---- beaches: warm shores are sand, a darker wet band at the waterline; cold shores gravel
      const beach = sstep(1.8, 0.2, e).mul(float(1).sub(cold.mul(0.5))).mul(float(1).sub(urE.mul(0.7)));
      const sandC = mix(srgb(0.7, 0.62, 0.46), srgb(0.55, 0.5, 0.42), cold);
      land.assign(mix(land, sandC.mul(float(0.9).add(nm.mul(0.18))), beach.mul(0.88)));
      land.mulAssign(float(1).sub(sstep(1.5, 0.0, e).mul(0.28)));
      // ---- rivers and lakes (lowlands only, painted where it rains): thin water lines of fixed pixel width, still bodies
      const wet = float(0).toVar(), wetD = float(0).toVar(), wcolV = vec3(0).toVar();
      if (GR) {
        const flow = nz.b;
        const wide = mix(14, 70, flow).mul(sstep(520, 90, e));
        const riverPx = abs(riverN).div(riverFw), hw = max(wide.mul(0.5).div(pxM), 0.55);
        const riv = float(1).sub(sstep(hw.mul(0.8), hw.mul(1.4), riverPx)).mul(clamp(wide.div(pxM.mul(1.3)), 0.3, 1)).mul(sstep(0.25, 0.42, M)).mul(float(1).sub(urE)).mul(sstep(0.1, 0.25, Te)).mul(sstep(8, 30, e));
        const lk = mx_noise_float(dir.mul(27).add(vec3(7.1, 3.3, 1.9))).add(nz.a.sub(0.5).mul(0.25));
        const lake = sstep(0.5, 0.56, lk).mul(sstep(320, 60, e)).mul(sstep(14, 40, e)).mul(sstep(0.3, 0.45, M)).mul(float(1).sub(urE)).mul(u.uGroundK);
        wet.assign(max(riv, lake).mul(u.uGroundK)); // (rivers are fixed-pixel lines: black scratches from 40 km up, where a river is a few px)
        wetD.assign(sstep(0.5, 0.75, lk).mul(lake.greaterThan(0.01).select(1, 0)));
      }
      If(wet.greaterThan(0.01), () => {
        const wbody = mix(srgb(0.16, 0.34, 0.3), srgb(0.05, 0.17, 0.22), wetD.max(0.2));
        const tq = u.uTime;
        const wv2 = mx_noise_vec3(vec3(wp.div(48), tq.mul(0.2))).mul(0.04).mul(fadeTo(48, pxM)).mul(vec3(1, 0.3, 1));
        const wnrm = normalize(dir.add(wv2));
        wcolV.assign(shadeWater(wbody, wnrm, float(0), float(1)));
      });
      // ---- snow and ice
      const snowLine = mix(1800, 6400, sstep(0.0, 0.75, T0.add(nm.mul(0.06)))), snow = sstep(snowLine.sub(500), snowLine.add(900), e.add(nm.mul(700))).mul(float(1).sub(sstep(0.35, 1.0, slope).mul(0.75)));
      const ice = sstep(0.16, 0.05, Te.add(nm.mul(0.05)));
      const white = mix(srgb(0.66, 0.79, 0.94), srgb(0.95, 0.965, 0.99), clamp(nm.mul(1.4).add(0.55).add(fine.mul(0.9)), 0, 1)); // snow and ice: blue in the hollows, bright on the ridges
      snowK.assign(max(snow, ice));
      land.assign(mix(land, white.mul(0.62), snowK));
      land.assign(mix(land, vec3(0.9, 0.82, 0.62), S.a.mul(u.uBorders).mul(0.7)));
      const diffL = clamp(dot(nrmD, L).add(0.12).div(1.12), 0, 1);
      // the wound's albedo: scorched lip, banded strata walls, mantle floor (+ its glow, emissive: it blooms)
      const wl = wound, glow = vec3(0).toVar();
      If(wl.greaterThan(0.002), () => {
        const stN = mx_noise_float(vec3(st.xy.mul(u.uGcellA.mul(0.7)), 3.1)).mul(0.5).add(0.5);
        const bands = sin(wl.mul(34).add(stN.mul(5))).mul(0.5).add(0.5);
        let strata = mix(srgb(0.2, 0.12, 0.08), srgb(0.5, 0.34, 0.2), bands);
        strata = mix(strata, srgb(0.34, 0.2, 0.12), sstep(0.5, 0.2, stN));
        strata = strata.mul(float(1).sub(wl.mul(0.5)));
        land.assign(mix(land, srgb(0.1, 0.05, 0.04), sstep(0.0, 0.05, wl).mul(0.85))); // scorched lip
        land.assign(mix(land, strata, sstep(0.04, 0.16, wl)));
        land.assign(mix(land, srgb(0.07, 0.03, 0.09), sstep(0.8, 0.97, wl)));
        const crk = pow(float(1).sub(abs(mx_noise_float(vec3(sr.mul(u.uGcellA.mul(4)), u.uTime.mul(0.05))))), 28);
        const lip = sstep(0.015, 0.06, wl).mul(float(1).sub(sstep(0.1, 0.3, wl))), floorK = sstep(0.8, 0.97, wl);
        glow.assign(vec3(1.0, 0.3, 0.05).mul(lip.mul(1.25).add(floorK.mul(crk).mul(1.2).mul(stN.mul(0.8).add(0.35)).add(floorK.mul(0.05)))).add(vec3(0.42, 0.2, 0.95).mul(floorK).mul(0.07)));
      });
      // lit: the sun through the detail normal, the terrain's own shadow and occlusion (per vertex), a sky fill that sees less in the hollows
      const shV = mix(float(1), aS.y, 0.9), aoV = aS.x;
      const sky = dot(nrmD, dir).mul(0.5).add(0.5);
      const fill = amb.mul(mix(0.55, 1.2, sky)).mul(aoV).mul(mix(1.0, rough.mul(0.5).add(0.6), 0.6));
      const lit = land.mul(sunLit.mul(diffL).mul(day).mul(shadow).mul(shV).add(fill)).add(glow);
      landCol.assign(mix(lit, wcolV, wet));
      if (DBG === 1) dbgV.assign(land); else if (DBG === 2) dbgV.assign(nrmD.mul(0.5).add(0.5)); else if (DBG === 3) dbgV.assign(vec3(aoV, aS.y, 0)); else if (DBG === 4) dbgV.assign(vec3(diffL, day, shadow)); else if (DBG === 5) dbgV.assign(vec3(pxM.div(100), nlGeo, 0)); else if (DBG === 12) dbgV.assign(vec3(woodK, urE, rockAmt)); else if (DBG === 6) dbgV.assign(vec3(day)); else if (DBG === 7) dbgV.assign(sunLit.div(3)); else if (DBG === 8) dbgV.assign(fill.mul(4)); else if (DBG === 9) dbgV.assign(lit.mul(0.3));
    });
    // ---- shock rings (§12.5): a lilac band racing over the planet, pushing the clouds out of its way; four slots, written by PlanetWorld.shock()
    const shockGlow = vec3(0).toVar(), shockClr = float(0).toVar();
    if (!OFF.has('shock')) for (let i = 0; i < 4; i++) {
      const sh = u.uShock[i], sp = u.uShockP[i], age = u.uTime.sub(sp.x);
      If(age.greaterThan(0).and(age.lessThan(sp.z)), () => {
        const th = acos(clamp(dot(dir, sh.xyz), -1, 1)), Rr = sh.w.add(sp.y.mul(age)), wd = max(Rr.mul(0.16), 0.0008);
        const band = exp(pow(th.sub(Rr).div(wd), 2).negate()), f = float(1).sub(smoothstep(sp.z.mul(0.35), sp.z, age)).mul(smoothstep(0, 0.08, age)).mul(sp.w);
        shockGlow.addAssign(vec3(0.6, 0.42, 1.0).mul(band).mul(f).mul(2.2).add(vec3(1.0, 0.94, 1.0).mul(pow(band, 6)).mul(f).mul(0.9)));
        shockClr.assign(max(shockClr, float(1).sub(smoothstep(Rr.sub(wd.mul(3)), Rr.add(wd), th)).mul(f).mul(0.9)));
      });
    }
    // ---- surface = ocean/land, then lights and clouds on top
    const col = mix(oceanCol, landCol, landMask).toVar();
    const dark = sstep(-0.02, -0.2, nlGeo).mul(float(1).sub(cloud.mul(0.8))).mul(float(1).sub(wound.mul(4).min(1))).toVar();
    If(dark.greaterThan(0.002), () => { // night lights: clustered, speckled, off in cloud and in eaten land
      const nlight = nRaw.r.toVar();
      const cl1 = mx_noise_float(dir.mul(640)).mul(0.5).add(0.5), cl2 = mx_noise_float(dir.mul(2100)).mul(0.5).add(0.5);
      const lights = nlight.mul(sstep(0.35, 0.9, cl1.mul(0.6).add(nlight.mul(0.7))).mul(sstep(0.56, 0.78, cl2)).mul(2.2).add(nlight.mul(nlight).mul(sstep(0.5, 0.75, cl1)).mul(0.5))).mul(landMask);
      col.addAssign(vec3(1.0, 0.56, 0.2).mul(lights).mul(dark).mul(1.7).mul(float(1).sub(near.mul(u.uGroundK))));  // (close up the food's own windows take over: the bake's blobs would be 5 km soft clouds)
      if (patch && map) col.addAssign(vec3(1.0, 0.5, 0.18).mul(urbV).mul(dark).mul(0.09).mul(u.uGroundK).mul(near)); // street glow under the skyline
    });
    If(cloud.greaterThan(0.001), () => { // clouds: white, lit with wrap, thin edges lose density
      const cloudLit = mix(vec3(0.66, 0.72, 0.85), vec3(0.98, 0.985, 1.0), sstep(0.38, 0.95, cloudRaw.add(cn.mul(1.6)))).mul((sunLit.mul(clamp(dot(dir, L).add(0.1).div(1.1), 0, 1)).mul(0.92).add(amb.mul(1.5))));
      col.assign(mix(col, cloudLit.mul(float(0.9).add(cn.mul(0.5))), cloud.mul(0.9).mul(float(1).sub(wound.mul(2).min(1))).mul(float(1).sub(shockClr))));
    });
    col.addAssign(shockGlow);
    // ---- hole caps (spherical): void inside, a lilac glowing lip
    const capMask = float(0).toVar(); // (the atmosphere does not veil the void: it would turn the shaft into grey glass)
    for (const hu of u.uHoles) {
      If(hu.w.lessThan(1.0), () => {
        const c = dot(dir, hu.xyz), th = acos(clamp(c, -1, 1)), th0 = acos(clamp(hu.w, -1, 1)).max(1e-5);
        const dd = th.div(th0);
        const hax = select(abs(hu.y).lessThan(0.99), vec3(0, 1, 0), vec3(1, 0, 0));
        const h1 = normalize(cross(hu.xyz, hax)), h2 = cross(hu.xyz, h1);
        // depth: a real tube. The ray from this pixel goes down along -V; it meets the shaft's wall (a lit, banded crescent on the far side) or the floor (the swirling void)
        const hq = vec2(dot(dir, h1), dot(dir, h2)).div(max(sin(th0), 1e-5)), vz = max(dot(V, hu.xyz), 0.25);
        const dv = vec2(dot(V, h1), dot(V, h2)).div(vz).negate(), Dd = float(2.0);
        const qa = max(dot(dv, dv), 1e-5), qb = dot(hq, dv), qc = dot(hq, hq).sub(1);
        const tw = qb.negate().add(sqrt(max(qb.mul(qb).sub(qa.mul(qc)), 0))).div(qa), hitWall = tw.lessThan(Dd), tN = clamp(tw.div(Dd), 0, 1);
        const pf = hq.add(dv.mul(Dd)), ddP = min(length(pf), 1), ang = atan(pf.y, pf.x);
        const arms = sin(ang.mul(3).add(ddP.mul(-16)).add(u.uTime.mul(1.2))).mul(0.5).add(0.5);
        const floorCol = mix(vec3(0.1, 0.045, 0.26), vec3(0.008, 0.004, 0.035), sstep(0.95, 0.25, ddP)).add(vec3(0.3, 0.16, 0.7).mul(arms).mul(sstep(0.9, 0.2, ddP)).mul(0.36));
        const wallCol = mix(vec3(0.17, 0.085, 0.065), vec3(0.04, 0.015, 0.1), sstep(0.0, 0.35, tN)).mul(float(1).sub(sstep(0.2, 1.0, tN).mul(0.9))).add(vec3(0.9, 0.38, 0.12).mul(exp(tN.mul(-30))).mul(0.3)).add(vec3(0.3, 0.15, 0.7).mul(exp(tN.sub(0.45).mul(6).pow(2).negate())).mul(0.12));
        const voidCol = select(hitWall, wallCol, floorCol);
        const inside = sstep(1.0, 0.985, dd);
        const rim = exp(pow(dd.sub(1).mul(26).div(float(1).add(u.uRim.mul(0.7))), 2).negate());
        col.assign(mix(col, voidCol, inside));
        capMask.assign(max(capMask, sstep(1.05, 0.98, dd)));
        col.addAssign(vec3(0.62, 0.42, 1.0).mul(rim).mul(1.9));
      });
    }
    // ---- haze between camera and surface: a cheap exponential up close (the camera is 10-1000 km away), the real single scatter from ~50 km
    if (!OFF.has('atmo')) {
      const dm = dist.mul(R);
      const hk = sstep(0.0035, 0.008, dist); // 0 near .. 1 far: the blend from the cheap haze to the scatter
      const sunSide = pow(max(dot(V.negate(), L), 0), 5);
      const hazeC = mix(vec3(0.58, 0.69, 0.84), vec3(1.0, 0.82, 0.62), sunSide.mul(0.55)).mul(skyDay.mul(0.95).add(0.04)).mul(1.15);
      const hz = float(1).sub(exp(dm.div(-200000))).mul(0.75).mul(float(1).sub(hk));
      const hzK = float(1).sub(capMask.mul(0.92));
      col.assign(mix(col, hazeC, hz.mul(hzK)));
      If(dist.greaterThan(0.0035), () => {
        const A = atmosphere(ro, V.negate(), dist, L, low ? 3 : 4, u.uAtmo).toVar();
        col.assign(mix(col, col.mul(A.w).add(A.rgb), hk.mul(hzK)));
      });
    }
    if (DBG) return vec4(dbgV, 1);
    return vec4(col, 1);
  })();
  return mat;
}

/** The additive shell: the same scattering for rays that miss (or graze) the planet, i.e. the limb glow. */
function atmosphereMaterial(globeU, low) {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.colorNode = Fn(() => {
    const ro = globeU.uCam, rd = normalize(positionLocal.sub(ro));
    // distance to the planet along the ray (if it hits)
    const b = dot(ro, rd), c = dot(ro, ro).sub(1), disc = b.mul(b).sub(c);
    const tp = select(disc.greaterThan(0).and(b.lessThan(0)), b.negate().sub(sqrt(max(disc, 0))), float(1e9));
    const A = atmosphere(ro, rd, tp, globeU.uSun, low ? 4 : 6, globeU.uAtmo);
    // T1 (the camera sits at the top of the shell): the outer glow is cut short so the limb is a thin bright arc over black space, not a murky band
    const th = max(select(b.lessThan(0), sqrt(max(dot(ro, ro).sub(b.mul(b)), 0)), length(ro)).sub(1), 0), thin = float(1).sub(globeU.uAtmoH).div(0.65);
    return vec4(A.rgb.mul(mix(float(1), exp(th.div(-0.0085 * 3.2 * 0.4)), thin)), 1);
  })();
  return m;
}

// ---------------------------------------------------------------- the Moon
function moonMaterial(globeU) {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  m.colorNode = Fn(() => {
    const d = normalize(positionGeometry);
    const maria = sstep(-0.04, 0.22, mx_fractal_noise_float(d.mul(2.1).add(vec3(1.3, 4.1, 2.2)), 4, 2, 0.55, 1));
    const rimFloor = (w) => exp(pow(w.sub(0.36).mul(8), 2).negate()).mul(0.5).sub(sstep(0.36, 0.1, w).mul(0.45)); // bright rim ring, dark floor
    const grain = mx_fractal_noise_float(d.mul(160), 3, 2, 0.5, 1);
    const cr = rimFloor(mx_worley_noise_float(d.mul(9))).mul(0.9).add(rimFloor(mx_worley_noise_float(d.mul(24))).mul(0.7)).add(rimFloor(mx_worley_noise_float(d.mul(64))).mul(0.5)).add(rimFloor(mx_worley_noise_float(d.mul(150))).mul(0.3));
    const alb = mix(vec3(0.3, 0.29, 0.28), vec3(0.62, 0.6, 0.57), maria).mul(float(1).add(cr.mul(mix(0.5, 1.0, maria)))).mul(float(1).add(grain.mul(0.3)));
    const nrm = d;
    const nd = dot(nrm, globeU.uSun), diff = sstep(0.0, 0.1, nd).mul(nd.mul(0.8).add(0.2).max(0));
    return vec4(alb.mul(diff.mul(2.7).add(0.006)), 1);
  })();
  return m;
}

// ---------------------------------------------------------------- the sky: Milky Way band, a sun glow and 4k stars
function skyDome(globeU) {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.BackSide, transparent: true, depthWrite: false }); // (depth-tested after the planet: only the sky pixels pay for the noise)
  m.colorNode = Fn(() => {
    const d = normalize(positionGeometry);
    const axis = normalize(vec3(0.34, 0.86, 0.38));
    const lat = dot(d, axis);
    const band = exp(pow(lat.div(0.2), 2).negate());
    const f = mx_fractal_noise_float(d.mul(3.2), 4, 2.1, 0.55, 1), f2 = mx_fractal_noise_float(d.mul(9).add(vec3(5, 1, 2)), 3, 2, 0.5, 1);
    const core = exp(pow(dot(d, normalize(vec3(0.7, 0.1, -0.5))).sub(0.9).mul(4), 2).negate());
    const dust = sstep(0.1, 0.5, f2).mul(0.55);
    const mw = band.mul(sstep(-0.3, 0.55, f).mul(0.8).add(0.2)).mul(float(1).sub(dust.mul(band))).mul(core.mul(0.7).add(0.3));
    const col = mix(vec3(0.45, 0.55, 1.0), vec3(0.95, 0.85, 0.75), core.mul(0.6)).mul(mw).mul(0.05);
    const sd = max(dot(d, globeU.uSun), 0);
    return vec4(col.add(vec3(1.0, 0.9, 0.75).mul(pow(sd, 3500).mul(9).add(pow(sd, 90).mul(0.05)))).add(vec3(0.0015, 0.002, 0.004)), 1);
  })();
  return m;
}

function starPoints(n, seed = 5) {
  let a = seed;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const z = rnd() * 2 - 1, ph = rnd() * PI * 2, r = Math.sqrt(1 - z * z);
    pos.set([Math.cos(ph) * r, z, Math.sin(ph) * r], i * 3);
    const mag = Math.pow(rnd(), 4.5); // few bright, many faint
    c.setHSL(rnd() < 0.5 ? 0.6 : rnd() < 0.5 ? 0.1 : 0.0, 0.5 * rnd(), 0.5 + 0.5 * mag);
    col.set([c.r * (0.3 + 1.6 * mag), c.g * (0.3 + 1.6 * mag), c.b * (0.3 + 1.6 * mag)], i * 3);
    size[i] = 1.6 + mag * 2.2;
  }
  return { pos, col, size };
}

// ---------------------------------------------------------------- the local patch (T1-T3): geometry layout
export const TRAIL = 512; // the fine trail map resolution (texels across the patch)
/** Vertex counts and the shared index buffer of an n x n patch grid plus its skirt (4 sides, n verts each). */
export function patchLayout(n) {
  const grid = n * n, count = grid + 4 * n;
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  // skirt: side 0 = j 0, 1 = j n-1, 2 = i 0, 3 = i n-1; skirt vertex k mirrors border vertex k, lowered by the builder
  const border = (s, k) => (s === 0 ? k : s === 1 ? (n - 1) * n + k : s === 2 ? k * n : k * n + n - 1);
  for (let s = 0; s < 4; s++) for (let k = 0; k < n - 1; k++) {
    const a = border(s, k), b = border(s, k + 1), a2 = grid + s * n + k, b2 = grid + s * n + k + 1;
    idx.push(a, a2, b, b, a2, b2);
  }
  return { grid, count, index: new Uint32Array(idx), border };
}

// ---------------------------------------------------------------- the class
/**
 * new PlanetGlobe(bake, { quality, relief, segments })
 *   .group     planet-space group (globe, patch, atmosphere shell, Moon): place/rotate this. Globe mesh scale = R (metres).
 *   .sky       add to the scene root (not the group); follows the camera in update()
 *   .update(camera, dt)  refresh uCam (camera in planet units), cloud drift, sky follow
 *   .setSun(v3)          sun direction in PLANET space
 *   .setRelief(E)        vertical exaggeration (1..6)
 *   .biteTex             DataArrayTexture 6 x B x B R8 (255 = untouched land): write .image.data then biteTex.needsUpdate = true
 *   .setHole(i, dir, angle)  spherical cap i (0..MAX_HOLES-1), dir in planet space, half-angle in radians (0 clears)
 *   .patch               the local detail patch mesh (planet.js fills it: see commitPatch); .trailTex its fine trail map (R8, TRAIL^2)
 *   .facet(dir, out)     the globe's own (flat-faceted) surface under a direction: out.sag (m, <= 0) and out.h (interpolated vertex height, m)
 *   .u                   all uniforms
 */
export class PlanetGlobe {
  constructor(bake, { quality = 'high', relief = 3, segments = null, B = 1024, moonDist = 12 } = {}) {
    const low = quality === 'low';
    this.N = bake.N; this.B = B;
    this.surfTex = dataArray(bake.surf, bake.N, 6, THREE.RGBAFormat);
    this.nightTex = dataArray(bake.night, bake.N, 6, THREE.RGFormat);
    this.biteTex = dataArray(new Uint8Array(6 * B * B).fill(255), B, 6, THREE.RedFormat);
    // food.js footprints in patch space like the trail: RGBA = settlement density, woods, road distance field, (spare)
    this.mapData = new Uint8Array(TRAIL * TRAIL * 4);
    this.mapTex = new THREE.DataTexture(this.mapData, TRAIL, TRAIL, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.mapTex.minFilter = this.mapTex.magFilter = THREE.LinearFilter; this.mapTex.generateMipmaps = false; this.mapTex.needsUpdate = true;
    this.gt = bakeGroundTextures(quality); // the baked ground patterns (fields, canopy, streets, relief)
    this.trailData = new Uint8Array(TRAIL * TRAIL);
    this.trailTex = new THREE.DataTexture(this.trailData, TRAIL, TRAIL, THREE.RedFormat, THREE.UnsignedByteType);
    this.trailTex.minFilter = this.trailTex.magFilter = THREE.LinearFilter;
    this.trailTex.generateMipmaps = false; this.trailTex.unpackAlignment = 1; this.trailTex.needsUpdate = true;
    this.u = planetUniforms();
    const mo = { surf: this.surfTex, night: this.nightTex, bite: this.biteTex, trail: this.trailTex, map: this.mapTex, gt: this.gt, N: bake.N, B, quality, u: this.u };
    this.material = planetMaterial({ ...mo, map: null, gt: null }); // (the globe: macro colour only)
    this.u.uRelief.value = relief;
    const n = segments ?? (quality === 'low' ? 64 : quality === 'medium' ? 96 : 128);
    this.n = n;
    this.globe = new THREE.Mesh(cubeSphere(n, bake.surf, bake.N), this.material);
    this.globe.scale.setScalar(R);
    this.globe.frustumCulled = false;
    // the local patch: one mesh whose attributes are rewritten in place (no new pipelines at a rebuild)
    this.PN = low ? 97 : 129;
    const lay = this.layout = patchLayout(this.PN);
    const g = new THREE.BufferGeometry();
    const mk = (k) => new THREE.BufferAttribute(new Float32Array(lay.count * k), k).setUsage(THREE.DynamicDrawUsage);
    for (const [name, k] of [['position', 3], ['aDir', 3], ['aH', 1], ['aHm', 1], ['aG', 3], ['aS', 2], ['aUV', 2]]) g.setAttribute(name, mk(k));
    g.setIndex(new THREE.BufferAttribute(lay.index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.patchMat = planetMaterial({ ...mo, patch: true });
    this.patchMat.side = THREE.DoubleSide;
    this.patch = new THREE.Mesh(g, this.patchMat);
    this.patch.frustumCulled = false; this.patch.visible = false;
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(RA, low ? 48 : 96, low ? 24 : 48), atmosphereMaterial(this.u, low));
    this.atmo.scale.setScalar(R); this.atmo.frustumCulled = false; this.atmo.renderOrder = 5;
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), moonMaterial(this.u));
    this.moon.scale.setScalar(1737400);
    this.moonDir = new THREE.Vector3(-0.55, 0.28, -0.78).normalize();
    this.moon.position.copy(this.moonDir).multiplyScalar(R * moonDist);
    this.moon.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.globe, this.patch, this.atmo, this.moon);
    // sky
    this.sky = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyDome(this.u));
    dome.renderOrder = 4; dome.frustumCulled = false;
    const sp = starPoints(low ? 2500 : 4500);
    const mat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false });
    this.uStarR = uniform(1e8);
    mat.positionNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(sp.pos, 3)).mul(this.uStarR).add(cameraPosition);
    mat.sizeNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(sp.size, 1));
    const dd = uv().sub(0.5).length();
    mat.colorNode = vec4(instancedBufferAttribute(new THREE.InstancedBufferAttribute(sp.col, 3)).mul(pow(smoothstep(0.5, 0.0, dd), 1.6)).mul(1.5), 1);
    this.stars = new THREE.Sprite(mat);
    this.stars.count = sp.size.length;
    this.stars.frustumCulled = false;
    this.sky.add(dome, this.stars);
    this.dome = dome;
    this._v = new THREE.Vector3();
    this._t = 0;
  }

  setSun(v) { this.u.uSun.value.copy(v).normalize(); }
  setRelief(e) { this.u.uRelief.value = e; }
  setHole(i, dir, angle) { this.u.uHoles[i].value.set(dir.x, dir.y, dir.z, angle > 0 ? Math.cos(angle) : 2); }

  /** The globe's flat facet under `d` (unit, planet space): sag (m, <= 0: the facet dips under the sphere) and h (vertex heights interpolated, m). */
  facet(d, out = {}) {
    const n = this.n, v1 = n + 1, g = this.globe.geometry, pos = g.attributes.position.array, aH = g.attributes.aH.array;
    const { f, s, t } = dirFace(d);
    const x = (s * 0.5 + 0.5) * n, y = (t * 0.5 + 0.5) * n, i = Math.min(n - 1, Math.floor(x)), j = Math.min(n - 1, Math.floor(y)), fx = x - i, fy = y - j;
    const a = f * v1 * v1 + j * v1 + i, b = a + 1, c = a + v1, e = c + 1;
    const [p, q, r2] = fx + fy < 1 ? [a, b, c] : [b, e, c];
    const px = pos[p * 3], py = pos[p * 3 + 1], pz = pos[p * 3 + 2];
    const e1x = pos[q * 3] - px, e1y = pos[q * 3 + 1] - py, e1z = pos[q * 3 + 2] - pz, e2x = pos[r2 * 3] - px, e2y = pos[r2 * 3 + 1] - py, e2z = pos[r2 * 3 + 2] - pz;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const tt = (nx * px + ny * py + nz * pz) / (nx * d.x + ny * d.y + nz * d.z); // the ray t * d meets the plane at t
    const qx = d.x * tt - px, qy = d.y * tt - py, qz = d.z * tt - pz; // (barycentrics of that point in the triangle)
    const d11 = e1x * e1x + e1y * e1y + e1z * e1z, d12 = e1x * e2x + e1y * e2y + e1z * e2z, d22 = e2x * e2x + e2y * e2y + e2z * e2z;
    const d1 = qx * e1x + qy * e1y + qz * e1z, d2 = qx * e2x + qy * e2y + qz * e2z, den = d11 * d22 - d12 * d12;
    const w1 = (d22 * d1 - d12 * d2) / den, w2 = (d11 * d2 - d12 * d1) / den;
    out.sag = (tt - 1) * R;
    out.h = aH[p] * (1 - w1 - w2) + aH[q] * w1 + aH[r2] * w2;
    return out;
  }

  /** Show the patch (arrays already written into this.patch.geometry attributes): anchor dir/half extent for the globe discard + mesh placement. */
  commitPatch(anchor, half) {
    const g = this.patch.geometry;
    for (const k of Object.keys(g.attributes)) g.attributes[k].needsUpdate = true;
    this.patch.position.set(anchor.x * R, anchor.y * R, anchor.z * R);
    this.patch.visible = true;
    this.u.uPatch.value.set(anchor.x, anchor.y, anchor.z, Math.cos((half * 0.9) / R));
  }
  hidePatch() { this.patch.visible = false; this.u.uPatch.value.w = 2; }

  update(camera, dt = 0, viewH = 1080) {
    this._t += dt;
    this.group.updateWorldMatrix(true, false);
    this.globe.updateWorldMatrix(true, false);
    this._v.copy(camera.position);
    this.globe.worldToLocal(this._v);
    this.u.uCam.value.copy(this._v);
    this.u.uTime.value = this._t;
    this.u.uPx.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / viewH;
    const a = this._t * 0.004;
    this.u.uCloudRot.value.set(Math.cos(a), Math.sin(a));
    // up close the ground fills the view: the sky, the shell and the Moon would only cost fill rate
    const alt = camera.position.y - this.group.position.y - R, hi = alt > 120000;
    this.sky.visible = this.atmo.visible = this.moon.visible = hi;
    const far = camera.far * 0.9;
    this.dome.position.copy(camera.position);
    this.dome.scale.setScalar(far);
    this.uStarR.value = far * 0.98;
  }

  dispose() { this.surfTex.dispose(); this.nightTex.dispose(); this.biteTex.dispose(); this.trailTex.dispose(); this.mapTex.dispose(); for (const k of Object.values(this.gt)) k.dispose(); this.globe.geometry.dispose(); this.patch.geometry.dispose(); }
}
