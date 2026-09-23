"""Response unit (heat 4). Child 'turret' is aimed by the game; 'fire' clip recoils the barrel."""
from kit import *


def star(name, r, loc, rot, color='white'):
    vs = [(0, 0, 0)]
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.42
        vs.append((rr * math.cos(a), rr * math.sin(a), 0))
    return mesh(name, vs, [(0, i + 1, (i + 1) % 10 + 1) for i in range(10)], color, loc, rot)


def build():
    L, W = 6.2, 3.4
    p = [box('hull', (L - 0.6, W - 1.0, 1.0), loc=(0, 0, 1.35), color='olive', bev=0.25),
         box('glacis', (1.4, W - 1.0, 0.8), loc=(L / 2 - 0.6, 0, 1.2), color='olive', bev=0.25, rot=(0, 0.45, 0)),
         box('deck', (L - 1.2, W - 0.2, 0.2), loc=(-0.2, 0, 1.75), color='olive', bev=0.08),
         box('exhaust', (0.6, 1.2, 0.25), loc=(-L / 2 + 0.6, 0, 1.9), color='ink', bev=0.08)]
    for s in (-1, 1):
        y = s * (W / 2 - 0.45)
        p.append(box(f'tread{s}', (L, 0.9, 1.1), loc=(0, y, 0.6), color='ink', bev=0.45, seg=4))
        p.append(box(f'guard{s}', (L + 0.1, 1.0, 0.1), loc=(0, y, 1.25), color='olive', bev=0.04))
        for i in range(5):
            p.append(cyl(f'rw{s}{i}', 0.36, 0.95, loc=(-2.2 + i * 1.1, y + 0.475, 0.5), color='steel', rot=(math.pi / 2, 0, 0), seg=20, bev=0.08))
        for i in range(14):
            p.append(box(f'tooth{s}{i}', (0.16, 0.95, 0.08), loc=(-2.7 + i * 0.42, y, 0.03), color='asphalt_lt', bev=0.02, seg=1))
        p.append(star(f'hullstar{s}', 0.35, (-1.6, s * (W / 2 - 0.49), 1.4), (s * math.pi / 2, 0, 0) if s < 0 else (-math.pi / 2, 0, math.pi)))
    root = join(p, 'tank')
    t = [cyl('ring', 1.2, 0.35, color='olive', seg=32, bev=0.1),
         sphere('dome', 1.2, loc=(0, 0, 0.3), color='olive', seg=32, scale=(1.15, 1, 0.55)),
         cyl('hatch', 0.4, 0.2, loc=(-0.3, 0.3, 0.85), color='olive', seg=20, bev=0.06),
         sphere('hatchknob', 0.08, loc=(-0.3, 0.3, 1.07), color='steel', seg=10),
         box('mantlet', (0.5, 0.8, 0.6), loc=(1.25, 0, 0.45), color='olive', bev=0.15),
         cyl('antenna', 0.03, 1.4, loc=(-0.9, -0.5, 0.6), color='ink', seg=8, bev=0),
         sphere('antennatip', 0.06, loc=(-0.9, -0.5, 2.0), color='siren_red', seg=8)]
    for s in (-1, 1):
        t.append(star(f'tstar{s}', 0.3, (0.1, s * 1.22, 0.45), (s * math.pi / 2, 0, 0) if s < 0 else (-math.pi / 2, 0, math.pi)))
    turret = join(t, 'turret')
    barrel = join([cyl('tube', 0.16, 2.6, color='olive', seg=20, rot=(0, math.pi / 2, 0), bev=0.04),
                   cyl('muzzle', 0.24, 0.45, loc=(2.4, 0, 0), color='ink', seg=20, rot=(0, math.pi / 2, 0), bev=0.06)], 'barrel')
    turret.location = (-0.3, 0, 1.85)
    barrel.location = (1.2, 0, 2.3)
    parent(turret, root)
    parent(barrel, turret)
    finish(root, kind='unit', unit='tank')
    keys(barrel, 'location', [(0, barrel.location.copy()), (2, barrel.location + Vector((-0.6, 0, 0))), (14, barrel.location.copy())], name='fire')
    return root
