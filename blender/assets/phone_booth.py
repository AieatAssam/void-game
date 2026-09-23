from lib import *


def build():
    S, H = 0.9, 2.4
    p = [box('base', (S + 0.1, S + 0.1, 0.15), loc=(0, 0, 0.075), color='red', bev=0.04),
         box('roof', (S + 0.12, S + 0.12, 0.25), loc=(0, 0, H + 0.05), color='red', bev=0.08),
         lathe('dome', [(0.0, 0.3), (0.62, 0.0), (0.0, 0.0)], loc=(0, 0, H + 0.18), color='red', seg=4, rot=(0, 0, math.pi / 4)),
         sphere('crown', 0.08, loc=(0, 0, H + 0.52), color='hazard', seg=10)]
    for x in (-1, 1):
        for y in (-1, 1):
            p.append(box(f'post{x}{y}', (0.12, 0.12, H), loc=(x * S / 2, y * S / 2, H / 2), color='red', bev=0.03))
    for k in range(4):
        a = k * math.pi / 2
        n = Vector((math.cos(a), math.sin(a), 0))
        rot = (0, 0, a)
        p.append(box(f'glass{k}', (0.05, S - 0.1, 1.5), loc=n * S / 2 + Vector((0, 0, 1.2)), color='sky', bev=0.02, rot=rot))
        for j in range(3):
            p.append(box(f'bar{k}{j}', (0.07, S - 0.1, 0.06), loc=n * S / 2 + Vector((0, 0, 0.62 + j * 0.5)), color='red', bev=0.02, seg=1, rot=rot))
        p.append(box(f'sign{k}', (0.06, S - 0.2, 0.18), loc=n * S / 2 + Vector((0, 0, H - 0.18)), color='glow', bev=0.02, rot=rot))
    return finish(join(p, 'phone_booth'))
