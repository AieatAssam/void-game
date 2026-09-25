// Every city entity is built here, with all of its fields in one fixed order. Fields that only some entities ever
// use (a collision shape, a panic timer, a side-step offset...) used to be added on the fly, in whatever order the
// systems happened to touch them, so the ~3000 entities ended up with dozens of hidden classes and every hot property
// read in the per-frame loops went megamorphic. Defaults are undefined, so `??=`, `|| 0` and `> 0` checks behave
// exactly as when the field was missing.
export function makeEntity(p) {
  const e = {
    name: undefined, meta: undefined, x: 0, z: 0, y: 0, rot: 0, tilt: 0, tiltDir: 0, s: 1, gs: undefined,
    alive: true, falling: false, vy: 0, mover: null, grounded: false,
    // rendering
    obj: undefined, mesh: undefined, index: undefined, ao: undefined, batched: undefined, mixer: undefined, actions: undefined,
    smokeT: undefined, shadowed: undefined,
    // behaviour
    eater: undefined, fallT: undefined, panic: undefined, wasScared: undefined, cheer: undefined, hiding: undefined, hideT: undefined,
    sucked: undefined, tug: undefined, clog: undefined, clogCool: undefined, noSwallow: undefined, flying: undefined, tolled: undefined,
    // collisions (src/collide.js)
    foot: undefined, shp: undefined, solid: undefined, cid: -1, inStatic: false, sx0: 0, sz0: 0, seen: 0, pairStamp: 0,
    looseT: undefined, ox: undefined, oz: undefined,
  };
  for (const k in p) e[k] = p[k];
  return e;
}
