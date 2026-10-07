// The black hole (docs/PHASE3.md 12.13): the finale's hole as a body in space. Two parts:
//   - `holeSphere()`: the void as a sphere at the render origin (swirling violet floor, lilac lip) that replaces the globe's cap once the crust parts and then grows as chunks fall in;
//   - `lensNodes()`: the screen-space lens + thin accretion disk, evaluated in the post pass's last stage. A point lens (source = image - E^2 / image) bends whatever the scene drew
//     (stars, debris, the Milky Way) around the shadow, the near half of a thin disk is drawn straight, the far half through the lens inverse (so it is bent over the top and
//     under the shadow: the Interstellar picture), a photon ring hugs the shadow, and Doppler beaming brightens the approaching side. Everything is a closed form per pixel
//     (no ray marching), and only pixels within ~9 shadow radii of the hole evaluate the disk.
import * as THREE from 'three/webgpu';
import {
  Fn, If, uniform, vec2, vec3, vec4, float, length, max, min, abs, exp, log, sin, cos, atan, mix, smoothstep, clamp, pow, sqrt, texture, mx_noise_float, normalView, positionView, normalize, dot, time, select, uv,
} from 'three/tsl';

/** Lens / disk uniforms (post.js owns them): A = centre uv (y down), shadow radius (screen heights), lens strength 0..1; B = sin(elevation of the camera over the disk plane), roll, disk clock (s), disk 0..1; C = disk inner, outer (shadow radii), Doppler, temperature. */
export function lensUniforms() {
  return { A: uniform(new THREE.Vector4(0.5, 0.5, 0.12, 0)), B: uniform(new THREE.Vector4(0.22, 0, 0, 0)), C: uniform(new THREE.Vector4(1.55, 7.2, 0.7, 1)), T: diskNoise(),
    P: uniform(new THREE.Vector4(0.6, 0, 0, 0)), // x: the shadow's angular radius (rad: how close the observer is), y: 1 = exact Schwarzschild deflection for the sky (else the weak-field point lens)
    L: deflectionLUT() };
}

const LUT_N = 512, LUT_LO = 1.0002, LUT_HI = 40, LUT_LOG = Math.log(LUT_HI / LUT_LO);
/**
 * The exact deflection of light by a Schwarzschild black hole, as a table over the impact parameter b = rh * b_crit (rh in shadow radii, 1.0002 .. 40; log spaced):
 * alpha(b) = 2 * int_0^u0 du / sqrt(1/b^2 - u^2 + 2 u^3) - pi, with u = 1/r in units of M, u0 the turning point. It diverges (logarithmically) at the photon ring, so rays that
 * skim it loop round the hole: the thin bright rings of the picture. The sky is looked up through it in lensNodes (the lens equation: source = image - alpha / thetaS).
 */
