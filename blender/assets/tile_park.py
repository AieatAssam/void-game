"""Ground tile: park with lawn, cross paths and a pond (props/trees placed by the game)."""
from kit import *


def build():
    p = tile_base()

    def lawn(i, j):  # mowing stripes + a clean cross path
        x, y = i - 13.5, j - 13.5
        if abs(x) < 1.6 or abs(y) < 1.6:
            return 'sand'
        return 'sage' if (i // 3) % 2 else 'mint'
    p.append(grid('lawn', 28, 28, 28, 28, z=0.17, color_fn=lawn))
    p.append(cyl('pond_edge', 4.2, 0.08, loc=(7, 7, 0.14), color='concrete', seg=40, bev=0.03))
    p.append(cyl('pond', 3.9, 0.06, loc=(7, 7, 0.17), color='sky', seg=40, bev=0))
    for k, (x, y, c) in enumerate(((-8, 6, 'pink'), (-6, -9, 'butter'), (9, -7, 'peach'))):
        p.append(cyl(f'bed{k}', 2.0, 0.06, loc=(x, y, 0.16), color='forest', seg=24, bev=0.02))
        for i in range(8):
            a = i * math.pi / 4
            p.append(sphere(f'fl{k}{i}', 0.18, loc=(x + math.cos(a) * 1.2, y + math.sin(a) * 1.2, 0.24), color=c, seg=8, scale=(1, 1, 0.5)))
    return finish(join(p, 'tile_park'), tier=20, mass=0, kind='tile')
