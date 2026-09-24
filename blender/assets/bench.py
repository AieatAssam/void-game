from lib import *


def build():
    p = []
    for i in range(3):
        p.append(box(f'seat{i}', (1.6, 0.13, 0.06), loc=(0, -0.05 + i * 0.15, 0.45), color='wood', bev=0.02))
    for i in range(2):
        p.append(box(f'back{i}', (1.6, 0.05, 0.12), loc=(0, 0.33, 0.65 + i * 0.17), color='wood', bev=0.02, rot=(0.2, 0, 0)))
    for x in (-0.65, 0.65):
        p += [box(f'leg{x}', (0.07, 0.5, 0.06), loc=(x, 0.1, 0.4), color='ink', bev=0.02),
              box(f'lf{x}', (0.07, 0.06, 0.42), loc=(x, -0.12, 0.2), color='ink', bev=0.02),
              box(f'lb{x}', (0.07, 0.06, 0.95), loc=(x, 0.3, 0.45), color='ink', bev=0.02, rot=(0.2, 0, 0)),
              box(f'arm{x}', (0.09, 0.45, 0.05), loc=(x * 1.08, 0.08, 0.64), color='ink', bev=0.02)]
    return finish(join(p, 'bench'))
