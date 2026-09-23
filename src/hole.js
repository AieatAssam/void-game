// The hole: the one cold thing in a warm toy world. Void well + starfield + lilac rim (Blender model).
import * as THREE from 'three';
import { COLORS } from './look.js';

const voidMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { uTime: { value: 0 }, uLilac: { value: new THREE.Color(COLORS.lilac) }, uVoid: { value: new THREE.Color(COLORS.void) } },
  vertexShader: /* glsl */ `
    varying vec3 vP;
    void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform vec3 uLilac; uniform vec3 uVoid;
    varying vec3 vP;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      float d = clamp(-vP.y, 0.0, 1.0);
      vec3 col = mix(uLilac * 0.7, uVoid * 0.35, smoothstep(0.0, 0.3, d));
      vec2 g = vec2(atan(vP.z, vP.x) * 18.0, (vP.y + uTime * 0.03) * 60.0);
      float h = hash(floor(g));
      float star = step(0.93, h) * smoothstep(0.5, 0.0, length(fract(g) - 0.5)) * (0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0));
      col += star * mix(uLilac, vec3(1.0), 0.5) * smoothstep(0.05, 0.25, d);
      gl_FragColor = vec4(col, 1.0);
    }`,
});

export class Hole {
  constructor(assets, x = 0, z = 0, r = 0.45) {
    this.x = x;
    this.z = z;
    this.area = Math.PI * r * r;
    this.uniform = { value: new THREE.Vector3(x, z, r) };
    this.group = new THREE.Group();
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true).translate(0, -0.5, 0), voidMaterial);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2).translate(0, -1, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.void).multiplyScalar(0.3) }));
    this.well = new THREE.Group().add(well, floor);
    this.rim = assets.hole_rim.scene.clone();
    this.rim.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    // Ghost ring drawn over everything so buildings never hide where the hole is.
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.03, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COLORS.lilac, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
    this.ghost.renderOrder = 10;
    this.group.add(this.well, this.rim, this.ghost);
    this.pulse = 0;
  }

  dispose() {
    for (const m of [...this.well.children, this.ghost]) { m.geometry.dispose(); if (m.material !== voidMaterial) m.material.dispose(); }
  }

  get r() { return Math.sqrt(this.area / Math.PI); }

  grow(mass) {
    // Growth slows as the hole gets big so every size tier gets its moment.
    this.area += mass * 1.4 / (1 + this.r * 0.08);
  }

  update(dt, time, hunger = 0) {
    const r = this.r;
    this.uniform.value.set(this.x, this.z, r);
    const depth = Math.max(4, r * 5);
    this.well.position.set(this.x, 0.18, this.z);
    this.well.scale.set(r, depth, r);
    this.pulse += dt * (2 + hunger * 10);
    const p = 1 + Math.sin(this.pulse) * (0.015 + hunger * 0.05);
    this.rim.position.set(this.x, 0.19, this.z);
    this.rim.scale.set(r * p, Math.max(1, r * 0.35), r * p);
    this.ghost.position.set(this.x, 0.2, this.z);
    this.ghost.scale.setScalar(r * p);
    voidMaterial.uniforms.uTime.value = time;
  }
}
