from lib import *


def build():
    u = lathe('canopy', [(0.0, 2.3), (0.15, 2.28), (0.9, 2.02), (1.2, 1.88), (1.18, 1.84), (0.0, 1.84)], color='sky', seg=32)
    paint(u, 'white', faces=lambda f: int((math.atan2(f.center.y, f.center.x) + math.pi) / (math.pi / 4)) % 2 == 0)
    p = [u, cyl('pole', 0.035, 2.3, color='white', seg=10, bev=0, rot=(0.12, 0, 0)),
         sphere('knob', 0.06, loc=(0, 0, 2.32), color='hazard', seg=10),
         box('towel', (1.6, 0.8, 0.02), loc=(0.6, 0.6, 0.01), color='pink', bev=0, seg=1),
         box('towelstripe', (1.6, 0.18, 0.025), loc=(0.6, 0.6, 0.012), color='white', bev=0, seg=1)]
    return finish(join(p, 'beach_umbrella'))
