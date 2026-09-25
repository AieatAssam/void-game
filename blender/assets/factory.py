"""Region pack: a Victorian brick factory (tier ~14). A long weaving shed with a sawtooth north-light roof, an
office block with a clock and painted company sign, loading bays with roller doors, a water tank on stilts,
and pipes running along the walls."""
from kit import *


def build():
    L, W, H = 26.0, 16.0, 8.0
    p = [box('shed', (L, W, H), loc=(0, 0, H / 2), color='brick_wall', bev=0.18),
         box('plinth', (L + 0.3, W + 0.3, 0.8), loc=(0, 0, 0.4), color='concrete', bev=0.08, seg=2),
         box('coping', (L + 0.4, W + 0.4, 0.35), loc=(0, 0, H), color='sand', bev=0.06, seg=2)]
    n = 6
    for k in range(n):  # sawtooth: steep glazed face + long slate slope
        x = -L / 2 + L / n * (k + 0.5)
        run = L / n
        p += [mesh(f'saw{k}', [(-run / 2, -W / 2, 0), (-run / 2, W / 2, 0), (-run / 2, W / 2, 3.2), (-run / 2, -W / 2, 3.2),
                               (run / 2, -W / 2, 0), (run / 2, W / 2, 0)],
                   [(0, 1, 2, 3), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2), (0, 4, 5, 1)], color='asphalt_lt', loc=(x, 0, H + 0.15)),
              box(f'glaze{k}', (0.1, W - 0.6, 2.6), loc=(x - run / 2 - 0.02, 0, H + 1.6), color='glass', bev=0.02, seg=1)]
    for k in range(10):  # tall arched windows along the sides
        x = -L / 2 + 1.8 + k * (L - 3.6) / 9
        for s in (-1, 1):
            p += [box(f'w{k}{s}', (1.3, 0.12, 3.2), loc=(x, s * (W / 2 + 0.03), 4.2), color='glow', bev=0.03, seg=1),
                  cyl(f'wa{k}{s}', 0.65, 0.12, loc=(x, s * (W / 2 + 0.03), 5.8), color='glow', seg=12, rot=(math.pi / 2, 0, 0), bev=0),
                  box(f'pil{k}{s}', (0.5, 0.3, H - 1.0), loc=(x + (L - 3.6) / 18, s * (W / 2 + 0.12), H / 2), color='brick_wall', bev=0.06, seg=1)]
    # office block + sign + clock
    ox = L / 2 + 3.5
    p += [box('office', (7.0, 10.0, 11.0), loc=(ox, 0, 5.5), color='brick_wall', bev=0.15),
          box('ocorn', (7.4, 10.4, 0.5), loc=(ox, 0, 11.0), color='sand', bev=0.08, seg=2),
          prism('opedi', 10.4, 1.0, 2.2, loc=(ox + 3.2, 0, 11.2), color='sand', bev=0.06, rot=(0, 0, 0)),
          box('sign', (0.2, 8.0, 1.4), loc=(ox + 3.6, 0, 9.6), color='navy', bev=0.05, seg=2),
          box('signtxt', (0.22, 6.6, 0.6), loc=(ox + 3.62, 0, 9.6), color='gold', bev=0.02, seg=1),
          cyl('clock', 0.9, 0.12, loc=(ox + 3.55, 0, 12.2), color='white', seg=20, rot=(0, math.pi / 2, 0), bev=0.02),
          box('odoor', (0.15, 2.0, 2.8), loc=(ox + 3.55, 0, 1.4), color='forest', bev=0.05, seg=2)]
    p += window_grid(ox + 3.52, 0, 3.0, 1.1, 1.6, 3, 3, 1.6, 0.9, '+x', frame='sand')
    # loading bays on the -y side
    for k in range(3):
        x = -8 + k * 8
        p += [box(f'bay{k}', (4.2, 0.2, 4.5), loc=(x, -W / 2 - 0.05, 2.25), color='steel', bev=0.05, seg=1),
              box(f'dock{k}', (5.0, 2.0, 1.2), loc=(x, -W / 2 - 1.0, 0.6), color='concrete', bev=0.06, seg=1),
              box(f'canopy{k}', (5.0, 2.4, 0.2), loc=(x, -W / 2 - 1.2, 5.0), color='hazard', bev=0.04, seg=1)]
        for j in range(6):
            p.append(box(f'slat{k}{j}', (4.0, 0.22, 0.06), loc=(x, -W / 2 - 0.08, 0.5 + j * 0.7), color='asphalt_lt', bev=0, seg=1))
    # water tank on stilts + pipes
    tx, ty = -L / 2 + 3, W / 2 - 3
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box(f'leg{sx}{sy}', (0.3, 0.3, 5.0), loc=(tx + sx * 1.6, ty + sy * 1.6, H + 2.5), color='ink', bev=0.03, seg=1))
    p += [box('tank', (4.0, 4.0, 2.6), loc=(tx, ty, H + 6.3), color='red', bev=0.15, seg=2),
          tube('pipeA', (-L / 2, W / 2 + 0.4, 6.8), (L / 2, W / 2 + 0.4, 6.8), r=0.3, color='steel', seg=12),
          tube('pipeB', (-L / 2, W / 2 + 0.9, 6.0), (L / 2, W / 2 + 0.9, 6.0), r=0.22, color='copper', seg=12)]
    for k in range(6):
        p.append(box(f'bkt{k}', (0.2, 1.0, 0.2), loc=(-L / 2 + 2 + k * 4.4, W / 2 + 0.55, 6.4), color='ink', bev=0.02, seg=1))
    return finish(tag(join(p, 'factory'), 'region'))
