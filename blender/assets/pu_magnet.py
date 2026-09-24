"""Power-up: Magnet - a long, strong whirlpool that drags everything edible in."""
from pickup_kit import *


def build():
    icon = [torus('horseshoe', 0.17, 0.07, loc=(0, 0, 0.02), color='red', seg=24, rseg=8, rot=(math.pi / 2, 0, 0), arc=(math.pi, 2 * math.pi)),
            box('legL', (0.14, 0.14, 0.18), loc=(-0.17, 0, 0.1), color='red', bev=0.03),
            box('legR', (0.14, 0.14, 0.18), loc=(0.17, 0, 0.1), color='red', bev=0.03),
            box('tipL', (0.15, 0.15, 0.08), loc=(-0.17, 0, 0.22), color='pearl', bev=0.02),
            box('tipR', (0.15, 0.15, 0.08), loc=(0.17, 0, 0.22), color='pearl', bev=0.02)]
    for k in range(3):  # field lines
        icon.append(torus(f'field{k}', 0.08 + k * 0.05, 0.008, loc=(0, 0, 0.3), color='sky', seg=16, rseg=3, rot=(math.pi / 2, 0, 0), arc=(0.3, math.pi - 0.3)))
    return capsule('pu_magnet', 'red', 'sky', icon, 'magnet')
