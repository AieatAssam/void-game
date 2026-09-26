"""Region pack (army): a chunky olive six-wheel army truck with a canvas-covered load bed, star roundels,
a spare wheel and jerry cans. Convoys of these roll to roadblocks (and are snacks for the hole)."""
from kit import *


def build():
    L, W = 6.4, 2.6
    p = [box('chassis', (L, W - 0.6, 0.4), loc=(0, 0, 1.0), color='ink', bev=0.08),
         box('cab', (1.8, W, 1.7), loc=(L / 2 - 1.1, 0, 2.0), color='olive', bev=0.25),
         box('hood', (1.0, W - 0.4, 1.0), loc=(L / 2 + 0.2, 0, 1.6), color='olive', bev=0.2),
         box('grille', (0.1, W - 0.8, 0.7), loc=(L / 2 + 0.72, 0, 1.55), color='ink', bev=0.03),
         box('screen', (0.1, W - 0.4, 0.6), loc=(L / 2 - 0.19, 0, 2.5), color='gloss_black', bev=0.04, rot=(0, -0.2, 0)),
         box('bed', (L - 2.2, W, 0.5), loc=(-1.1, 0, 1.45), color='olive', bev=0.1),
         box('canvas', (L - 2.3, W - 0.1, 1.9), loc=(-1.1, 0, 2.65), color='sage', bev=0.6, seg=3),
         cyl('spare', 0.55, 0.35, loc=(L / 2 - 2.1, -W / 2 - 0.05, 1.8), color='ink', seg=18, rot=(math.pi / 2, 0, 0), bev=0.08)]
    for s in (-1, 1):
        p += [cyl(f'lamp{s}', 0.16, 0.1, loc=(L / 2 + 0.72, s * 0.85, 1.9), color='glow_white', seg=12, rot=(0, math.pi / 2, 0), bev=0.02),
              box(f'can{s}', (0.3, 0.2, 0.45), loc=(-L / 2 + 0.3, s * (W / 2 - 0.3), 1.9), color='olive', bev=0.05)]
        for k in range(3):  # canvas hoops
            p.append(box(f'hoop{s}{k}', (0.12, 0.05, 1.5), loc=(-2.6 + k * 1.5, s * (W / 2 + 0.01), 2.5), color='olive', bev=0.02, seg=1))
    for x in (L / 2 - 0.4, -0.9, -2.3):
        for s in (-1, 1):
            p += [cyl(f'tyre{x}{s}', 0.55, 0.45, loc=(x, s * (W / 2 - 0.15), 0.55), color='ink', seg=20, rot=(math.pi / 2, 0, 0), bev=0.12),
                  cyl(f'hub{x}{s}', 0.26, 0.47, loc=(x, s * (W / 2 - 0.15), 0.55), color='olive', seg=12, rot=(math.pi / 2, 0, 0), bev=0.05)]
    for s in (-1, 1):  # white star roundels
        p.append(cyl(f'round{s}', 0.45, 0.04, loc=(L / 2 - 1.1, s * (W / 2 + 0.01), 2.0), color='white', seg=20, rot=(math.pi / 2, 0, 0), bev=0))
    return finish(tag(join(p, 'army_truck'), 'region'), kind='unit', unit='truck')
