"""Planet pack: an offshore oil rig (100 m): pontoons, four legs, deck modules, derrick, crane, helipad and a flare
boom with a glowing flame."""
from kit import *

DETAIL = 0.7  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    p = []
    for s in (-1, 1):
        p.append(cyl(f'pont{s}', 5.0, 90, loc=(-45, s * 24, 4.0), color='hazard', seg=14, rot=(0, math.pi / 2, 0), bev=0, bseg=1))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p += [cyl(f'leg{sx}{sy}', 4.2, 36, loc=(sx * 22, sy * 24, 4), color='steel', seg=12, bev=0, bseg=1),
                  cyl(f'legB{sx}{sy}', 4.5, 3, loc=(sx * 22, sy * 24, 12), color='hazard', seg=12, bev=0, bseg=1)]
    p += [blk('deck', (64, 64, 7), (0, 0, 43.5), 'concrete', bev=0.5), blk('deck2', (60, 60, 1.0), (0, 0, 47.5), 'asphalt_lt'),
          blk('mod1', (22, 20, 14), (-12, -14, 55), 'white', bev=0.5), blk('mod2', (18, 22, 10), (-14, 14, 53), 'butter', bev=0.5),
          blk('mod3', (14, 14, 8), (14, -16, 52), 'sky', bev=0.5), blk('quarters', (16, 24, 20), (20, 12, 58), 'white', bev=0.6),
          blk('qg', (0.3, 20, 3), (28.1, 12, 60), 'glass'), blk('qg2', (0.3, 20, 3), (28.1, 12, 54), 'glass'),
          cyl('tank1', 4, 10, loc=(-24, 0, 48), color='red', seg=14, bev=0, bseg=1)]
    # derrick: tapering four-post lattice
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(tube(f'dp{sx}{sy}', (-6 + sx * 6, 0 + sy * 6, 48), (-6 + sx * 1.6, sy * 1.6, 92), r=0.9, color='red', seg=6))
    for z, w in ((58, 5.0), (68, 4.0), (78, 3.0)):
        p.append(blk(f'dc{z}', (w * 2 + 1, w * 2 + 1, 0.9), (-6, 0, z), 'hazard'))
    p.append(blk('dtop', (6, 6, 3), (-6, 0, 93.5), 'ink', bev=0.2))
    # crane
    p += [cyl('cbase', 3, 9, loc=(10, -24, 48), color='hazard', seg=10, bev=0, bseg=1), tube('cboom', (10, -24, 57), (36, -34, 82), r=1.0, color='hazard', seg=6),
          blk('chook', (1.2, 1.2, 8), (36, -34, 77), 'ink')]
    # helipad
    p += [blk('hstem', (4, 4, 10), (0, 40, 41), 'steel'), cyl('hpad', 13, 1.4, loc=(0, 44, 45), color='hazard', seg=20, bev=0, bseg=1),
          cyl('hpad2', 11, 1.6, loc=(0, 44, 45), color='asphalt', seg=20, bev=0, bseg=1), blk('hH1', (1.2, 9, 1.7), (0, 44, 46), 'white'),
          blk('hH2', (6, 1.2, 1.7), (0, 44, 46), 'white'), blk('hH3', (1.2, 9, 1.7), (3.2, 44, 46), 'white')]
    # flare boom
    p += [tube('flare', (-26, -30, 50), (-50, -48, 96), r=1.2, color='steel', seg=6),
          lathe('flame', [(0.01, 0), (2.4, 2.0), (3.2, 5), (1.6, 9), (0.01, 12)], loc=(-50, -48, 95.5), color='warn', seg=10),
          lathe('flameC', [(0.01, 0), (1.3, 2), (1.6, 4), (0.01, 7)], loc=(-50, -48, 95.5), color='glow', seg=8)]
    return finish(tag(join(p, 'oil_rig'), 'planet', lod=[0.4, 0.15]), tier=52.0, kind='unit', unit='rig')
