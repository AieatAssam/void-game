"""Region pack: the great keep. A tall square donjon with corner turrets, pilaster buttresses, a forebuilding
stair, round-arched windows, a lead roof inside the battlements and the lord's banner on top."""
from kit import *


def build():
    S, H = 22.0, 24.0
    p = [box('keep', (S, S, H), loc=(0, 0, H / 2), color='concrete', bev=0.3),
         box('plinth', (S + 2.0, S + 2.0, 3.0), loc=(0, 0, 1.5), color='concrete', bev=0.6, seg=2),
         box('roof', (S - 2.0, S - 2.0, 1.2), loc=(0, 0, H + 0.2), color='asphalt_lt', bev=0.2, seg=2),
         prism('roofridge', S - 4, S - 4, 3.0, loc=(0, 0, H + 0.8), color='asphalt_lt', bev=0.15)]
    for k in range(4):
        p.append(box(f'course{k}', (S + 0.08, S + 0.08, 0.35), loc=(0, 0, 5.5 + k * 5), color='sand', bev=0.06, seg=1))
    for sx in (-1, 1):  # corner turrets
        for sy in (-1, 1):
            x, y = sx * (S / 2 - 0.5), sy * (S / 2 - 0.5)
            p += [box(f'tur{sx}{sy}', (4.2, 4.2, H + 5.0), loc=(x, y, (H + 5.0) / 2), color='concrete', bev=0.25),
                  lathe(f'turcap{sx}{sy}', [(0, 0), (3.2, 0), (0.1, 5.0), (0, 5.0)], loc=(x, y, H + 5.0), color='asphalt_lt', seg=4, rot=(0, 0, math.pi / 4)),
                  sphere(f'turball{sx}{sy}', 0.3, loc=(x, y, H + 10.1), color='gold', seg=10)]
    for side in range(4):  # battlements, pilasters and windows per face
        a = side * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        for k in range(9):
            off = -8.0 + k * 2.0
            p.append(box(f'mer{side}{k}', (1.1, 1.0, 1.5), loc=(c * (S / 2 - 0.3) - s * off, s * (S / 2 - 0.3) + c * off, H + 0.75), color='concrete', bev=0.12, seg=2, rot=(0, 0, a)))
        for k in (-1, 1):
            off = k * 3.8
            p.append(box(f'pil{side}{k}', (0.8, 1.6, H - 2), loc=(c * (S / 2 + 0.3) - s * off, s * (S / 2 + 0.3) + c * off, H / 2 + 1), color='concrete', bev=0.15, seg=2, rot=(0, 0, a)))
        for row, z in enumerate((9.0, 15.5, 20.5)):
            for k in (-1, 0, 1):
                off = k * 7.2
                w = 1.1 if row else 0.5
                cx, cy = c * (S / 2 + 0.03) - s * off, s * (S / 2 + 0.03) + c * off
                p += [box(f'win{side}{row}{k}', (0.12, w, 2.0), loc=(cx, cy, z), color='glow' if row else 'ink', bev=0.03, seg=1, rot=(0, 0, a)),
                      cyl(f'wa{side}{row}{k}', w / 2, 0.12, loc=(cx, cy, z + 1.0), color='glow' if row else 'ink', seg=12, rot=(math.pi / 2, 0, a + math.pi / 2), bev=0)]
    # forebuilding stair up the +x face
    p += [box('fore', (4.5, 8.0, 9.0), loc=(S / 2 + 2.2, -4.0, 4.5), color='concrete', bev=0.2),
          box('foredoor', (0.15, 1.8, 3.0), loc=(S / 2 + 4.5, -4.0, 1.5), color='wood', bev=0.06)]
    for k in range(8):
        p.append(box(f'mf{k}', (0.9, 0.9, 1.1), loc=(S / 2 + 4.1, -7.5 + k, 9.55), color='concrete', bev=0.1, seg=2))
    # the lord's banner
    p += [cyl('mast', 0.12, 9.0, loc=(0, 0, H + 3.5), color='ink', seg=10, bev=0),
          box('flag', (0.08, 4.0, 2.6), loc=(0, 2.05, H + 11.0), color='red', bev=0.05),
          box('flagbar', (0.09, 4.0, 0.7), loc=(0, 2.05, H + 11.0), color='gold', bev=0.02, seg=1)]
    return finish(tag(join(p, 'castle_keep'), 'region'))
