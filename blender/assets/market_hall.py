"""Region pack: the market hall. An open ground floor of stone arches (market stalls inside), a timber-framed
upper floor, a hipped tile roof with a little clock cupola and weathervane, and a market cross outside."""
from kit import *


def build():
    D, W = 11.0, 16.0
    p = [box('floor', (D, W, 0.5), loc=(0, 0, 0.25), color='sand', bev=0.1, seg=2),
         box('upper', (D + 0.6, W + 0.6, 4.0), loc=(0, 0, 6.0), color='cream', bev=0.14),
         box('beam', (D + 0.7, W + 0.7, 0.4), loc=(0, 0, 4.1), color='wood', bev=0.06, seg=2)]
    # hipped roof: a gable with its ends clipped by two end slopes
    p.append(hip_roof('roof', D + 1.6, W + 1.6, 4.2, loc=(0, 0, 8.0), color='roof_tile', bev=0.1))
    # arcade of arches on every side
    for side in range(4):
        a = side * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        span = W if side % 2 == 0 else D
        half = (D if side % 2 == 0 else W) / 2
        n = int(span / 3.2)
        for k in range(n + 1):
            off = -span / 2 + k * span / n
            p.append(box(f'pier{side}{k}', (0.8, 0.8, 3.6), loc=(c * half - s * off, s * half + c * off, 2.3), color='sand', bev=0.1, seg=2))
            if k < n:
                mid = off + span / n / 2
                p.append(torus(f'arch{side}{k}', span / n / 2 - 0.4, 0.3, loc=(c * half - s * mid, s * half + c * mid, 3.3), color='sand', seg=16, rseg=6,
                               rot=(math.pi / 2, 0, a + math.pi / 2), arc=(0, math.pi)))
    for side, (face, cx, cy) in enumerate((('+x', D / 2 + 0.32, 0), ('-x', -D / 2 - 0.32, 0))):
        p += window_grid(cx, cy, 6.0, 1.2, 1.6, 4, 1, 2.1, 0, face, frame='white')
    for k in range(8):  # timber studs
        y = -W / 2 + 1 + k * (W - 2) / 7
        for sx in (-1, 1):
            p.append(box(f'stud{k}{sx}', (0.1, 0.2, 3.8), loc=(sx * (D / 2 + 0.33), y, 6.0), color='wood', bev=0.03, seg=1))
    # cupola with clock + weathervane
    p += [box('cup', (2.2, 2.2, 2.4), loc=(0, 0, 12.4), color='white', bev=0.1, seg=2),
          lathe('cupr', [(0, 0), (1.7, 0), (0.05, 1.8), (0, 1.8)], loc=(0, 0, 13.6), color='teal', seg=4, rot=(0, 0, math.pi / 4)),
          cyl('dial', 0.7, 0.1, loc=(1.12, 0, 12.4), color='white', seg=20, rot=(0, math.pi / 2, 0), bev=0.02),
          torus('dialr', 0.7, 0.06, loc=(1.17, 0, 12.4), color='gold', seg=20, rseg=4, rot=(0, math.pi / 2, 0)),
          cyl('vane', 0.05, 1.2, loc=(0, 0, 15.3), color='ink', seg=6, bev=0),
          box('arrow', (1.2, 0.06, 0.12), loc=(0, 0, 16.2), color='gold', bev=0.02, seg=1),
          box('cock', (0.5, 0.06, 0.5), loc=(0.2, 0, 16.45), color='gold', bev=0.05, seg=1)]
    # stalls under the arches + market cross outside
    for k in range(4):
        y = -W / 2 + 2.5 + k * 3.7
        p += [box(f'stall{k}', (1.6, 2.4, 0.9), loc=(0, y, 0.95), color='wood', bev=0.05, seg=1),
              box(f'awn{k}', (2.0, 2.6, 0.12), loc=(0, y, 2.4), color=('red', 'police', 'forest', 'butter')[k], bev=0.03, seg=1)]
        for j in range(3):
            p.append(sphere(f'fruit{k}{j}', 0.25, loc=(0.3, y - 0.7 + j * 0.7, 1.5), color=('red', 'hazard', 'sage')[j], seg=8))
    p += [box('xbase', (2.4, 2.4, 0.8), loc=(D / 2 + 5.0, 0, 0.4), color='concrete', bev=0.1, seg=2),
          box('xbase2', (1.6, 1.6, 0.6), loc=(D / 2 + 5.0, 0, 1.1), color='concrete', bev=0.1, seg=2),
          box('xshaft', (0.5, 0.5, 4.0), loc=(D / 2 + 5.0, 0, 3.4), color='concrete', bev=0.1, seg=2),
          box('xarm', (0.4, 1.8, 0.4), loc=(D / 2 + 5.0, 0, 4.8), color='concrete', bev=0.1, seg=2)]
    return finish(tag(join(p, 'market_hall'), 'region'))
