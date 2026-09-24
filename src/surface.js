// Procedural surface detail for the palette-atlas world (ART.md): every swatch maps to a surface type whose
// height field drives bump-mapped normals + albedo variation - asphalt grain, concrete pores, grass, paving
// stones, sand ripples, dirt, brick bond, wood grain, leaves, brushed metal and animated water.
// Models have no real UVs (faces point at swatch centres), so patterns run in object space, projected on the
// dominant axis of the local normal. They fade with distance to avoid shimmer.

export const surfaceTime = { value: 0 };
export const surfaceOn = { value: 1 }; // 0 on low-spec devices (set by the fps watchdog)

// swatch index = col + 8 * row (see blender/lib.py PALETTE). Types:
// 0 none, 1 paint, 2 asphalt, 3 concrete, 4 grass, 5 paving, 6 sand, 7 dirt, 8 brick, 9 wood, 10 leaves, 11 metal, 12 water, 13 roof shingles
const OBJECT = [
  1, 1, 6, 1, 1, 1, 2, 2, //  cream white sand clay terracotta brick asphalt asphalt_lt  (plain colours = paint)
  1, 1, 1, 1, 1, 1, 1, 1, //  mint sage forest sky teal butter peach pink
  1, 1, 1, 1, 3, 11, 1, 1, //  red police navy olive concrete steel ink hazard
  0, 0, 0, 0, 0, 0, 0, 0, //  emissive row
  11, 11, 11, 0, 1, 1, 11, 1, // gold chrome copper glass gloss_black pearl rose_gold hot_pink
  9, 10, 10, 13, 8, 7, 12, 10, // wood foliage foliage_lt roof_tile brick_wall dirt water foliage_mint  (textured row)
];
const GROUND = [
  5, 5, 6, 7, 5, 5, 2, 2,
  4, 4, 4, 12, 12, 6, 6, 5,
  1, 1, 1, 1, 3, 3, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0,
  11, 11, 11, 0, 1, 1, 11, 1,
  9, 4, 4, 5, 8, 7, 12, 4,
];

