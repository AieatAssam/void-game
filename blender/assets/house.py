from kit import *


def build():
    W, D, H = 6.0, 5.0, 3.4
    p = [box('walls', (D, W, H), loc=(0, 0, H / 2), color='cream', bev=0.12),
         box('plinth', (D + 0.2, W + 0.2, 0.35), loc=(0, 0, 0.175), color='clay', bev=0.08),
         prism('roof', W + 0.8, D + 0.6, 2.3, loc=(0, 0, H - 0.05), color='terracotta', bev=0.1),
         box('chimney', (0.7, 0.7, 1.8), loc=(-1.0, 1.6, H + 1.4), color='brick', bev=0.08),
         box('chimcap', (0.9, 0.9, 0.15), loc=(-1.0, 1.6, H + 2.3), color='ink', bev=0.04),
         box('door', (0.12, 1.1, 2.0), loc=(D / 2 + 0.02, 0, 1.2), color='teal', bev=0.05),
         sphere('knob', 0.06, loc=(D / 2 + 0.1, 0.35, 1.2), color='hazard', seg=8),
         box('step', (0.7, 1.6, 0.2), loc=(D / 2 + 0.35, 0, 0.1), color='concrete', bev=0.05),
         prism('porch', 1.8, 0.9, 0.5, loc=(D / 2 + 0.3, 0, 2.35), color='terracotta', bev=0.05)]
    p += window_grid(D / 2, 0, 1.6, 0.9, 1.0, 2, 1, 2.4, 0, '+x')
    p += window_grid(-D / 2, 0, 1.7, 0.9, 1.0, 2, 1, 1.6, 0, '-x')
    for s in (-1, 1):
        p += window_grid(0, s * W / 2, 1.7, 0.9, 1.0, 2, 1, 1.2, 0, '+y' if s > 0 else '-y')
    for s in (-1.2, 1.2):
        p.append(box(f'fbox{s}', (0.3, 1.1, 0.25), loc=(D / 2 + 0.15, s * 1.0 + (0.2 if s > 0 else -0.2), 0.95), color='clay', bev=0.04))
        for k in range(4):
            p.append(sphere(f'f{s}{k}', 0.12, loc=(D / 2 + 0.2, s * 1.0 + (0.2 if s > 0 else -0.2) - 0.4 + k * 0.27, 1.14), color=('pink', 'butter')[k % 2], seg=8))
    return finish(join(p, 'house'))
