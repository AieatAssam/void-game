"""Marathon runner (city event): race bib with number, sweatband, watch, neon trainers, water bottle."""
from people import *
from kit import tag


def race_kit():
    p = [box('bib', (0.012, 0.2, 0.16), loc=(0.16, 0, 0.6), color='white', bev=0.004, seg=1),
         box('bib_band', (0.013, 0.2, 0.03), loc=(0.161, 0, 0.665), color='red', bev=0, seg=1)]
    for k, (y, z) in enumerate(((-0.05, 0.585), (-0.017, 0.585), (0.017, 0.585), (0.05, 0.585))):  # race number blocks
        p.append(box(f'digit{k}', (0.014, 0.024, 0.06), loc=(0.166, y, z), color='ink', bev=0, seg=1))
    for s in (-1, 1):
        p.append(sphere(f'pin{s}', 0.008, loc=(0.168, s * 0.09, 0.665), color='chrome', seg=6))
    p += [torus('sweatband', 0.172, 0.022, loc=(0, 0, 1.0), color='hazard', seg=24, rseg=6, rot=(0, 0.12, 0)),
          torus('watch', 0.052, 0.014, loc=(0.02, 0.24, 0.47), color='gloss_black', seg=14, rseg=5),
          box('watch_face', (0.03, 0.03, 0.01), loc=(0.02, 0.24, 0.485), color='toxic', bev=0.004, seg=1),
          cyl('bottle', 0.035, 0.16, loc=(0.02, -0.24, 0.38), color='sky', seg=14, bev=0.01),
          cyl('bottle_cap', 0.022, 0.04, loc=(0.02, -0.24, 0.54), color='hazard', seg=10, bev=0.006)]
    return p


def build():
    ob = person('marathon_runner', 'teal', 'ink', 'hazard', 'clay', 'ink', 'short', extras=(race_kit,), sleeve='teal')
    return tag(ob, 'events', event='marathon')
