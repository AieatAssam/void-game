from kit import *


def build():
    W, D, H = 8.0, 7.0, 4.6
    p = [box('walls', (D, W, H), loc=(0, 0, H / 2), color='mint', bev=0.15),
         box('parapet', (D + 0.3, W + 0.3, 0.4), loc=(0, 0, H + 0.1), color='white', bev=0.1),
         box('roof', (D - 0.4, W - 0.4, 0.1), loc=(0, 0, H + 0.1), color='concrete', bev=0.02),
         box('front', (0.15, W - 1.0, 2.4), loc=(D / 2 + 0.05, 0, 1.5), color='glow', bev=0.06),
         box('frame', (0.25, W - 0.6, 0.25), loc=(D / 2 + 0.08, 0, 2.8), color='white', bev=0.06),
         box('door', (0.2, 1.2, 2.2), loc=(D / 2 + 0.12, 2.4, 1.1), color='forest', bev=0.05),
         box('sign', (0.3, 4.5, 0.9), loc=(D / 2 + 0.15, 0, 3.8), color='butter', bev=0.1),
         box('ac', (1.4, 1.0, 0.8), loc=(-1.2, -1.5, H + 0.5), color='steel', bev=0.1),
         cyl('fan', 0.35, 0.05, loc=(-1.2, -1.5, H + 0.9), color='ink', seg=16, bev=0.01)]
    for i in range(9):
        p.append(box(f'awn{i}', (1.2, 0.84, 0.08), loc=(D / 2 + 0.55, -3.36 + i * 0.84, 2.95), color=('red', 'white')[i % 2], bev=0.02, rot=(0, 0.35, 0)))
    for i in range(6):
        p.append(box(f'goods{i}', (0.5, 0.6, 0.5), loc=(D / 2 - 0.3, -2.8 + i * 0.9, 0.5), color=('butter', 'peach', 'pink')[i % 3], bev=0.08))
    p += window_grid(0, W / 2, 2.8, 1.1, 1.3, 3, 1, 0.9, 0, '+y', frame='white')
    p += window_grid(0, -W / 2, 2.8, 1.1, 1.3, 3, 1, 0.9, 0, '-y', frame='white')
    return finish(join(p, 'shop'))
