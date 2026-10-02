// Seeded Perlin noise (2D for the town and island, 3D for the planet) and a smoothstep, shared by terrain.js and planetgen.js.
// Pure: no three, no DOM, so the planet worker can import it.
export function makeNoise(seed) {
  const perm = new Uint8Array(512);
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => { const g = h & 7; const u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v); };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y) => { // Perlin, ~[-1, 1]
    const X = Math.floor(x), Y = Math.floor(y), xf = x - X, yf = y - Y, xi = X & 255, yi = Y & 255;
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1], ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
    const l1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const l2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    return (l1 + v * (l2 - l1)) * 0.5;
  };
  const fbm = (x, y, oct = 5) => { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += noise(x * f, y * f) * amp; f *= 2.03; amp *= 0.5; } return s; };
  const ridged = (x, y, oct = 4) => { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(noise(x * f, y * f) * 1.6); s += n * n * amp; f *= 2.1; amp *= 0.5; } return s; };
  // 3D Perlin (same permutation table, ~[-1, 1]); the planet needs it: 2D noise on cube faces would seam
  const g3 = (h, x, y, z) => { const g = h & 15, u = g < 8 ? x : y, v = g < 4 ? y : (g === 12 || g === 14 ? x : z); return ((g & 1) ? -u : u) + ((g & 2) ? -v : v); };
  const noise3 = (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), xf = x - X, yf = y - Y, zf = z - Z, xi = X & 255, yi = Y & 255, zi = Z & 255;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const A = perm[xi] + yi, AA = perm[A] + zi, AB = perm[A + 1] + zi, B = perm[xi + 1] + yi, BA = perm[B] + zi, BB = perm[B + 1] + zi;
    const x1 = g3(perm[AA], xf, yf, zf) + u * (g3(perm[BA], xf - 1, yf, zf) - g3(perm[AA], xf, yf, zf));
    const x2 = g3(perm[AB], xf, yf - 1, zf) + u * (g3(perm[BB], xf - 1, yf - 1, zf) - g3(perm[AB], xf, yf - 1, zf));
    const x3 = g3(perm[AA + 1], xf, yf, zf - 1) + u * (g3(perm[BA + 1], xf - 1, yf, zf - 1) - g3(perm[AA + 1], xf, yf, zf - 1));
    const x4 = g3(perm[AB + 1], xf, yf - 1, zf - 1) + u * (g3(perm[BB + 1], xf - 1, yf - 1, zf - 1) - g3(perm[AB + 1], xf, yf - 1, zf - 1));
    const y1 = x1 + v * (x2 - x1), y2 = x3 + v * (x4 - x3);
    return (y1 + w * (y2 - y1)) * 0.8;
  };
  const fbm3 = (x, y, z, oct = 5) => { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += noise3(x * f, y * f, z * f) * amp; f *= 2.03; amp *= 0.5; } return s; };
  const ridged3 = (x, y, z, oct = 4) => { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(noise3(x * f, y * f, z * f) * 1.4); s += n * n * amp; f *= 2.1; amp *= 0.5; } return s; };
  return { noise, fbm, ridged, rnd, noise3, fbm3, ridged3 };
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

