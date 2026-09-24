"""Sea scenery: little sailboat bobbing offshore."""
from lib import *


def build():
    hull = lathe('hull', [(0.0, 0.0), (0.5, 0.1), (0.8, 0.5), (0.82, 0.7), (0.0, 0.7)], color='white', seg=24)
    hull.scale = (3.0, 1.0, 1.0)
    sail = mesh('sail', [(0, 0, 0.9), (0, 0, 5.5), (-1.9, 0, 0.9)], [(0, 1, 2)], 'white')
    jib = mesh('jib', [(0.2, 0, 0.9), (0.2, 0, 4.8), (1.8, 0, 0.9)], [(0, 1, 2)], 'red')
    p = [hull, box('stripe', (4.8, 1.66, 0.12), loc=(0, 0, 0.62), color='navy', bev=0.04),
         cyl('mast', 0.06, 5.2, loc=(0, 0, 0.6), color='clay', seg=8, bev=0), sail, jib,
         sphere('flag', 0.08, loc=(0, 0, 5.85), color='hazard', seg=8)]
    for m in (sail, jib):
        solid = m.modifiers.new('s', 'SOLIDIFY')
        solid.thickness = 0.04
        apply_mods(m)
    return finish(join(p, 'sailboat'), kind='scenery')
