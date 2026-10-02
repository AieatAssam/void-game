// The close ground's baked patterns (docs/PHASE3.md §2.3, "premium ground"): three small tileable RGBA8 textures made once on the CPU
// (~100 ms) and sampled by planetMaterial in metres. Textures, not noise maths, because mip-mapping antialiases them for free (hedges,
// crop rows and street grids average out into a plain mean colour as the camera rises) and one fetch replaces a dozen noise calls.
//   fields  1024^2 (tile 6.1 km): periodic Voronoi parcels. R parcel id, G distance to the nearest hedge (0 on it, 255 = 6 texels in),
//           B crop rows (sine at the parcel's own angle), A a second id (hedge or no hedge, tree row)
//   canopy  512^2 (tile 1.5 km): R canopy brightness (stands 150 m, clumps 40 m, crowns 8 m), G conifer .. broadleaf, B glades, A crown bump
//   urban   512^2 (tile 0.8 km): R street, G block id, B lot lines / alleys, A park block
//   relief  512^2 (tile 12 km): RG slope (dh/dx, dh/dy) of a 5-octave fBm, BA the same for a ridged fBm: the shader's normal-map relief
import * as THREE from 'three/webgpu';

export const FIELD_TILE = 9216, CANOPY_TILE = 1536, URBAN_TILE = 768, RELIEF_TILE = 12288, RELIEF_GMAX = 0.6, NOISE_TILE = 20480; // metres per tile; the relief map's slope range

const hash2 = (x, y, s) => { // integer hash -> 0..1
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const mk = (data, n, aniso = 2) => {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = aniso; t.needsUpdate = true; // (anisotropic taps are what a grazing-angle ground pays for: few here)
  return t;
};

/** Periodic Voronoi: F1 id, distance to the nearest border (exact bisector distance), per-parcel randoms. */
function fieldsData(n, G) {
  const data = new Uint8Array(n * n * 4), cs = n / G;
  const px = new Float32Array(G * G), py = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { px[j * G + i] = (i + 0.5 + (hash2(i, j, 1) - 0.5) * 0.78) * cs; py[j * G + i] = (j + 0.5 + (hash2(i, j, 2) - 0.5) * 0.78) * cs; }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ci = Math.floor(x / cs), cj = Math.floor(y / cs);
    let d1 = 1e9, d2 = 1e9, b1 = 0, b2 = 0, q1x = 0, q1y = 0, q2x = 0, q2y = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ci + di, jj = cj + dj, wi = ((ii % G) + G) % G, wj = ((jj % G) + G) % G, k = wj * G + wi;
      const qx = px[k] + Math.floor(ii / G) * n, qy = py[k] + Math.floor(jj / G) * n, dx = qx - x, dy = qy - y, d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; b2 = b1; q2x = q1x; q2y = q1y; d1 = d; b1 = k; q1x = qx; q1y = qy; } else if (d < d2) { d2 = d; b2 = k; q2x = qx; q2y = qy; }
    }
    const sep = Math.hypot(q1x - q2x, q1y - q2y) || 1, edge = (d2 - d1) / (2 * sep), o = (y * n + x) * 4, i1 = b1 % G, j1 = (b1 / G) | 0;
    const th = hash2(i1, j1, 3) * Math.PI, per = 2.7 + hash2(i1, j1, 4) * 2.2, rows = 0.5 + 0.5 * Math.sin(((x * Math.cos(th) + y * Math.sin(th)) * 2 * Math.PI) / per);
    data[o] = hash2(i1, j1, 5) * 255;
    data[o + 1] = Math.min(1, edge / 6) * 255;
    data[o + 2] = rows * 255;
    data[o + 3] = hash2(i1, j1, 6) * 255;
    void b2;
  }
  return data;
}

/** Periodic value noise (bilinear, smoothstep) at `period` texels, seeded. */
function vnoise(n, period, seed) {
  const g = Math.max(2, Math.round(n / period)), lat = new Float32Array(g * g);
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) lat[j * g + i] = hash2(i, j, seed);
  const out = new Float32Array(n * n), s = g / n;
  for (let y = 0; y < n; y++) {
    const fy = y * s, y0 = Math.floor(fy), ty = fy - y0, wy = ty * ty * (3 - 2 * ty), ya = y0 % g, yb = (y0 + 1) % g;
    for (let x = 0; x < n; x++) {
      const fx = x * s, x0 = Math.floor(fx), tx = fx - x0, wx = tx * tx * (3 - 2 * tx), xa = x0 % g, xb = (x0 + 1) % g;
      out[y * n + x] = (lat[ya * g + xa] * (1 - wx) + lat[ya * g + xb] * wx) * (1 - wy) + (lat[yb * g + xa] * (1 - wx) + lat[yb * g + xb] * wx) * wy;
    }
  }
  return out;
}

