"""Ground tile: construction site. Dirt, gravel, foundation slab (crane + dirt piles placed by the game)."""
from kit import *
import random


def build():
    r = random.Random(11)
    p = tile_base()
    p.append(grid('dirt', 28, 28, 28, 28, z=0.17, color_fn=lambda i, j: r.choice(('clay', 'clay', 'sand', 'terracotta'))))
    p.append(box('slab', (10, 10, 0.3), loc=(-5, -5, 0.2), color='concrete', bev=0.05, seg=1))
    for i in range(5):  # rebar grid on the slab
        p.append(box(f'rbx{i}', (9.5, 0.06, 0.06), loc=(-5, -9 + i * 2, 0.4), color='terracotta', bev=0, seg=1))
        p.append(box(f'rby{i}', (0.06, 9.5, 0.06), loc=(-9 + i * 2, -5, 0.43), color='terracotta', bev=0, seg=1))
    for k in range(40):  # gravel
        p.append(sphere(f'g{k}', r.uniform(0.08, 0.18), loc=(r.uniform(-13, 13), r.uniform(-13, 13), 0.18), color=r.choice(('concrete', 'steel', 'sand')),
                        seg=8, scale=(1, 1, 0.5)))
    for s in range(4):  # hoarding along the curb, low so the hole never looks walled in
        rot = s * math.pi / 2
        for k in range(12):
            d = -12.5 + k * 2.3
            x, y = math.cos(rot) * 13.8 - math.sin(rot) * d, math.sin(rot) * 13.8 + math.cos(rot) * d
            p.append(box(f'h{s}{k}', (0.1, 2.1, 0.5), loc=(x, y, 0.42), color=('hazard', 'ink')[k % 2], bev=0.02, seg=1, rot=(0, 0, rot)))
    return finish(join(p, 'tile_construction'), tier=20, mass=0, kind='tile')
