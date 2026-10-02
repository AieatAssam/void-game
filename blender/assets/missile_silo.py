"""Planet pack: a missile silo (20 m): concrete pad, hazard collar, two hatch doors swung open on hinges and a
warhead nose rising out of the dark shaft. Six of these instance into a field."""
from kit import *

DETAIL = 0.75  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    p = [blk('pad', (20, 20, 0.8), (0, 0, 0.4), 'concrete', bev=0.15),
         cyl('collar', 7.2, 1.4, loc=(0, 0, 0.8), color='hazard', seg=28, bev=0.15, bseg=1),
         cyl('shaft', 5.6, 1.5, loc=(0, 0, 0.82), color='ink', seg=28, bev=0, bseg=1),
         cyl('deep', 5.0, 0.2, loc=(0, 0, 1.55), color='void', seg=24, bev=0, bseg=1),
         lathe('warhead', [(1.5, 1.4), (1.5, 4.6), (1.1, 6.6), (0.5, 8.0), (0, 8.7)], loc=(0, 0, 0.8), color='red', seg=18),
         cyl('mbody', 1.55, 3.6, loc=(0, 0, 0.8), color='white', seg=18, bev=0, bseg=1),
         cyl('mband', 1.57, 0.7, loc=(0, 0, 4.0), color='hazard', seg=18, bev=0, bseg=1)]
    for s in (-1, 1):  # open hatch doors, hinged on the +-x rim, tilted up
        ca, sa = math.cos(1.1), math.sin(1.1)
        p.append(blk(f'door{s}', (6.0, 11.0, 0.7), (s * (6.6 + 3.0 * ca), 0, 1.6 + 3.0 * sa), 'steel', bev=0.2, rot=(0, -s * 1.1, 0)))
        p.append(blk(f'doorS{s}', (1.4, 11.0, 0.8), (s * (6.6 + 5.4 * ca), 0, 1.6 + 5.4 * sa), 'hazard', bev=0.05, rot=(0, -s * 1.1, 0)))
        p.append(blk(f'hinge{s}', (1.4, 2.0, 1.2), (s * 6.6, 0, 1.6), 'ink', bev=0.1))
        p.append(blk(f'light{s}', (0.8, 0.8, 0.5), (s * 8.5, -8.5, 1.0), 'siren_red', bev=0.1))
    p += [blk('bunker', (3.6, 3.0, 2.4), (-7.0, -6.5, 2.0), 'sand', bev=0.2), blk('bdoor', (0.1, 1.4, 1.6), (-5.15, -6.5, 1.8), 'ink'),
          blk('rad', (0.5, 0.5, 3.0), (7.8, 7.8, 2.3), 'steel', bev=0.05), sphere('radb', 0.6, loc=(7.8, 7.8, 4.0), color='glow', seg=10)]
    return finish(tag(join(p, 'missile_silo'), 'planet', lod=[0.4, 0.15]), tier=10.0, kind='unit', unit='silo')
