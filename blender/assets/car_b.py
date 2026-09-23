from kit import *


def build():
    p = car(3.6, 1.85, 'mint', roof='white', cabin=0.6, cabin_x=-0.05, ch=0.7)
    p += [box('rack', (1.4, 1.3, 0.08), loc=(-0.1, 0, 2.02), color='steel', bev=0.03),
          box('bag', (0.8, 0.8, 0.3), loc=(-0.2, 0, 2.2), color='butter', bev=0.08)]
    return finish(join(p, 'car_b'))
