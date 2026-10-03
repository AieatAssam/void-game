"""Planet pack: a container ship (300 m): navy hull, white bridge block aft with a funnel, stacks of coloured
containers. Sea crumbs: bold colour blocks read from orbit."""
from kit import *

DETAIL = 0.8  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget
import random


def build():
    half = [(-150, 24), (95, 25), (135, 16), (150, 0)]
    out = mirror_pts(half)
    p = [poly_prism('lower', out, 0, 8, 'brick'), poly_prism('hull', out, 8, 22, 'navy'), poly_prism('deck', [(-148, -23), (100, -24), (130, -15), (130, 15), (100, 24), (-148, 23)], 22, 23, 'sand')]
    p += [blk('bridge', (26, 44, 30), (-120, 0, 38), 'white', bev=0.5), blk('bg', (0.3, 40, 4), (-106.8, 0, 56), 'gloss_black'),
          blk('bwing', (6, 52, 2.4), (-110, 0, 58), 'white', bev=0.3), blk('bwin', (0.3, 40, 2.4), (-106.8, 0, 46), 'glow'),
          cyl('funnel', 6.5, 16, loc=(-128, 0, 53), color='red', seg=14, bev=0, bseg=1), cyl('funT', 6.6, 2.5, loc=(-128, 0, 66.5), color='ink', seg=14, bev=0, bseg=1),
          blk('fo', (10, 14, 5), (122, 0, 25.5), 'concrete', bev=0.3)]
    rnd = random.Random(7)
    cols = ['red', 'hazard', 'sky', 'teal', 'terracotta', 'mint', 'butter', 'white', 'police', 'pink']
    for i in range(14):
        x = -94 + i * 14.6
        for j in range(4):
            y = -19.5 + j * 13.0
            if x > 90 and abs(y) > 15:
                continue
            h = rnd.choice((1, 2, 2, 3, 3))
            lo = 0
            for lv in range(h):
                p.append(blk(f'c{i}_{j}_{lv}', (13.6, 11.4, 5.4), (x, y, 23 + lv * 5.6 + 2.8), rnd.choice(cols)))
    p.append(blk('crane', (3, 62, 3), (-98, 0, 38), 'hazard', bev=0.2))
    return finish(tag(join(p, 'cargo_ship'), 'planet', lod=[0.4, 0.15]), tier=150.0, kind='unit', unit='cargo')
