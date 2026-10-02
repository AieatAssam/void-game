"""Planet pack: kinetic-strike satellite (40 m): a boxy bus with a bundle of tungsten rods slung underneath, two big
solar wings on booms, a comms dish and glowing thrusters. The 'orbital lance' source."""
from kit import *

DETAIL = 0.8  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def panel(x, y0, y1, z, name):
    p = [blk(f'{name}b', (7.0, y1 - y0, 0.3), (x, (y0 + y1) / 2, z), 'navy', bev=0.05)]
    n = 5
    for i in range(n):
        yy = y0 + (y1 - y0) * (i + 0.5) / n
        p.append(blk(f'{name}c{i}', (6.3, (y1 - y0) / n - 0.5, 0.36), (x, yy, z), 'sky'))
    return p


def build():
    z0 = 3.0
    p = [blk('bus', (9, 6, 6), (0, 0, z0 + 6), 'white', bev=0.5), blk('busg', (9.2, 6.2, 1.0), (0, 0, z0 + 8.5), 'hazard', bev=0.1),
         blk('rackT', (15, 7.0, 0.8), (0, 0, z0 + 3.0), 'steel', bev=0.2)]
    for i in range(3):  # rod bundle: tungsten rods slung beneath the bus
        for j in range(2):
            p.append(cyl(f'rod{i}{j}', 0.75, 17.0, loc=(-7.0, -2.1 + i * 2.1, z0 + 0.8 + j * 1.6), color='gold' if j else 'copper', seg=8, rot=(0, math.pi / 2, 0), bev=0, bseg=1))
    for k in range(4):
        p.append(cyl(f'clamp{k}', 2.6, 0.7, loc=(-4.0 + k * 4.4, 0, z0 + 1.6), color='ink', seg=8, rot=(0, math.pi / 2, 0), bev=0, bseg=1))
    p += [cyl('cap', 0.6, 0.5, loc=(10.0, 0, z0 + 1.6), color='red', seg=8, rot=(0, math.pi / 2, 0), bev=0, bseg=1)]
    for s in (-1, 1):
        p.append(tube(f'boom{s}', (0, s * 3, z0 + 6), (0, s * 7, z0 + 6), r=0.5, color='chrome', seg=8))
        p += panel(0, s * 7.2, s * 21, z0 + 6, f'pA{s}') if s > 0 else panel(0, s * 21, s * 7.2, z0 + 6, f'pB{s}')
        p.append(blk(f'th{s}', (1.2, 1.2, 1.2), (-5.2, s * 2.2, z0 + 8.2), 'ink', bev=0.1))
        p.append(blk(f'thg{s}', (0.25, 0.9, 0.9), (-5.9, s * 2.2, z0 + 8.2), 'warn'))
    p += [tube('dmast', (4, 0, z0 + 9), (4, 0, z0 + 12), r=0.3, color='steel', seg=6),
          sphere('dish', 2.4, loc=(4.8, 0, z0 + 12.5), color='white', seg=14, scale=(0.35, 1.0, 1.0)), sphere('feed', 0.45, loc=(6.4, 0, z0 + 12.5), color='siren_red', seg=8),
          blk('eye', (0.2, 2.4, 1.2), (4.6, 0, z0 + 6.5), 'glow')]
    return finish(tag(join(p, 'kinetic_sat'), 'planet', lod=[0.4, 0.15]), tier=21.5, kind='fx', unit='sat')
