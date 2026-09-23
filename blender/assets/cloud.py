"""Sky FX: a puffy toy cloud with a flat underside."""
from lib import *
import random


def build():
    r = random.Random(9)
    p = [sphere('c0', 4.0, color='white', seg=24, scale=(1.6, 1, 0.7))]
    for k in range(9):
        a = r.uniform(0, 6.28)
        d = r.uniform(2, 5)
        p.append(sphere(f'c{k+1}', r.uniform(2, 3.4), loc=(math.cos(a) * d * 1.3, math.sin(a) * d * 0.7, r.uniform(0.2, 1.8)), color='white', seg=20))
    ob = join(p, 'cloud')
    for v in ob.data.vertices:  # flatten the underside
        v.co.z = max(v.co.z, -0.8)
    return finish(ob, kind='fx', tier=8)
