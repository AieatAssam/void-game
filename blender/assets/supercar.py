"""Supercar (car-show event): low and wide, hot-pink paint, big rear wing, side intakes, diffuser,
quad exhausts, LED light strips and gold rims."""
from kit import *


def build():
    L, W = 4.5, 2.05
    p = car(L, W, 'hot_pink', roof='gloss_black', glass='gloss_black', cabin=0.34, cabin_x=-0.08, H=0.46, ch=0.3, r=0.4)
    z0, top = 0.28, 0.28 + 0.46
    # low bubble cockpit smoothing the boxy cabin into a supercar canopy
    p += [sphere('canopy', 1.0, loc=(-0.08 * L, 0, top + 0.02), color='gloss_black', seg=28, scale=(1.2, 0.8, 0.4)),
          sphere('canopy_trim', 1.0, loc=(-0.08 * L, 0, top - 0.02), color='hot_pink', seg=28, scale=(1.22, 0.83, 0.3))]
    p += [box('splitter', (0.35, W * 0.98, 0.05), loc=(L / 2 + 0.05, 0, 0.18), color='gloss_black', bev=0.02),
          box('diffuser', (0.3, W * 0.8, 0.18), loc=(-L / 2 - 0.02, 0, 0.22), color='gloss_black', bev=0.03),
          box('led_front', (0.03, W * 0.7, 0.03), loc=(L / 2 + 0.01, 0, top - 0.12), color='glow_white', bev=0.01, seg=1),
          box('led_rear', (0.03, W * 0.85, 0.04), loc=(-L / 2 - 0.01, 0, top - 0.1), color='siren_red', bev=0.01, seg=1),
          box('hood_vent', (0.5, 0.6, 0.02), loc=(L * 0.3, 0, top + 0.005), color='gloss_black', bev=0.01)]
    for k in range(4):
        p.append(box(f'vent_slat{k}', (0.03, 0.56, 0.015), loc=(L * 0.3 - 0.18 + k * 0.12, 0, top + 0.02), color='hot_pink', bev=0.005, seg=1))
    # rear wing on two uprights
    p += [box('wing', (0.45, W * 0.95, 0.05), loc=(-L / 2 + 0.3, 0, top + 0.42), color='gloss_black', bev=0.02, rot=(0, -0.08, 0))]
    for s in (-1, 1):
        p += [box(f'wing_post{s}', (0.12, 0.05, 0.4), loc=(-L / 2 + 0.32, s * 0.55, top + 0.2), color='gloss_black', bev=0.015),
              box(f'endplate{s}', (0.5, 0.03, 0.2), loc=(-L / 2 + 0.3, s * W * 0.48, top + 0.4), color='hot_pink', bev=0.015),
              box(f'intake{s}', (0.6, 0.04, 0.22), loc=(-0.45, s * (W / 2 + 0.005), 0.55), color='gloss_black', bev=0.03),
              box(f'intake_lip{s}', (0.62, 0.05, 0.03), loc=(-0.45, s * (W / 2 + 0.01), 0.67), color='chrome', bev=0.01, seg=1),
              box(f'skirt{s}', (L * 0.55, 0.06, 0.06), loc=(0, s * (W / 2 + 0.01), 0.24), color='gloss_black', bev=0.02)]
        for k in range(2):
            p.append(cyl(f'exhaust{s}{k}', 0.055, 0.14, loc=(-L / 2 - 0.1, s * (0.2 + k * 0.14), 0.26), color='chrome', seg=14, rot=(0, -math.pi / 2, 0), bev=0.01))
    for i, x in enumerate((L * 0.32, -L * 0.32)):  # gold multi-spoke rims over the wheel faces
        for s in (-1, 1):
            p += [torus(f'goldlip{i}{s}', 0.26, 0.03, loc=(x, s * (W / 2 - 0.02), 0.4), color='gold', seg=24, rseg=6, rot=(math.pi / 2, 0, 0))]
            for k in range(10):
                a = k * math.pi / 5
                p.append(box(f'gspoke{i}{s}{k}', (0.03, 0.02, 0.22), loc=(x + math.cos(a) * 0.12, s * (W / 2 - 0.01), 0.4 + math.sin(a) * 0.12),
                             color='gold', bev=0.006, seg=1, rot=(0, -a + math.pi / 2, 0)))
    return tag(finish(join(p, 'supercar'), mass=8), 'events', event='carshow', rare=True)
