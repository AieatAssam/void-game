// The big detonation kit (docs/PHASE3.md 12.12): the nuke's volumetric cloud, the ground shock dome, and the light a blast throws on the world.
//   The cloud is ONE ray-marched volume in a box (sphere-traced against a signed-distance field of the mushroom, noise-eroded, lit by temperature): a fireball that
//   rises into a rolling toroidal vortex cap on a narrowing stem, a dust skirt at the base and a Wilson condensation ring; emissive white -> yellow -> orange -> deep red
//   inside, sooty brown smoke outside, a glowing underside, and a noise-eroded dissolve. Local units: height 1 = the mushroom's height H (mesh.scale = H); the base sits on the ground (y = 0).
//   Cost: only while a nuke is alive, ~16-40 steps per covered pixel; ?q=low uses fewer steps.
import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, vec4, float, int, uniform, texture3D, positionLocal, normalView, mx_noise_float, mix, smoothstep, pow, exp, max, min, clamp, length, normalize, dot, cos, sin, Loop, Break, If, cameraPosition, modelWorldMatrixInverse, screenCoordinate, fract, luminance, abs } from 'three/tsl';
import { sunDir } from '../look.js';

const BX = 1.3, BY = 1.12;
// A tileable 3D Perlin noise baked once into an RGBA8 texture (tile = 3 volume units; R 4 cells per unit, G 9.3, B 2, A 6): the march fetches two octaves with ONE sample instead of
// evaluating procedural noise (a measured 10 ms of an integrated GPU at 6 s, mostly the noise ALU).
let NT = null;
const NS = 56, TILE = 3;
function noiseTex() {
  if (NT) return NT;
  const d = new Uint8Array(NS * NS * NS * 4), G = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
  const grad = (i, j, k, P, seed) => { const w = (v) => ((v % P) + P) % P; let h = Math.imul(w(i) + 1, 0x27d4eb2d) ^ Math.imul(w(j) + 7, 0x165667b1) ^ Math.imul(w(k) + 13, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12; return G[(h >>> 0) % 12]; };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const perlin = (x, y, z, P, seed) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi; let acc = 0;
    const u = fade(fx), v = fade(fy), w = fade(fz), lerp = (a, b, t) => a + (b - a) * t, dot = (g, a, b, c) => g[0] * a + g[1] * b + g[2] * c;
    const c = (dx, dy, dz) => dot(grad(xi + dx, yi + dy, zi + dz, P, seed), fx - dx, fy - dy, fz - dz);
    acc = lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v), lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
    return acc;
  };
  const P = [12, 28, 6, 18];
  for (let z = 0; z < NS; z++) for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
    const o = ((z * NS + y) * NS + x) * 4;
    for (let c = 0; c < 4; c++) { const s = P[c] / NS, n = perlin(x * s, y * s, z * s, P[c], c + 1); d[o + c] = Math.max(0, Math.min(255, Math.round((0.5 + 0.62 * n) * 255))); }
  }
  NT = new THREE.Data3DTexture(d, NS, NS, NS); NT.format = THREE.RGBAFormat; NT.type = THREE.UnsignedByteType; NT.minFilter = NT.magFilter = THREE.LinearFilter;
  NT.wrapS = NT.wrapT = NT.wrapR = THREE.RepeatWrapping; NT.unpackAlignment = 1; NT.needsUpdate = true;
  return NT;
}
const smin = (a, b, k) => { const kk = float(k), h = clamp(float(0.5).add(b.sub(a).mul(0.5).div(kk)), 0, 1); return mix(b, a, h).sub(kk.mul(h).mul(float(1).sub(h))); };
const ramp = (t) => { // temperature 0..1.5 -> emitted HDR colour: deep red, orange, yellow, white-hot
  const c0 = vec3(0.16, 0.012, 0.004), c1 = vec3(0.95, 0.16, 0.025), c2 = vec3(2.3, 0.82, 0.14), c3 = vec3(4.2, 2.9, 1.5), c4 = vec3(5.2, 4.8, 3.9);
  return mix(mix(mix(c0, c1, smoothstep(0.0, 0.3, t)), c2, smoothstep(0.28, 0.58, t)), mix(c3, c4, smoothstep(1.0, 1.5, t)), smoothstep(0.55, 1.0, t));
};

const sstepJs = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How much of the unit box the cloud needs at age a (s): the mesh is scaled to H x this, so a young fireball fills few pixels with ray-march work (the shader maps local -> volume units by the same factor). */
export function cloudScale(a) { const w = 0.5 + 0.85 * sstepJs(0.1, 4, a), h = 0.46 + 0.62 * sstepJs(0, 5, a) ** 0.62; return Math.min(1, Math.max(w / BX, h / BY)); }

