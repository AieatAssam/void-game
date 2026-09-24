"""Ground tile: neon night market. Dark paving with glowing inlay strips (stalls/signs placed by the game)."""
from kit import *


def build():
    p = tile_base()

    p.append(grid('pave', 28, 28, 14, 14, z=0.17, color_fn=lambda i, j: 'asphalt_lt' if (i + j) % 2 else 'asphalt'))
    # thin neon tubes set into the paving (crisp lines, not glowing slabs)
    for a in (0, math.pi / 2):
        for off, col in ((0.0, 'lilac'), (8.0, 'siren_blue'), (-8.0, 'siren_blue')):
            p.append(box(f'tube{a}{off}', (26, 0.16, 0.04), loc=(-math.sin(a) * off, math.cos(a) * off, 0.19), color=col, bev=0.02, seg=1, rot=(0, 0, a)))
    for k in range(8):  # string lights across the market
        a = k * math.pi / 4
        for i in range(8):
            d = 1.5 + i * 1.6
            p.append(sphere(f'bulb{k}{i}', 0.12, loc=(math.cos(a) * d, math.sin(a) * d, 4.2 - i * 0.12), color=('glow', 'siren_red', 'lilac', 'toxic')[i % 4], seg=8))
    p.append(cyl('pole', 0.12, 4.4, loc=(0, 0, 0.17), color='ink', seg=10, bev=0.02))
    return finish(join(p, 'tile_neon'), tier=20, mass=0, kind='tile')
