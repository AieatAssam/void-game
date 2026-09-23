from lib import *


def build():
    body = lathe('cone', [(0.15, 0.04), (0.145, 0.1), (0.125, 0.18), (0.12, 0.2), (0.1, 0.28), (0.095, 0.3),
                          (0.075, 0.38), (0.07, 0.4), (0.045, 0.5), (0.03, 0.53), (0.0, 0.535)], color='terracotta', seg=24)
    paint(body, 'white', faces=lambda f: 0.18 < f.center.z < 0.3 and not 0.2 < f.center.z < 0.28 or 0.38 < f.center.z < 0.4)
    paint(body, 'white', faces=lambda f: 0.2 < f.center.z < 0.28)
    base = box('base', (0.38, 0.38, 0.05), loc=(0, 0, 0.025), color='terracotta', bev=0.02)
    return finish(join([body, base], 'cone'), mass=0.05)
