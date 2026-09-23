"""Poison: swallowing it shrinks the hole."""
from lib import *


def build():
    p = [box('can', (0.26, 0.4, 0.5), loc=(0, 0, 0.25), color='hazard', bev=0.05),
         box('x1', (0.28, 0.05, 0.5), loc=(0, 0, 0.25), color='ink', bev=0.015, rot=(0.66, 0, 0)),
         box('x2', (0.28, 0.05, 0.5), loc=(0, 0, 0.25), color='ink', bev=0.015, rot=(-0.66, 0, 0)),
         box('label', (0.285, 0.18, 0.14), loc=(0, 0, 0.25), color='warn', bev=0.02),
         torus('handle', 0.08, 0.025, loc=(0, -0.06, 0.52), color='ink', seg=16, rseg=6, rot=(0, math.pi / 2, 0)),
         cyl('spout', 0.04, 0.16, loc=(0, 0.14, 0.48), color='red', rot=(-0.6, 0, 0), seg=14, bev=0.01),
         cyl('capx', 0.05, 0.03, loc=(0, 0.23, 0.6), color='ink', rot=(-0.6, 0, 0), seg=14, bev=0.008)]
    return finish(join(p, 'gas_can'), kind='poison', effect='shrink', mass=0.1)
