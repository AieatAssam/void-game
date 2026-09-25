"""1950s cruiser (car-show event): two-tone mint and cream, sweeping tailfins with rocket lamps,
whitewall tyres, a mile of chrome, bullet bumpers and a hood ornament."""
from kit import *


def build():
    L, W = 5.0, 2.05
    p = car(L, W, 'mint', roof='cream', glass='glass', cabin=0.42, cabin_x=-0.1, H=0.6, ch=0.52, r=0.42)
    top = 0.294 + 0.6
    for s in (-1, 1):
        p += [prism(f'fin{s}', 0.12, 1.3, 0.38, loc=(-L / 2 + 0.7, s * (W / 2 - 0.12), top - 0.02), color='mint', bev=0.03),
              sphere(f'rocket{s}', 0.09, loc=(-L / 2 - 0.02, s * (W / 2 - 0.12), top + 0.1), color='siren_red', seg=14, scale=(1.8, 1, 1)),
              box(f'chrome_strip{s}', (L * 0.85, 0.03, 0.04), loc=(0, s * (W / 2 + 0.01), 0.294 + 0.4), color='chrome', bev=0.012, seg=1),
              box(f'twotone{s}', (L * 0.6, 0.02, 0.2), loc=(-0.3, s * (W / 2 + 0.005), 0.294 + 0.2), color='cream', bev=0.01, seg=1)]
        for i, x in enumerate((L * 0.32, -L * 0.32)):  # whitewalls + dog-dish hubcaps
            p += [torus(f'ww{i}{s}', 0.3, 0.06, loc=(x, s * (W / 2 - 0.03), 0.42), color='white', seg=28, rseg=6, rot=(math.pi / 2, 0, 0)),
                  sphere(f'dish{i}{s}', 0.2, loc=(x, s * (W / 2 - 0.02), 0.42), color='chrome', seg=18, scale=(1, 0.3, 1))]
        p += [torus(f'hl_bezel{s}', 0.13, 0.03, loc=(L / 2 + 0.02, s * 0.62, 0.294 + 0.42), color='chrome', seg=20, rseg=6, rot=(0, math.pi / 2, 0)),
              sphere(f'bullet{s}', 0.1, loc=(L / 2 + 0.22, s * 0.45, 0.28), color='chrome', seg=14, scale=(1.6, 1, 1))]
    p += [box('bumper_f', (0.18, W * 1.02, 0.2), loc=(L / 2 + 0.08, 0, 0.28), color='chrome', bev=0.08),
          box('bumper_r', (0.18, W * 1.02, 0.2), loc=(-L / 2 - 0.08, 0, 0.3), color='chrome', bev=0.08),
          tube('ornament', (L / 2 - 0.3, 0, top + 0.01), (L / 2 - 0.05, 0, top + 0.12), r=0.025, color='chrome'),
          sphere('ornament_tip', 0.04, loc=(L / 2 - 0.04, 0, top + 0.13), color='chrome', seg=10, scale=(1.8, 0.6, 0.6)),
          box('grille_bar', (0.05, W * 0.7, 0.05), loc=(L / 2 + 0.03, 0, 0.294 + 0.3), color='chrome', bev=0.02)]
    for k in range(9):
        p.append(box(f'teeth{k}', (0.05, 0.05, 0.16), loc=(L / 2 + 0.02, -0.56 + k * 0.14, 0.294 + 0.22), color='chrome', bev=0.015, seg=1))
    return tag(finish(join(p, 'classic_car'), mass=9), 'events', event='carshow', rare=True)
