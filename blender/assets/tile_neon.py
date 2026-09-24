"""Ground tile: neon night market. Dark paving with glowing inlay strips (stalls/signs placed by the game)."""
from kit import *


def build():
    p = tile_base()

    def pave(i, j):
        x, y = i - 13.5, j - 13.5
        if abs(x) < 0.6 or abs(y) < 0.6:
            return 'lilac'  # glowing cross inlay
        if abs(abs(x) - 8) < 0.4 or abs(abs(y) - 8) < 0.4:
            return 'siren_blue' if (i + j) % 2 else 'navy'
        return 'asphalt_lt' if (i // 2 + j // 2) % 2 else 'asphalt'
    p.append(grid('pave', 28, 28, 28, 28, z=0.17, color_fn=pave))
    for k in range(8):  # string lights across the market
        a = k * math.pi / 4
        for i in range(8):
            d = 1.5 + i * 1.6
            p.append(sphere(f'bulb{k}{i}', 0.12, loc=(math.cos(a) * d, math.sin(a) * d, 4.2 - i * 0.12), color=('glow', 'siren_red', 'lilac', 'toxic')[i % 4], seg=8))
    p.append(cyl('pole', 0.12, 4.4, loc=(0, 0, 0.17), color='ink', seg=10, bev=0.02))
    return finish(join(p, 'tile_neon'), tier=20, mass=0, kind='tile')
