"""Planet pack: a toy supercarrier (330 m): red waterline, grey hull, angled flight deck with markings, starboard
island, elevators and a row of parked jets. Reads as 'fleet' from orbit."""
from kit import *


def jet(x, y, rot=0.0, z=24.0, c='sky'):
    return [blk(f'j{x}{y}f', (16, 2.8, 2.2), (x, y, z + 1.2), c, rot=(0, 0, rot)),
            blk(f'j{x}{y}w', (6, 15, 0.5), (x - 1.5, y, z + 0.9), 'concrete', rot=(0, 0, rot)),
            blk(f'j{x}{y}t', (3, 0.5, 3.6), (x - 6.5, y, z + 2.8), 'navy', rot=(0, 0, rot))]


def build():
    half = [(-165, 17), (60, 19), (125, 16), (160, 7), (172, 0)]
    out = mirror_pts(half)
    p = [poly_prism('lower', out, 0, 5, 'brick'), poly_prism('hull', out, 5, 20, 'steel', bev=0.0)]
    deck = [(-172, -26), (140, -27), (176, -4), (176, 4), (150, 30), (95, 40), (-90, 38), (-172, 24)]
    p.append(poly_prism('deck', deck, 20, 23, 'asphalt'))
    p.append(blk('edge', (300, 0.8, 1.0), (-10, -26.4, 23.5), 'hazard'))
    p.append(blk('center', (270, 2.2, 0.12), (-10, -8, 23.1), 'white'))
    p.append(blk('landing', (210, 1.6, 0.12), (-45, 22, 23.1), 'white', rot=(0, 0, 0.0)))
    p.append(blk('landing2', (150, 1.6, 0.12), (-40, 11, 23.1), 'white', rot=(0, 0, 0.12)))
    for k in range(3):
        p.append(blk(f'lift{k}', (24, 16, 0.2), (-100 + k * 85, 32 - (k == 1) * 6, 23.1), 'sand'))
    p.append(blk('cat1', (80, 1.0, 0.14), (95, -2, 23.1), 'ink'))
    p.append(blk('cat2', (80, 1.0, 0.14), (95, 6, 23.1), 'ink'))
    # island
    p += [blk('isl', (34, 11, 16), (10, -20, 31), 'concrete', bev=0.8), blk('isl2', (20, 10, 10), (14, -20, 44), 'white', bev=0.6),
          blk('isg', (22, 0.3, 3), (14, -14.8, 43), 'gloss_black'), blk('isg2', (12, 10.3, 2.4), (14, -20, 39.3), 'glass'),
          cyl('mast', 0.9, 16, loc=(6, -20, 49), color='steel', seg=8, bev=0, bseg=1),
          blk('radar', (8, 1, 3), (6, -20, 63), 'chrome', bev=0.3),
          blk('radar2', (1.4, 7, 2), (14, -20, 50), 'siren_red')]
    # a deckful of jets
    for k in range(5):
        p += jet(-150 + k * 22, 26 - (k % 2) * 4, c=('sky', 'red', 'butter')[k % 3])
    for k in range(4):
        p += jet(-60 + k * 22, -15, c=('mint', 'sky')[k % 2])
    # sponsons + guns
    for k in range(4):
        p.append(cyl(f'gun{k}', 3.0, 1.5, loc=(-120 + k * 90, -29, 20.5), color='steel', seg=8, bev=0, bseg=1))
    return finish(tag(join(p, 'aircraft_carrier'), 'planet', lod=[0.4, 0.15]), tier=165.0, kind='unit', unit='carrier')
