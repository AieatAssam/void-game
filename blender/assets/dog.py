"""Toy dachshund on wheels (pull-toy)."""
from kit import *


def build():
    p = [sphere('body', 0.18, loc=(0, 0, 0.3), color='clay', seg=20, scale=(2.4, 1, 1)),
         sphere('head', 0.15, loc=(0.42, 0, 0.44), color='clay', seg=20),
         sphere('snout', 0.08, loc=(0.56, 0, 0.41), color='sand', seg=12, scale=(1.3, 1, 0.9)),
         sphere('nose', 0.035, loc=(0.65, 0, 0.43), color='ink', seg=8),
         cyl('tail', 0.03, 0.22, loc=(-0.4, 0, 0.35), color='clay', rot=(0, -0.9, 0), seg=8, bev=0),
         box('collar', (0.06, 0.26, 0.08), loc=(0.32, 0, 0.38), color='red', bev=0.02),
         sphere('tag', 0.03, loc=(0.36, 0, 0.32), color='hazard', seg=8)]
    for s in (-1, 1):
        p += [sphere(f'ear{s}', 0.08, loc=(0.38, s * 0.13, 0.43), color='brick', seg=12, scale=(0.7, 0.4, 1.3)),
              sphere(f'eye{s}', 0.022, loc=(0.54, s * 0.06, 0.5), color='ink', seg=8)]
    for x in (0.28, -0.28):
        for s in (-1, 1):
            p.append(cyl(f'leg{x}{s}', 0.045, 0.2, loc=(x, s * 0.1, 0.1), color='clay', seg=10, bev=0.015))
    p += wheel('wf', 0.07, 0.04, 0.28, 0.16, z=0.07, tire='red', hub='white')
    p += wheel('wf2', 0.07, 0.04, 0.28, -0.16, z=0.07, tire='red', hub='white')
    p += wheel('wr', 0.07, 0.04, -0.28, 0.16, z=0.07, tire='red', hub='white')
    p += wheel('wr2', 0.07, 0.04, -0.28, -0.16, z=0.07, tire='red', hub='white')
    return finish(join(p, 'dog'), mass=0.08)
