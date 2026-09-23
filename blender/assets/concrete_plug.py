"""FX: concrete dropped by helicopters/trucks. Unit radius; the game scales it to the hole."""
from lib import *
import random


def build():
    r = random.Random(5)
    body = lathe('slab', [(0.0, 0.0), (1.0, 0.0), (1.05, 0.1), (1.0, 0.45), (0.9, 0.55), (0.0, 0.6)], color='concrete', seg=40)
    p = [body]
    for i in range(7):
        a = r.random() * 2 * math.pi
        d = r.random() * 0.6
        c = cyl(f'rebar{i}', 0.035, 0.4 + r.random() * 0.4, loc=(math.cos(a) * d, math.sin(a) * d, 0.45), color='terracotta', seg=8, bev=0)
        c.rotation_euler = (r.uniform(-0.5, 0.5), r.uniform(-0.5, 0.5), 0)
        p.append(c)
    for i in range(10):
        a = r.random() * 2 * math.pi
        p.append(sphere(f'chunk{i}', 0.08 + r.random() * 0.1, loc=(math.cos(a) * 0.95, math.sin(a) * 0.95, 0.1 + r.random() * 0.3), color='concrete', seg=10))
    return finish(join(p, 'concrete_plug'), tier=1.0, kind='fx')
