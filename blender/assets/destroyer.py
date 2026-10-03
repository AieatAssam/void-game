"""Planet pack: a toy destroyer (150 m): sharp bow, forward gun, superstructure, funnels, radar mast, helipad aft."""
from kit import *

DETAIL = 0.8  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    half = [(-75, 9), (20, 10), (55, 7), (75, 0)]
    out = mirror_pts(half)
    p = [poly_prism('lower', out, 0, 3, 'brick'), poly_prism('hull', out, 3, 10, 'steel'), poly_prism('deck', out, 10, 11, 'asphalt_lt')]
    p += [blk('bridge', (22, 12, 9), (5, 0, 15.5), 'concrete', bev=0.4), blk('bridge2', (12, 10, 6), (8, 0, 22.5), 'white', bev=0.3),
          blk('bglass', (0.3, 9, 2), (14.2, 0, 22.5), 'gloss_black'), blk('bglass2', (12.5, 0.3, 2), (8, -5.1, 22.5), 'gloss_black'),
          blk('bglass3', (12.5, 0.3, 2), (8, 5.1, 22.5), 'gloss_black'),
          cyl('mast', 0.8, 16, loc=(6, 0, 25), color='steel', seg=8, bev=0, bseg=1), blk('radar', (7, 0.8, 2.6), (6, 0, 38), 'chrome', bev=0.2),
          blk('vls', (16, 8, 1.2), (30, 0, 11.6), 'ink', bev=0.2), blk('vlsg', (14, 6, 0.2), (30, 0, 12.3), 'hazard'),
          blk('hang', (14, 10, 7), (-45, 0, 14.5), 'concrete', bev=0.4), blk('hangd', (0.3, 7, 5), (-37.9, 0, 14), 'ink'),
          cyl('pad', 11, 0.5, loc=(-62, 0, 10.8), color='hazard', seg=20, bev=0, bseg=1),
          cyl('padH', 7, 0.6, loc=(-62, 0, 10.8), color='asphalt', seg=20, bev=0, bseg=1), blk('padh', (6, 1.2, 0.7), (-62, 0, 10.9), 'white'),
          blk('padh2', (1.2, 6, 0.7), (-62, 0, 10.9), 'white')]
    for k, x in enumerate((-18, -26)):
        p += [cyl(f'fun{k}', 4.0, 10, loc=(x, 0, 11), color='steel', seg=10, bev=0, bseg=1), cyl(f'funT{k}', 4.1, 1.8, loc=(x, 0, 20.2), color='ink', seg=10, bev=0, bseg=1)]
    for x, s in ((50, 1.0), (-4.0, 0.7)):  # gun turrets
        p += [cyl(f'tur{x}', 4.4 * s, 3, loc=(x, 0, 11), color='concrete', seg=12, bev=0, bseg=1), tube(f'bar{x}', (x + 1, 0, 13.5), (x + 11 * s, 0, 13.9), r=0.7, color='ink', seg=8)]
    p.append(cyl('bow', 0.1, 0.1, loc=(70, 0, 11), color='white', seg=6, bev=0, bseg=1))
    return finish(tag(join(p, 'destroyer'), 'planet', lod=[0.4, 0.15]), tier=75.0, kind='unit', unit='destroyer')