function canopyData(n) {
  const data = new Uint8Array(n * n * 4);
  const stand = vnoise(n, 96, 11), clump = vnoise(n, 26, 12), clump2 = vnoise(n, 11, 13), hue = vnoise(n, 160, 14), glade = vnoise(n, 120, 15);
  // crowns: periodic worley, 7 texel cells
  const G = Math.round(n / 7), cs = n / G, px = new Float32Array(G * G), py = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { px[j * G + i] = (i + 0.5 + (hash2(i, j, 21) - 0.5) * 0.9) * cs; py[j * G + i] = (j + 0.5 + (hash2(i, j, 22) - 0.5) * 0.9) * cs; }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ci = Math.floor(x / cs), cj = Math.floor(y / cs);
    let d1 = 1e9, k1 = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ci + di, jj = cj + dj, wi = ((ii % G) + G) % G, wj = ((jj % G) + G) % G, k = wj * G + wi;
      const dx = px[k] + Math.floor(ii / G) * n - x, dy = py[k] + Math.floor(jj / G) * n - y, d = dx * dx + dy * dy;
      if (d < d1) { d1 = d; k1 = k; }
    }
    const cr = Math.sqrt(d1) / (cs * 0.62), crown = Math.max(0, 1 - cr * cr), sz = 0.55 + 0.45 * hash2(k1 % G, (k1 / G) | 0, 23);
    const i = y * n + x, o = i * 4, v = 0.5 * stand[i] + 0.3 * clump[i] + 0.2 * clump2[i];
    const b = 0.12 + 0.55 * v + 0.33 * crown * sz; // dark gaps between crowns, bright crown tops
    data[o] = Math.min(255, b * 255);
    data[o + 1] = Math.min(1, Math.max(0, (hue[i] - 0.3) * 2.2)) * 255;
    data[o + 2] = Math.min(1, Math.max(0, (glade[i] - 0.66) * 7)) * 255;
    data[o + 3] = Math.min(255, (0.35 + 0.65 * crown * sz) * 255);
  }
  return data;
}

function urbanData(n) {
  const data = new Uint8Array(n * n * 4), B = 7, cs = n / B, w = 3.4; // 7 blocks across: 110 m blocks at 0.8 km, streets ~ 9 m wide
  // block borders wobble a little and a few streets are missing (bigger blocks) so it never reads as a graph-paper grid
  const skipX = new Uint8Array(B), skipY = new Uint8Array(B);
  for (let i = 0; i < B; i++) { skipX[i] = hash2(i, 0, 31) < 0.22 ? 1 : 0; skipY[i] = hash2(0, i, 32) < 0.22 ? 1 : 0; }
  const prof = (d, wid) => Math.max(0, 1 - Math.max(0, d - wid) / 1.6);
  const lot = vnoise(n, 9, 33);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const bi = Math.floor(x / cs), bj = Math.floor(y / cs), fx = x - bi * cs, fy = y - bj * cs;
    const dx = Math.min(fx, cs - fx), dy = Math.min(fy, cs - fy);
    const edgeX = fx < cs / 2 ? bi : (bi + 1) % B, edgeY = fy < cs / 2 ? bj : (bj + 1) % B;
    const sx = skipX[edgeX] ? 0 : prof(dx, w), sy = skipY[edgeY] ? 0 : prof(dy, w), street = Math.max(sx, sy);
    const id = hash2(bi, bj, 34), park = id < 0.07 ? 1 : 0;
    // lot lines: each block is cut in two or three by thin alleys
    const nl = 2 + (hash2(bi, bj, 35) < 0.5 ? 1 : 0), lx = ((fx / cs) * nl) % 1, ly = ((fy / cs) * nl) % 1;
    const alley = Math.max(Math.max(0, 1 - Math.min(lx, 1 - lx) * cs / nl / 1.1), 0) * (hash2(bi, bj, 36) < 0.5 ? 1 : 0.5) * 0.6 + Math.max(0, 1 - Math.min(ly, 1 - ly) * cs / nl / 1.1) * 0.5;
    const o = (y * n + x) * 4;
    data[o] = street * 255; data[o + 1] = id * 255; data[o + 2] = Math.min(1, alley) * 255 * (1 - street); data[o + 3] = park * 255 * (0.8 + 0.2 * lot[y * n + x]);
  }
  return data;
}

