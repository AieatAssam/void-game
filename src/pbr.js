// PBR detail library (ART.md "Surface detail"): 16 scanned CC0 material layers (Poly Haven) packed into three
// texture arrays - albedo, normal, and RHA (roughness, height, ambient occlusion). Models have no real UVs
// (faces point at palette swatches), so layers are projected triplanar in object space (props) or world space
// (ground). Normals use Mikkelsen's surface-gradient framework: no tangents needed and exact under instancing.
import * as THREE from 'three/webgpu';
import {
  texture, vec3, float, abs, pow, dot, cross, dFdx, dFdy, sign, max, positionView, normalViewGeometry, uniformArray,
  mx_noise_float, time, cos,
} from 'three/tsl';

export const LAYERS = ['plaster', 'asphalt', 'concrete', 'grass', 'paving', 'sand', 'dirt', 'brick', 'wood', 'foliage', 'metal',
  'roof', 'rock', 'bark', 'forest', 'shore'];
export const L = Object.fromEntries(LAYERS.map((n, i) => [n, i]));
const SIZE = 512;
const base = import.meta.env.BASE_URL;

function arrayTexture(srgb) {
  const t = new THREE.DataArrayTexture(new Uint8Array(SIZE * SIZE * 4 * LAYERS.length).fill(128), SIZE, SIZE, LAYERS.length);
  t.format = THREE.RGBAFormat;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const pbrCol = arrayTexture(true);
export const pbrNrm = arrayTexture(false);
export const pbrRha = arrayTexture(false);
// Mean albedo per layer (linear): the detail is divided by it so a swatch keeps its palette colour on average.
export const layerMean = uniformArray(LAYERS.map(() => new THREE.Vector3(0.5, 0.5, 0.5)), 'vec3');

async function readImage(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, SIZE, SIZE);
  return g.getImageData(0, 0, SIZE, SIZE).data;
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Fetch every layer and fill the arrays. Materials can be built before this resolves (arrays start flat grey). */
export async function loadPBR(onProgress) {
  let done = 0;
  await Promise.all(LAYERS.map(async (name, i) => {
    const [col, nrm, rha] = await Promise.all(['col', 'nrm', 'rha'].map((k) => readImage(`${base}tex/${name}_${k}.jpg`)));
    const off = i * SIZE * SIZE * 4;
    pbrCol.image.data.set(col, off);
    pbrNrm.image.data.set(nrm, off);
    pbrRha.image.data.set(rha, off);
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < col.length; k += 64) { r += srgbToLinear(col[k] / 255); g += srgbToLinear(col[k + 1] / 255); b += srgbToLinear(col[k + 2] / 255); }
    const n = col.length / 64;
    layerMean.array[i].set(r / n, g / n, b / n);
    onProgress?.(++done / LAYERS.length);
  }));
  for (const t of [pbrCol, pbrNrm, pbrRha]) t.needsUpdate = true;
}

// ---------- surface gradient helpers (view space) ----------
// Gradient on the surface of a scalar field whose screen derivatives are (fx, fy).
const surfaceBasis = () => {
  const dpx = dFdx(positionView), dpy = dFdy(positionView), n = normalViewGeometry;
  const r1 = cross(dpy, n), r2 = cross(n, dpx);
  const det = dot(dpx, r1);
  const k = sign(det).div(max(abs(det), 1e-12));
  return { r1: r1.mul(k), r2: r2.mul(k) };
};

/**
 * Triplanar PBR sample. p: coordinates in metres (object or world), n: unit normal in the same space,
 * layer: int node, scale: repeats per metre. Returns { col, rough, height, ao, grad } where grad is the
 * view-space surface gradient of the layer's relief (subtract it from the normal, scaled by strength).
 */
