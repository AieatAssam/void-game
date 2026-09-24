from lib import *
import random


def build():
    r = random.Random(4)
    p = [lathe('mound', [(0.0, 0.0), (1.6, 0.0), (1.3, 0.35), (0.8, 0.8), (0.3, 1.05), (0.0, 1.1)], color='dirt', seg=24)]
    for k in range(14):
        a = r.uniform(0, 6.28)
        d = r.uniform(0.3, 1.4)
        p.append(sphere(f'clod{k}', r.uniform(0.12, 0.3), loc=(math.cos(a) * d, math.sin(a) * d, max(0.05, 1.0 - d * 0.7)), color=r.choice(('dirt', 'dirt', 'concrete')), seg=10))
    p.append(cyl('shovel', 0.03, 1.3, loc=(0.5, 0.2, 0.6), color='clay', seg=8, bev=0, rot=(0.3, 0.4, 0)))
    return finish(join(p, 'dirt_pile'))
