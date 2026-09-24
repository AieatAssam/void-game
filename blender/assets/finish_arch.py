"""Inflatable marathon finish arch: striped air-tube arch with a checkered banner, a race clock,
anchor weights and a timing mat across the road."""
from kit import *


def build():
    p = []
    R, r = 3.6, 0.5
    # the arch: a half-torus of alternating inflatable segments with seams
    n = 12
    for i in range(n):
        a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
        p.append(torus(f'seg{i}', R, r, loc=(0, 0, 0.3), color='red' if i % 2 else 'white', seg=48, rseg=16,
                       rot=(math.pi / 2, 0, 0), arc=(a0, a1)))
        a = a0
        p.append(torus(f'seam{i}', r * 1.01, 0.025, loc=(math.cos(a) * R, 0, 0.3 + math.sin(a) * R), color='ink', seg=20, rseg=4,
                       rot=(0, -a, 0)))
    for s in (-1, 1):  # feet: fat bases with weights and a blower
        p += [cyl(f'foot{s}', 0.75, 0.3, loc=(s * R, 0, 0), color='red', seg=24, bev=0.1),
              box(f'weight{s}', (0.9, 0.9, 0.25), loc=(s * R, 0, 0.03), color='ink', bev=0.06),
              cyl(f'blower{s}', 0.22, 0.35, loc=(s * (R + 0.75), 0.5, 0), color='hazard', seg=16, bev=0.05),
              tube(f'hose{s}', (s * (R + 0.75), 0.5, 0.2), (s * (R + 0.4), 0.2, 0.25), r=0.08, color='steel')]
    # banner: checkered band hanging under the crown
    zb = 0.3 + R - r - 1.4  # hangs clear of the tube's inner surface
    p += [box('banner', (3.6, 0.08, 0.9), loc=(0, 0, zb + 0.45), color='white', bev=0.03)]
    p += checker('flagA', 0, 0.05, zb + 0.05, 3.6, 0.8, 12, axis='x')
    p += checker('flagB', 0, -0.05, zb + 0.05, 3.6, 0.8, 12, axis='x')
    for s in (-1, 1):  # ties up into the tube
        p += rope(f'tie{s}', (s * 1.75, 0, zb + 0.88), (s * 2.2, 0, 0.3 + math.sqrt(R * R - 2.2 * 2.2)), sag=0.05, r=0.015, color='ink', segs=3)
    # race clock on top of the crown
    zc = 0.3 + R + r - 0.1
    p += [box('clock', (2.0, 0.4, 0.7), loc=(0, 0, zc + 0.35), color='ink', bev=0.06),
          box('clock_face', (1.7, 0.42, 0.45), loc=(0, 0, zc + 0.35), color='gloss_black', bev=0.02)]
    for k, x in enumerate((-0.6, -0.3, 0.1, 0.4, 0.7)):  # glowing digit blocks with a colon
        if k == 2:
            p += [sphere(f'colon{j}', 0.035, loc=(-0.1, 0.22, zc + 0.27 + j * 0.16), color='warn', seg=6) for j in range(2)]
        p.append(box(f'dig{k}', (0.18, 0.02, 0.32), loc=(x, 0.22, zc + 0.35), color='warn', bev=0.01, seg=1))
    # timing mat across the road
    p += [box('mat', (1.2, 7.4, 0.04), loc=(0, 0, 0.02), color='ink', bev=0.02)]
    for k in range(12):
        p.append(box(f'matstripe{k}', (0.2, 0.3, 0.012), loc=(0.35 if k % 2 else -0.35, -3.3 + k * 0.6, 0.045), color='white', bev=0, seg=1))
    return tag(finish(join(p, 'finish_arch'), mass=5), 'events', event='marathon', lod=[0.35, 0.12])
