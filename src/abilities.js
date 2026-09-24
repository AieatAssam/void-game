// Hole abilities (HANDOVER §5.7): active skills bought in the shop with dust, fired with Space / right-click / the
// on-screen button, each on a cooldown. One slot at first, a second at 10 stars (progress.js).
import { save, persist } from './meta.js';
import { BUILDINGS } from './city.js';

export const ABILITIES = {
  quake: { name: 'Quake', icon: '💥', cost: 400, cd: 25, desc: 'Shockwave out to 3× your size: props slide in, units reel for 2 s.' },
  vortex: { name: 'Vortex Burst', icon: '🌀', cost: 350, cd: 18, desc: 'Full suction at 2.5× reach for 1.5 s.' },
  dash: { name: 'Dash', icon: '💨', cost: 300, cd: 8, desc: 'A 0.35 s burst at 3× speed. Barricade tolls are free mid-dash.' },
};

export const owned = (id) => !!save.abilities?.includes(id);
/** Equipped ability ids, one per open slot. */
export function slots(stars) {
  const n = stars >= 10 ? 2 : 1;
  save.equipped = (save.equipped || []).filter(owned).slice(0, n);
  return save.equipped;
}

export function buyAbility(id) {
  const a = ABILITIES[id];
  if (owned(id) || save.dust < a.cost) return false;
  save.dust -= a.cost;
  (save.abilities ??= []).push(id);
  persist();
  return true;
}

/** Equip (or unequip) an owned ability; the newest pick pushes the oldest out when slots are full. */
export function equip(id, stars) {
  if (!owned(id)) return;
  const eq = slots(stars);
  const i = eq.indexOf(id);
  if (i >= 0) eq.splice(i, 1);
  else { eq.push(id); if (eq.length > (stars >= 10 ? 2 : 1)) eq.shift(); }
  persist();
}

export class Abilities {
  /** equipped: list of ids; hooks: { shake(k), ripple(x, z, R), flash(text), whoosh() } */
  constructor(equipped, hooks) {
    this.list = equipped.map((id) => ({ id, ...ABILITIES[id], left: 0 }));
    this.hooks = hooks;
    this.dash = 0;
    this.vortex = 0;
    this.trail = [];
  }

  ready(i) { const a = this.list[i]; return a && a.left <= 0; }

  /** Fire slot i. Returns true if it went off. */
  use(i, ctx) {
    const a = this.list[i];
    if (!a || a.left > 0 || !ctx.state.playing) return false;
    a.left = a.cd;
    this[a.id](ctx);
    return true;
  }

  quake({ hole, city, director }) {
    const R = hole.r * 3;
    for (const e of city.entities) {
      if (!e.alive || e.falling || e.obj || BUILDINGS.has(e.name) || e.meta.kind === 'tile') continue;
      const dx = hole.x - e.x, dz = hole.z - e.z, d = Math.hypot(dx, dz);
      if (d > R || d < 0.01) continue;
      if (e.mover && e.mover.type !== 'peck') { e.panic = 3; continue; }
      // static props slide 1-2 m toward the hole (a short tumble with no hop)
      const slide = (1 + Math.random()) / 0.4; // covered in ~0.4 s by the tumble's friction
      e.mover = { type: 'tumble', vx: (dx / d) * slide, vz: (dz / d) * slide, vy: 1.2, spin: (Math.random() - 0.5) * 4, y0: e.y || 0, t: 0, prev: e.mover };
    }
    for (const u of director.units) if (u.alive && Math.hypot(u.x - hole.x, u.z - hole.z) < R + 6) u.stunT = 2;
    this.hooks.shake?.(0.6);
    this.hooks.ripple?.(hole.x, hole.z, R);
    this.hooks.boom?.(0.7);
  }

  vortex() { this.vortex = 1.5; this.hooks.whoosh?.(); }

  dash() { this.dash = 0.35; this.hooks.whoosh?.(); }

  /** Per frame: cooldowns, the vortex hold, dash speed and afterimages. Returns the speed multiplier. */
  update(dt, hole) {
    for (const a of this.list) a.left = Math.max(0, a.left - dt);
    if (this.vortex > 0) {
      this.vortex -= dt;
      hole.vac = Math.max(hole.vac || 0, 2);
      hole.reach = Math.max(hole.reach || 1, 2.5);
    }
    hole.dash = this.dash = Math.max(0, this.dash - dt);
    return this.dash > 0 ? 3 : 1;
  }

  /** Bot helper: fire whatever is ready when it would help (greedy use for balance runs). */
  auto(ctx, target) {
    const { hole } = ctx;
    this.list.forEach((a, i) => {
      if (a.left > 0) return;
      const d = target ? Math.hypot(target.x - hole.x, target.z - hole.z) : Infinity;
      if (a.id === 'dash' && d > hole.r * 2 + 3 && d < 30) this.use(i, ctx);
      if (a.id === 'vortex' && d < hole.r * 3) this.use(i, ctx);
      if (a.id === 'quake') this.use(i, ctx);
    });
  }
}
