"""Plaza fountain. 'water' clip bobs the jets."""
from lib import *


def build():
    p = [lathe('basin', [(0.0, 0.0), (2.2, 0.0), (2.3, 0.1), (2.3, 0.55), (2.15, 0.62), (2.0, 0.55), (1.95, 0.25), (0.0, 0.25)], color='concrete', seg=48),
         cyl('pool', 1.98, 0.22, loc=(0, 0, 0.2), color='sky', seg=48, bev=0),
         lathe('column', [(0.0, 0.3), (0.5, 0.3), (0.35, 0.5), (0.3, 1.4), (0.25, 1.5), (0.0, 1.5)], color='concrete', seg=24),
         lathe('bowl', [(0.0, 1.45), (0.2, 1.45), (0.9, 1.7), (1.0, 1.85), (0.9, 1.88), (0.0, 1.7)], color='concrete', seg=32),
         cyl('bowlwater', 0.85, 0.1, loc=(0, 0, 1.72), color='sky', seg=32, bev=0),
         lathe('top', [(0.0, 1.8), (0.15, 1.8), (0.1, 2.3), (0.2, 2.4), (0.0, 2.5)], color='concrete', seg=16)]
    root = join(p, 'fountain')
    w = [lathe('jet', [(0.0, 2.4), (0.12, 2.5), (0.08, 2.9), (0.2, 3.1), (0.0, 3.2)], color='white', seg=16)]
    for i in range(6):
        a = i * math.pi / 3
        w.append(sphere(f'drop{i}', 0.12, loc=(math.cos(a) * 1.1, math.sin(a) * 1.1, 1.9), color='white', seg=10))
        w.append(sphere(f'splash{i}', 0.16, loc=(math.cos(a) * 1.9, math.sin(a) * 1.9, 0.5), color='white', seg=10, scale=(1, 1, 0.5)))
    water = join(w, 'water')
    parent(water, root)
    finish(root)
    keys(water, 'scale', [(0, (1, 1, 1)), (12, (1.05, 1.05, 1.08)), (24, (1, 1, 1))], name='water')
    return root
