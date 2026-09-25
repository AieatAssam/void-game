"""Region pack: a trio of corrugated grain silos with conical caps, a catwalk, a ladder cage and an auger."""
from kit import *


def build():
    p = []
    spots = ((0, -2.2, 3.2, 11.0), (0, 2.2, 3.2, 11.0), (-4.2, 0, 2.4, 8.5))
    for k, (x, y, r, h) in enumerate(spots):
        p += [cyl(f'silo{k}', r, h, loc=(x, y, 0), color='concrete', seg=32, bev=0.08),
              lathe(f'cap{k}', [(0, 0), (r + 0.15, 0), (0.35, 1.7), (0, 1.8)], loc=(x, y, h), color='chrome', seg=32),
              cyl(f'base{k}', r + 0.2, 0.5, loc=(x, y, 0), color='concrete', seg=32, bev=0.08)]
        for j in range(int(h / 2.2)):  # stiffener bands
            p.append(cyl(f'rib{k}{j}', r + 0.06, 0.14, loc=(x, y, 1.4 + j * 2.2), color='white', seg=32, bev=0.03))
        p.append(box(f'hatch{k}', (0.6, 0.06, 0.8), loc=(x, y - r - 0.02, 0.9), color='asphalt_lt', bev=0.03))
    # catwalk across the tops + ladder
    p += [box('walk', (1.0, 7.0, 0.12), loc=(0, 0, 12.6), color='hazard', bev=0.03),
          box('rail1', (0.05, 7.0, 0.05), loc=(0.5, 0, 13.4), color='hazard', bev=0, seg=1),
          box('rail2', (0.05, 7.0, 0.05), loc=(-0.5, 0, 13.4), color='hazard', bev=0, seg=1)]
    for k in range(8):
        p.append(box(f'stan{k}', (1.0, 0.05, 0.8), loc=(0, -3.3 + k * 0.95, 13.0), color='hazard', bev=0, seg=1))
    for k in range(20):
        p.append(box(f'rung{k}', (0.05, 0.6, 0.05), loc=(3.25, -2.2, 0.5 + k * 0.55), color='steel', bev=0, seg=1))
    for s in (-1, 1):
        p.append(box(f'lad{s}', (0.06, 0.06, 11.5), loc=(3.25, -2.2 + s * 0.3, 5.75), color='steel', bev=0, seg=1))
    p += [tube('auger', (5.5, 3.5, 0.5), (1.5, 2.2, 11.3), r=0.3, color='red', seg=16),
          box('hopper', (1.2, 1.2, 1.0), loc=(5.6, 3.5, 0.5), color='red', bev=0.08)]
    return finish(tag(join(p, 'grain_silo'), 'region'))
