"""Power-up: Ghost - the city can't see you (no heat, units lose track) for a while."""
from pickup_kit import *


def build():
    icon = [lathe('sheet', [(0.0, 0.25), (0.12, 0.23), (0.18, 0.12), (0.19, -0.08), (0.2, -0.16), (0.0, -0.16)], color='white', seg=24)]
    for k in range(8):  # wavy hem
        a = k * math.pi / 4
        icon.append(sphere(f'hem{k}', 0.06, loc=(math.cos(a) * 0.17, math.sin(a) * 0.17, -0.17), color='white', seg=8))
    for s in (-1, 1):
        icon += [sphere(f'eye{s}', 0.035, loc=(0.16, s * 0.06, 0.08), color='gloss_black', seg=8, scale=(0.6, 1, 1.3)),
                 sphere(f'blush{s}', 0.025, loc=(0.17, s * 0.11, 0.0), color='pink', seg=6, scale=(0.4, 1, 0.7)),
                 sphere(f'arm{s}', 0.05, loc=(0.02, s * 0.2, 0.0), color='white', seg=8, scale=(1, 0.7, 1.4))]
    icon.append(sphere('mouth', 0.025, loc=(0.18, 0, 0.0), color='gloss_black', seg=6, scale=(0.4, 1, 1.3)))
    return capsule('pu_ghost', 'lilac', 'lilac', icon, 'ghost')
