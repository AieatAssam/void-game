from lib import *


def build():
    p = [box('counter', (1.8, 1.0, 1.0), loc=(0, 0, 0.5), color='red', bev=0.08),
         box('top', (1.9, 1.1, 0.08), loc=(0, 0, 1.04), color='clay', bev=0.03),
         cyl('pot', 0.25, 0.3, loc=(-0.4, 0, 1.08), color='steel', seg=16, bev=0.03),
         lathe('steam', [(0.0, 1.4), (0.15, 1.5), (0.06, 1.8), (0.12, 2.0), (0.0, 2.1)], loc=(-0.4, 0, 0), color='white', seg=12),
         lathe('bowl', [(0.0, 1.08), (0.12, 1.08), (0.2, 1.22), (0.0, 1.2)], loc=(0.4, 0, 0), color='white', seg=16),
         box('roof', (2.2, 1.6, 0.1), loc=(0, 0, 2.3), color='red', bev=0.03, rot=(0.15, 0, 0)),
         box('sign', (1.4, 0.06, 0.35), loc=(0, -0.8, 2.55), color='glow', bev=0.02)]
    for x in (-0.85, 0.85):
        p.append(cyl(f'post{x}', 0.04, 1.3, loc=(x, 0.4, 1.0), color='ink', seg=8, bev=0))
    for k in range(4):
        p.append(lathe(f'lantern{k}', [(0.0, 0.0), (0.12, 0.05), (0.14, 0.2), (0.12, 0.35), (0.0, 0.4)], loc=(-0.75 + k * 0.5, -0.7, 1.8), color='siren_red', seg=12))
    return finish(join(p, 'noodle_stall'))
