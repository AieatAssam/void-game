from lib import *


def build():
    hull = lathe('hull', [(0.0, 0.0), (0.45, 0.05), (0.62, 0.3), (0.64, 0.45), (0.0, 0.45)], color='white', seg=24)
    hull.scale = (2.6, 1.0, 1.0)
    p = [hull,
         torus('rim', 0.62, 0.05, loc=(0, 0, 0.46), color='red', seg=40, rseg=8),
         box('inside', (2.9, 1.0, 0.05), loc=(0, 0, 0.3), color='wood', bev=0.02),
         box('seat1', (0.3, 1.1, 0.06), loc=(0.5, 0, 0.36), color='wood', bev=0.02),
         box('seat2', (0.3, 1.1, 0.06), loc=(-0.6, 0, 0.36), color='wood', bev=0.02)]
    p[-4].scale = (2.6, 1.0, 1.0)  # gunwale ring follows the stretched hull
    for s in (-1, 1):
        p.append(box(f'oar{s}', (2.0, 0.06, 0.06), loc=(0, s * 0.8, 0.5), color='wood', bev=0.02, rot=(0, 0, s * 0.15)))
        p.append(box(f'blade{s}', (0.5, 0.2, 0.03), loc=(0.95, s * 0.95, 0.5), color='sky', bev=0.01, rot=(0, 0, s * 0.15)))
    return finish(join(p, 'rowboat'))
