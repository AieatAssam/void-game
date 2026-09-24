"""Ground tile: airport runway. A 14 m runway runs the full 40 m edge to edge along X (tiles in a row join into
one strip - rotate only by 180 deg, like the canal). Centreline dashes, edge lines, touchdown bars,
edge lights, a yellow taxiway lead-off, and grass verges. The outer 5 m on the +/-Y edges stays road-grey so the
city's roads still meet it."""
from kit import *


def build():
    h = TILE / 2
    p = [grid('apron', TILE, TILE, 1, 1, z=0.0, color_fn=lambda i, j: 'asphalt')]
    for s in (-1, 1):  # grass verges between the runway shoulders and the road edge
        p.append(box(f'verge{s}', (TILE, 6.8, 0.12), loc=(0, s * 11.4, 0.06), color='sage', bev=0.04, seg=1))
        p.append(box(f'curb{s}', (TILE, 0.3, 0.16), loc=(0, s * 14.95, 0.08), color='concrete', bev=0.04, seg=1))
    p.append(box('runway', (TILE, 14.0, 0.03), loc=(0, 0, 0.015), color='asphalt_lt', bev=0, seg=1))
    for s in (-1, 1):
        p.append(box(f'edge{s}', (TILE, 0.35, 0.012), loc=(0, s * 6.6, 0.036), color='white', bev=0, seg=1))
        for k in range(10):  # edge lights (inset domes)
            x = -h + 2 + k * 4
            p += [cyl(f'lbase{s}{k}', 0.16, 0.06, loc=(x, s * 7.2, 0.03), color='ink', seg=10, bev=0.02),
                  sphere(f'light{s}{k}', 0.1, loc=(x, s * 7.2, 0.1), color='glow' if s > 0 else 'glow_white', seg=8, scale=(1, 1, 0.7))]
    for k in range(8):  # centreline dashes (half-dash at each tile edge so neighbours join seamlessly)
        x = -h + 2.5 + k * 5
        p.append(box(f'dash{k}', (3.0, 0.45, 0.012), loc=(x, 0, 0.036), color='white', bev=0, seg=1))
    for x in (-10, 10):  # touchdown zone bars
        for s in (-1, 1):
            for j in range(3):
                p.append(box(f'td{x}{s}{j}', (4.0, 0.4, 0.012), loc=(x, s * (2.2 + j * 0.9), 0.036), color='white', bev=0, seg=1))
    # yellow taxiway lead-off curving to the +Y verge, with blue edge markers
    pts = [(4 + 6 * math.sin(t * math.pi / 2), 6.8 * (t ** 1.3), 0.037) for t in [i / 10 for i in range(11)]]
    for i in range(10):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        d = b - a
        p.append(box(f'taxi{i}', (d.length + 0.05, 0.25, 0.012), loc=(a + b) / 2, color='hazard', bev=0, seg=1, rot=(0, 0, math.atan2(d.y, d.x))))
    for k in range(4):
        p.append(cyl(f'blue{k}', 0.1, 0.35, loc=(8 + k * 1.5, 7.6, 0.12), color='siren_blue', seg=8, bev=0.03))
    # windsock on the -Y verge
    p += [cyl('sock_pole', 0.06, 4.0, loc=(-12, -10.5, 0.12), color='white', seg=8, bev=0.01),
          cyl('sock', 0.3, 1.6, loc=(-12, -10.5, 3.9), color='warn', seg=12, r2=0.14, bev=0, rot=(0, math.pi / 2 - 0.25, 0)),
          *[torus(f'sock_band{k}', 0.26 - k * 0.04, 0.03, loc=(-12 + 0.35 + k * 0.45, -10.5, 3.95 + k * 0.11), color='white', seg=12, rseg=4, rot=(0, math.pi / 2 - 0.25, 0)) for k in range(3)]]
    return tag(finish(join(p, 'tile_runway'), tier=20, mass=0, kind='tile'), 'airport', rot180=True)
