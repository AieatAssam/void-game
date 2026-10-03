"""Planet pack: a flying-wing stealth bomber (50 m). Chevron planform with a sawtooth trailing edge, glass cockpit,
buried engine slots with a warm glow. Flies along +X."""
from kit import *

DETAIL = 0.6  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    half = [(22, 0), (-7, 25), (-12, 25), (-7.5, 15), (-12, 11), (-8, 6), (-13, 3), (-9, 0)]
    out = mirror_pts(half)
    z = 3.0
    p = [poly_prism('wing', out, z, z + 1.1, 'steel', bev=0.25),
         poly_prism('belly', [(x * 0.8, y * 0.8) for x, y in out], z - 0.5, z, 'asphalt')]
    p += [sphere('hump', 3.2, loc=(1, 0, z + 0.8), color='steel', seg=16, scale=(2.6, 1.3, 0.6)),
          sphere('canopy', 1.5, loc=(7.5, 0, z + 1.5), color='glass', seg=12, scale=(1.8, 0.9, 0.55))]
    for s in (-1, 1):
        p += [blk(f'intake{s}', (3.0, 3.0, 0.3), (9.0, s * 3.8, z + 1.15), 'ink', bev=0.1),
              blk(f'slot{s}', (3.2, 3.6, 0.2), (-6.6, s * 4.6, z + 1.15), 'warn'),
              blk(f'tip{s}', (3.2, 1.2, 1.15), (-9.6, s * 24.2, z + 0.58), 'hazard', rot=(0, 0, s * -0.3)),
              cyl(f'round{s}', 1.6, 0.06, loc=(-1.5, s * 12, z + 1.12), color='white', seg=14, bev=0, bseg=1),
              cyl(f'roundC{s}', 0.8, 0.07, loc=(-1.5, s * 12, z + 1.12), color='red', seg=12, bev=0, bseg=1)]
    p.append(blk('stripe', (3.0, 18, 0.12), (4.0, 0, z + 1.16), 'navy'))
    return finish(tag(join(p, 'bomber'), 'planet', lod=[0.4, 0.15]), tier=25.0, kind='fx', unit='bomber')
