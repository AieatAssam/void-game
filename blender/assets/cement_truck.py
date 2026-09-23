"""Response unit (heat 2+): pours concrete that shrinks the hole. 'drum' clip spins the mixer."""
from kit import *


def build():
    L, W = 7.6, 2.5
    p = [box('chassis', (L, 1.6, 0.4), loc=(0, 0, 0.9), color='ink', bev=0.1),
         box('cab', (1.9, W, 1.8), loc=(L / 2 - 1.0, 0, 1.9), color='hazard', bev=0.3),
         box('glass', (0.3, W * 0.84, 0.8), loc=(L / 2 - 0.1, 0, 2.3), color='sky', bev=0.1),
         box('side_glass', (1.0, W + 0.04, 0.7), loc=(L / 2 - 1.1, 0, 2.3), color='sky', bev=0.1),
         box('grill', (0.12, 1.8, 0.6), loc=(L / 2 + 0.02, 0, 1.3), color='steel', bev=0.05),
         box('beacon', (0.3, 0.8, 0.16), loc=(L / 2 - 1.0, 0, 2.88), color='warn', bev=0.06),
         box('bump', (0.25, W, 0.35), loc=(L / 2 + 0.05, 0, 0.8), color='steel', bev=0.1),
         box('tank', (0.9, 1.0, 0.6), loc=(L / 2 - 2.4, -0.9, 1.3), color='steel', bev=0.2),
         box('ladder', (0.1, 0.5, 1.6), loc=(-L / 2 + 0.3, 0.9, 1.9), color='steel', bev=0.03),
         box('chute', (1.0, 0.5, 0.2), loc=(-L / 2 - 0.2, 0, 1.6), color='hazard', bev=0.05, rot=(0, 0.5, 0)),
         cyl('support_f', 0.25, 1.2, loc=(1.5, 0, 1.0), color='steel', seg=12),
         cyl('support_r', 0.25, 1.9, loc=(-2.8, 0, 1.0), color='steel', seg=12)]
    for s in (-1, 1):
        p.append(cyl(f'hl{s}', 0.15, 0.08, loc=(L / 2 + 0.02, s * 0.95, 1.4), color='glow', rot=(0, math.pi / 2, 0), seg=16, bev=0.02))
    p += wheels(L, W, 0.55, 0.45, xs=(2.7, -1.6, -2.8))
    root = join(p, 'cement_truck')
    drum = lathe('drum', [(0.0, -2.2), (0.35, -2.15), (0.9, -1.4), (1.25, -0.4), (1.3, 0.2), (1.2, 0.9), (0.7, 1.7),
                          (0.45, 2.0), (0.45, 2.2), (0.0, 2.2)], color='white', seg=32)
    paint(drum, 'police', faces=lambda f: int((math.atan2(f.center.y, f.center.x) / (2 * math.pi) * 4 + f.center.z * 0.9 + 20)) % 2 == 0 and abs(f.center.z) < 1.95)
    drum.location, drum.rotation_euler = (-1.0, 0, 2.55), (0, -math.pi / 2 + 0.25, 0)
    parent(drum, root)
    finish(root, kind='unit', unit='cement')
    spin(drum, 'Z', frames=48, name='drum')
    return root
