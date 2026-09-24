"""Toy steam locomotive with tender (rail pack): navy boiler with brass bands, smokebox door and headlamp,
flared chimney, steam and sand domes, red cab with spectacle windows, cylinders, six red spoked driving
wheels with side rods, pony and trailing wheels, cowcatcher and buffers; tender heaped with coal.
Every wheel turns (clips 'w*'). Wheels sit at z=0; on a rail tile lift the model to the rail top (0.47)."""
from kit import *

GAUGE = 0.75


def rail_wheel(name, r, x, y, color='red', spokes=10):
    """Spoked wheel centred at (x, y, r) with the axle along Y, as its own object (pivot at the hub)."""
    s = 1 if y > 0 else -1
    parts = [cyl(name + 'tyre', r, 0.16, loc=(0, 0.08, 0), color='ink', rot=(math.pi / 2, 0, 0), seg=20, bev=0.03, bseg=1),
             cyl(name + 'flange', r * 1.08, 0.04, loc=(0, -s * 0.06 + 0.02, 0), color='ink', rot=(math.pi / 2, 0, 0), seg=20, bev=0, bseg=1),
             torus(name + 'rim', r * 0.86, r * 0.07, loc=(0, s * 0.06, 0), color=color, seg=20, rseg=4, rot=(math.pi / 2, 0, 0)),
             cyl(name + 'hub', r * 0.22, 0.2, loc=(0, s * 0.1 + 0.1 * (1 - s) / 2 * 0 + 0.1, 0), color=color, rot=(math.pi / 2, 0, 0), seg=14, bev=0.02, bseg=1),
             cyl(name + 'cap', r * 0.1, 0.24, loc=(0, 0.12, 0), color='butter', rot=(math.pi / 2, 0, 0), seg=10, bev=0.01, bseg=1)]
    for k in range(spokes):
        a = k * 2 * math.pi / spokes
        parts.append(box(f'{name}sp{k}', (0.05, 0.05, r * 0.66), loc=(math.cos(a) * r * 0.52, s * 0.06, math.sin(a) * r * 0.52), color=color, bev=0, seg=1,
                         rot=(0, -a + math.pi / 2, 0)))
    if r > 0.6:  # counterweight + crank pin
        parts += [box(name + 'cw', (r * 0.6, 0.06, r * 0.28), loc=(0, s * 0.07, r * 0.62), color=color, bev=0.04),  # opposite the crank pin
                  cyl(name + 'pin', 0.06, 0.1, loc=(0, 0.2 if s > 0 else -0.1, -r * 0.45), color='chrome', rot=(math.pi / 2, 0, 0), seg=8, bev=0.01)]  # reaches the side rod
    w = join(parts, name)
    w.location = (x, y, r)
    return w


