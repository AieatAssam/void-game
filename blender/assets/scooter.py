from kit import *


def build():
    p = [box('deck', (0.7, 0.34, 0.1), loc=(0, 0, 0.26), color='mint', bev=0.04),
         sphere('rear', 0.3, loc=(-0.32, 0, 0.45), color='mint', seg=24, scale=(1.2, 0.8, 0.75)),
         box('seat', (0.46, 0.26, 0.1), loc=(-0.28, 0, 0.7), color='ink', bev=0.05),
         box('shield', (0.1, 0.4, 0.62), loc=(0.36, 0, 0.55), color='mint', bev=0.05, rot=(0, -0.2, 0)),
         cyl('stem', 0.035, 0.4, loc=(0.42, 0, 0.82), color='steel', rot=(0, 0.2, 0), seg=12, bev=0.01),
         cyl('bars', 0.03, 0.6, loc=(0.49, 0.3, 1.2), color='steel', rot=(math.pi / 2, 0, 0), seg=12, bev=0.01),
         sphere('hl', 0.08, loc=(0.48, 0, 1.1), color='glow', seg=12),
         sphere('fender', 0.21, loc=(0.46, 0, 0.36), color='mint', seg=20, scale=(1, 0.6, 0.65))]
    p += wheel('wf', 0.2, 0.14, 0.46, 0.0) + wheel('wr', 0.2, 0.14, -0.4, 0.0)
    return finish(join(p, 'scooter'))
