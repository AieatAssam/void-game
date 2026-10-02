"""Planet pack: the PLANET CRACKER (fiction: 300 km; modelled at 300 m, geoScale 1000). A hex plate with three power
stations (cooling towers with glowing cores) feeding a seven-barrel gun array aimed along +X, hazard clamps and a
glowing muzzle lens. The tier-5 set piece."""
from kit import *

DETAIL = 0.8  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    R = 140.0
    hp = [(R * math.cos(k * math.pi / 3 + math.pi / 6), R * math.sin(k * math.pi / 3 + math.pi / 6)) for k in range(6)]
    p = [poly_prism('plate', hp, 0, 8, 'concrete', bev=0.8), poly_prism('plate2', [(x * 0.92, y * 0.92) for x, y in hp], 8, 10, 'steel', bev=0.3)]
    for k in range(6):
        x, y = hp[k]
        p.append(blk(f'cor{k}', (14, 14, 12), (x * 0.96, y * 0.96, 9), 'hazard' if k % 2 else 'ink', bev=0.6))
    # three power stations
    for k in range(3):
        a = math.radians(90 + k * 120)
        x, y = math.cos(a) * 85, math.sin(a) * 85
        p += [lathe(f'tw{k}', [(22, 10), (17, 40), (13, 65), (14, 90), (18, 105)], loc=(x, y, 0), color='white', seg=22),
              cyl(f'twb{k}', 22.4, 3, loc=(x, y, 30), color='hazard', seg=22, bev=0, bseg=1),
              torus(f'twr{k}', 18, 2.2, loc=(x, y, 104), color='toxic', seg=22, rseg=8),
              cyl(f'twc{k}', 15, 6, loc=(x, y, 100), color='toxic', seg=18, bev=0, bseg=1),
              sphere(f'dome{k}', 17, loc=(x * 0.55, y * 0.55, 24), color='steel', seg=14, scale=(1, 1, 0.8)),
              tube(f'pipe{k}', (x * 0.8, y * 0.8, 34), (-10, y * 0.25, 40), r=3.0, color='copper', seg=8)]
    # the gun array: 7 barrels, hex-packed, on a tall mount
    cx, cz, L = -75, 52, 190
    X = (0, math.pi / 2, 0)
    offs = [(0, 0)] + [(math.cos(k * math.pi / 3) * 17, math.sin(k * math.pi / 3) * 17) for k in range(6)]
    for i, (oy, oz) in enumerate(offs):
        p += [cyl(f'br{i}', 8.5, L, loc=(cx, oy, cz + oz), color='steel', seg=14, rot=X, bev=0, bseg=1),
              cyl(f'brt{i}', 9.4, 10, loc=(cx + L - 6, oy, cz + oz), color='ink', seg=14, rot=X, bev=0, bseg=1),
              cyl(f'bl{i}', 7.0, 1.5, loc=(cx + L + 4, oy, cz + oz), color='siren_red' if i else 'glow_white', seg=14, rot=X, bev=0, bseg=1)]
    for x in (cx + 25, cx + 80, cx + 135):
        p.append(cyl(f'clamp{x}', 30, 8, loc=(x, 0, cz), color='hazard', seg=18, rot=X, bev=0, bseg=1))
    p += [cyl('breech', 36, 28, loc=(cx - 24, 0, cz), color='white', seg=18, rot=X, bev=0.8, bseg=1), cyl('breechB', 37, 6, loc=(cx - 12, 0, cz), color='ink', seg=18, rot=X, bev=0, bseg=1)]
    for s in (-1, 1):
        p += [blk(f'pylon{s}', (30, 10, 46), (cx + 50, s * 36, 33), 'steel', bev=1.2), blk(f'pylonB{s}', (30, 10, 46), (cx + 120, s * 36, 33), 'steel', bev=1.2)]
    return finish(tag(join(p, 'cracker'), 'planet', lod=[0.4, 0.15]), tier=150000.0, kind='unit', unit='cracker', geoScale=1000.0)
