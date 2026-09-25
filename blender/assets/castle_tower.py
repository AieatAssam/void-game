"""Region pack: a round castle tower (drum) with a batter, machicolations, a conical slate cap, a weathervane
pennant and arrow loops. Stands at the corners where castle_wall segments meet."""
from kit import *


def build():
    R, H = 4.2, 15.0
    s = 32
    p = [cyl('drum', R, H, loc=(0, 0, 0), color='concrete', seg=s, bev=0.2),
         cyl('batter', R + 0.9, 2.6, loc=(0, 0, 0), color='concrete', seg=s, bev=0.5, r2=R),
         cyl('corbel', R + 0.7, 0.9, loc=(0, 0, H - 0.2), color='sand', seg=s, bev=0.15, r2=R),
         cyl('gallery', R + 0.7, 1.4, loc=(0, 0, H + 0.7), color='concrete', seg=s, bev=0.15),
         lathe('cap', [(0, 0), (R + 1.2, 0), (R + 0.9, 0.5), (0.1, 8.5), (0, 8.5)], loc=(0, 0, H + 1.9), color='asphalt_lt', seg=s),
         cyl('mast', 0.08, 3.0, loc=(0, 0, H + 10.2), color='ink', seg=8, bev=0),
         mesh('pennant', [(0, 0, 0), (0, 0, -1.2), (2.4, 0, -0.6)], [(0, 1, 2)], color='red', loc=(0.05, 0, H + 13.1)),
         sphere('finial', 0.22, loc=(0, 0, H + 10.4), color='gold', seg=12)]
    for k in range(3):
        p.append(torus(f'course{k}', R + 0.02, 0.07, loc=(0, 0, 3.8 + k * 3.4), color='sand', seg=s, rseg=6))
    for k in range(16):  # corbels under the gallery
        a = k * math.tau / 16
        p.append(box(f'cb{k}', (0.5, 0.4, 0.8), loc=(math.cos(a) * (R + 0.45), math.sin(a) * (R + 0.45), H + 0.15), color='sand', bev=0.06, seg=1, rot=(0, 0, a)))
    for k in range(6):  # arrow loops + slit windows
        a = k * math.tau / 6 + 0.3
        c, sn = math.cos(a), math.sin(a)
        z = 5.5 + (k % 2) * 3.8
        p += [box(f'loop{k}', (0.1, 0.28, 1.7), loc=(c * (R + 0.02), sn * (R + 0.02), z), color='ink', bev=0.02, seg=1, rot=(0, 0, a)),
              box(f'loopx{k}', (0.1, 0.9, 0.22), loc=(c * (R + 0.02), sn * (R + 0.02), z + 0.2), color='ink', bev=0.02, seg=1, rot=(0, 0, a))]
    p += [box('window', (0.2, 0.9, 1.3), loc=(R + 0.55, 0, H + 0.75), color='glow', bev=0.04),
          box('door', (0.3, 1.4, 2.3), loc=(-R - 0.2, 0, 1.15), color='wood', bev=0.06)]
    return finish(tag(join(p, 'castle_tower'), 'region'))
