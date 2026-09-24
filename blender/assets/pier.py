"""Seaside pier: deck on piles out to sea, arcade booth and a little ferris wheel ('wheel' clip)."""
from lib import *


def build():
    L = 40.0
    p = [box('deck', (5, L, 0.35), loc=(0, -L / 2, 1.2), color='wood', bev=0.05),
         box('head', (14, 12, 0.35), loc=(0, -L - 5, 1.2), color='wood', bev=0.05)]
    for k in range(14):
        y = -2 - k * 3.2
        for s in (-1, 1):
            p.append(cyl(f'pile{k}{s}', 0.22, 2.2, loc=(s * 2.2, y, -1.0), color='brick', seg=10, bev=0.03))
            p.append(box(f'rail{k}{s}', (0.08, 3.2, 0.08), loc=(s * 2.4, y, 2.1), color='white', bev=0.02, seg=1))
            p.append(box(f'post{k}{s}', (0.1, 0.1, 0.8), loc=(s * 2.4, y + 1.6, 1.75), color='white', bev=0.02, seg=1))
        if k % 3 == 0:
            p.append(cyl(f'lamp{k}', 0.06, 2.6, loc=(2.4, y, 1.4), color='navy', seg=8, bev=0))
            p.append(sphere(f'bulb{k}', 0.2, loc=(2.4, y, 4.1), color='glow', seg=10))
    p += [box('arcade', (8, 6, 4), loc=(-2, -L - 7, 3.35), color='pink', bev=0.2),
          prism('arcroof', 7, 8.6, 1.8, loc=(-2, -L - 7, 5.3), color='sky', bev=0.1),
          box('sign', (5, 0.3, 1.2), loc=(-2, -L - 3.9, 5.2), color='glow', bev=0.1),
          box('door', (2.4, 0.2, 2.6), loc=(-2, -L - 3.95, 2.7), color='ink', bev=0.05)]
    root = join(p, 'pier')
    w = [torus('rimA', 4.0, 0.12, color='white', seg=40, rseg=8, rot=(0, math.pi / 2, 0)),
         cyl('axle', 0.3, 1.2, loc=(-0.6, 0, 0), color='steel', seg=12, rot=(0, math.pi / 2, 0), bev=0.05)]
    for k in range(8):
        a = k * math.pi / 4
        w.append(box(f'spoke{k}', (0.08, 0.08, 8.0), color='white', bev=0, seg=1, rot=(a, 0, 0)))
        w.append(box(f'car{k}', (0.9, 0.9, 0.8), loc=(0, math.sin(a) * 4, math.cos(a) * 4 - 0.5), color=('red', 'butter', 'mint', 'sky')[k % 4], bev=0.15))
    wheel = join(w, 'wheel')
    wheel.location = (5, -L - 5, 6.2)
    legs = join([box('legA', (0.25, 0.25, 6), loc=(5.5, -L - 5 + s * 1.6, 3.5), color='white', bev=0.04, rot=(s * 0.26, 0, 0)) for s in (-1, 1)], 'legs')
    for o in (wheel, legs):
        parent(o, root)
    finish(root, kind='scenery')
    spin(wheel, 'X', frames=600, name='wheel')
    return root
