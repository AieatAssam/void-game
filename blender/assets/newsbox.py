from lib import *


def build():
    p = [box('box', (0.5, 0.55, 0.8), loc=(0, 0, 0.55), color='red', bev=0.05),
         box('window', (0.04, 0.4, 0.3), loc=(0.25, 0, 0.7), color='sky', bev=0.02),
         box('paper', (0.03, 0.34, 0.22), loc=(0.255, 0, 0.7), color='white', bev=0.01),
         box('handle', (0.05, 0.2, 0.04), loc=(0.27, 0, 0.5), color='steel', bev=0.015),
         box('top', (0.56, 0.6, 0.08), loc=(0, 0, 0.98), color='red', bev=0.03),
         box('plate', (0.02, 0.36, 0.1), loc=(0.26, 0, 0.9), color='butter', bev=0.01)]
    for x in (-0.18, 0.18):
        for y in (-0.2, 0.2):
            p.append(box(f'leg{x}{y}', (0.05, 0.05, 0.16), loc=(x, y, 0.08), color='ink', bev=0.015, seg=1))
    return finish(join(p, 'newsbox'))
