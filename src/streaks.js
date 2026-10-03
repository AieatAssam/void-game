// The finale's flying matter: one instanced mesh of camera-facing streaks (a quad stretched along its own velocity), every position a closed form of the finale clock in the vertex shader
// (no per-frame CPU work). Five kinds: 0 sea (droplets that leave the surface when the peel front passes them and spiral into the hole), 1 air (thin pale streamers), 2 lava (fountains from
// the fault lines), 3 debris, 4 the accretion disk (circular orbits in the plane round the hole, appearing as the planet is eaten).
// Coordinates are planet-local, in planet radii (the mesh is a child of the globe's group, scaled by R), the hole at `uH`, the disk plane's normal `uN` (= the hole's direction).
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, uniformArray, attribute, positionGeometry, uv, vec2, vec3, vec4, float, int, normalize, dot, cross, length, mix, smoothstep, clamp, max, min, abs, pow, sin, cos, atan, acos, step, varying, log, mx_noise_float,
} from 'three/tsl';
import { dirFace, decodeHeight } from './planetgen.js';

const NK = 6;
export function streakUniforms(globeU) {
  const mk = (n) => uniformArray(Array.from({ length: n }, () => new THREE.Vector4(0, 1, 1, 1)), 'vec4');
  return {
    uCam: globeU.uCam, uT: uniform(0), uH: uniform(new THREE.Vector3(0, 1, 0)), uN: uniform(new THREE.Vector3(0, 1, 0)), uE1: uniform(new THREE.Vector3(1, 0, 0)), uE2: uniform(new THREE.Vector3(0, 0, 1)), uRb: uniform(0.3), uAlpha: uniform(1), uPx: uniform(0.001), // (uPx: the view's size of a pixel per unit of distance: a streak is never thinner than ~1.2 px)
   
    uK: mk(NK * 2), // [kind] = (launch start, launch span, duration min, duration spread); [kind + 5] = (width, length per second of travel, intensity, spin)
    uDisk: uniform(new THREE.Vector4(0, 4, 1, 0.5)), // disk particles: appear from, appear span, alpha, angular speed at one hole radius (rad/s)
  };
}

