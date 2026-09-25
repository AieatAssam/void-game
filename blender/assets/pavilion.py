"""Region pack (castle festival): a striped medieval pavilion tent with a scalloped valance, a centre pole
with a pennant, guy ropes and a heraldic shield on its door."""
from kit import *


def build():
    R, H = 2.4, 2.2
    s = 24
    p = [cyl('wall', R, H, loc=(0, 0, 0), color='white', seg=s, bev=0.05),
         lathe('roof', [(0, 0), (R + 0.3, 0), (0.08, 2.2), (0, 2.2)], loc=(0, 0, H), color='red', seg=s),
         cyl('pole', 0.06, 1.6, loc=(0, 0, H + 2.1), color='wood', seg=8, bev=0),
         mesh('pen', [(0, 0, 0), (0, 0, -0.5), (1.1, 0, -0.25)], [(0, 1, 2)], color='butter', loc=(0.05, 0, H + 3.6)),
         box('door', (0.1, 1.1, 1.8), loc=(R + 0.01, 0, 0.9), color='ink', bev=0.03),
         box('shield', (0.1, 0.6, 0.7), loc=(R + 0.08, 0, 1.9), color='police', bev=0.15)]
    for k in range(12):  # stripes + scallops
        a = k * math.tau / 12
        c, sn = math.cos(a), math.sin(a)
        p.append(box(f'str{k}', (0.1, 0.55, H - 0.1), loc=(c * (R + 0.02), sn * (R + 0.02), H / 2), color='red', bev=0, seg=1, rot=(0, 0, a)))
        p.append(sphere(f'sc{k}', 0.34, loc=(c * (R + 0.3), sn * (R + 0.3), H - 0.05), color=('butter', 'red')[k % 2], seg=8, scale=(0.4, 1, 0.8)))
        if k % 3 == 0:
            p.append(tube(f'guy{k}', (c * (R + 0.3), sn * (R + 0.3), H + 0.1), (c * (R + 1.6), sn * (R + 1.6), 0.05), r=0.02, color='cream', seg=4))
    return finish(tag(join(p, 'pavilion'), 'region'))
