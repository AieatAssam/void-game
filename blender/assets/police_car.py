"""Response unit (heat 1+). 'beacon' clip spins the red/blue light bar."""
from kit import *


def build():
    p = car(4.2, 2.0, 'white', roof='white')
    p += [box('door', (1.7, 2.04, 0.34), loc=(-0.1, 0, 0.62), color='police', bev=0.08),
          box('hood', (0.9, 1.6, 0.05), loc=(1.5, 0, 0.93), color='police', bev=0.02),
          box('bar', (0.5, 1.4, 0.14), loc=(-0.6, 0, 1.87), color='ink', bev=0.05),
          box('push', (0.18, 1.5, 0.4), loc=(2.2, 0, 0.5), color='ink', bev=0.06)]
    root = join(p, 'police_car')
    beacon = join([box('lr', (0.3, 0.5, 0.2), loc=(0, 0.3, 0), color='siren_red', bev=0.07),
                   box('lb', (0.3, 0.5, 0.2), loc=(0, -0.3, 0), color='siren_blue', bev=0.07),
                   cyl('hub', 0.1, 0.24, loc=(0, 0, -0.12), color='steel', seg=12, bev=0.02)], 'beacon')
    beacon.location = (-0.6, 0, 2.04)
    parent(beacon, root)
    finish(root, kind='unit', unit='police')
    spin(beacon, 'Z', frames=16, name='beacon')
    return root
