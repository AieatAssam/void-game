"""Region pack (army): a curved sandbag emplacement with a machine-gun post, ammo box and a hazard-striped
barrier arm. Army cordons string these across roads near towns (toll zones)."""
from kit import *


def build():
    p = []
    R, n = 5.0, 15
    for row in range(3):
        for k in range(n - row):
            a = -1.1 + (k + row * 0.5) * 2.2 / (n - 1)
            x, y = math.cos(a) * R, math.sin(a) * R
            p.append(box(f'bag{row}{k}', (0.9, 0.62, 0.42), loc=(x, y, 0.21 + row * 0.38), color=('sand', 'clay')[(k + row) % 2], bev=0.18, seg=2,
                         rot=(0, 0, a)))
    p += [cyl('gunpost', 0.08, 1.1, loc=(R - 0.6, 0, 0.9), color='ink', seg=8, bev=0),
          box('gun', (1.6, 0.18, 0.2), loc=(R - 0.1, 0, 2.0), color='ink', bev=0.04),
          box('gunbox', (0.4, 0.3, 0.3), loc=(R - 0.8, 0, 1.95), color='olive', bev=0.05),
          box('ammo', (0.7, 0.4, 0.4), loc=(R - 1.4, 1.2, 0.2), color='olive', bev=0.05),
          box('arm', (0.18, 6.0, 0.18), loc=(R + 1.6, 0, 1.0), color='white', bev=0.05, seg=1),
          box('armpost', (0.4, 0.4, 1.2), loc=(R + 1.6, -3.1, 0.6), color='hazard', bev=0.06)]
    for k in range(6):
        p.append(box(f'armS{k}', (0.19, 0.5, 0.19), loc=(R + 1.6, -2.5 + k * 1.0, 1.0), color='red', bev=0.02, seg=1))
    return finish(tag(join(p, 'sandbags'), 'region'), kind='hazard')