/** The mushroom's volume material. userData: uAge (s since the boom), uHeat (0..1 overall), uA (1 = whole, falls to dissolve), uTint (0..1: lilac, the swallowed one inverting). */
export function nukeCloudMaterial(low = false) {
  const uAge = uniform(0), uHeat = uniform(1), uA = uniform(1), uTint = uniform(0), uS = uniform(1), N = low ? 20 : 34;
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  m.premultipliedAlpha = true; // (the volume outputs premultiplied colour: emission adds, absorption hides what is behind)
  m.colorNode = Fn(() => {
    const cam = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz.mul(uS), rd = normalize(positionLocal.mul(uS).sub(cam)), Ld = normalize(modelWorldMatrixInverse.mul(vec4(sunDir, 0)).xyz);
    const t0 = length(positionLocal.mul(uS).sub(cam));
    const inv = vec3(1).div(rd.add(vec3(1e-6))), ta = vec3(-BX, 0, -BX).mul(uS).sub(cam).mul(inv), tb = vec3(BX, BY, BX).mul(uS).sub(cam).mul(inv);
    const tfar = min(min(max(ta.x, tb.x), max(ta.y, tb.y)), max(ta.z, tb.z));
    const a = uAge;
    // the envelope of the whole thing (all times in seconds since the boom)
    const rise = pow(smoothstep(0.0, 5.0, a), 0.62), cy = mix(0.15, 0.66, rise).toVar(), Rc = mix(0.0, 0.3, smoothstep(0.1, 4.2, a)).toVar(), rm = mix(0.2, 0.15, smoothstep(0.0, 4.0, a)).toVar();
    const stemK = smoothstep(0.0, 0.9, a).toVar(), Rs = mix(0.1, 0.62, smoothstep(0.0, 3.6, a)).toVar(), rsk = mix(0.1, 0.05, smoothstep(0.5, 6.0, a)).toVar();
    const wM = smoothstep(0.22, 0.6, a).mul(float(1).sub(smoothstep(2.4, 4.4, a))).toVar(), Rw = mix(0.15, 1.0, smoothstep(0.15, 3.9, a)).toVar(), yw = mix(0.24, 0.42, smoothstep(0.0, 3.0, a)).toVar();
    const heatT = uHeat.mul(exp(a.mul(-0.3)).mul(0.82).add(exp(a.mul(-0.045)).mul(0.18))).toVar();
    const swirl = a.mul(0.8), cs = cos(swirl).toVar(), sn = sin(swirl).toVar();
    const jit = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));
    const T = float(1).toVar(), acc = vec3(0).toVar(), t = t0.add(jit.mul(0.03)).toVar();
    Loop({ start: int(0), end: int(N), type: 'int', condition: '<' }, () => {
      const p = cam.add(rd.mul(t)), rho = length(p.xz).max(1e-4);
      // the signed distance field: oblate torus (the cap), the stem, the dust skirt
      const qx = rho.sub(Rc), qy0 = p.y.sub(cy), dCap = length(vec2(qx, qy0.mul(1.45))).sub(rm);
      const rs = mix(0.1, 0.045, clamp(p.y.div(cy), 0, 1)).mul(stemK), dStem = max(rho.sub(rs), p.y.sub(cy.mul(0.96)));
      const dSk = length(vec2(rho.sub(Rs), p.y.sub(0.035).mul(2.4))).sub(rsk);
      const dU = smin(smin(dCap, dStem, 0.09), dSk, 0.07);
      // the roll: noise coordinates turn round the torus' core (the rolling vortex), the stem and skirt just rise / drift
      const roll = smoothstep(cy.sub(0.3), cy.sub(0.02), p.y).toVar(), nz = float(0).toVar();
      If(dU.lessThan(0.17), () => { // (the noise only where the surface can be: empty space is skipped with the distance field alone)
        // the roll: noise coordinates turn round the torus' core (the rolling vortex), the stem and skirt just rise / drift
        const qx2 = qx.mul(cs).sub(qy0.mul(sn)), qy2 = qx.mul(sn).add(qy0.mul(cs)), rho2 = max(Rc.add(qx2), 0.0);
        const ps = mix(vec3(p.x, p.y.sub(a.mul(0.1)), p.z), vec3(p.x.mul(rho2).div(rho), cy.add(qy2), p.z.mul(rho2).div(rho)), roll);
        const s = texture3D(noiseTex(), ps.div(TILE)).level(0);
        const s2 = texture3D(noiseTex(), ps.mul(2.7 / TILE).add(0.37)).level(0); // (a finer pass: the cauliflower)
        nz.assign(s.r.sub(0.5).mul(1.2).add(s.g.sub(0.5).mul(0.64)).add(low ? 0 : s2.g.sub(0.5).mul(0.5).add(s2.r.sub(0.5).mul(0.3))));
      });
      const d = dU.sub(nz.mul(0.11).add(0.01)).add(float(1).sub(uA).mul(0.4)).toVar(); // (a falling uA erodes the whole cloud away along its noise)
      const dens = float(1).sub(smoothstep(-0.04, 0.012, d)).mul(smoothstep(0.0, 0.025, p.y));
      // the condensation ring: a thin white torus riding the shock front
      const dW = length(vec2(rho.sub(Rw), p.y.sub(yw).mul(2.6))).sub(wM.mul(0.022)).sub(nz.mul(0.008));
      const aW = float(1).sub(smoothstep(-0.012, 0.012, dW)).mul(wM);
      const sl = clamp(min(d, dW).sub(0.085).mul(0.9), 0.03, 0.35);
      If(dens.greaterThan(0.004).or(aW.greaterThan(0.004)), () => {
        const depth = clamp(d.negate().div(0.2), 0, 1), ny = clamp(qy0.div(rm), -1, 1).mul(roll);
        const tmp = clamp(pow(heatT, 0.8).mul(depth.mul(0.6).add(0.55)).mul(nz.mul(0.9).add(0.8)).add(clamp(ny.negate(), 0, 1).mul(0.22).mul(roll).mul(heatT)).mul(mix(float(1), float(0.3), float(1).sub(smoothstep(0.05, 0.22, p.y)).mul(smoothstep(0.4, 1.5, a)))), 0, 1.5);
        const lit = smoothstep(-0.5, 0.8, ny.mul(0.7).add(nz.mul(0.3)).add(Ld.y.mul(0.35)).add(0.15)).mul(float(1).sub(depth.mul(0.55)));
        const smoke = mix(vec3(0.04, 0.034, 0.03), vec3(0.5, 0.38, 0.29), lit);
        const emit = ramp(tmp).mul(smoothstep(0.1, 0.5, tmp));
        const col = mix(smoke, emit, smoothstep(0.07, 0.34, tmp)).toVar();
        const aE = clamp(dens.mul(sl).mul(13), 0, 1);
        acc.addAssign(T.mul(col).mul(aE));
        T.mulAssign(float(1).sub(aE));
        const cW = vec3(0.88, 0.92, 1.0).mul(lit.mul(0.8).add(0.35)).add(vec3(1.0, 0.5, 0.2).mul(heatT).mul(0.25)), aWs = clamp(aW.mul(sl).mul(26), 0, 0.7);
        acc.addAssign(T.mul(cW).mul(aWs)); T.mulAssign(float(1).sub(aWs));
      });
      t.addAssign(sl);
      If(t.greaterThan(tfar).or(T.lessThan(0.035)), () => { Break(); });
    });
    const alpha = float(1).sub(T), rgb0 = acc.mul(uA.mul(0.4).add(0.6));
    const rgb = mix(rgb0, vec3(luminance(rgb0)).mul(vec3(0.62, 0.45, 1.0)).mul(1.5), uTint);
    return vec4(rgb, alpha.mul(smoothstep(0.0, 0.4, uA)));
  })();
  m.userData = { uAge, uHeat, uA, uTint, uS, uT: uAge };
  return m;
}

/** The unit box the cloud lives in (height 1 = H, base at y = 0). */
export const cloudGeometry = () => new THREE.BoxGeometry(2 * BX, BY, 2 * BX).translate(0, BY / 2, 0);

/** A hemispherical shock dome: a bright front hugging the ground (additive), its radius is the mesh's scale; userData uA (fade), uHot (0 orange .. 1 white). */
export function domeMaterial() {
  const uA = uniform(0), uHot = uniform(1), m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false });
  m.colorNode = Fn(() => {
    const fres = pow(float(1).sub(abs(normalView.z)), 3.4), low = exp(pow(positionLocal.y.div(0.2), 2).negate()), n = mx_noise_float(positionLocal.mul(9)).mul(0.5).add(0.5);
    const c = mix(vec3(1.0, 0.5, 0.18), vec3(1.0, 0.93, 0.8), uHot);
    return vec4(c.mul(fres.mul(0.07).add(low.mul(1.7)).mul(n.mul(0.5).add(0.6))).mul(uA).mul(2.2), 1);
  })();
  m.userData = { uA, uHot };
  return m;
}
export const domeGeometry = () => new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