export function deflectionLUT() {
  const data = new Uint16Array(LUT_N), bc = 3 * Math.sqrt(3);
  for (let i = 0; i < LUT_N; i++) {
    const rh = LUT_LO * Math.exp(LUT_LOG * i / (LUT_N - 1)), b = rh * bc, ib2 = 1 / (b * b);
    const f = (u) => ib2 - u * u + 2 * u * u * u;
    let lo = 0, hi = 1 / 3; for (let k = 0; k < 60; k++) { const m = 0.5 * (lo + hi); if (f(m) > 0) lo = m; else hi = m; } // the smallest positive root: the turning point
    const u0 = 0.5 * (lo + hi), n = 400; let sum = 0;
    for (let k = 0; k <= n; k++) { // u = u0 (1 - t^2) removes the square-root singularity at the turning point
      const t = k / n, u = u0 * (1 - t * t);
      const g = t < 1e-6 ? 2 * u0 - 6 * u0 * u0 : f(u) / (u0 - u); // (limit at the turning point: -f'(u0) = 2 u0 - 6 u0^2)
      const v = 2 * Math.sqrt(u0) / Math.sqrt(Math.max(g, 1e-12));
      sum += v * (k === 0 || k === n ? 1 : k % 2 ? 4 : 2);
    }
    const phi = 2 * (sum / (3 * n)), alpha = Math.max(0, phi - Math.PI);
    data[i] = THREE.DataUtils.toHalfFloat(Math.min(alpha, 60000));
  }
  const t = new THREE.DataTexture(data, LUT_N, 1, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

/** A small periodic noise tile (R: three octaves, G: finer) for the disk's turbulence: one fetch instead of procedural noise per pixel. */
function diskNoise(N = 128) {
  const data = new Uint8Array(N * N * 4);
  const hash = (x, y, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const sm = (t) => t * t * (3 - 2 * t);
  const pn = (x, y, P, s) => { const fx = x * P, fy = y * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy), g = (a, b) => hash(((a % P) + P) % P, ((b % P) + P) % P, s); return (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N, y = j / N, o = (j * N + i) * 4;
    data[o] = 255 * (pn(x, y, 8, 1) * 0.5 + pn(x, y, 16, 2) * 0.3 + pn(x, y, 32, 3) * 0.2);
    data[o + 1] = 255 * (pn(x, y, 24, 4) * 0.6 + pn(x, y, 48, 5) * 0.4);
    data[o + 2] = data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
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
      const p = uv0.sub(A.xy).mul(sc).div(A.z), rh = max(length(p), 1e-3), weak = rh.sub(A.w.mul(E2).div(rh));
      // the exact path: the sky behind the hole is sampled where the lens equation says (rh - alpha / thetaS); the table is read at the impact parameter of this pixel
      const al = texture(U.L, vec2(clamp(log(max(rh, LUT_LO)).sub(Math.log(LUT_LO)).div(LUT_LOG), 0, 1), 0.5)).level(0).x, exact = rh.sub(A.w.mul(al).div(U.P.x));
      const beta = mix(weak, exact, U.P.y);
      r.assign(A.xy.add(p.div(rh).mul(beta).mul(A.z).div(sc)));
    });
    return r;
  })();
  const over = Fn(() => {
    const rgb = vec3(0).toVar(), a = float(0).toVar();
    If(A.w.greaterThan(0.001), () => {
      const p = uv0.sub(A.xy).mul(sc).div(A.z), rh = max(length(p), 1e-3), kk = smoothstep(0.004, 0.02, A.w);
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
          let dens = float(0.68).add(texture(U.T, vec2(sp.mul(0.159155), lr.mul(0.36))).level(0).x.sub(0.5).mul(0.84));
          if (!low) dens = dens.add(texture(U.T, vec2(sp.mul(0.318), lr.mul(1.1).add(0.37))).level(0).y.sub(0.5).mul(0.44)).add(sin(sp.mul(3).add(lr.mul(9))).mul(0.12));
          const dop = float(1).add(C.z.mul(x.negate().div(ar)).mul(pow(inner.div(ar), 0.5)));
          const I = pow(inner.div(ar), 2.3).mul(clamp(dens, 0.12, 1.6)).mul(pow(max(dop, 0.12), 2.5)).mul(2.7);
          const T = pow(inner.div(ar), 1.0).mul(C.w).mul(0.9).mul(dop.mul(0.35).add(0.65));
          return vec4(hotColor(T).mul(I), cov);
        };
        // only the half that is wanted is evaluated (the near half below the line, the far half above it; both in the thin band and under the shadow)
        const near = vec4(0).toVar(), far = vec4(0).toVar();
        If(q.y.lessThan(0.25), () => { near.assign(em(q.x, q.y.div(sE))); });
        If(bv.y.greaterThan(-0.25).and(rh.greaterThan(0.99)), () => { far.assign(em(bv.x, bv.y.div(sE))); });
        // (P1-1: the two images of the disk cross-fade over a wide band: they sit at different disk radii on the line, so a thin join showed as a straight cut)
        const farK = smoothstep(-0.22, 0.05, bv.y).mul(far.w).mul(smoothstep(0.99, 1.04, rh)), nearK = float(1).sub(smoothstep(-0.05, 0.22, q.y)).mul(near.w).mul(float(1).sub(farK.mul(0.6)));
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
    // a maelstrom: spiral arms flowing in (the phase runs toward the centre), two layers at different depths (parallax), a funnel darkening to a black throat, a lit ring at the lip
    const flow = U.uT.mul(1.5), tw = float(1).sub(dd).mul(5.5);
    const a1 = sin(ang.mul(3).add(dd.mul(-16)).add(flow).add(tw)).mul(0.5).add(0.5), a2 = sin(ang.mul(5).add(dd.mul(-27)).add(flow.mul(1.7)).sub(tw.mul(1.4))).mul(0.5).add(0.5);
    const throat = float(1).sub(smoothstep(0.0, 0.62, dd)), body = smoothstep(0.1, 0.5, dd).mul(float(1).sub(smoothstep(0.7, 1.0, dd).mul(0.65)));
    const swirl = pow(a1, 2.2).mul(0.7).add(pow(a2, 3.0).mul(0.4)).mul(body).mul(float(1).sub(throat.mul(0.85)));
    const floorCol = mix(vec3(0.05, 0.02, 0.15), vec3(0.0015, 0.0008, 0.01), throat).add(mix(vec3(0.36, 0.18, 0.78), vec3(0.78, 0.5, 1.0), pow(dd, 3)).mul(swirl).mul(0.34));
    const rim = pow(dd, 12).mul(float(1.9).add(U.uHeat.mul(2.5))), lil = mix(vec3(0.62, 0.42, 1.0), vec3(1.0, 0.95, 0.9), U.uHeat.mul(0.8)), ember = vec3(1.0, 0.5, 0.18).mul(pow(dd, 26)).mul(0.9).mul(float(1).sub(U.uK));
    return vec4(mix(floorCol.add(lil.mul(rim)).add(ember), vec3(0), U.uK), 1);
  })();
  m.userData.U = U;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), m);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 1;
  return mesh;
}

/** The glow round the void: a camera-facing quad (4 radii across) drawn additively behind the sphere's lip. uHeat flares it white, uK drains it (the transformation). */
export function holeHalo() {
  const U = { uHeat: uniform(0), uK: uniform(0), uA: uniform(1), uT: uniform(0) };
  const m = new THREE.MeshBasicNodeMaterial({ fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.colorNode = Fn(() => {
    const p = uv().sub(0.5).mul(5), rho = length(p), out = smoothstep(0.98, 1.04, rho), wisp = sin(atan(p.y, p.x).mul(3).add(rho.mul(-7)).add(U.uT.mul(1.5))).mul(0.5).add(0.5);
    const g = exp(rho.sub(1).mul(-2.3)).mul(1.0).add(exp(rho.sub(1).mul(-0.7)).mul(0.22)).mul(out).mul(float(1).sub(smoothstep(1.2, 2.5, rho)).mul(0.8).add(0.2)).mul(float(1).sub(smoothstep(1.6, 2.5, rho)).mul(0.5).add(0.5));
    return vec4(mix(vec3(0.5, 0.3, 1.0), vec3(1.0, 0.92, 0.85), U.uHeat).mul(g).mul(float(0.65).add(wisp.mul(0.7).mul(float(1).sub(smoothstep(1.1, 2.0, rho))))).mul(U.uA).mul(float(1).sub(U.uK)).mul(float(1).add(U.uHeat.mul(2.2))), 1);
  })();
  m.userData.U = U;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2;
  return mesh;
}
