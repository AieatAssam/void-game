"""Poison: modern-art sculpture. Swallowing it jams the hole for 2s."""
from lib import *


def build():
    p = [box('plinth', (1.1, 1.1, 0.7), loc=(0, 0, 0.35), color='concrete', bev=0.06),
         box('plaque', (0.04, 0.4, 0.18), loc=(0.55, 0, 0.4), color='hazard', bev=0.01),
         sphere('ball', 0.45, loc=(0, 0, 1.2), color='pink', seg=32)]
    n = 18
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(1 - y * y)
        a = i * math.pi * (3 - math.sqrt(5))
        d = Vector((math.cos(a) * r, math.sin(a) * r, y))
        c = cyl(f's{i}', 0.09, 0.42, color='steel', r2=0.005, seg=12, bev=0)
        c.location = Vector((0, 0, 1.2)) + d * 0.38
        c.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        p.append(c)
    return finish(join(p, 'spiky'), kind='poison', effect='jam')
