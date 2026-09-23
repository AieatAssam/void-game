from kit import *


def tube(name, a, b, r=0.025, color='pink'):
    a, b = Vector(a), Vector(b)
    d = b - a
    ob = cyl(name, r, d.length, loc=a, color=color, seg=10, bev=0)
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return ob


def build():
    R = 0.34
    fx, rx = 0.52, -0.52
    p = []
    for n, x in (('f', fx), ('r', rx)):
        p += [torus(f'tire{n}', R, 0.04, loc=(x, 0, R + 0.04), color='ink', seg=32, rseg=8, rot=(math.pi / 2, 0, 0)),
              torus(f'rim{n}', R - 0.05, 0.015, loc=(x, 0, R + 0.04), color='steel', seg=32, rseg=6, rot=(math.pi / 2, 0, 0)),
              cyl(f'hub{n}', 0.05, 0.1, loc=(x, 0.05, R + 0.04), color='steel', rot=(math.pi / 2, 0, 0), seg=12, bev=0.01)]
    hz = R + 0.04
    bb = (0.0, 0, hz)
    seat = (-0.14, 0, 0.9)
    head = (0.4, 0, 0.92)
    p += [tube('down', bb, head), tube('top', seat, head), tube('seat', bb, seat),
          tube('cs', bb, (rx, 0, hz)), tube('ss', seat, (rx, 0, hz)), tube('fork', head, (fx, 0, hz)),
          tube('stem', head, (0.38, 0, 1.05), color='steel'),
          cyl('bar', 0.022, 0.5, loc=(0.38, 0.25, 1.05), color='steel', rot=(math.pi / 2, 0, 0), seg=10, bev=0),
          box('saddle', (0.24, 0.12, 0.06), loc=(-0.16, 0, 0.94), color='ink', bev=0.03),
          cyl('crank', 0.08, 0.06, loc=(0, 0.03, hz), color='steel', rot=(math.pi / 2, 0, 0), seg=16, bev=0.01),
          box('basket', (0.24, 0.3, 0.2), loc=(0.6, 0, 1.0), color='sand', bev=0.03)]
    return finish(join(p, 'bicycle'))
