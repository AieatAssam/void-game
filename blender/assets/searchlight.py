"""Hazard: police searchlight tower. 'sweep' clip turns the lamp; the game projects the beam spot."""
from lib import *


def build():
    p = [box('base', (1.2, 1.2, 0.3), loc=(0, 0, 0.15), color='ink', bev=0.06),
         cyl('mast', 0.12, 3.2, loc=(0, 0, 0.3), color='police', seg=12, bev=0.03),
         box('stripe', (0.3, 0.3, 0.2), loc=(0, 0, 1.6), color='hazard', bev=0.04),
         cyl('bearing', 0.22, 0.12, loc=(0, 0, 3.5), color='steel', seg=16, bev=0.03)]
    root = join(p, 'searchlight')
    tilt = 0.35  # lamp aims slightly down at the street
    h = [box(f'yoke{s}', (0.1, 0.06, 0.55), loc=(0, s * 0.42, 0.25), color='police', bev=0.02) for s in (-1, 1)]
    h += [cyl('drum', 0.36, 0.55, loc=(-0.25, 0, 0.45), color='steel', rot=(0, math.pi / 2 + tilt, 0), seg=28, bev=0.04),
          torus('bezel', 0.36, 0.045, loc=(0.29 * math.cos(tilt), 0, 0.45 - 0.29 * math.sin(tilt)), color='chrome', seg=28, rseg=6, rot=(0, math.pi / 2 + tilt, 0)),
          cyl('lens', 0.33, 0.03, loc=(0.28 * math.cos(tilt), 0, 0.45 - 0.28 * math.sin(tilt)), color='glow_white', rot=(0, math.pi / 2 + tilt, 0), seg=28, bev=0)]
    for k in range(4):  # cooling fins on the drum
        x = -0.15 + k * 0.1
        h.append(torus(f'fin{k}', 0.37, 0.018, loc=(x * math.cos(tilt), 0, 0.45 - x * math.sin(tilt)), color='asphalt_lt', seg=24, rseg=5, rot=(0, math.pi / 2 + tilt, 0)))
    head = join(h, 'head')
    head.location = (0, 0, 3.55)
    parent(head, root)
    finish(root, kind='hazard', effect='spotlight')
    spin(head, 'Z', frames=300, name='sweep')
    return root
