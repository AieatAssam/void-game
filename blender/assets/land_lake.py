"""Countryside tile: a lake with a sandy shore, reeds and a jetty."""
from kit import *
import random


def build():
    r = random.Random(2)
    p = [grid('grass', TILE, TILE, 1, 1, color_fn=lambda i, j: 'sage'),
         cyl('shore', 15, 0.1, loc=(0, 0, 0), color='sand', seg=48, bev=0.04),
         cyl('water', 13.5, 0.14, loc=(0, 0, 0), color='water', seg=48, bev=0),
         box('jetty', (7, 1.6, 0.2), loc=(10, 3, 0.45), color='clay', bev=0.04)]
    for k in range(4):
        p.append(cyl(f'pile{k}', 0.12, 0.8, loc=(7 + k * 2, 3.7 if k % 2 else 2.3, 0), color='clay', seg=10, bev=0.02))
    for k in range(40):
        a = r.uniform(0, 6.28)
        d = r.uniform(13, 14.8)
        p.append(cyl(f'reed{k}', 0.05, r.uniform(0.8, 1.6), loc=(math.cos(a) * d, math.sin(a) * d, 0), color='forest', seg=6, bev=0))
    for k in range(5):
        p.append(cyl(f'lily{k}', 0.6, 0.04, loc=(r.uniform(-9, 9), r.uniform(-9, 9), 0.14), color='forest', seg=14, bev=0))
    return finish(join(p, 'land_lake'), tier=20, mass=0, kind='scenery')
