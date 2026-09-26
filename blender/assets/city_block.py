"""Region pack (capital): a whole Haussmann-style perimeter block (tier ~18). Six storeys of cream stone round a
courtyard with trees, a zinc mansard with dormers and chimney stacks, wrought balconies, shopfronts with striped
awnings, and a domed corner rotunda. A brick variant gives the capital's older quarter."""
from kit import *


def build(variant=0):
    S, T, H = 34.0, 9.0, 18.0  # block size, wing depth, cornice height
    wall = ('cream', 'brick_wall')[variant]
    roof = ('asphalt_lt', 'roof_tile')[variant]
    p = []
    for k in range(4):  # four wings round the courtyard
        a = k * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        cx, cy = c * (S - T) / 2, s * (S - T) / 2
        rot = (0, 0, a)
        p += [box(f'wing{k}', (T, S, H), loc=(cx, cy, H / 2), color=wall, bev=0.2, rot=rot),
              box(f'shop{k}', (T + 0.3, S + 0.3, 4.2), loc=(cx, cy, 2.1), color='sand', bev=0.1, seg=2, rot=rot),
              box(f'corn{k}', (T + 0.8, S + 0.6, 0.5), loc=(cx, cy, H), color='white', bev=0.1, seg=2, rot=rot),
              box(f'bal{k}', (T + 1.0, S + 0.2, 0.25), loc=(cx, cy, 9.0), color='ink', bev=0.04, seg=1, rot=rot),
              box(f'bal2{k}', (T + 1.0, S + 0.2, 0.25), loc=(cx, cy, 15.4), color='ink', bev=0.04, seg=1, rot=rot)]
        p.append(hip_roof(f'mans{k}', T + 0.2, S - 0.4, 4.5, loc=(cx, cy, H + 0.2), color=roof, bev=0.12) if k % 2 == 0 else
                 prism(f'mans{k}', T + 0.2, S - 2 * T, 4.5, loc=(cx, cy, H + 0.2), color=roof, bev=0.12, rot=(0, 0, a + math.pi / 2)))
        ox, oy = c * S / 2, s * S / 2
        for i in range(9):  # windows (4 storeys) + shopfronts + awnings along the street face
            u = -S / 2 + 2.6 + i * (S - 5.2) / 8
            x, y = ox - s * u, oy + c * u
            for j in range(4):
                p.append(box(f'w{k}{i}{j}', (0.14, 1.3, 2.0), loc=(x + c * 0.02, y + s * 0.02, 6.2 + j * 3.1), color='glow', bev=0.03, seg=1, rot=rot))
            p += [box(f'sf{k}{i}', (0.14, 2.6, 2.8), loc=(x + c * 0.18, y + s * 0.18, 1.8), color='glass', bev=0.03, seg=1, rot=rot),
                  box(f'aw{k}{i}', (1.6, 3.0, 0.14), loc=(x + c * 0.9, y + s * 0.9, 3.7), color=('red', 'forest', 'navy')[(i + k) % 3], bev=0.04, seg=1,
                      rot=rot),
                  box(f'dm{k}{i}', (1.5, 1.4, 1.6), loc=(x - c * 0.9, y - s * 0.9, H + 1.6), color=wall, bev=0.1, seg=1, rot=rot),
                  box(f'dmw{k}{i}', (0.12, 0.9, 1.1), loc=(x - c * 0.1, y - s * 0.1, H + 1.6), color='glow', bev=0.02, seg=1, rot=rot)]
        for i in range(3):  # chimney stacks on the ridge
            u = -S / 2 + 7 + i * 10
            p.append(box(f'ch{k}{i}', (1.0, 2.4, 2.2), loc=(cx - s * u, cy + c * u, H + 5.0), color=wall, bev=0.08, seg=1, rot=rot))
    # corner rotunda with a dome
    R = 5.0
    ccx = ccy = S / 2 - 3.2
    p += [cyl('rot', R, H + 1.0, loc=(ccx, ccy, 0), color=wall, seg=24, bev=0.15),
          cyl('rotcorn', R + 0.4, 0.6, loc=(ccx, ccy, H + 0.8), color='white', seg=24, bev=0.1),
          sphere('dome', R, loc=(ccx, ccy, H + 1.4), color='teal', seg=24, scale=(1, 1, 0.9)),
          cyl('lanternR', 0.9, 2.0, loc=(ccx, ccy, H + 5.8), color='white', seg=12, bev=0.08),
          sphere('lanternTop', 0.9, loc=(ccx, ccy, H + 7.8), color='gold', seg=12, scale=(1, 1, 0.8))]
    # courtyard: paving, trees
    p.append(box('court', (S - 2 * T, S - 2 * T, 0.3), loc=(0, 0, 0.15), color='concrete', bev=0.05, seg=1))
    for k, (x, y) in enumerate(((-4, -4), (4, 4), (-4, 4), (4, -4))):
        p += [cyl(f'trunk{k}', 0.25, 3.0, loc=(x, y, 0.3), color='wood', seg=8, bev=0),
              blob(f'crown{k}', 2.0, (x, y, 4.6), ('foliage', 'foliage_lt')[k % 2], seed=k, amp=0.2, seg=12)]
    root = join(p, ('city_block', 'city_block_b')[variant])
    return finish(tag(root, 'region'))
