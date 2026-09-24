"""Standing neon sign: worth combo points when swallowed."""
from lib import *


def build():
    p = [box('base', (0.5, 0.5, 0.1), loc=(0, 0, 0.05), color='ink', bev=0.03),
         cyl('pole', 0.05, 1.3, loc=(0, 0, 0.1), color='ink', seg=8, bev=0),
         box('board', (0.12, 1.1, 0.7), loc=(0, 0, 1.7), color='ink', bev=0.06),
         torus('ring', 0.25, 0.04, loc=(0.07, -0.25, 1.7), color='lilac', seg=24, rseg=6, rot=(0, math.pi / 2, 0)),
         box('bar', (0.05, 0.4, 0.07), loc=(0.07, 0.25, 1.85), color='siren_blue', bev=0.02),
         box('bar2', (0.05, 0.4, 0.07), loc=(0.07, 0.25, 1.55), color='siren_red', bev=0.02)]
    return finish(join(p, 'neon_sign'), effect='combo')
