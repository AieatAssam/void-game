"""Classic folding deckchair: A-frame side rails, rear legs, striped sling hanging between the rails."""
from lib import *


def build():
    W = 0.3
    p = []
    for s in (-1, 1):
        y = s * W
        p += [tube(f'main{s}', (0.45, y, 0.0), (-0.38, y, 0.92), r=0.025, color='wood'),     # long rail: front foot -> back top
              tube(f'rear{s}', (-0.42, y * 1.05, 0.0), (0.12, y * 1.05, 0.55), r=0.022, color='wood'),  # rear leg crossing it
              tube(f'arm{s}', (0.12, y * 1.05, 0.55), (0.42, y, 0.36), r=0.02, color='wood')]
    for name, x, z in (('topbar', -0.37, 0.9), ('frontbar', 0.42, 0.36), ('footbar', 0.43, 0.03), ('crossbar', 0.1, 0.53)):
        p.append(cyl(name, 0.022, W * 2 + 0.06, loc=(x, W + 0.03, z), color='wood', rot=(math.pi / 2, 0, 0), seg=10, bev=0))
    # sling: sags from the top bar to the front bar in 10 striped bands
    pts = []
    for k in range(11):
        t = k / 10
        x = -0.37 + t * 0.79
        z = 0.9 * (1 - t) + 0.36 * t - math.sin(t * math.pi) * 0.3
        pts.append(Vector((x, 0, z)))
    for k in range(10):
        a, b = pts[k], pts[k + 1]
        d = b - a
        seg = box(f'sling{k}', (d.length + 0.01, W * 1.9, 0.015), loc=(a + b) / 2, color=('red', 'white')[k % 2], bev=0.004, seg=1)
        seg.rotation_euler = (0, -math.atan2(d.z, d.x), 0)
        p.append(seg)
    return finish(join(p, 'deckchair'))
