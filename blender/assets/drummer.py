"""Marching-band drummer (parade event): shako with plume, braided tunic, snare drum on a sling."""
from people import *
from kit import tag, blob


def shako():
    return [cyl('shako', 0.15, 0.26, loc=(-0.01, 0, 1.02), color='navy', seg=24, r2=0.165, bev=0.02),
            cyl('shako_top', 0.168, 0.025, loc=(-0.01, 0, 1.27), color='gold', seg=24, bev=0.008),
            cyl('visor', 0.16, 0.02, loc=(0.03, 0, 1.03), color='gloss_black', seg=24, bev=0.008, r2=0.17),
            box('plate', (0.02, 0.1, 0.1), loc=(0.16, 0, 1.14), color='gold', bev=0.01),
            sphere('plate_gem', 0.018, loc=(0.172, 0, 1.14), color='red', seg=8),
            cyl('plume_stem', 0.012, 0.08, loc=(0.02, 0, 1.28), color='gold', seg=8, bev=0),
            blob('plume', 0.09, (0.02, 0, 1.44), 'white', seed=3, amp=0.25, scale=(0.6, 0.6, 1.3)),
            torus('chin', 0.17, 0.008, loc=(0.02, 0, 0.98), color='gold', seg=24, rseg=5, rot=(0, 0.5, 0))]


def braid():
    p = [box('sash', (0.02, 0.36, 0.06), loc=(0.15, 0, 0.62), color='white', bev=0.01, rot=(0.6, 0, 0))]
    for s in (-1, 1):
        p += [box(f'epaulette{s}', (0.12, 0.09, 0.03), loc=(0, s * 0.17, 0.8), color='gold', bev=0.012),
              *[cyl(f'fringe{s}{k}', 0.006, 0.05, loc=(-0.04 + k * 0.02, s * 0.21, 0.75), color='gold', seg=5, bev=0) for k in range(5)]]
    for k in range(4):  # frogging across the chest
        p.append(box(f'frog{k}', (0.012, 0.18, 0.012), loc=(0.152, 0, 0.52 + k * 0.06), color='gold', bev=0.004, seg=1))
        p.append(sphere(f'btn{k}', 0.012, loc=(0.158, 0, 0.52 + k * 0.06), color='gold', seg=6))
    return p


def snare():
    z = 0.43
    p = [cyl('shell', 0.17, 0.16, loc=(0.2, 0, z), color='white', seg=28, bev=0.01),
         torus('hoop_t', 0.172, 0.014, loc=(0.2, 0, z + 0.16), color='red', seg=28, rseg=6),
         torus('hoop_b', 0.172, 0.014, loc=(0.2, 0, z), color='red', seg=28, rseg=6),
         cyl('head', 0.162, 0.005, loc=(0.2, 0, z + 0.163), color='pearl', seg=28, bev=0),
         tube('sling', (0.16, -0.12, z + 0.16), (0.02, 0.1, 0.79), r=0.012, color='white'),
         tube('stick1', (0.14, -0.1, z + 0.18), (0.36, 0.06, z + 0.19), r=0.009, color='wood'),
         tube('stick2', (0.14, 0.1, z + 0.18), (0.34, -0.08, z + 0.19), r=0.009, color='wood')]
    for k in range(8):  # tension rods + lugs
        a = k * math.pi / 4
        x, y = 0.2 + math.cos(a) * 0.176, math.sin(a) * 0.176
        p += [cyl(f'rod{k}', 0.005, 0.16, loc=(x, y, z), color='chrome', seg=5, bev=0),
              box(f'lug{k}', (0.02, 0.02, 0.04), loc=(x, y, z + 0.08), color='chrome', bev=0.006, seg=1)]
    return p


def build():
    ob = person('drummer', 'red', 'navy', 'gloss_black', 'peach', 'ink', 'short', extras=(shako, braid, snare))
    return tag(ob, 'events', event='parade')
