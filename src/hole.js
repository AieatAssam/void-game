// A hole: the one cold thing in a warm toy world. Void well + starfield + rim (Blender model), styled by a skin.
// Up to MAX_HOLES holes share one ground-cut uniform (player + rivals).
import * as THREE from 'three';
import { SKINS } from './skins.js';

export const GROWTH = 0.25;
export const MAX_HOLES = 4;

/** Shared uniform: vec3(x, z, r) per hole; r = 0 means the slot is empty. */
export function holeField() {
  return { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector3(0, 0, 0)) };
}

function voidMaterial(skin) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 }, uTop: { value: new THREE.Color(skin.top) }, uDeep: { value: new THREE.Color(skin.deep) },
      uStar: { value: new THREE.Color(skin.star) }, uRim: { value: new THREE.Color(skin.rim) },
      uSwirl: { value: skin.swirl }, uLens: { value: skin.lens },
    },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSwirl, uLens; uniform vec3 uTop, uDeep, uStar, uRim;
      varying vec3 vP;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float d = clamp(-vP.y, 0.0, 1.0), ang = atan(vP.z, vP.x);
        vec3 col = mix(uTop * 0.7, uDeep * 0.35, smoothstep(0.0, 0.3, d));
        // spiral arms drifting down the well
        float arms = sin(ang * 3.0 + d * 18.0 - uTime * 1.2) * 0.5 + 0.5;
        col = mix(col, uTop * 0.9, uSwirl * arms * smoothstep(0.5, 0.05, d) * 0.6);
        // lensing: a hot accretion ring just under the lip
        col += uRim * uLens * 2.2 * exp(-pow((d - 0.06) * 28.0, 2.0));
        vec2 g = vec2(ang * 18.0, (vP.y + uTime * 0.03) * 60.0);
        float h = hash(floor(g));
        float star = step(0.93, h) * smoothstep(0.5, 0.0, length(fract(g) - 0.5)) * (0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0));
        col += star * uStar * 0.8 * smoothstep(0.05, 0.25, d);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
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
      new THREE.MeshBasicMaterial({ color: new THREE.Color(this.skin.deep).multiplyScalar(0.3) }));
    this.well = new THREE.Group().add(well, floor);
    this.rimMat = new THREE.MeshStandardMaterial({ color: this.skin.rim, emissive: this.skin.rim, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.2 });
    this.rim = assets.hole_rim.scene.clone();
    this.rim.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.material = this.rimMat; } });
    // Ghost ring drawn over everything so buildings never hide where the hole is.
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.03, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.skin.rim, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
    this.ghost.renderOrder = 10;
    this.group.add(this.well, this.rim, this.ghost);
    this.pulse = 0;
  }

  dispose() {
    for (const m of [...this.well.children, this.ghost]) { m.geometry.dispose(); m.material.dispose(); }
    this.rimMat.dispose();
    this.field.value[this.slot].set(0, 0, 0);
  }

  get r() { return Math.sqrt(this.area / Math.PI); }

  /** Swallowing adds a share of the object's footprint, so every tier feels the same relative bite. */
  grow(tier, mult = 1) {
    this.area += Math.PI * tier * tier * GROWTH * mult;
  }

  update(dt, time, hunger = 0) {
    const r = this.hidden ? 0 : this.r;
    this.field.value[this.slot].set(this.x, this.z, r);
    this.group.visible = !this.hidden;
    const depth = Math.max(4, r * 5);
    this.well.position.set(this.x, 0.18, this.z);
    this.well.scale.set(r || 1e-3, depth, r || 1e-3);
    this.pulse += dt * (2 + hunger * 10);
    this.bump = Math.max(0, (this.bump || 0) - dt * 0.8);
    const p = 1 + Math.sin(this.pulse) * (0.015 + hunger * 0.05) + this.bump;
    this.rim.position.set(this.x, 0.19, this.z);
    this.rim.scale.set(r * p || 1e-3, Math.max(1, r * 0.35), r * p || 1e-3);
    this.ghost.position.set(this.x, 0.2, this.z);
    this.ghost.scale.setScalar(r * p || 1e-3);
    this.voidMat.uniforms.uTime.value = time;
  }
}
