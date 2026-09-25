"""Region pack (army): a chunky toy strike jet. Swept delta wing, twin tails, glass canopy, roundels, drop tanks,
and a glowing afterburner. It screams across the map on strafe runs (never swallowed: it flies off)."""
from kit import *


def build():
    L = 12.0
    p = [lathe('fuse', [(0, -L / 2), (0.7, -L / 2 + 0.2), (1.0, -2.0), (1.0, 2.5), (0.6, L / 2 - 1.2), (0.0, L / 2)], loc=(0, 0, 2.2),
               color='sky', seg=20, rot=(0, math.pi / 2, 0)),
         sphere('canopy', 1.0, loc=(3.0, 0, 3.05), color='glass', seg=20, scale=(1.9, 0.7, 0.6)),
         cyl('nozzle', 0.75, 0.9, loc=(-L / 2 - 0.2, 0, 2.2), color='ink', seg=18, rot=(0, math.pi / 2, 0), bev=0.05),
         cyl('burner', 0.55, 0.1, loc=(-L / 2 - 0.25, 0, 2.2), color='warn', seg=18, rot=(0, math.pi / 2, 0), bev=0)]
    for s in (-1, 1):  # delta wing, tails, intakes, drop tanks
        p += [box(f'wingT{s}', (5.6, 5.4, 0.2), loc=(-1.4, s * 3.4, 1.95), color='sky', bev=0.08, rot=(0, 0, s * -0.35)),
              box(f'tail{s}', (2.4, 0.2, 2.8), loc=(-5.0, s * 1.3, 3.9), color='navy', bev=0.08, rot=(s * 0.25, -0.35, 0)),
              box(f'intake{s}', (2.4, 0.8, 1.1), loc=(1.0, s * 1.1, 1.9), color='sky', bev=0.2),
              box(f'intakeM{s}', (0.1, 0.6, 0.8), loc=(2.2, s * 1.1, 1.9), color='ink', bev=0.02, seg=1),
              lathe(f'tank{s}', [(0, -1.4), (0.35, -1.0), (0.35, 1.0), (0, 1.5)], loc=(-1.0, s * 3.6, 1.45), color='white', seg=12, rot=(0, math.pi / 2, 0)),
              cyl(f'round{s}', 0.6, 0.04, loc=(-2.4, s * 4.6, 2.12), color='white', seg=20, bev=0),
              cyl(f'roundC{s}', 0.3, 0.05, loc=(-2.4, s * 4.6, 2.12), color='red', seg=16, bev=0),
              box(f'tip{s}', (1.8, 0.2, 0.25), loc=(-3.5, s * 6.5, 2.02), color='hazard', bev=0.05)]
    p.append(box('nosestripe', (0.4, 1.9, 1.9), loc=(4.0, 0, 2.2), color='hazard', bev=0.4))
    return finish(tag(join(p, 'jet'), 'region'), tier=7.0, kind='fx', unit='jet')
