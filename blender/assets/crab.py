"""Scuttling beach crab: tiny, fast, fun to chase. Legs and claws attach to the shell."""
from lib import *


def build():
    p = [sphere('shell', 0.14, loc=(0, 0, 0.1), color='red', seg=18, scale=(1.2, 1, 0.55)),
         sphere('belly', 0.12, loc=(0, 0, 0.07), color='peach', seg=14, scale=(1.1, 0.9, 0.4))]
    for s in (-1, 1):
        p += [cyl(f'stalk{s}', 0.012, 0.08, loc=(0.1, s * 0.05, 0.13), color='red', seg=8, bev=0),
              sphere(f'eye{s}', 0.026, loc=(0.1, s * 0.05, 0.22), color='white', seg=10),
              sphere(f'pupil{s}', 0.014, loc=(0.12, s * 0.05, 0.225), color='ink', seg=8),
              cyl(f'arm{s}', 0.02, 0.1, loc=(0.1, s * 0.11, 0.08), color='red', seg=8, bev=0, rot=(-s * 1.2, 0.4, 0)),
              sphere(f'claw{s}', 0.055, loc=(0.2, s * 0.18, 0.09), color='red', seg=12, scale=(1.3, 0.8, 0.8)),
              sphere(f'pincer{s}', 0.03, loc=(0.25, s * 0.15, 0.1), color='red', seg=10, scale=(1.4, 0.6, 0.6))]
        for k in range(3):  # legs: from under the shell rim, angled down to the sand
            x = -0.07 + k * 0.06
            p.append(cyl(f'leg{s}{k}', 0.012, 0.16, loc=(x, s * 0.12, 0.08), color='red', seg=6, bev=0, rot=(-s * 2.2, 0, 0)))
            p.append(sphere(f'foot{s}{k}', 0.014, loc=(x, s * 0.23, 0.015), color='red', seg=6))
    return finish(join(p, 'crab'), mass=0.01)
