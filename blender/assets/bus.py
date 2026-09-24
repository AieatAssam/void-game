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
         box('ac', (2.6, 1.6, 0.34), loc=(-2.6, 0, z0 + 2.82), color='white', bev=0.12),
         cyl('fan1', 0.42, 0.05, loc=(-3.2, 0, z0 + 2.99), color='asphalt_lt', seg=24, bev=0.01),
         cyl('fan2', 0.42, 0.05, loc=(-2.0, 0, z0 + 2.99), color='asphalt_lt', seg=24, bev=0.01)]
    for k in range(9):  # roof panel seams (the bus is mostly seen from above)
        p.append(box(f'seam{k}', (0.04, W - 0.3, 0.02), loc=(-4.6 + k * 1.15, 0, z0 + 2.66), color='concrete', bev=0, seg=1))
    for x in (1.2, 3.6):  # escape hatches
        p += [box(f'hatch{x}', (0.8, 0.8, 0.06), loc=(x, 0, z0 + 2.68), color='concrete', bev=0.03),
              box(f'hglass{x}', (0.6, 0.6, 0.02), loc=(x, 0, z0 + 2.72), color='glass', bev=0.01, seg=1)]
    for s in (-1, 1):
        p.append(box(f'mirror{s}', (0.12, 0.08, 0.35), loc=(L / 2 - 0.1, s * (W / 2 + 0.25), z0 + 1.9), color='ink', bev=0.03))
    for i in range(7):
        p.append(box(f'post{i}', (0.14, W, 1.0), loc=(-4.5 + i * 1.45, 0, z0 + 1.65), color='cream', bev=0.04))
    for s in (-1, 1):
        p.append(cyl(f'hl{s}', 0.16, 0.08, loc=(L / 2 - 0.02, s * 0.9, z0 + 0.6), color='glow', rot=(0, math.pi / 2, 0), seg=16, bev=0.02))
    p.append(box('door', (1.0, 0.08, 1.9), loc=(3.8, -W / 2, z0 + 1.25), color='ink', bev=0.04))
    p += wheels(L, W, 0.55, 0.4, xs=(3.6, -2.6, -3.8))
    return finish(join(p, 'bus'))
