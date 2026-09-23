from kit import *


def build():
    W, D, F, FH = 16.0, 10.0, 7, 3.1
    H = F * FH
    p = [box('walls', (D, W, H), loc=(0, 0, H / 2), color='butter', bev=0.25),
         box('base', (D + 0.4, W + 0.4, 4.0), loc=(0, 0, 2.0), color='white', bev=0.2),
         box('parapet', (D + 0.5, W + 0.5, 0.6), loc=(0, 0, H + 0.1), color='white', bev=0.15),
         box('roof', (D - 0.5, W - 0.5, 0.1), loc=(0, 0, H + 0.2), color='concrete', bev=0.02),
         box('sign', (1.0, 10.0, 2.2), loc=(0, 0, H + 1.7), color='red', bev=0.2),
         box('signface', (1.1, 9.0, 1.4), loc=(0, 0, H + 1.7), color='glow', bev=0.1),
         box('entry', (0.3, 4.0, 3.0), loc=(D / 2 + 0.2, 0, 1.5), color='glow', bev=0.08),
         box('canopy', (2.8, 5.0, 0.3), loc=(D / 2 + 1.2, 0, 3.4), color='red', bev=0.1)]
    for y in (-2.2, 2.2):
        p.append(cyl(f'pillar{y}', 0.12, 3.3, loc=(D / 2 + 2.3, y, 0), color='hazard', seg=10, bev=0.02))
    # pool on the roof
    p += [box('pooledge', (5.0, 7.0, 0.4), loc=(-1.5, -2.5, H + 0.3), color='white', bev=0.1),
          box('pool', (4.4, 6.4, 0.1), loc=(-1.5, -2.5, H + 0.51), color='teal', bev=0.02)]
    for i in range(3):
        p.append(box(f'lounger{i}', (1.4, 0.5, 0.2), loc=(-1.0, 2.2 + i * 1.0, H + 0.35), color=('pink', 'sky', 'mint')[i], bev=0.06))
    for j in range(1, F):
        z = j * FH + 1.6
        p += window_grid(D / 2, 0, z, 1.1, 1.3, 7, 1, 0.9, 0, '+x', frame='white')
        p += window_grid(-D / 2, 0, z, 1.1, 1.3, 7, 1, 0.9, 0, '-x', frame='white')
        p += window_grid(0, W / 2, z, 1.1, 1.3, 4, 1, 0.9, 0, '+y', frame='white')
        p += window_grid(0, -W / 2, z, 1.1, 1.3, 4, 1, 0.9, 0, '-y', frame='white')
    return finish(join(p, 'hotel'))
