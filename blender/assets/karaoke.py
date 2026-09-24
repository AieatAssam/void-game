from kit import *


def build():
    W, D, H = 7.0, 7.0, 4.5
    p = [box('walls', (D, W, H), loc=(0, 0, H / 2), color='pink', bev=0.2),
         box('roof', (D + 0.3, W + 0.3, 0.3), loc=(0, 0, H), color='ink', bev=0.08),
         box('front', (0.15, 5.0, 2.4), loc=(D / 2 + 0.05, 0, 1.6), color='glow', bev=0.06),
         cyl('mic', 0.35, 2.2, loc=(0, 0, H + 0.2), color='steel', seg=16, bev=0.1),
         sphere('michead', 0.7, loc=(0, 0, H + 2.7), color='ink', seg=24),
         torus('micband', 0.72, 0.08, loc=(0, 0, H + 2.4), color='lilac', seg=24, rseg=6)]
    for k in range(7):  # musical-note lights on the facade
        p.append(sphere(f'note{k}', 0.22, loc=(D / 2 + 0.2, -3 + k, 3.4 + (k % 2) * 0.4), color=('lilac', 'siren_blue', 'glow')[k % 3], seg=10))
    p += window_grid(0, W / 2, 2.8, 1.2, 1.2, 2, 1, 1.2, 0, '+y', color='siren_red', frame='ink')
    return finish(join(p, 'karaoke'))
