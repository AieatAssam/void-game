// Swallow sparks: lilac/white motes that burst out of the rim, sized by the bite. One Points draw call.
import * as THREE from 'three';

const MAX = 400;

export class Sparks {
  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.col = new Float32Array(MAX * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.35, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    this.next = 0;
    this.lilac = new THREE.Color(0xb58cff);
    this.white = new THREE.Color(0xffffff);
  }

  burst(x, z, r, tier) {
    const n = Math.min(40, 6 + Math.round(tier * 10));
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 4) * (0.6 + r * 0.25);
      this.pos.set([x + Math.cos(a) * r, 0.3, z + Math.sin(a) * r], i * 3);
      this.vel.set([Math.cos(a) * sp * 0.4, sp, Math.sin(a) * sp * 0.4], i * 3);
      this.life[i] = 0.6 + Math.random() * 0.5;
      (Math.random() < 0.7 ? this.lilac : this.white).toArray(this.col, i * 3);
    }
    this.points.material.size = 0.25 + r * 0.06;
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] -= 9 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.life[i] <= 0) this.pos[j + 1] = -999;
      const f = Math.max(0, this.life[i]);
      this.col[j] *= 0.97 + f * 0.03; this.col[j + 1] *= 0.97 + f * 0.03; this.col[j + 2] *= 0.97 + f * 0.03;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
