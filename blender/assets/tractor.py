"""Vintage farm tractor: big chevron-lug rear wheels under round fenders, small front wheels, long hood with
a slatted grille and headlamps, exhaust stack with rain cap, sprung seat, steering wheel and tow hitch."""
from kit import *


def lug_wheel(name, r, w, x, y):
    out = [cyl(name, r, w, loc=(x, y + w / 2, r), color='ink', rot=(math.pi / 2, 0, 0), bev=r * 0.15, seg=32, bseg=2),
           cyl(name + 'rim', r * 0.62, w * 1.04, loc=(x, y + w * 0.52, r), color='red', rot=(math.pi / 2, 0, 0), seg=24, bev=r * 0.05, bseg=2),
           cyl(name + 'cap', r * 0.2, w * 1.12, loc=(x, y + w * 0.56, r), color='butter', rot=(math.pi / 2, 0, 0), seg=14, bev=r * 0.04, bseg=1)]
    n = 16
    for k in range(n):  # chevron lugs: two angled blocks meeting in the middle of the tread
        a = k * 2 * math.pi / n
        for s in (-1, 1):
            out.append(box(f'{name}lug{k}{s}', (r * 0.12, w * 0.55, r * 0.1), loc=(x + math.cos(a) * r * 1.02, y + s * w * 0.22, r + math.sin(a) * r * 1.02),
                           color='ink', bev=r * 0.02, seg=1, rot=(s * 0.5, -a + math.pi / 2, 0)))
    for k in range(6):
        a = k * math.pi / 3
        out.append(sphere(f'{name}bolt{k}', r * 0.04, loc=(x + math.cos(a) * r * 0.4, y + (w * 0.55 if y > 0 else -w * 0.55), r + math.sin(a) * r * 0.4), color='steel', seg=6))
    return out


def build():
    p = [box('chassis', (2.4, 0.7, 0.45), loc=(0.3, 0, 0.8), color='red', bev=0.1),
         box('hood', (1.6, 0.75, 0.55), loc=(0.75, 0, 1.25), color='red', bev=0.18),
         box('grille', (0.08, 0.66, 0.6), loc=(1.56, 0, 1.12), color='butter', bev=0.03),
         box('gearbox', (0.9, 0.8, 0.7), loc=(-0.5, 0, 0.95), color='red', bev=0.12),
         box('footplate', (0.7, 1.6, 0.05), loc=(-0.6, 0, 0.85), color='steel', bev=0.02),
         cyl('stack', 0.07, 1.0, loc=(1.1, 0, 1.45), color='ink', seg=12, bev=0.02),
         cyl('stack_cap', 0.12, 0.05, loc=(1.12, 0, 2.47), color='ink', seg=12, bev=0.02, rot=(0, 0.35, 0)),
         cyl('air_cleaner', 0.1, 0.45, loc=(0.6, 0.22, 1.45), color='red', seg=12, bev=0.03),
         tube('column', (0.2, 0, 1.35), (-0.35, 0, 1.75), r=0.035, color='ink'),
         torus('steer', 0.22, 0.03, loc=(-0.38, 0, 1.78), color='ink', seg=24, rseg=6, rot=(0, -0.9, 0)),
         tube('seat_post', (-0.95, 0, 1.2), (-1.05, 0, 1.6), r=0.04, color='steel'),
         sphere('seat', 0.3, loc=(-1.08, 0, 1.68), color='gloss_black', seg=16, scale=(1, 1.1, 0.35)),
         box('seat_back', (0.1, 0.5, 0.35), loc=(-1.32, 0, 1.85), color='gloss_black', bev=0.05),
         box('hitch', (0.5, 0.2, 0.1), loc=(-1.35, 0, 0.6), color='ink', bev=0.03),
         cyl('hitch_pin', 0.035, 0.25, loc=(-1.5, 0, 0.5), color='steel', seg=8, bev=0)]
    for k in range(6):  # grille slats
        p.append(box(f'slat{k}', (0.03, 0.62, 0.035), loc=(1.61, 0, 0.9 + k * 0.09), color='ink', bev=0.005, seg=1))
    for s in (-1, 1):
        p += [sphere(f'lamp{s}', 0.1, loc=(1.45, s * 0.42, 1.45), color='glow_white', seg=12),
              torus(f'lampring{s}', 0.1, 0.025, loc=(1.47, s * 0.42, 1.45), color='chrome', seg=14, rseg=5, rot=(0, math.pi / 2, 0)),
              tube(f'lamparm{s}', (1.3, s * 0.36, 1.35), (1.42, s * 0.42, 1.42), r=0.02, color='ink'),
              torus(f'fender{s}', 0.85, 0.06, loc=(-0.7, s * 0.82, 0.75), color='red', seg=40, rseg=6, rot=(math.pi / 2, 0, 0), arc=(0.1, math.pi - 0.1)),
              box(f'fender_top{s}', (1.5, 0.45, 0.05), loc=(-0.7, s * 0.82, 1.62), color='red', bev=0.02),
              tube(f'axle_f{s}', (1.15, 0, 0.42), (1.15, s * 0.55, 0.42), r=0.05, color='steel')]
        p += lug_wheel(f'rear{s}', 0.75, 0.42, -0.7, s * 0.82)
        p += wheel(f'front{s}', 0.4, 0.22, 1.15, s * 0.62)
    return tag(finish(join(p, 'tractor'), mass=2.5), 'farmfair', mover='field')
