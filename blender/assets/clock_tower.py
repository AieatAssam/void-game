"""Landmark. Four 'hands*' clips sweep the minute hands."""
from kit import *


def build():
    S, H = 5.0, 16.0
    p = [box('shaft', (S, S, H), loc=(0, 0, H / 2), color='brick_wall', bev=0.2),
         box('base', (S + 1.0, S + 1.0, 2.5), loc=(0, 0, 1.25), color='concrete', bev=0.2),
         box('door', (0.2, 1.6, 2.4), loc=(S / 2 + 0.5, 0, 1.2), color='navy', bev=0.08),
         box('band1', (S + 0.3, S + 0.3, 0.4), loc=(0, 0, 8), color='cream', bev=0.1),
         box('head', (S + 0.8, S + 0.8, 4.0), loc=(0, 0, H + 2.0), color='cream', bev=0.25),
         box('cornice', (S + 1.2, S + 1.2, 0.4), loc=(0, 0, H + 4.1), color='brick', bev=0.1),
         lathe('spire', [(0.0, 0.0), (3.4, 0.0), (0.0, 5.0)], loc=(0, 0, H + 4.3), color='teal', seg=4, rot=(0, 0, math.pi / 4)),
         cyl('pole', 0.08, 1.5, loc=(0, 0, H + 9.2), color='steel', seg=8, bev=0),
         sphere('tip', 0.25, loc=(0, 0, H + 10.8), color='glow', seg=12)]
    for face, cx, cy in (('+x', S / 2 + 0.4, 0), ('-x', -S / 2 - 0.4, 0), ('+y', 0, S / 2 + 0.4), ('-y', 0, -S / 2 - 0.4)):
        p += window_grid(cx - (0.4 if face == '+x' else -0.4 if face == '-x' else 0), cy - (0.4 if face == '+y' else -0.4 if face == '-y' else 0),
                         4.5, 0.7, 1.6, 2, 3, 0.9, 1.2, face, color='glow', frame='cream')
    dials = []
    for k in range(4):
        a = k * math.pi / 2
        n = Vector((math.cos(a), math.sin(a), 0))
        rot = (0, math.pi / 2, a)
        c = n * (S / 2 + 0.4)
        p.append(cyl(f'dial{k}', 1.6, 0.15, loc=c + Vector((0, 0, H + 2.0)), color='white', seg=40, rot=rot, bev=0.05))
        p.append(torus(f'ring{k}', 1.6, 0.1, loc=c + n * 0.15 + Vector((0, 0, H + 2.0)), color='ink', seg=40, rseg=8, rot=rot))
        for t in range(12):
            b = t * math.pi / 6
            off = Vector((-math.sin(a) * math.cos(b), math.cos(a) * math.cos(b), math.sin(b))) * 1.3
            p.append(box(f'tick{k}{t}', (0.08, 0.12, 0.12) if t % 3 else (0.08, 0.2, 0.2), loc=c + n * 0.17 + off + Vector((0, 0, H + 2.0)), color='ink', bev=0.02, seg=1, rot=(0, 0, a)))
        p.append(box(f'hour{k}', (0.1, 0.16, 0.8), loc=c + n * 0.2 + Vector((0, 0, H + 2.35)), color='ink', bev=0.03, rot=(0, 0, a)))
        hand = box(f'hands{k}', (0.1, 0.12, 1.2), loc=(0, 0, 0.5), color='red', bev=0.03)
        hand = join([hand, sphere(f'pin{k}', 0.12, color='ink', seg=10)], f'hands{k}')
        hand.location = c + n * 0.3 + Vector((0, 0, H + 2.0))
        hand.rotation_euler = (math.pi / 2, 0, a + math.pi / 2)
        dials.append(hand)
    root = join(p, 'clock_tower')
    for k, h in enumerate(dials):
        parent(h, root)
    finish(root)
    for k, h in enumerate(dials):
        spin(h, 'Z', frames=240, name=f'hands{k}')
    return root
