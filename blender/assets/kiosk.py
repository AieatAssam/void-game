from lib import *


def build():
    p = [box('body', (2.6, 1.8, 2.2), loc=(0, 0, 1.1), color='butter', bev=0.15),
         box('base', (2.8, 2.0, 0.2), loc=(0, 0, 0.1), color='forest', bev=0.06),
         box('roof', (3.0, 2.2, 0.25), loc=(0, 0, 2.35), color='forest', bev=0.1),
         box('sign', (1.8, 0.12, 0.5), loc=(0, -0.8, 2.8), color='glow', bev=0.06),
         box('counter', (2.2, 0.5, 0.1), loc=(0, -1.1, 1.0), color='white', bev=0.03),
         box('opening', (2.0, 0.1, 0.9), loc=(0, -0.9, 1.55), color='ink', bev=0.03)]
    for i in range(8):
        p.append(box(f'awn{i}', (0.35, 0.8, 0.07), loc=(-1.22 + i * 0.35, -1.2, 2.2), color=('forest', 'white')[i % 2], bev=0.02, rot=(0.4, 0, 0)))
    cols = ('pink', 'sky', 'red', 'mint', 'butter', 'peach')
    for i in range(10):
        p.append(box(f'mag{i}', (0.18, 0.04, 0.26), loc=(-0.9 + i * 0.2, -1.1, 1.2), color=cols[i % 6], bev=0.01, seg=1, rot=(0.3, 0, 0)))
    return finish(join(p, 'kiosk'))
