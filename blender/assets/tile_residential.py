"""Ground tile: suburban block. Four lawned yards with driveways (houses/fences/gnomes placed by the game)."""
from kit import *


def build():
    p = tile_base()

    def lawn(i, j):
        x, y = i - 13.5, j - 13.5
        if abs(x) < 0.8 or abs(y) < 0.8:
            return 'forest'  # hedge line between yards
        if abs(abs(y) - 6) < 1.1 and abs(x) > 9:
            return 'concrete'  # driveway to the street
        return 'mint' if (i // 2) % 2 else 'sage'  # mowing stripes
    p.append(grid('lawn', 28, 28, 28, 28, z=0.17, color_fn=lawn))
    for sx in (-1, 1):
        for sy in (-1, 1):  # stepping stones to each front door
            for k in range(4):
                p.append(cyl(f'stone{sx}{sy}{k}', 0.35, 0.04, loc=(sx * (9.5 + k * 1.0), sy * 3.2, 0.17), color='concrete', seg=10, bev=0.01))
    return finish(join(p, 'tile_residential'), tier=20, mass=0, kind='tile')
