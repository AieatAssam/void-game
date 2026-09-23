"""Poison: swallowing it reverses controls for 3s."""
from lib import *


def build():
    b = lathe('barrel', [(0.0, 0.0), (0.24, 0.0), (0.26, 0.03), (0.28, 0.35), (0.26, 0.67), (0.24, 0.7), (0.0, 0.7)], color='hazard', seg=28)
    p = [b,
         torus('rib1', 0.285, 0.02, loc=(0, 0, 0.23), color='ink', seg=28, rseg=6),
         torus('rib2', 0.285, 0.02, loc=(0, 0, 0.47), color='ink', seg=28, rseg=6),
         cyl('ooze', 0.2, 0.05, loc=(0, 0, 0.69), color='toxic', seg=24, bev=0.02),
         box('sign', (0.06, 0.2, 0.16), loc=(0.26, 0, 0.35), color='ink', bev=0.02),
         sphere('mark', 0.05, loc=(0.29, 0, 0.35), color='toxic', seg=10)]
    for i, a in enumerate((0.4, 2.1, 4.0)):
        for j, (dz, rr) in enumerate(((0.66, 0.05), (0.58, 0.035), (0.52, 0.025))):
            rad = 0.27 + (0.01 if j else 0)
            p.append(sphere(f'drip{i}{j}', rr, loc=(math.cos(a + j * 0.05) * rad, math.sin(a + j * 0.05) * rad, dz), color='toxic', seg=10))
    return finish(join(p, 'toxic_barrel'), kind='poison', effect='reverse', mass=0.15)
