"""Round hay bale: a straw cylinder lying on its side, net-wrapped with twine bands, spiral-wound ends and
loose tufts poking out."""
from kit import *
import random


def build():
    R, Lb = 0.72, 1.2
    p = [cyl('bale', R, Lb, loc=(0, -Lb / 2, R), color='butter', seg=40, bev=0.12, bseg=3, rot=(-math.pi / 2, 0, 0))]
    for k in range(5):  # twine bands
        y = -Lb / 2 + 0.15 + k * (Lb - 0.3) / 4
        p.append(torus(f'band{k}', R + 0.005, 0.012, loc=(0, y, R), color='sage', seg=40, rseg=4, rot=(math.pi / 2, 0, 0)))
    for s in (-1, 1):  # spiral windings on the flat ends
        for k in range(5):
            p.append(torus(f'wind{s}{k}', R * (0.18 + k * 0.15), 0.018, loc=(0, s * (Lb / 2 + 0.002), R), color='sand', seg=32, rseg=4, rot=(math.pi / 2, 0, 0)))
    rnd = random.Random(3)
    for k in range(40):  # loose straw tufts
        a = rnd.random() * math.pi * 2
        y = (rnd.random() - 0.5) * Lb
        c = Vector((math.cos(a) * R, y, R + math.sin(a) * R))
        tip = c + Vector((math.cos(a) * 0.12 + (rnd.random() - 0.5) * 0.1, (rnd.random() - 0.5) * 0.1, math.sin(a) * 0.12))
        if tip.z < 0.02:
            continue
        p.append(tube(f'straw{k}', c, tip, r=0.008, color='sand' if k % 2 else 'hazard', seg=4))
    return tag(finish(join(p, 'hay_bale'), mass=0.5), 'farmfair')
