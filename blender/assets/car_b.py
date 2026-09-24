from kit import *


def build():
    p = car(3.6, 1.85, 'mint', roof='white', cabin=0.6, cabin_x=-0.05, ch=0.7)
    top = car_top(ch=0.7)
    p += [box('rack', (1.3, 1.2, 0.05), loc=(-0.2, 0, top + 0.07), color='steel', bev=0.02),
          box('bag', (0.8, 0.8, 0.3), loc=(-0.25, 0, top + 0.25), color='butter', bev=0.08)]
    for x in (-0.75, 0.35):  # rack feet on the roof
        for y in (-0.5, 0.5):
            p.append(box(f'foot{x}{y}', (0.08, 0.08, 0.08), loc=(x, y, top + 0.02), color='ink', bev=0.02, seg=1))
    return finish(join(p, 'car_b'))
