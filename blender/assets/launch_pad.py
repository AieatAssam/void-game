"""Planet pack: the spaceport (400 m): a big concrete apron with hazard ring, a flame trench, a lattice launch tower
with a service arm, twin spherical fuel tanks, lightning masts and a control bunker."""
from kit import *

DETAIL = 0.8  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    p = [blk('apron', (400, 300, 1.5), (0, 0, 0.75), 'concrete', bev=0.3), blk('road', (400, 30, 0.3), (0, -100, 1.6), 'asphalt_lt'),
         blk('trench', (110, 24, 0.4), (-20, 0, 1.6), 'ink'), blk('trenchg', (96, 14, 0.5), (-20, 0, 1.65), 'warn'),
         cyl('ring', 60, 0.5, loc=(30, 0, 1.5), color='hazard', seg=36, bev=0, bseg=1), cyl('ringI', 52, 0.6, loc=(30, 0, 1.5), color='asphalt_lt', seg=36, bev=0, bseg=1),
         blk('mount', (36, 36, 7), (30, 0, 5), 'steel', bev=0.6), blk('mountT', (24, 24, 1), (30, 0, 9), 'ink', bev=0.2)]
    # lattice tower
    tx, ty, H = -22, 28, 160
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(tube(f'tl{sx}{sy}', (tx + sx * 10, ty + sy * 10, 1.5), (tx + sx * 6.6, ty + sy * 6.6, H), r=1.6, color='red', seg=6))
    for i in range(1, 9):
        z = 1.5 + i * H / 9
        w = 10 - i * 0.35
        p += [blk(f'tbx{i}', (2 * w + 1, 1.2, 1.2), (tx, ty - w, z), 'hazard'), blk(f'tbxb{i}', (2 * w + 1, 1.2, 1.2), (tx, ty + w, z), 'hazard'),
              blk(f'tby{i}', (1.2, 2 * w + 1, 1.2), (tx - w, ty, z), 'hazard'), blk(f'tbyb{i}', (1.2, 2 * w + 1, 1.2), (tx + w, ty, z), 'hazard')]
    p += [blk('ttop', (16, 16, 3), (tx, ty, H + 1.5), 'steel', bev=0.4), tube('tmast', (tx, ty, H + 3), (tx, ty, H + 18), r=0.6, color='chrome', seg=6),
          sphere('tbeacon', 1.3, loc=(tx, ty, H + 18.5), color='siren_red', seg=8)]
    for z in (60, 110):  # service arms toward the pad
        p.append(blk(f'arm{z}', (60, 4, 3.5), (tx + 8 + 30, ty - 12 + 0, z), 'steel', bev=0.3, rot=(0, 0, -0.38)))
    # tanks, bunker, masts
    for k, (x, y) in enumerate(((100, 70), (140, 70))):
        p += [sphere(f'tank{k}', 22, loc=(x, y, 22), color='white', seg=18), cyl(f'tankB{k}', 18.2, 2.5, loc=(x, y, 21), color='hazard', seg=18, bev=0, bseg=1),
              cyl(f'tankL{k}', 1.8, 20, loc=(x, y - 14, 1.5), color='steel', seg=8, bev=0, bseg=1), cyl(f'tankL2{k}', 1.8, 20, loc=(x, y + 14, 1.5), color='steel', seg=8, bev=0, bseg=1)]
    p += [blk('bunker', (40, 24, 12), (-130, -70, 7.5), 'sand', bev=0.8), blk('bunkW', (28, 0.3, 3), (-130, -82.1, 10), 'glass'),
          cyl('dome', 8, 5, loc=(-146, -56, 13), color='white', seg=14, bev=0.4, bseg=1), blk('crawlr', (50, 3, 0.5), (60, -30, 1.8), 'hazard'),
          blk('e1', (400, 3, 0.4), (0, 148, 1.7), 'hazard'), blk('e2', (400, 3, 0.4), (0, -148, 1.7), 'hazard'),
          blk('e3', (3, 300, 0.4), (198, 0, 1.7), 'hazard'), blk('e4', (3, 300, 0.4), (-198, 0, 1.7), 'hazard'),
          blk('r1', (60, 3, 0.4), (30, 0, 2.0), 'white'), blk('r2', (3, 60, 0.4), (30, 0, 2.0), 'white')]
    for x, y in ((-170, 100), (-120, 110), (170, 100), (170, -90)):
        p += [tube(f'lm{x}', (x, y, 1.5), (x, y, 60), r=0.7, color='chrome', seg=6), sphere(f'lmb{x}', 1.2, loc=(x, y, 60.5), color='glow', seg=8)]
    return finish(tag(join(p, 'launch_pad'), 'planet', lod=[0.4, 0.15]), tier=200.0, kind='unit', unit='pad')
