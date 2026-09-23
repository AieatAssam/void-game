from lib import *


def rotor(name, n, R, chord, color, hub_color, z_axis=True):
    hub = cyl(name + '_hub', 0.22 if z_axis else 0.12, 0.2 if z_axis else 0.12, color=hub_color)
    parts = [hub]
    for i in range(n):
        a = 2 * math.pi * i / n
        b = box(f'{name}_b{i}', (R, chord, 0.05), color=color, bev=0.02)
        b.location = (math.cos(a) * R / 2, math.sin(a) * R / 2, 0.1)
        b.rotation_euler = (0.08, 0, a)
        parts.append(b)
        parts.append(box(f'{name}_tip{i}', (0.25, chord * 1.05, 0.06), loc=(math.cos(a) * (R - 0.12), math.sin(a) * (R - 0.12), 0.1),
                         color='hazard', bev=0.02, rot=(0.08, 0, a)))
    return join(parts, name)


def build():
    body = [
        sphere('cabin', 1.0, loc=(0.6, 0, 1.25), color='white', seg=40, scale=(1.35, 0.95, 0.9)),
        sphere('glass', 0.8, loc=(1.25, 0, 1.4), color='sky', seg=40, scale=(0.95, 0.85, 0.72)),
        box('belly', (1.9, 1.5, 0.35), loc=(0.45, 0, 0.6), color='police', bev=0.15),
        box('stripe', (2.2, 1.92, 0.22), loc=(0.55, 0, 1.18), color='police', bev=0.1),
        cyl('boom', 0.34, 3.2, loc=(-0.4, 0, 1.45), color='white', rot=(0, -math.pi / 2, 0), r2=0.14, bev=0.04),
        box('fin', (0.7, 0.12, 0.95), loc=(-3.45, 0, 1.85), color='police', bev=0.05, rot=(0, 0.35, 0)),
        box('stab', (0.45, 1.1, 0.08), loc=(-3.1, 0, 1.45), color='police', bev=0.03),
        cyl('mast', 0.16, 0.45, loc=(0.4, 0, 2.05), color='steel'),
        box('engine', (1.1, 0.8, 0.4), loc=(0.1, 0, 2.0), color='white', bev=0.15),
        cyl('light', 0.14, 0.12, loc=(1.35, 0, 0.42), color='glow_white', rot=(0, math.pi, 0)),
        box('siren_l', (0.35, 0.16, 0.1), loc=(0.1, 0.25, 2.22), color='siren_red', bev=0.03),
        box('siren_r', (0.35, 0.16, 0.1), loc=(0.1, -0.25, 2.22), color='siren_blue', bev=0.03),
    ]
    for s in (-1, 1):
        body.append(cyl(f'skid{s}', 0.07, 2.6, loc=(1.6, s * 0.75, 0.07), color='steel', rot=(0, -math.pi / 2, 0), bev=0.02))
        body.append(torus(f'skid_tip{s}', 0.14, 0.07, loc=(1.6, s * 0.75, 0.21), color='steel', seg=16, rseg=8, rot=(math.pi / 2, 0, 0)))
        for x in (1.1, -0.1):
            body.append(cyl(f'strut{s}{x}', 0.05, 0.55, loc=(x, s * 0.72, 0.1), color='steel', rot=(s * 0.3, 0, 0)))
    root = join(body, 'heli')
    main = rotor('rotor', 4, 3.2, 0.32, 'ink', 'steel')
    main.location = (0.4, 0, 2.45)
    tail = rotor('tail_rotor', 3, 0.7, 0.14, 'ink', 'hazard', z_axis=False)
    tail.location, tail.rotation_euler = (-3.45, 0.14, 2.0), (math.pi / 2, 0, 0)
    for r in (main, tail):
        parent(r, root)
    finish(root, tier=3.2, mass=18, kind='unit', unit='heli')
    spin(main, 'Z', frames=12, name='rotor')
    spin(tail, 'Z', frames=6, name='tail')
    return root
