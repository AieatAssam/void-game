"""Peg-person pedestrian (Fisher-Price style). Variants come from peg_a/peg_b/peg_c."""
from lib import *


def peg(name, body, skin, hat, hat_style):
    p = [
        lathe('body', [(0.0, 0.0), (0.13, 0.0), (0.155, 0.03), (0.16, 0.08), (0.15, 0.3), (0.12, 0.36), (0.07, 0.39), (0.0, 0.4)], color=body, seg=24),
        cyl('collar', 0.1, 0.05, loc=(0, 0, 0.37), color='white', seg=20, bev=0.015),
        sphere('head', 0.13, loc=(0, 0, 0.52), color=skin, seg=24),
    ]
    for s in (-1, 1):
        p.append(sphere(f'eye{s}', 0.018, loc=(0.118, s * 0.045, 0.55), color='ink', seg=8))
        p.append(sphere(f'cheek{s}', 0.022, loc=(0.108, s * 0.075, 0.5), color='pink', seg=8, scale=(0.5, 1, 0.7)))
    if hat_style == 'cap':
        p += [sphere('cap', 0.135, loc=(0, 0, 0.55), color=hat, seg=24, scale=(1, 1, 0.75)),
              box('brim', (0.14, 0.2, 0.025), loc=(0.12, 0, 0.58), color=hat, bev=0.01)]
    elif hat_style == 'hair':
        p += [sphere('hair', 0.14, loc=(-0.02, 0, 0.56), color=hat, seg=24, scale=(1, 1.02, 0.9)),
              sphere('bun', 0.06, loc=(-0.08, 0, 0.68), color=hat, seg=12)]
    else:  # bowler
        p += [cyl('crown', 0.09, 0.1, loc=(0, 0, 0.62), color=hat, seg=20, bev=0.03),
              cyl('brim', 0.15, 0.025, loc=(0, 0, 0.62), color=hat, seg=24, bev=0.01)]
    return finish(join(p, name), mass=0.06)
