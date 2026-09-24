from kit import *


def build():
    W, D, H = 8.0, 12.0, 5.0
    p = [box('walls', (D, W, H), loc=(0, 0, H / 2), color='red', bev=0.15),
         prism('roof', W + 1.0, D + 0.6, 3.2, loc=(0, 0, H - 0.05), color='ink', bev=0.12),
         box('door', (0.2, 3.6, 3.8), loc=(D / 2 + 0.05, 0, 1.9), color='white', bev=0.08),
         box('x1', (0.25, 4.6, 0.25), loc=(D / 2 + 0.12, 0, 1.9), color='white', bev=0.05, rot=(0.8, 0, 0)),
         box('x2', (0.25, 4.6, 0.25), loc=(D / 2 + 0.12, 0, 1.9), color='white', bev=0.05, rot=(-0.8, 0, 0)),
         box('loft', (0.2, 1.4, 1.2), loc=(D / 2 + 0.05, 0, 5.6), color='glow', bev=0.06),
         cyl('silo', 2.0, 9.0, loc=(-D / 2 - 1.5, W / 2 - 1, 0), color='steel', seg=24, bev=0.1),
         sphere('silotop', 2.0, loc=(-D / 2 - 1.5, W / 2 - 1, 9.0), color='steel', seg=24, scale=(1, 1, 0.6))]
    # board-and-batten siding: battens proud of the red boards, white corner boards
    for k in range(int(D / 0.5)):
        for s in (-1, 1):
            p.append(box(f'batA{k}{s}', (0.06, 0.05, H - 0.4), loc=(-D / 2 + 0.25 + k * 0.5, s * (W / 2 + 0.02), H / 2), color='red', bev=0.015, seg=1))
    for k in range(int(W / 0.5)):
        p.append(box(f'batB{k}', (0.05, 0.06, H - 0.4), loc=(-D / 2 - 0.02, -W / 2 + 0.25 + k * 0.5, H / 2), color='red', bev=0.015, seg=1))
    for x in (-1, 1):
        for y in (-1, 1):
            p.append(box(f'corner{x}{y}', (0.18, 0.18, H), loc=(x * D / 2, y * W / 2, H / 2), color='white', bev=0.04))
    for s in (-1, 1):
        p.append(box(f'trim{s}', (D + 0.1, 0.12, 0.3), loc=(0, s * (W / 2 + 0.02), H - 0.2), color='white', bev=0.04))
    return finish(join(p, 'barn'), kind='scenery')
