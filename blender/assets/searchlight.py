"""Hazard: police searchlight tower. 'sweep' clip turns the lamp; the game projects the beam spot."""
from lib import *


def build():
    p = [box('base', (1.2, 1.2, 0.3), loc=(0, 0, 0.15), color='ink', bev=0.06),
         cyl('mast', 0.12, 3.2, loc=(0, 0, 0.3), color='police', seg=12, bev=0.03),
         box('stripe', (0.3, 0.3, 0.2), loc=(0, 0, 1.6), color='hazard', bev=0.04)]
    root = join(p, 'searchlight')
    head = join([cyl('lamp', 0.45, 0.6, color='steel', seg=24, rot=(0, math.pi / 2 - 0.5, 0), bev=0.05),
                 cyl('lens', 0.4, 0.05, loc=(0.52 * math.cos(0.5), 0, -0.52 * math.sin(0.5) + 0.0), color='glow_white', seg=24, rot=(0, math.pi / 2 - 0.5, 0), bev=0)], 'head')
    head.location = (0, 0, 3.6)
    parent(head, root)
    finish(root, kind='hazard', effect='spotlight')
    spin(head, 'Z', frames=300, name='sweep')
    return root
