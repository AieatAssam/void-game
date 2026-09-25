"""Region pack: a gasholder (tier ~12). A green telescoping bell inside a two-tier cast-iron lattice guide frame
of columns, girders and diagonal bracing. Explodes in a chain reaction when swallowed near fire."""
from kit import *


def build():
    R, H = 11.0, 22.0
    p = [cyl('tank', R - 1.2, 3.0, loc=(0, 0, 0), color='concrete', seg=40, bev=0.15),
         cyl('bell1', R - 1.4, 8.0, loc=(0, 0, 3.0), color='forest', seg=40, bev=0.12),
         cyl('bell2', R - 2.0, 7.0, loc=(0, 0, 11.0), color='forest', seg=40, bev=0.12),
         lathe('crown', [(0, 0), (R - 2.0, 0), (R - 2.3, 0.6), (2.0, 1.6), (0, 1.7)], loc=(0, 0, 18.0), color='forest', seg=40),
         cyl('vent', 0.6, 1.0, loc=(0, 0, 19.6), color='steel', seg=12, bev=0.05)]
    for k in range(3):
        p.append(torus(f'lip{k}', R - 1.4 - (0.6 if k == 2 else 0), 0.14, loc=(0, 0, (3.0, 11.0, 18.0)[k]), color='ink', seg=40, rseg=4))
    N = 12
    for k in range(N):
        a = k * math.tau / N
        c, s = math.cos(a), math.sin(a)
        p.append(box(f'col{k}', (0.6, 0.6, H), loc=(c * R, s * R, H / 2), color='red', bev=0.06, seg=1, rot=(0, 0, a)))
        p.append(lathe(f'colcap{k}', [(0, 0), (0.45, 0), (0.05, 0.8), (0, 0.8)], loc=(c * R, s * R, H), color='red', seg=4))
        b = (k + 1) * math.tau / N
        for z in (H / 2, H):
            p.append(tube(f'gird{k}{z}', (c * R, s * R, z - 0.3), (math.cos(b) * R, math.sin(b) * R, z - 0.3), r=0.22, color='red', seg=6))
        for z0 in (0.5, H / 2):
            p.append(tube(f'x{k}{z0}', (c * R, s * R, z0), (math.cos(b) * R, math.sin(b) * R, z0 + H / 2 - 0.8), r=0.1, color='red', seg=4))
    p += [box('valve', (2.0, 1.4, 1.6), loc=(R + 2.0, 0, 0.8), color='hazard', bev=0.08, seg=2),
          tube('main', (R + 2.0, 0, 1.0), (R - 1.2, 0, 1.0), r=0.4, color='steel', seg=12)]
    return finish(tag(join(p, 'gasholder'), 'region', chain='blast'))
