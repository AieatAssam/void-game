from lib import *


def build():
    p = [lathe('pole', [(0.0, 0.0), (0.2, 0.0), (0.2, 0.08), (0.12, 0.14), (0.1, 0.35), (0.06, 0.45), (0.055, 2.9),
                        (0.08, 2.95), (0.0, 2.97)], color='navy', seg=20),
         cyl('arm', 0.04, 0.55, loc=(0, 0, 2.85), color='navy', rot=(0, math.pi / 2, 0), seg=12, bev=0.01),
         lathe('shade', [(0.0, 3.1), (0.06, 3.09), (0.22, 2.96), (0.26, 2.9), (0.0, 2.9)], loc=(0.55, 0, -0.08), color='navy', seg=24),
         sphere('bulb', 0.12, loc=(0.55, 0, 2.8), color='glow', seg=16, scale=(1, 1, 0.7))]
    return finish(join(p, 'lamp'), tier=0.3, mass=0.1)
