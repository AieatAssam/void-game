// Collisions between city entities, on the ground plane (x, z). Nothing here is a rigid-body sim: movers are
// path followers and scripted motions, so this layer only keeps things from overlapping, and decides who gives way.
//
// Shapes: oriented boxes from each model's footprint (vehicles, buildings, benches...) and circles (people,
// animals, tree trunks). Broadphase: a uniform grid rebuilt every frame. Only *active* things query it: anything
// with a mover, plus props that were recently knocked, dragged or pushed (they fall asleep again after a few
// seconds at rest, like bodies in a physics engine), so the ~2000 props that never move cost nothing.
//
// Who gives way (inverse mass w): buildings, trees, resting props and scripted vehicles/units never yield (w = 0);
// people, animals and loose props yield by footprint area. Two immovable things are never resolved.
// Path walkers (block loops, fair crowds, marathon runners) take pushes as a side-step offset that eases back, so
// they step round a parked car and rejoin their path instead of drifting off it.

const CELL = 4; // metres
const SLEEP = 3; // seconds a loose prop stays pushable after it last moved
const PATH = new Set(['walk', 'loop', 'jog']); // path followers: pushes become a decaying offset
const KINEMATIC = new Set(['drive', 'taxi', 'apron', 'rail', 'parade', 'field']); // scripted: push, never pushed
const SKIP = new Set(['show', 'bob', 'still']); // riding something, afloat, or staged: no collisions

export class Collider {
  /** city: the City. footprint(e) -> { hx, hz, cx, cz, round } in model space (metres at scale 1). */
  constructor(city, footprint) {
    this.city = city;
    this.footprint = footprint;
    this.cells = new Map();
    this.stats = { pairs: 0, resolved: 0 };
    this.off = typeof location !== 'undefined' && /[?&]nocollide\b/.test(location.search); // A/B: shapes only, no resolving
  }

  /** Narrowphase for tools: do two shapes overlap? (out: normal x/z and depth d) */
  overlap(a, b, out) { return penetration(a, b, out); }

  /** The collision shape of an entity right now (world space), or null if it doesn't collide. */
  shape(e) {
    if (!e.alive || e.falling || e.flying || e.hiding > 0 || e.clog > 0 || !e.s || e.y > 1.2) return null;
    const m = e.mover;
    if (m && SKIP.has(m.type)) return null;
    const f = (e.foot ??= this.footprint(e));
    if (!f) return null;
    const k = e.s * (e.gs || 1), c = Math.cos(e.rot), s = Math.sin(e.rot);
    const sh = e.shp ??= {};
    // model x axis -> world (cos, -sin), model z axis -> world (sin, cos) (rotation about +y by e.rot)
    sh.x = e.x + (f.cx * c + f.cz * s) * k;
    sh.z = e.z + (-f.cx * s + f.cz * c) * k;
    sh.ux = c; sh.uz = -s;
    sh.hx = f.hx * k; sh.hz = f.hz * k;
    sh.round = f.round;
    sh.r = f.round ? Math.max(sh.hx, sh.hz) : Math.hypot(sh.hx, sh.hz);
    return sh;
  }

  /** Inverse mass: 0 = never gives way. */
  weight(e) {
    const m = e.mover;
    if (e.solid || e.meta.kind === 'unit' || e.obj) return 0;
    if (m && KINEMATIC.has(m.type)) return 0;
    if (!m && !(e.looseT > 0) && !(e.sucked > 0)) return 0; // resting prop
    return 1 / Math.max(0.05, e.meta.tier * e.meta.tier);
  }

  /** Active things query the grid; resting props only get queried against. */
  active(e) {
    return !!e.mover || e.looseT > 0 || e.sucked > 0 || e.meta.kind === 'unit';
  }

