// A hole: the one cold thing in a warm toy world. Void well + starfield + rim (Blender model), styled by a skin.
// Up to MAX_HOLES holes share one ground-cut uniform (player + rivals).
import * as THREE from 'three/webgpu';
import { Fn, uniform, float, positionGeometry, positionWorld, normalView, normalWorld, positionView, normalize, dot, abs, time, clamp, atan, mix, smoothstep, sin, cos, exp, pow, vec2, vec3, vec4, hash, floor, step, length, fract, mx_noise_float, log, max, mod, attribute, rotate } from 'three/tsl';
import { sunDir, sunCol, sunLux, skyFill } from './look.js';
import { SKINS } from './skins.js';

export const GROWTH = 0.17;
const _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _tq = new THREE.Quaternion();
export const MAX_HOLES = 5; // player, up to three rivals, the split twin

/** Shared uniform: vec3(x, z, r) per hole; r = 0 means the slot is empty. */
export function holeField() {
  return { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector3(0, 0, 0)) };
}

// Ground layers at the lip, top down, per surface (linear colour): the skin, its bed, then shared topsoil and subsoil
const ASPHALT = [0.045, 0.045, 0.05], GRAVEL = [0.17, 0.155, 0.14];
const PAVING = [0.5, 0.39, 0.34], SANDBED = [0.4, 0.31, 0.2];
const TURF = [0.07, 0.15, 0.035], ROOTS = [0.13, 0.08, 0.045];

/**
 * The well: a cut through the ground, then the void. The top of the wall is a cross-section of what the hole is cut
 * into (asphalt over gravel under roads, paving over a sand bed under sidewalks, turf over roots elsewhere), then banded
 * topsoil and subsoil with pebbles, then a ragged edge where the void starts and falls to black. MeshBasic, shaded here:
 * the sun lights the wall facing it, the lip's shadow covers the rest (exact for a round shaft), sky fill fades with depth.
 */
