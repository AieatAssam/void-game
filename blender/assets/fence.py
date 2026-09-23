from lib import *


def build():
    p = [box('rail1', (3.0, 0.06, 0.1), loc=(0, 0, 0.35), color='white', bev=0.02),
         box('rail2', (3.0, 0.06, 0.1), loc=(0, 0, 0.75), color='white', bev=0.02)]
    for k in range(11):
        x = -1.4 + k * 0.28
        p.append(box(f'picket{k}', (0.16, 0.05, 0.9), loc=(x, 0.04, 0.45), color='white', bev=0.02))
        p.append(lathe(f'tip{k}', [(0.0, 0.0), (0.08, 0.0), (0.0, 0.14)], loc=(x, 0.04, 0.9), color='white', seg=4, rot=(0, 0, math.pi / 4)))
    return finish(join(p, 'fence'))
