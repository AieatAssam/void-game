"""Hoopla stall: candy-striped awning, bulb-lit fascia, back wall of prize shelves (teddies, ducks, goldfish
bags), a peg board on the counter with thrown hoops, and a bucket of spare rings."""
from kit import *


def build():
    W, D, H = 3.0, 1.6, 2.4
    p = [box('floor', (D, W, 0.15), loc=(0, 0, 0.075), color='wood', bev=0.03),
         box('back', (0.12, W, H), loc=(-D / 2, 0, H / 2 + 0.15), color='butter', bev=0.04),
         box('counter', (0.45, W, 0.95), loc=(D / 2 - 0.2, 0, 0.62), color='red', bev=0.05),
         box('counter_top', (0.55, W + 0.1, 0.06), loc=(D / 2 - 0.2, 0, 1.12), color='wood', bev=0.02),
         box('fascia', (0.1, W + 0.2, 0.35), loc=(D / 2 + 0.05, 0, H + 0.1), color='navy', bev=0.03)]
    for s in (-1, 1):
        p += [box(f'side{s}', (D, 0.1, H), loc=(0, s * W / 2, H / 2 + 0.15), color='red', bev=0.03),
              cyl(f'post{s}', 0.06, H + 0.3, loc=(D / 2 + 0.05, s * (W / 2 + 0.05), 0), color='butter', seg=10, bev=0.01)]
    for k in range(10):  # counter stripes
        p.append(box(f'cstr{k}', (0.02, 0.14, 0.9), loc=(D / 2 + 0.03, -W / 2 + 0.15 + k * 0.3, 0.62), color='white', bev=0.005, seg=1))
    for k in range(10):  # awning: alternating sloped slats with a scalloped lip
        y = -W / 2 + (k + 0.5) * W / 10
        p += [box(f'awn{k}', (1.3, W / 10 + 0.01, 0.04), loc=(D / 2 + 0.35, y, H + 0.45), color='red' if k % 2 else 'white', bev=0.01, seg=1, rot=(0, 0.35, 0)),
              sphere(f'lip{k}', 0.16, loc=(D / 2 + 0.95, y, H + 0.2), color='red' if k % 2 else 'white', seg=10, scale=(0.4, 1, 0.8))]
    for k in range(16):  # bulbs along the fascia
        p.append(sphere(f'bulb{k}', 0.045, loc=(D / 2 + 0.11, -W / 2 + 0.1 + k * (W - 0.2) / 15, H + 0.1), color=('glow', 'warn')[k % 2], seg=6))
    # prize shelves with teddies, rubber ducks and goldfish bags
    for r, z in enumerate((0.95, 1.55, 2.1)):
        p.append(box(f'shelf{r}', (0.35, W - 0.2, 0.05), loc=(-D / 2 + 0.24, 0, z), color='wood', bev=0.01))
        for i in range(6):
            y = -W / 2 + 0.35 + i * (W - 0.7) / 5
            kind = (r + i) % 3
            if kind == 0:  # teddy
                c = ('peach', 'pink', 'sky', 'butter')[i % 4]
                p += [blob(f'ted{r}{i}', 0.13, (-D / 2 + 0.25, y, z + 0.15), c, seed=r * 9 + i, amp=0.1),
                      sphere(f'tedh{r}{i}', 0.1, loc=(-D / 2 + 0.25, y, z + 0.34), color=c, seg=12),
                      sphere(f'tede{r}{i}a', 0.04, loc=(-D / 2 + 0.25, y - 0.07, z + 0.43), color=c, seg=6),
                      sphere(f'tede{r}{i}b', 0.04, loc=(-D / 2 + 0.25, y + 0.07, z + 0.43), color=c, seg=6),
                      sphere(f'tedn{r}{i}', 0.025, loc=(-D / 2 + 0.34, y, z + 0.33), color='ink', seg=6)]
            elif kind == 1:  # rubber duck
                p += [sphere(f'duck{r}{i}', 0.1, loc=(-D / 2 + 0.25, y, z + 0.1), color='hazard', seg=12, scale=(1.3, 1, 0.9)),
                      sphere(f'duckh{r}{i}', 0.07, loc=(-D / 2 + 0.33, y, z + 0.22), color='hazard', seg=10),
                      sphere(f'duckb{r}{i}', 0.035, loc=(-D / 2 + 0.4, y, z + 0.21), color='warn', seg=6, scale=(1.4, 1, 0.5))]
            else:  # goldfish in a bag
                p += [sphere(f'bag{r}{i}', 0.11, loc=(-D / 2 + 0.25, y, z + 0.13), color='glass', seg=12, scale=(1, 1, 1.2)),
                      sphere(f'fish{r}{i}', 0.04, loc=(-D / 2 + 0.26, y, z + 0.12), color='warn', seg=8, scale=(1.6, 0.6, 1)),
                      cyl(f'tie{r}{i}', 0.02, 0.06, loc=(-D / 2 + 0.25, y, z + 0.26), color='red', seg=6, bev=0)]
    # peg board + hoops on the counter
    for i in range(5):
        for j in range(2):
            x, y = D / 2 - 0.3 + j * 0.2, -1.0 + i * 0.5
            p.append(cyl(f'peg{i}{j}', 0.03, 0.2, loc=(x, y, 1.15), color='white', seg=8, bev=0.01))
            if (i + j) % 3 == 0:
                p.append(torus(f'hoop{i}{j}', 0.09, 0.012, loc=(x, y, 1.19 + 0.02 * j), color=('hot_pink', 'toxic', 'sky')[i % 3], seg=16, rseg=5, rot=(0.2, 0.1, 0)))
    p += [cyl('bucket', 0.14, 0.2, loc=(D / 2 - 0.25, 1.2, 1.15), color='sky', seg=14, bev=0.02, r2=0.17)]
    for k in range(4):
        p.append(torus(f'spare{k}', 0.09, 0.012, loc=(D / 2 - 0.25, 1.2, 1.3 + k * 0.025), color=('hot_pink', 'toxic', 'sky', 'butter')[k], seg=16, rseg=5, rot=(0.3 * (k - 1.5), 0, 0)))
    return tag(finish(join(p, 'hoopla_stall'), mass=2), 'fair')
