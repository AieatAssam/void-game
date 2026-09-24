// A hole: the one cold thing in a warm toy world. Void well + starfield + rim (Blender model), styled by a skin.
// Up to MAX_HOLES holes share one ground-cut uniform (player + rivals).
import * as THREE from 'three/webgpu';
import { Fn, uniform, positionGeometry, clamp, atan, mix, smoothstep, sin, exp, pow, vec2, vec3, vec4, hash, floor, step, length, fract, mx_noise_float, log } from 'three/tsl';
import { SKINS } from './skins.js';

export const GROWTH = 0.25;
export const MAX_HOLES = 4;

/** Shared uniform: vec3(x, z, r) per hole; r = 0 means the slot is empty. */
export function holeField() {
  return { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector3(0, 0, 0)) };
}

function voidMaterial(skin) {
  const u = {
    uTop: uniform(new THREE.Color(skin.top)), uDeep: uniform(new THREE.Color(skin.deep)), uStar: uniform(new THREE.Color(skin.star)),
    uRim: uniform(new THREE.Color(skin.rim)), uSwirl: uniform(skin.swirl), uLens: uniform(skin.lens), uTime: uniform(0), uDepth: uniform(4),
  };
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false });
  mat.colorNode = Fn(() => {
    const vP = positionGeometry;
    const d = clamp(vP.y.negate(), 0, 1), ang = atan(vP.z, vP.x);
    const col = mix(u.uTop.mul(0.7), u.uDeep.mul(0.35), smoothstep(0.0, 0.3, d)).toVar();
    // spiral arms drifting down the well
    const arms = sin(ang.mul(3).add(d.mul(18)).sub(u.uTime.mul(1.2))).mul(0.5).add(0.5);
    col.assign(mix(col, u.uTop.mul(0.9), u.uSwirl.mul(arms).mul(smoothstep(0.5, 0.05, d)).mul(0.6)));
    // lensing: a hot accretion ring just under the lip
    col.addAssign(u.uRim.mul(u.uLens).mul(2.2).mul(exp(pow(d.sub(0.06).mul(28), 2).negate())));
    const g = vec2(ang.mul(18), vP.y.add(u.uTime.mul(0.03)).mul(60));
    const h = hash(floor(g).dot(vec2(1, 157)));
    const star = step(0.93, h).mul(smoothstep(0.5, 0, length(fract(g).sub(0.5)))).mul(sin(u.uTime.mul(3).add(h.mul(40))).mul(0.4).add(0.6));
    col.addAssign(u.uStar.mul(star).mul(0.8).mul(smoothstep(0.05, 0.25, d)));
    // torn earth at the lip: road crust, then banded soil with pebbles, fading into the void
    const depthM = d.mul(u.uDepth);
    const n = mx_noise_float(vec3(ang.mul(6), depthM.mul(9), 0.5)).mul(0.5).add(0.5);
    const crust = vec3(0.09, 0.09, 0.1).mul(n.mul(0.4).add(0.8));
    const soilA = vec3(0.26, 0.17, 0.1), soilB = vec3(0.16, 0.1, 0.06);
    const band = sin(depthM.mul(22).add(n.mul(4))).mul(0.5).add(0.5);
    const pebble = step(0.8, mx_noise_float(vec3(ang.mul(40), depthM.mul(40), 3.1)).mul(0.5).add(0.5));
    const soil = mix(soilB, soilA, band).mul(n.mul(0.5).add(0.6)).add(pebble.mul(0.12));
    const earth = mix(crust, soil, smoothstep(0.12, 0.2, depthM.add(n.mul(0.05))));
    const edge = smoothstep(0.55, 0.9, depthM.add(n.mul(0.25)));
    return vec4(mix(earth.mul(0.55), col, edge), 1);
  })();
  mat.userData.u = u;
  return mat;
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
      new THREE.MeshBasicMaterial({ color: new THREE.Color(this.skin.deep).multiplyScalar(0.3), fog: false }));
    this.well = new THREE.Group().add(well, floor);
    this.rimMat = new THREE.MeshStandardMaterial({ color: this.skin.rim, emissive: this.skin.rim, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.2 });
    this.rim = assets.hole_rim.scene.clone();
    this.rim.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.material = this.rimMat; } });
    // Ghost ring drawn over everything so buildings never hide where the hole is.
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.03, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.skin.rim, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
    this.ghost.renderOrder = 10;
    // whirlpool: log-spiral arms streaming into the rim while the vacuum is on
    const su = { uTime: uniform(0), uVac: uniform(0), uReach: uniform(2), uCol: uniform(new THREE.Color(this.skin.rim)) };
    this.swirlMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.swirlMat.colorNode = Fn(() => {
      const vP = positionGeometry.xz;
      const r = length(vP), a = atan(vP.y, vP.x);
      const arms = sin(a.mul(5).add(log(r).mul(9)).add(su.uTime.mul(14)));
      const band = smoothstep(0.35, 0.95, arms);
      const fade = smoothstep(su.uReach, 1.15, r).mul(smoothstep(1.0, 1.08, r));
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
    this.group.add(this.well, this.rim, this.ghost, this.swirl, this.wave);
    this.pulse = 0;
  }

  dispose() {
    for (const m of [...this.well.children, this.ghost, this.swirl, this.wave]) { m.geometry.dispose(); m.material.dispose(); }
    this.rimMat.dispose();
    this.field.value[this.slot].set(0, 0, 0);
  }

  shockwave() { this.waveT = 0.9; }

  get r() { return Math.sqrt(this.area / Math.PI); }

  /** Swallowing adds a share of the object's footprint, so every tier feels the same relative bite. */
  grow(tier, mult = 1) {
    this.area += Math.PI * tier * tier * GROWTH * mult;
  }

  update(dt, time, hunger = 0, span = [0.18, 0.18]) {
    const r = this.hidden ? 0 : this.r;
    // well opens at the lowest ground under the disc (never stands up like a can on the road);
    // the lip rests on the highest (never buried under the sidewalk)
    const k = Math.min(1, dt * 12);
    this.gy = this.gy === undefined ? span[0] : this.gy + (span[0] - this.gy) * k;
    this.gt = this.gt === undefined ? span[1] : this.gt + (span[1] - this.gt) * k;
    this.field.value[this.slot].set(this.x, this.z, r);
    this.group.visible = !this.hidden;
    const depth = Math.max(4, r * 5);
    this.well.position.set(this.x, this.gy, this.z);
    this.well.scale.set(r || 1e-3, depth, r || 1e-3);
    this.pulse += dt * (2 + hunger * 10);
    this.bump = Math.max(0, (this.bump || 0) - dt * 0.8);
    const p = 1 + Math.sin(this.pulse) * (0.015 + hunger * 0.05) + this.bump;
    this.rim.position.set(this.x, this.gt + 0.01, this.z);
    this.rim.scale.set(r * p || 1e-3, Math.max(1, r * 0.35), r * p || 1e-3);
    this.ghost.position.set(this.x, this.gt + 0.02, this.z);
    this.ghost.scale.setScalar(r * p || 1e-3);
    this.voidMat.userData.u.uTime.value = time;
    this.voidMat.userData.u.uDepth.value = depth;
    const vac = this.vac || 0;
    this.swirl.visible = vac > 0.01;
    this.swirl.position.set(this.x, this.gt + 0.03, this.z);
    this.swirl.scale.setScalar(r || 1e-3);
    this.swirlMat.userData.u.uVac.value = vac * 1.4;
    this.swirlMat.userData.u.uReach.value = 1.4 + vac * 0.5 + 1.2 / Math.max(r, 0.1); // same reach as city.js pulls
    this.swirlMat.userData.u.uTime.value = time;
    if (this.waveT > 0) {
      this.waveT = Math.max(0, this.waveT - dt);
      const k = 1 - this.waveT / 0.9;
      this.wave.position.set(this.x, this.gt + 0.05, this.z);
      this.wave.scale.setScalar((r || 1e-3) * (1 + k * 5));
      this.wave.material.opacity = (1 - k) * 0.9;
    }
    this.wave.visible = this.waveT > 0;
  }
}
