"""Countryside tile: ploughed rows, a crop patch and a fence line."""
from kit import *


def build():
    p = [grid('field', TILE, TILE, 1, 1, color_fn=lambda i, j: 'clay')]
    for k in range(16):
        crop = 'forest' if k < 8 else 'butter'
        p.append(box(f'row{k}', (34, 1.2, 0.5), loc=(0, -17 + k * 2.3, 0.2), color=crop if k % 4 else 'sage', bev=0.25, seg=2))
    for s in range(4):
        a = s * math.pi / 2
        for k in range(10):
            d = -18 + k * 4
            x, y = math.cos(a) * 19 - math.sin(a) * d, math.sin(a) * 19 + math.cos(a) * d
            p.append(box(f'post{s}{k}', (0.15, 0.15, 1.1), loc=(x, y, 0.55), color='clay', bev=0.03, seg=1))
            p.append(box(f'rail{s}{k}', (0.08, 4, 0.1), loc=(x, y + 0, 0.8), color='clay', bev=0.02, seg=1, rot=(0, 0, a)))
    return finish(join(p, 'land_farm'), tier=20, mass=0, kind='scenery')
