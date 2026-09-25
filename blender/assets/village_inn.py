"""Region pack: the village inn. Two storeys of brick with a jettied timber-framed upper floor, bay windows,
a hanging pub sign, hanging baskets, picnic benches and parasols out front."""
from kit import *


def build():
    D, W = 6.0, 10.0
    p = [box('ground', (D, W, 3.2), loc=(0, 0, 1.6), color='brick_wall', bev=0.12),
         box('upper', (D + 0.6, W + 0.4, 2.9), loc=(0.3, 0, 4.65), color='cream', bev=0.12),
         box('plinth', (D + 0.2, W + 0.2, 0.35), loc=(0, 0, 0.17), color='concrete', bev=0.08),
         prism('roof', D + 1.6, W + 0.8, 3.4, loc=(0.3, 0, 6.05), color='roof_tile', bev=0.12, rot=(0, 0, math.pi / 2))]
    for y in (-4.8, -3.0, -1.2, 1.2, 3.0, 4.8):  # timber framing on the jetty
        p.append(box(f'post{y}', (0.1, 0.18, 2.9), loc=(D / 2 + 0.62, y, 4.65), color='ink', bev=0.03, seg=1))
    for z in (3.3, 6.0):
        p.append(box(f'rail{z}', (0.1, W + 0.4, 0.2), loc=(D / 2 + 0.62, 0, z), color='ink', bev=0.03, seg=1))
    for k, y in enumerate((-3.9, -2.1, 2.1, 3.9)):
        p.append(box(f'brc{k}', (0.1, 1.5, 0.16), loc=(D / 2 + 0.62, y, 4.65), color='ink', bev=0.03, seg=1, rot=(0.7 * (1 if k % 2 else -1), 0, 0)))
    for y in (-3.0, 3.0):  # ground-floor bays
        p += [box(f'bay{y}', (0.8, 2.4, 1.6), loc=(D / 2 + 0.4, y, 1.6), color='glow', bev=0.1),
              box(f'baytop{y}', (1.0, 2.6, 0.25), loc=(D / 2 + 0.45, y, 2.5), color='white', bev=0.06),
              box(f'baysill{y}', (1.0, 2.6, 0.25), loc=(D / 2 + 0.45, y, 0.7), color='white', bev=0.06)]
        for k in (-0.8, 0, 0.8):
            p.append(box(f'mull{y}{k}', (0.84, 0.08, 1.6), loc=(D / 2 + 0.41, y + k, 1.6), color='white', bev=0, seg=1))
    p += window_grid(D / 2 + 0.64, 0, 4.7, 0.9, 1.0, 3, 1, 1.9, 0, '+x', frame='white')
    p += window_grid(-D / 2 - 0.02, 0, 1.7, 0.9, 1.1, 3, 2, 1.6, 1.8, '-x', frame='white')
    p += [box('door', (0.14, 1.3, 2.2), loc=(D / 2 + 0.05, 0, 1.3), color='navy', bev=0.05),
          box('fascia', (0.12, 3.4, 0.5), loc=(D / 2 + 0.08, 0, 2.85), color='forest', bev=0.04),
          box('fasciatxt', (0.13, 2.8, 0.2), loc=(D / 2 + 0.1, 0, 2.85), color='gold', bev=0.02, seg=1)]
    for s in (-1, 1):
        p += [box(f'chim{s}', (1.0, 1.0, 2.6), loc=(0.3, s * (W / 2 - 0.2), 8.2), color='brick_wall', bev=0.08),
              box(f'chimcap{s}', (1.2, 1.2, 0.16), loc=(0.3, s * (W / 2 - 0.2), 9.5), color='ink', bev=0.04)]
    # pub sign on a bracket
    p += [tube('bracket', (D / 2 + 0.6, W / 2 - 0.4, 3.9), (D / 2 + 2.0, W / 2 - 0.4, 3.9), r=0.06, color='ink', seg=8),
          box('sign', (1.1, 0.1, 1.3), loc=(D / 2 + 1.5, W / 2 - 0.4, 3.1), color='red', bev=0.05),
          box('signart', (0.8, 0.12, 0.9), loc=(D / 2 + 1.5, W / 2 - 0.4, 3.1), color='butter', bev=0.03)]
    for y in (-4.6, -1.6, 1.6, 4.6):  # hanging baskets
        p.append(blob(f'basket{y}', 0.35, (D / 2 + 0.5, y, 2.7), ('pink', 'hot_pink', 'butter', 'red')[int(y) % 4], seed=int(y * 10), amp=0.25, seg=10))
    for k, y in enumerate((-3.5, 0.0, 3.5)):  # beer garden
        x = D / 2 + 3.2
        p += [box(f'tbl{k}', (1.0, 1.8, 0.1), loc=(x, y, 0.75), color='wood', bev=0.03),
              box(f'bn1{k}', (0.35, 1.8, 0.08), loc=(x - 0.8, y, 0.45), color='wood', bev=0.02),
              box(f'bn2{k}', (0.35, 1.8, 0.08), loc=(x + 0.8, y, 0.45), color='wood', bev=0.02),
              box(f'leg{k}', (1.9, 0.12, 0.12), loc=(x, y - 0.7, 0.4), color='wood', bev=0.02, rot=(0, 0.5, 0)),
              box(f'leg2{k}', (1.9, 0.12, 0.12), loc=(x, y + 0.7, 0.4), color='wood', bev=0.02, rot=(0, -0.5, 0)),
              cyl(f'pole{k}', 0.04, 2.4, loc=(x, y, 0.8), color='white', seg=8, bev=0),
              lathe(f'para{k}', [(0, 0), (1.3, 0), (0, 0.55)], loc=(x, y, 2.6), color=('red', 'forest', 'navy')[k], seg=8)]
    return finish(tag(join(p, 'village_inn'), 'region'))
