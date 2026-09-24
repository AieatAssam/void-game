"""Twin-jet airliner (airport landmark, the biggest thing you can ever swallow): lathed fuselage with cockpit
glazing and a row of cabin windows, doors, swept wings with winglets and flap seams, two turbofans with
fan faces and spinners, swept tail with the Void Hole Air disc, tricycle gear, nav lights and an APU exhaust."""
from kit import *

L, RF = 28.0, 1.9  # length, fuselage radius
ZC = 1.35 + RF  # fuselage centre height (on its gear)


def wing(name, root_x, root_c, tip_x, tip_c, span, z, dihedral, thick, color, side):
    """Swept tapered wing panel as a closed mesh (root at y=0, tip at y=side*span)."""
    zt = z + span * math.tan(dihedral)
    v = [(root_x, 0, z + thick), (root_x - root_c, 0, z + thick * 0.6), (tip_x - tip_c, side * span, zt + thick * 0.2), (tip_x, side * span, zt + thick * 0.4),
         (root_x, 0, z - thick * 0.3), (root_x - root_c, 0, z), (tip_x - tip_c, side * span, zt), (tip_x, side * span, zt)]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return bevel(mesh(name, v, f, color=color), 0.08, 2)


PROF = [(0.0, 0.0), (0.7, 0.25), (1.35, 0.9), (1.75, 2.2), (RF, 3.8), (RF, L - 7.5), (1.6, L - 4.5), (1.05, L - 2.2), (0.5, L - 0.6), (0.0, L)]


