from lib import *


def build():
    p = [box('body', (0.7, 0.86, 1.9), loc=(0, 0, 0.95), color='sky', bev=0.08),
         box('glass', (0.06, 0.5, 1.2), loc=(0.35, -0.1, 1.15), color='glow', bev=0.03),
         box('panel', (0.06, 0.2, 0.9), loc=(0.35, 0.29, 1.2), color='white', bev=0.03),
         box('slot', (0.08, 0.5, 0.18), loc=(0.35, -0.1, 0.3), color='ink', bev=0.03),
         box('logo', (0.07, 0.7, 0.22), loc=(0.35, 0, 1.72), color='red', bev=0.03)]
    for j in range(4):
        for i in range(3):
            p.append(cyl(f'can{i}{j}', 0.05, 0.16, loc=(0.31, -0.26 + i * 0.16, 0.68 + j * 0.28), color=('red', 'hazard', 'mint', 'pink')[j], seg=10, bev=0.01))
    for j in range(3):
        p.append(sphere(f'btn{j}', 0.035, loc=(0.39, 0.29, 1.4 - j * 0.14), color='siren_red' if j == 0 else 'glow', seg=8))
    return finish(join(p, 'vending'))
