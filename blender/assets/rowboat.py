"""Rowboat: open painted hull with a wooden interior, thwarts, gunwale, oars in rowlocks."""
from lib import *


def build():
    hull = lathe('hull', [(0.0, 0.0), (0.45, 0.05), (0.62, 0.3), (0.64, 0.45), (0.58, 0.45), (0.55, 0.32), (0.42, 0.14), (0.0, 0.12)],
                 color='white', seg=28)
    paint(hull, 'wood', faces=lambda f: f.normal.z > 0.25)  # inside + top of the gunwale are bare wood
    paint(hull, 'navy', faces=lambda f: f.normal.z < -0.2 and f.center.z < 0.12)  # anti-fouling bottom
    hull.scale = (2.6, 1.0, 1.0)
    rim = torus('rim', 0.61, 0.045, loc=(0, 0, 0.46), color='red', seg=40, rseg=8)
    rim.scale = (2.6, 1.0, 1.0)
    p = [hull, rim,
         box('seat1', (0.26, 1.08, 0.05), loc=(0.55, 0, 0.36), color='wood', bev=0.015),
         box('seat2', (0.26, 1.0, 0.05), loc=(-0.65, 0, 0.36), color='wood', bev=0.015),
         box('keel', (2.4, 0.06, 0.08), loc=(0, 0, 0.02), color='navy', bev=0.02)]
    for s in (-1, 1):
        p += [cyl(f'lock{s}', 0.025, 0.1, loc=(0.1, s * 0.66, 0.46), color='steel', seg=8, bev=0),  # on the gunwale, outside the hull wall
              tube(f'oar{s}', (0.1, s * 0.68, 0.55), (-0.9, s * 1.25, 0.32), r=0.025, color='wood'),
              box(f'blade{s}', (0.45, 0.14, 0.02), loc=(-1.05, s * 1.3, 0.27), color='wood', bev=0.01, rot=(0, 0.2, s * -0.55))]
    return finish(join(p, 'rowboat'))