/** Build the instanced streak mesh. bake: { surf, N } (ocean directions for the sea), fault: Float32Array of unit positions on the fault lines (lava / debris starts), q: 'low' halves the count. */
export function makeStreaks(bake, fault, U, low = false) {
  const k = low ? 0.45 : 1, counts = [Math.round(7600 * k), Math.round(1300 * k), Math.round(1500 * k), Math.round(2400 * k), Math.round(3200 * k), Math.round(520 * k)], n = counts.reduce((a, b) => a + b, 0);
  const P0 = new Float32Array(n * 3), S = new Float32Array(n * 4), K = new Float32Array(n);
  let a = 77; const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const d = { x: 0, y: 0, z: 0 }, N = bake.N, surf = bake.surf;
  const ocean = () => { // a random direction over the sea (rejection sampled on the bake's heights)
    for (let tries = 0; tries < 40; tries++) {
      const z = rnd() * 2 - 1, ph = rnd() * 6.2832, r = Math.sqrt(1 - z * z); d.x = Math.cos(ph) * r; d.y = z; d.z = Math.sin(ph) * r;
      const { f, s, t } = dirFace(d), x = Math.round((s * 0.5 + 0.5) * (N - 1)), y = Math.round((t * 0.5 + 0.5) * (N - 1));
      if (decodeHeight(surf[((f * N + y) * N + x) * 4]) <= 0) return;
    }
  };
  let o = 0;
  for (let kind = 0; kind < NK; kind++) {
    for (let i = 0; i < counts[kind]; i++, o++) {
      let rad = 1.0;
      if (kind === 0 || kind === 5) ocean();
      else if (kind === 1) { const z = rnd() * 2 - 1, ph = rnd() * 6.2832, r = Math.sqrt(1 - z * z); d.x = Math.cos(ph) * r; d.y = z; d.z = Math.sin(ph) * r; rad = 1.01 + rnd() * 0.025; }
      else if (kind === 2 || kind === 3) { const q = Math.floor(rnd() * (fault.length / 3)) * 3; d.x = fault[q]; d.y = fault[q + 1]; d.z = fault[q + 2]; rad = kind === 2 ? 0.62 + rnd() * 0.38 : 0.8 + rnd() * 0.2; }
      else { d.x = 0; d.y = 1; d.z = 0; }
      P0[o * 3] = d.x * rad; P0[o * 3 + 1] = d.y * rad; P0[o * 3 + 2] = d.z * rad;
      S[o * 4] = rnd(); S[o * 4 + 1] = rnd(); S[o * 4 + 2] = rnd(); S[o * 4 + 3] = rnd(); K[o] = kind;
    }
  }
  const quad = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
  g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
  g.setAttribute('aP0', new THREE.InstancedBufferAttribute(P0, 3)); g.setAttribute('aS', new THREE.InstancedBufferAttribute(S, 4)); g.setAttribute('aKind', new THREE.InstancedBufferAttribute(K, 1));
  g.instanceCount = n; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e3);

  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const kind = attribute('aKind', 'float'), sd = attribute('aS', 'vec4'), p0 = attribute('aP0', 'vec3'), kI = int(kind.add(0.5)), T0 = U.uK.element(kI), P1 = U.uK.element(kI.add(NK));
  const isK = (q) => step(abs(kind.sub(q)), 0.5);
  const dsk = isK(4), inf = float(1).sub(dsk);
  // infall: from the start point, a spiral about the axis through the hole that flattens into the disk plane, accelerating
  const q0 = p0.sub(U.uH), h0 = dot(q0, U.uN), pl = q0.sub(U.uN.mul(h0)), rho0 = length(pl), th0 = atan(dot(pl, U.uE2), dot(pl, U.uE1));
  const ang = acos(clamp(dot(normalize(p0), U.uN), -1, 1)), tL = T0.x.add(T0.y.mul(ang.div(Math.PI))).add(sd.x.mul(0.3)), dur = T0.z.add(T0.w.mul(sd.y));
  const u = clamp(U.uT.sub(tL).div(dur), 0, 1);
  const posAt = (uu) => {
    const s = pow(uu, 1.7), rho = rho0.mul(pow(float(1).sub(s), 1.15)).add(U.uRb.mul(0.2).mul(s)), h = h0.mul(pow(float(1).sub(s), 1.35));
    const th = th0.add(P1.w.mul(sd.z.mul(0.6).add(1)).mul(pow(uu, 0.9).mul(uu.mul(2.2).add(1))));
    return U.uH.add(U.uN.mul(h)).add(U.uE1.mul(cos(th).mul(rho))).add(U.uE2.mul(sin(th).mul(rho)));
  };
  const pI = posAt(u), vI = posAt(clamp(u.add(0.012), 0, 1)).sub(pI).div(dur.mul(0.012));
  // the disk: circular orbits, Keplerian shear
  const rr = U.uRb.mul(pow(sd.x, 1.2).mul(5.2).add(1.45)), om = U.uDisk.w.mul(pow(rr.div(U.uRb), -1.5)), thD = sd.y.mul(6.2832).add(om.mul(U.uT)), hD = sd.z.sub(0.5).mul(0.05).mul(rr);
  const cD = cos(thD), sD = sin(thD), pD = U.uH.add(U.uN.mul(hD)).add(U.uE1.mul(cD.mul(rr))).add(U.uE2.mul(sD.mul(rr))), vD = U.uE2.mul(cD).sub(U.uE1.mul(sD)).mul(om.mul(rr));
  const appear = smoothstep(U.uDisk.x.add(sd.w.mul(U.uDisk.y)), U.uDisk.x.add(sd.w.mul(U.uDisk.y)).add(1.4), U.uT).mul(U.uDisk.z);
  const alive = mix(step(0.0001, u).mul(step(u, 0.9999)), appear.greaterThan(0.002).select(1, 0), dsk);
  const pos = mix(pI, pD, dsk), vel = mix(vI, vD, dsk), speed = length(vel).add(1e-5), dirv = vel.div(speed);
  const dcam = length(pos.sub(U.uCam)), width = max(P1.x.mul(sd.w.mul(0.7).add(0.5)), U.uPx.mul(dcam).mul(1.25)), len = max(min(speed.mul(P1.y), U.uRb.mul(0.3).add(0.06)), width.mul(1.6));
  const view = normalize(pos.sub(U.uCam)), side = normalize(cross(dirv, view)), cr = positionGeometry.xy;
  m.positionNode = pos.add(dirv.mul(cr.x.mul(len)).mul(alive)).add(side.mul(cr.y.mul(width)).mul(alive));
  // colour and strength (per vertex: a few streaks' worth of constant colour)
  const sH = pow(u, 1.7), hot = smoothstep(0.35, 0.95, sH);
  const cSea = mix(vec3(0.34, 0.66, 1.0).mul(1.3), vec3(1.5, 1.9, 2.4).mul(2.4), hot), cSheet = mix(vec3(0.22, 0.5, 1.0).mul(0.6), vec3(1.0, 1.4, 2.2).mul(0.9), hot), cAir = vec3(0.8, 0.9, 1.0).mul(0.5), cLava = mix(vec3(1.0, 0.28, 0.04).mul(2.4), vec3(2.6, 1.9, 1.0).mul(2.8), hot), cDeb = mix(vec3(0.4, 0.3, 0.22).mul(0.9), vec3(1.0, 0.45, 0.1).mul(2.4), hot);
  const tD = pow(float(1.45).div(rr.div(U.uRb)), 0.8), cDisk = mix(mix(vec3(0.6, 0.08, 0.02), vec3(1.0, 0.45, 0.1), smoothstep(0.12, 0.5, tD)), vec3(0.85, 0.92, 1.0), smoothstep(0.55, 0.95, tD)).mul(2.0);
  const col = cSea.mul(isK(0)).add(cAir.mul(isK(1))).add(cLava.mul(isK(2))).add(cDeb.mul(isK(3))).add(cSheet.mul(isK(5))).add(cDisk.mul(dsk));
  const env = smoothstep(0.0, 0.1, u).mul(float(1).sub(smoothstep(0.84, 1.0, u))), aI = mix(env, appear, dsk).mul(alive).mul(P1.z).mul(U.uAlpha);
  const vC = varying(vec4(col.mul(aI), 1), 'vStreak');
  m.colorNode = Fn(() => {
    const c = uv().sub(0.5), shape = smoothstep(-0.5, 0.25, c.x).mul(pow(float(1).sub(abs(c.y.mul(2))), 1.5)).mul(float(1).sub(smoothstep(0.35, 0.5, c.x).mul(0.5)));
    return vec4(vC.xyz.mul(shape), 1);
  })();
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 12; mesh.visible = false;
  return { mesh, counts };
}

