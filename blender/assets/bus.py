from kit import *


def build():
    L, W, H = 10.5, 2.6, 2.8
    z0 = 0.5
    p = [box('lower', (L, W, 1.2), loc=(0, 0, z0 + 0.6), color='teal', bev=0.3),
         box('band', (L - 0.2, W - 0.1, 1.0), loc=(0, 0, z0 + 1.65), color='sky', bev=0.2),
         box('roof', (L, W, 0.5), loc=(0, 0, z0 + 2.4), color='cream', bev=0.25),
         box('sign', (0.1, 1.6, 0.35), loc=(L / 2 + 0.02, 0, z0 + 2.4), color='glow', bev=0.05),
         box('bump_f', (0.2, W * 0.96, 0.3), loc=(L / 2, 0, z0 + 0.2), color='steel', bev=0.1),
         box('bump_r', (0.2, W * 0.96, 0.3), loc=(-L / 2, 0, z0 + 0.2), color='steel', bev=0.1),
         box('vent', (2.5, 1.4, 0.3), loc=(-2.5, 0, z0 + 2.8), color='white', bev=0.1)]
    for i in range(7):
        p.append(box(f'post{i}', (0.14, W, 1.0), loc=(-4.5 + i * 1.45, 0, z0 + 1.65), color='cream', bev=0.04))
    for s in (-1, 1):
        p.append(cyl(f'hl{s}', 0.16, 0.08, loc=(L / 2 - 0.02, s * 0.9, z0 + 0.6), color='glow', rot=(0, math.pi / 2, 0), seg=16, bev=0.02))
    p.append(box('door', (1.0, 0.08, 1.9), loc=(3.8, -W / 2, z0 + 1.25), color='ink', bev=0.04))
    p += wheels(L, W, 0.55, 0.4, xs=(3.6, -2.6, -3.8))
    return finish(join(p, 'bus'))
