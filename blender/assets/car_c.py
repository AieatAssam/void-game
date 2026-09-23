from kit import *


def build():
    p = car(3.9, 1.9, 'sky', roof='white', cabin=0.46, cabin_x=-0.2, ch=0.55)
    p += [box('spoiler', (0.25, 1.6, 0.06), loc=(-1.95, 0, 1.45), color='navy', bev=0.02),
          box('stripe1', (3.92, 0.2, 0.02), loc=(0, 0.2, 1.21), color='white', bev=0, seg=1),
          box('stripe2', (3.92, 0.2, 0.02), loc=(0, -0.2, 1.21), color='white', bev=0, seg=1)]
    return finish(join(p, 'car_c'))
