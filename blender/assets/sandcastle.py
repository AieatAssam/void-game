from lib import *


def build():
    p = [box('base', (1.2, 1.2, 0.3), loc=(0, 0, 0.15), color='butter', bev=0.08),
         box('keep', (0.5, 0.5, 0.5), loc=(0, 0, 0.55), color='butter', bev=0.05),
         cyl('flagpole', 0.012, 0.35, loc=(0, 0, 0.8), color='white', seg=6, bev=0),
         box('flag', (0.16, 0.01, 0.1), loc=(0.08, 0, 1.08), color='red', bev=0, seg=1)]
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        x, y = math.cos(a) * 0.5, math.sin(a) * 0.5
        p.append(lathe(f'tower{k}', [(0.0, 0.3), (0.16, 0.3), (0.13, 0.62), (0.16, 0.64), (0.0, 0.66)], loc=(x, y, 0), color='butter', seg=12))
        p.append(lathe(f'roof{k}', [(0.0, 0.64), (0.16, 0.64), (0.0, 0.82)], loc=(x, y, 0), color='sand', seg=12))
    p += [box('bucket', (0.22, 0.22, 0.26), loc=(0.85, 0.2, 0.13), color='sky', bev=0.05),
          cyl('spade', 0.02, 0.5, loc=(0.8, -0.3, 0.02), color='red', seg=6, bev=0, rot=(0, 1.2, 0.5))]
    return finish(join(p, 'sandcastle'))
