from kit import *


def build():
    p = [box('cart', (1.6, 0.8, 0.8), loc=(0, 0, 0.75), color='white', bev=0.08),
         box('skirt', (1.62, 0.82, 0.18), loc=(0, 0, 0.44), color='red', bev=0.05),
         box('top', (1.66, 0.86, 0.06), loc=(0, 0, 1.17), color='steel', bev=0.02),
         box('handle', (0.05, 0.7, 0.05), loc=(-1.0, 0, 1.0), color='steel', bev=0.02),
         box('leg', (0.08, 0.08, 0.36), loc=(-0.6, 0, 0.18), color='steel', bev=0.02),
         cyl('pole', 0.03, 1.2, loc=(0.2, 0, 1.2), color='steel', seg=10, bev=0),
         box('signpost', (0.06, 0.06, 0.5), loc=(-0.55, 0, 1.4), color='steel', bev=0.02),
         sphere('bun', 0.2, loc=(-0.55, 0, 1.78), color='sand', seg=24, scale=(3.0, 1.2, 0.75)),
         sphere('dog', 0.11, loc=(-0.55, 0, 1.87), color='terracotta', seg=20, scale=(6.2, 1, 1)),
         box('mustard', (1.0, 0.04, 0.03), loc=(-0.55, 0, 1.99), color='hazard', bev=0.01, rot=(0, 0, 0.05)),
         box('ketchup', (0.9, 0.04, 0.03), loc=(-0.55, 0.05, 1.98), color='red', bev=0.01, rot=(0, 0, -0.05))]
    for i in range(3):
        p.append(cyl(f'bottle{i}', 0.05, 0.22, loc=(0.35 + i * 0.14, -0.2, 1.2), color=('red', 'hazard', 'white')[i], seg=12, bev=0.02))
    for s in (-1, 1):
        p += wheel(f'w{s}', 0.3, 0.1, 0.55, s * 0.43)
    u = lathe('umb', [(0.0, 2.55), (0.12, 2.52), (0.7, 2.28), (1.0, 2.12), (0.98, 2.08), (0.0, 2.08)], loc=(0.2, 0, 0), color='red', seg=32)
    paint(u, 'white', faces=lambda f: int((math.atan2(f.center.y, f.center.x) + math.pi) / (math.pi / 4)) % 2 == 0)
    p += [u, sphere('knob', 0.05, loc=(0.2, 0, 2.57), color='hazard', seg=10)]
    return finish(join(p, 'hotdog_cart'))
