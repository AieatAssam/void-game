from kit import *


def build():
    p = car(4.3, 2.0, 'butter', roof='butter')
    for i in range(10):  # checker band on the doors only (not across the roof)
        for j, z in enumerate((0.72, 0.84)):
            for sd in (-1, 1):
                p.append(box(f'chk{i}{j}{sd}', (0.16, 0.03, 0.12), loc=(-1.6 + i * 0.32 + (j % 2) * 0.16, sd * 1.012, z), color='ink', bev=0.01, seg=1))
    p += [box('sign', (0.6, 0.3, 0.26), loc=(-0.3, 0, car_top() + 0.18), color='glow', bev=0.08),
          box('signbase', (0.7, 0.4, 0.06), loc=(-0.3, 0, car_top() + 0.03), color='ink', bev=0.02)]
    return finish(join(p, 'taxi'))
