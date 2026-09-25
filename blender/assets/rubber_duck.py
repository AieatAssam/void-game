"""Rubber duck (weekly mutator 'Everything is ducks'): built at unit scale (tier 0.5) so the mutator can
scale one duck to each replaced asset's tier. Glossy yellow body, tail flick, wing bumps, orange beak."""
from kit import *


def build():
    p = [sphere('body', 0.45, loc=(0, 0, 0.36), color='hazard', seg=32, scale=(1.25, 0.95, 0.8)),
         sphere('chest', 0.3, loc=(0.25, 0, 0.42), color='hazard', seg=24, scale=(1, 1, 1)),
         cyl('tail', 0.22, 0.3, loc=(-0.45, 0, 0.45), color='hazard', seg=16, r2=0.02, bev=0.04, rot=(0, -0.9, 0)),
         sphere('head', 0.28, loc=(0.3, 0, 0.9), color='hazard', seg=28),
         sphere('beak_top', 0.13, loc=(0.56, 0, 0.84), color='terracotta', seg=16, scale=(1.3, 1.1, 0.45)),
         sphere('beak_bot', 0.1, loc=(0.52, 0, 0.78), color='terracotta', seg=14, scale=(1.2, 0.9, 0.35)),
         sphere('shine', 0.08, loc=(0.2, -0.15, 1.07), color='glow_white', seg=8, scale=(1, 0.6, 0.5))]
    for s in (-1, 1):
        p += [blob(f'wing{s}', 0.22, (-0.05, s * 0.38, 0.45), 'hazard', seed=s + 2, amp=0.08, scale=(1.3, 0.35, 0.8), seg=14),
              sphere(f'eye{s}', 0.06, loc=(0.5, s * 0.13, 0.98), color='gloss_black', seg=12, scale=(0.6, 1, 1.2)),
              sphere(f'glint{s}', 0.018, loc=(0.54, s * 0.11, 1.02), color='glow_white', seg=6),
              sphere(f'cheek{s}', 0.05, loc=(0.48, s * 0.2, 0.86), color='peach', seg=8, scale=(0.4, 1, 0.7))]
    root = finish(join(p, 'rubber_duck'), tier=0.5, mass=0.1)
    return tag(root, 'mutators', mutator='ducks', unit_scale=True)
