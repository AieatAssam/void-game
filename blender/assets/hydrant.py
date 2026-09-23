from lib import *


def build():
    p = [
        cyl('base', 0.2, 0.06, color='red', bev=0.02),
        lathe('body', [(0.0, 0.06), (0.15, 0.06), (0.15, 0.12), (0.13, 0.14), (0.13, 0.5),
                       (0.16, 0.52), (0.16, 0.56), (0.0, 0.56)], color='red'),
        lathe('cap', [(0.0, 0.56), (0.14, 0.56), (0.12, 0.64), (0.07, 0.69), (0.0, 0.7)], color='red'),
        cyl('top_nut', 0.035, 0.05, loc=(0, 0, 0.69), color='hazard', seg=6, bev=0.006),
        cyl('band', 0.155, 0.04, loc=(0, 0, 0.38), color='white', bev=0.012),
    ]
    for i, a in enumerate((0, math.pi, math.pi / 2)):
        big = i == 2
        r = 0.075 if big else 0.055
        d = Vector((math.cos(a), math.sin(a), 0))
        rot = (math.pi / 2, 0, a + math.pi / 2)
        p.append(cyl(f'noz{i}', r, 0.1, loc=d * 0.1 + Vector((0, 0, 0.36)), color='red', rot=rot))
        p.append(cyl(f'nut{i}', r * 0.55, 0.05, loc=d * 0.2 + Vector((0, 0, 0.36)), color='hazard', seg=6, rot=rot, bev=0.008))
    return finish(join(p, 'hydrant'), tier=0.2, mass=0.25)