/** A soft continuous disk of glow in the plane round the hole (inner 0.2 x the mesh's scale, outer 1): the streaks ride on it. Planet units, a child of the globe's group; the finale scales it to 7.25 hole radii. */
export function makeDiskGlow(U) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  m.colorNode = Fn(() => {
    const p = positionGeometry.xy, r = length(p), rr = r.div(0.2), a = atan(p.y, p.x);
    const sw = mx_noise_float(vec3(a.mul(2.6).sub(log(rr).mul(5.5)).add(U.uT.mul(-0.2)), rr.mul(1.9), 1.3)).mul(0.5).add(0.5), sw2 = mx_noise_float(vec3(a.mul(7).add(log(rr).mul(9)).sub(U.uT.mul(0.35)), rr.mul(5.1), 7.7)).mul(0.5).add(0.5);
    const tD = pow(float(1).div(rr), 0.85), col = mix(mix(vec3(0.55, 0.08, 0.02), vec3(1.0, 0.42, 0.1), smoothstep(0.1, 0.5, tD)), vec3(0.85, 0.92, 1.0), smoothstep(0.55, 0.97, tD));
    const edge = smoothstep(1.0, 1.25, rr).mul(float(1).sub(smoothstep(3.6, 5.0, rr))), body = pow(float(1).div(rr), 1.7).mul(sw.mul(0.8).add(0.35)).mul(sw2.mul(0.5).add(0.7));
    const appear = smoothstep(U.uDisk.x.add(0.5), U.uDisk.x.add(4.0), U.uT);
    return vec4(col.mul(body).mul(edge).mul(appear).mul(U.uDisk.z).mul(0.55), 1);
  })();
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 1, 160, 1), m);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 11;
  return mesh;
}
