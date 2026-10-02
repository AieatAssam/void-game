// The black hole (docs/PHASE3.md 12.13): the finale's hole as a body in space. Two parts:
//   - `holeSphere()`: the void as a sphere at the render origin (swirling violet floor, lilac lip) that replaces the globe's cap once the crust parts and then grows as chunks fall in;
//   - `lensNodes()`: the screen-space lens + thin accretion disk, evaluated in the post pass's last stage. A point lens (source = image - E^2 / image) bends whatever the scene drew
//     (stars, debris, the Milky Way) around the shadow, the near half of a thin disk is drawn straight, the far half through the lens inverse (so it is bent over the top and
//     under the shadow: the Interstellar picture), a photon ring hugs the shadow, and Doppler beaming brightens the approaching side. Everything is a closed form per pixel
//     (no ray marching), and only pixels within ~9 shadow radii of the hole evaluate the disk.
import * as THREE from 'three/webgpu';
import {
  Fn, If, uniform, vec2, vec3, vec4, float, length, max, min, abs, exp, log, sin, cos, atan, mix, smoothstep, clamp, pow, sqrt, mx_noise_float, normalView, positionView, normalize, dot, time, select, uv,
} from 'three/tsl';

/** Lens / disk uniforms (post.js owns them): A = centre uv (y down), shadow radius (screen heights), lens strength 0..1; B = sin(elevation of the camera over the disk plane), roll, disk clock (s), disk 0..1; C = disk inner, outer (shadow radii), Doppler, temperature. */
export function lensUniforms() {
  return { A: uniform(new THREE.Vector4(0.5, 0.5, 0.12, 0)), B: uniform(new THREE.Vector4(0.22, 0, 0, 0)), C: uniform(new THREE.Vector4(1.55, 7.2, 0.7, 1)) };
}

const E2 = 1.64; // Einstein radius^2 in shadow radii (the ring sits at 1.28: just outside the shadow)

/** A disk colour from a temperature-like 0..1 (1 = the inner edge, white-blue; 0.5 orange; 0.2 deep red). */
const hotColor = (t) => mix(mix(mix(vec3(0.5, 0.06, 0.02), vec3(1.0, 0.3, 0.06), smoothstep(0.12, 0.38, t)), vec3(1.0, 0.72, 0.38), smoothstep(0.34, 0.62, t)), vec3(0.78, 0.9, 1.0), smoothstep(0.58, 0.95, t));

/**
 * uv0: the pipeline's texture uv (y down), asp: aspect, U: lensUniforms(), tm: a time node. Returns { uv: the lensed uv to sample the picture at, over: vec4 (rgb, a) a display-referred overlay
 * to mix over it (the shadow's black, the disk, the photon ring): c = c * (1 - a) + rgb }.
 */
