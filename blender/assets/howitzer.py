"""Region pack (army): a towed field howitzer with a long barrel, recuperator, shield, split trails dug in,
ammo crates and a camo net. Batteries of these on hilltops shell the hole (ring warnings). 'fire' clip recoils."""
from kit import *


def build():
    p = [box('shield', (0.15, 2.8, 1.4), loc=(0.6, 0, 1.3), color='olive', bev=0.08, rot=(0, -0.15, 0)),
         box('cradle', (2.2, 0.8, 0.6), loc=(0.1, 0, 1.25), color='olive', bev=0.12),
         box('axle', (0.4, 3.0, 0.3), loc=(0.0, 0, 0.75), color='ink', bev=0.06)]
    for s in (-1, 1):
        p += [cyl(f'tyre{s}', 0.7, 0.45, loc=(0.0, s * 1.35, 0.7), color='ink', seg=20, rot=(math.pi / 2, 0, 0), bev=0.14),
              cyl(f'hub{s}', 0.32, 0.47, loc=(0.0, s * 1.35, 0.7), color='olive', seg=14, rot=(math.pi / 2, 0, 0), bev=0.05),
              tube(f'trail{s}', (-0.3, s * 0.3, 0.8), (-4.2, s * 1.8, 0.15), r=0.18, color='olive', seg=10),
              box(f'spade{s}', (0.2, 0.8, 0.6), loc=(-4.3, s * 1.85, 0.25), color='ink', bev=0.05)]
    for k in range(4):  # ammo crates + shells
        p += [box(f'crate{k}', (0.9, 0.5, 0.4), loc=(-1.6 + (k % 2) * 1.0, 2.6 + (k // 2) * 0.1, 0.2 + (k // 2) * 0.4), color='wood', bev=0.04),
              box(f'crateS{k}', (0.92, 0.52, 0.08), loc=(-1.6 + (k % 2) * 1.0, 2.6 + (k // 2) * 0.1, 0.25 + (k // 2) * 0.4), color='hazard', bev=0, seg=1)]
    for k in range(3):
        p.append(lathe(f'shell{k}', [(0, 0), (0.13, 0), (0.13, 0.5), (0.05, 0.7), (0, 0.72)], loc=(-0.4 + k * 0.3, -2.6, 0), color='gold', seg=12))
    root = join(p, 'howitzer')
    barrel = join([cyl('tube', 0.17, 4.4, loc=(0, 0, 0), color='olive', seg=20, rot=(0, math.pi / 2, 0), bev=0.03),
                   cyl('recup', 0.14, 2.0, loc=(0, 0, 0.3), color='olive', seg=14, rot=(0, math.pi / 2, 0), bev=0.03),
                   cyl('brake', 0.28, 0.5, loc=(4.3, 0, 0), color='ink', seg=16, rot=(0, math.pi / 2, 0), bev=0.06)], 'barrel')
    barrel.location = (0.2, 0, 1.5)
    barrel.rotation_euler = (0, -0.35, 0)
    parent(barrel, root)
    finish(tag(root, 'region'), kind='unit', unit='howitzer')
    keys(barrel, 'location', [(0, barrel.location.copy()), (2, barrel.location + Vector((-0.7, 0, -0.25))), (18, barrel.location.copy())], name='fire')
    return root
