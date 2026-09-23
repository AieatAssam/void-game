from kit import *


def build():
    L, W = 5.0, 2.3
    p = [box('body', (L * 0.72, W, 2.2), loc=(-L * 0.14, 0, 1.55), color='peach', bev=0.3),
         box('cab', (L * 0.32, W, 1.3), loc=(L * 0.33, 0, 1.1), color='peach', bev=0.3),
         box('glass', (0.3, W * 0.8, 0.6), loc=(L * 0.45, 0, 1.5), color='sky', bev=0.1, rot=(0, -0.3, 0)),
         box('skirt', (L, W + 0.04, 0.3), loc=(0, 0, 0.6), color='pink', bev=0.1),
         box('window', (1.8, 0.1, 0.8), loc=(-0.6, -W / 2, 1.8), color='glow', bev=0.06),
         box('ledge', (1.9, 0.3, 0.08), loc=(-0.6, -W / 2 - 0.1, 1.38), color='white', bev=0.03),
         cyl('stand', 0.15, 0.2, loc=(-0.6, 0, 2.65), color='white', seg=16),
         lathe('cone', [(0.0, 2.8), (0.12, 2.85), (0.45, 3.9), (0.5, 4.0), (0.0, 4.0)], color='sand', seg=24, loc=(-0.6, 0, 0)),
         sphere('scoop', 0.55, loc=(-0.6, 0, 4.3), color='pink', seg=24),
         sphere('scoop2', 0.35, loc=(-0.6, 0, 4.85), color='mint', seg=20),
         sphere('cherry', 0.12, loc=(-0.6, 0, 5.25), color='red', seg=12),
         box('bump_f', (0.2, W * 0.96, 0.3), loc=(L / 2, 0, 0.55), color='steel', bev=0.1),
         box('bump_r', (0.2, W * 0.96, 0.3), loc=(-L / 2, 0, 0.55), color='steel', bev=0.1)]
    for i in range(6):
        p.append(box(f'awn{i}', (0.32, 0.5, 0.06), loc=(-1.4 + i * 0.32, -W / 2 - 0.2, 2.35), color=('pink', 'white')[i % 2], bev=0.02, rot=(0.35, 0, 0)))
    for s in (-1, 1):
        p.append(cyl(f'hl{s}', 0.15, 0.08, loc=(L / 2 - 0.02, s * 0.7, 1.0), color='glow', rot=(0, math.pi / 2, 0), seg=16, bev=0.02))
    p += wheels(L, W, 0.45, 0.36, xs=(1.5, -1.6))
    return finish(join(p, 'icecream_van'))
