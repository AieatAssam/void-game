// Power-ups (HANDOVER §5.4): every 45-70 s the city drops a capsule 25-45 m from the player. Roll the hole over it
// (centre within r + 0.5) for magnet, ghost, split or surge. Rivals chase capsules within 20 m too. Capsules are
// kind=pickup: never edible, never in the book, never food for the snack floor or anyone's targeting.
import * as THREE from 'three/webgpu';
import { Hole } from './hole.js';
import { rng } from './city.js';

export const POWERS = {
  magnet: { name: 'Magnet', icon: '🧲', T: 6, color: '#ff5d73' },
  ghost: { name: 'Ghost', icon: '👻', T: 8, color: '#9ff5ff' },
  split: { name: 'Split', icon: '♊', T: 10, color: '#ffd166' },
  boost: { name: 'Surge', icon: '⚡', T: 5, color: '#9dff7a' },
};
const LIFE = 20;

export class Powerups {
  /** hooks: { flash(text), star(), shockwave() } */
  constructor(assets, city, field, seed, skin, hooks) {
    this.assets = assets;
    this.city = city;
    this.field = field;
    this.hooks = hooks;
    this.skin = skin;
    this.r = rng(seed ^ 0xb005);
    this.nextT = this.r.range(45, 70);
    this.t = 0;
    this.gapK = 1; // perks / Heat: gap between capsules
    this.items = []; // capsules on the ground
    this.active = {}; // power -> seconds left (player)
    this.twin = null;
  }

  get kinds() { return Object.keys(POWERS).filter((k) => this.assets['pu_' + k]); }

  dispose() {
    for (const p of this.items) if (p.e.alive) this.city.remove(p.e);
    this.dropTwin();
  }

  dropTwin() {
    if (!this.twin) return;
    this.twin.dispose();
    this.twin.group.parent?.remove(this.twin.group);
    this.twin = null;
  }

  /** Try to drop a capsule 25-45 m from (x, z) on open ground inside town. */
  spawn(x, z, r = 1) {
    const kinds = this.kinds;
    if (!kinds.length) return;
    const C = this.city, T = C.terrain, region = !!C.settlements, lim = region ? Infinity : C.half - 4;
    const k = region ? Math.max(1, r / 3) : 1; // Phase 2: a capsule the size of a bus, further out, so it reads at scale
    for (let tries = 0; tries < 20; tries++) {
      const a = this.r() * Math.PI * 2, d = this.r.range(25, 45) * k;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (Math.abs(px) > lim || Math.abs(pz) > lim || C.blocked(px, pz, 1.5 * k)) continue;
      if (region && (T.coastR(px, pz) - Math.hypot(px, pz) < 40 || T.mountain(px, pz) > 0.1 || C.groundY(px, pz) < T.water + 0.3)) continue;
      const kind = this.r.pick(kinds);
      const e = C.spawn('pu_' + kind, px, pz, this.r() * 6.28, { noSwallow: true, pickup: kind, gs: k });
      this.items.push({ e, kind, life: LIFE });
      return e;
    }
    return null;
  }

  /** Nearest capsule within `range` of (x, z) (rivals and the bot steer to these). */
  nearest(x, z, range = 20) {
    let best = null, bd = range * range;
    for (const p of this.items) {
      const d = (p.e.x - x) ** 2 + (p.e.z - z) ** 2;
      if (d < bd) { bd = d; best = p.e; }
    }
    return best;
  }

