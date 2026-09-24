"""Countryside landmark. 'blades' clip turns the sails."""
from lib import *


def build():
    p = [lathe('tower', [(0.0, 0.0), (3.2, 0.0), (3.2, 0.6), (2.8, 0.8), (2.0, 11.0), (2.3, 11.2), (0.0, 11.4)], color='cream', seg=32),
         lathe('cap', [(0.0, 11.2), (2.55, 11.2), (2.6, 11.5), (2.35, 12.4), (1.8, 13.2), (1.0, 13.8), (0.3, 14.05), (0.0, 14.1)], color='roof_tile', seg=40),
         cyl('finial', 0.08, 0.9, loc=(0, 0, 14.05), color='ink', seg=8, bev=0),
         sphere('ball', 0.18, loc=(0, 0, 14.95), color='gold', seg=12),
         torus('gallery', 2.7, 0.06, loc=(0, 0, 6.05), color='white', seg=40, rseg=6),
         box('door', (0.2, 1.4, 2.4), loc=(3.0, 0, 1.4), color='forest', bev=0.1, rot=(0, 0.1, 0)),
         box('balcony', (1.8, 5.8, 0.2), loc=(2.2, 0, 6.0), color='wood', bev=0.05)]
    for k, z in enumerate((4.0, 8.0)):
        p.append(box(f'win{k}', (0.2, 0.8, 1.1), loc=(2.6 - k * 0.35, 0, z), color='glow', bev=0.06))
    root = join(p, 'windmill')
    b = [cyl('hub', 0.5, 0.8, color='ink', seg=16, rot=(0, math.pi / 2, 0), bev=0.1)]
    for k in range(4):
        a = k * math.pi / 2
        b.append(box(f'spar{k}', (0.15, 0.25, 8.0), loc=(0.5, math.sin(a) * 4, math.cos(a) * 4), color='wood', bev=0.04, rot=(-a, 0, 0)))
        b.append(box(f'sail{k}', (0.06, 1.6, 6.2), loc=(0.55, math.sin(a) * 4.3 + math.cos(a) * 0.9, math.cos(a) * 4.3 - math.sin(a) * 0.9), color='white', bev=0.02, rot=(-a, 0, 0)))
    blades = join(b, 'blades')
    blades.location = (2.6, 0, 12.3)
    parent(blades, root)
    finish(root, kind='scenery')
    spin(blades, 'X', frames=240, name='blades')
    return root
