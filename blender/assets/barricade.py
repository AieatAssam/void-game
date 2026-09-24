"""Hazard: police barricade. A toll zone, never a wall (PLAN.md rule 1). 'blink' clip on lamp."""
from lib import *


def build():
    p = [box(f'plank{i}', (0.3, 0.12, 0.3), loc=(-0.96 + i * 0.32, 0, 0.9), color=('red', 'white')[i % 2], bev=0.03)
         for i in range(7)]
    p += [box(f'low{i}', (0.3, 0.1, 0.18), loc=(-0.8 + i * 0.32, 0, 0.45), color=('white', 'red')[i % 2], bev=0.025)
          for i in range(6)]
    for x in (-0.85, 0.85):
        for s in (-1, 1):
            p.append(box(f'leg{x}{s}', (0.08, 0.08, 1.1), loc=(x, s * 0.2, 0.5), color='ink', bev=0.02, rot=(s * 0.36, 0, 0)))  # sawhorse: feet apart
        p.append(box(f'foot{x}', (0.12, 0.7, 0.05), loc=(x, 0, 0.025), color='ink', bev=0.02))
    root = join(p, 'barricade')
    lamp = sphere('lamp', 0.1, color='warn', seg=16, scale=(1, 1, 0.8))
    lamp.location = (0.85, 0, 1.12)
    base = cyl('lampbase', 0.08, 0.08, loc=(0.85, 0, 1.04), color='ink', seg=14, bev=0.015)
    root2 = join([root, base], 'barricade')
    parent(lamp, root2)
    finish(root2, kind='hazard', effect='toll')
    keys(lamp, 'scale', [(0, (1, 1, 1)), (12, (0.3, 0.3, 0.3)), (24, (1, 1, 1))], name='blink', interp='CONSTANT')
    return root2
