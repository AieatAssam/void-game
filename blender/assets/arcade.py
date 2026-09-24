"""Neon arcade: glowing sign, game cabinets visible through the door."""
from kit import *


def build():
    W, D, H = 9.0, 8.0, 5.5
    p = [box('walls', (D, W, H), loc=(0, 0, H / 2), color='navy', bev=0.2),
         box('trim', (D + 0.2, W + 0.2, 0.3), loc=(0, 0, H), color='ink', bev=0.08),
         box('sign', (0.4, 7.0, 1.6), loc=(D / 2 + 0.3, 0, H + 1.0), color='ink', bev=0.15),
         box('signglow', (0.45, 6.2, 1.0), loc=(D / 2 + 0.32, 0, H + 1.0), color='siren_blue', bev=0.1),
         box('stripe1', (0.2, W, 0.18), loc=(D / 2 + 0.05, 0, H - 0.6), color='lilac', bev=0.05),
         box('stripe2', (0.2, W, 0.18), loc=(D / 2 + 0.05, 0, 0.5), color='siren_red', bev=0.05),
         box('door', (0.2, 3.0, 2.8), loc=(D / 2 + 0.05, 0, 1.4), color='glow', bev=0.06)]
    for k in range(4):
        p.append(box(f'cab{k}', (0.6, 0.7, 1.7), loc=(D / 2 - 0.6, -1.1 + k * 0.72, 0.85), color=('red', 'sky', 'hazard', 'pink')[k], bev=0.08))
        p.append(box(f'screen{k}', (0.05, 0.5, 0.4), loc=(D / 2 - 0.28, -1.1 + k * 0.72, 1.3), color=('toxic', 'glow_white', 'siren_red', 'lilac')[k], bev=0.02))
    # premium pass: neon edge trim, chasing marquee bulbs, rooftop sign, awning
    for x, y in ((D / 2, W / 2), (D / 2, -W / 2), (-D / 2, W / 2), (-D / 2, -W / 2)):
        p.append(box(f'edge{x}{y}', (0.14, 0.14, H), loc=(x, y, H / 2), color='hot_pink', bev=0.05))
    for k in range(14):
        p.append(sphere(f'bulb{k}', 0.1, loc=(D / 2 + 0.55, -3.25 + k * 0.5, H + 1.9), color=('glow', 'glow_white')[k % 2], seg=10))
        p.append(sphere(f'bulbb{k}', 0.1, loc=(D / 2 + 0.55, -3.25 + k * 0.5, H + 0.1), color=('glow_white', 'glow')[k % 2], seg=10))
    p += [box('awning', (1.4, 4.0, 0.12), loc=(D / 2 + 0.7, 0, 3.0), color='gloss_black', bev=0.04, rot=(0, 0.25, 0)),
          box('awntrim', (0.08, 4.0, 0.1), loc=(D / 2 + 1.38, 0, 2.83), color='lilac', bev=0.03),
          lathe('star', [(0.0, 0.0), (0.9, 0.0), (0.0, 0.3)], loc=(-1.5, 0, H + 0.2), color='gold', seg=5),
          sphere('orb', 0.5, loc=(-1.5, 0, H + 1.1), color='hot_pink', seg=20),
          box('vent', (1.6, 1.2, 0.6), loc=(-2.0, 2.5, H + 0.45), color='chrome', bev=0.12)]
    p += window_grid(0, W / 2, 3.2, 1.2, 1.0, 3, 1, 1.0, 0, '+y', color='lilac', frame='ink')
    p += window_grid(0, -W / 2, 3.2, 1.2, 1.0, 3, 1, 1.0, 0, '-y', color='siren_red', frame='ink')
    return finish(join(p, 'arcade'))
