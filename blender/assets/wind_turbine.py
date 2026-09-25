"""Region pack: a three-bladed wind turbine (hub 40 m). Tapered white tower, nacelle, spinner and blades with red
tips; the rotor spins (clip 'rotor'). Tier is the tower's footprint, not the rotor."""
from kit import *


def build():
    H = 40.0
    p = [cyl('tower', 1.5, H, loc=(0, 0, 0), color='white', seg=24, bev=0.05, r2=0.9),
         cyl('base', 2.4, 0.8, loc=(0, 0, 0), color='concrete', seg=24, bev=0.1),
         box('door', (0.1, 0.9, 2.0), loc=(1.5, 0, 1.8), color='steel', bev=0.03, seg=1),
         box('nacelle', (6.0, 2.4, 2.6), loc=(-0.5, 0, H + 1.2), color='white', bev=0.6)]
    tower = join(p, 'wind_turbine')
    blades = [sphere('spinner', 1.1, loc=(0, 0, 0), color='white', seg=16, scale=(1.5, 1, 1), rot=(0, 0, 0))]
    for k in range(3):
        a = k * math.tau / 3
        c, s = math.cos(a), math.sin(a)
        blade = box(f'blade{k}', (0.35, 1.4, 17.0), loc=(0, 0, 9.3), color='white', bev=0.15, seg=2)
        tip = box(f'tip{k}', (0.36, 1.0, 2.5), loc=(0, 0, 17.3), color='red', bev=0.12, seg=2)
        root = join([blade, tip], f'b{k}')
        root.rotation_euler = (a, 0, 0)
        blades.append(root)
    rotor = join(blades, 'rotor')
    rotor.location = (2.9, 0, H + 1.4)
    parent(rotor, tower)
    finish(tag(tower, 'region', lod=[0.4, 0.15]), tier=4.2)
    spin(rotor, 'X', frames=96, name='rotor')
    return tower
