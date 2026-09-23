"""Playground swing set. 'swing' clip rocks the seats."""
from lib import *


def build():
    p = [cyl('beam', 0.08, 3.6, loc=(-1.8, 0, 2.2), color='red', seg=12, rot=(0, math.pi / 2, 0), bev=0.02)]
    for x in (-1.7, 1.7):
        for s in (-1, 1):
            p.append(box(f'leg{x}{s}', (0.12, 0.12, 2.4), loc=(x, s * 0.45, 1.1), color='red', bev=0.04, rot=(-s * 0.4, 0, 0)))
    p.append(box('sand', (4.2, 2.6, 0.06), loc=(0, 0, 0.03), color='sand', bev=0.02))
    root = join(p, 'swing')
    for k, x in enumerate((-0.7, 0.7)):
        seat = join([box('seat', (0.25, 0.5, 0.06), loc=(0, 0, -1.6), color=('butter', 'sky')[k], bev=0.02),
                     box('ch1', (0.02, 0.02, 1.6), loc=(0, 0.22, -0.8), color='steel', bev=0, seg=1),
                     box('ch2', (0.02, 0.02, 1.6), loc=(0, -0.22, -0.8), color='steel', bev=0, seg=1)], f'seat{k}')
        seat.location = (x, 0, 2.2)
        parent(seat, root)
        keys(seat, 'rotation_euler', [(0, (0, 0.5 * (1 if k else -1), 0)), (30, (0, -0.5 * (1 if k else -1), 0)), (60, (0, 0.5 * (1 if k else -1), 0))], name=f'swing{k}')
    return finish(root)
