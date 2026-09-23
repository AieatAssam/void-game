"""Ground tile: paved plaza with a mosaic ring (fountain/kiosks placed by the game)."""
from kit import *


def build():
    p = tile_base()

    def pave(i, j):
        x, y = i - 13.5, j - 13.5
        r = math.hypot(x, y)
        if 8 < r < 9.5:
            return 'terracotta'
        if r < 8:
            return 'peach' if (i + j) % 2 else 'white'
        return 'cream' if (i // 2 + j // 2) % 2 else 'sand'
    p.append(grid('pave', 28, 28, 28, 28, z=0.17, color_fn=pave))
    return finish(join(p, 'tile_plaza'), tier=20, mass=0, kind='tile')
