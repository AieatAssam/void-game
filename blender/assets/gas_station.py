"""Gas station (chain reaction: swallowing it sets off a blast that knocks props loose around it).
Forecourt with two pump islands under a lit canopy, four detailed pumps with hoses and screens, a kiosk shop
with an ice chest and tyre rack, a tall price pylon, vent pipes, air/water post and bollards."""
from kit import *


def pump(p, k, x, y):
    p += [box(f'pump{k}', (0.5, 0.9, 1.7), loc=(x, y, 0.35 + 0.85), color='white', bev=0.08),
          box(f'pump_top{k}', (0.55, 0.95, 0.25), loc=(x, y, 0.35 + 1.8), color='red', bev=0.06),
          box(f'pump_band{k}', (0.52, 0.92, 0.12), loc=(x, y, 0.35 + 0.35), color='red', bev=0.03)]
    for s in (-1, 1):
        p += [box(f'screen{k}{s}', (0.03, 0.45, 0.28), loc=(x + s * 0.26, y, 1.75), color='toxic', bev=0.02),
              box(f'keypad{k}{s}', (0.03, 0.2, 0.2), loc=(x + s * 0.26, y + 0.22, 1.35), color='ink', bev=0.02),
              box(f'holster{k}{s}', (0.12, 0.14, 0.25), loc=(x + s * 0.3, y - 0.3, 1.2), color='ink', bev=0.03),
              tube(f'nozzle{k}{s}', (x + s * 0.34, y - 0.3, 1.3), (x + s * 0.38, y - 0.18, 1.05), r=0.035, color='hazard', seg=6)]
        p += rope(f'hose{k}{s}', (x + s * 0.26, y - 0.4, 1.9), (x + s * 0.34, y - 0.3, 1.3), sag=0.5, r=0.025, color='ink', segs=5)


def build():
    p = [box('forecourt', (14.0, 11.0, 0.12), loc=(0, 0, 0.06), color='concrete', bev=0.04)]
    for k in range(2):  # pump islands
        y = -2.2 + k * 4.4
        p += [box(f'island{k}', (1.2, 4.0, 0.35), loc=(1.0, y, 0.175), color='hazard', bev=0.06),
              box(f'island_top{k}', (1.1, 3.9, 0.02), loc=(1.0, y, 0.36), color='concrete', bev=0, seg=1)]
        pump(p, 2 * k, 1.0, y - 0.9)
        pump(p, 2 * k + 1, 1.0, y + 0.9)
        for s in (-1, 1):
            p.append(cyl(f'bollard{k}{s}', 0.12, 0.9, loc=(1.0, y + s * 2.1, 0.12), color='hazard', seg=12, bev=0.04))
    # canopy on four pillars
    zc = 4.6
    for x in (-1.6, 3.6):
        for y in (-3.2, 3.2):
            p.append(box(f'pillar{x}{y}', (0.45, 0.45, zc), loc=(x, y, zc / 2), color='white', bev=0.06))
    p += [box('canopy', (7.6, 9.4, 0.7), loc=(1.0, 0, zc + 0.35), color='white', bev=0.1),
          box('fascia', (7.7, 9.5, 0.3), loc=(1.0, 0, zc + 0.4), color='red', bev=0.05),
          box('fascia_stripe', (7.72, 9.52, 0.08), loc=(1.0, 0, zc + 0.62), color='butter', bev=0.02)]
    for i in range(3):
        for j in range(4):
            p.append(box(f'downlight{i}{j}', (0.9, 0.5, 0.04), loc=(-1.4 + i * 2.4, -3.3 + j * 2.2, zc - 0.02), color='glow_white', bev=0.02))
    # kiosk shop at the back
    p += [box('kiosk', (4.0, 7.0, 3.2), loc=(-5.0, 0, 1.72), color='cream', bev=0.1),
          box('kiosk_roof', (4.3, 7.3, 0.3), loc=(-5.0, 0, 3.45), color='red', bev=0.06),
          box('kiosk_glass', (0.08, 4.0, 1.8), loc=(-2.98, 0.6, 1.5), color='glass', bev=0.03),
          box('kiosk_door', (0.08, 1.2, 2.1), loc=(-2.98, -2.3, 1.17), color='glass', bev=0.03),
          box('door_frame', (0.06, 1.35, 2.2), loc=(-2.99, -2.3, 1.2), color='ink', bev=0.02),
          box('ice_chest', (0.8, 1.4, 0.9), loc=(-2.4, 2.8, 0.57), color='sky', bev=0.08),
          box('ice_lid', (0.85, 1.45, 0.08), loc=(-2.4, 2.8, 1.04), color='white', bev=0.03),
          box('tyre_rack', (0.5, 1.4, 1.2), loc=(-2.6, -3.9, 0.72), color='ink', bev=0.03)]
    for k in range(3):
        p.append(torus(f'tyre{k}', 0.35, 0.12, loc=(-2.5, -3.9, 0.6 + k * 0.28), color='ink', seg=20, rseg=8))
    for k in range(4):  # shelves glimpsed through the glass
        p.append(box(f'shelf{k}', (0.4, 0.8, 1.2), loc=(-3.6, -0.8 + k * 0.9, 0.8), color=('red', 'sky', 'butter', 'mint')[k], bev=0.05))
    # price pylon
    p += [box('pylon', (0.6, 2.2, 6.5), loc=(5.8, -4.6, 3.25), color='white', bev=0.1),
          box('pylon_cap', (0.7, 2.4, 0.9), loc=(5.8, -4.6, 6.6), color='red', bev=0.08),
          cyl('pylon_logo', 0.7, 0.1, loc=(6.12, -4.6, 6.6), color='butter', seg=24, bev=0.02, rot=(0, math.pi / 2, 0))]
    for r in range(3):
        p.append(box(f'price_bg{r}', (0.1, 1.9, 0.6), loc=(6.12, -4.6, 5.1 - r * 0.8), color='ink', bev=0.03))
        for d in range(3):
            p.append(box(f'digit{r}{d}', (0.02, 0.35, 0.42), loc=(6.18, -5.2 + d * 0.5, 5.1 - r * 0.8), color='warn', bev=0.01, seg=1))
    # underground tank vents + fill caps + air/water post
    for k in range(3):
        p += [cyl(f'vent{k}', 0.06, 3.5, loc=(-7.2, -3.0 + k * 0.4, 0.12), color='steel', seg=8, bev=0),
              cyl(f'ventcap{k}', 0.12, 0.12, loc=(-7.2, -3.0 + k * 0.4, 3.6), color='ink', seg=8, bev=0.03),
              cyl(f'fillcap{k}', 0.35, 0.04, loc=(5.0, 1.5 + k * 1.0, 0.12), color=('red', 'hazard', 'toxic')[k], seg=16, bev=0.01)]
    p += [box('air_post', (0.4, 0.4, 1.4), loc=(5.4, 4.3, 0.82), color='sky', bev=0.06),
          box('air_dial', (0.03, 0.25, 0.25), loc=(5.61, 4.3, 1.2), color='white', bev=0.02)]
    p += rope('air_hose', (5.6, 4.4, 1.0), (5.9, 4.0, 0.3), sag=0.2, r=0.03, color='ink', segs=4)
    return tag(finish(join(p, 'gas_station'), mass=110), 'chain', effect='blast', lod=[0.35, 0.12])
