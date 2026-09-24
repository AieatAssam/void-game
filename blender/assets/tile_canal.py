"""Ground tile: a canal crossing the block, with walls, towpaths and footbridges (boats placed by the game)."""
from kit import *


def build():
    p = tile_base()
    p.append(grid('bankN', 28, 10, 1, 1, z=0.17, color_fn=lambda i, j: 'sand', loc=(0, 9, 0)))
    p.append(grid('bankS', 28, 10, 1, 1, z=0.17, color_fn=lambda i, j: 'sand', loc=(0, -9, 0)))
    for s in (-1, 1):
        p.append(box(f'wall{s}', (28, 0.6, 1.2), loc=(0, s * 4.3, -0.4), color='brick', bev=0.08))
        p.append(box(f'coping{s}', (28, 0.8, 0.12), loc=(0, s * 4.3, 0.22), color='concrete', bev=0.04))
        for k in range(8):
            p.append(cyl(f'bollard{s}{k}', 0.12, 0.45, loc=(-12 + k * 3.4, s * 4.4, 0.22), color='ink', seg=12, bev=0.03))
    p.append(box('bed', (28, 8, 0.2), loc=(0, 0, -1.0), color='teal', bev=0, seg=1))
    p.append(box('water', (28, 8, 0.05), loc=(0, 0, -0.35), color='water', bev=0, seg=1))
    for k, x in enumerate((-7, 7)):  # arched footbridges
        p.append(box(f'deck{k}', (2.2, 9.6, 0.25), loc=(x, 0, 0.55), color='clay', bev=0.06))
        for s in (-1, 1):
            p.append(box(f'rail{k}{s}', (0.1, 9.6, 0.1), loc=(x + s * 1.05, 0, 1.25), color='white', bev=0.03))
            for i in range(6):
                p.append(box(f'post{k}{s}{i}', (0.08, 0.08, 0.7), loc=(x + s * 1.05, -4.5 + i * 1.8, 0.95), color='white', bev=0.02, seg=1))
        p.append(torus(f'arch{k}', 3.6, 0.25, loc=(x, 0, -2.6), color='clay', seg=24, rseg=8, rot=(0, math.pi / 2, 0)))
    for k in range(6):  # lily pads
        p.append(cyl(f'lily{k}', 0.35, 0.03, loc=(-11 + k * 4.3, (-2 if k % 2 else 2.4), -0.32), color='forest', seg=12, bev=0))
    return finish(join(p, 'tile_canal'), tier=20, mass=0, kind='tile')
