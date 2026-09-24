"""Scuttling beach crab: tiny, fast, fun to chase."""
from lib import *


def build():
    p = [sphere('shell', 0.14, loc=(0, 0, 0.1), color='red', seg=18, scale=(1.2, 1, 0.55))]
    for s in (-1, 1):
        p += [sphere(f'eye{s}', 0.025, loc=(0.1, s * 0.05, 0.2), color='ink', seg=8),
              cyl(f'stalk{s}', 0.008, 0.07, loc=(0.1, s * 0.05, 0.12), color='red', seg=6, bev=0),
              sphere(f'claw{s}', 0.05, loc=(0.2, s * 0.14, 0.08), color='red', seg=10, scale=(1.3, 0.8, 0.7))]
        for k in range(3):
            p.append(cyl(f'leg{s}{k}', 0.012, 0.13, loc=(-0.05 + k * 0.06, s * 0.12, 0.08), color='red', seg=6, bev=0, rot=(s * 1.1, 0, 0)))
    return finish(join(p, 'crab'), mass=0.01)