function voidMaterial(skin) {
  const u = {
    uTop: uniform(new THREE.Color(skin.top)), uDeep: uniform(new THREE.Color(skin.deep)), uStar: uniform(new THREE.Color(skin.star)),
    uRim: uniform(new THREE.Color(skin.rim)), uSwirl: uniform(skin.swirl), uLens: uniform(skin.lens), uTime: uniform(0), uDepth: uniform(4),
    uR: uniform(1), uBand: uniform(0.35), uTown: uniform(0), // uTown: the town's half-size (its road grid); 0 = all turf
  };
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false });
  mat.colorNode = Fn(() => {
    const vP = positionGeometry;
    const d = clamp(vP.y.negate(), 0, 1), ang = atan(vP.z, vP.x);
    const depthM = d.mul(u.uDepth), lu = depthM.div(u.uBand); // metres below the lip, and in layer units
    // ---- the void: a cold glow just under the earth, falling to true black long before the floor
    const fall = float(1).sub(smoothstep(0.04, 0.6, d));
    const col = mix(u.uTop.mul(0.42), u.uDeep.mul(0.2), smoothstep(0.0, 0.25, d)).mul(fall.mul(fall)).toVar();
    const arms = sin(ang.mul(3).add(d.mul(18)).sub(u.uTime.mul(1.2))).mul(0.5).add(0.5);
    col.assign(mix(col, u.uTop.mul(0.9), u.uSwirl.mul(arms).mul(float(1).sub(smoothstep(0.05, 0.5, d))).mul(0.6)));
    col.addAssign(u.uRim.mul(u.uLens).mul(2.2).mul(exp(pow(d.sub(0.06).mul(28), 2).negate()))); // lensing skins: a hot ring under the lip
    const g = vec2(ang.mul(18), vP.y.add(u.uTime.mul(0.03)).mul(60));
    const h = hash(floor(g).add(vec2(2048, 4096)).dot(vec2(1, 8192)));
    const star = step(0.93, h).mul(float(1).sub(smoothstep(0, 0.5, length(fract(g).sub(0.5))))).mul(sin(u.uTime.mul(3).add(h.mul(40))).mul(0.4).add(0.6));
    col.addAssign(u.uStar.mul(star).mul(0.7).mul(smoothstep(0.06, 0.18, d)).mul(float(1).sub(smoothstep(0.3, 0.55, d))).mul(float(1).sub(smoothstep(300, 1500, u.uDepth)))); // (a pit kilometres wide shows no lattice of stars: the ascension)
    // ---- the cut: which surface this side of the lip is (the town's 40 m road grid; blocks stand 15.3 m out from each tile centre, the outer 2.4 m is sidewalk)
    const pw = positionWorld.xz, half = u.uTown;
    const l = mod(pw.add(half), 40).sub(20).abs(), lm = max(l.x, l.y);
    const inTown = step(abs(pw.x).max(abs(pw.y)), half.sub(0.01));
    const road = inTown.mul(step(15.3, lm)), walk = inTown.mul(step(12.9, lm)).mul(float(1).sub(road));
    const skinC = mix(mix(vec3(...TURF), vec3(...PAVING), walk), vec3(...ASPHALT), road);
    const bedC = mix(mix(vec3(...ROOTS), vec3(...SANDBED), walk), vec3(...GRAVEL), road);
    const n = mx_noise_float(vec3(ang.mul(7), lu.mul(3), 0.5)).mul(0.5).add(0.5);
    const band = sin(lu.mul(9).add(n.mul(3))).mul(0.5).add(0.5);
    const top = mix(vec3(0.26, 0.17, 0.1), vec3(0.17, 0.11, 0.065), band), sub = mix(vec3(0.3, 0.2, 0.13), vec3(0.15, 0.12, 0.11), band);
    const pebble = step(0.78, mx_noise_float(vec3(ang.mul(55).mul(u.uR.pow(0.5)), lu.mul(14), 3.1)).mul(0.5).add(0.5));
    const earth = mix(skinC, bedC, smoothstep(0.12, 0.17, lu.add(n.mul(0.03)))).toVar();
    earth.assign(mix(earth, top, smoothstep(0.55, 0.65, lu.add(n.mul(0.12)))));
    earth.assign(mix(earth, sub, smoothstep(1.05, 1.2, lu.add(n.mul(0.2)))));
    earth.mulAssign(n.mul(0.4).add(0.8));
    earth.addAssign(vec3(0.16, 0.14, 0.12).mul(pebble).mul(smoothstep(0.15, 0.3, lu)));
    // ---- light: the inward normal faces the sun on the far wall; the lip's shadow reaches 2 r cos(a) tan(elev) down it
    const nIn = normalize(vP.xz).negate(), sh = sunDir.xz, sh2 = max(dot(sh, sh), 1e-4);
    const lam = max(dot(nIn, sh), 0), shD = u.uR.mul(2).mul(lam).mul(max(sunDir.y, 0)).div(sh2);
    const lit = float(1).sub(smoothstep(shD.mul(0.9), shD.add(u.uBand.mul(0.08)), depthM));
    const sky = float(1).div(float(1).add(depthM.div(u.uR.mul(0.9)))); // (how much sky a point on the wall sees)
    const lip = smoothstep(0.0, 0.06, lu).mul(0.4).add(0.6); // (contact shade right under the rim)
    const shade = sunCol.mul(sunLux).mul(lam).mul(lit).add(skyFill.mul(sky.mul(sky)).mul(0.9)).mul(lip);
    const edge = smoothstep(1.55, 1.85, lu.add(n.mul(0.35)));
    return vec4(mix(earth.mul(shade), col, edge), 1);
  })();
  mat.userData.u = u;
  return mat;
}

/** Ground chips the hole drags in: one merged mesh, each chip spiralling in from ~2 radii, hopping the rim and dropping
 *  into the well. All motion is in the vertex shader (no CPU per chip); `uN` caps how many draw (the governor's low spec halves it). */
