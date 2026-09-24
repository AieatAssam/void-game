from kit import *


def build():
    p = car(3.9, 1.9, 'sky', roof='white', cabin=0.46, cabin_x=-0.2, ch=0.55)
    deck = 0.294 + 0.62  # top of the body: stripes run over bonnet and boot, spoiler stands on the boot
    p += [box('spoiler', (0.25, 1.6, 0.05), loc=(-1.8, 0, deck + 0.22), color='navy', bev=0.02),
          box('stripe1', (0.95, 0.2, 0.01), loc=(1.45, 0.2, deck + 0.004), color='white', bev=0, seg=1),
          box('stripe2', (0.95, 0.2, 0.01), loc=(1.45, -0.2, deck + 0.004), color='white', bev=0, seg=1),
          box('stripe3', (0.55, 0.2, 0.01), loc=(-1.65, 0.2, deck + 0.004), color='white', bev=0, seg=1),
          box('stripe4', (0.55, 0.2, 0.01), loc=(-1.65, -0.2, deck + 0.004), color='white', bev=0, seg=1)]
    for y in (-0.55, 0.55):
        p.append(box(f'strut{y}', (0.06, 0.06, 0.22), loc=(-1.8, y, deck + 0.1), color='navy', bev=0.015, seg=1))
    return finish(join(p, 'car_c'))
