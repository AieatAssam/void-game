"""Prize pumpkin (farm fair): a giant ribbed pumpkin with a twisted stem, a curly tendril and leaves, sitting
on a pallet with a blue first-prize rosette and a chalk-board weight sign."""
from kit import *


def ribbed(name, r, loc, color, ribs=10, depth=0.09, squash=0.72):
    ob = sphere(name, r, loc=(0, 0, 0), color=color, seg=40)
    for v in ob.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        k = 1 - depth * (0.5 + 0.5 * math.cos(ribs * a)) ** 3
        v.co.x *= k
        v.co.y *= k
        v.co.z *= squash
        if v.co.z > r * squash * 0.8:  # dimple at the stem
            v.co.z -= r * 0.08 * (v.co.z - r * squash * 0.8) / (r * squash * 0.2)
    ob.location = loc
    return ob


def build():
    R = 1.1
    zc = 0.25 + R * 0.72
    p = [box('pallet_top', (2.6, 2.6, 0.06), loc=(0, 0, 0.22), color='wood', bev=0.02)]
    for k in range(7):
        p.append(box(f'plank{k}', (2.6, 0.3, 0.05), loc=(0, -1.15 + k * 0.383, 0.27), color='wood', bev=0.015, seg=1))
    for k in range(3):
        p.append(box(f'runner{k}', (2.6, 0.14, 0.18), loc=(0, -1.1 + k * 1.1, 0.1), color='wood', bev=0.02))
    p += [ribbed('pumpkin', R, (0, 0, zc), 'terracotta'),
          cyl('stem', 0.14, 0.35, loc=(0, 0, zc + R * 0.64), color='forest', seg=10, r2=0.1, bev=0.03, rot=(0.2, 0.1, 0)),
          sphere('stem_cap', 0.12, loc=(0.03, -0.07, zc + R * 0.64 + 0.36), color='forest', seg=10, scale=(1, 1, 0.5))]
    pts = [Vector((0.05 + math.cos(t * 5) * 0.12 * (1 + t), 0.1 + math.sin(t * 5) * 0.12 * (1 + t), zc + R * 0.68 + 0.1 + t * 0.4)) for t in [i / 16 for i in range(17)]]
    for i in range(16):  # curly tendril
        p.append(tube(f'tendril{i}', pts[i], pts[i + 1], r=0.015, color='sage', seg=5))
    for k, (a, s) in enumerate(((0.8, 1.0), (2.6, 0.85), (4.4, 0.95))):  # leaves draped over the shoulders
        x, y = math.cos(a) * 0.55, math.sin(a) * 0.55
        p += [blob(f'leaf{k}', 0.38 * s, (x, y, zc + R * 0.6), 'foliage', seed=k, amp=0.3, scale=(1.2, 1.0, 0.18), seg=12),
              tube(f'vein{k}', (x * 0.4, y * 0.4, zc + R * 0.68), (x * 1.5, y * 1.5, zc + R * 0.5), r=0.012, color='sage', seg=4)]
    # blue rosette pinned to the front + weight board
    fx = R * 0.97
    p += [cyl('rosette', 0.26, 0.03, loc=(fx - 0.1, 0, zc + 0.1), color='police', seg=20, bev=0.01, rot=(0, math.pi / 2, 0)),
          cyl('rosette_in', 0.15, 0.04, loc=(fx - 0.09, 0, zc + 0.1), color='white', seg=16, bev=0.01, rot=(0, math.pi / 2, 0)),
          box('rosette_1', (0.02, 0.05, 0.14), loc=(fx - 0.04, 0, zc + 0.1), color='gold', bev=0.005, seg=1)]
    for s in (-1, 1):
        p.append(box(f'tail{s}', (0.02, 0.1, 0.4), loc=(fx - 0.08, s * 0.08, zc - 0.22), color='police', bev=0.005, seg=1, rot=(s * 0.25, 0, 0)))
    p += [box('board', (0.05, 0.9, 0.55), loc=(1.45, -0.6, 0.62), color='ink', bev=0.02),
          box('board_frame', (0.04, 1.0, 0.65), loc=(1.44, -0.6, 0.62), color='wood', bev=0.02),
          tube('board_leg1', (1.42, -0.95, 0.3), (1.6, -0.95, 0.0), r=0.025, color='wood'),
          tube('board_leg2', (1.42, -0.25, 0.3), (1.6, -0.25, 0.0), r=0.025, color='wood')]
    for k in range(3):  # chalk scribbles
        p.append(box(f'chalk{k}', (0.01, 0.6 - k * 0.12, 0.05), loc=(1.48, -0.6, 0.78 - k * 0.14), color='white', bev=0, seg=1))
    return tag(finish(join(p, 'prize_pumpkin'), mass=1.6), 'farmfair')