const CHIPS = 48;
function debrisMesh() {
  const base = new THREE.IcosahedronGeometry(1, 0).toNonIndexed(), bp = base.attributes.position.array, nv = bp.length / 3;
  const pos = new Float32Array(CHIPS * bp.length), id = new Float32Array(CHIPS * nv);
  for (let c = 0; c < CHIPS; c++) { pos.set(bp, c * bp.length); id.fill(c, c * nv, (c + 1) * nv); }
  base.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aChip', new THREE.BufferAttribute(id, 1));
  const u = { uTime: uniform(0), uPull: uniform(1), uReach: uniform(1), uSize: uniform(0.08), uN: uniform(CHIPS) };
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  const cid = attribute('aChip', 'float');
  const h1 = hash(cid.mul(1.7).add(0.3)), h2 = hash(cid.mul(3.1).add(1.1)), h3 = hash(cid.mul(5.3).add(2.7)), h4 = hash(cid.mul(7.9).add(4.2));
  const t = fract(u.uTime.mul(u.uPull).mul(h2.mul(0.45).add(0.55)).mul(0.22).add(h1)); // life 0..1
  const tf = smoothstep(0.84, 1.0, t); // the drop
  const rr = mix(float(1).add(u.uReach.mul(pow(float(1).sub(t), 1.6)).mul(h4.mul(0.5).add(0.6))), float(0.86), tf);
  const a = h3.mul(6.2832).add(t.mul(1.2)).add(pow(t, 3).mul(2.6)); // turning faster as it nears the rim
  const hop = sin(smoothstep(0.7, 0.86, t).mul(3.1416)).mul(0.16);
  const y = hop.sub(tf.mul(tf).mul(1.4));
  const s = u.uSize.mul(pow(h2, 2).mul(0.9).add(0.4)).mul(smoothstep(0.0, 0.08, t)).mul(float(1).sub(smoothstep(0.95, 1.0, t))).mul(step(cid, u.uN.sub(0.5)));
  const spin = t.mul(14).add(h1.mul(6.28));
  const local = rotate(positionGeometry.mul(vec3(1, 0.6, 0.8)), vec3(spin, spin.mul(0.7), 0));
  mat.positionNode = vec3(rr.mul(cos(a)), y.add(s.mul(0.4)), rr.mul(sin(a))).add(local.mul(s));
  // chips are roughly round: light them by their rotated vertex direction (soil, stone and turf bits)
  const alb = mix(mix(vec3(0.22, 0.14, 0.08), vec3(0.3, 0.28, 0.25), step(0.45, h4)), vec3(0.08, 0.17, 0.04), step(0.8, h4));
  const nd = max(dot(normalize(local), sunDir), 0);
  mat.colorNode = vec4(alb.mul(sunCol.mul(sunLux).mul(nd).add(skyFill.mul(0.8))).mul(float(1).sub(tf.mul(0.85))), 1);
  mat.userData.u = u;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; // (the vertex shader moves everything; the bounds are the unit chip's)
  return mesh;
}

/** Soft contact occlusion on the ground round the rim, heavier on the side away from the sun (where the rim's shadow
 *  would fall: the rim casts no real shadow). Holds the lip down on the low tiers, which have no AO pass. */
function occlusionRing() {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  const p = positionGeometry.xz, rl = length(p);
  const away = dot(p.div(rl), normalize(sunDir.xz.add(vec2(1e-4, 0))).negate()).mul(0.5).add(0.5);
  const k = pow(float(1).sub(smoothstep(1.0, 1.55, rl)), 2).mul(away.mul(0.3).add(0.22));
  mat.colorNode = vec4(vec3(0.02, 0.015, 0.03), 1);
  mat.opacityNode = k;
  const m = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.55, 96, 1).rotateX(-Math.PI / 2), mat);
  m.renderOrder = 1;
  return m;
}

