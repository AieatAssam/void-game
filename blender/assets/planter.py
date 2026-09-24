from lib import *
import random


def build():
    r = random.Random(3)
    p = [box('pot', (1.3, 0.55, 0.45), loc=(0, 0, 0.225), color='terracotta', bev=0.06),
         box('lip', (1.38, 0.62, 0.08), loc=(0, 0, 0.45), color='clay', bev=0.03),
         box('soil', (1.2, 0.46, 0.05), loc=(0, 0, 0.47), color='dirt', bev=0.01)]
    for i in range(5):
        x = -0.48 + i * 0.24
        p.append(sphere(f'bush{i}', 0.2 + r.random() * 0.05, loc=(x, 0, 0.62), color=('foliage_lt', 'foliage')[i % 2], seg=14))
    for i in range(7):
        p.append(sphere(f'fl{i}', 0.045, loc=(-0.5 + r.random(), (r.random() - 0.5) * 0.3, 0.78 + r.random() * 0.06),
                        color=('pink', 'butter', 'white')[i % 3], seg=8))
    return finish(join(p, 'planter'))
