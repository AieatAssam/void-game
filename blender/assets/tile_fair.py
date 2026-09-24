"""Ground tile: fairground. Trodden dirt with a looping sawdust promenade, painted ride pads (ferris wheel NW,
carousel SE, stalls along the loop), duckboards, dropped confetti and a festoon of bulbs strung between
two masts. Rides and stalls are placed by the game (see HANDOVER.md for anchor points)."""
from kit import *


def build():
    p = tile_base()

    def ground(i, j):
        x, y = i - 13.5, j - 13.5
        r = math.hypot(x, y)
        if 8.2 < r < 10.8:  # the promenade loop
            return 'sand'
        if abs(x) < 1.4 or abs(y) < 1.4:
            return 'sand'
        return 'dirt'
    p.append(grid('ground', 28, 28, 28, 28, z=0.17, color_fn=ground))
    # ride pads: concrete rounds with a painted safety ring
    for k, (x, y, r) in enumerate(((-7.5, 7.5, 5.2), (7.5, -7.5, 4.4))):
        p += [cyl(f'pad{k}', r, 0.06, loc=(x, y, 0.16), color='concrete', seg=48, bev=0.02),
              torus(f'padring{k}', r - 0.35, 0.08, loc=(x, y, 0.22), color='hazard', seg=48, rseg=4)]
        for i in range(12):  # hazard chevrons
            a = i * math.pi / 6
            p.append(box(f'chev{k}{i}', (0.5, 0.18, 0.012), loc=(x + math.cos(a) * (r - 0.9), y + math.sin(a) * (r - 0.9), 0.225), color='ink', bev=0, seg=1, rot=(0, 0, a)))
    # duckboards over the muddy corners
    for k, (x, y, a) in enumerate(((9.5, 9.0, 0.3), (-9.5, -9.2, -0.4))):
        for i in range(7):
            p.append(box(f'duck{k}{i}', (0.22, 1.6, 0.06), loc=(x + math.cos(a) * (i - 3) * 0.3, y + math.sin(a) * (i - 3) * 0.3, 0.2), color='wood', bev=0.02, seg=1, rot=(0, 0, a)))
    # confetti + dropped tickets scattered along the promenade
    import random
    rnd = random.Random(4)
    for i in range(60):
        a, d = rnd.random() * 6.283, 8.4 + rnd.random() * 2.2
        p.append(box(f'conf{i}', (0.08, 0.05, 0.006), loc=(math.cos(a) * d, math.sin(a) * d, 0.176), color=rnd.choice(('red', 'butter', 'sky', 'pink', 'mint', 'white')),
                     bev=0, seg=1, rot=(0, 0, rnd.random() * 3)))
    # festoon lights between two corner masts
    masts = ((-12.5, -12.5), (12.5, 12.5))
    for k, (x, y) in enumerate(masts):
        p += [cyl(f'mast{k}', 0.14, 6.5, loc=(x, y, 0.17), color='red', seg=12, bev=0.03),
              sphere(f'mast_top{k}', 0.22, loc=(x, y, 6.75), color='gold', seg=12),
              cyl(f'mast_foot{k}', 0.4, 0.2, loc=(x, y, 0.17), color='ink', seg=16, bev=0.05)]
    a, b = Vector((masts[0][0], masts[0][1], 6.4)), Vector((masts[1][0], masts[1][1], 6.4))
    p += rope('festoon', a, b, sag=1.6, r=0.02, color='ink', segs=12)
    for i in range(1, 30):
        t = i / 30
        c = a.lerp(b, t)
        c.z -= 1.6 * 4 * t * (1 - t)
        p += [cyl(f'sock{i}', 0.03, 0.08, loc=(c.x, c.y, c.z - 0.09), color='ink', seg=6, bev=0),
              sphere(f'bulb{i}', 0.09, loc=(c.x, c.y, c.z - 0.16), color=('glow', 'warn', 'glow', 'siren_red')[i % 4], seg=8, scale=(1, 1, 1.2))]
    return tag(finish(join(p, 'tile_fair'), tier=20, mass=0, kind='tile'), 'fair')
