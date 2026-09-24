from lib import *


def build():
    b = sphere('board', 0.5, color='mint', seg=24, scale=(2.3, 0.55, 0.07))
    b.location = (0, 0, 0.05)
    p = [b, box('stripe', (2.0, 0.08, 0.02), loc=(0, 0, 0.085), color='pink', bev=0, seg=1),
         lathe('fin', [(0.0, 0.0), (0.1, 0.0), (0.0, 0.2)], loc=(-0.9, 0, 0.0), color='ink', seg=4, rot=(math.pi, 0, 0))]
    return finish(join(p, 'surfboard'))
