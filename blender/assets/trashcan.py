from lib import *


def build():
    body = lathe('can', [(0.0, 0.0), (0.19, 0.0), (0.2, 0.02), (0.23, 0.6), (0.24, 0.62), (0.0, 0.62)], color='forest', seg=28)
    paint(body, 'sage', faces=lambda f: 0.25 < f.center.z < 0.35)
    p = [body,
         lathe('lid', [(0.0, 0.78), (0.09, 0.77), (0.2, 0.7), (0.26, 0.64), (0.26, 0.61), (0.0, 0.61)], color='sage', seg=28),
         torus('handle', 0.06, 0.018, loc=(0, 0, 0.78), color='steel', seg=16, rseg=6, rot=(math.pi / 2, 0, 0)),
         torus('rim', 0.24, 0.02, loc=(0, 0, 0.61), color='forest', seg=28, rseg=6)]
    return finish(join(p, 'trashcan'), mass=0.12)
