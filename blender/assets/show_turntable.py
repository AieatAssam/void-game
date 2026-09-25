"""Car-show turntable: black gloss podium with chrome edge and an LED ring; the top plate spins
(clip 'turn') under the showcased car. Velvet-rope stanchions and a spotlight tower around it."""
from kit import *


def build():
    p = [cyl('plinth', 3.1, 0.28, color='gloss_black', seg=64, bev=0.06),
         torus('edge', 3.1, 0.05, loc=(0, 0, 0.26), color='chrome', seg=64, rseg=8),
         torus('led', 3.14, 0.03, loc=(0, 0, 0.12), color='lilac', seg=64, rseg=6),
         cyl('step', 3.4, 0.08, color='gloss_black', seg=64, bev=0.03)]
    for k in range(8):  # velvet-rope stanchions
        a = k * math.pi / 4 + math.pi / 8
        x, y = math.cos(a) * 4.0, math.sin(a) * 4.0
        p += [cyl(f'post_base{k}', 0.22, 0.05, loc=(x, y, 0), color='chrome', seg=20, bev=0.02),
              cyl(f'post{k}', 0.04, 0.9, loc=(x, y, 0.05), color='chrome', seg=12, bev=0.01),
              sphere(f'post_top{k}', 0.07, loc=(x, y, 0.98), color='gold', seg=12)]
        if k not in (1, 2):  # leave a gap at the front for visitors
            b = (k + 1) * math.pi / 4 + math.pi / 8
            p += rope(f'velvet{k}', (x, y, 0.9), (math.cos(b) * 4.0, math.sin(b) * 4.0, 0.9), sag=0.22, r=0.03, color='red', segs=6)
    for s in (-1, 1):  # spotlight towers
        x, y = s * 4.6, -2.6
        p += [cyl(f'tower{s}', 0.07, 3.2, loc=(x, y, 0), color='steel', seg=12, bev=0.01),
              cyl(f'tbase{s}', 0.35, 0.08, loc=(x, y, 0), color='gloss_black', seg=16, bev=0.02),
              cyl(f'lamp{s}', 0.22, 0.4, loc=(x, y, 3.1), color='gloss_black', seg=16, bev=0.04, rot=(0.7, -s * 0.6, 0)),
              sphere(f'lens{s}', 0.18, loc=(x - s * 0.18, y + 0.22, 3.25), color='glow_white', seg=14, scale=(1, 1, 0.4), rot=(0.7, -s * 0.6, 0))]
    root = join(p, 'show_turntable')
    top = join([cyl('plate', 2.9, 0.08, color='concrete', seg=64, bev=0.02),
                torus('plate_ring', 2.4, 0.03, loc=(0, 0, 0.08), color='chrome', seg=64, rseg=6)] +
               [box(f'tread{k}', (2.2, 0.08, 0.012), loc=(math.cos(k * math.pi / 6) * 1.2, math.sin(k * math.pi / 6) * 1.2, 0.085), color='steel', bev=0, seg=1,
                    rot=(0, 0, k * math.pi / 6)) for k in range(12)], 'turntable_top')
    top.location = (0, 0, 0.28)
    parent(top, root)
    finish(root, mass=4)
    spin(top, 'Z', frames=240, name='turn')
    return tag(root, 'events', event='carshow', clone=True, lod=[0.35, 0.12])
