"""Balloon seller's cart: a little wheeled box with a crank handle and a tall rod carrying a cloud of balloons
(foil star and heart among them) on individual strings."""
from kit import *
import random


def build():
    p = [box('cart', (0.8, 0.55, 0.55), loc=(0, 0, 0.5), color='sky', bev=0.06),
         box('cart_lid', (0.86, 0.6, 0.06), loc=(0, 0, 0.8), color='white', bev=0.02),
         box('cart_panel', (0.02, 0.4, 0.3), loc=(0.41, 0, 0.5), color='butter', bev=0.01),
         tube('handle', (-0.4, 0, 0.7), (-0.75, 0, 0.95), r=0.025, color='chrome'),
         tube('grip', (-0.75, -0.18, 0.95), (-0.75, 0.18, 0.95), r=0.03, color='ink'),
         cyl('helium', 0.1, 0.5, loc=(-0.2, 0.2, 0.83), color='mint', seg=14, bev=0.03),
         cyl('valve', 0.03, 0.08, loc=(-0.2, 0.2, 1.33), color='hazard', seg=8, bev=0.01),
         cyl('rod', 0.025, 1.5, loc=(0.2, 0, 0.83), color='white', seg=8, bev=0)]
    for s in (-1, 1):
        p += wheel(f'w{s}', 0.14, 0.06, 0.15, s * 0.3)
    p.append(cyl('leg', 0.03, 0.25, loc=(-0.3, 0, 0), color='steel', seg=8, bev=0))
    top = Vector((0.2, 0, 2.33))
    rnd = random.Random(11)
    cols = ('red', 'butter', 'sky', 'hot_pink', 'mint', 'peach', 'lilac', 'white')
    for k in range(14):
        a = k * 2.39996
        d = 0.18 + 0.12 * (k % 3)
        c = Vector((0.2 + math.cos(a) * d, math.sin(a) * d, 2.55 + (k % 4) * 0.14 + rnd.random() * 0.08))
        col = cols[k % len(cols)]
        if k == 5:  # foil star
            p.append(sphere(f'star{k}', 0.13, loc=c, color='gold', seg=10, scale=(1, 0.35, 1)))
        elif k == 9:  # heart
            p += [sphere(f'heartL{k}', 0.08, loc=c + Vector((0, -0.05, 0.03)), color='red', seg=10),
                  sphere(f'heartR{k}', 0.08, loc=c + Vector((0, 0.05, 0.03)), color='red', seg=10),
                  cyl(f'heartTip{k}', 0.1, 0.14, loc=c + Vector((0, 0, -0.1)), color='red', seg=10, r2=0.01, bev=0)]
        else:
            p += [sphere(f'bal{k}', 0.12, loc=c, color=col, seg=14, scale=(1, 1, 1.18)),
                  sphere(f'knot{k}', 0.02, loc=c - Vector((0, 0, 0.14)), color=col, seg=6),
                  sphere(f'shine{k}', 0.025, loc=c + Vector((0.05, -0.04, 0.06)), color='glow_white', seg=6)]
        p.append(tube(f'str{k}', top, c - Vector((0, 0, 0.14)), r=0.003, color='white', seg=4))
    return tag(finish(join(p, 'balloon_stand'), mass=0.3), 'fair')
