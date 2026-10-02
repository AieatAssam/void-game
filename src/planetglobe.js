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
  floor, fract, If, Discard, positionWorld,
} from 'three/tsl';
import { makePlanet, bakeRows, faceDir, dirFace, R, SQ_MIN, SQ_STEP, decodeHeight } from './planetgen.js';
import { MAX_HOLES } from './hole.js';

export { R };
const PI = Math.PI;
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
function atmosphere(ro, rd, tmax, L, n) {
  const bR = vec3(...BETA_R), b = dot(ro, rd), c = dot(ro, ro).sub(RA * RA), sq = sqrt(max(b.mul(b).sub(c), 0));
  const t0 = max(b.negate().sub(sq), 0).toVar(), t1 = min(b.negate().add(sq), tmax), len = max(t1.sub(t0), 0), dt = len.div(n);
  let odR = float(0), odM = float(0), sumR = vec3(0), sumM = vec3(0);
  for (let i = 0; i < n; i++) {
    const p = ro.add(rd.mul(t0.add(dt.mul(i + 0.5)))), pl = length(p), h = max(pl.sub(1), 0);
    const dR = exp(h.div(-HR)).mul(dt), dM = exp(h.div(-HM)).mul(dt);
    odR = odR.add(dR); odM = odM.add(dM);
    const mu = dot(p.div(pl), L), horizon = sqrt(max(float(1).sub(float(1).div(pl.mul(pl))), 0)).negate();
    const vis = sstep(horizon.sub(0.07), horizon.add(0.14), mu); // planet shadow, soft
    const pf = float(1).div(max(mu.mul(0.9).add(0.2), 0.07)); // sun path ~ H / (mu + a bit)
    const lightT = exp(bR.mul(exp(h.div(-HR)).mul(HR)).add(exp(h.div(-HM)).mul(HM * BETA_M)).mul(pf).negate());
    const viewT = exp(bR.mul(odR).add(odM.mul(BETA_M)).negate());
    sumR = sumR.add(viewT.mul(lightT).mul(dR).mul(vis));
    sumM = sumM.add(viewT.mul(lightT).mul(dM).mul(vis));
  }
  const cs = dot(rd, L), g = 0.78;
  const phR = cs.mul(cs).add(1).mul(0.0596831), phM = float(1 - g * g).div(pow(float(1 + g * g).sub(cs.mul(2 * g)), 1.5)).mul(0.0795775);
  const inS = sumR.mul(bR).mul(phR).add(sumM.mul(BETA_M).mul(phM)).mul(SUN_I);
  const T = exp(bR.mul(odR).add(odM.mul(BETA_M)).negate());
  return vec4(inS, T.y);
}

// ---------------------------------------------------------------- the material
/** Uniforms shared by the globe, the patch (and later the minimap globe). */
export function planetUniforms() {
  return {
    uSun: uniform(new THREE.Vector3(0.8, 0.25, 0.55).normalize()), uCam: uniform(new THREE.Vector3(0, 0, 3)),
    uRelief: uniform(3), uDetail: uniform(1), uCloudRot: uniform(new THREE.Vector2(1, 0)), uBorders: uniform(0), uClouds: uniform(1),
    uHoles: Array.from({ length: MAX_HOLES }, () => uniform(new THREE.Vector4(0, 1, 0, 2))), uTime: uniform(0),
    uCut: uniform(0), // hole radius (m) of the flat cut in RENDER space (the hole sits at the origin); 0 = none (cap mode)
    uPatch: uniform(new THREE.Vector4(0, 1, 0, 2)), // the globe is discarded inside this disc (xyz anchor dir, w cos radius; w > 1 = off)
    uWoundG: uniform(3000), // metres a fully eaten bite-map texel sinks
    uWoundP: uniform(800), // metres a full fine-trail texel sinks (patch)
    uBiteWp: uniform(0), // how much of the bite map the patch shows (0 while the hole is far smaller than a texel)
    uGcellA: uniform(1e4), uGfr: uniform(0), uGroundK: uniform(1), // close-ground pattern scale: cells per face unit, octave blend, strength
    uPx: uniform(0.0005), // metres per pixel per metre of view distance
  };
}

