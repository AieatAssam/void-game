"""Dodgem: fat rubber bumper ring, glossy rounded shell with a racing number, bucket seat, steering wheel
and the tall pickup pole with a sparking brush on top."""
from kit import *


def build():
    p = [torus('bumper', 0.62, 0.13, loc=(0, 0, 0.18), color='ink', seg=40, rseg=10),
         box('floorpan', (1.5, 1.05, 0.14), loc=(0, 0, 0.12), color='gloss_black', bev=0.05),
         box('shell', (1.45, 1.0, 0.4), loc=(0.02, 0, 0.42), color='hot_pink', bev=0.18),
         box('nose', (0.5, 0.9, 0.3), loc=(0.55, 0, 0.5), color='hot_pink', bev=0.14),
         box('cockpit', (0.7, 0.72, 0.3), loc=(-0.12, 0, 0.62), color='ink', bev=0.08),
         box('seat', (0.3, 0.6, 0.45), loc=(-0.35, 0, 0.72), color='red', bev=0.1),
         tube('column', (0.35, 0, 0.62), (0.18, 0, 0.9), r=0.03, color='chrome'),
         torus('steer', 0.13, 0.025, loc=(0.18, 0, 0.92), color='ink', seg=20, rseg=6, rot=(0, -0.9, 0)),
         cyl('number_disc', 0.18, 0.02, loc=(0.35, 0.51, 0.45), color='white', seg=20, bev=0.005, rot=(-math.pi / 2, 0, 0)),
         box('number', (0.06, 0.012, 0.18), loc=(0.35, 0.53, 0.45), color='ink', bev=0.005, seg=1),
         cyl('pole', 0.03, 1.9, loc=(-0.62, 0, 0.55), color='ink', seg=8, bev=0),
         tube('brush_arm', (-0.62, 0, 2.45), (-0.5, 0, 2.6), r=0.025, color='steel'),
         box('brush', (0.18, 0.08, 0.05), loc=(-0.45, 0, 2.63), color='copper', bev=0.01),
         sphere('spark', 0.05, loc=(-0.42, 0, 2.7), color='glow_white', seg=8),
         box('flag', (0.25, 0.012, 0.16), loc=(-0.49, 0, 2.2), color='butter', bev=0.004)]
    for s in (-1, 1):
        p += [sphere(f'lamp{s}', 0.07, loc=(0.8, s * 0.28, 0.5), color='glow_white', seg=10),
              box(f'stripe{s}', (1.2, 0.012, 0.06), loc=(0.02, s * 0.505, 0.52), color='white', bev=0.004, seg=1)]
    return tag(finish(join(p, 'bumper_car'), mass=0.5), 'fair')
