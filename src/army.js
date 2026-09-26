// Phase 2 adversaries (docs/PHASE2.md §7): the army answers a hole this size. Threat 1-4 follows the hole's size and
// notoriety (like the town's heat, with hysteresis), then the Capper waits at the capital. Every attack is telegraphed
// on the ground; nothing blocks movement (rule 1); every hit is capped and temporary, every ground unit is edible
// (rule 3). Human response rides along: bells, sirens, news.
import * as THREE from 'three/webgpu';

const THREAT_R = [12.5, 16.5, 22, 28]; // hole radius for threat 1-4 (size floor)
const NOTO = [15, 40, 65, 88];
const warnMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.5, depthWrite: false });
const warnGeo = new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2);
const bandMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
const shellGeo = new THREE.SphereGeometry(1, 14, 10);
const shellMat = new THREE.MeshStandardMaterial({ color: 0x22222a, emissive: 0xff8a3d, emissiveIntensity: 1.8 });
const capMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45, depthWrite: false });
const boom = new THREE.Color(0x6b5a48), fire = new THREE.Color(0xffa24a);

export class Army {
  /** hooks: hurt(frac, why), toll(), drain(dt), jam(s), warn(text), news(text), boom(), siren(), kick(dx, dz). */
  constructor(city, scene, hooks, debris, sparks) {
    Object.assign(this, { city, scene, hooks, debris, sparks });
    this.stars = 0;
    this.max = 4;
    this.base = 0;
    this.noto = 0;
    this.quietT = 0;
    this.bonusT = 0;
    this.cool = { block: 6, battery: 10, jet: 18, lift: 22 };
    this.units = []; // edible ground units the army has put down (howitzers, trucks, sandbags)
    this.drops = []; // incoming: shells, cannonballs, lids (with their warning rings)
    this.strikes = [];
    this.lifts = [];
    this.batteries = [];
    this.blocks = [];
    this.cannons = city.entities.filter((e) => e.mover?.role === 'cannon');
    this.said = new Set();
  }

  dispose() {
    for (const d of this.drops) this.scene.remove(d.ring, d.mesh);
    for (const s of this.strikes) this.scene.remove(s.band);
    if (this.capRing) this.scene.remove(this.capRing);
  }

  notice(amount) {
    if (amount >= 1) this.quietT = 0;
    this.noto = Math.min(100, this.noto + amount * 0.5);
  }

  once(key, text) { if (!this.said.has(key)) { this.said.add(key); this.hooks.news(text); } }

  update(dt, hole, state) {
    const b = this.base;
    if (b < 4 && hole.r >= THREAT_R[b]) this.base++;
    else if (b > 0 && hole.r < THREAT_R[b - 1] * 0.8) this.base--;
    if ((this.quietT += dt) > 6) this.noto = Math.max(0, this.noto - 3 * dt);
    const stars = Math.min(4, Math.max(this.base, NOTO.filter((v) => this.noto >= v).length));
    if (stars > this.stars) {
      this.hooks.siren?.();
      this.once('t' + stars, ['', 'Army roadblocks go up across the county', 'Artillery batteries dig in on the hills',
        'Air force scrambles strike jets', 'Heavy-lift squadrons fly in the Void Lids'][stars]);
    }
    this.stars = stars;
    for (const k in this.cool) this.cool[k] -= dt;
    const C = this.city, view = (14 + hole.r * 8) * 1.5;
    if (!state.playing) return;
    // threat 1: roadblocks on the roads ahead of the hole
    if (stars >= 1 && this.cool.block <= 0) { this.cool.block = 14; this.roadblock(hole, view); }
    // threat 2: artillery on high ground, a salvo every few seconds
    if (stars >= 2 && this.cool.battery <= 0 && this.batteries.filter((q) => q.guns.some((g) => g.alive)).length < 2) { this.cool.battery = 25; this.battery(hole, view); }
    // threat 3: strike jets along a line
    if (stars >= 3 && this.cool.jet <= 0) { this.cool.jet = 16 + Math.random() * 6; this.jetStrike(hole); }
    // threat 4: heavy-lift lids
    if (stars >= 4 && this.cool.lift <= 0) { this.cool.lift = 20; this.lift(hole, view); }
    this.fireBatteries(dt, hole);
    this.fireCannons(dt, hole);
    this.updateBlocks(dt, hole);
    this.updateStrikes(dt, hole);
    this.updateLifts(dt, hole);
    this.updateDrops(dt, hole, state);
    this.capper(dt, hole, state);
    this.units = this.units.filter((u) => u.alive);
  }

  ground(x, z) { return this.city.groundY(x, z); }