// two-octave field / settlement patterns on the cube-face plane (so they never swim as r grows: octaves cross-fade)
const fieldLayer = (q, hw, rowK) => {
  const q0 = q.mul(vec2(1.0, 0.62)), wp = vec2(mx_noise_float(vec3(q0.mul(0.24), 1.7)), mx_noise_float(vec3(q0.mul(0.24), 8.3))).mul(1.0);
  const qq = q0.add(wp), cell = floor(qq), f = fract(qq), r = mx_cell_noise_vec3(cell);
  let col = srgb(0.72, 0.6, 0.3); // wheat
  col = mix(col, srgb(0.4, 0.57, 0.18), step(0.2, r.x));
  col = mix(col, srgb(0.24, 0.43, 0.14), step(0.36, r.x));
  col = mix(col, srgb(0.52, 0.38, 0.23), step(0.5, r.x)); // fallow
  col = mix(col, srgb(0.84, 0.72, 0.2), step(0.62, r.x)); // rapeseed
  col = mix(col, srgb(0.6, 0.69, 0.33), step(0.7, r.x)); // pasture
  col = mix(col, srgb(0.38, 0.25, 0.17), step(0.86, r.x)); // plough
  const a = r.y.mul(6.2832), rows = sin(dot(qq, vec2(a.cos(), a.sin())).mul(46)).mul(0.5).add(0.5);
  col = col.mul(float(0.94).add(rows.mul(0.12).mul(rowK)).add(r.z.mul(0.1)));
  const ed = min(min(f.x, float(1).sub(f.x)), min(f.y, float(1).sub(f.y)));
  const hedge = float(1).sub(smoothstep(hw.mul(0.3), hw, ed));
  return vec4(mix(col, srgb(0.1, 0.22, 0.09), hedge.mul(0.85)), hedge);
};
const townLayer = (q, dens) => {
  const cell = floor(q), f = fract(q), r = mx_cell_noise_vec3(cell), r2 = mx_cell_noise_vec3(cell.add(vec2(17.3, 5.1)));
  const ctr = vec2(0.3, 0.3).add(r.yz.mul(0.4)), d = length(f.sub(ctr)), rad = float(0.16).add(r.x.mul(0.16)).mul(clamp(dens.mul(2.6), 0.5, 1.45));
  const present = step(r2.x, dens.mul(0.7).sub(0.12));
  const m = float(1).sub(smoothstep(rad.mul(0.9), rad, d)).mul(present);
  const lp = f.sub(ctr).div(rad).mul(3.2).add(0.5), fb = fract(lp), blk = mx_cell_noise_vec3(floor(lp).add(floor(q).mul(5.0)));
  const st = min(min(fb.x, float(1).sub(fb.x)), min(fb.y, float(1).sub(fb.y)));
  const street = sstep(0.13, 0.07, st).mul(float(1).sub(smoothstep(rad.mul(0.5), rad.mul(0.85), d)));
  let roof = srgb(0.5, 0.25, 0.18);
  roof = mix(roof, srgb(0.3, 0.32, 0.37), step(0.3, blk.x));
  roof = mix(roof, srgb(0.56, 0.48, 0.38), step(0.6, blk.x));
  roof = mix(roof, srgb(0.4, 0.38, 0.36), step(0.85, blk.x));
  roof = mix(roof, srgb(0.3, 0.45, 0.22), step(0.88, blk.y).mul(0.7)); // gardens
  return { col: mix(roof.mul(float(0.85).add(blk.z.mul(0.3))).mul(float(0.7).add(sstep(0.12, 0.36, st).mul(0.5))), srgb(0.16, 0.16, 0.18), street), m, lit: step(0.55, blk.y).mul(float(1).sub(street)).mul(m) };
};
const treeLayer = (q) => {
  const cell = floor(q), f = fract(q), r = mx_cell_noise_vec3(cell);
  const d = length(f.sub(vec2(0.3, 0.3).add(r.xy.mul(0.4))));
  const crown = sstep(0.34, 0.16, d);
  return { col: mix(srgb(0.07, 0.2, 0.08), srgb(0.2, 0.4, 0.13), r.z.mul(0.7).add(sstep(0.3, 0.0, d).mul(0.3))), m: crown };
};

