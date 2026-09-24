"""Garden gnome. Small, silly, first-bite food in the suburbs."""
from lib import *


def build():
    p = [cyl('base', 0.12, 0.04, color='forest', seg=16, bev=0.01),
         lathe('body', [(0.0, 0.04), (0.11, 0.04), (0.12, 0.1), (0.1, 0.22), (0.0, 0.24)], color='sky', seg=20),
         cyl('belt', 0.117, 0.03, loc=(0, 0, 0.14), color='ink', seg=20, bev=0.006),  # round, hugging the body (a box's corners stuck out)
         sphere('face', 0.07, loc=(0, 0, 0.29), color='peach', seg=16),
         sphere('nose', 0.025, loc=(0.065, 0, 0.29), color='pink', seg=10),
         lathe('beard', [(0.0, 0.3), (0.07, 0.28), (0.06, 0.2), (0.0, 0.16)], loc=(0.03, 0, 0), color='white', seg=16),
         lathe('hat', [(0.0, 0.52), (0.02, 0.5), (0.08, 0.36), (0.09, 0.33), (0.0, 0.33)], color='red', seg=20),
        ]
    for s in (-1, 1):  # arms, mittens and boots
        p += [tube(f'arm{s}', (0.0, s * 0.09, 0.2), (0.06, s * 0.13, 0.1), r=0.022, color='sky'),
              sphere(f'mitt{s}', 0.025, loc=(0.065, s * 0.13, 0.09), color='peach', seg=10),
              box(f'boot{s}', (0.09, 0.05, 0.04), loc=(0.03, s * 0.045, 0.06), color='clay', bev=0.015)]
    p += [cyl('lantern', 0.022, 0.05, loc=(0.1, 0.14, 0.02), color='gold', seg=8, bev=0.005),
          sphere('lanternglow', 0.016, loc=(0.1, 0.14, 0.05), color='glow', seg=8)]
    for s in (-1, 1):
        p.append(sphere(f'eye{s}', 0.012, loc=(0.06, s * 0.025, 0.31), color='ink', seg=6))
    return finish(join(p, 'gnome'), mass=0.02)
