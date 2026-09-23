from lib import *


def build():
    p = [
        sphere('body', 0.12, loc=(0, 0, 0.17), color='steel', scale=(1.45, 1, 0.95)),
        sphere('neck', 0.085, loc=(0.1, 0, 0.23), color='teal', seg=16),
        sphere('head', 0.075, loc=(0.15, 0, 0.3), color='steel', seg=16),
        cyl('beak', 0.022, 0.06, loc=(0.21, 0, 0.295), color='hazard', r2=0.004, rot=(0, math.pi / 2, 0), seg=10, bev=0),
        box('tail', (0.16, 0.12, 0.03), loc=(-0.19, 0, 0.2), color='asphalt_lt', bev=0.012, rot=(0, -0.35, 0)),
    ]
    for s in (-1, 1):
        p += [sphere(f'wing{s}', 0.1, loc=(-0.03, s * 0.1, 0.19), color='asphalt_lt', seg=16, scale=(1.5, 0.35, 0.7), rot=(0.25 * s, -0.2, 0)),
              sphere(f'eye{s}', 0.018, loc=(0.2, s * 0.045, 0.315), color='ink', seg=8),
              cyl(f'leg{s}', 0.012, 0.09, loc=(0.02, s * 0.04, 0.0), color='peach', seg=8, bev=0),
              box(f'foot{s}', (0.07, 0.035, 0.015), loc=(0.04, s * 0.04, 0.008), color='peach', bev=0.005, seg=1)]
    return finish(join(p, 'pigeon'), mass=0.05)