export function lensNodes(uv0, asp, U, tm, low = false) {
  const A = U.A, B = U.B, C = U.C, sc = vec2(asp, 1);
  const uv = Fn(() => {
    const r = uv0.toVar();
    If(A.w.greaterThan(0.001), () => {
      const p = uv0.sub(A.xy).mul(sc).div(A.z), rh = max(length(p), 1e-3), beta = rh.sub(A.w.mul(E2).div(rh));
      r.assign(A.xy.add(p.div(rh).mul(beta).mul(A.z).div(sc)));
    });
    return r;
  })();
  const over = Fn(() => {
    const rgb = vec3(0).toVar(), a = float(0).toVar();
    If(A.w.greaterThan(0.001), () => {
      const p = uv0.sub(A.xy).mul(sc).div(A.z), rh = max(length(p), 1e-3), kk = smoothstep(0.04, 0.22, A.w);
      const shadow = float(1).sub(smoothstep(0.985, 1.012, rh)).mul(kk);
      const hdr = vec3(0).toVar(), cover = float(0).toVar();
      If(B.w.greaterThan(0.001).and(rh.lessThan(9.5)), () => {
        const cr = cos(B.y), sr = sin(B.y), q0 = vec2(p.x, p.y.negate());
        const q = vec2(q0.x.mul(cr).add(q0.y.mul(sr)), q0.y.mul(cr).sub(q0.x.mul(sr))), sE = max(B.x, 0.05);
        const betaMag = rh.sub(A.w.mul(E2).div(rh)), bv = q.div(rh).mul(betaMag);
        // one point of the disk plane (x across, z away from the camera): brightness, colour and coverage
        const em = (x, z) => {
          const ar = max(length(vec2(x, z)), 1e-3), ph = atan(z, x), inner = C.x, outer = C.y;
          const cov = smoothstep(inner.mul(0.9), inner.mul(1.1), ar).mul(float(1).sub(smoothstep(outer.mul(0.6), outer, ar)));
          const sp = ph.sub(pow(max(ar, 0.4), -1.5).mul(B.z)), lr = log(ar);
          let dens = float(0.68).add(mx_noise_float(vec3(sp.mul(2.2), lr.mul(7), 3.1)).mul(0.42));
          if (!low) dens = dens.add(mx_noise_float(vec3(sp.mul(8), ar.mul(3.7), 8.2)).mul(0.22)).add(sin(sp.mul(3).add(lr.mul(9))).mul(0.12));
          const dop = float(1).add(C.z.mul(x.negate().div(ar)).mul(pow(inner.div(ar), 0.5)));
          const I = pow(inner.div(ar), 2.3).mul(clamp(dens, 0.12, 1.6)).mul(pow(max(dop, 0.12), 3)).mul(3.4);
          const T = pow(inner.div(ar), 1.0).mul(C.w).mul(0.9).mul(dop.mul(0.35).add(0.65));
          return vec4(hotColor(T).mul(I), cov);
        };
        const near = em(q.x, q.y.div(sE)), nearK = float(1).sub(smoothstep(-0.012, 0.01, q.y)).mul(near.w);
        const far = em(bv.x, bv.y.div(sE)), farK = smoothstep(-0.01, 0.012, bv.y).mul(far.w).mul(smoothstep(0.99, 1.04, rh));
        hdr.assign(near.xyz.mul(nearK).add(far.xyz.mul(farK)).mul(B.w));
        cover.assign(max(nearK, farK.mul(0.85)).mul(B.w));
      });
      // the photon ring: a thin hot line on the shadow's edge, brighter on the approaching side, and a faint glow outside it
      const dopR = float(1).add(C.z.mul(0.5).mul(p.x.negate().div(rh))), ring = exp(pow(rh.sub(1.022).div(0.012), 2).negate()).mul(max(dopR, 0.15).mul(0.7).add(0.3)), halo = exp(rh.sub(1).mul(-1.6)).mul(smoothstep(1.0, 1.05, rh));
      hdr.addAssign(vec3(1.0, 0.92, 0.78).mul(ring).mul(kk).mul(float(0.8).add(B.w.mul(3.2))).add(vec3(1.0, 0.6, 0.3).mul(halo).mul(B.w).mul(0.2).mul(kk)));
      const disp = vec3(1).sub(exp(hdr.mul(-0.85)));
      rgb.assign(disp);
      a.assign(max(shadow, max(cover, clamp(max(max(hdr.x, hdr.y), hdr.z), 0, 1))));
      rgb.assign(select(a.greaterThan(0.001), disp, vec3(0)));
    });
    return vec4(rgb, a);
  })();
  return { uv, over };
}

/**
 * The void as a sphere at the origin (scaled to the hole's radius). uHeat 0..1: the lip flares white when a chunk falls in; uK 0..1: how black it has become (the transformation).
 */
export function holeSphere() {
  const U = { uHeat: uniform(0), uK: uniform(0), uT: uniform(0) };
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  m.colorNode = Fn(() => {
    const n = normalize(normalView), V = normalize(positionView.negate()), ndv = clamp(dot(n, V), 0, 1), dd = sqrt(max(float(1).sub(ndv.mul(ndv)), 0)), ang = atan(n.y, n.x);
    const arms = sin(ang.mul(3).add(dd.mul(-14)).add(U.uT.mul(1.2))).mul(0.5).add(0.5);
    const floorCol = mix(vec3(0.05, 0.02, 0.15), vec3(0.003, 0.0015, 0.018), float(1).sub(smoothstep(0.15, 0.9, dd))).add(vec3(0.3, 0.16, 0.7).mul(arms).mul(float(1).sub(smoothstep(0.2, 0.9, dd))).mul(0.24));
    const rim = pow(dd, 14).mul(float(1.9).add(U.uHeat.mul(2.5))), lil = mix(vec3(0.62, 0.42, 1.0), vec3(1.0, 0.95, 0.9), U.uHeat.mul(0.8));
    return vec4(mix(floorCol.add(lil.mul(rim)), vec3(0), U.uK), 1);
  })();
  m.userData.U = U;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), m);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 1;
  return mesh;
}

/** The glow round the void: a camera-facing quad (4 radii across) drawn additively behind the sphere's lip. uHeat flares it white, uK drains it (the transformation). */
export function holeHalo() {
  const U = { uHeat: uniform(0), uK: uniform(0), uA: uniform(1) };
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.colorNode = Fn(() => {
    const p = uv().sub(0.5).mul(5), rho = length(p), out = smoothstep(0.98, 1.04, rho);
    const g = exp(rho.sub(1).mul(-2.3)).mul(1.0).add(exp(rho.sub(1).mul(-0.7)).mul(0.22)).mul(out).mul(float(1).sub(smoothstep(1.2, 2.5, rho)).mul(0.8).add(0.2)).mul(float(1).sub(smoothstep(1.6, 2.5, rho)).mul(0.5).add(0.5));
    return vec4(mix(vec3(0.5, 0.3, 1.0), vec3(1.0, 0.92, 0.85), U.uHeat).mul(g).mul(U.uA).mul(float(1).sub(U.uK)).mul(float(1).add(U.uHeat.mul(2.2))), 1);
  })();
  m.userData.U = U;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2;
  return mesh;
}
