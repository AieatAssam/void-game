from lib import *
import random


def build():
    r = random.Random(6)
    p = [box('body', (1.9, 0.9, 0.9), loc=(0, 0, 1.15), color='white', bev=0.35, seg=4),
         box('head', (0.6, 0.55, 0.55), loc=(1.15, 0, 1.5), color='white', bev=0.2),
         box('muzzle', (0.3, 0.5, 0.35), loc=(1.5, 0, 1.38), color='pink', bev=0.12),
         cyl('tail', 0.04, 0.8, loc=(-0.95, 0, 0.8), color='white', seg=8, bev=0),
         sphere('bell', 0.09, loc=(1.05, 0, 1.12), color='hazard', seg=10),
         sphere('udder', 0.18, loc=(-0.3, 0, 0.7), color='pink', seg=12)]
    for x in (0.65, -0.65):
        for s in (-1, 1):
            p.append(cyl(f'leg{x}{s}', 0.12, 0.8, loc=(x, s * 0.3, 0), color='white', seg=12, bev=0.03))
            p.append(cyl(f'hoof{x}{s}', 0.13, 0.12, loc=(x, s * 0.3, 0), color='ink', seg=12, bev=0.02))
    for s in (-1, 1):
        p += [cyl(f'horn{s}', 0.05, 0.25, loc=(1.1, s * 0.22, 1.75), color='cream', seg=8, r2=0.01, bev=0, rot=(s * -0.6, 0, 0)),
              sphere(f'ear{s}', 0.1, loc=(1.05, s * 0.35, 1.62), color='white', seg=10, scale=(0.5, 1.4, 0.6)),
              sphere(f'eye{s}', 0.04, loc=(1.44, s * 0.16, 1.6), color='ink', seg=8)]
    for k in range(6):
        p.append(sphere(f'spot{k}', r.uniform(0.2, 0.32), loc=(r.uniform(-0.7, 0.7), r.choice((-0.42, 0.42)), r.uniform(1.0, 1.45)), color='ink', seg=12, scale=(1, 0.25, 1)))
    return finish(join(p, 'cow'), kind='scenery')
