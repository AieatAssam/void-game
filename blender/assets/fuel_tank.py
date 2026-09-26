"""Region pack: a squat white fuel storage tank with a bund wall, a spiral stair, hazard bands and a pipe rack.
Chain reaction: it goes up when swallowed next to fire (see chains.js)."""
from kit import *


def build():
    R, H = 5.6, 7.0
    p = [cyl('tank', R, H, loc=(0, 0, 0.4), color='white', seg=40, bev=0.12),
         lathe('roof', [(0, 0), (R + 0.1, 0), (0, 1.1)], loc=(0, 0, H + 0.4), color='white', seg=40),
         cyl('band', R + 0.04, 0.6, loc=(0, 0, H - 0.6), color='hazard', seg=40, bev=0.02),
         box('logo', (0.1, 2.4, 1.6), loc=(R + 0.02, 0, 3.4), color='red', bev=0.2, seg=2),
         cyl('pad', R + 0.5, 0.4, loc=(0, 0, 0), color='concrete', seg=40, bev=0.06)]
    for k in range(4):  # bund wall around it
        a = k * math.pi / 2
        p.append(box(f'bund{k}', (0.5, 2 * R + 3.0, 1.0), loc=(math.cos(a) * (R + 1.5), math.sin(a) * (R + 1.5), 0.5), color='concrete', bev=0.08, seg=1, rot=(0, 0, a)))
    for k in range(18):  # spiral stair
        a = k * 0.2
        z = 0.6 + k * (H / 18)
        p.append(box(f'st{k}', (0.9, 0.35, 0.08), loc=(math.cos(a) * (R + 0.5), math.sin(a) * (R + 0.5), z), color='hazard', bev=0, seg=1, rot=(0, 0, a + math.pi / 2)))
    p.append(tube('rail', (R + 0.95, 0, 1.4), (math.cos(3.4) * (R + 0.95), math.sin(3.4) * (R + 0.95), H + 0.9), r=0.04, color='hazard', seg=4))
    p += [tube('pipe1', (-R - 3.0, -1.0, 0.8), (-R + 0.2, -1.0, 0.8), r=0.25, color='steel', seg=10),
          tube('pipe2', (-R - 3.0, 1.0, 0.8), (-R + 0.2, 1.0, 0.8), r=0.25, color='steel', seg=10)]
    return finish(tag(join(p, 'fuel_tank'), 'region', chain='blast'))
