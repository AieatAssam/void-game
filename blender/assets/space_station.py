"""Planet pack: orbital station (110 m): a long truss spine with pressurised modules, two pairs of big solar wings,
white radiators, a docking node and a glowing window band."""
from kit import *

DETAIL = 0.8  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    z = 20.0
    p = [blk('truss', (110, 3, 3), (0, 0, z), 'chrome', bev=0.3)]
    for i in range(-5, 6):
        p.append(blk(f'tb{i}', (0.8, 4.0, 4.0), (i * 9.5, 0, z), 'steel'))
    # modules in a cross at the centre
    X, Y = (0, math.pi / 2, 0), (-math.pi / 2, 0, 0)
    p += [cyl('modA', 4.2, 30, loc=(-15, 0, z), color='white', seg=18, rot=X, bev=0.4, bseg=1),
          cyl('modAr', 4.3, 3, loc=(-8, 0, z), color='hazard', seg=18, rot=X, bev=0, bseg=1),
          cyl('modB', 3.6, 24, loc=(0, -12, z), color='cream', seg=18, rot=Y, bev=0.4, bseg=1),
          sphere('node', 5.2, loc=(0, 0, z), color='white', seg=16), cyl('nodeW', 5.25, 1.2, loc=(0, 0, z + 1), color='glow', seg=16, bev=0, bseg=1),
          cyl('dock', 2.2, 5, loc=(0, 12, z), color='steel', seg=12, rot=(math.pi / 2, 0, 0), bev=0, bseg=1),
          cyl('dockR', 2.6, 1, loc=(0, 16, z), color='hazard', seg=12, rot=(math.pi / 2, 0, 0), bev=0, bseg=1),
          cyl('modC', 3.0, 20, loc=(18, 0, z + 3.5), color='white', seg=14, rot=X, bev=0.3, bseg=1),
          cyl('modCw', 3.05, 1.5, loc=(24, 0, z + 3.5), color='glow', seg=14, rot=X, bev=0, bseg=1),
          blk('mast', (1.0, 1.0, 10), (-30, 0, z + 5), 'steel'), sphere('dish', 3.0, loc=(-30, 0, z + 11), color='white', seg=12, scale=(0.4, 1, 1))]
    for sx in (-1, 1):  # four big solar wings
        for sy in (-1, 1):
            cx = sx * 46
            p.append(blk(f'wb{sx}{sy}', (1.2, 1.2, 14), (cx, sy * 0, z + sy * 8.5 * 0 + sy * 2), 'steel') if False else tube(f'wb{sx}{sy}', (cx, 0, z + sy * 1.5), (cx, 0, z + sy * 26), r=0.6, color='chrome', seg=6))
            for i in range(4):
                p.append(blk(f'wp{sx}{sy}{i}', (10, 0.35, 5.4), (cx, 0, z + sy * (4.5 + i * 5.8)), 'navy' if i % 2 else 'sky'))
    for s in (-1, 1):
        p.append(blk(f'rad{s}', (4, 0.4, 9), (s * 16, 1.5, z - 7), 'white'))
    return finish(tag(join(p, 'space_station'), 'planet', lod=[0.4, 0.15]), tier=55.0, kind='fx', unit='station')
