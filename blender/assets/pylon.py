"""Region pack (hazard): a steel lattice electricity pylon (32 m) with three cross-arms, glass insulator strings
and a red warning disc. Swallowing one zaps the hole: a short jam and sparks (poison class). Lines between pylons
are drawn by the game."""
from kit import *


def build():
    H = 32.0
    B, T = 3.2, 0.9  # half-width at base and at the top of the body
    p = []
    lv = [0.0, 8.0, 15.0, 21.0, 26.0, 29.0]
    def hw(z):
        return B + (T - B) * min(1, z / 26.0)
    for sx in (-1, 1):  # four corner legs
        for sy in (-1, 1):
            p.append(tube(f'leg{sx}{sy}', (sx * B, sy * B, 0), (sx * T, sy * T, 29.0), r=0.14, color='steel', seg=6))
            p.append(box(f'foot{sx}{sy}', (1.0, 1.0, 0.5), loc=(sx * B, sy * B, 0.25), color='concrete', bev=0.08, seg=1))
    for i in range(len(lv) - 1):  # lattice: horizontals + diagonals on each face
        z0, z1 = lv[i], lv[i + 1]
        a, b = hw(z0), hw(z1)
        for face in range(4):
            ang = face * math.pi / 2
            c, s = math.cos(ang), math.sin(ang)
            def P(u, z, h):
                return (c * h - s * u * h, s * h + c * u * h, z)
            p.append(tube(f'h{i}{face}', P(-1, z1, b), P(1, z1, b), r=0.07, color='steel', seg=4))
            p.append(tube(f'd{i}{face}a', P(-1, z0, a), P(1, z1, b), r=0.05, color='steel', seg=4))
            p.append(tube(f'd{i}{face}b', P(1, z0, a), P(-1, z1, b), r=0.05, color='steel', seg=4))
    p.append(lathe('peak', [(0, 0), (1.3, 0), (0.05, 3.0), (0, 3.0)], loc=(0, 0, 29.0), color='steel', seg=4, rot=(0, 0, math.pi / 4)))
    for k, (z, span) in enumerate(((17.0, 7.5), (22.0, 6.0), (26.5, 5.0))):  # cross-arms with insulators
        p.append(box(f'arm{k}', (0.5, 2 * span, 0.5), loc=(0, 0, z), color='steel', bev=0.05, seg=1))
        for s in (-1, 1):
            p.append(tube(f'strut{k}{s}', (0, s * hw(z - 2.5), z - 2.5), (0, s * span, z), r=0.08, color='steel', seg=4))
            for j in range(5):
                p.append(cyl(f'ins{k}{s}{j}', 0.28, 0.14, loc=(0, s * (span - 0.2), z - 0.5 - j * 0.35), color='glass', seg=10, bev=0.03))
    p += [cyl('disc', 0.6, 0.06, loc=(B * 0.72 + 0.1, 0, 4.5), color='red', seg=16, rot=(0, math.pi / 2, 0), bev=0.02),
          box('bolt', (0.07, 0.2, 0.6), loc=(B * 0.72 + 0.14, 0, 4.5), color='hazard', bev=0.01, seg=1, rot=(0.4, 0, 0))]
    return finish(tag(join(p, 'pylon'), 'region', effect='zap', lod=[0.45, 0.2]), tier=3.4, kind='poison')
