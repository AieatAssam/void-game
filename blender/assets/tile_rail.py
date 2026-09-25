"""Ground tile: railway. A ballasted track runs the full 40 m edge to edge along X (rails at y = +/-0.75, rail top
z = 0.47 - trains sit there). Grass verges with lineside fences on the block; level crossings with rubber
panels, barriers, flashing lights and road paint where the track crosses the ring road. Rotate 180 only."""
from kit import *


def build():
    h, rt = TILE / 2, 0.47
    p = [grid('road', TILE, TILE, 1, 1, color_fn=lambda i, j: 'asphalt')]
    # ballast bed: trapezoid prism along X
    v = [(-h, -2.2, 0), (-h, 2.2, 0), (-h, 1.6, 0.26), (-h, -1.6, 0.26), (h, -2.2, 0), (h, 2.2, 0), (h, 1.6, 0.26), (h, -1.6, 0.26)]
    p.append(mesh('ballast', v, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], color='concrete'))
    for k in range(61):  # sleepers
        x = -h + 0.33 + k * (TILE - 0.66) / 60
        p.append(box(f'sleeper{k}', (0.24, 2.5, 0.12), loc=(x, 0, 0.32), color='wood', bev=0.02, seg=1))
    for s in (-1, 1):  # rails: foot, web, head
        y = s * 0.75
        p += [box(f'rail_foot{s}', (TILE, 0.14, 0.03), loc=(0, y, 0.395), color='steel', bev=0, seg=1),
              box(f'rail_web{s}', (TILE, 0.04, 0.07), loc=(0, y, 0.44), color='steel', bev=0, seg=1),
              box(f'rail_head{s}', (TILE, 0.08, 0.03), loc=(0, y, rt - 0.015), color='chrome', bev=0.008, seg=1)]
    # grass verges + curbs on the block either side of the track
    for s in (-1, 1):
        p += [box(f'verge{s}', (30.0, 12.6, 0.18), loc=(0, s * 8.7, 0.09), color='sage', bev=0.05, seg=1),
              box(f'curbO{s}', (30.6, 0.3, 0.2), loc=(0, s * 15.0, 0.1), color='concrete', bev=0.05, seg=1)]
        for k in range(15):  # lineside fence posts + two wires
            x = -14 + k * 2.0
            p.append(cyl(f'fpost{s}{k}', 0.05, 1.1, loc=(x, s * 3.2, 0.18), color='wood', seg=6, bev=0.01))
        for z in (0.6, 1.0):
            p.append(tube(f'wire{s}{z}', (-14, s * 3.2, 0.18 + z), (14, s * 3.2, 0.18 + z), r=0.012, color='steel', seg=4))
    # level crossings where the track meets the ring road (|x| > 15)
    for e in (-1, 1):
        cx = e * 17.5
        p += [box(f'panel{e}', (5.0, 2.9, rt - 0.02), loc=(cx, 0, (rt - 0.02) / 2), color='ink', bev=0.03, seg=1)]
        for k in range(6):
            p.append(box(f'panel_rib{e}{k}', (0.08, 2.9, 0.012), loc=(cx - 2.2 + k * 0.88, 0, rt - 0.015), color='asphalt_lt', bev=0, seg=1))
        for s in (-1, 1):
            bx, by = e * 15.6, s * 2.9
            p += [cyl(f'bpost{e}{s}', 0.12, 1.2, loc=(bx, by, 0), color='white', seg=10, bev=0.03),
                  box(f'bmotor{e}{s}', (0.4, 0.4, 0.5), loc=(bx, by, 1.2), color='white', bev=0.06),
                  box(f'lights{e}{s}', (0.1, 0.9, 0.3), loc=(bx + e * 0.25, by, 1.9), color='ink', bev=0.04),
                  cyl(f'lampL{e}{s}', 0.1, 0.06, loc=(bx + e * 0.3, by - 0.28, 1.9), color='siren_red', seg=10, bev=0.02, rot=(0, e * math.pi / 2, 0)),
                  cyl(f'lampR{e}{s}', 0.1, 0.06, loc=(bx + e * 0.3, by + 0.28, 1.9), color='siren_red', seg=10, bev=0.02, rot=(0, e * math.pi / 2, 0)),
                  cyl(f'xsign{e}{s}', 0.03, 0.9, loc=(bx, by, 1.45), color='ink', seg=6, bev=0)]
            for d in (-1, 1):  # crossbuck
                p.append(box(f'buck{e}{s}{d}', (0.04, 0.9, 0.14), loc=(bx + e * 0.05, by, 2.35), color='white' if d > 0 else 'red', bev=0.02, rot=(d * 0.6, 0, 0)))
            for k in range(6):  # raised boom (vertical), striped
                p.append(box(f'boom{e}{s}{k}', (0.1, 0.1, 0.55), loc=(bx, by + s * 0.25, 1.75 + k * 0.55), color='red' if k % 2 else 'white', bev=0.02, seg=1))
        for s in (-1, 1):  # road paint: stop lines + a warning X on each approach
            p.append(box(f'stopline{e}{s}', (3.2, 0.3, 0.012), loc=(cx, s * 4.0, 0.006), color='white', bev=0, seg=1))
            for d in (-1, 1):
                p.append(box(f'x{e}{s}{d}', (2.2, 0.25, 0.012), loc=(cx, s * 7.0, 0.007), color='hazard', bev=0, seg=1, rot=(0, 0, d * 0.7 + math.pi / 2)))
    # signal post on the verge
    p += [cyl('signal_post', 0.08, 4.2, loc=(6, -2.6, 0.18), color='ink', seg=8, bev=0.01),
          box('signal_head', (0.2, 0.5, 1.2), loc=(6.05, -2.6, 3.9), color='ink', bev=0.06)]
    for k, c in enumerate(('siren_red', 'hazard', 'toxic')):
        p.append(sphere(f'aspect{k}', 0.12, loc=(6.16, -2.6, 4.3 - k * 0.38), color=c, seg=8))
    return tag(finish(join(p, 'tile_rail'), tier=20, mass=0, kind='tile'), 'rail', rot180=True, rail_top=rt)
