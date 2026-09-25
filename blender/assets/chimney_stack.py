"""Region pack: a tall mill chimney (45 m) of banded brick with a corbelled crown, lightning conductor,
iron hoops and a square base. Topples into the hole like a tree."""
from kit import *


def build():
    H = 44.0
    p = [box('base', (6.0, 6.0, 5.0), loc=(0, 0, 2.5), color='brick_wall', bev=0.2),
         box('basecap', (6.6, 6.6, 0.6), loc=(0, 0, 5.1), color='sand', bev=0.1, seg=2),
         cyl('shaft', 2.4, H - 5.0, loc=(0, 0, 5.2), color='brick_wall', seg=24, bev=0.1, r2=1.6),
         cyl('crown', 2.3, 1.6, loc=(0, 0, H), color='brick_wall', seg=24, bev=0.2, r2=2.5),
         cyl('rim', 2.6, 0.4, loc=(0, 0, H + 1.5), color='ink', seg=24, bev=0.08),
         cyl('mouth', 1.9, 0.1, loc=(0, 0, H + 1.85), color='ink', seg=24, bev=0),
         tube('rod', (2.4, 0, 5.2), (1.9, 0, H + 3.5), r=0.05, color='copper', seg=6),
         box('door', (0.2, 1.4, 2.2), loc=(3.02, 0, 1.1), color='ink', bev=0.04)]
    for k in range(8):
        z = 9 + k * 4.5
        rr = 2.4 - (z - 5.2) / (H - 5.2) * 0.8
        p.append(torus(f'hoop{k}', rr + 0.03, 0.07, loc=(0, 0, z), color='ink', seg=24, rseg=4))
    for k in range(3):
        z = 16 + k * 10
        rr = 2.4 - (z - 5.2) / (H - 5.2) * 0.8
        p.append(cyl(f'band{k}', rr + 0.05, 1.0, loc=(0, 0, z), color='cream', seg=24, bev=0.03, r2=rr - 0.02))
    return finish(tag(join(p, 'chimney_stack'), 'region'))