  ring(x, z, R) {
    const ring = new THREE.Mesh(warnGeo, warnMat);
    ring.position.set(x, this.ground(x, z) + 0.4, z);
    ring.scale.setScalar(R);
    this.scene.add(ring);
    return ring;
  }

  // ---------- threat 1: roadblocks (sandbag emplacements: toll zones, edible) ----------
  roadblock(hole, view) {
    const C = this.city;
    const v = Math.hypot(hole.vx, hole.vz), ux = v > 1 ? hole.vx / v : 0, uz = v > 1 ? hole.vz / v : 0;
    let best = null, bd = Infinity;
    for (const rd of C.roads) for (let i = 0; i < rd.pts.length; i += 3) {
      const [x, z] = rd.pts[i], dx = x - hole.x, dz = z - hole.z, d = Math.hypot(dx, dz);
      if (d < view * 0.35 || d > view * 0.9) continue;
      const score = d - (dx * ux + dz * uz) * 0.8; // ahead of the hole
      if (score < bd) { bd = score; best = { x, z, h: Math.atan2(rd.pts[Math.min(i + 1, rd.pts.length - 1)][1] - z, rd.pts[Math.min(i + 1, rd.pts.length - 1)][0] - x) }; }
    }
    if (!best) return;
    const k = Math.max(2.5, hole.r / 5); // sandbags scale up with the threat (toy soldiers build big)
    const e = C.spawn('sandbags', best.x, best.z, -best.h + Math.PI / 2, { gs: k });
    e.meta = { ...e.meta, tier: e.meta.tier * k, height: e.meta.height * k };
    e.toll = 0;
    this.blocks.push(e);
    this.units.push(e);
    for (let j = 0; j < 2; j++) {
      const t = C.spawn('army_truck', best.x + Math.cos(best.h) * (14 + j * 8), best.z + Math.sin(best.h) * (14 + j * 8), -best.h, { gs: 1.6 });
      t.meta = { ...t.meta, tier: t.meta.tier * 1.6 };
      this.units.push(t);
    }
    this.hooks.warn('Army roadblock ahead');
  }

  updateBlocks(dt, hole) {
    for (const e of this.blocks) {
      if (!e.alive || e.falling) continue;
      e.toll = Math.max(0, e.toll - dt);
      if (!e.toll && Math.hypot(hole.x - e.x, hole.z - e.z) < hole.r + e.meta.tier * 0.8) { e.toll = 1.5; this.hooks.toll(); }
    }
    this.blocks = this.blocks.filter((e) => e.alive);
  }