def build():
    zb = 2.3  # boiler axis
    p = [box('frame', (11.6, 1.1, 0.5), loc=(0.0, 0, 0.95), color='ink', bev=0.05),
         box('running_board', (7.6, 2.6, 0.1), loc=(2.3, 0, 1.25), color='ink', bev=0.03),
         box('valance', (7.6, 2.62, 0.18), loc=(2.3, 0, 1.12), color='red', bev=0.02)]
    boiler = cyl('boiler', 0.95, 4.8, loc=(0.4, 0, zb), color='navy', seg=40, bev=0.03, rot=(0, math.pi / 2, 0))
    p += [boiler,
          cyl('smokebox', 1.0, 0.9, loc=(5.2, 0, zb), color='ink', seg=40, bev=0.05, rot=(0, math.pi / 2, 0)),
          cyl('smokebox_door', 0.8, 0.12, loc=(6.08, 0, zb), color='ink', seg=32, bev=0.06, rot=(0, math.pi / 2, 0)),
          box('door_dart', (0.08, 0.5, 0.06), loc=(6.22, 0, zb), color='chrome', bev=0.02),
          sphere('door_hub', 0.1, loc=(6.22, 0, zb), color='chrome', seg=10),
          box('numberplate', (0.05, 0.6, 0.22), loc=(6.2, 0, zb - 0.45), color='butter', bev=0.02),
          cyl('headlamp', 0.2, 0.3, loc=(5.9, 0, zb + 0.95), color='ink', seg=16, bev=0.04, rot=(0, math.pi / 2, 0)),
          sphere('headlamp_lens', 0.15, loc=(6.18, 0, zb + 0.95), color='glow_white', seg=12, scale=(0.4, 1, 1)),
          lathe('chimney', [(0.3, zb + 0.8), (0.28, zb + 1.3), (0.34, zb + 1.7), (0.45, zb + 1.85), (0.4, zb + 1.9), (0.0, zb + 1.9)], color='ink', seg=24, loc=(5.3, 0, 0)),
          torus('chimney_rim', 0.42, 0.05, loc=(5.3, 0, zb + 1.85), color='butter', seg=24, rseg=5),
          lathe('steam_dome', [(0.5, zb + 0.8), (0.45, zb + 1.2), (0.3, zb + 1.45), (0.0, zb + 1.5)], color='butter', seg=24, loc=(3.0, 0, 0)),
          lathe('sand_dome', [(0.4, zb + 0.8), (0.35, zb + 1.1), (0.0, zb + 1.2)], color='navy', seg=20, loc=(1.6, 0, 0)),
          cyl('whistle', 0.05, 0.4, loc=(0.7, 0, zb + 0.9), color='butter', seg=8, bev=0.01),
          lathe('bell', [(0.0, zb + 1.45), (0.12, zb + 1.4), (0.18, zb + 1.15), (0.2, zb + 1.1), (0.0, zb + 1.1)], color='butter', seg=16, loc=(4.2, 0, 0)),
          cyl('bell_post', 0.03, 0.35, loc=(4.2, 0, zb + 0.85), color='ink', seg=6, bev=0)]
    for k, x in enumerate((1.0, 2.2, 3.4, 4.6)):  # brass boiler bands
        p.append(torus(f'band{k}', 0.96, 0.03, loc=(x, 0, zb), color='butter', seg=40, rseg=5, rot=(0, math.pi / 2, 0)))
    for s in (-1, 1):
        p += [tube(f'handrail{s}', (0.6, s * 1.02, zb + 0.5), (5.3, s * 1.02, zb + 0.5), r=0.025, color='chrome', seg=6),
              # cylinders sit outboard of the wheels, below the valance and behind the pony truck
              cyl(f'cylinder{s}', 0.3, 1.3, loc=(4.4, s * 1.3, 0.72), color='navy', seg=20, bev=0.05, rot=(0, math.pi / 2, 0)),
              cyl(f'cyl_cover{s}', 0.32, 0.08, loc=(5.7, s * 1.3, 0.72), color='chrome', seg=20, bev=0.02, rot=(0, math.pi / 2, 0)),
              box(f'side_rod{s}', (3.4, 0.06, 0.12), loc=(2.6, s * 0.99, 0.72 * 0.55), color='chrome', bev=0.02),  # through the crank pins
              tube(f'main_rod{s}', (2.6, s * 1.05, 0.72 * 0.55), (4.3, s * 1.05, 0.72), r=0.05, color='chrome', seg=8),
              box(f'crosshead{s}', (0.3, 0.14, 0.2), loc=(4.3, s * 1.1, 0.72), color='steel', bev=0.03),
              cyl(f'buffer{s}', 0.1, 0.35, loc=(6.6, s * 0.8, 1.0), color='ink', seg=10, bev=0.02, rot=(0, math.pi / 2, 0)),
              cyl(f'buffer_head{s}', 0.2, 0.06, loc=(6.95, s * 0.8, 1.0), color='chrome', seg=16, bev=0.02, rot=(0, math.pi / 2, 0))]
        for x in (1.0, 2.6, 4.2):  # splashers over the driving wheels
            p.append(torus(f'splasher{s}{x}', 0.82, 0.12, loc=(x, s * 0.95, 0.75), color='red', seg=24, rseg=6, rot=(math.pi / 2, 0, 0), arc=(0.35, math.pi - 0.35)))
    # cowcatcher: slatted wedge
    for k in range(7):
        y = -0.9 + k * 0.3
        p.append(box(f'cow{k}', (0.9, 0.08, 0.08), loc=(6.95, y, 0.42), color='red', bev=0.02, seg=1, rot=(0, -0.6, math.atan2(-y, 1.4) * 0.5)))
    p.append(box('cow_top', (0.2, 2.0, 0.15), loc=(6.75, 0, 0.72), color='red', bev=0.04))
    # cab
    p += [box('cab_front', (0.12, 2.5, 1.9), loc=(0.35, 0, 2.2), color='red', bev=0.04),
          box('cab_floor', (1.7, 2.5, 0.1), loc=(-0.45, 0, 1.3), color='ink', bev=0.02),
          box('cab_roof', (2.1, 2.8, 0.14), loc=(-0.45, 0, 3.25), color='ink', bev=0.06),
          box('backhead', (0.3, 1.6, 1.4), loc=(0.15, 0, 2.2), color='ink', bev=0.05)]
    for s in (-1, 1):
        p += [box(f'cab_side{s}', (1.7, 0.1, 1.9), loc=(-0.45, s * 1.2, 2.2), color='red', bev=0.04),
              box(f'cab_window{s}', (0.7, 0.12, 0.6), loc=(-0.35, s * 1.21, 2.65), color='glass', bev=0.03),
              box(f'cab_lining{s}', (1.5, 0.11, 0.05), loc=(-0.45, s * 1.21, 1.6), color='butter', bev=0.01, seg=1),
              cyl(f'spectacle{s}', 0.22, 0.14, loc=(0.34, s * 0.62, 2.7), color='glass', seg=16, bev=0.02, rot=(0, math.pi / 2, 0)),
              torus(f'spec_rim{s}', 0.22, 0.03, loc=(0.42, s * 0.62, 2.7), color='butter', seg=16, rseg=4, rot=(0, math.pi / 2, 0)),
              tube(f'cab_pillar{s}', (-1.3, s * 1.2, 1.3), (-1.3, s * 1.2, 3.2), r=0.05, color='red', seg=6)]
    # tender
    tx = -3.6
    p += [box('tender', (3.6, 2.5, 1.9), loc=(tx, 0, 2.15), color='red', bev=0.08),
          box('tender_base', (3.8, 2.6, 0.2), loc=(tx, 0, 1.2), color='ink', bev=0.04),
          box('tender_lining', (3.4, 2.52, 0.05), loc=(tx, 0, 2.6), color='butter', bev=0.01, seg=1),
          cyl('filler', 0.25, 0.2, loc=(tx - 1.2, 0, 3.1), color='ink', seg=14, bev=0.04)]
    import random
    rnd = random.Random(5)
    for k in range(14):  # heaped coal
        p.append(blob(f'coal{k}', 0.32, (tx + 0.4 + (rnd.random() - 0.5) * 2.0, (rnd.random() - 0.5) * 1.6, 3.1 + rnd.random() * 0.15), 'gloss_black',
                      seed=k, amp=0.35, scale=(1, 1, 0.6), seg=8))
    for s in (-1, 1):
        p += [cyl(f'tbuffer{s}', 0.1, 0.3, loc=(tx - 1.9, s * 0.8, 1.0), color='ink', seg=10, bev=0.02, rot=(0, -math.pi / 2, 0)),
              cyl(f'tbuffer_head{s}', 0.2, 0.06, loc=(tx - 2.25, s * 0.8, 1.0), color='chrome', seg=16, bev=0.02, rot=(0, math.pi / 2, 0)),
              box(f'tframe{s}', (3.4, 0.12, 0.45), loc=(tx, s * 1.0, 0.75), color='ink', bev=0.03)]
    p.append(box('coupling', (0.3, 0.2, 0.15), loc=(tx - 2.05, 0, 1.0), color='steel', bev=0.03))
    root = join(p, 'locomotive')
    wheels = []
    for s in (-1, 1):
        y = s * GAUGE
        for k, x in enumerate((1.0, 2.6, 4.2)):
            wheels.append(rail_wheel(f'drv{s}{k}', 0.72, x, y))
        wheels.append(rail_wheel(f'pony{s}', 0.4, 6.15, y, spokes=8))
        wheels.append(rail_wheel(f'trail{s}', 0.45, -0.7, y, spokes=8))
        for k, x in enumerate((tx + 1.2, tx, tx - 1.2)):
            wheels.append(rail_wheel(f'tw{s}{k}', 0.45, x, y, color='ink', spokes=8))
    for w in wheels:
        parent(w, root)
    finish(root, mass=70)
    for w in wheels:  # forward (+X) rolling; game scales clip speed with train speed
        spin(w, 'Y', frames=int(24 * w.location.z / 0.72), turns=1, name='w_' + w.name)
    return tag(root, 'rail', mover='rail', clone=True, rail_top=0.47, lod=[0.3, 0.1])
