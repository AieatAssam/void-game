"""FX: the glowing lip of the hole. Unit radius; scaled by the game."""
from lib import *


def build():
    p = [torus('lip', 1.0, 0.06, loc=(0, 0, 0.02), color='lilac', seg=96, rseg=12),
         torus('inner', 0.95, 0.04, loc=(0, 0, -0.02), color='void', seg=96, rseg=8)]
    for i in range(24):
        a = i * 2 * math.pi / 24
        p.append(sphere(f'bead{i}', 0.025, loc=(math.cos(a) * 1.06, math.sin(a) * 1.06, 0.04), color='glow_white', seg=8))
    return finish(join(p, 'hole_rim'), tier=1.0, kind='fx')
