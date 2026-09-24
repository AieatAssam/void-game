"""Baggage tug train: a stubby airside tractor with a cab frame and beacon towing two covered baggage carts
piled with suitcases, a golf bag and a pet carrier."""
from kit import *


def cart(p, x, k):
    p += [box(f'cbed{k}', (1.8, 1.2, 0.12), loc=(x, 0, 0.45), color='steel', bev=0.03),
          box(f'cback{k}', (0.06, 1.2, 1.1), loc=(x - 0.9, 0, 1.0), color='sky', bev=0.03),
          box(f'croof{k}', (1.9, 1.3, 0.06), loc=(x, 0, 1.58), color='sky', bev=0.03),
          tube(f'cbar{k}', (x + 0.9, 0, 0.45), (x + 1.35, 0, 0.35), r=0.035, color='ink')]
    for s in (-1, 1):
        p += [tube(f'cpostF{k}{s}', (x + 0.88, s * 0.58, 0.5), (x + 0.88, s * 0.58, 1.56), r=0.03, color='white'),
              tube(f'cpostB{k}{s}', (x - 0.88, s * 0.58, 0.5), (x - 0.88, s * 0.58, 1.56), r=0.03, color='white')]
        for xx in (x + 0.55, x - 0.55):
            p += wheel(f'cw{k}{s}{xx}', 0.2, 0.12, xx, s * 0.5, detail=False)
    bags = [('red', 0.55, 0.35, 0.28), ('navy', 0.6, 0.4, 0.3), ('mint', 0.5, 0.3, 0.25), ('butter', 0.45, 0.32, 0.22), ('clay', 0.6, 0.35, 0.28)]
    z0 = 0.51
    for i, (c, w, d, h) in enumerate(bags[:4 if k else 5]):
        bx, by = x - 0.5 + (i % 3) * 0.52, -0.3 + (i // 3) * 0.6
        bz = z0 + (0.3 if i >= 3 else 0)
        p += [box(f'bag{k}{i}', (w, d, h), loc=(bx, by, bz + h / 2), color=c, bev=0.05),
              torus(f'bhandle{k}{i}', 0.06, 0.012, loc=(bx, by, bz + h + 0.01), color='ink', seg=10, rseg=4, rot=(math.pi / 2, 0, 0)),
              box(f'btag{k}{i}', (0.06, 0.01, 0.08), loc=(bx + 0.1, by + d / 2 + 0.005, bz + h - 0.08), color='white', bev=0, seg=1)]
    if k == 0:
        p += [cyl('golfbag', 0.14, 0.9, loc=(x + 0.5, 0.35, 0.51), color='gloss_black', seg=14, bev=0.03, rot=(0.25, 0, 0)),
              *[cyl(f'club{j}', 0.04, 0.2, loc=(x + 0.46 + j * 0.05, 0.12 + j * 0.03, 1.35), color='chrome', seg=6, bev=0) for j in range(3)]]
    else:
        p += [box('carrier', (0.5, 0.35, 0.35), loc=(x + 0.45, 0.3, 0.69), color='pearl', bev=0.08),
              box('carrier_grille', (0.02, 0.26, 0.24), loc=(x + 0.71, 0.3, 0.69), color='ink', bev=0.01)]


def build():
    p = [box('tug', (1.9, 1.3, 0.55), loc=(0.2, 0, 0.55), color='hazard', bev=0.12),
         box('hood', (0.8, 1.2, 0.3), loc=(0.8, 0, 0.95), color='hazard', bev=0.1),
         box('seat', (0.45, 0.5, 0.35), loc=(-0.1, 0, 1.0), color='ink', bev=0.08),
         tube('column', (0.35, 0, 0.9), (0.25, 0, 1.25), r=0.03, color='ink'),
         torus('wheel_s', 0.14, 0.022, loc=(0.24, 0, 1.28), color='ink', seg=16, rseg=5, rot=(0, -0.6, 0)),
         box('bumper', (0.14, 1.35, 0.25), loc=(1.18, 0, 0.42), color='ink', bev=0.06),
         cyl('beacon', 0.1, 0.14, loc=(-0.4, 0, 2.0), color='warn', seg=12, bev=0.03),
         box('cab_roof', (1.1, 1.25, 0.06), loc=(-0.1, 0, 1.95), color='white', bev=0.02)]
    for s in (-1, 1):
        p += [tube(f'rollF{s}', (0.35, s * 0.58, 0.85), (0.35, s * 0.58, 1.94), r=0.035, color='ink'),
              tube(f'rollB{s}', (-0.55, s * 0.58, 0.85), (-0.55, s * 0.58, 1.94), r=0.035, color='ink'),
              sphere(f'lamp{s}', 0.07, loc=(1.22, s * 0.45, 0.6), color='glow_white', seg=10),
              box(f'chevron{s}', (0.02, 0.6, 0.2), loc=(-0.76, s * 0.3, 0.55), color='red', bev=0.005, seg=1)]
        for x in (0.7, -0.4):
            p += wheel(f'tw{s}{x}', 0.28, 0.2, x, s * 0.62)
    p.append(tube('hitch', (-0.75, 0, 0.4), (-1.1, 0, 0.35), r=0.04, color='ink'))
    cart(p, -2.1, 0)
    cart(p, -4.4, 1)
    return tag(finish(join(p, 'baggage_tug'), mass=3), 'airport', mover='apron')
