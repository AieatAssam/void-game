from kit import *


def build():
    W, D, H = 7.0, 6.0, 4.0
    p = [box('walls', (D, W, H), loc=(-0.5, 0, H / 2), color='pink', bev=0.15),
         box('trim', (D + 0.2, W + 0.2, 0.3), loc=(-0.5, 0, H), color='white', bev=0.08),
         prism('roof', W + 0.4, D + 0.4, 1.4, loc=(-0.5, 0, H + 0.1), color='teal', bev=0.08),
         box('front', (0.15, 4.0, 2.2), loc=(D / 2 - 0.45, 0.8, 1.4), color='glow', bev=0.06),
         box('door', (0.2, 1.1, 2.2), loc=(D / 2 - 0.4, -2.3, 1.1), color='teal', bev=0.05),
         box('deck', (2.2, W, 0.15), loc=(D / 2 + 0.6, 0, 0.075), color='wood', bev=0.04),
         cyl('cup', 0.5, 0.8, loc=(-0.5, 0, H + 1.4), color='white', r2=0.6, seg=24, bev=0.08),
         torus('handle', 0.25, 0.08, loc=(-0.5, 0.62, H + 1.8), color='white', seg=16, rseg=8, rot=(math.pi / 2, 0, 0)),
         lathe('steam', [(0.0, H + 2.2), (0.18, H + 2.3), (0.08, H + 2.6), (0.15, H + 2.8), (0.0, H + 3.0)], loc=(-0.5, 0, 0), color='white', seg=12)]
    for i in range(8):
        p.append(box(f'awn{i}', (1.0, 0.55, 0.07), loc=(D / 2 + 0.05, -1.9 + i * 0.55, 3.0), color=('teal', 'white')[i % 2], bev=0.02, rot=(0, 0.4, 0)))
    for k, y in enumerate((-1.8, 1.8)):
        p += [cyl(f'tbl{k}', 0.06, 0.8, loc=(D / 2 + 0.8, y, 0.15), color='ink', seg=10, bev=0),
              cyl(f'top{k}', 0.45, 0.06, loc=(D / 2 + 0.8, y, 0.95), color='white', seg=20, bev=0.02),
              cyl(f'umb{k}', 0.05, 1.4, loc=(D / 2 + 0.8, y, 1.0), color='steel', seg=8, bev=0),
              lathe(f'umbc{k}', [(0.0, 2.6), (0.9, 2.2), (0.85, 2.15), (0.0, 2.3)], loc=(D / 2 + 0.8, y, 0), color=('butter', 'peach')[k], seg=16)]
        for s in (-1, 1):
            p.append(box(f'chair{k}{s}', (0.4, 0.4, 0.5), loc=(D / 2 + 0.8, y + s * 0.7, 0.4), color='white', bev=0.08))
    p += window_grid(-0.5, W / 2, 2.2, 1.0, 1.2, 3, 1, 0.9, 0, '+y')
    p += window_grid(-0.5, -W / 2, 2.2, 1.0, 1.2, 3, 1, 0.9, 0, '-y')
    return finish(join(p, 'cafe'))