def radius_at(x):
    """Fuselage radius at world x (nose at +L/2)."""
    z = L / 2 - x
    for (r0, z0), (r1, z1) in zip(PROF, PROF[1:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / max(1e-6, z1 - z0)
    return 0.0


def wrap(ob, lift=0.004):
    """Hug a thin decal part (window, door, stripe) onto the curved fuselage: each vertex keeps its angle round
    the fuselage axis, and its depth becomes height above the skin - no floating corners, no buried edges."""
    bpy.context.view_layer.update()
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    vs = ob.data.vertices
    rad = [math.hypot(v.co.y, v.co.z - ZC) for v in vs]
    inner = min(rad)
    for v, r in zip(vs, rad):
        a = math.atan2(v.co.z - ZC, v.co.y)
        R = radius_at(v.co.x) + lift + (r - inner)
        v.co.y, v.co.z = R * math.cos(a), ZC + R * math.sin(a)
    return ob


def build():
    x0 = -L / 2
    prof = [(0.0, 0.0), (0.7, 0.25), (1.35, 0.9), (1.75, 2.2), (RF, 3.8), (RF, L - 7.5), (1.6, L - 4.5), (1.05, L - 2.2), (0.5, L - 0.6), (0.0, L)]
    body = lathe('fuselage', [(r, z) for r, z in prof], color='white', seg=40)
    body.rotation_euler = (0, -math.pi / 2, 0)
    body.location = (L / 2, 0, ZC)
    p = [body]
    # livery, glazing, windows and doors are wrapped onto the skin
    for s in (-1, 1):
        p += [wrap(box(f'belly_stripe{s}', (L - 10, 0.02, 0.35), loc=(0.8, s * RF, ZC - 0.45), color='sky', bev=0, seg=1)),
              wrap(box(f'cheat{s}', (L - 9.5, 0.02, 0.14), loc=(0.6, s * RF, ZC - 0.1), color='lilac', bev=0, seg=1))]
        for k in range(3):
            p.append(wrap(box(f'cockpit{s}{k}', (0.5, 0.04, 0.34), loc=(L / 2 - 2.3 - k * 0.55, s * 1.7, ZC + 0.55), color='gloss_black', bev=0.012), lift=0.002))
        for k in range(26):
            p.append(wrap(box(f'win{s}{k}', (0.26, 0.03, 0.34), loc=(L / 2 - 5.2 - k * 0.72, s * RF, ZC + 0.45), color='glass', bev=0.01)))
        for x in (L / 2 - 4.3, -L / 2 + 7.2):
            p += [wrap(box(f'door{s}{x}', (0.9, 0.025, 1.6), loc=(x, s * RF, ZC + 0.1), color='concrete', bev=0.01)),
                  wrap(box(f'doorwin{s}{x}', (0.2, 0.025, 0.26), loc=(x, s * RF, ZC + 0.55), color='glass', bev=0.008), lift=0.03)]
    # wings, engines, winglets
    for s in (-1, 1):
        p.append(wing(f'wing{s}', 3.5, 6.8, -3.2, 1.9, 13.2, ZC - 1.0, 0.09, 0.55, 'white', s))
        tipz = ZC - 1.0 + 13.2 * math.tan(0.09)
        p += [box(f'winglet{s}', (1.6, 0.14, 1.8), loc=(-4.0, s * 13.2, tipz + 0.95), color='navy', bev=0.06, rot=(s * 0.15, -0.35, 0)),
              sphere(f'navlight{s}', 0.12, loc=(-3.2, s * 13.35, tipz + 0.2), color='toxic' if s > 0 else 'siren_red', seg=8)]
        for k in range(3):  # flap track fairings under the trailing edge
            y = s * (3.5 + k * 3.0)
            p.append(sphere(f'fairing{s}{k}', 0.25, loc=(-2.0 - k * 0.8, y, ZC - 1.35 + abs(y) * 0.09), color='white', seg=10, scale=(3.2, 0.7, 0.8)))
        ex, ey, ez = 1.3, s * 5.6, ZC - 1.75  # engine slung under the wing, 0.3 m ground clearance
        eng = lathe(f'nacelle{s}', [(1.0, 0), (1.18, 0.4), (1.2, 2.2), (1.0, 3.6), (0.62, 4.2), (0.0, 4.25)], color='white', seg=32)
        eng.rotation_euler = (0, -math.pi / 2, 0)
        eng.location = (ex + 2.1, ey, ez)
        p += [eng,
              torus(f'lip{s}', 1.02, 0.12, loc=(ex + 2.1, ey, ez), color='chrome', seg=32, rseg=8, rot=(0, math.pi / 2, 0)),
              cyl(f'fan{s}', 0.95, 0.06, loc=(ex + 1.9, ey, ez), color='ink', seg=32, bev=0, rot=(0, math.pi / 2, 0)),
              sphere(f'spinner{s}', 0.35, loc=(ex + 1.98, ey, ez), color='chrome', seg=14, scale=(1.3, 1, 1)),
              box(f'pylon{s}', (3.2, 0.3, 1.0), loc=(ex - 0.2, ey, ez + 1.2), color='white', bev=0.1),
              lathe(f'exhaust{s}', [(0.6, 0), (0.45, 0.8), (0.0, 1.2)], color='concrete', seg=20, rot=(0, -math.pi / 2, 0), loc=(ex - 2.1, ey, ez))]
        for k in range(12):  # fan blades
            a = k * math.pi / 6
            p.append(box(f'blade{s}{k}', (0.03, 0.18, 0.78), loc=(ex + 1.93, ey + math.cos(a) * 0.55, ez + math.sin(a) * 0.55), color='steel', bev=0, seg=1,
                         rot=(a - math.pi / 2, 0.4, 0)))
        p.append(wing(f'stab{s}', -L / 2 + 4.6, 3.0, -L / 2 + 2.2, 1.3, 5.2, ZC + 0.6, 0.12, 0.3, 'white', s))
    # tail fin with the airline disc
    fin = mesh('fin', [(-L / 2 + 6.2, 0.2, ZC + 0.6), (-L / 2 + 2.4, 0.2, ZC + 0.6), (-L / 2 + 0.3, 0.12, ZC + 7.0), (-L / 2 + 2.4, 0.12, ZC + 7.0),
                       (-L / 2 + 6.2, -0.2, ZC + 0.6), (-L / 2 + 2.4, -0.2, ZC + 0.6), (-L / 2 + 0.3, -0.12, ZC + 7.0), (-L / 2 + 2.4, -0.12, ZC + 7.0)],
               [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], color='navy')
    p += [bevel(fin, 0.1, 2)]
    for s in (-1, 1):
        p += [cyl(f'logo{s}', 0.95, 0.04, loc=(-L / 2 + 2.75, s * 0.14, ZC + 4.0), color='lilac', seg=28, bev=0.01, rot=(-s * math.pi / 2, 0, 0)),
              cyl(f'logo_void{s}', 0.58, 0.04, loc=(-L / 2 + 2.75, s * 0.16, ZC + 4.0), color='void', seg=24, bev=0.01, rot=(-s * math.pi / 2, 0, 0))]
    p += [sphere('beacon_top', 0.14, loc=(-1.0, 0, ZC + RF + 0.05), color='siren_red', seg=8),
          sphere('beacon_belly', 0.14, loc=(0.5, 0, ZC - RF - 0.05), color='siren_red', seg=8),
          cyl('apu', 0.2, 0.3, loc=(-L / 2 + 0.05, 0, ZC + 0.05), color='ink', seg=12, rot=(0, -math.pi / 2, 0), bev=0)]
    # landing gear: nose strut + two main bogies
    p += [tube('nose_strut', (L / 2 - 3.2, 0, ZC - 1.5), (L / 2 - 3.2, 0, 0.45), r=0.12, color='white')]
    p += wheel('nose_wl', 0.42, 0.28, L / 2 - 3.2, 0.2, z=0.42, hub='white', detail=False)
    p += wheel('nose_wr', 0.42, 0.28, L / 2 - 3.2, -0.2, z=0.42, hub='white', detail=False)
    for s in (-1, 1):
        y = s * 3.0
        p += [tube(f'main_strut{s}', (-0.6, y, ZC - 1.1), (-0.6, y, 0.6), r=0.2, color='white'),
              box(f'bogie{s}', (2.0, 0.3, 0.25), loc=(-0.6, y, 0.6), color='steel', bev=0.06),
              box(f'gear_door{s}', (1.6, 0.06, 1.2), loc=(-0.6, y + s * 0.5, ZC - 1.6), color='white', bev=0.04)]
        for x in (0.2, -1.4):
            for t in (-1, 1):
                p += wheel(f'mw{s}{x}{t}', 0.55, 0.35, x, y + t * 0.35, z=0.55, hub='white', detail=False)
    root = finish(join(p, 'airliner'), mass=900)
    return tag(root, 'airport', landmark=True, lod=[0.3, 0.1])
