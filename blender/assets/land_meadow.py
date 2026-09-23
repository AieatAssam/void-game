"""Countryside tile outside the city: rolling hills that fall to zero at the edges so tiles join seamlessly."""
from kit import *
import random


def hills(name, colors, amp, seed, n=24):
    r = random.Random(seed)
    bumps = [(r.uniform(0.15, 0.85), r.uniform(0.15, 0.85), r.uniform(0.12, 0.3), r.uniform(0.4, 1.0)) for _ in range(4)]

    def h(u, v):
        edge = math.sin(math.pi * u) * math.sin(math.pi * v)
        return amp * edge * sum(a * math.exp(-((u - bx) ** 2 + (v - by) ** 2) / (2 * w * w)) for bx, by, w, a in bumps)
    def band(i, j):  # colour by height: valley, slope, hilltop
        z = h((i + 0.5) / n, (j + 0.5) / n) / max(amp, 1e-3)
        return colors[0] if z < 0.12 else colors[1] if z < 0.35 else colors[2]
    g = grid(name, TILE, TILE, n, n, color_fn=band)
    for vtx in g.data.vertices:
        u, v = vtx.co.x / TILE + 0.5, vtx.co.y / TILE + 0.5
        vtx.co.z = h(u, v)
    return g, h


def build():
    g, h = hills('hills', ('sage', 'mint', 'forest'), 7.0, 3)
    p = [g]
    r = random.Random(8)
    for k in range(30):
        u, v = r.uniform(0.05, 0.95), r.uniform(0.05, 0.95)
        p.append(sphere(f'fl{k}', 0.25, loc=((u - 0.5) * TILE, (v - 0.5) * TILE, h(u, v) + 0.1), color=r.choice(('pink', 'butter', 'white')), seg=8, scale=(1, 1, 0.5)))
    return finish(join(p, 'land_meadow'), tier=20, mass=0, kind='scenery', smooth_angle=60)
