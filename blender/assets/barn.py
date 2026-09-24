from kit import *


def build():
    W, D, H = 8.0, 12.0, 5.0
    p = [box('walls', (D, W, H), loc=(0, 0, H / 2), color='brick_wall', bev=0.15),
         prism('roof', W + 1.0, D + 0.6, 3.2, loc=(0, 0, H - 0.05), color='ink', bev=0.12),
         box('door', (0.2, 3.6, 3.8), loc=(D / 2 + 0.05, 0, 1.9), color='white', bev=0.08),
         box('x1', (0.25, 4.6, 0.25), loc=(D / 2 + 0.12, 0, 1.9), color='white', bev=0.05, rot=(0.8, 0, 0)),
         box('x2', (0.25, 4.6, 0.25), loc=(D / 2 + 0.12, 0, 1.9), color='white', bev=0.05, rot=(-0.8, 0, 0)),
         box('loft', (0.2, 1.4, 1.2), loc=(D / 2 + 0.05, 0, 5.6), color='glow', bev=0.06),
         cyl('silo', 2.0, 9.0, loc=(-D / 2 - 1.5, W / 2 - 1, 0), color='steel', seg=24, bev=0.1),
         sphere('silotop', 2.0, loc=(-D / 2 - 1.5, W / 2 - 1, 9.0), color='steel', seg=24, scale=(1, 1, 0.6))]
    for s in (-1, 1):
        p.append(box(f'trim{s}', (D + 0.1, 0.12, 0.3), loc=(0, s * (W / 2 + 0.02), H - 0.2), color='white', bev=0.04))
    return finish(join(p, 'barn'), kind='scenery')
