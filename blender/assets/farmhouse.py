"""Region pack: a big stone farmhouse with a slate roof, two chimneys, a lean-to dairy, a stone yard wall
and a water trough. Hamlets and farmsteads are built from these, barns and silos."""
from kit import *


def build():
    D, W, H = 6.0, 9.0, 5.6
    p = [box('walls', (D, W, H), loc=(0, 0, H / 2), color='sand', bev=0.16),
         box('plinth', (D + 0.25, W + 0.25, 0.5), loc=(0, 0, 0.25), color='concrete', bev=0.1),
         box('band', (D + 0.15, W + 0.15, 0.2), loc=(0, 0, 2.8), color='cream', bev=0.05),
         prism('roof', D + 0.9, W + 0.6, 3.0, loc=(0, 0, H - 0.05), color='asphalt_lt', bev=0.1, rot=(0, 0, math.pi / 2))]
    for s in (-1, 1):
        p += [box(f'chim{s}', (0.9, 1.1, 3.4), loc=(0, s * (W / 2 - 0.3), H + 1.6), color='sand', bev=0.08),
              box(f'chimcap{s}', (1.1, 1.3, 0.18), loc=(0, s * (W / 2 - 0.3), H + 3.35), color='ink', bev=0.04)]
        for k in (-0.2, 0.2):
            p.append(cyl(f'pot{s}{k}', 0.14, 0.45, loc=(k, s * (W / 2 - 0.3), H + 3.4), color='terracotta', seg=12, bev=0.03))
    # slate courses
    for k in range(6):
        z = H + 0.25 + k * 0.45
        w = (D + 0.9) * (1 - (k * 0.45 + 0.25) / 3.0)
        for s in (-1, 1):
            p.append(box(f'slate{k}{s}', (0.08, W + 0.62, 0.06), loc=(s * w / 2, 0, z), color='asphalt', bev=0.02, seg=1,
                         rot=(0, s * math.atan2(3.0, (D + 0.9) / 2), 0)))
    p += [box('door', (0.14, 1.2, 2.2), loc=(D / 2 + 0.05, 0, 1.4), color='red', bev=0.05),
          box('portico', (0.6, 1.9, 0.25), loc=(D / 2 + 0.3, 0, 2.75), color='cream', bev=0.06),
          box('step', (0.8, 2.0, 0.3), loc=(D / 2 + 0.4, 0, 0.15), color='concrete', bev=0.05)]
    for y in (-3.0, -1.6, 1.6, 3.0):
        p += window_grid(D / 2 + 0.02, y, 1.6, 0.9, 1.2, 1, 2, 0, 1.6, '+x', frame='white')
    p += window_grid(D / 2 + 0.02, 0, 4.4, 0.9, 1.1, 1, 1, 0, 0, '+x', frame='white')
    p += window_grid(-D / 2 - 0.02, 0, 1.6, 0.9, 1.2, 3, 2, 1.4, 1.6, '-x', frame='white')
    # lean-to dairy on one end
    p += [box('lean', (4.0, 3.2, 2.8), loc=(-0.5, W / 2 + 1.6, 1.4), color='cream', bev=0.1),
          box('leanroof', (4.6, 3.8, 0.2), loc=(-0.5, W / 2 + 1.6, 2.95), color='roof_tile', bev=0.06, rot=(0.25, 0, 0)),
          box('leandoor', (0.12, 1.0, 1.9), loc=(1.52, W / 2 + 1.6, 1.0), color='forest', bev=0.04)]
    # yard wall + trough + milk churns
    for k in range(10):
        y = -W / 2 - 0.5 + k * 1.2
        p.append(box(f'wall{k}', (0.6, 1.25, 0.9 + 0.1 * (k % 2)), loc=(D / 2 + 4.0, y, 0.45), color='concrete', bev=0.2))
    p += [box('trough', (0.9, 2.2, 0.6), loc=(D / 2 + 3.0, -2.8, 0.3), color='concrete', bev=0.1),
          box('water', (0.7, 2.0, 0.05), loc=(D / 2 + 3.0, -2.8, 0.58), color='water', bev=0.01, seg=1)]
    for k in range(3):
        p.append(cyl(f'churn{k}', 0.25, 0.7, loc=(D / 2 + 1.2, 3.2 + k * 0.55, 0), color='chrome', seg=14, bev=0.06))
    return finish(tag(join(p, 'farmhouse'), 'region'))
