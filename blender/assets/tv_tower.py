"""Region pack (capital): the TV tower (170 m). A slender concrete shaft on tripod legs, a glass observation pod
with a revolving-restaurant band, a red-and-white antenna mast and aircraft warning lights."""
from kit import *


def build():
    H = 120.0
    p = [cyl('shaft', 4.0, H, loc=(0, 0, 0), color='concrete', seg=24, bev=0.1, r2=2.6),
         cyl('plinth', 12.0, 2.0, loc=(0, 0, 0), color='concrete', seg=24, bev=0.2)]
    for k in range(3):  # tripod legs flaring into the base
        a = k * math.tau / 3
        p.append(tube(f'leg{k}', (math.cos(a) * 11.0, math.sin(a) * 11.0, 0), (math.cos(a) * 3.2, math.sin(a) * 3.2, 32.0), r=1.6, color='concrete', seg=12))
    pod = H - 10
    p += [lathe('pod', [(3.0, 0), (14.0, 3.0), (15.0, 6.0), (13.0, 11.0), (6.0, 14.0), (2.6, 14.5)], loc=(0, 0, pod), color='white', seg=40),
          cyl('podglass', 15.1, 3.0, loc=(0, 0, pod + 4.8), color='glass', seg=40, bev=0.1),
          torus('podring', 15.2, 0.3, loc=(0, 0, pod + 8.0), color='glow', seg=40, rseg=6),
          cyl('mastbase', 2.6, 6.0, loc=(0, 0, pod + 14.0), color='white', seg=16, bev=0.1)]
    z = pod + 20.0
    for k in range(8):  # red/white antenna segments
        r = 1.8 - k * 0.2
        p.append(cyl(f'mast{k}', r, 5.0, loc=(0, 0, z), color=('red', 'white')[k % 2], seg=12, bev=0.05, r2=r - 0.15))
        z += 5.0
    p.append(sphere('light', 0.5, loc=(0, 0, z + 0.3), color='siren_red', seg=10))
    for k in range(4):
        a = k * math.pi / 2
        p.append(sphere(f'wl{k}', 0.35, loc=(math.cos(a) * 3.0, math.sin(a) * 3.0, H * 0.55), color='siren_red', seg=8))
    return finish(tag(join(p, 'tv_tower'), 'region'), tier=12.0)
