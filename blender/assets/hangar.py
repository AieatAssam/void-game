"""Aircraft hangar: corrugated barrel-vault roof on ribbed arches, open sliding doors showing a dim interior
with a service gantry, lean-to offices with windows along one side, roof vents, and a big painted number."""
from kit import *

W, D, H = 18.0, 15.0, 9.0  # door span (Y), depth (X), crown height


def arch_point(t, r_scale=1.0):
    a = math.pi * t
    return math.cos(a) * W / 2 * r_scale, math.sin(a) * H * r_scale


def build():
    p = [box('slab', (D + 1.0, W + 1.0, 0.2), loc=(0, 0, 0.1), color='concrete', bev=0.05),
         box('interior_floor', (D - 0.6, W - 0.8, 0.02), loc=(0, 0, 0.21), color='asphalt_lt', bev=0, seg=1)]
    n = 18
    for i in range(n):  # roof shell: curved corrugated panels
        y0, z0 = arch_point(i / n)
        y1, z1 = arch_point((i + 1) / n)
        ym, zm = (y0 + y1) / 2, (z0 + z1) / 2
        L = math.hypot(y1 - y0, z1 - z0)
        a = math.atan2(z1 - z0, y1 - y0)
        p.append(box(f'panel{i}', (D, L + 0.02, 0.18), loc=(0, ym, zm + 0.2), color='concrete' if i % 2 else 'white', bev=0.02, seg=1, rot=(a, 0, 0)))
    for k in range(6):  # structural arches (ribs) outside the shell
        x = -D / 2 + 0.2 + k * (D - 0.4) / 5
        for i in range(n):
            y0, z0 = arch_point(i / n, 1.015)
            y1, z1 = arch_point((i + 1) / n, 1.015)
            p.append(tube(f'rib{k}{i}', (x, y0, z0 + 0.2), (x, y1, z1 + 0.2), r=0.14, color='sky', seg=8))
    # back wall (half disc) and the front door frame
    back = [(0, 0, 0.2)] + [(0, *arch_point(i / 24)) for i in range(25)]
    back = [(-D / 2, y, z + (0.2 if k else 0)) for k, (_, y, z) in enumerate(back)]
    p.append(mesh('backwall', back, [tuple(range(len(back)))], color='white'))
    for i in range(n):
        y0, z0 = arch_point(i / n)
        y1, z1 = arch_point((i + 1) / n)
        p.append(tube(f'doorframe{i}', (D / 2, y0, z0 + 0.2), (D / 2, y1, z1 + 0.2), r=0.3, color='red', seg=10))
    for s in (-1, 1):  # sliding door leaves parked open at the sides
        p += [box(f'door{s}', (0.3, 4.5, 6.0), loc=(D / 2 + 0.3, s * (W / 2 - 2.3), 3.2), color='red', bev=0.06),
              box(f'door_track{s}', (0.3, 7.0, 0.15), loc=(D / 2 + 0.3, s * (W / 2 - 3.5), 0.25), color='ink', bev=0.03)]
        for j in range(5):
            p.append(box(f'door_rib{s}{j}', (0.05, 4.4, 0.08), loc=(D / 2 + 0.47, s * (W / 2 - 2.3), 1.0 + j * 1.1), color='white', bev=0.01, seg=1))
    # service gantry inside
    for s in (-1, 1):
        p.append(tube(f'gantry_leg{s}', (-3, s * 5, 0.2), (-3, s * 5, 5.5), r=0.18, color='hazard', seg=8))
    p += [tube('gantry_beam', (-3, -5, 5.5), (-3, 5, 5.5), r=0.25, color='hazard', seg=8),
          box('hoist', (0.6, 0.8, 0.6), loc=(-3, 1.5, 5.0), color='ink', bev=0.08),
          tube('chain', (-3, 1.5, 4.7), (-3, 1.5, 2.8), r=0.03, color='steel', seg=5),
          box('engine_stand', (2.2, 1.2, 1.1), loc=(-3, 1.5, 0.75), color='olive', bev=0.1)]
    # lean-to offices along -Y
    p += [box('offices', (D - 1.0, 3.0, 3.6), loc=(0, -W / 2 - 1.7, 1.8), color='cream', bev=0.1),
          box('office_roof', (D - 0.6, 3.4, 0.25), loc=(0, -W / 2 - 1.7, 3.7), color='sky', bev=0.05)]
    for k in range(5):
        p.append(box(f'owin{k}', (1.4, 0.06, 1.0), loc=(-D / 2 + 2.2 + k * 2.6, -W / 2 - 3.22, 2.2), color='glass', bev=0.04))
    p.append(box('odoor', (1.0, 0.06, 2.1), loc=(D / 2 - 1.8, -W / 2 - 3.22, 1.05), color='navy', bev=0.03))
    for k in range(3):  # roof vents along the crown
        x = -D / 2 + 3 + k * 4.5
        p += [cyl(f'vent{k}', 0.45, 0.7, loc=(x, 0, H + 0.3), color='white', seg=14, bev=0.06),
              cyl(f'ventcap{k}', 0.6, 0.12, loc=(x, 0, H + 1.0), color='sky', seg=14, bev=0.04)]
    # airline sign on the office roof (the door opening is the full arch, so no header to paint on)
    p += [box('sign', (4.0, 0.25, 1.4), loc=(1.5, -W / 2 - 2.6, 4.55), color='white', bev=0.08),
          cyl('sign_logo', 0.5, 0.06, loc=(0.2, -W / 2 - 2.74, 4.55), color='lilac', seg=24, bev=0.01, rot=(math.pi / 2, 0, 0)),
          cyl('sign_void', 0.3, 0.07, loc=(0.2, -W / 2 - 2.75, 4.55), color='void', seg=20, bev=0.01, rot=(math.pi / 2, 0, 0))]
    for k in range(4):
        p.append(box(f'sign_txt{k}', (0.5, 0.05, 0.5), loc=(1.1 + k * 0.7, -W / 2 - 2.74, 4.55), color='navy', bev=0.02))
    for s in (-1, 1):
        p.append(box(f'sign_leg{s}', (0.15, 0.15, 0.9), loc=(1.5 + s * 1.6, -W / 2 - 2.6, 3.8), color='ink', bev=0.03))
    return tag(finish(join(p, 'hangar'), mass=260), 'airport', lod=[0.35, 0.12])
