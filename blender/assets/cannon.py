"""Region pack (castle festival defence): a black bronze-banded cannon on a red wooden carriage with spoked
wheels, a pyramid of cannonballs and a powder keg. Fires cannonballs at the hole (ring warnings)."""
from kit import *


def build():
    p = [lathe('barrel', [(0, -1.3), (0.42, -1.3), (0.48, -1.1), (0.4, -0.9), (0.34, 1.4), (0.4, 1.55), (0.28, 1.6), (0, 1.6)], loc=(0.3, 0, 0.95),
               color='gloss_black', seg=20, rot=(0, math.pi / 2 - 0.2, 0)),
         cyl('bore', 0.2, 0.05, loc=(0.3 + 1.61 * math.cos(0.2), 0, 0.95 + 1.61 * math.sin(0.2)), color='ink', seg=14, bev=0, rot=(0, math.pi / 2 - 0.2, 0)),
         sphere('cascabel', 0.16, loc=(-1.0, 0, 0.72), color='gloss_black', seg=10)]
    for k, xx in enumerate((-0.5, 0.4, 1.2)):  # bronze bands
        p.append(torus(f'band{k}', 0.4 - k * 0.03, 0.05, loc=(0.3 + xx * math.cos(0.2), 0, 0.95 + xx * math.sin(0.2)), color='gold', seg=20, rseg=6, rot=(0, math.pi / 2 - 0.2, 0)))
    p += [box('cheekL', (2.2, 0.16, 0.6), loc=(-0.1, 0.45, 0.7), color='red', bev=0.05),
          box('cheekR', (2.2, 0.16, 0.6), loc=(-0.1, -0.45, 0.7), color='red', bev=0.05),
          box('trail', (1.6, 0.8, 0.2), loc=(-1.4, 0, 0.3), color='red', bev=0.05, rot=(0, 0.25, 0))]
    for s in (-1, 1):
        p += [cyl(f'wheel{s}', 0.55, 0.12, loc=(0.2, s * 0.62, 0.55), color='wood', seg=20, bev=0.03, rot=(math.pi / 2, 0, 0)),
              torus(f'tyre{s}', 0.55, 0.05, loc=(0.2, s * 0.62, 0.55), color='steel', seg=20, rseg=6, rot=(math.pi / 2, 0, 0)),
              cyl(f'hub{s}', 0.14, 0.2, loc=(0.2, s * 0.62, 0.55), color='gold', seg=10, bev=0.02, rot=(math.pi / 2, 0, 0))]
        for k in range(6):
            p.append(box(f'spk{s}{k}', (0.06, 0.05, 1.0), loc=(0.2, s * 0.64, 0.55), color='red', bev=0, seg=1, rot=(0, k * math.pi / 6, 0)))
    for k, (x, y, z) in enumerate(((1.4, -0.9, 0.18), (1.75, -0.9, 0.18), (1.57, -0.6, 0.18), (1.57, -0.75, 0.45))):
        p.append(sphere(f'ball{k}', 0.18, loc=(x, y, z), color='ink', seg=10))
    p += [cyl('keg', 0.3, 0.7, loc=(1.5, 0.9, 0), color='wood', seg=14, bev=0.06),
          torus('kegb', 0.31, 0.03, loc=(1.5, 0.9, 0.35), color='ink', seg=14, rseg=4)]
    return finish(tag(join(p, 'cannon'), 'region', role='artillery'), kind='unit')
