from lib import *


def build():
    body = lathe('pillar', [(0.0, 0.0), (0.2, 0.0), (0.2, 0.06), (0.16, 0.08), (0.16, 0.85), (0.19, 0.88), (0.19, 0.93),
                            (0.14, 1.0), (0.06, 1.04), (0.0, 1.05)], color='teal', seg=28)
    paint(body, 'navy', faces=lambda f: f.center.z < 0.08)
    p = [body,
         box('slot', (0.06, 0.2, 0.04), loc=(0.155, 0, 0.78), color='ink', bev=0.012),
         box('plate', (0.03, 0.16, 0.12), loc=(0.16, 0, 0.55), color='white', bev=0.01),
         sphere('knob', 0.035, loc=(0, 0, 1.06), color='hazard', seg=12)]
    return finish(join(p, 'mailbox'), mass=0.12)