const GLSL = /* glsl */ `
  varying vec3 vSurfP; varying vec3 vSurfN;
  uniform float uSurfTime; uniform float uSurfOn;
  float sH21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(sH21(i), sH21(i + vec2(1.0, 0.0)), u.x), mix(sH21(i + vec2(0.0, 1.0)), sH21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float sFbm(vec2 p) { return sNoise(p) * 0.65 + sNoise(p * 2.07 + 13.1) * 0.35; } // 2 octaves: detail is small on screen anyway
  vec3 sTint = vec3(1.0); // per-type colour shift (grass tips etc.)
  // Grass without geometry: each cell holds one short tapered blade stroke at a random, mostly mow-aligned
  // angle; returns blade coverage (x) and how far along the blade we are (y, 1 = sunlit tip).
  vec2 sBlades(vec2 p) {
    vec2 i = floor(p), f = fract(p), best = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 c = vec2(float(x), float(y)), o = vec2(sH21(i + c), sH21(i + c + 17.3));
      vec2 d = c + o - f;
      float a = 1.2 + (sH21(i + c + 31.7) - 0.5) * 2.2, len = 0.55 + sH21(i + c + 5.1) * 0.35;
      vec2 dir = vec2(cos(a), sin(a));
      float along = -dot(d, dir), across = abs(dot(d, vec2(-dir.y, dir.x)));
      float t = clamp(along / len, 0.0, 1.0), w = 0.11 * (1.0 - t);
      float m = smoothstep(w, w * 0.35, across) * step(0.0, along) * step(along, len);
      if (m > best.x) best = vec2(m, t);
    }
    return best;
  }
  // x = height (0..1), y = albedo multiplier, z = bump amplitude
  vec3 surfacePattern(int t, vec2 q) {
    if (t == 1) return vec3(sNoise(q * 40.0) * 0.3, 1.0 + (sNoise(q * 3.0) - 0.5) * 0.04, 0.08); // smooth satin paint
    if (t == 2) { float g = sFbm(q * 7.0), sp = step(0.94, sH21(floor(q * 30.0)));
      return vec3(g * 0.6 + sp * 0.4, 1.0 + (g - 0.5) * 0.14 + sp * 0.12 - (sFbm(q * 0.35) - 0.5) * 0.14, 0.55); }
    if (t == 3) { float g = sFbm(q * 4.0), pore = step(0.97, sH21(floor(q * 40.0)));
      return vec3(g - pore * 0.6, 1.0 + (g - 0.5) * 0.14 - pore * 0.2, 0.6); }
    if (t == 4) { // lawn: blade strokes at two readable scales + clumps + the odd clover/daisy
      vec2 a = sBlades(q * 5.5), b = sBlades(q * 10.0 + 7.3);
      float blade = max(a.x, b.x * 0.8), tip = a.x > b.x ? a.y : b.y, clump = sFbm(q * 0.7);
      float daisy = step(0.992, sH21(floor(q * 6.0))) * smoothstep(0.45, 0.2, length(fract(q * 6.0) - 0.5));
      sTint = mix(vec3(0.52, 0.66, 0.56), mix(vec3(1.02), vec3(1.26, 1.2, 0.78), tip), blade)
            * mix(vec3(1.08, 1.03, 0.86), vec3(0.9, 1.02, 1.08), clump);
      sTint = mix(sTint, vec3(1.9, 1.85, 1.55), daisy);
      return vec3(blade * (0.5 + tip * 0.5), 0.92 + clump * 0.2, 2.2); }
    if (t == 5) { vec2 g = q / 0.6; g.x += mod(floor(g.y), 2.0) * 0.5; vec2 f = fract(g), id = floor(g);
      float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)), joint = smoothstep(0.0, 0.06, e);
      return vec3(joint * (0.8 + sH21(id) * 0.2) + sNoise(q * 20.0) * 0.1, 0.93 + sH21(id) * 0.12 - (1.0 - joint) * 0.22, 0.8); }
    if (t == 6) { float r = sin(q.x * 5.5 + sFbm(q * 0.8) * 6.0) * 0.5 + 0.5, n = sNoise(q * 40.0);
      return vec3(r * 0.5 + n * 0.5, 1.0 + (n - 0.5) * 0.08 + (r - 0.5) * 0.05, 0.5); }
    if (t == 7) { float g = sFbm(q * 3.5), peb = step(0.9, sH21(floor(q * 12.0)));
      return vec3(g + peb * 0.3, 0.86 + g * 0.26, 0.8); }
    if (t == 8) { vec2 g = q / vec2(0.26, 0.09); g.x += mod(floor(g.y), 2.0) * 0.5; vec2 f = fract(g), id = floor(g);
      float e = min(min(f.x, 1.0 - f.x) * 0.26, min(f.y, 1.0 - f.y) * 0.09), mortar = smoothstep(0.004, 0.012, e);
      return vec3(mortar * (0.85 + sH21(id) * 0.15), mix(1.3, 0.86 + sH21(id) * 0.26, mortar), 0.9); }
    if (t == 9) { float rings = sin(q.y * 60.0 + sFbm(q * vec2(1.0, 8.0)) * 4.0) * 0.5 + 0.5;
      float gap = smoothstep(0.0, 0.03, min(fract(q.y / 0.15), 1.0 - fract(q.y / 0.15)));
      return vec3((rings * 0.5 + sNoise(q * vec2(4.0, 80.0)) * 0.3) * gap, 0.9 + rings * 0.12 - (1.0 - gap) * 0.3, 0.7); }
    if (t == 10) { float v = sNoise(q * 14.0) * 0.6 + sNoise(q * 31.0) * 0.4;
      return vec3(v, 0.84 + v * 0.3, 1.0); }
    if (t == 11) return vec3(sNoise(vec2(q.x * 2.0, q.y * 120.0)) * 0.5, 1.0, 0.03); // faint brushing, not wicker
    if (t == 12) { float w = sin(q.x * 2.1 + uSurfTime * 1.3 + sFbm(q * 0.5) * 3.0) * 0.5 + sin(q.y * 2.7 - uSurfTime * 1.1) * 0.5;
      float n = sNoise(q * 6.0 + uSurfTime * 0.3);
      return vec3(w * 0.5 + 0.5 + n * 0.3, 1.0 + w * 0.05 + step(0.92, n) * 0.12, 1.2); }
    if (t == 13) { vec2 g = q / vec2(0.34, 0.26); g.x += mod(floor(g.y), 2.0) * 0.5; vec2 f = fract(g), id = floor(g);
      float edge = smoothstep(0.0, 0.1, f.y) * smoothstep(0.0, 0.07, min(f.x, 1.0 - f.x));
      return vec3((0.3 + f.y * 0.7) * edge, 0.86 + sH21(id) * 0.18 + f.y * 0.08 - (1.0 - edge) * 0.28, 0.9); }
    return vec3(0.0, 1.0, 0.0);
  }
`;

/** Patch a MeshStandardMaterial shader (inside onBeforeCompile) with surface detail. ground = use the ground table. */
export function applySurface(s, ground = false) {
  const baseAO = ground ? '' : 'diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.8, vSurfP.y)); // grounding: darker where it meets the floor';
  if (typeof location !== 'undefined' && location.search.includes('nosurf')) return; // A/B perf switch
  const table = ground ? GROUND : OBJECT;
  s.uniforms.uSurfTime = surfaceTime;
  s.uniforms.uSurfOn = surfaceOn;
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vSurfP; varying vec3 vSurfN;')
    .replace('#include <project_vertex>', 'vSurfP = transformed; vSurfN = objectNormal;\n#include <project_vertex>');
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL}\nconst int SURF_TABLE[48] = int[48](${table.join(', ')});\nfloat sBump = 0.0;`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      {
        int sw = clamp(int(floor(vMapUv.x * 8.0)) + 8 * int(floor(vMapUv.y * 6.0)), 0, 47);
        int st = SURF_TABLE[sw];
        float fade = smoothstep(95.0, 18.0, length(vViewPosition)) * uSurfOn;
        if (st > 0 && fade > 0.01) { // far or plain surfaces skip the pattern work entirely
          vec3 n = abs(normalize(vSurfN));
          vec2 q = n.y > 0.6 ? vSurfP.xz : (n.x > n.z ? vSurfP.zy : vSurfP.xy);
          vec3 sp = surfacePattern(st, q);
          diffuseColor.rgb *= mix(vec3(1.0), sp.y * sTint, fade);
          sBump = sp.x * sp.z * 0.035 * fade;
        }
        ${baseAO}
      }`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (sBump != 0.0) {
        vec3 pos = -vViewPosition, dpx = dFdx(pos), dpy = dFdy(pos);
        float dhx = dFdx(sBump), dhy = dFdy(sBump);
        vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
        float det = dot(dpx, r1);
        vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
        normal = normalize(abs(det) * normal - grad);
      }`);
}