  step(dt, holes) {
    const ents = this.city.entities, dyn = this.cells, stat = (this.stat ??= new Map());
    for (const list of dyn.values()) list.length = 0;
    // resting props live in a persistent grid; entries of props that woke up, moved or died are skipped lazily and
    // swept out once enough pile up
    if ((this.stale || 0) > 400) { stat.clear(); this.stale = 0; for (const e of ents) e.inStatic = false; }
    const act = (this.act ??= []);
    act.length = 0;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.looseT > 0) e.looseT -= dt;
      if (e.sucked > 0 || e.mover?.type === 'tumble') e.looseT = SLEEP;
      if (e.ox) { const d = Math.max(0, 1 - dt * 1.6); e.ox *= d; e.oz *= d; if (Math.abs(e.ox) + Math.abs(e.oz) < 1e-3) e.ox = e.oz = 0; }
      const awake = this.active(e);
      if (e.inStatic) {
        if (!awake && e.alive && !e.falling && !(e.hiding > 0) && !(e.clog > 0) && e.s && e.x === e.sx0 && e.z === e.sz0) { e.cid = i; continue; }
        e.inStatic = false;
        this.stale = (this.stale || 0) + 1;
      }
      const sh = this.shape(e);
      e.cid = sh ? i : -1;
      if (!sh) continue;
      if (awake) {
        insert(dyn, e, sh);
        if (!this.off) act.push(e);
      } else {
        insert(stat, e, sh);
        e.inStatic = true;
        e.sx0 = e.x;
        e.sz0 = e.z;
      }
    }
    this.stamp = (this.stamp || 0) + 1;
    let pairs = 0, resolved = 0;
    const moved = (this.moved ??= new Set());
    moved.clear();
    for (const a of act) {
      const sa = a.shp, wa = this.weight(a);
      if (a.cid < 0) continue;
      // anything already over a hole is on its way down: let it fall with its neighbours
      if (overHole(sa, holes)) continue;
      const x0 = Math.floor((sa.x - sa.r) / CELL), x1 = Math.floor((sa.x + sa.r) / CELL);
      const z0 = Math.floor((sa.z - sa.r) / CELL), z1 = Math.floor((sa.z + sa.r) / CELL);
      a.seen = this.stamp;
      const tag = a.cid + this.stamp * 1e5;
      for (let g = 0; g < 2; g++) {
        const grid = g ? stat : dyn;
        for (let cx = x0; cx <= x1; cx++) {
          for (let cz = z0; cz <= z1; cz++) {
            const list = grid.get(cx * 100003 + cz);
            if (!list) continue;
            for (const b of list) {
              if (b === a || b.cid < 0 || b.pairStamp === tag) continue;
              b.pairStamp = tag; // once per a (b can sit in several cells, or in both grids)
              if (b.seen === this.stamp && this.active(b)) continue; // active pair already done from b's side
              const sb = b.shp, wb = this.weight(b);
              if (wa + wb === 0) continue;
              const dx = sb.x - sa.x, dz = sb.z - sa.z, rr = sa.r + sb.r;
              if (dx * dx + dz * dz >= rr * rr) continue;
              pairs++;
              if (!penetration(sa, sb, _n)) continue;
              if (overHole(sb, holes)) continue;
              resolved++;
              const ka = wa / (wa + wb), kb = wb / (wa + wb);
              push(a, -_n.x * _n.d * ka, -_n.z * _n.d * ka, moved);
              push(b, _n.x * _n.d * kb, _n.z * _n.d * kb, moved);
            }
          }
        }
      }
    }
    for (const e of moved) this.city.place(e);
    this.stats.pairs = pairs;
    this.stats.resolved = resolved;
  }

  /** Is there something a car should stop for inside this box ahead of it (people, animals, loose props)? */
  obstacleAhead(e, fx, fz, dist, half) {
    const sa = e.shp;
    if (!sa || e.cid < 0 || this.off) return false;
    const cx0 = sa.x + fx * dist * 0.5, cz0 = sa.z + fz * dist * 0.5, R = dist * 0.5 + half;
    for (let cx = Math.floor((cx0 - R) / CELL); cx <= Math.floor((cx0 + R) / CELL); cx++) {
      for (let cz = Math.floor((cz0 - R) / CELL); cz <= Math.floor((cz0 + R) / CELL); cz++) {
        const list = this.cells.get(cx * 100003 + cz);
        if (!list) continue;
        for (const o of list) {
          if (o === e || o.cid < 0 || this.weight(o) === 0 || o.meta.tier < 0.12) continue;
          const sb = o.shp, dx = sb.x - sa.x, dz = sb.z - sa.z;
          const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
          if (ahead > 0 && ahead < dist + sb.r && side < half + sb.r * 0.8) return true;
        }
      }
    }
    return false;
  }
}

const _n = { x: 0, z: 0, d: 0 };

