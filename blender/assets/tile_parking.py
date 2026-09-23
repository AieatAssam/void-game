"""Ground tile: surface car park. Lots of mid-size food (cars placed by the game)."""
from kit import *


def build():
    p = tile_base()
    p.append(grid('lot', 28, 28, 1, 1, z=0.17, color_fn=lambda i, j: 'asphalt_lt'))
    for row in (-8, 0, 8):
        for k in range(11):
            p.append(box(f'bay{row}{k}', (0.12, 4.8, 0.02), loc=(-12.5 + k * 2.5, row, 0.18), color='white', bev=0, seg=1))
    for k, y in enumerate((-4, 4)):
        for i in range(6):
            p.append(box(f'arrow{k}{i}', (1.2, 0.2, 0.02), loc=(-10 + i * 4, y, 0.18), color='hazard', bev=0, seg=1))
    for k in range(4):  # pay-and-display machines + planter islands
        p.append(box(f'pay{k}', (0.4, 0.3, 1.2), loc=(-13, -12 + k * 8, 0.77), color='sky', bev=0.06))
        if k in (1, 2):
            p.append(box(f'island{k}', (26, 0.8, 0.25), loc=(0, -12 + k * 8, 0.3), color='concrete', bev=0.08))
    for k in range(10):
        p.append(sphere(f'shrub{k}', 0.45, loc=(-11 + k * 2.4, (-4 if k % 2 else 4), 0.55), color=('sage', 'forest')[k % 2], seg=12))
    return finish(join(p, 'tile_parking'), tier=20, mass=0, kind='tile')
