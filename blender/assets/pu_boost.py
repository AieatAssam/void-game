"""Power-up: Surge - a burst of speed that outruns cars (and a trail that scares crowds your way)."""
from pickup_kit import *


def build():
    pts = [(0.05, 0.28), (-0.12, 0.02), (0.0, 0.02), (-0.06, -0.26), (0.14, 0.04), (0.02, 0.04)]
    t = 0.05
    v = [(x, -t, z) for x, z in pts] + [(x, t, z) for x, z in pts]
    n = len(pts)
    f = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    icon = [bevel(mesh('bolt', v, f, color='hazard'), 0.015, 2)]
    icon += [sphere(f'spark{k}', 0.02, loc=(math.cos(k * 2.1) * 0.2, math.sin(k * 2.1) * 0.1, 0.15 - k * 0.06), color='glow', seg=5) for k in range(5)]
    return capsule('pu_boost', 'hazard', 'glow', icon, 'boost')
