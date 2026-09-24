from lib import *


def build():
    p = []
    for i in range(4):
        p.append(box(f'top{i}', (2.6, 0.22, 0.07), loc=(0, -0.36 + i * 0.24, 0.78), color='wood', bev=0.025))
    for s in (-1, 1):
        p.append(box(f'seat{s}', (2.6, 0.3, 0.07), loc=(0, s * 0.8, 0.45), color='wood', bev=0.025))
        for x in (-0.95, 0.95):
            p.append(box(f'leg{x}{s}', (0.08, 0.08, 0.95), loc=(x, s * 0.42, 0.4), color='wood', bev=0.02, rot=(-s * 0.55, 0, 0)))
    for x in (-0.95, 0.95):
        p.append(box(f'brace{x}', (0.08, 1.9, 0.08), loc=(x, 0, 0.4), color='wood', bev=0.02))
    p += [box('cloth', (0.8, 0.8, 0.02), loc=(0.3, 0, 0.83), color='red', bev=0.005, seg=1),
          sphere('apple', 0.06, loc=(0.4, 0.1, 0.9), color='red', seg=10),
          box('basket', (0.4, 0.3, 0.22), loc=(-0.5, 0, 0.93), color='sand', bev=0.04)]
    return finish(join(p, 'picnic_table'))