export class Hole {
  constructor(assets, field, slot = 0, { x = 0, z = 0, r = 0.45, skin = 'void' } = {}) {
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.area = Math.PI * r * r;
    this.field = field;
    this.slot = slot;
    this.skin = SKINS[skin] || SKINS.void;
    this.group = new THREE.Group();
    this.voidMat = voidMaterial(this.skin);
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true).translate(0, -0.5, 0), this.voidMat);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2).translate(0, -1, 0),
      new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })); // (the bottom is true black: the wall's gradient ends there)
    this.well = new THREE.Group().add(well, floor);
    // rim: glowing toy plastic; while the Ghost power-up runs, a fresnel shimmer ripples over it
    this.ghostU = uniform(0);
    this.rimMat = new THREE.MeshStandardNodeMaterial({ color: this.skin.rim, roughness: 0.3, metalness: 0.2 });
    const rimCol = uniform(new THREE.Color(this.skin.rim));
    const fres = pow(clamp(float(1).sub(abs(dot(normalize(normalView), normalize(positionView.negate())))), 0, 1), 2.5);
    const shimmer = sin(time.mul(12).add(positionGeometry.x.mul(9)).add(positionGeometry.z.mul(7))).mul(0.5).add(0.5);
    // lit from the sun's side: a thin hot edge along the crest that faces it, the far side of the ring a little dimmer
    const nw = normalize(normalWorld), sunSide = dot(normalize(nw.xz.add(vec2(1e-4, 0))), normalize(sunDir.xz.add(vec2(1e-4, 0)))).mul(0.5).add(0.5);
    const crest = pow(max(dot(nw, sunDir), 0), 12);
    this.rimMat.emissiveNode = rimCol.mul(float(0.3).add(sunSide.mul(0.34)).add(this.ghostU.mul(fres.mul(2.4).add(shimmer.mul(0.6)))))
      .add(mix(rimCol, vec3(1), 0.55).mul(crest.mul(0.9)));
    this.rimFade = uniform(1); // (the ascension: the toy rim thins away as the lip becomes kilometres wide, leaving the thin glowing ring)
    this.rimMat.opacityNode = float(1).sub(this.ghostU.mul(0.35).mul(shimmer)).mul(this.rimFade);
    this.rimMat.transparent = true;
    this.rim = assets.hole_rim.scene.clone();
    this.rim.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.material = this.rimMat; } });
    // Ghost ring drawn over everything so buildings never hide where the hole is.
    this.ghost_ = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.03, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.skin.rim, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
    this.ghost_.renderOrder = 10;
    // whirlpool: log-spiral arms streaming into the rim while the vacuum is on
    const su = { uTime: uniform(0), uVac: uniform(0), uReach: uniform(2), uCol: uniform(new THREE.Color(this.skin.rim)) };
    this.swirlMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.swirlMat.colorNode = Fn(() => {
      const vP = positionGeometry.xz;
      const r = length(vP), a = atan(vP.y, vP.x);
      const arms = sin(a.mul(5).add(log(r).mul(9)).add(su.uTime.mul(14)));
      const band = smoothstep(0.35, 0.95, arms);
      const fade = float(1).sub(smoothstep(1.15, su.uReach, r)).mul(smoothstep(1.0, 1.08, r));
      return vec4(su.uCol.mul(band).mul(fade).mul(su.uVac.min(1)).mul(0.9), 1);
    })();
    this.swirlMat.userData.u = su;
    this.swirl = new THREE.Mesh(new THREE.RingGeometry(1, 4.8, 96, 1).rotateX(-Math.PI / 2), this.swirlMat);
    this.swirl.renderOrder = 2;
    // size-up shockwave: a bright ring racing outward over the ground
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 128).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.skin.rim, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.wave.visible = false;
    this.waveT = 0;
    this.occl = occlusionRing();
    // the player's hole drags loose ground in (rivals don't: one draw each would add up)
    this.debris = slot === 0 ? debrisMesh() : null;
    this.group.add(this.well, this.rim, this.ghost_, this.swirl, this.wave, this.occl);
    if (this.debris) this.group.add(this.debris);
    this.townHalf = 0; // set by the game: the town's half-size, so the cut under roads shows asphalt (0 = turf everywhere)
    this.lowSpec = false;
    this.pulse = 0;
  }

  dispose() {
    for (const m of [...this.well.children, this.ghost_, this.swirl, this.wave, this.occl, ...(this.debris ? [this.debris] : [])]) { m.geometry.dispose(); m.material.dispose(); }
    this.rimMat.dispose();
    this.field.value[this.slot].set(0, 0, 0);
  }

  shockwave() { this.waveT = 0.9; }

  // the radius is read thousands of times a frame (every entity tests every hole): keep it cached with the area
  get area() { return this._area; }
  set area(v) { this._area = v; this._r = Math.sqrt(v / Math.PI); }
  get r() { return this._r; }

  /** Swallowing adds a share of the object's footprint, so every tier feels the same relative bite. */
  grow(tier, mult = 1) {
    this.area += Math.PI * tier * tier * GROWTH * mult;
  }

  /** tilt (Phase 2 hills): { y, nx, nz } - the ground plane under the disc; the rim and its rings lie on it. */
  update(dt, time, hunger = 0, span = [0.18, 0.18], tilt = null) {
    const r = this.hidden ? 0 : this.r;
    this.tiltQ ??= new THREE.Quaternion();
    if (tilt) {
      _n.set(-tilt.nx, 1, -tilt.nz).normalize();
      _tq.setFromUnitVectors(_up, _n);
      this.tiltQ.slerp(_tq, Math.min(1, dt * 6));
    } else this.tiltQ.identity();
    for (const o of [this.rim, this.ghost_, this.swirl, this.wave, this.occl, this.debris]) o?.quaternion.copy(this.tiltQ);
    // well opens at the lowest ground under the disc (never stands up like a can on the road);
    // the lip rests on the highest (never buried under the sidewalk)
    const k = Math.min(1, dt * 12);
    this.gy = this.gy === undefined ? span[0] : this.gy + (span[0] - this.gy) * k;
    this.gt = this.gt === undefined ? span[1] : this.gt + (span[1] - this.gt) * k;
    this.field.value[this.slot].set(this.x, this.z, r);
    this.group.visible = !this.hidden && !this.capMode; // (Phase 3, r >= 110 km: the planet shader draws the hole as a spherical cap)
    const depth = Math.max(4, r * 5);
    this.well.position.set(this.x, this.gy, this.z);
    this.well.scale.set(r || 1e-3, depth, r || 1e-3);
    this.pulse += dt * (2 + hunger * 10);
    this.bump = Math.max(0, (this.bump || 0) - dt * 0.8);
    const p = 1 + Math.sin(this.pulse) * (0.015 + hunger * 0.05) + this.bump;
    // on a slope the rim lies on the ground plane through the disc's middle, not at its highest point
    this.ry = tilt ? (this.ry === undefined ? tilt.y : this.ry + (tilt.y - this.ry) * k) : this.gt;
    this.rim.position.set(this.x, this.ry + 0.01, this.z);
    this.rim.scale.set(r * p || 1e-3, Math.max(1, r * 0.35), r * p || 1e-3);
    this.ghost_.position.set(this.x, this.ry + 0.02, this.z);
    this.ghost_.scale.setScalar(r * p || 1e-3);
    this.rimFade.value = 1 - THREE.MathUtils.smoothstep(r, 150, 700);
    this.rim.visible = this.rimFade.value > 0.01;
    this.voidMat.userData.u.uTime.value = time;
    const vu = this.voidMat.userData.u;
    vu.uDepth.value = depth;
    vu.uR.value = r || 1e-3;
    vu.uBand.value = Math.min(0.3 + r * 0.12, 2.7 + r * 0.06); // (layer unit, m: the cut stays readable from a 0.45 m start to a 150 m pit)
    vu.uTown.value = this.townHalf;
    this.occl.position.set(this.x, this.ry + 0.015, this.z);
    this.occl.scale.setScalar(r * p || 1e-3);
    this.occl.visible = this.rim.visible;
    if (this.debris) {
      const du = this.debris.material.userData.u;
      this.debris.visible = this.rim.visible && r > 0;
      this.debris.position.set(this.x, this.ry + 0.02, this.z);
      this.debris.scale.setScalar(r || 1e-3);
      du.uTime.value = time;
      du.uPull.value = 1 + (this.vac || 0) * 2.5; // the vacuum power speeds the stream
      du.uReach.value = 0.7 + Math.min(0.6, 0.5 / Math.max(r, 0.1)); // small holes reach further, in radii
      du.uSize.value = (0.03 + 0.012 * r) / Math.max(r, 1e-3);
      du.uN.value = this.lowSpec ? CHIPS / 2 : CHIPS;
    }
    const vac = this.vac || 0;
    this.swirl.visible = vac > 0.01;
    this.swirl.position.set(this.x, this.ry + 0.03, this.z);
    this.swirl.scale.setScalar(r || 1e-3);
    this.swirlMat.userData.u.uVac.value = vac * 1.4;
    this.swirlMat.userData.u.uReach.value = (1.4 + vac * 0.5 + 1.2 / Math.max(r, 0.1)) * (this.reach || 1); // same reach as city.js pulls
    this.ghostU.value += ((this.ghost > 0 ? 1 : 0) - this.ghostU.value) * Math.min(1, dt * 6);
    this.ghost_.material.opacity = 0.55 * (1 - this.ghostU.value * 0.6);
    this.swirlMat.userData.u.uTime.value = time;
    if (this.waveT > 0) {
      this.waveT = Math.max(0, this.waveT - dt);
      const k = 1 - this.waveT / 0.9;
      this.wave.position.set(this.x, this.ry + 0.05, this.z);
      this.wave.scale.setScalar((r || 1e-3) * (1 + k * 5));
      this.wave.material.opacity = (1 - k) * 0.9;
    }
    this.wave.visible = this.waveT > 0;
  }
}
