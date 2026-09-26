"""Region pack: a power-station cooling tower (tier ~23, 55 m). A hyperboloid concrete shell on a ring of raked
legs, with a pale stripe band, maintenance ladder and a warm plume vent glow at the lip."""
from kit import *


def build():
    R0, Rm, R1, H = 22.0, 13.5, 15.5, 56.0
    prof = []
    for k in range(13):
        t = k / 12
        z = 4.0 + t * (H - 4.0)
        # hyperbola: narrowest at 75% height
        u = (t - 0.75) / 0.75
        rr = Rm + (R0 - Rm) * u * u if t < 0.75 else Rm + (R1 - Rm) * ((t - 0.75) / 0.25) ** 2
        prof.append((rr, z))
    p = [lathe('shell', prof, loc=(0, 0, 0), color='concrete', seg=48),
         lathe('inner', [(r - 0.6, z) for r, z in reversed(prof)], loc=(0, 0, 0), color='concrete', seg=48),
         cyl('pond', R0 - 0.5, 0.6, loc=(0, 0, 0), color='water', seg=48, bev=0.05),
         cyl('glow', R1 - 1.0, 0.1, loc=(0, 0, H - 0.6), color='glow', seg=48, bev=0)]
    # the lip joining outer and inner shell
    p.append(torus('lip', R1 - 0.3, 0.45, loc=(0, 0, H), color='concrete', seg=48, rseg=6))
    for k in range(24):  # raked legs
        a = k * math.tau / 24
        b = a + math.tau / 48
        p.append(tube(f'leg{k}', (math.cos(a) * (R0 + 0.6), math.sin(a) * (R0 + 0.6), 0), (math.cos(b) * R0, math.sin(b) * R0, 4.2), r=0.45, color='concrete', seg=6))
    t = 0.86
    zb = 4.0 + t * (H - 4.0)
    rb = Rm + (R1 - Rm) * ((t - 0.75) / 0.25) ** 2
    p.append(cyl('stripe', rb + 0.08, 3.0, loc=(0, 0, zb), color='red', seg=48, bev=0.02, r2=rb + 0.25))
    for k in range(40):
        z = 5 + k * 1.25
        tt = (z - 4.0) / (H - 4.0)
        u = (tt - 0.75) / 0.75
        rr = Rm + (R0 - Rm) * u * u if tt < 0.75 else Rm + (R1 - Rm) * ((tt - 0.75) / 0.25) ** 2
        p.append(box(f'rung{k}', (0.12, 0.8, 0.08), loc=(rr + 0.15, 0, z), color='ink', bev=0, seg=1))
    return finish(tag(join(p, 'cooling_tower'), 'region'), smooth_angle=60)
