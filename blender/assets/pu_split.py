"""Power-up: Split - you become two holes for ten seconds (both eat; they merge back)."""
from pickup_kit import *


def build():
    icon = []
    for s in (-1, 1):
        icon += [cyl(f'void{s}', 0.12, 0.04, loc=(0, s * 0.14, 0.0), color='void', seg=20, bev=0.01),
                 torus(f'rim{s}', 0.125, 0.025, loc=(0, s * 0.14, 0.04), color='lilac', seg=20, rseg=5),
                 sphere(f'star{s}', 0.015, loc=(0.03, s * 0.14 - 0.03, 0.045), color='glow_white', seg=5)]
    icon += [box('arrowA', (0.03, 0.12, 0.03), loc=(0, 0, 0.18), color='hot_pink', bev=0.01, rot=(0.6, 0, 0)),
             box('arrowB', (0.03, 0.12, 0.03), loc=(0, 0, 0.18), color='hot_pink', bev=0.01, rot=(-0.6, 0, 0))]
    return capsule('pu_split', 'hot_pink', 'hot_pink', icon, 'split')
