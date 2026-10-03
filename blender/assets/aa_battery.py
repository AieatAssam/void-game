"""Planet pack: anti-air battery (30 m): sandbag-ringed pad, twin flak cannons on rotating turrets (barrels up, +X),
a radar dish on a mast, ammo crates and a command tent."""
from kit import *

DETAIL = 0.7  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    p = [cyl('pad', 15, 0.6, loc=(0, 0, 0), color='concrete', seg=24, bev=0, bseg=1)]
    for k in range(14):  # sandbag ring
        a = k * math.tau / 14
        p.append(blk(f'bag{k}', (4.6, 1.8, 1.4), (math.cos(a) * 13.2, math.sin(a) * 13.2, 1.3), 'sand', bev=0.35, rot=(0, 0, a + math.pi / 2)))
    for k, (x, y) in enumerate(((4, 5.5), (4, -5.5))):
        p += [cyl(f'tb{k}', 3.2, 1.6, loc=(x, y, 0.6), color='olive', seg=12, bev=0, bseg=1), blk(f'ts{k}', (3.4, 4.2, 2.2), (x, y, 2.8), 'olive', bev=0.4),
              blk(f'tg{k}', (2.0, 3.0, 0.9), (x - 0.5, y, 4.4), 'hazard', bev=0.2)]
        for s in (-1, 1):
            p.append(tube(f'bar{k}{s}', (x + 0.6, y + s * 1.2, 3.4), (x + 7.0, y + s * 1.2, 7.2), r=0.42, color='ink', seg=8))
            p.append(cyl(f'mz{k}{s}', 0.65, 0.6, loc=(x + 7.0, y + s * 1.2, 7.2), color='steel', seg=8, bev=0, bseg=1, rot=(0, 0.9, 0)))
    p += [cyl('mast', 0.5, 7, loc=(-8, 0, 0.6), color='steel', seg=8, bev=0, bseg=1), blk('rbase', (2.4, 2.4, 1.6), (-8, 0, 8.2), 'ink', bev=0.2),
          sphere('dish', 3.0, loc=(-8, 0, 10.4), color='white', seg=14, scale=(0.3, 1.2, 0.8), rot=(0, -0.4, 0)), sphere('feed', 0.5, loc=(-6.8, 0, 11.0), color='siren_red', seg=8),
          blk('crate1', (2.4, 1.8, 1.6), (-4, 10, 1.4), 'hazard', bev=0.15), blk('crate2', (1.8, 2.4, 1.6), (-2, -10, 1.4), 'wood', bev=0.15),
          prism('tent', 5.0, 6.0, 2.6, loc=(-11, -6.5, 0.6), color='olive', bev=0.15), blk('flag', (0.15, 0.15, 3), (-13, 7, 2.1), 'steel')]
    return finish(tag(join(p, 'aa_battery'), 'planet', lod=[0.4, 0.15]), tier=15.0, kind='unit', unit='aa')
