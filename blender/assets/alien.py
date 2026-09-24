"""Little green visitor (UFO event): big glossy eyes, antennae with glowing tips, silver suit and a toy ray gun."""
from people import *
from kit import tag


def alien_kit():
    H = 0.93
    p = []
    for s in (-1, 1):
        p += [sphere(f'eye{s}', 0.065, loc=(0.13, s * 0.07, H + 0.03), color='gloss_black', seg=16, scale=(0.55, 0.8, 1.15), rot=(s * 0.35, 0, 0)),
              sphere(f'eyeglint{s}', 0.014, loc=(0.168, s * 0.055, H + 0.07), color='glow_white', seg=6),
              tube(f'ant{s}', (-0.02, s * 0.06, H + 0.15), (0.0, s * 0.14, H + 0.36), r=0.01, color='mint'),
              sphere(f'antball{s}', 0.03, loc=(0.0, s * 0.14, H + 0.37), color='toxic', seg=12)]
    p += [torus('collar', 0.07, 0.02, loc=(0, 0, 0.8), color='chrome', seg=20, rseg=6),
          box('chest_badge', (0.012, 0.08, 0.08), loc=(0.158, 0, 0.64), color='lilac', bev=0.01),
          torus('suit_belt', 0.15, 0.02, loc=(0, 0, 0.45), color='gloss_black', seg=24, rseg=6),
          box('gun_body', (0.14, 0.04, 0.05), loc=(0.1, 0.26, 0.42), color='hot_pink', bev=0.015),
          cyl('gun_barrel', 0.012, 0.08, loc=(0.17, 0.26, 0.43), color='chrome', seg=8, rot=(0, math.pi / 2, 0), bev=0),
          sphere('gun_tip', 0.02, loc=(0.25, 0.26, 0.43), color='toxic', seg=8)]
    return p


def build():
    ob = person('alien', 'pearl', 'lilac', 'gloss_black', 'sage', 'sage', 'bald', extras=(alien_kit,), scale=1.0)
    return tag(ob, 'events', event='ufo')
