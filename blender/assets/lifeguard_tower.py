from lib import *


def build():
    p = [box('hut', (1.8, 1.6, 1.3), loc=(0, 0, 2.6), color='white', bev=0.1),
         box('stripe', (1.84, 1.64, 0.3), loc=(0, 0, 2.3), color='red', bev=0.05),
         prism('roof', 2.0, 2.2, 0.6, loc=(0, 0, 3.25), color='red', bev=0.05),
         box('window', (0.06, 1.2, 0.5), loc=(0.9, 0, 2.8), color='sky', bev=0.03),
         box('deck', (2.6, 2.0, 0.12), loc=(0.3, 0, 1.9), color='wood', bev=0.03),
         box('ramp', (2.4, 0.8, 0.08), loc=(1.9, 0, 0.95), color='wood', bev=0.02, rot=(0, 0.8, 0)),
         box('flag', (0.5, 0.02, 0.3), loc=(-0.6, 0, 4.4), color='hazard', bev=0, seg=1),
         cyl('flagpole', 0.03, 1.2, loc=(-0.85, 0, 3.3), color='steel', seg=6, bev=0),
         torus('ring', 0.25, 0.07, loc=(0.95, 0.5, 2.3), color='warn', seg=16, rseg=6, rot=(0, math.pi / 2, 0))]
    for x in (-0.7, 0.7):
        for y in (-0.6, 0.6):
            p.append(box(f'leg{x}{y}', (0.12, 0.12, 1.9), loc=(x, y, 0.95), color='wood', bev=0.03))
    return finish(join(p, 'lifeguard_tower'))
