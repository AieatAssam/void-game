from kit import *


def build():
    W, D, F, FH = 11.0, 9.0, 5, 3.0
    H = F * FH
    p = [box('walls', (D, W, H), loc=(0, 0, H / 2), color='terracotta', bev=0.2),
         box('base', (D + 0.3, W + 0.3, FH), loc=(0, 0, FH / 2), color='clay', bev=0.15),

         box('entry', (0.3, 2.4, 2.6), loc=(D / 2 + 0.1, 0, 1.3), color='glow', bev=0.06),
         box('canopy', (1.4, 3.0, 0.2), loc=(D / 2 + 0.6, 0, 2.8), color='cream', bev=0.06),
         box('ac', (1.4, 1.0, 0.8), loc=(2.0, 3.0, H + 0.6), color='steel', bev=0.1),
         box('stair', (2.0, 2.2, 2.0), loc=(-2.0, -3.2, H + 1.0), color='cream', bev=0.15)]
    p += parapet(D, W, H - 0.05, h=0.55, color='cream') + rooftop(D, W, H - 0.05, seed=5, solar=False)
    # satellite dishes + vent pipes
    for k, (x, y) in enumerate(((3.0, -3.5), (2.2, -1.0))):
        p += [cyl(f'dishpost{k}', 0.05, 0.5, loc=(x, y, H + 0.2), color='steel', seg=8, bev=0),
              lathe(f'dish{k}', [(0.0, 0.0), (0.45, 0.12), (0.5, 0.18), (0.0, 0.05)], loc=(x, y, H + 0.7), color='white', seg=20, rot=(0.6, 0, 0.8))]
    for k in range(3):
        p.append(cyl(f'vent{k}', 0.12, 0.7, loc=(-3.5 + k * 0.5, 4.5, H + 0.2), color='asphalt_lt', seg=10, bev=0.02))
    # rooftop water tower
    p += [cyl(f'leg{i}', 0.08, 1.6, loc=(-2 + (i % 2) * 1.6 - 0.8, 2.6 + (i // 2) * 1.6 - 0.8, H + 0.2), color='ink', seg=8, bev=0) for i in range(4)]
    p += [cyl('tank', 1.1, 2.0, loc=(-2.0, 2.6, H + 1.8), color='clay', seg=24, bev=0.06),
          lathe('tankroof', [(0.0, 0.8), (1.25, 0.0), (0.0, 0.0)], loc=(-2.0, 2.6, H + 3.8), color='ink', seg=24)]
    for j in range(1, F):
        z = j * FH + 1.5
        for face, cx, cy, n, gap in (('+x', D / 2, 0, 4, 1.4), ('-x', -D / 2, 0, 4, 1.4), ('+y', 0, W / 2, 3, 1.4), ('-y', 0, -W / 2, 3, 1.4)):
            p += window_grid(cx, cy, z, 1.0, 1.3, n, 1, gap, 0, face, frame='cream')
        p.append(box(f'balc{j}', (0.9, 3.0, 0.15), loc=(D / 2 + 0.45, 0, j * FH + 0.1), color='cream', bev=0.05))
        p.append(box(f'rail{j}', (0.08, 3.0, 0.9), loc=(D / 2 + 0.86, 0, j * FH + 0.6), color='ink', bev=0.03))
        p.append(box(f'plant{j}', (0.4, 0.4, 0.4), loc=(D / 2 + 0.5, 1.1, j * FH + 0.4), color='forest', bev=0.12))
    p += window_grid(0, W / 2, 1.5, 1.2, 1.4, 3, 1, 1.4, 0, '+y', frame='cream')
    return finish(join(p, 'apartment'))
