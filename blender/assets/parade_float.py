"""Parade float (parade event): a skirted flatbed pulled by a little tractor cab, carrying a giant
three-tier birthday cake with icing drips, candles, sprinkles, bunting and rosettes."""
from kit import *


def build():
    p = []
    L, W, z = 5.2, 2.5, 0.75  # deck size and top height
    # chassis + deck
    p += [box('deck', (L, W, 0.18), loc=(0, 0, z - 0.09), color='white', bev=0.06),
          box('skirt', (L - 0.1, W - 0.1, 0.55), loc=(0, 0, z - 0.45), color='pink', bev=0.08),
          box('deck_trim', (L + 0.08, W + 0.08, 0.06), loc=(0, 0, z - 0.02), color='butter', bev=0.02)]
    p += scallops('scal', 0, 0, L - 0.06, W - 0.06, z - 0.7, r=0.16, color='white')
    for x in (-1.7, 1.7):  # mostly hidden by the skirt: plain tyres are enough
        for s in (-1, 1):
            p += [cyl(f'w{x}{s}', 0.3, 0.22, loc=(x, s * (W / 2 - 0.2) + 0.11, 0.3), color='ink', rot=(math.pi / 2, 0, 0), seg=16, bev=0.05, bseg=1),
                  cyl(f'wh{x}{s}', 0.14, 0.24, loc=(x, s * (W / 2 - 0.2) + 0.12, 0.3), color='chrome', rot=(math.pi / 2, 0, 0), seg=12, bev=0.02, bseg=1)]
    # tractor cab up front
    cx = L / 2 + 1.0
    p += [box('cab', (1.3, 1.6, 1.0), loc=(cx, 0, 0.95), color='butter', bev=0.2),
          box('cab_roof', (1.1, 1.5, 0.12), loc=(cx - 0.1, 0, 1.55), color='white', bev=0.05),
          box('windscreen', (0.05, 1.3, 0.45), loc=(cx + 0.6, 0, 1.2), color='glass', bev=0.03),
          box('grille', (0.06, 0.9, 0.35), loc=(cx + 0.66, 0, 0.72), color='chrome', bev=0.03),
          box('hitch', (1.0, 0.2, 0.12), loc=(L / 2 + 0.2, 0, 0.45), color='steel', bev=0.03),
          cyl('beacon', 0.1, 0.12, loc=(cx - 0.1, 0, 1.61), color='warn', seg=12, bev=0.03)]
    for s in (-1, 1):
        p += wheel(f'cw{s}', 0.36, 0.26, cx + 0.2, s * 0.75)
        p += [sphere(f'lamp{s}', 0.09, loc=(cx + 0.66, s * 0.55, 0.9), color='glow_white', seg=12),
              torus(f'lampring{s}', 0.09, 0.02, loc=(cx + 0.66, s * 0.55, 0.9), color='chrome', seg=14, rseg=5, rot=(0, math.pi / 2, 0))]
    # the cake: three lathed tiers with icing collars, drips and sprinkles
    tiers = [(1.05, 0.55, 'peach'), (0.78, 0.5, 'pink'), (0.52, 0.45, 'mint')]
    zc = z
    for k, (r, h, col) in enumerate(tiers):
        p.append(lathe(f'tier{k}', [(0, zc), (r, zc), (r + 0.02, zc + h * 0.5), (r, zc + h), (0, zc + h)], color=col, seg=32))
        p.append(torus(f'icing{k}', r, 0.06, loc=(0, 0, zc + h), color='white', seg=32, rseg=6))
        p.append(torus(f'base_pipe{k}', r + 0.01, 0.045, loc=(0, 0, zc + 0.03), color='white', seg=32, rseg=5))
        n = 12 + k * -2
        for i in range(n):  # icing drips
            a = i * 2 * math.pi / n + k * 0.3
            p.append(sphere(f'drip{k}_{i}', 0.055, loc=(math.cos(a) * (r + 0.01), math.sin(a) * (r + 0.01), zc + h - 0.1 - (i % 3) * 0.05),
                            color='white', seg=6, scale=(0.6, 0.6, 1.5)))
        for i in range(18):  # sprinkles on the side
            a = i * 2.39996 + k
            zz = zc + 0.1 + ((i * 0.37) % 1) * (h - 0.25)
            p.append(box(f'spr{k}_{i}', (0.012, 0.05, 0.015), loc=(math.cos(a) * (r + 0.015), math.sin(a) * (r + 0.015), zz),
                         color=('butter', 'sky', 'hot_pink', 'white')[i % 4], bev=0, seg=1, rot=(i * 0.7, 0, a)))
        zc += h
    for i in range(5):  # candles with glowing flames
        a = i * 2 * math.pi / 5
        x, y = math.cos(a) * 0.3, math.sin(a) * 0.3
        p += [cyl(f'candle{i}', 0.045, 0.32, loc=(x, y, zc), color=('sky', 'butter', 'pink', 'mint', 'white')[i], seg=12, bev=0.01),
              cyl(f'wick{i}', 0.006, 0.04, loc=(x, y, zc + 0.32), color='ink', seg=5, bev=0),
              sphere(f'flame{i}', 0.04, loc=(x, y, zc + 0.4), color='warn', seg=10, scale=(0.7, 0.7, 1.4)),
              sphere(f'flame_core{i}', 0.02, loc=(x, y, zc + 0.39), color='glow', seg=8, scale=(0.7, 0.7, 1.3))]
    p.append(sphere('cherry', 0.1, loc=(0, 0, zc + 0.08), color='red', seg=16))
    p.append(tube('stalk', (0, 0, zc + 0.17), (0.05, 0.02, zc + 0.3), r=0.012, color='forest'))
    # poles at the deck corners with bunting between, balloons on top
    corners = [(-L / 2 + 0.2, -W / 2 + 0.2), (L / 2 - 0.2, -W / 2 + 0.2), (L / 2 - 0.2, W / 2 - 0.2), (-L / 2 + 0.2, W / 2 - 0.2)]
    for i, (x, y) in enumerate(corners):
        p += [cyl(f'pole{i}', 0.04, 1.6, loc=(x, y, z), color='gold', seg=10, bev=0.01),
              sphere(f'poleball{i}', 0.07, loc=(x, y, z + 1.62), color='gold', seg=10)]
        for j, col in enumerate(('red', 'sky', 'butter')):
            a = j * 2.1 + i
            bx, by = x + math.cos(a) * 0.18, y + math.sin(a) * 0.18
            p += [tube(f'bstr{i}{j}', (x, y, z + 1.62), (bx, by, z + 2.1), r=0.004, color='white'),
                  sphere(f'bal{i}{j}', 0.16, loc=(bx, by, z + 2.25), color=col, seg=12, scale=(1, 1, 1.18)),
                  sphere(f'balshine{i}{j}', 0.03, loc=(bx + 0.07, by - 0.05, z + 2.35), color='glow_white', seg=6)]
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        p += bunting(f'bunt{i}', (a[0], a[1], z + 1.5), (b[0], b[1], z + 1.5), n=10 if i % 2 == 0 else 5, sag=0.3, size=0.2)
    for i, x in enumerate((-2.0, -0.9, 0.9, 2.0)):  # rosettes on the skirt
        for s in (-1, 1):
            p += [cyl(f'ros{i}{s}', 0.16, 0.03, loc=(x, s * (W / 2 - 0.03), z - 0.35), color='butter', seg=16, bev=0.01, rot=(s * math.pi / 2, 0, 0)),
                  sphere(f'roscore{i}{s}', 0.07, loc=(x, s * (W / 2 + 0.01), z - 0.35), color='red', seg=10)]
    return tag(finish(join(p, 'parade_float'), mass=10), 'events', event='parade', mover='parade', lod=[0.35, 0.12])
