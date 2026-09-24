"""Passenger carriage (rail pack): two-tone mint/cream coach with a curved roof, eight framed windows a side,
end doors, brass lining, roof vents, gangway bellows, buffers, underframe battery boxes and two bogies whose
wheels turn (clips 'w*'). Wheels sit at z=0; on a rail tile lift to the rail top (0.47)."""
from kit import *
from locomotive import rail_wheel, GAUGE


def build():
    Lc, Wc = 10.0, 2.6
    zf, zr = 1.15, 3.1  # floor, eaves
    p = [box('underframe', (Lc - 0.4, 1.4, 0.35), loc=(0, 0, 1.0), color='ink', bev=0.04),
         box('lower', (Lc, Wc, 1.0), loc=(0, 0, zf + 0.5), color='mint', bev=0.08),
         box('upper', (Lc, Wc, zr - zf - 1.0), loc=(0, 0, zf + 1.0 + (zr - zf - 1.0) / 2), color='cream', bev=0.08)]
    roof = cyl('roof', 1.45, Lc + 0.1, loc=(-Lc / 2 - 0.05, 0, zr + 0.05), color='ink', seg=40, bev=0.06, rot=(0, math.pi / 2, 0))
    roof.scale = (0.45, 0.93, 1)  # local X is world Z after the turn: a shallow elliptical roof with a small eave
    p.append(roof)
    for k in range(4):  # roof vents
        p.append(cyl(f'vent{k}', 0.16, 0.22, loc=(-3.6 + k * 2.4, 0, zr + 0.62), color='ink', seg=12, bev=0.04))
    for s in (-1, 1):
        y = s * (Wc / 2 + 0.005)
        p += [box(f'lining{s}', (Lc - 0.2, 0.02, 0.05), loc=(0, y, zf + 1.0), color='butter', bev=0, seg=1),
              box(f'lining2{s}', (Lc - 0.2, 0.02, 0.04), loc=(0, y, zf + 0.15), color='butter', bev=0, seg=1)]
        for k in range(8):
            x = -3.5 + k * 1.0
            p += [box(f'win{s}{k}', (0.72, 0.03, 0.7), loc=(x, y, zf + 1.42), color='glass', bev=0.012),
                  box(f'wframe{s}{k}', (0.8, 0.02, 0.78), loc=(x, y - s * 0.005, zf + 1.42), color='white', bev=0.012)]
        for e in (-1, 1):  # end doors with droplights and handles
            x = e * (Lc / 2 - 0.55)
            p += [box(f'door{s}{e}', (0.75, 0.03, 1.75), loc=(x, y, zf + 0.95), color='mint', bev=0.04),
                  box(f'dwin{s}{e}', (0.45, 0.035, 0.5), loc=(x, y, zf + 1.5), color='glass', bev=0.04),
                  cyl(f'handle{s}{e}', 0.02, 0.3, loc=(x + 0.25, y + s * 0.03, zf + 0.9), color='butter', seg=6, bev=0),
                  box(f'step{s}{e}', (0.6, 0.25, 0.06), loc=(x, s * (Wc / 2 + 0.1), zf - 0.35), color='ink', bev=0.02)]
        for k in range(2):  # battery boxes
            p.append(box(f'battery{s}{k}', (0.9, 0.2, 0.45), loc=(-1.0 + k * 2.0, s * 0.55, 0.65), color='ink', bev=0.04))
    for e in (-1, 1):
        x = e * Lc / 2
        p += [box(f'bellows{e}', (0.3, 1.4, 2.2), loc=(x + e * 0.12, 0, zf + 1.1), color='ink', bev=0.06)]
        for k in range(5):
            p.append(box(f'fold{e}{k}', (0.04, 1.45, 2.25), loc=(x + e * (0.02 + k * 0.05), 0, zf + 1.1), color='asphalt_lt', bev=0.01, seg=1))
        for s in (-1, 1):
            p += [cyl(f'buffer{e}{s}', 0.09, 0.3, loc=(x, s * 0.8, 1.0), color='ink', seg=10, bev=0.02, rot=(0, e * math.pi / 2, 0)),
                  cyl(f'bhead{e}{s}', 0.18, 0.05, loc=(x + e * 0.3, s * 0.8, 1.0), color='chrome', seg=14, bev=0.02, rot=(0, e * math.pi / 2, 0))]
    for bx in (-3.4, 3.4):  # bogie frames
        for s in (-1, 1):
            p += [box(f'bogie{bx}{s}', (2.4, 0.12, 0.35), loc=(bx, s * 1.0, 0.5), color='ink', bev=0.04),
                  box(f'spring{bx}{s}', (0.5, 0.14, 0.2), loc=(bx, s * 1.02, 0.78), color='steel', bev=0.04)]
        p.append(box(f'bolster{bx}', (0.4, 2.0, 0.2), loc=(bx, 0, 0.78), color='ink', bev=0.04))
    root = join(p, 'carriage')
    wheels = []
    for bx in (-3.4, 3.4):
        for dx in (-0.8, 0.8):
            for s in (-1, 1):
                wheels.append(rail_wheel(f'cw{bx}{dx}{s}', 0.42, bx + dx, s * GAUGE, color='ink', spokes=8))
    for w in wheels:
        parent(w, root)
    finish(root, mass=40)
    for w in wheels:
        spin(w, 'Y', frames=int(24 * 0.42 / 0.72), turns=1, name='w_' + w.name)
    return tag(root, 'rail', mover='rail', clone=True, rail_top=0.47, lod=[0.3, 0.1])
