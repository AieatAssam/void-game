"""Country railway station (rail pack): a raised platform with a white coping and yellow safety line,
a cast-iron canopy with a fretted valance, a brick-and-cream station house with a clock gable,
benches, lamps, a name board, a luggage trolley and potted flowers.
Place beside a rail tile with the platform edge (local y = -2.25) facing the track (see HANDOVER.md)."""
from kit import *


def build():
    Lp, Wp, Hp = 16.0, 4.5, 1.0
    p = [box('platform', (Lp, Wp, Hp), loc=(0, 0, Hp / 2), color='concrete', bev=0.05),
         box('coping', (Lp, 0.45, 0.08), loc=(0, -Wp / 2 + 0.2, Hp + 0.04), color='white', bev=0.02),
         box('safety', (Lp, 0.18, 0.012), loc=(0, -Wp / 2 + 0.62, Hp + 0.006), color='hazard', bev=0, seg=1)]
    for k in range(3):  # ramps + steps at the ends
        p.append(box(f'step{k}', (0.35, 2.0, Hp * (3 - k) / 3), loc=(Lp / 2 + 0.17 + k * 0.35, Wp / 2 - 1.2, Hp * (3 - k) / 6), color='concrete', bev=0.03))
    # canopy on cast-iron columns
    zc = Hp + 3.2
    for k in range(5):
        x = -6 + k * 3
        p += [cyl(f'col{k}', 0.1, 3.2, loc=(x, 0.4, Hp), color='navy', seg=12, bev=0.02),
              cyl(f'colbase{k}', 0.18, 0.3, loc=(x, 0.4, Hp), color='navy', seg=12, bev=0.04),
              tube(f'bracketA{k}', (x, 0.4, zc - 0.7), (x, -1.4, zc - 0.05), r=0.05, color='navy', seg=6),
              tube(f'bracketB{k}', (x, 0.4, zc - 0.7), (x, 1.8, zc - 0.05), r=0.05, color='navy', seg=6),
              torus(f'scroll{k}', 0.25, 0.03, loc=(x, -0.3, zc - 0.45), color='navy', seg=16, rseg=4, rot=(0, math.pi / 2, 0))]
    p += [box('canopy', (Lp - 2.0, 4.2, 0.14), loc=(0, 0.2, zc), color='red', bev=0.04, rot=(-0.06, 0, 0)),
          box('canopy_ridge', (Lp - 2.0, 0.3, 0.12), loc=(0, 0.3, zc + 0.12), color='white', bev=0.03)]
    for k in range(40):  # fretted valance along the platform edge
        x = -Lp / 2 + 1.2 + k * (Lp - 2.4) / 39
        p.append(box(f'fret{k}', (0.28, 0.04, 0.4), loc=(x, -1.9, zc - 0.25), color='white', bev=0.02, seg=1))
        p.append(sphere(f'fretdrop{k}', 0.05, loc=(x, -1.9, zc - 0.48), color='white', seg=6))
    # station house on the back half
    hx, hy, hw, hd, hh = 0.0, Wp / 2 + 2.0, 8.0, 3.6, 3.4
    p += [box('house', (hw, hd, hh), loc=(hx, hy, Hp + hh / 2), color='cream', bev=0.1),
          box('plinth', (hw + 0.2, hd + 0.2, 0.4), loc=(hx, hy, Hp + 0.2), color='brick_wall', bev=0.05),
          prism('house_roof', hd + 0.8, hw + 0.6, 1.6, loc=(hx, hy, Hp + hh), color='roof_tile', bev=0.06),
          box('chimney', (0.6, 0.6, 1.4), loc=(hx - 2.5, hy + 0.6, Hp + hh + 1.1), color='brick_wall', bev=0.05),
          box('door', (1.1, 0.06, 2.2), loc=(hx, hy - hd / 2 - 0.02, Hp + 1.1), color='navy', bev=0.04),
          box('fanlight', (1.1, 0.07, 0.35), loc=(hx, hy - hd / 2 - 0.025, Hp + 2.4), color='glass', bev=0.03)]
    for k, x in enumerate((-2.8, -1.6, 1.6, 2.8)):
        p += [box(f'hwin{k}', (0.8, 0.06, 1.2), loc=(hx + x, hy - hd / 2 - 0.02, Hp + 1.7), color='glass', bev=0.03),
              box(f'hsill{k}', (0.95, 0.15, 0.08), loc=(hx + x, hy - hd / 2 - 0.08, Hp + 1.05), color='white', bev=0.02),
              box(f'hbox{k}', (0.85, 0.22, 0.2), loc=(hx + x, hy - hd / 2 - 0.15, Hp + 0.85), color='wood', bev=0.03)]
        for j in range(3):
            p.append(sphere(f'flower{k}{j}', 0.08, loc=(hx + x - 0.25 + j * 0.25, hy - hd / 2 - 0.15, Hp + 1.0), color=('pink', 'red', 'butter')[j], seg=8))
    # gable clock
    p += [cyl('clock', 0.45, 0.1, loc=(hx, hy - hd / 2 - 0.35, Hp + hh + 0.6), color='white', seg=24, bev=0.03, rot=(math.pi / 2, 0, 0)),
          torus('clock_rim', 0.45, 0.05, loc=(hx, hy - hd / 2 - 0.4, Hp + hh + 0.6), color='navy', seg=24, rseg=5, rot=(math.pi / 2, 0, 0)),
          box('hand_h', (0.04, 0.02, 0.25), loc=(hx + 0.05, hy - hd / 2 - 0.42, Hp + hh + 0.68), color='ink', bev=0, seg=1, rot=(0, 0.6, 0)),
          box('hand_m', (0.03, 0.02, 0.35), loc=(hx, hy - hd / 2 - 0.43, Hp + hh + 0.75), color='ink', bev=0, seg=1)]
    # name board, benches, lamps, trolley
    p += [box('nameboard', (3.4, 0.1, 0.6), loc=(5.0, -1.2, Hp + 2.3), color='navy', bev=0.04),
          box('nameboard_in', (3.1, 0.11, 0.4), loc=(5.0, -1.2, Hp + 2.3), color='white', bev=0.02)]
    for s in (-1, 1):
        p.append(cyl(f'nb_leg{s}', 0.05, 2.0, loc=(5.0 + s * 1.5, -1.2, Hp), color='navy', seg=8, bev=0.01))
    for k in range(5):
        p.append(box(f'nb_letter{k}', (0.35, 0.12, 0.28), loc=(3.8 + k * 0.6, -1.2, Hp + 2.3), color='navy', bev=0.02))
    for k, x in enumerate((-5.0, -1.5, 2.0)):
        p += [box(f'bench{k}', (1.6, 0.45, 0.06), loc=(x, 1.3, Hp + 0.45), color='wood', bev=0.02),
              box(f'bench_back{k}', (1.6, 0.06, 0.4), loc=(x, 1.5, Hp + 0.7), color='wood', bev=0.02)]
        for s in (-1, 1):
            p.append(box(f'bench_leg{k}{s}', (0.06, 0.45, 0.45), loc=(x + s * 0.7, 1.3, Hp + 0.22), color='navy', bev=0.02))
    for k, x in enumerate((-7.2, 7.2)):
        p += [cyl(f'lamp{k}', 0.07, 3.0, loc=(x, -1.5, Hp), color='navy', seg=10, bev=0.01),
              box(f'lanternbox{k}', (0.35, 0.35, 0.45), loc=(x, -1.5, Hp + 3.2), color='navy', bev=0.04),
              box(f'lanternglass{k}', (0.28, 0.36, 0.3), loc=(x, -1.5, Hp + 3.2), color='glow', bev=0.02)]
    p += [box('trolley', (1.4, 0.8, 0.08), loc=(-3.0, -0.2, Hp + 0.4), color='wood', bev=0.02),
          tube('trolley_handle', (-3.7, -0.2, Hp + 0.44), (-4.1, -0.2, Hp + 1.0), r=0.03, color='ink'),
          box('trunk', (0.7, 0.5, 0.45), loc=(-3.1, -0.2, Hp + 0.67), color='navy', bev=0.05),
          box('case', (0.5, 0.3, 0.3), loc=(-2.65, -0.25, Hp + 0.6), color='clay', bev=0.04)]
    for s in (-1, 1):
        p += wheel(f'tw{s}', 0.18, 0.06, -2.55, s * 0.35 - 0.2, z=Hp + 0.18, detail=False)
    return tag(finish(join(p, 'station'), mass=120), 'rail', rail_offset=4.2)
