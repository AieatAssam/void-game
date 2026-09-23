"""Tower crane: the top of the size ladder. 'swing' clip slews the jib; the hook load bobs."""
from lib import *


def build():
    H = 26.0
    p = [box('base', (4, 4, 1.2), loc=(0, 0, 0.6), color='concrete', bev=0.15)]
    for k in range(4):
        p.append(box(f'block{k}', (1.6, 1.6, 0.8), loc=((k % 2 - 0.5) * 2.2, (k // 2 - 0.5) * 2.2, 1.6), color='concrete', bev=0.1))
    for cx in (-0.7, 0.7):
        for cy in (-0.7, 0.7):
            p.append(box(f'leg{cx}{cy}', (0.18, 0.18, H), loc=(cx, cy, 1.2 + H / 2), color='hazard', bev=0.04, seg=1))
    for j in range(13):  # lattice bracing
        z = 2.2 + j * 2.0
        for s in range(4):
            a = s * math.pi / 2
            p.append(box(f'br{j}{s}', (0.1, 1.9, 0.1), loc=(math.cos(a) * 0.7, math.sin(a) * 0.7, z), color='hazard', bev=0, seg=1,
                         rot=(0.8, 0, a + math.pi / 2)))
    root = join(p, 'crane')
    top = H + 1.2
    j = [box('cab', (1.8, 1.6, 1.4), loc=(1.4, 0, 0.7), color='white', bev=0.15),
         box('cabglass', (0.2, 1.3, 0.8), loc=(2.3, 0, 0.9), color='sky', bev=0.05),
         box('turntable', (2.2, 2.2, 0.4), loc=(0, 0, 0), color='ink', bev=0.08),
         box('jib', (20, 0.9, 0.9), loc=(9, 0, 1.4), color='hazard', bev=0.1),
         box('counterjib', (7, 0.9, 0.6), loc=(-3.5, 0, 1.3), color='hazard', bev=0.1),
         box('weights', (2, 1.4, 1.6), loc=(-6, 0, 0.6), color='concrete', bev=0.12),
         box('apex', (0.6, 0.6, 4.0), loc=(0, 0, 3.4), color='hazard', bev=0.08),
         box('trolley', (0.8, 1.1, 0.4), loc=(13, 0, 0.8), color='ink', bev=0.08),
         cyl('cable', 0.03, 7.0, loc=(13, 0, -6.2), color='ink', seg=6, bev=0),
         box('hook', (0.3, 0.3, 0.5), loc=(13, 0, -6.4), color='red', bev=0.08),
         box('load', (1.8, 1.8, 0.9), loc=(13, 0, -7.2), color='sky', bev=0.1),
         sphere('beacon', 0.2, loc=(19, 0, 2.0), color='siren_red', seg=10)]
    for k in range(2):  # tie bars from apex
        j.append(box(f'tie{k}', (10.5 if k == 0 else 6.5, 0.08, 0.08), loc=(5 if k == 0 else -3, 0, 3.6), color='ink', bev=0, seg=1,
                     rot=(0, 0.3 if k == 0 else -0.35, 0)))
    for k in range(9):
        j.append(box(f'jl{k}', (0.08, 0.95, 0.95), loc=(1 + k * 2.2, 0, 1.4), color='ink', bev=0, seg=1, rot=(0.78, 0, 0)))
    jib = join(j, 'jib')
    jib.location = (0, 0, top)
    parent(jib, root)
    finish(root, kind='prop', mass=40, tier=11.5)  # the jib slews into the hole; base footprint is what matters
    keys(jib, 'rotation_euler', [(0, (0, 0, 0)), (180, (0, 0, 1.4)), (360, (0, 0, 0))], name='swing')
    return root
