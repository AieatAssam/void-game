"""Region pack: a Victorian terrace of four townhouses. Brick fronts with stucco bay windows, painted doors
with fanlights, a slate roof with a party-wall chimney stack between each house, dormers and front railings.
The market town's streets are lined with these (a recoloured variant gives cream stucco terraces)."""
from kit import *


def build(variant=0):
    N, Wh, D, H = 4, 5.0, 8.0, 7.2
    L = N * Wh
    wall = ('brick_wall', 'cream')[variant]
    p = [box('body', (D, L, H), loc=(0, 0, H / 2), color=wall, bev=0.14),
         box('plinth', (D + 0.2, L + 0.2, 0.6), loc=(0, 0, 0.3), color='concrete', bev=0.08, seg=2),
         box('cornice', (D + 0.5, L + 0.3, 0.35), loc=(0, 0, H), color='white', bev=0.08, seg=2),
         prism('roof', D + 0.4, L + 0.2, 3.2, loc=(0, 0, H + 0.15), color='asphalt_lt', bev=0.1, rot=(0, 0, math.pi / 2)),
         box('band', (D + 0.15, L + 0.15, 0.22), loc=(0, 0, 3.6), color='white', bev=0.05, seg=1)]
    for i in range(N):
        y = -L / 2 + Wh * (i + 0.5)
        col = ('navy', 'red', 'forest', 'butter')[(i + variant) % 4]
        # bay window (ground + first floor)
        p += [box(f'bay{i}', (1.0, 2.4, 5.2), loc=(D / 2 + 0.5, y - 0.9, 2.9), color='white', bev=0.1, seg=2),
              box(f'baycap{i}', (1.3, 2.7, 0.3), loc=(D / 2 + 0.55, y - 0.9, 5.6), color='white', bev=0.08, seg=1)]
        for z in (2.0, 4.6):
            p.append(box(f'bayw{i}{z}', (0.1, 1.8, 1.5), loc=(D / 2 + 1.02, y - 0.9, z), color='glow', bev=0.03, seg=1))
        p += [box(f'door{i}', (0.12, 1.0, 2.2), loc=(D / 2 + 0.05, y + 1.4, 1.7), color=col, bev=0.04, seg=2),
              cyl(f'fan{i}', 0.5, 0.12, loc=(D / 2 + 0.06, y + 1.4, 2.8), color='glass', seg=16, rot=(0, math.pi / 2, 0), bev=0),
              box(f'steps{i}', (1.0, 1.2, 0.6), loc=(D / 2 + 0.5, y + 1.4, 0.3), color='white', bev=0.05, seg=1),
              box(f'w2{i}', (0.1, 0.9, 1.5), loc=(D / 2 + 0.03, y + 1.4, 4.7), color='glow', bev=0.03, seg=1),
              box(f'dorm{i}', (1.6, 1.6, 1.4), loc=(D / 4 + 0.4, y, H + 1.0), color=wall, bev=0.08, seg=2),
              prism(f'dormr{i}', 1.9, 1.8, 0.7, loc=(D / 4 + 0.4, y, H + 1.7), color='asphalt_lt', bev=0.04, rot=(0, 0, 0)),
              box(f'dormw{i}', (0.1, 1.0, 0.9), loc=(D / 4 + 1.22, y, H + 1.0), color='glow', bev=0.03, seg=1)]
        for k in range(8):  # front railings
            p.append(box(f'rail{i}{k}', (0.05, 0.05, 1.0), loc=(D / 2 + 1.6, y - 2.3 + k * 0.4, 0.5), color='ink', bev=0, seg=1))
        p.append(box(f'railtop{i}', (0.08, 3.0, 0.06), loc=(D / 2 + 1.6, y - 0.9, 1.0), color='ink', bev=0, seg=1))
        # party-wall chimney stack with pots
        if i:
            yy = -L / 2 + Wh * i
            p += [box(f'stack{i}', (1.4, 0.9, 2.6), loc=(0, yy, H + 2.8), color='brick_wall', bev=0.06, seg=2),
                  box(f'stackc{i}', (1.6, 1.1, 0.14), loc=(0, yy, H + 4.1), color='white', bev=0.03, seg=1)]
            for k in (-0.4, 0, 0.4):
                p.append(cyl(f'pot{i}{k}', 0.12, 0.4, loc=(k, yy, H + 4.15), color='terracotta', seg=10, bev=0.02))
    p += window_grid(-D / 2 - 0.02, 0, 2.0, 0.9, 1.4, 8, 2, 1.55, 1.2, '-x', frame='white')
    root = join(p, 'townhouse_row' if not variant else 'townhouse_row_b')
    return finish(tag(root, 'region'))
