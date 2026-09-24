"""Ground tile: paved plaza with a mosaic ring (fountain/kiosks placed by the game)."""
from kit import *


def build():
    p = tile_base()

    p.append(grid('pave', 28, 28, 7, 7, z=0.17, color_fn=lambda i, j: 'cream' if (i + j) % 2 else 'white'))
    # smooth inlaid rings instead of stair-stepped squares
    for k, (rr, c) in enumerate(((9.6, 'terracotta'), (8.6, 'peach'), (6.0, 'white'), (5.4, 'terracotta'))):
        p.append(cyl(f'ring{k}', rr, 0.02 + k * 0.004, loc=(0, 0, 0.17), color=c, seg=64, bev=0))
    for k in range(16):  # compass-rose spokes
        a = k * math.pi / 8
        p.append(box(f'spoke{k}', (3.0, 0.18, 0.02), loc=(math.cos(a) * 7.2, math.sin(a) * 7.2, 0.19), color='terracotta', bev=0, seg=1, rot=(0, 0, a)))
    return finish(join(p, 'tile_plaza'), tier=20, mass=0, kind='tile')
