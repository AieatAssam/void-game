"""Ground tile: building lot. Buildings are placed on it by the game."""
from kit import *


def build():
    p = tile_base()
    p.append(grid('lot', 24, 24, 1, 1, z=0.17, color_fn=lambda i, j: 'concrete'))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(grid(f'grass{sx}{sy}', 3, 3, 1, 1, z=0.172, color_fn=lambda i, j: 'sage', loc=(sx * 13.5, sy * 13.5, 0)))
    return finish(join(p, 'tile_lot'), tier=20, mass=0, kind='tile')