/** Add an entity to every grid cell its bounding circle touches. */
function insert(grid, e, sh) {
  const x0 = Math.floor((sh.x - sh.r) / CELL), x1 = Math.floor((sh.x + sh.r) / CELL);
  const z0 = Math.floor((sh.z - sh.r) / CELL), z1 = Math.floor((sh.z + sh.r) / CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const key = cx * 100003 + cz;
      let list = grid.get(key);
      if (!list) grid.set(key, (list = []));
      list.push(e);
    }
  }
}

function overHole(sh, holes) {
  for (const q of holes) {
    if (q.hidden) continue;
    const dx = sh.x - q.x, dz = sh.z - q.z;
    if (dx * dx + dz * dz < q.r * q.r) return true;
  }
  return false;
}

/** Move an entity by (dx, dz): path walkers keep it as an offset from their path, everything else moves outright. */
function push(e, dx, dz, moved) {
  if (!dx && !dz) return;
  e.x += dx;
  e.z += dz;
  if (e.shp) { e.shp.x += dx; e.shp.z += dz; }
  if (e.mover && PATH.has(e.mover.type)) { e.ox = (e.ox || 0) + dx; e.oz = (e.oz || 0) + dz; }
  else if (!e.mover) e.looseT = SLEEP; // a pushed prop stays awake for a moment
  moved.add(e);
}

/**
 * Penetration of two shapes: out.x/z = unit normal from a to b, out.d = depth. False when they don't touch.
 * Circle-circle, circle-box (closest point) and box-box (separating axes: the four box axes).
 */
function penetration(a, b, out) {
  if (a.round && b.round) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), r = a.hx > a.hz ? a.hx : a.hz, rb = b.hx > b.hz ? b.hx : b.hz;
    if (d >= r + rb) return false;
    if (d < 1e-5) { out.x = 1; out.z = 0; } else { out.x = dx / d; out.z = dz / d; }
    out.d = r + rb - d;
    return true;
  }
  if (a.round || b.round) {
    const flip = a.round; // make `box` the box and `c` the circle
    const box = flip ? b : a, c = flip ? a : b;
    const cr = c.hx > c.hz ? c.hx : c.hz;
    const vx = box.uz, vz = -box.ux; // box's second axis (model z) = perpendicular of the first
    const rx = c.x - box.x, rz = c.z - box.z;
    const lu = rx * box.ux + rz * box.uz, lv = rx * vx + rz * vz; // circle centre in box space
    const qu = Math.max(-box.hx, Math.min(box.hx, lu)), qv = Math.max(-box.hz, Math.min(box.hz, lv));
    let nx, nz, d;
    if (qu === lu && qv === lv) { // centre inside the box: out through the nearest face
      const pu = box.hx - Math.abs(lu), pv = box.hz - Math.abs(lv);
      if (pu < pv) { const sg = lu < 0 ? -1 : 1; nx = box.ux * sg; nz = box.uz * sg; d = pu + cr; }
      else { const sg = lv < 0 ? -1 : 1; nx = vx * sg; nz = vz * sg; d = pv + cr; }
    } else {
      const px = box.x + box.ux * qu + vx * qv, pz = box.z + box.uz * qu + vz * qv;
      const ex = c.x - px, ez = c.z - pz, el = Math.hypot(ex, ez);
      if (el >= cr) return false;
      nx = ex / (el || 1); nz = ez / (el || 1); d = cr - el;
    }
    // normal points box -> circle; we want a -> b
    out.x = flip ? -nx : nx; out.z = flip ? -nz : nz; out.d = d;
    return true;
  }
  // box-box, separating axes
  const dx = b.x - a.x, dz = b.z - a.z;
  const axes = [a.ux, a.uz, a.uz, -a.ux, b.ux, b.uz, b.uz, -b.ux];
  let best = Infinity, bx = 0, bz = 0;
  for (let i = 0; i < 8; i += 2) {
    const ax = axes[i], az = axes[i + 1];
    const ra = a.hx * Math.abs(a.ux * ax + a.uz * az) + a.hz * Math.abs(a.uz * ax - a.ux * az);
    const rb = b.hx * Math.abs(b.ux * ax + b.uz * az) + b.hz * Math.abs(b.uz * ax - b.ux * az);
    const dist = dx * ax + dz * az, o = ra + rb - Math.abs(dist);
    if (o <= 0) return false;
    if (o < best) { best = o; const sg = dist < 0 ? -1 : 1; bx = ax * sg; bz = az * sg; }
  }
  out.x = bx; out.z = bz; out.d = best;
  return true;
}
