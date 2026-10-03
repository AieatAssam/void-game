"""Planet pack: evacuation heavy lifter (110 m): fat white core stage, four hazard boosters, a crew capsule nose
with a window band, tail fins and a glowing flame cone (palette swatch, emissive). Flies along +X."""
from kit import *

DETAIL = 0.7  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    R, Z = 6.5, 9.0
    X = (0, math.pi / 2, 0)
    p = [cyl('core', R, 70, loc=(-40, 0, Z), color='white', seg=24, rot=X, bev=0.4, bseg=1),
         cyl('stripe', R + 0.05, 5, loc=(-10, 0, Z), color='red', seg=24, rot=X, bev=0, bseg=1),
         cyl('stripe2', R + 0.05, 5, loc=(-30, 0, Z), color='ink', seg=24, rot=X, bev=0, bseg=1),
         lathe('cap', [(R, 30), (R * 0.97, 33), (R * 0.82, 38), (R * 0.5, 43), (R * 0.2, 46), (0, 47)], loc=(0, 0, Z), color='butter', seg=24, rot=X),
         cyl('ring', R + 0.1, 1.8, loc=(30, 0, Z), color='hazard', seg=24, rot=X, bev=0, bseg=1),
         cyl('bell', 4.0, 5.0, loc=(-47, 0, Z), color='ink', seg=16, rot=X, bev=0, bseg=1, r2=5.2),
         lathe('flame', [(0.01, 0), (4.4, 1.2), (3.5, 8), (1.8, 15), (0.01, 24)], loc=(-47.5, 0, Z), color='warn', seg=16, rot=(0, -math.pi / 2, 0)),
         lathe('flameC', [(0.01, 0), (2.6, 1.2), (2.0, 7), (0.01, 15)], loc=(-47.5, 0, Z), color='glow_white', seg=12, rot=(0, -math.pi / 2, 0))]
    for k in range(3):
        p.append(sphere(f'win{k}', 1.15, loc=(26.5 + k * 0.0, (k - 1) * 4.6 * 0, Z + 0), color='glass', seg=10, scale=(0.2, 1, 1)) if False else
                 sphere(f'win{k}', 1.1, loc=(33.0 + k * 3.0, 0, Z + R * 0.84 - k * 0.5), color='glass', seg=10, scale=(1.0, 1.0, 0.45)))
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        c, s = math.cos(a), math.sin(a)
        y, z = c * (R + 3.8), Z + s * (R + 3.8)
        p += [cyl(f'bo{k}', 3.6, 36, loc=(-44, y, z), color='hazard', seg=14, rot=X, bev=0, bseg=1),
              lathe(f'bn{k}', [(3.6, 0), (3.0, 3), (1.6, 6), (0.01, 7.5)], loc=(-8, y, z), color='red', seg=14, rot=X),
              cyl(f'bb{k}', 2.2, 2.4, loc=(-47, y, z), color='ink', seg=10, rot=X, bev=0, bseg=1),
              lathe(f'bf{k}', [(0.01, 0), (2.2, 0.8), (1.5, 6), (0.01, 12)], loc=(-47.2, y, z), color='warn', seg=10, rot=(0, -math.pi / 2, 0)),
              blk(f'fin{k}', (9, 0.5, 6.5), (-39, c * (R + 8), Z + s * (R + 8)), 'navy', bev=0.1, rot=(a + math.pi / 2, 0, 0))]
        p.append(blk(f'strut{k}', (1.6, 3.2, 1.0), (-14, c * (R + 1.5), Z + s * (R + 1.5)), 'steel', rot=(a, 0, 0)))
    return finish(tag(join(p, 'rocket'), 'planet', lod=[0.4, 0.15]), tier=15.0, kind='fx', unit='rocket')
