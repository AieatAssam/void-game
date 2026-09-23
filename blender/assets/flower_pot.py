from lib import *


def build():
    p = [lathe('pot', [(0.0, 0.0), (0.24, 0.0), (0.33, 0.45), (0.37, 0.47), (0.37, 0.55), (0.3, 0.55), (0.3, 0.5), (0.0, 0.5)], color='terracotta', seg=28),
         cyl('soil', 0.3, 0.02, loc=(0, 0, 0.5), color='clay', seg=24, bev=0),
         cyl('stem', 0.025, 0.5, loc=(0, 0, 0.5), color='forest', seg=8, bev=0),
         sphere('leaf1', 0.1, loc=(0.1, 0, 0.7), color='sage', seg=12, scale=(1.6, 0.6, 0.4), rot=(0, -0.4, 0)),
         sphere('leaf2', 0.1, loc=(-0.1, 0, 0.8), color='sage', seg=12, scale=(1.6, 0.6, 0.4), rot=(0, 0.4, 0)),
         sphere('center', 0.08, loc=(0, 0, 1.02), color='hazard', seg=12)]
    for i in range(8):
        a = i * math.pi / 4
        p.append(sphere(f'petal{i}', 0.08, loc=(math.cos(a) * 0.13, math.sin(a) * 0.13, 1.02), color='pink', seg=10, scale=(1.3, 0.8, 0.4), rot=(0, 0, a)))
    return finish(join(p, 'flower_pot'))
