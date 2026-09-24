from lib import *


def build():
    p = []
    for s in (-1, 1):
        p.append(box(f'rail{s}', (1.3, 0.05, 0.05), loc=(0, s * 0.3, 0.45), color='clay', bev=0.015, rot=(0, -0.5, 0)))
        p.append(box(f'leg{s}', (0.05, 0.05, 0.6), loc=(0.35, s * 0.3, 0.28), color='clay', bev=0.015, rot=(0, 0.4, 0)))
    for k in range(5):
        p.append(box(f'strip{k}', (0.24, 0.56, 0.02), loc=(-0.45 + k * 0.23, 0, 0.2 + k * 0.13), color=('red', 'white')[k % 2], bev=0.005, seg=1, rot=(0, -0.5, 0)))
    return finish(join(p, 'deckchair'))
