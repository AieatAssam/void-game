"""Planet pack: a chunky toy ICBM (35 m). Red ogive nose, white body, hazard band, four fins, glowing nozzle.
An empty named 'plume' sits at the tail: the game parks the exhaust trail sprite there. Flies along +X."""
from kit import *


def build():
    L, R, Z = 35.0, 1.7, 3.2
    X = (0, math.pi / 2, 0)
    p = [lathe('nose', [(R, 7.0), (R * 0.93, 10.0), (R * 0.65, 14.0), (R * 0.28, 16.8), (0, 17.5)], loc=(0, 0, Z), color='red', seg=20, rot=X),
         cyl('body', R, 17.0, loc=(-10.0, 0, Z), color='white', seg=20, rot=X, bev=0.15, bseg=1),
         cyl('band', R + 0.04, 2.0, loc=(2.0, 0, Z), color='hazard', seg=20, rot=X, bev=0, bseg=1),
         cyl('band2', R + 0.04, 0.8, loc=(-6.0, 0, Z), color='ink', seg=20, rot=X, bev=0, bseg=1),
         lathe('skirt', [(R * 0.8, -17.5), (R * 1.15, -16.5), (R * 1.05, -10.0), (R, -9.5)], loc=(0, 0, Z), color='steel', seg=20, rot=X),
         cyl('bell', 1.0, 1.6, loc=(-L / 2 - 0.3, 0, Z), color='ink', seg=14, rot=X, bev=0, bseg=1, r2=1.35),
         cyl('burner', 0.9, 0.2, loc=(-L / 2 - 0.15, 0, Z), color='warn', seg=14, rot=X, bev=0, bseg=1)]
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        p.append(blk(f'fin{k}', (4.2, 2.8, 0.28), (-13.6, math.cos(a) * (R + 1.2), Z + math.sin(a) * (R + 1.2)), 'navy', bev=0.05, rot=(a, 0, 0)))
        p.append(blk(f'finT{k}', (1.4, 0.7, 0.3), (-15.6, math.cos(a) * (R + 2.5), Z + math.sin(a) * (R + 2.5)), 'red', rot=(a, 0, 0)))
    root = join(p, 'icbm')
    finish(tag(root, 'planet', lod=[0.4, 0.15]), tier=R + 1.5, kind='fx', unit='icbm')
    empty('plume', (-L / 2 - 0.5, 0, Z), root)
    return root
