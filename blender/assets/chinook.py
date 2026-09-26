"""Region pack (army): a twin-rotor heavy-lift helicopter with a cargo hook and four sling cables. It carries a giant
void lid (the game hangs a scaled concrete plug from the hook) and drops it ahead of the hole. Two rotor clips
('rotorF', 'rotorB')."""
from kit import *
from heli import rotor


def build():
    L = 13.0
    p = [box('body', (L, 2.8, 2.8), loc=(0, 0, 3.4), color='olive', bev=0.9, seg=3),
         sphere('nose', 1.5, loc=(L / 2 - 0.4, 0, 3.3), color='olive', seg=20, scale=(1.1, 0.95, 0.95)),
         sphere('glass', 1.1, loc=(L / 2 + 0.2, 0, 3.8), color='sky', seg=20, scale=(0.8, 0.9, 0.55)),
         box('pylonF', (2.6, 1.6, 1.2), loc=(L / 2 - 2.0, 0, 5.2), color='olive', bev=0.4),
         box('pylonB', (3.2, 1.8, 3.2), loc=(-L / 2 + 1.0, 0, 5.4), color='olive', bev=0.5, rot=(0, 0.25, 0)),
         box('ramp', (1.2, 2.4, 0.3), loc=(-L / 2 - 0.4, 0, 2.2), color='olive', bev=0.1, rot=(0, -0.3, 0))]
    for s in (-1, 1):
        p += [box(f'pod{s}', (7.0, 0.8, 1.2), loc=(-0.5, s * 1.6, 2.4), color='olive', bev=0.35),
              cyl(f'eng{s}', 0.6, 2.8, loc=(-L / 2 + 0.6, s * 1.5, 5.6), color='olive', seg=14, rot=(0, math.pi / 2, 0), bev=0.1),
              cyl(f'wheelF{s}', 0.45, 0.4, loc=(L / 2 - 2.5, s * 1.3, 0.45), color='ink', seg=16, rot=(math.pi / 2, 0, 0), bev=0.1),
              cyl(f'wheelB{s}', 0.45, 0.4, loc=(-L / 2 + 2.0, s * 1.8, 0.45), color='ink', seg=16, rot=(math.pi / 2, 0, 0), bev=0.1),
              tube(f'strutF{s}', (L / 2 - 2.5, s * 1.1, 0.5), (L / 2 - 2.5, s * 1.0, 2.2), r=0.1, color='steel', seg=6),
              tube(f'strutB{s}', (-L / 2 + 2.0, s * 1.6, 0.5), (-L / 2 + 2.0, s * 1.3, 2.2), r=0.1, color='steel', seg=6),
              cyl(f'round{s}', 0.5, 0.04, loc=(1.0, s * 1.41, 3.6), color='white', seg=18, rot=(math.pi / 2, 0, 0), bev=0)]
        for k in range(6):
            p.append(box(f'win{s}{k}', (0.5, 0.06, 0.45), loc=(-3.0 + k * 1.3, s * 1.41, 4.0), color='gloss_black', bev=0.03, seg=1))
    for sx in (-1, 1):  # hook + cables to the lid
        for sy in (-1, 1):
            p.append(tube(f'cable{sx}{sy}', (0, 0, 2.0), (sx * 2.4, sy * 2.4, -2.6), r=0.05, color='ink', seg=4))
    p.append(box('hook', (0.5, 0.5, 0.6), loc=(0, 0, 1.8), color='hazard', bev=0.1))
    root = join(p, 'chinook')
    for v in root.data.vertices:  # everything hangs from the rotors: lift it so the lid clears the ground
        v.co.z += 4.8
    f = rotor('rotorF', 3, 7.5, 0.9, 'ink', 'steel')
    b = rotor('rotorB', 3, 7.5, 0.9, 'ink', 'steel')
    f.location = (L / 2 - 2.0, 0, 10.8)
    b.location = (-L / 2 + 1.0, 0, 12.2)
    for r in (f, b):
        parent(r, root)
    finish(tag(root, 'region'), tier=8.0, kind='fx', unit='chinook')
    spin(f, 'Z', frames=12, name='rotorF')
    spin(b, 'Z', frames=12, turns=-1, name='rotorB')
    return root
