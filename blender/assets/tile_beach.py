"""Ground tile: seafront block. Promenade inland (+y), sand, then the shoreline toward the sea (-y = world +z)."""
from kit import *
import random


def build():
    r = random.Random(21)
    p = tile_base()

    def zone(i, j):
        y = j - 13.5
        if y > 8:
            return 'terracotta' if (i + j) % 2 else 'cream'  # promenade tiles
        if y > 7:
            return 'white'  # sea wall cap
        if y > -9:
            return 'sand'
        if y > -11:
            return 'clay'  # wet sand line
        return 'sky'
    p.append(grid('beach', 28, 28, 28, 28, z=0.17, color_fn=zone))
    for k in range(10):  # promenade railings along the sea wall
        p.append(box(f'rail{k}', (2.6, 0.08, 0.08), loc=(-12 + k * 2.7, 7.5, 1.0), color='white', bev=0.02, seg=1))
        p.append(box(f'post{k}', (0.1, 0.1, 0.85), loc=(-13.3 + k * 2.7, 7.5, 0.6), color='white', bev=0.02, seg=1))
    for k in range(3):  # steps down to the sand
        p.append(box(f'step{k}', (3, 0.6, 0.12), loc=(0, 6.8 - k * 0.6, 0.3 - k * 0.08), color='concrete', bev=0.03))
    for k in range(18):  # shells + pebbles
        p.append(sphere(f'sh{k}', r.uniform(0.06, 0.14), loc=(r.uniform(-13, 13), r.uniform(-10, 5), 0.19), color=r.choice(('white', 'peach', 'pink')), seg=8, scale=(1, 1, 0.5)))
    for k in range(6):  # foam line
        p.append(box(f'foam{k}', (r.uniform(2, 4), 0.25, 0.03), loc=(-11 + k * 4.4, -11.2 + r.uniform(-0.2, 0.2), 0.19), color='white', bev=0.01, seg=1))
    return finish(join(p, 'tile_beach'), tier=20, mass=0, kind='tile')