  /**
   * Per frame while playing. player: the player's hole; rivals: Rivals; scene: to host the split twin.
   * Returns the list of holes that eat for the player this frame (the player, plus the twin while split).
   */
  update(dt, player, rivals, scene, playing) {
    this.t += dt;
    if (playing && this.t >= this.nextT) {
      this.nextT = this.t + this.r.range(45, 70) * this.gapK;
      this.spawn(player.x, player.z, player.r);
    }
    for (const p of this.items) {
      p.life -= dt;
      const e = p.e;
      // the last 3 s: blink, then fade out
      e.s = p.life > 3 ? 1 : Math.max(0, p.life / 3) * (Math.sin(p.life * 18) > -0.3 ? 1 : 0.6);
      this.city.place(e);
      let taker = null;
      const grab = 0.5 * (e.gs || 1);
      if (playing && Math.hypot(player.x - e.x, player.z - e.z) < player.r + grab) taker = 'player';
      else for (const rv of rivals.list) if (!rv.dead && Math.hypot(rv.hole.x - e.x, rv.hole.z - e.z) < rv.hole.r + grab) taker = rv;
      if (taker || p.life <= 0) {
        p.gone = true;
        this.city.remove(e);
        if (taker === 'player') this.give(p.kind, player, scene);
        else if (taker) { rv_power(taker, p.kind); this.hooks.flash?.(`${taker.name} grabbed ${POWERS[p.kind].name}!`); }
      }
    }
    this.items = this.items.filter((p) => !p.gone);
    // timers
    for (const k in this.active) {
      this.active[k] -= dt;
      if (this.active[k] <= 0) { delete this.active[k]; if (k === 'split') this.merge(player); }
    }
    if (this.active.magnet) { player.vac = Math.max(player.vac || 0, 2.5); player.reach = 2; } else player.reach = 1;
    player.ghost = this.active.ghost ? this.active.ghost : 0;
    if (this.twin) this.moveTwin(dt, player);
    return this.twin && !this.twin.merging ? [this.twin] : [];
  }

  give(kind, player, scene) {
    this.active[kind] = POWERS[kind].T;
    this.hooks.took?.();
    this.hooks.star?.();
    this.hooks.flash?.(`${POWERS[kind].icon} ${POWERS[kind].name}!`);
    if (kind === 'split' && !this.twin) {
      const slot = this.field.value.findIndex((v, i) => i > 0 && v.z === 0 && !this.hooks.slotTaken?.(i));
      if (slot < 0) return;
      this.twin = new Hole(this.assets, this.field, slot, { r: player.r * 0.7, skin: this.skin });
      this.twin.x = player.x + player.r * 2.5;
      this.twin.z = player.z;
      this.twin.shockwave();
      scene.add(this.twin.group);
    }
  }

  /** The twin mirrors your steering at 2.5 x r to the side; it is always 70% of your size and feeds your area. */
  moveTwin(dt, player) {
    const tw = this.twin, lim = this.city.settlements ? Infinity : this.city.half - 1;
    if (tw.merging) {
      tw.merging -= dt;
      tw.x += (player.x - tw.x) * Math.min(1, dt * 8);
      tw.z += (player.z - tw.z) * Math.min(1, dt * 8);
      tw.area = Math.PI * (player.r * 0.7 * Math.max(0, tw.merging / 0.4)) ** 2;
      if (tw.merging <= 0) { this.dropTwin(); player.shockwave(); this.hooks.shockwave?.(); }
      return;
    }
    const tx = player.x + player.r * 2.5, tz = player.z;
    tw.x = THREE.MathUtils.clamp(tw.x + (tx - tw.x) * Math.min(1, dt * 6), -lim, lim);
    tw.z = THREE.MathUtils.clamp(tw.z + (tz - tw.z) * Math.min(1, dt * 6), -lim, lim);
    tw.area = Math.PI * (player.r * 0.7) ** 2;
    tw.vac = player.vac;
  }

  merge() { if (this.twin) this.twin.merging = 0.4; }

  /** HUD chips: [{ kind, left, T }] */
  chips() { return Object.entries(this.active).map(([kind, left]) => ({ kind, left, T: POWERS[kind].T, ...POWERS[kind] })); }
}

/** Rivals get a simple version: magnet/boost make them faster eaters for a while, ghost/split are shrugged off. */
function rv_power(rv, kind) {
  rv.power = { kind, t: POWERS[kind].T };
}
