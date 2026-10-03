"""Planet pack: orbital laser platform (120 m): a big flat ring on spokes, a hub with a fat barrel pointing +X ending
in a glowing red lens, solar masts and radiator fins."""
from kit import *

DETAIL = 0.75  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    R = 46.0
    z = 14.0
    p = [torus('ring', R, 5.0, loc=(0, 0, z), color='white', seg=40, rseg=10),
         torus('ringT', R, 5.1, loc=(0, 0, z), color='hazard', seg=40, rseg=10, arc=(0.0, 0.25))]
    for k in range(8):  # ring plates
        a = k * math.tau / 8
        p.append(blk(f'plate{k}', (4.0, 14, 0.7), (math.cos(a + 0.4) * R, math.sin(a + 0.4) * R, z + 5.3), 'steel' if k % 2 else 'concrete', rot=(0, 0, a + 0.4 + math.pi / 2)))
    for k in range(6):
        a = k * math.tau / 6
        p.append(tube(f'spoke{k}', (math.cos(a) * 9, math.sin(a) * 9, z), (math.cos(a) * (R - 4), math.sin(a) * (R - 4), z), r=1.5, color='steel', seg=8))
    p += [cyl('hub', 11, 14, loc=(0, 0, z - 7), color='white', seg=24, bev=0.6, bseg=1),
          cyl('hubB', 11.4, 3, loc=(0, 0, z - 1.5), color='hazard', seg=24, bev=0, bseg=1),
          cyl('hubD', 7, 3, loc=(0, 0, z + 7), color='ink', seg=18, bev=0.3, bseg=1),
          # the lens barrel
          cyl('barrel', 5.0, 34, loc=(8, 0, z + 1), color='steel', seg=20, rot=(0, math.pi / 2, 0), bev=0.3, bseg=1),
          cyl('barrel2', 6.4, 5, loc=(30, 0, z + 1), color='hazard', seg=20, rot=(0, math.pi / 2, 0), bev=0.3, bseg=1),
          cyl('barrel3', 7.0, 3, loc=(38, 0, z + 1), color='ink', seg=20, rot=(0, math.pi / 2, 0), bev=0.2, bseg=1),
          cyl('lens', 5.4, 1.5, loc=(40.5, 0, z + 1), color='siren_red', seg=20, rot=(0, math.pi / 2, 0), bev=0, bseg=1),
          sphere('lensB', 4.8, loc=(41.2, 0, z + 1), color='glow_white', seg=14, scale=(0.4, 1, 1))]
    for k in range(3):
        p.append(cyl(f'coil{k}', 5.6, 1.2, loc=(12 + k * 7, 0, z + 1), color='lilac', seg=20, rot=(0, math.pi / 2, 0), bev=0, bseg=1))
    for s in (-1, 1):  # solar masts + radiators
        p.append(tube(f'mast{s}', (-6, s * 9, z + 4), (-14, s * 14, z + 4), r=0.8, color='chrome', seg=6))
        for i in range(4):
            p.append(blk(f'sol{s}{i}', (22, 4.4, 0.4), (-24 + 0, s * (18 + i * 5), z + 4), 'sky' if i % 2 else 'navy'))
        p.append(blk(f'rad{s}', (16, 0.6, 9), (-8, s * 30, z - 8), 'white'))
    p.append(cyl('feet', 2.0, z - 4, loc=(0, 0, 0), color='ink', seg=10, bev=0, bseg=1))
    return finish(tag(join(p, 'laser_platform'), 'planet', lod=[0.4, 0.15]), tier=62.0, kind='fx', unit='laser')
