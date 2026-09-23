from kit import *


def build():
    p = [box('deck', (0.7, 0.34, 0.1), loc=(0, 0, 0.26), color='mint', bev=0.04),
         sphere('rear', 0.3, loc=(-0.32, 0, 0.45), color='mint', seg=24, scale=(1.2, 0.8, 0.75)),
         box('seat', (0.46, 0.26, 0.1), loc=(-0.28, 0, 0.7), color='ink', bev=0.05),
         box('shield', (0.1, 0.4, 0.62), loc=(0.36, 0, 0.55), color='mint', bev=0.05, rot=(0, -0.2, 0)),
         cyl('fork', 0.035, 0.75, loc=(0.46, 0, 0.2), color='steel', rot=(0, -0.2, 0), seg=12, bev=0.01),
         box('headset', (0.18, 0.2, 0.16), loc=(0.42, 0, 0.98), color='mint', bev=0.06),
         cyl('bars', 0.025, 0.66, loc=(0.4, 0.33, 1.02), color='steel', rot=(math.pi / 2, 0, 0), seg=12, bev=0.008),
         sphere('hl', 0.08, loc=(0.52, 0, 0.98), color='glow', seg=12),
         sphere('fender', 0.21, loc=(0.46, 0, 0.36), color='mint', seg=20, scale=(1, 0.6, 0.65)),
         box('tail', (0.06, 0.12, 0.06), loc=(-0.66, 0, 0.5), color='siren_red', bev=0.02),
         box('plate', (0.02, 0.16, 0.1), loc=(-0.67, 0, 0.36), color='white', bev=0.01)]
    for s in (-1, 1):
        p += [cyl(f'grip{s}', 0.035, 0.12, loc=(0.4, s * 0.33 + (0.12 if s < 0 else 0), 1.02), color='ink', rot=(math.pi / 2, 0, 0), seg=10, bev=0.01),
              cyl(f'mstem{s}', 0.012, 0.18, loc=(0.4, s * 0.24, 1.02), color='steel', rot=(0, -0.3, 0), seg=8, bev=0),
              sphere(f'mirror{s}', 0.05, loc=(0.35, s * 0.24, 1.2), color='steel', seg=10, scale=(0.4, 1, 0.8))]
    p += wheel('wf', 0.2, 0.14, 0.46, 0.07) + wheel('wr', 0.2, 0.14, -0.4, 0.07)
    return finish(join(p, 'scooter'))
