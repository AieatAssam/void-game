"""Street bin: ribbed body, rim, domed lid with a push flap, base foot ring."""
from lib import *


def build():
    body = lathe('can', [(0.0, 0.02), (0.19, 0.02), (0.2, 0.05), (0.23, 0.6), (0.24, 0.62), (0.0, 0.62)], color='forest', seg=32)
    p = [body,
         cyl('foot', 0.2, 0.04, color='ink', seg=28, bev=0.01),
         torus('rim', 0.24, 0.022, loc=(0, 0, 0.61), color='forest', seg=32, rseg=6),
         lathe('lid', [(0.0, 0.8), (0.1, 0.79), (0.2, 0.72), (0.255, 0.64), (0.255, 0.61), (0.0, 0.61)], color='sage', seg=32),
         box('flap', (0.03, 0.16, 0.1), loc=(0.2, 0, 0.7), color='ink', bev=0.012, rot=(0, -0.55, 0)),
         cyl('label', 0.06, 0.01, loc=(0.225, 0, 0.35), color='white', rot=(0, math.pi / 2 - 0.05, 0), seg=16, bev=0)]
    for k in range(14):  # vertical ribs
        a = k * 2 * math.pi / 14
        p.append(box(f'rib{k}', (0.02, 0.025, 0.5), loc=(math.cos(a) * 0.218, math.sin(a) * 0.218, 0.33), color='forest', bev=0.008, seg=1,
                     rot=(0.05 * math.sin(a), -0.05 * math.cos(a), a)))
    return finish(join(p, 'trashcan'), mass=0.12)
