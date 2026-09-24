"""Water tower (chain reaction: topple it and a wave floods out, slowing units and floating props toward
the hole). Riveted tank on four braced legs, conical roof with a finial, balcony catwalk, ladder, overflow
pipe and a painted town disc."""
from kit import *


def build():
    zt, Rt, Ht = 7.0, 2.4, 3.0  # tank bottom, radius, height
    p = []
    legs = [(math.cos(a) * 2.0, math.sin(a) * 2.0) for a in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4)]
    for k, (x, y) in enumerate(legs):
        p += [tube(f'leg{k}', (x * 1.35, y * 1.35, 0), (x, y, zt + 0.2), r=0.18, color='sky', seg=10),
              cyl(f'foot{k}', 0.45, 0.3, loc=(x * 1.35, y * 1.35, 0), color='concrete', seg=12, bev=0.05)]
    for i in range(4):  # X bracing between neighbouring legs, two tiers, plus a ring girt
        a, b = legs[i], legs[(i + 1) % 4]
        for z0, z1 in ((0.6, 3.6), (3.6, 6.6)):
            fa, fb = 1.35 - (1.35 - 1) * z0 / (zt + 0.2), 1.35 - (1.35 - 1) * z1 / (zt + 0.2)
            p += [tube(f'x{i}{z0}a', (a[0] * fa, a[1] * fa, z0), (b[0] * fb, b[1] * fb, z1), r=0.05, color='white', seg=6),
                  tube(f'x{i}{z0}b', (b[0] * fa, b[1] * fa, z0), (a[0] * fb, a[1] * fb, z1), r=0.05, color='white', seg=6)]
        f = 1.35 - 0.35 * 3.6 / (zt + 0.2)
        p.append(tube(f'girt{i}', (a[0] * f, a[1] * f, 3.6), (b[0] * f, b[1] * f, 3.6), r=0.08, color='sky', seg=6))
    p += [lathe('tank', [(0.0, zt - 0.4), (1.2, zt - 0.3), (Rt, zt), (Rt, zt + Ht), (0.0, zt + Ht)], color='sky', seg=48),
          lathe('roof', [(Rt + 0.2, zt + Ht), (1.4, zt + Ht + 0.9), (0.3, zt + Ht + 1.4), (0.0, zt + Ht + 1.45)], color='white', seg=48),
          cyl('finial', 0.05, 0.6, loc=(0, 0, zt + Ht + 1.4), color='white', seg=6, bev=0),
          sphere('finial_ball', 0.14, loc=(0, 0, zt + Ht + 2.0), color='red', seg=10),
          cyl('catwalk', Rt + 0.7, 0.1, loc=(0, 0, zt - 0.05), color='concrete', seg=48, bev=0.03),
          torus('handrail', Rt + 0.65, 0.04, loc=(0, 0, zt + 0.95), color='white', seg=48, rseg=5)]
    for k in range(4):  # tank bands with rivets
        z = zt + 0.3 + k * 0.8
        p.append(torus(f'band{k}', Rt + 0.01, 0.035, loc=(0, 0, z), color='white', seg=48, rseg=4))
    for k in range(32):
        a = k * 2 * math.pi / 32
        p.append(cyl(f'rpost{k}', 0.025, 1.0, loc=(math.cos(a) * (Rt + 0.65), math.sin(a) * (Rt + 0.65), zt + 0.05), color='white', seg=5, bev=0))
    # painted town disc
    p += [cyl('disc', 1.1, 0.04, loc=(Rt - 0.01, 0, zt + 1.6), color='white', seg=32, bev=0.01, rot=(0, math.pi / 2, 0)),
          cyl('disc_in', 0.8, 0.05, loc=(Rt, 0, zt + 1.6), color='lilac', seg=32, bev=0.01, rot=(0, math.pi / 2, 0)),
          cyl('disc_void', 0.45, 0.06, loc=(Rt + 0.01, 0, zt + 1.6), color='void', seg=24, bev=0.01, rot=(0, math.pi / 2, 0))]
    # ladder up one leg to the catwalk
    lx, ly = legs[0][0] * 1.1 + 0.5, legs[0][1] * 1.1 - 0.5
    for s in (-0.25, 0.25):
        p.append(tube(f'ladder{s}', (lx + s, ly - s, 0.2), (lx + s, ly - s, zt), r=0.03, color='white', seg=5))
    for k in range(22):
        z = 0.5 + k * 0.3
        p.append(tube(f'rung{k}', (lx - 0.25, ly + 0.25, z), (lx + 0.25, ly - 0.25, z), r=0.02, color='white', seg=4))
    p += [tube('overflow', (-Rt * 0.7, -Rt * 0.7, zt - 0.2), (-2.2, -2.2, 0.3), r=0.12, color='sky', seg=8),
          cyl('drain', 0.35, 0.12, loc=(-2.25, -2.25, 0), color='concrete', seg=12, bev=0.03)]
    return tag(finish(join(p, 'water_tower'), mass=30), 'chain', effect='flood', lod=[0.4, 0.14])
