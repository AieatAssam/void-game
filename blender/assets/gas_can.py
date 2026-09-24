"""Poison: jerry can (embossed X panels, three-bar handle, capped spout). Swallowing it shrinks the hole."""
from lib import *


def build():
    D, W, H = 0.2, 0.36, 0.46
    p = [box('can', (D, W, H), loc=(0, 0, H / 2 + 0.01), color='hazard', bev=0.035),
         box('seam', (D + 0.012, 0.02, H - 0.02), loc=(0, 0, H / 2 + 0.01), color='hazard', bev=0.008)]
    for s in (-1, 1):  # embossed X on each flat side, same colour: reads as pressed steel, not tape
        for a in (0.62, -0.62):
            p.append(box(f'x{s}{a}', (0.016, 0.05, 0.44), loc=(s * (D / 2 + 0.006), 0, H / 2 + 0.01), color='hazard', bev=0.012, rot=(a, 0, 0)))
        p.append(box(f'label{s}', (0.012, 0.13, 0.09), loc=(s * (D / 2 + 0.012), 0, H * 0.55), color='warn', bev=0.006, seg=1))
    for k in range(3):  # three-bar handle
        p.append(box(f'bar{k}', (0.03, 0.03, 0.09), loc=(0, -0.1 + k * 0.1, H + 0.05), color='hazard', bev=0.01))
    p.append(box('grip', (0.04, 0.26, 0.03), loc=(0, 0, H + 0.1), color='hazard', bev=0.012))
    p += [tube('spout', (0, 0.13, H - 0.02), (0, 0.2, H + 0.1), r=0.03, color='hazard'),
          cyl('cap', 0.042, 0.04, loc=(0, 0.2, H + 0.09), color='red', seg=14, bev=0.01),
          box('hazsign', (0.01, 0.07, 0.07), loc=(D / 2 + 0.02, 0, H * 0.55), color='ink', bev=0.004, seg=1, rot=(math.pi / 4, 0, 0))]
    return finish(join(p, 'gas_can'), kind='poison', effect='shrink', mass=0.1)
