"""Ferris wheel (fairground landmark, ~16 m): twin lit rims with spokes and cross-braces on an A-frame,
12 gondolas that stay level while the wheel turns (clip 'wheel' + counter-rotating 'gondN' clips),
a boarding platform with steps, operator booth and ticket rail."""
from kit import *

R, HUB, GAP, N = 6.6, 8.2, 1.0, 12  # gondolas (half-width 0.75) swing freely between the rims
TURN = 1440  # frames per revolution (60 s at 24 fps)


def build():
    base = [box('platform', (3.6, 4.2, 0.5), loc=(0, 0, 0.25), color='white', bev=0.08),
            box('platform_edge', (3.7, 4.3, 0.08), loc=(0, 0, 0.5), color='red', bev=0.03)]
    for k in range(3):  # steps up to the boarding platform
        h = 0.5 * (3 - k) / 3
        base.append(box(f'step{k}', (0.36, 1.6, h), loc=(1.98 + k * 0.36, 0, h / 2), color='concrete', bev=0.03))
    for s in (-1, 1):  # A-frames either side of the wheel
        y = s * (GAP + 0.9)
        base += [tube(f'legA{s}', (-4.2, y * 1.5, 0), (0, y, HUB), r=0.22, color='red', seg=14),
                 tube(f'legB{s}', (4.2, y * 1.5, 0), (0, y, HUB), r=0.22, color='red', seg=14),
                 tube(f'brace{s}', (-2.6, y * 1.35, 3.2), (2.6, y * 1.35, 3.2), r=0.1, color='white', seg=10),
                 tube(f'braceX{s}', (-2.6, y * 1.35, 3.2), (1.4, y * 1.2, 5.6), r=0.07, color='white', seg=8),
                 tube(f'braceY{s}', (2.6, y * 1.35, 3.2), (-1.4, y * 1.2, 5.6), r=0.07, color='white', seg=8),
                 cyl(f'footA{s}', 0.5, 0.25, loc=(-4.2, y * 1.5, 0), color='concrete', seg=16, bev=0.05),
                 cyl(f'footB{s}', 0.5, 0.25, loc=(4.2, y * 1.5, 0), color='concrete', seg=16, bev=0.05),
                 cyl(f'bearing{s}', 0.5, 0.4, loc=(0, y - s * 0.2, HUB), color='red', seg=20, bev=0.08, rot=(math.pi / 2, 0, 0))]
        base += rivets(f'rivA{s}', (-3.9, y * 1.47, 0.7), (-0.4, y * 1.03, HUB - 0.8), 10, r=0.05, color='chrome')
        base += rivets(f'rivB{s}', (3.9, y * 1.47, 0.7), (0.4, y * 1.03, HUB - 0.8), 10, r=0.05, color='chrome')
    base += [cyl('axle', 0.25, 2 * (GAP + 1.1), loc=(0, GAP + 1.1, HUB), color='white', seg=16, rot=(math.pi / 2, 0, 0), bev=0.03)]
    # operator booth
    base += [box('booth', (1.2, 1.2, 2.0), loc=(-3.0, 2.8, 1.0), color='butter', bev=0.1),
             box('booth_win', (0.05, 0.8, 0.6), loc=(-2.4, 2.8, 1.4), color='glass', bev=0.02),
             prism('booth_roof', 1.5, 1.5, 0.5, loc=(-3.0, 2.8, 2.0), color='red', bev=0.04),
             box('lever', (0.05, 0.05, 0.3), loc=(-2.35, 2.5, 1.05), color='red', bev=0.01)]
    root = join(base, 'ferris_wheel')

    wheel = []
    for s in (-1, 1):
        y = s * GAP
        wheel += [torus(f'rim{s}', R, 0.12, loc=(0, y, 0), color='white', seg=64, rseg=6, rot=(math.pi / 2, 0, 0)),
                  torus(f'rim_in{s}', R * 0.62, 0.07, loc=(0, y, 0), color='red', seg=48, rseg=5, rot=(math.pi / 2, 0, 0)),
                  cyl(f'hubplate{s}', 0.75, 0.2, loc=(0, y, 0), color='red', seg=24, bev=0.05, rot=(math.pi / 2, 0, 0))]
        for k in range(N * 2):  # spokes
            a = k * math.pi / N
            wheel.append(tube(f'spoke{s}{k}', (math.cos(a) * 0.7, y, math.sin(a) * 0.7), (math.cos(a) * R, y, math.sin(a) * R), r=0.045, color='white', seg=6))
        for k in range(N * 3):  # rim lights
            a = (k + 0.5) * 2 * math.pi / (N * 3)
            wheel.append(sphere(f'bulb{s}{k}', 0.11, loc=(math.cos(a) * R, y + s * 0.13, math.sin(a) * R), color=('glow', 'hot_pink', 'glow', 'sky')[k % 4], seg=5))
    for k in range(N):  # cross members carrying the gondola pins
        a = k * 2 * math.pi / N
        wheel.append(tube(f'cross{k}', (math.cos(a) * R, -GAP, math.sin(a) * R), (math.cos(a) * R, GAP, math.sin(a) * R), r=0.08, color='red', seg=8))
        for s in (-1, 1):  # lattice bracing stays in the rim planes, never across the gondolas' path
            wheel.append(tube(f'diag{k}{s}', (math.cos(a) * R * 0.62, s * GAP, math.sin(a) * R * 0.62), (math.cos(a + math.pi / N) * R, s * GAP, math.sin(a + math.pi / N) * R), r=0.04, color='white', seg=6))
    w = join(wheel, 'wheel')
    w.location = (0, 0, HUB)
    parent(w, root)

    gondolas = []
    cols = ('red', 'sky', 'butter', 'mint', 'hot_pink', 'peach')
    for k in range(N):
        a = k * 2 * math.pi / N
        c = cols[k % len(cols)]
        g = join([tube(f'hanger{k}a', (0, -0.55, 0), (0, -0.55, -0.7), r=0.035, color='steel', seg=6),
                  tube(f'hanger{k}b', (0, 0.55, 0), (0, 0.55, -0.7), r=0.035, color='steel', seg=6),
                  sphere(f'canopy{k}', 0.75, loc=(0, 0, -0.75), color=c, seg=14, scale=(1, 1, 0.45)),
                  cyl(f'pillar{k}a', 0.03, 0.65, loc=(0.55, 0, -1.4), color='white', seg=6, bev=0),
                  cyl(f'pillar{k}b', 0.03, 0.65, loc=(-0.55, 0, -1.4), color='white', seg=6, bev=0),
                  lathe(f'tub{k}', [(0, -1.95), (0.55, -1.95), (0.72, -1.7), (0.74, -1.4), (0.0, -1.4)], color=c, seg=24),
                  torus(f'tubrim{k}', 0.74, 0.04, loc=(0, 0, -1.4), color='white', seg=24, rseg=5),
                  box(f'seat{k}', (0.25, 1.0, 0.2), loc=(-0.35, 0, -1.55), color='white', bev=0.05)], f'gond{k}')
        g.location = (math.cos(a) * R, 0, math.sin(a) * R)
        parent(g, w)
        gondolas.append(g)
    finish(root, mass=160, smooth_angle=40)
    spin(w, 'Y', frames=TURN, name='wheel')
    for k, g in enumerate(gondolas):  # stay level: counter-rotate against the wheel
        spin(g, 'Y', frames=TURN, turns=-1, name=f'gond{k}')
    return tag(root, 'fair', clone=True, landmark=True, lod=[0.5, 0.2])
