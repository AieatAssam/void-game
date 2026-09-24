"""Scuttling beach crab. Every limb starts at the shell surface and reaches outward - nothing passes
through the shell (shell: ellipsoid 0.17 x 0.14 x 0.075 around z=0.1)."""
from lib import *


def build():
    p = [sphere('shell', 0.14, loc=(0, 0, 0.1), color='red', seg=20, scale=(1.2, 1, 0.55)),
         sphere('belly', 0.12, loc=(0, 0, 0.075), color='peach', seg=16, scale=(1.15, 0.95, 0.35))]
    for s in (-1, 1):
        # eye stalks rise from the top-front of the shell
        p += [tube(f'stalk{s}', (0.1, s * 0.045, 0.15), (0.13, s * 0.06, 0.22), r=0.011, color='red', seg=8),
              sphere(f'eye{s}', 0.024, loc=(0.132, s * 0.062, 0.232), color='white', seg=10),
              sphere(f'pupil{s}', 0.012, loc=(0.152, s * 0.064, 0.236), color='ink', seg=8)]
        # arm: from the shell's front-side surface out to a claw that sits fully outside the shell
        p += [tube(f'arm{s}', (0.14, s * 0.07, 0.09), (0.22, s * 0.17, 0.08), r=0.02, color='red', seg=8),
              sphere(f'claw{s}', 0.048, loc=(0.26, s * 0.19, 0.08), color='red', seg=12, scale=(1.35, 0.85, 0.75)),
              sphere(f'pincer{s}', 0.024, loc=(0.315, s * 0.165, 0.09), color='red', seg=10, scale=(1.5, 0.6, 0.6))]
        # three walking legs: from the shell side rim, bending down to the sand
        for k in range(3):
            x = -0.08 + k * 0.065
            knee = (x - 0.015, s * 0.2, 0.09)
            p += [tube(f'thigh{s}{k}', (x, s * 0.125, 0.085), knee, r=0.011, color='red', seg=6),
                  tube(f'shin{s}{k}', knee, (x - 0.03, s * 0.25, 0.0), r=0.009, color='red', seg=6)]
    return finish(join(p, 'crab'), mass=0.01)