/**
 * planetMaterial({ surf, night, bite, trail, N, B, quality, patch, u }) -> NodeMaterial with .userData.u (uniforms).
 * patch = false: the globe (positionGeometry = unit direction, `aH` = height). patch = true: the local detail patch: positions are
 * relative to the patch anchor (float precision), `aDir` the unit direction, `aH` the real signed height, `aHm` the height used to
 * morph the rim into the globe, `aG` the slope vector, `aUV` the trail-map coordinates.
 * Uniforms: uSun (planet space), uCam (camera in planet units), uRelief (E), uDetail, uCloudRot, uBorders, uHoles[i] (vec4: dir.xyz,
 * cos(angle); w > 1 = empty), uCut (flat hole cut, metres, render space), uPatch (globe discard disc), uWoundG/uWoundP (wound depth, m).
 */
export function planetMaterial({ surf, night, bite, trail = null, N = 512, B = 1024, quality = 'high', patch = false, u = planetUniforms() }) {
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
    const toCam = ro.sub(P), dist = length(toCam), V = toCam.div(dist);
    // ---- the bake
    const S = sampleFace(surf, N, dir).toVar();
    const st = faceST(dir).toVar();
    let e, nrm, slope;
    const dn = mx_fractal_noise_float(dir.mul(80), 2, 2.3, 0.5, 1).mul(u.uDetail).toVar(); // fractal coasts and relief detail
    if (patch) { // the real heights, interpolated; the slope vector from the CPU
      e = aH.toVar();
      const aG = attribute('aG', 'vec3');
      nrm = normalize(dir.sub(aG.mul(u.uRelief))).toVar();
      slope = length(aG).mul(u.uRelief).toVar();
    } else {
      const e0 = heightOf(S.r);
      e = e0.add(dn.mul(mix(10, 110, sstep(-30, 60, e0)))).toVar();
      // relief normal from two more taps (about one texel out)
      const ax = select(abs(dir.y).lessThan(0.99), vec3(0, 1, 0), vec3(1, 0, 0));
      const t1 = normalize(cross(dir, ax)), t2 = cross(dir, t1), del = 0.0042;
      const hh = (d2) => max(heightOf(sampleFace(surf, N, normalize(d2)).r), 0);
      const hc = max(e0, 0), g1 = hh(dir.add(t1.mul(del))).sub(hc).div(del), g2 = hh(dir.add(t2.mul(del))).sub(hc).div(del);
      const k = u.uRelief.div(R);
      nrm = normalize(dir.sub(t1.mul(g1.mul(k))).sub(t2.mul(g2.mul(k)))).toVar();
      slope = length(vec2(g1, g2)).mul(k).toVar();
    }
    const T0 = S.g, M = S.b;
    const nl = dot(nrm, L), nlGeo = dot(dir, L).toVar();
    const day = sstep(-0.2, 0.22, nlGeo);
    // ---- light
    const warm = mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.95, 0.88), sstep(0.0, 0.42, nlGeo));
    const sunLit = warm.mul(3.1);
    const amb = vec3(0.05, 0.085, 0.16).mul(sstep(-0.35, 0.45, nlGeo)).add(vec3(0.0035, 0.0055, 0.011));
    const landMask = sstep(-2, 5, e).toVar();
    const nm = mx_fractal_noise_float(dir.mul(34).add(vec3(3.1, 1.7, 5.2)), 3, 2, 0.5, 1).toVar();
    const near = sstep(2.2, 0.35, dist).toVar(); // fine detail only when close
    // ---- wound (bite map + the patch's fine trail): eaten land sinks; strata walls over a glowing mantle
    const rem = sampleFace(bite, B, dir).r.toVar();
    const trF = patch ? texture(trail, attribute('aUV', 'vec2')).r : float(0);
    const wound = max(trF, float(1).sub(rem).mul(patch ? u.uBiteWp : float(1))).mul(landMask).toVar();
    // ---- clouds (drifting) and their shadow on the ground: only seen from a few hundred km up
    const cloud = float(0).toVar(), cn = float(0).toVar(), cloudRaw = float(0).toVar(), shadow = float(1).toVar();
    const dr = vec3(dir.x.mul(u.uCloudRot.x).add(dir.z.mul(u.uCloudRot.y)), dir.y, dir.z.mul(u.uCloudRot.x).sub(dir.x.mul(u.uCloudRot.y)));
    if (!OFF.has('cloud')) If(dist.greaterThan(0.0015), () => {
      cn.assign(mx_noise_float(dr.mul(80)).mul(0.17).add(mx_noise_float(dr.mul(230)).mul(0.12)).add(mx_noise_float(dr.mul(640)).mul(0.05)).mul(u.uDetail));
      cloudRaw.assign(sampleFace(night, N, normalize(dr)).g);
      cloud.assign(sstep(0.3, 0.68, cloudRaw.add(cn)).mul(u.uClouds).mul(sstep(0.0015, 0.02, dist))); // (no cloud skin up against the lens)
      if (!low) {
        const ds = normalize(dr.add(L.sub(dr.mul(dot(dr, L))).mul(0.006)));
        shadow.assign(float(1).sub(sstep(0.3, 0.68, sampleFace(night, N, ds).g.add(cn)).mul(0.5).mul(sstep(0, 0.25, nlGeo)).mul(sstep(0.0015, 0.02, dist))));
      }
    });
    const oceanCol = vec3(0).toVar(), landCol = vec3(0).toVar(), townLitV = float(0).toVar();
    // ---- the sea
    If(landMask.lessThan(0.999), () => {
      const depth = max(e.negate(), 0);
      const iceO = sstep(0.16, 0.07, T0.add(nm.mul(0.05)));
      let oc = mix(srgb(0.05, 0.46, 0.5), srgb(0.03, 0.3, 0.48), sstep(0, 130, depth));
      oc = mix(oc, srgb(0.02, 0.2, 0.4), sstep(80, 1200, depth));
      oc = mix(oc, srgb(0.008, 0.1, 0.27), sstep(900, 3000, depth));
      oc = mix(oc, srgb(0.003, 0.04, 0.16), sstep(2600, 4600, depth));
      oc = oc.mul(float(1).add(nm.mul(0.18))); // broad tint variation
      oc = mix(oc, srgb(0.84, 0.92, 0.98).mul(float(0.92).add(nm.mul(0.14))), iceO); // sea ice
      const wv = low || OFF.has('wave') ? vec3(0) : mx_noise_vec3(dir.mul(1500).add(vec3(u.uTime.mul(0.04), 0, 0))).mul(0.014).mul(u.uDetail).add(mx_noise_float(vec3(st.xy.mul(u.uGcellA.mul(3)), u.uTime.mul(0.2))).mul(0.02).mul(near).mul(vec3(1, 0.3, 0.7)));
      const on = normalize(dir.add(wv));
      const Hh = normalize(L.add(V)), nh = max(dot(on, Hh), 0), nv = max(dot(on, V), 0);
      const fres = float(0.02).add(pow(float(1).sub(nv), 5).mul(0.98));
      const glint = pow(nh, 2200).mul(10).add(pow(nh, 260).mul(0.3)).mul(fres.mul(8).add(0.4)).mul(step(0, nlGeo)).mul(sstep(0, 0.05, dot(on, L)));
      const diffO = max(dot(on, L), 0).mul(0.9).add(0.05);
      const skyRef = vec3(0.16, 0.3, 0.6).mul(sstep(-0.3, 0.5, nlGeo).mul(0.9).add(0.04));
      oc = mix(oc, srgb(0.3, 0.78, 0.72), sstep(30, 0, depth).mul(0.45).mul(float(1).sub(iceO))); // shallows near a coast: lighter
      const foam = sstep(10, 0, depth).mul(sstep(0.55, 0.9, mx_noise_float(vec3(st.xy.mul(u.uGcellA.mul(4)), u.uTime.mul(0.3))).mul(0.5).add(0.5))).mul(near);
      oc = mix(oc, vec3(0.9, 0.97, 1.0), foam.mul(0.6));
      oceanCol.assign(oc.mul(sunLit.mul(diffO).mul(day).add(amb)).add(skyRef.mul(fres).mul(1.1)).add(sunLit.mul(glint).mul(float(1).sub(iceO).mul(0.55))));
    });
    // ---- the land: climate (T, M) + altitude + slope, then the close ground, then the wound
    If(landMask.greaterThan(0.001), () => {
      const Te = T0.sub(max(e.sub(400), 0).div(9000)).add(nm.mul(0.05)).toVar();
      const hot = sstep(0.52, 0.74, Te), cold = sstep(0.42, 0.2, Te);
      const mildC = mix(mix(srgb(0.68, 0.57, 0.38), srgb(0.46, 0.53, 0.27), sstep(0.06, 0.22, M)), mix(srgb(0.33, 0.49, 0.19), srgb(0.1, 0.3, 0.12), sstep(0.4, 0.68, M)), sstep(0.22, 0.42, M));
      const warmC = mix(mix(srgb(0.8, 0.64, 0.4), srgb(0.66, 0.57, 0.27), sstep(0.18, 0.42, M)), mix(srgb(0.3, 0.46, 0.14), srgb(0.05, 0.25, 0.09), sstep(0.6, 0.85, M)), sstep(0.42, 0.62, M));
      const coolC = mix(srgb(0.5, 0.52, 0.44), srgb(0.1, 0.23, 0.17), sstep(0.35, 0.55, M));
      const land = mix(mix(mildC, warmC, hot), coolC, cold).toVar();
      const fine = mx_fractal_noise_float(dir.mul(300), 3, 2.2, 0.5, 1).mul(near).mul(u.uDetail);
      land.mulAssign(float(1).add(nm.mul(0.55)).add(fine.mul(0.35)));
      const rockC = mix(srgb(0.42, 0.37, 0.33), srgb(0.55, 0.48, 0.4), sstep(-0.3, 0.4, nm)), rockAmt = max(sstep(0.22, 0.6, slope), sstep(1900, 3800, e.add(nm.mul(600)))).toVar();
      // the close ground (hole scale): fields, hedges, woods, villages and towns, in two cross-faded octaves
      const sr = vec2(st.x.mul(0.906).sub(st.y.mul(0.423)), st.x.mul(0.423).add(st.y.mul(0.906))); // (fields are not square to the cube: a 25 degree turn)
      const gK = u.uGroundK.mul(near).toVar();
      If(gK.greaterThan(0.01).and(float(OFF.has('ground') ? 0 : 1).greaterThan(0.5)), () => {
        const pxM = dist.mul(R).mul(u.uPx), sA = float(5.0e6).div(u.uGcellA), fr = u.uGfr;
        const cult = sstep(1000, 300, e).mul(sstep(0.26, 0.4, Te)).mul(sstep(0.12, 0.24, M)).mul(float(1).sub(sstep(0.18, 0.32, slope))).mul(float(1).sub(sstep(0.8, 0.95, Te))).mul(float(1).sub(rockAmt)).toVar();
        const wood = sstep(0.52, 0.7, M.add(nm.mul(0.25))).mul(sstep(0.7, 0.4, Te).max(0.35)).mul(float(1).sub(rockAmt)).toVar();
        const dens = clamp(sampleFace(night, N, dir).r.mul(1.5), 0, 1).mul(sstep(0.4, 0.15, slope)).toVar(); // (night.R: city light density)
        const faceOff = vec2(st.z.mul(113.7), st.z.mul(57.1));
        const pA = sr.mul(u.uGcellA).add(faceOff), pB = sr.mul(u.uGcellA.mul(0.5)).add(faceOff.mul(0.5));
        const fr2 = smoothstep(0.35, 0.65, fr), fadeA = sstep(1.2, 5, sA.div(pxM)), fadeB = sstep(1.2, 5, sA.mul(2).div(pxM));
        const hwA = clamp(pxM.mul(1.1).div(sA), 0.035, 0.14), hwB = clamp(pxM.mul(1.1).div(sA.mul(2)), 0.035, 0.14);
        const fieldV = vec3(0).toVar(), treeMV = float(0).toVar(), treeCV = vec3(0).toVar(), townMV = float(0).toVar(), townCV = vec3(0).toVar();
        const addOct = (p, hw, fade, w) => { // one octave of the pattern stack, weighted (only the octaves with weight are evaluated)
          fieldV.addAssign(mix(srgb(0.46, 0.5, 0.24), fieldLayer(p, hw, fade).rgb, fade).mul(w));
          If(wood.greaterThan(0.04), () => { const t = treeLayer(p.mul(5.0)); treeMV.addAssign(t.m.mul(fade).mul(w)); treeCV.addAssign(t.col.mul(w)); });
          If(dens.greaterThan(0.08), () => { const q = townLayer(p.mul(0.2), dens); townMV.addAssign(q.m.mul(fade).mul(w)); townCV.addAssign(q.col.mul(w)); townLitV.addAssign(q.lit.mul(fade).mul(w)); });
        };
        If(fr2.lessThan(0.98), () => addOct(pA, hwA, fadeA, float(1).sub(fr2)));
        If(fr2.greaterThan(0.02), () => addOct(pB, hwB, fadeB, fr2));
        const fieldC = fieldV, treeM = treeMV, treeC = treeCV, townM = townMV, townC = townCV;
        land.assign(mix(land, fieldC.mul(float(1).add(nm.mul(0.3))), cult.mul(gK).mul(0.92)));
        land.assign(mix(land, treeC, wood.mul(treeM).mul(gK).mul(float(1).sub(cult.mul(0.6)))));
        land.assign(mix(land, townC.mul(0.8), townM.mul(gK).mul(0.9).mul(float(1).sub(rockAmt)).mul(sstep(0.0, 400, float(2000).sub(e)))));
      });
      land.assign(mix(land, rockC, rockAmt.mul(0.9)));
      const snowLine = mix(1800, 6400, sstep(0.0, 0.75, T0.add(nm.mul(0.06)))), snow = sstep(snowLine.sub(500), snowLine.add(900), e.add(nm.mul(700))).mul(float(1).sub(sstep(0.35, 1.0, slope).mul(0.75)));
      const ice = sstep(0.16, 0.05, Te.add(nm.mul(0.05)));
      const white = mix(srgb(0.66, 0.79, 0.94), srgb(0.96, 0.975, 1.0), clamp(nm.mul(1.4).add(0.55).add(fine.mul(0.9)), 0, 1)); // snow and ice: blue in the hollows, bright on the ridges
      land.assign(mix(land, white, max(snow, ice)));
      land.assign(mix(land, vec3(0.9, 0.82, 0.62), S.a.mul(u.uBorders).mul(0.7)));
      const diffL = clamp(nl.add(0.12).div(1.12), 0, 1);
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
        glow.assign(vec3(1.0, 0.36, 0.07).mul(lip.mul(2.2).add(floorK.mul(crk).mul(2.2).add(floorK.mul(0.06)))).add(vec3(0.42, 0.2, 0.95).mul(floorK).mul(0.08)));
      });
      landCol.assign(land.mul(sunLit.mul(diffL).mul(day).mul(shadow).add(amb)).add(glow));
    });
    // ---- surface = ocean/land, then lights and clouds on top
    const col = mix(oceanCol, landCol, landMask).toVar();
    const dark = sstep(-0.02, -0.2, nlGeo).mul(float(1).sub(cloud.mul(0.8))).mul(float(1).sub(wound.mul(4).min(1))).toVar();
    If(dark.greaterThan(0.002), () => { // night lights: clustered, speckled, off in cloud and in eaten land
      const nlight = sampleFace(night, N, dir).r.toVar();
      const cl1 = mx_noise_float(dir.mul(640)).mul(0.5).add(0.5), cl2 = mx_noise_float(dir.mul(2100)).mul(0.5).add(0.5);
      const lights = nlight.mul(sstep(0.35, 0.9, cl1.mul(0.6).add(nlight.mul(0.7))).mul(sstep(0.56, 0.78, cl2)).mul(2.2).add(nlight.mul(nlight).mul(sstep(0.5, 0.75, cl1)).mul(0.5))).mul(landMask);
      col.addAssign(vec3(1.0, 0.56, 0.2).mul(lights).mul(dark).mul(1.7));
      col.addAssign(vec3(1.0, 0.62, 0.26).mul(townLitV).mul(landMask).mul(dark).mul(u.uGroundK).mul(near).mul(2.4)); // the close towns' windows
    });
    If(cloud.greaterThan(0.001), () => { // clouds: white, lit with wrap, thin edges lose density
      const cloudLit = mix(vec3(0.66, 0.72, 0.85), vec3(0.98, 0.985, 1.0), sstep(0.38, 0.95, cloudRaw.add(cn.mul(1.6)))).mul((sunLit.mul(clamp(dot(dir, L).add(0.1).div(1.1), 0, 1)).mul(0.92).add(amb.mul(1.5))));
      col.assign(mix(col, cloudLit.mul(float(0.9).add(cn.mul(0.5))), cloud.mul(0.9).mul(float(1).sub(wound.mul(2).min(1)))));
    });
    // ---- hole caps (spherical): void inside, a lilac glowing lip
    for (const hu of u.uHoles) {
      If(hu.w.lessThan(1.0), () => {
        const c = dot(dir, hu.xyz), th = acos(clamp(c, -1, 1)), th0 = acos(clamp(hu.w, -1, 1)).max(1e-5);
        const dd = th.div(th0);
        const hax = select(abs(hu.y).lessThan(0.99), vec3(0, 1, 0), vec3(1, 0, 0));
        const h1 = normalize(cross(hu.xyz, hax)), h2 = cross(hu.xyz, h1);
        const ang = atan(dot(dir, h2), dot(dir, h1));
        const arms = sin(ang.mul(3).add(dd.mul(-16)).add(u.uTime.mul(1.2))).mul(0.5).add(0.5);
        const voidCol = mix(vec3(0.16, 0.07, 0.38), vec3(0.01, 0.005, 0.04), sstep(0.95, 0.25, dd)).add(vec3(0.3, 0.16, 0.7).mul(arms).mul(sstep(0.9, 0.2, dd)).mul(0.4));
        const inside = sstep(1.0, 0.985, dd);
        const rim = exp(pow(dd.sub(1).mul(26), 2).negate());
        col.assign(mix(col, voidCol, inside));
        col.addAssign(vec3(0.62, 0.42, 1.0).mul(rim).mul(2.6));
      });
    }
    // ---- aerial haze between camera and surface (negligible under ~60 km of view distance: skipped there)
    if (!OFF.has('atmo')) If(dist.greaterThan(0.008), () => {
      const A = atmosphere(ro, V.negate(), dist, L, low ? 3 : 4).toVar();
      col.assign(col.mul(A.w).add(A.rgb));
    });
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
    const A = atmosphere(ro, rd, tp, globeU.uSun, low ? 4 : 6);
    return vec4(A.rgb, 1);
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
    this.trailData = new Uint8Array(TRAIL * TRAIL);
    this.trailTex = new THREE.DataTexture(this.trailData, TRAIL, TRAIL, THREE.RedFormat, THREE.UnsignedByteType);
    this.trailTex.minFilter = this.trailTex.magFilter = THREE.LinearFilter;
    this.trailTex.generateMipmaps = false; this.trailTex.unpackAlignment = 1; this.trailTex.needsUpdate = true;
    this.u = planetUniforms();
    const mo = { surf: this.surfTex, night: this.nightTex, bite: this.biteTex, trail: this.trailTex, N: bake.N, B, quality, u: this.u };
    this.material = planetMaterial(mo);
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
    for (const [name, k] of [['position', 3], ['aDir', 3], ['aH', 1], ['aHm', 1], ['aG', 3], ['aUV', 2]]) g.setAttribute(name, mk(k));
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

  dispose() { this.surfTex.dispose(); this.nightTex.dispose(); this.biteTex.dispose(); this.trailTex.dispose(); this.globe.geometry.dispose(); this.patch.geometry.dispose(); }
}
