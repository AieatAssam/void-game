"""Region pack (boss): THE CAPPER. A colossal tracked crawler (like a rocket crawler-transporter) carrying a giant
hazard-striped dome lid on hydraulic arms, with a control cab, floodlights, warning beacons and exhaust stacks.
It trundles after the hole trying to cap it. Edible only once the hole outgrows it (tier ~30)."""
from kit import *


def build():
    L, W = 40.0, 34.0
    p = [box('deck', (L, W, 3.0), loc=(0, 0, 6.0), color='hazard', bev=0.5),
         box('frame', (L - 6, W - 8, 2.0), loc=(0, 0, 4.0), color='ink', bev=0.3)]
    for sx in (-1, 1):  # four truck tread units at the corners
        for sy in (-1, 1):
            x, y = sx * (L / 2 - 7), sy * (W / 2 - 5)
            p += [box(f'tread{sx}{sy}', (12.0, 8.0, 3.6), loc=(x, y, 1.8), color='ink', bev=1.4, seg=3),
                  box(f'treadG{sx}{sy}', (12.4, 8.4, 0.5), loc=(x, y, 3.8), color='asphalt_lt', bev=0.15),
                  cyl(f'jack{sx}{sy}', 1.6, 2.0, loc=(x, y, 3.6), color='chrome', seg=16, bev=0.1)]
            for k in range(14):
                p.append(box(f'shoe{sx}{sy}{k}', (0.5, 8.1, 0.25), loc=(x - 5.8 + k * 0.9, y, 0.12), color='asphalt_lt', bev=0.05, seg=1))
            for k in range(4):
                p.append(cyl(f'roll{sx}{sy}{k}', 1.2, 8.2, loc=(x - 4.2 + k * 2.8, y - 4.1, 1.6), color='steel', seg=16, rot=(-math.pi / 2, 0, 0), bev=0.1))
    for k in range(12):  # hazard chevrons along the deck edge
        for s in (-1, 1):
            p.append(box(f'chev{k}{s}', (1.4, 0.1, 2.4), loc=(-L / 2 + 2 + k * 3.3, s * (W / 2 + 0.03), 6.0), color='ink', bev=0, seg=1, rot=(0, 0.6, 0)))
    # control cab + stacks + beacons + floodlights
    p += [box('cab', (6.0, 8.0, 5.0), loc=(L / 2 - 4.0, W / 2 - 5.0, 10.0), color='white', bev=0.5),
          box('cabglass', (0.2, 7.0, 2.0), loc=(L / 2 - 0.95, W / 2 - 5.0, 11.0), color='gloss_black', bev=0.1, seg=1),
          box('cabroof', (6.6, 8.6, 0.5), loc=(L / 2 - 4.0, W / 2 - 5.0, 12.7), color='hazard', bev=0.15)]
    for k in range(2):
        p += [cyl(f'stack{k}', 0.9, 7.0, loc=(-L / 2 + 3.0, -W / 2 + 4.0 + k * 3.0, 7.5), color='steel', seg=14, bev=0.1),
              cyl(f'stackc{k}', 1.1, 0.4, loc=(-L / 2 + 3.0, -W / 2 + 4.0 + k * 3.0, 14.4), color='ink', seg=14, bev=0.05)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            p += [cyl(f'bea{sx}{sy}', 0.5, 0.9, loc=(sx * (L / 2 - 1.5), sy * (W / 2 - 1.5), 7.5), color='warn', seg=12, bev=0.1),
                  box(f'fl{sx}{sy}', (1.8, 0.6, 1.2), loc=(sx * (L / 2 - 1.0), sy * (W / 2 - 1.0), 9.0), color='ink', bev=0.1),
                  box(f'flL{sx}{sy}', (1.6, 0.1, 1.0), loc=(sx * (L / 2 - 1.0), sy * (W / 2 - 0.7), 9.0), color='glow_white', bev=0.02, seg=1)]
    # hydraulic arms + the lid
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        c, s = math.cos(a), math.sin(a)
        p += [tube(f'arm{k}', (c * 12, s * 10, 7.5), (c * 9, s * 8, 17.5), r=1.1, color='chrome', seg=12),
              tube(f'armS{k}', (c * 12, s * 10, 7.5), (c * 11, s * 9.5, 12.0), r=1.5, color='hazard', seg=12)]
    lid = [lathe('lid', [(0, 0), (19.0, 0), (19.5, 1.2), (17.0, 4.5), (9.0, 7.5), (0, 8.2)], loc=(0, 0, 17.0), color='concrete', seg=40),
           cyl('lidrim', 19.6, 1.4, loc=(0, 0, 16.6), color='hazard', seg=40, bev=0.2),
           cyl('lidknob', 3.0, 2.0, loc=(0, 0, 25.0), color='ink', seg=20, bev=0.3),
           sphere('lideye', 1.4, loc=(0, 0, 27.0), color='siren_red', seg=16)]
    for k in range(16):
        a = k * math.tau / 16
        lid.append(box(f'lidchev{k}', (0.1, 3.0, 1.2), loc=(math.cos(a) * 19.62, math.sin(a) * 19.62, 17.3), color='ink', bev=0, seg=1, rot=(0, 0, a)))
    p += lid
    return finish(tag(join(p, 'capper'), 'region'), tier=30.0, kind='unit', unit='capper')
