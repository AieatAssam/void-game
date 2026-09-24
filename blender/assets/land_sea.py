"""Countryside ring on the seaside edge: open water with foam flecks and buoys."""
from kit import *
import random


def build():
    r = random.Random(7)
    p = [grid('sea', TILE, TILE, 8, 8, color_fn=lambda i, j: 'sky' if (i + j) % 3 else 'teal')]
    for k in range(10):
        p.append(box(f'wave{k}', (r.uniform(2, 5), 0.3, 0.04), loc=(r.uniform(-18, 18), r.uniform(-18, 18), 0.05), color='white', bev=0.02, seg=1))
    for k in range(2):
        x, y = r.uniform(-12, 12), r.uniform(-12, 12)
        p.append(lathe(f'buoy{k}', [(0.0, 0.0), (0.5, 0.0), (0.45, 0.5), (0.15, 0.9), (0.0, 1.0)], loc=(x, y, 0), color='red', seg=16))
        p.append(sphere(f'buoylamp{k}', 0.12, loc=(x, y, 1.05), color='warn', seg=8))
    return finish(join(p, 'land_sea'), tier=20, mass=0, kind='scenery')