export const triplanar = (p, n, layer, scale) => {
  const w0 = pow(abs(n), vec3(4));
  const w = w0.div(w0.x.add(w0.y).add(w0.z).add(1e-5));
  const q = p.mul(scale);
  const uvX = q.zy, uvY = q.xz, uvZ = q.xy;
  const sampleAll = (uvv) => ({
    c: texture(pbrCol, uvv).depth(layer),
    nm: texture(pbrNrm, uvv).depth(layer).xyz.mul(2).sub(1),
    r: texture(pbrRha, uvv).depth(layer).xyz,
  });
  const X = sampleAll(uvX), Y = sampleAll(uvY), Z = sampleAll(uvZ);
  const col = X.c.xyz.mul(w.x).add(Y.c.xyz.mul(w.y)).add(Z.c.xyz.mul(w.z));
  const rha = X.r.mul(w.x).add(Y.r.mul(w.y)).add(Z.r.mul(w.z));
  // view-space gradients of the three coordinates
  const { r1, r2 } = surfaceBasis();
  const dx = dFdx(p), dy = dFdy(p);
  const gX = r1.mul(dx.x).add(r2.mul(dy.x)), gY = r1.mul(dx.y).add(r2.mul(dy.y)), gZ = r1.mul(dx.z).add(r2.mul(dy.z));
  // slope = -t.xy / t.z per projection; plane X maps (u, v) = (z, y), plane Y (x, z), plane Z (x, y)
  const slope = (t) => t.xy.div(max(t.z, 0.25)).negate();
  const sX = slope(X.nm), sY = slope(Y.nm), sZ = slope(Z.nm);
  const grad = gZ.mul(sX.x).add(gY.mul(sX.y)).mul(w.x)
    .add(gX.mul(sY.x).add(gZ.mul(sY.y)).mul(w.y))
    .add(gX.mul(sZ.x).add(gY.mul(sZ.y)).mul(w.z));
  return { col, rough: rha.x, height: rha.y, ao: rha.z, grad };
};

/** Animated water relief in world xz: layered travelling waves + noise chop. Returns view-space gradient. */
export const waterGrad = (pw) => {
  const t = time;
  const { r1, r2 } = surfaceBasis();
  // analytic slopes of a few directional waves
  let sx = float(0), sz = float(0);
  const waves = [[0.8, 0.6, 1.3, 0.035, 1.2], [-0.5, 0.86, 2.1, 0.022, 1.7], [0.2, -0.98, 3.7, 0.012, 2.3], [-0.9, -0.3, 6.1, 0.006, 3.1]];
  for (const [dxw, dzw, k, a, s] of waves) {
    const ph = pw.x.mul(dxw * k).add(pw.z.mul(dzw * k)).add(t.mul(s));
    const d = cos(ph).mul(a * k);
    sx = sx.add(d.mul(dxw));
    sz = sz.add(d.mul(dzw));
  }
  // fine chop from gradient noise (finite difference in world space)
  const e = 0.05, np = vec3(pw.x.mul(3.1), t.mul(0.6), pw.z.mul(3.1));
  const n0 = mx_noise_float(np);
  sx = sx.add(mx_noise_float(np.add(vec3(e * 3.1, 0, 0))).sub(n0).div(e).mul(0.012));
  sz = sz.add(mx_noise_float(np.add(vec3(0, 0, e * 3.1))).sub(n0).div(e).mul(0.012));
  const dx = dFdx(pw), dy = dFdy(pw);
  const gX = r1.mul(dx.x).add(r2.mul(dy.x)), gZ = r1.mul(dx.z).add(r2.mul(dy.z));
  return gX.mul(sx).add(gZ.mul(sz));
};

/** Low-frequency world-space variation to break up texture repetition (value ~0.5, soft). */
export const macro = (pw, freq = 0.035) => mx_noise_float(vec3(pw.x.mul(freq), 0.37, pw.z.mul(freq))).mul(0.5).add(0.5);


/** View-space surface gradient for a tangent-space normal sample on real UVs (no tangents needed). */
export const uvGrad = (nm, uvNode, strength = 1) => {
  const { r1, r2 } = surfaceBasis();
  const du = dFdx(uvNode), dv = dFdy(uvNode);
  const gU = r1.mul(du.x).add(r2.mul(dv.x)), gV = r1.mul(du.y).add(r2.mul(dv.y));
  const s = nm.xy.div(max(nm.z, 0.25)).negate().mul(strength);
  return gU.mul(s.x).add(gV.mul(s.y));
};
