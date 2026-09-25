"""Airport control tower: two-storey terminal-style base, tapered shaft with window slots, a flared
octagonal glass cab with outward-raked panes and mullions, catwalk railing, roof aerials, a beacon and a
radar dish that turns (clip 'radar')."""
from kit import *


def build():
    p = [box('base', (6.0, 6.0, 3.2), loc=(0, 0, 1.6), color='cream', bev=0.15),
         box('base_band', (6.1, 6.1, 0.25), loc=(0, 0, 3.1), color='sky', bev=0.05),
         box('entrance', (0.1, 1.8, 2.2), loc=(3.02, 0, 1.1), color='glass', bev=0.04),
         box('canopy', (1.2, 2.4, 0.15), loc=(3.5, 0, 2.4), color='white', bev=0.05)]
    for s in (-1, 1):
        for k in range(3):
            p.append(box(f'bwin{s}{k}', (1.1, 0.06, 0.8), loc=(-1.8 + k * 1.8, s * 3.02, 2.0), color='glass', bev=0.04))
    shaft = lathe('shaft', [(1.9, 3.2), (1.5, 6.0), (1.35, 14.0), (1.6, 15.2), (0, 15.2)], color='white', seg=32)
    p.append(shaft)
    for k in range(4):  # window slots up the shaft
        a = k * math.pi / 2
        for j in range(4):
            z = 6.5 + j * 1.8
            p.append(box(f'slot{k}{j}', (0.06, 0.35, 0.9), loc=(math.cos(a) * 1.44, math.sin(a) * 1.44, z), color='glass', bev=0.02, rot=(0, 0, a)))
    # the cab: octagonal floor, raked glass, mullions, roof
    zc = 15.2
    p += [cyl('cab_floor', 3.0, 0.35, loc=(0, 0, zc), color='sky', seg=8, bev=0.06),
          lathe('cab_glass', [(2.7, zc + 0.35), (3.2, zc + 2.4), (0, zc + 2.4)], color='glass', seg=8),
          cyl('cab_roof', 3.4, 0.35, loc=(0, 0, zc + 2.4), color='white', seg=8, bev=0.08),
          cyl('roof_cap', 1.5, 0.4, loc=(0, 0, zc + 2.75), color='cream', seg=16, bev=0.06)]
    for k in range(8):
        a = (k + 0.5) * math.pi / 4
        p.append(tube(f'mullion{k}', (math.cos(a) * 2.72, math.sin(a) * 2.72, zc + 0.35), (math.cos(a) * 3.22, math.sin(a) * 3.22, zc + 2.4), r=0.06, color='white', seg=6))
    for k in range(24):  # catwalk railing
        a = k * 2 * math.pi / 24
        p.append(cyl(f'rail_post{k}', 0.03, 0.8, loc=(math.cos(a) * 3.35, math.sin(a) * 3.35, zc - 0.45), color='white', seg=6, bev=0))
    p += [cyl('catwalk', 3.45, 0.12, loc=(0, 0, zc - 0.5), color='concrete', seg=32, bev=0.03),
          torus('rail', 3.35, 0.035, loc=(0, 0, zc + 0.35), color='white', seg=48, rseg=5)]
    for k, (x, y, h) in enumerate(((0.8, 0.6, 2.2), (-0.7, 0.8, 1.6), (0.3, -0.9, 1.2))):  # aerials
        p += [cyl(f'aerial{k}', 0.04, h, loc=(x, y, zc + 3.15), color='white', seg=6, bev=0),
              sphere(f'aerial_tip{k}', 0.07, loc=(x, y, zc + 3.15 + h), color='siren_red', seg=8)]
    p.append(cyl('radar_mast', 0.18, 0.8, loc=(0, 0, zc + 3.15), color='white', seg=10, bev=0.02))
    root = join(p, 'control_tower')
    dish = join([sphere('dish', 0.9, loc=(0.25, 0, 0.35), color='white', seg=20, scale=(0.3, 1.4, 0.7)),
                 box('dish_arm', (0.5, 0.12, 0.12), loc=(0.0, 0, 0.35), color='steel', bev=0.03),
                 cyl('dish_hub', 0.2, 0.3, color='ink', seg=12, bev=0.04),
                 sphere('feed', 0.08, loc=(0.7, 0, 0.35), color='siren_red', seg=8)], 'radar')
    dish.location = (0, 0, zc + 3.95)
    parent(dish, root)
    finish(root, mass=90)
    spin(dish, 'Z', frames=96, name='radar')
    return tag(root, 'airport', clone=True, lod=[0.35, 0.12])
