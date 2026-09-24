"""Countryside ring on the seaside edge: open water with foam flecks and buoys."""
from kit import *
import random


def build():
    r = random.Random(7)
    p = [grid('sea', TILE, TILE, 1, 1, color_fn=lambda i, j: 'water')]  # one continuous water surface (shader ripples)
    for k in range(14):  # whitecaps: small curling clusters, not straight bars
        x, y, a = r.uniform(-18, 18), r.uniform(-18, 18), r.uniform(0, 3.14)
        for c in range(3):
            p.append(sphere(f'cap{k}{c}', 0.35, loc=(x + math.cos(a) * c * 0.45, y + math.sin(a) * c * 0.45 + math.sin(c) * 0.12, 0.03), color='white',
                            seg=10, scale=(1.6 - c * 0.3, 0.35, 0.08), rot=(0, 0, a + c * 0.25)))
    for k in range(2):
        x, y = r.uniform(-12, 12), r.uniform(-12, 12)
        p.append(lathe(f'buoy{k}', [(0.0, 0.0), (0.5, 0.0), (0.45, 0.5), (0.15, 0.9), (0.0, 1.0)], loc=(x, y, 0), color='red', seg=16))
        p.append(sphere(f'buoylamp{k}', 0.12, loc=(x, y, 1.05), color='warn', seg=8))
    return finish(join(p, 'land_sea'), tier=20, mass=0, kind='scenery')
