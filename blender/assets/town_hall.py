"""Region pack: the Victorian town hall. A symmetrical brick-and-stone palace with a pedimented portico of
columns, rows of tall windows, a copper-green mansard, and a tall central clock tower with a lantern spire."""
from kit import *


def build():
    D, W, H = 14.0, 24.0, 12.0
    p = [box('body', (D, W, H), loc=(0, 0, H / 2), color='brick_wall', bev=0.18),
         box('plinth', (D + 0.4, W + 0.4, 1.6), loc=(0, 0, 0.8), color='sand', bev=0.1, seg=2),
         box('cornice', (D + 0.8, W + 0.8, 0.6), loc=(0, 0, H), color='sand', bev=0.12, seg=2),
         box('mansard', (D - 0.4, W - 0.4, 3.2), loc=(0, 0, H + 1.9), color='teal', bev=0.8, seg=2),
         box('band', (D + 0.2, W + 0.2, 0.35), loc=(0, 0, 6.2), color='sand', bev=0.06, seg=1)]
    for sy in (-1, 1):  # corner quoins + end pavilions
        for sx in (-1, 1):
            for k in range(6):
                p.append(box(f'quoin{sx}{sy}{k}', (0.9, 0.9, 0.7), loc=(sx * (D / 2 + 0.05), sy * (W / 2 + 0.05), 2.2 + k * 1.6), color='sand', bev=0.08, seg=1))
        p += [box(f'pav{sy}', (D + 1.0, 5.0, H + 1.5), loc=(0.5, sy * (W / 2 - 2.5), (H + 1.5) / 2), color='brick_wall', bev=0.18),
              lathe(f'pavroof{sy}', [(0, 0), (4.4, 0), (0.1, 3.6), (0, 3.6)], loc=(0.5, sy * (W / 2 - 2.5), H + 1.5), color='teal', seg=4, rot=(0, 0, math.pi / 4))]
    # portico: steps, 6 columns, pediment
    px = D / 2 + 2.5
    p += [box('steps', (5.0, 11.0, 1.6), loc=(D / 2 + 2.5, 0, 0.8), color='sand', bev=0.08, seg=2),
          box('entab', (4.0, 11.0, 1.2), loc=(px, 0, 9.6), color='sand', bev=0.1, seg=2),
          prism('pedi', 11.4, 4.2, 2.8, loc=(px, 0, 10.2), color='sand', bev=0.1, rot=(0, 0, 0)),
          box('door', (0.2, 3.0, 4.2), loc=(D / 2 + 0.05, 0, 3.7), color='navy', bev=0.06, seg=2)]
    for k in range(6):
        y = -4.5 + k * 1.8
        p += [cyl(f'col{k}', 0.45, 7.4, loc=(px + 1.2, y, 1.6), color='white', seg=16, bev=0.05),
              box(f'cap{k}', (1.1, 1.1, 0.4), loc=(px + 1.2, y, 9.1), color='white', bev=0.06, seg=1)]
    for face, c0 in (('+x', D / 2 + 0.02), ('-x', -D / 2 - 0.02)):
        for sy in (-1, 1):
            p += window_grid(c0, sy * 7.2, 3.6, 1.1, 2.2, 3, 2, 1.5, 3.8, face, frame='white')
    for sy in (-1, 1):
        p += window_grid(0, sy * (W / 2 + 0.02), 3.6, 1.1, 2.2, 3, 2, 2.2, 3.8, '+y' if sy > 0 else '-y', frame='white')
    # central clock tower
    T = 5.0
    p += [box('tower', (T, T, 16.0), loc=(0, 0, H + 8.0), color='brick_wall', bev=0.15),
          box('tbelt', (T + 0.6, T + 0.6, 0.5), loc=(0, 0, H + 11.0), color='sand', bev=0.08, seg=2),
          box('tcrown', (T + 0.8, T + 0.8, 0.8), loc=(0, 0, H + 16.2), color='sand', bev=0.1, seg=2),
          box('lantern', (3.0, 3.0, 3.4), loc=(0, 0, H + 18.3), color='white', bev=0.12, seg=2),
          lathe('spire', [(0, 0), (2.4, 0), (0.1, 6.5), (0, 6.5)], loc=(0, 0, H + 20.0), color='teal', seg=8, rot=(0, 0, math.pi / 8)),
          sphere('orb', 0.35, loc=(0, 0, H + 26.7), color='gold', seg=12)]
    for k in range(4):
        a = k * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        p += [cyl(f'dial{k}', 1.6, 0.14, loc=(c * (T / 2 + 0.05), s * (T / 2 + 0.05), H + 13.4), color='white', seg=28, rot=(0, math.pi / 2, a), bev=0.03),
              torus(f'dring{k}', 1.6, 0.1, loc=(c * (T / 2 + 0.14), s * (T / 2 + 0.14), H + 13.4), color='gold', seg=28, rseg=6, rot=(0, math.pi / 2, a)),
              box(f'hh{k}', (0.08, 0.14, 1.0), loc=(c * (T / 2 + 0.2), s * (T / 2 + 0.2), H + 13.8), color='ink', bev=0.02, seg=1, rot=(0, 0, a)),
              box(f'lwin{k}', (0.1, 1.4, 2.2), loc=(c * 1.52, s * 1.52, H + 18.3), color='glow', bev=0.03, seg=1, rot=(0, 0, a))]
    p += [cyl('pole', 0.08, 4.0, loc=(px + 1.2, 0, 12.0), color='ink', seg=8, bev=0),
          box('flag', (0.06, 2.2, 1.4), loc=(px + 1.2, 1.15, 15.2), color='police', bev=0.03)]
    return finish(tag(join(p, 'town_hall'), 'region'))
