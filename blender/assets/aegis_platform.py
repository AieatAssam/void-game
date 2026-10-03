"""Planet pack: AEGIS shield segment (fiction: 60 km across; modelled at 60 m, geoScale 1000). A hex armour lid
floating on six thruster jets, hazard rim, concentric plates and a glowing centre eye. Boss of tier 4: edible."""
from kit import *

DETAIL = 0.9  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def hexpts(R, off=0.0):
    return [(R * math.cos(off + k * math.pi / 3), R * math.sin(off + k * math.pi / 3)) for k in range(6)]


def build():
    z = 15.0
    p = [poly_prism('slab', hexpts(30), z, z + 4, 'steel', bev=0.4), poly_prism('plate1', hexpts(25), z + 4, z + 5, 'concrete', bev=0.2),
         poly_prism('plate2', hexpts(18), z + 5, z + 6.2, 'steel', bev=0.2), poly_prism('plate3', hexpts(10), z + 6.2, z + 7.6, 'concrete', bev=0.2)]
    for k in range(6):
        a0, a1 = k * math.pi / 3, (k + 1) * math.pi / 3
        (x0, y0), (x1, y1) = (30 * math.cos(a0), 30 * math.sin(a0)), (30 * math.cos(a1), 30 * math.sin(a1))
        m = ((x0 + x1) / 2, (y0 + y1) / 2)
        p.append(blk(f'rim{k}', (3.2, 31, 2.0), (m[0] * 0.97, m[1] * 0.97, z + 4.6), 'hazard' if k % 2 else 'ink', bev=0.2, rot=(0, 0, a0 + math.pi / 6)))
        # thruster at each vertex, firing down
        p += [cyl(f'th{k}', 3.6, 7.0, loc=(x0, y0, 8.0), color='ink', seg=12, bev=0, bseg=1, r2=2.2),
              cyl(f'thR{k}', 4.0, 1.2, loc=(x0, y0, 13.8), color='hazard', seg=12, bev=0, bseg=1),
              lathe(f'fl{k}', [(0.01, -0.2), (2.4, 0.2), (1.5, 4.5), (0.01, 8.0)], loc=(x0, y0, 8.0), color='glow', seg=8, rot=(math.pi, 0, 0))]
        # radial ribs on the lid
        p.append(blk(f'rib{k}', (13, 1.6, 1.2), (math.cos(a0 + 0.52) * 14, math.sin(a0 + 0.52) * 14, z + 8.1), 'hazard', rot=(0, 0, a0 + 0.52)))
    p += [sphere('dome', 6.0, loc=(0, 0, z + 7.6), color='glass', seg=16, scale=(1, 1, 0.8)), sphere('eye', 3.0, loc=(0, 0, z + 9.5), color='siren_blue', seg=12),
          cyl('ant', 0.5, 9, loc=(0, 0, z + 12), color='chrome', seg=6, bev=0, bseg=1)]
    return finish(tag(join(p, 'aegis_platform'), 'planet', lod=[0.4, 0.15]), tier=30000.0, kind='fx', unit='aegis', geoScale=1000.0)