/** Slope maps of two fractal height fields (fBm and ridged), periodic, 5 octaves of 128..8 texels, RMS slope ~0.15 and ~0.3. */
function reliefData(n) {
  const fb = new Float32Array(n * n), rg = new Float32Array(n * n);
  for (let o = 0; o < 5; o++) {
    const per = 128 >> o, v = vnoise(n, per, 41 + o), w = vnoise(n, per, 51 + o), a = per * Math.pow(0.6, o); // amplitude ~ wavelength, finer octaves weaker: broad hills with texture, not noise
    for (let i = 0; i < n * n; i++) { fb[i] += a * (v[i] - 0.5); rg[i] += a * (1 - Math.abs(2 * w[i] - 1) - 0.5); }
  }
  const data = new Uint8Array(n * n * 4), at = (f, x, y) => f[((y + n) % n) * n + ((x + n) % n)];
  const grads = (f) => { // central differences, then scale to a target RMS
    const gx = new Float32Array(n * n), gy = new Float32Array(n * n); let s = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; gx[i] = at(f, x + 1, y) - at(f, x - 1, y); gy[i] = at(f, x, y + 1) - at(f, x, y - 1); s += gx[i] * gx[i] + gy[i] * gy[i]; }
    return { gx, gy, rms: Math.sqrt(s / (2 * n * n)) };
  };
  const A = grads(fb), B = grads(rg), q = (g, k) => Math.max(0, Math.min(255, 127.5 + (g * k / RELIEF_GMAX) * 127.5));
  const kA = 0.15 / A.rms, kB = 0.22 / B.rms;
  for (let i = 0; i < n * n; i++) { data[i * 4] = q(A.gx[i], kA); data[i * 4 + 1] = q(A.gy[i], kA); data[i * 4 + 2] = q(B.gx[i], kB); data[i * 4 + 3] = q(B.gy[i], kB); }
  return data;
}

/** The scanned detail, packed small: rock normal (RG), rock luminance (B), grass luminance (A) from the PBR scans (public/tex), 256^2, one fetch each use.
 *  Filled asynchronously (a grey placeholder until the JPEGs decode); the pbr.js arrays are 16 layers with 8x anisotropy and cost too much for this. */
function scanPack() {
  const n = 256, data = new Uint8Array(n * n * 4).fill(128), t = mk(data, n, 2), base = import.meta.env.BASE_URL + 'tex/';
  const read = async (name) => {
    const img = new Image(); img.src = base + name; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, n, n);
    return g.getImageData(0, 0, n, n).data;
  };
  if (typeof document !== 'undefined') Promise.all([read('rock_col.jpg'), read('rock_nrm.jpg'), read('grass_col.jpg')]).then(([rc, rn, gc]) => {
    let mr = 0, mg = 0; const lum = (a, i) => 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
    for (let i = 0; i < n * n * 4; i += 4) { mr += lum(rc, i); mg += lum(gc, i); }
    mr /= n * n; mg /= n * n;
    for (let i = 0; i < n * n * 4; i += 4) {
      data[i] = rn[i]; data[i + 1] = rn[i + 1];
      data[i + 2] = Math.min(255, (lum(rc, i) / mr) * 128); data[i + 3] = Math.min(255, (lum(gc, i) / mg) * 128);
    }
    t.needsUpdate = true;
  }).catch((e) => console.warn('ground scans', e));
  return t;
}

/** A tileable value-noise pack (20 km tile): R 2.5 km, G 0.8 km, B 6 km, A 0.2 km features: replaces a handful of noise calls. */
function noiseData(n) {
  const a = vnoise(n, 64, 61), b = vnoise(n, 20, 62), c = vnoise(n, 160, 63), d = vnoise(n, 5, 64), data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) { data[i * 4] = a[i] * 255; data[i * 4 + 1] = b[i] * 255; data[i * 4 + 2] = c[i] * 255; data[i * 4 + 3] = d[i] * 255; }
  return data;
}

/** Bake the textures. quality 'low' / 'medium' use smaller fields. */
export function bakeGroundTextures(quality = 'high') {
  const nf = quality === 'high' ? 1024 : 512;
  return { fields: mk(fieldsData(nf, 28), nf, 4), canopy: mk(canopyData(512), 512), urban: mk(urbanData(512), 512), relief: mk(reliefData(512), 512), noise: mk(noiseData(512), 512), scan: scanPack() };
}