  // ---------- threat 2: artillery ----------
  battery(hole, view) {
    const C = this.city;
    let best = null;
    for (let t = 0; t < 30; t++) { // high ground beyond the view, not in a settlement
      const a = Math.random() * 6.28, d = view * (0.7 + Math.random() * 0.4), x = hole.x + Math.cos(a) * d, z = hole.z + Math.sin(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) > C.bound - 40 || C.settlements.some((s) => Math.hypot(s.x - x, s.z - z) < s.r)) continue;
      const h = this.ground(x, z);
      if (h < C.terrain.water + 0.5) continue;
      if (!best || h > best.h) best = { x, z, h };
    }
    if (!best) return;
    const k = Math.max(2, hole.r / 7), guns = [];
    for (let j = 0; j < 3; j++) {
      const g = C.spawn('howitzer', best.x + (j - 1) * 5 * k, best.z + (j % 2) * 4 * k, -Math.atan2(hole.z - best.z, hole.x - best.x), { gs: k });
      g.meta = { ...g.meta, tier: g.meta.tier * k, height: g.meta.height * k };
      guns.push(g);
      this.units.push(g);
    }
    this.batteries.push({ x: best.x, z: best.z, guns, cool: 3 });
    this.hooks.warn('Artillery in range!');
  }

  fireBatteries(dt, hole) {
    for (const b of this.batteries) {
      const alive = b.guns.filter((g) => g.alive && !g.falling);
      if (!alive.length) continue;
      if ((b.cool -= dt) > 0) continue;
      b.cool = 5.5;
      const R = Math.max(6, hole.r * 0.45);
      alive.forEach((g, i) => {
        const lead = 1.6 + i * 0.3, spread = hole.r * 0.9;
        const tx = hole.x + hole.vx * lead + (Math.random() - 0.5) * spread, tz = hole.z + hole.vz * lead + (Math.random() - 0.5) * spread;
        g.rot = -Math.atan2(tz - g.z, tx - g.x);
        g.actions?.fire?.reset().setLoop(THREE.LoopOnce).play();
        this.city.place(g);
        this.shell(new THREE.Vector3(g.x, g.gy + 4 * g.gs, g.z), tx, tz, R, 2.2 + i * 0.25, 0.1, 'Shelled!', R * 0.12);
      });
      this.hooks.boom();
    }
  }

  // ---------- the castle's festival cannons ----------
  fireCannons(dt, hole) {
    for (const c of this.cannons) {
      if (!c.alive || c.falling) continue;
      const d = Math.hypot(hole.x - c.x, hole.z - c.z);
      if (d > 170 || d < hole.r + 2) continue;
      if ((c.cool = (c.cool ?? Math.random() * 3) - dt) > 0) continue;
      c.cool = 3.2 + Math.random();
      c.rot = -Math.atan2(hole.z - c.z, hole.x - c.x);
      this.city.place(c);
      const tx = hole.x + hole.vx * 1.4, tz = hole.z + hole.vz * 1.4;
      this.shell(new THREE.Vector3(c.x, c.gy + 1.2, c.z), tx, tz, Math.max(4, hole.r * 0.3), 1.4, 0.05, 'Cannonball!', 0.7);
      this.debris.puff(c.x, c.gy + 1.2, c.z, 0, 1, 0, 2, 3, 1.2, boom, 0.6);
      this.once('cannon', 'Castle re-enactors open fire on the hole');
    }
  }

  shell(from, x, z, R, T, dmg, why, size) {
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.scale.setScalar(size);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.drops.push({ kind: 'shell', mesh, ring: this.ring(x, z, R), from, x, z, R, t: 0, T, dmg, why, arc: Math.max(20, Math.hypot(x - from.x, z - from.z) * 0.3) });
  }

  // ---------- threat 3: strike jets ----------
  jetStrike(hole) {
    const a = Math.random() * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
    const cx = hole.x + hole.vx * 2.5, cz = hole.z + hole.vz * 2.5, L = 700, W = Math.max(12, hole.r * 1.3);
    // the strike line hugs the land (a flat plane would cut through the hills)
    const pos = [], idx = [];
    for (let u = -L / 2, i = 0; u <= L / 2; u += 10, i++) {
      for (const v of [-W / 2, W / 2]) {
        const x = cx + ux * u - uz * v, z = cz + uz * u + ux * v;
        pos.push(x, this.ground(x, z) + 0.8, z);
      }
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i, 2 * i - 1, 2 * i + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const band = new THREE.Mesh(geo, bandMat);
    band.renderOrder = 3;
    this.scene.add(band);
    this.strikes.push({ band, cx, cz, ux, uz, W, L, t: 0, warn: 2.6, jets: [], hit: false });
    this.hooks.warn('Air strike incoming — get off the line!');
    this.once('jets', 'Strike jets bomb the countryside in a bid to stop the hole');
  }

  updateStrikes(dt, hole) {
    const C = this.city;
    for (const s of this.strikes) {
      s.t += dt;
      s.band.material.opacity = 0.2 + 0.2 * Math.abs(Math.sin(s.t * 8));
      if (s.t >= s.warn && !s.jets.length) {
        for (let j = 0; j < 2; j++) {
          const jet = C.spawn('jet', s.cx - s.ux * s.L / 2, s.cz - s.uz * s.L / 2, -Math.atan2(s.uz, s.ux), { noSwallow: true, flying: true, grounded: false, gs: 2.2 });
          jet.y = 70 + j * 8;
          jet.off = (j - 0.5) * s.W * 0.6;
          s.jets.push(jet);
        }
        this.hooks.boom();
      }
      if (s.jets.length) {
        const u = (s.t - s.warn) * 170 - s.L / 2; // metres along the line
        for (const jet of s.jets) {
          jet.x = s.cx + s.ux * u - s.uz * jet.off;
          jet.z = s.cz + s.uz * u + s.ux * jet.off;
          C.place(jet);
        }
        // bomblets walk the line under the jets
        if ((s.bombT = (s.bombT || 0) - dt) <= 0 && Math.abs(u) < s.L / 2) {
          s.bombT = 0.05;
          const bx = s.cx + s.ux * u + (Math.random() - 0.5) * -s.uz * s.W, bz = s.cz + s.uz * u + (Math.random() - 0.5) * s.ux * s.W, gy = this.ground(bx, bz);
          this.debris.puff(bx, gy + 2, bz, 0, 3, 0, s.W * 0.25, s.W * 0.4, 1.6, Math.random() < 0.4 ? fire : boom, 0.8);
          if (Math.random() < 0.3) this.sparks?.burst(bx, bz, 3, 2);
        }
        // the hole under the line when the jets pass over it
        const along = (hole.x - s.cx) * s.ux + (hole.z - s.cz) * s.uz, across = Math.abs(-(hole.x - s.cx) * s.uz + (hole.z - s.cz) * s.ux);
        if (!s.hit && Math.abs(along - u) < 25 && across < s.W / 2 + hole.r * 0.5) { s.hit = true; this.hooks.hurt(0.12, 'Air strike!'); }
        if (u > s.L / 2 + 80) { s.done = true; for (const jet of s.jets) C.remove(jet); }
      }
    }
    for (const s of this.strikes) if (s.done) { this.scene.remove(s.band); s.band.geometry.dispose(); }
    this.strikes = this.strikes.filter((s) => !s.done);
  }

  // ---------- threat 4: heavy-lift helicopters drop Void Lids ----------
  lift(hole, view) {
    const C = this.city, a = Math.random() * 6.28;
    const heli = C.spawn('chinook', hole.x + Math.cos(a) * view, hole.z + Math.sin(a) * view, 0, { noSwallow: true, flying: true, grounded: false, gs: 2 });
    heli.y = 60;
    const R = Math.max(10, hole.r * 0.85);
    const lid = C.spawn('concrete_plug', heli.x, heli.z, 0, { noSwallow: true, grounded: false });
    lid.s = R;
    this.lifts.push({ heli, lid, R, state: 'in', t: 0 });
    this.hooks.warn('Heavy-lift chopper inbound!');
    this.once('lids', 'Heavy-lift squadrons try to put a lid on it');
  }

  updateLifts(dt, hole) {
    const C = this.city;
    for (const L of this.lifts) {
      const h = L.heli;
      L.t += dt;
      if (L.state === 'in' || L.state === 'hover') { // lead the hole, then hover over where it will be
        const tx = hole.x + hole.vx * 1.8, tz = hole.z + hole.vz * 1.8, dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz) || 1;
        const sp = Math.min(d, 55 * dt);
        h.x += (dx / d) * sp; h.z += (dz / d) * sp;
        h.rot = -Math.atan2(dz, dx);
        if (L.state === 'in' && d < 30) { L.state = 'hover'; L.t = 0; L.ring = this.ring(tx, tz, L.R); }
        if (L.state === 'hover') {
          L.ring.position.set(h.x, this.ground(h.x, h.z) + 0.4, h.z);
          L.ring.material.opacity = 0.3 + 0.3 * Math.sin(L.t * 18);
          if (L.t > 1.8) { // release
            L.state = 'out';
            this.scene.remove(L.ring);
            this.drops.push({ kind: 'lid', e: L.lid, x: h.x, z: h.z, R: L.R, t: 0, T: 1.1, from: h.y - 6, ring: this.ring(h.x, h.z, L.R) });
            L.lid = null;
          }
        }
      } else { // climb out and away
        h.y += dt * 12;
        h.x += Math.cos(-h.rot) * 60 * dt; h.z += Math.sin(-h.rot) * 60 * dt;
        if (L.t > 8) { C.remove(h); L.done = true; }
      }
      C.place(h);
      if (L.lid) { L.lid.x = h.x; L.lid.z = h.z; L.lid.y = h.y - 7 - L.R * 0.6; C.place(L.lid); }
    }
    this.lifts = this.lifts.filter((L) => !L.done);
  }

  updateDrops(dt, hole, state) {
    for (const d of this.drops) {
      d.t += dt;
      const k = Math.min(1, d.t / d.T);
      d.ring.material.opacity = 0.3 + 0.3 * Math.sin(d.t * 20);
      if (d.kind === 'shell') {
        d.mesh.position.set(THREE.MathUtils.lerp(d.from.x, d.x, k), THREE.MathUtils.lerp(d.from.y, this.ground(d.x, d.z), k) + Math.sin(k * Math.PI) * d.arc,
          THREE.MathUtils.lerp(d.from.z, d.z, k));
        if (k >= 1) {
          d.gone = true;
          const gy = this.ground(d.x, d.z);
          this.debris.puff(d.x, gy + d.R * 0.3, d.z, 0, 2, 0, d.R * 0.6, d.R * 0.8, 1.4, boom, 0.8);
          this.debris.puff(d.x, gy + d.R * 0.2, d.z, 0, 4, 0, d.R * 0.3, d.R * 0.4, 0.5, fire, 0.9);
          if (Math.hypot(hole.x - d.x, hole.z - d.z) < d.R + hole.r * 0.3) this.hooks.hurt(d.dmg, d.why);
          else this.hooks.shake?.(0.15);
        }
        continue;
      }
      // a Void Lid falls: a hit clogs the hole, then it lies as a slab that sets around you (never a wall) and crumbles
      const e = d.e;
      if (!d.landed) {
        e.y = this.ground(d.x, d.z) + d.from * (1 - k * k);
        if (k >= 1) {
          d.landed = true;
          e.y = this.ground(d.x, d.z);
          this.debris.dustRing(d.x, e.y, d.z, d.R, d.R * 0.8, 20, d.R * 0.5, 2.5, boom);
          this.hooks.boom();
          if (Math.hypot(hole.x - d.x, hole.z - d.z) < d.R * 0.8 + hole.r * 0.3) { this.hooks.hurt(0.18, 'Void Lid slammed down!'); this.hooks.jam?.(1.2); }
        }
      } else if (d.t < d.T + 14) {
        if (Math.hypot(hole.x - d.x, hole.z - d.z) < d.R * 0.8 + hole.r * 0.3) this.hooks.drain(dt);
      } else {
        e.y -= dt * 3;
        if (d.t > d.T + 16) { d.gone = true; this.city.remove(e); }
      }
      this.city.place(e);
      d.ring.visible = !d.landed;
    }
    for (const d of this.drops) if (d.gone) this.scene.remove(d.ring, d.mesh ?? d.ring);
    this.drops = this.drops.filter((d) => !d.gone);
  }

  // ---------- the boss: the Capper ----------
  capper(dt, hole, state) {
    const C = this.city, cap = C.capital;
    if (!cap) return;
    if (!this.boss && (Math.hypot(hole.x - cap.x, hole.z - cap.z) < cap.r + 260 || hole.r > 26)) { // it rolls out of the capital
      const a = Math.atan2(hole.z - cap.z, hole.x - cap.x);
      this.boss = C.spawn('capper', cap.x + Math.cos(a) * cap.r * 0.5, cap.z + Math.sin(a) * cap.r * 0.5, -a, { noSwallow: true });
      this.boss.capT = 0;
      this.hooks.warn('THE CAPPER is coming for you');
      this.hooks.news(`The Capper rolls out of ${cap.name} to seal the hole for good`);
      this.hooks.siren?.();
    }
    const b = this.boss;
    if (!b || !b.alive) return;
    if (b.falling) return;
    // edible once the hole has outgrown it (rule 3)
    b.noSwallow = hole.r * 0.95 <= b.meta.tier;
    if (!b.noSwallow) {
      if (!this.bossBeat) { this.bossBeat = true; this.hooks.warn('You can swallow the Capper now!'); }
      if (this.capRing) { this.scene.remove(this.capRing); this.capRing = null; }
      return;
    }
    const dx = hole.x - b.x, dz = hole.z - b.z, d = Math.hypot(dx, dz) || 1;
    const sp = Math.min(d, (10 + hole.r * 0.3) * dt); // slow but relentless
    b.x += (dx / d) * sp; b.z += (dz / d) * sp;
    b.rot += (Math.atan2(Math.sin(-Math.atan2(dz, dx) - b.rot), Math.cos(-Math.atan2(dz, dx) - b.rot))) * Math.min(1, dt * 0.8);
    b.t = (b.t || 0) + dt;
    b.tilt = Math.abs(Math.sin(b.t * 5)) * 0.01;
    b.tiltDir = b.t;
    C.place(b);
    // capping: stay under the lid for 2 s and it clamps down (a big hit and a shove, not the end)
    const reach = b.meta.tier * 0.75;
    if (!this.capRing) { this.capRing = new THREE.Mesh(warnGeo, capMat); this.scene.add(this.capRing); }
    this.capRing.position.set(b.x, this.ground(b.x, b.z) + 0.6, b.z);
    this.capRing.scale.setScalar(reach);
    b.cool = Math.max(0, (b.cool || 0) - dt);
    if (d < reach && !b.cool) {
      b.capT += dt;
      this.capRing.material.color.set(b.capT > 1.2 ? 0xff3b3b : 0xffd166);
      this.capRing.material.opacity = 0.4 + 0.3 * Math.sin(b.capT * (8 + b.capT * 10));
      if (b.capT > 2) {
        b.capT = 0;
        b.cool = 6;
        this.hooks.hurt(0.22, 'CAPPED!');
        this.hooks.kick?.(dx / d, dz / d);
        this.debris.dustRing(hole.x, this.ground(hole.x, hole.z), hole.z, hole.r, hole.r, 24, hole.r * 0.6, 2.5, boom);
        this.hooks.boom();
      }
    } else { b.capT = Math.max(0, b.capT - dt * 2); this.capRing.material.color.set(0xffd166); this.capRing.material.opacity = 0.3; }
  }
}
