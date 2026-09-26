"""Region pack: the Gothic cathedral (tier ~20). A long nave with flying buttresses and pinnacles, transepts,
a great rose window on the west front between two tall pinnacled towers, and a crossing spire."""
from kit import *


def build():
    L, W, H = 44.0, 12.0, 20.0
    p = [box('nave', (L, W, H), loc=(0, 0, H / 2), color='sand', bev=0.2),
         box('plinth', (L + 0.6, W + 0.6, 1.2), loc=(0, 0, 0.6), color='concrete', bev=0.1, seg=2),
         prism('roof', W + 0.8, L, 9.0, loc=(0, 0, H), color='teal', bev=0.12),
         box('aisleL', (L - 6, 5.0, 11.0), loc=(1.0, W / 2 + 2.5, 5.5), color='sand', bev=0.15),
         box('aisleR', (L - 6, 5.0, 11.0), loc=(1.0, -W / 2 - 2.5, 5.5), color='sand', bev=0.15),
         box('aisleRoofL', (L - 6, 5.6, 0.4), loc=(1.0, W / 2 + 2.6, 11.4), color='teal', bev=0.08, rot=(-0.35, 0, 0)),
         box('aisleRoofR', (L - 6, 5.6, 0.4), loc=(1.0, -W / 2 - 2.6, 11.4), color='teal', bev=0.08, rot=(0.35, 0, 0)),
         box('transept', (12.0, W + 24.0, H - 1.0), loc=(6.0, 0, (H - 1) / 2), color='sand', bev=0.2),
         prism('troof', 12.8, W + 24.0, 8.4, loc=(6.0, 0, H - 1.0), color='teal', bev=0.12, rot=(0, 0, math.pi / 2)),
         cyl('apse', W / 2, H - 2, loc=(L / 2, 0, 0), color='sand', seg=16, bev=0.15),
         lathe('apseroof', [(0, 0), (W / 2 + 0.4, 0), (0.1, 7.0), (0, 7.0)], loc=(L / 2, 0, H - 2), color='teal', seg=16)]
    # flying buttresses + pinnacles along both sides
    for k in range(7):
        x = -L / 2 + 5 + k * 5.2
        if abs(x - 6.0) < 7:
            continue
        for s in (-1, 1):
            p += [box(f'pier{k}{s}', (1.2, 1.4, 14.0), loc=(x, s * (W / 2 + 6.2), 7.0), color='sand', bev=0.12, seg=2),
                  lathe(f'pin{k}{s}', [(0, 0), (0.7, 0), (0.05, 3.2), (0, 3.2)], loc=(x, s * (W / 2 + 6.2), 14.0), color='sand', seg=4),
                  tube(f'fly{k}{s}', (x, s * (W / 2 + 5.8), 13.0), (x, s * (W / 2 + 0.2), H - 2.0), r=0.35, color='sand', seg=8),
                  box(f'lan{k}{s}', (2.0, 0.12, 5.5), loc=(x + 2.6, s * (W / 2 + 0.03), 15.0), color='glow', bev=0.03, seg=1),
                  cyl(f'lanA{k}{s}', 1.0, 0.12, loc=(x + 2.6, s * (W / 2 + 0.03), 17.7), color='glow', seg=12, rot=(math.pi / 2, 0, 0), bev=0),
                  box(f'alan{k}{s}', (1.4, 0.12, 4.0), loc=(x + 2.6, s * (W / 2 + 5.03), 5.5), color='glow', bev=0.03, seg=1)]
    # west front: twin towers, rose window, portals
    wx = -L / 2 - 3.0
    for s in (-1, 1):
        y = s * (W / 2 + 1.5)
        p += [box(f'wt{s}', (8.0, 8.0, 38.0), loc=(wx + 1.0, y, 19.0), color='sand', bev=0.2),
              box(f'wtbelt{s}', (8.6, 8.6, 0.6), loc=(wx + 1.0, y, 26.0), color='concrete', bev=0.1, seg=2),
              box(f'wtbel{s}', (0.15, 1.6, 6.0), loc=(wx - 3.05, y, 31.0), color='ink', bev=0.03, seg=1)]
        for sx in (-1, 1):
            for sy in (-1, 1):
                p.append(lathe(f'wtp{s}{sx}{sy}', [(0, 0), (0.8, 0), (0.05, 5.0), (0, 5.0)], loc=(wx + 1.0 + sx * 3.4, y + sy * 3.4, 38.0), color='sand', seg=4))
        p.append(lathe(f'wtspire{s}', [(0, 0), (3.2, 0), (0.1, 12.0), (0, 12.0)], loc=(wx + 1.0, y, 38.0), color='concrete', seg=8, rot=(0, 0, math.pi / 8)))
    p += [box('westwall', (1.0, W + 1, 26.0), loc=(wx - 2.5, 0, 13.0), color='sand', bev=0.15),
          prism('westgable', W + 1, 1.0, 6.0, loc=(wx - 2.5, 0, 26.0), color='sand', bev=0.08),
          cyl('rose', 4.0, 0.3, loc=(wx - 3.0, 0, 17.0), color='police', seg=40, rot=(0, math.pi / 2, 0), bev=0.05),
          torus('roser', 4.0, 0.35, loc=(wx - 3.1, 0, 17.0), color='sand', seg=40, rseg=8, rot=(0, math.pi / 2, 0)),
          cyl('rosehub', 0.8, 0.4, loc=(wx - 3.15, 0, 17.0), color='sand', seg=16, rot=(0, math.pi / 2, 0), bev=0.05)]
    for k in range(12):
        p.append(box(f'rsp{k}', (0.2, 0.25, 7.6), loc=(wx - 3.15, 0, 17.0), color='sand', bev=0.03, seg=1, rot=(k * math.pi / 12, 0, 0)))
    for k, y in enumerate((-6.5, 0.0, 6.5)):
        big = 1.4 if k == 1 else 1.0
        p += [box(f'portal{k}', (0.3, 2.6 * big, 6.0 * big), loc=(wx - 3.05, y, 3.0 * big + 1.2), color='wood', bev=0.06, seg=1),
              prism(f'gab{k}', 3.6 * big, 0.6, 2.4 * big, loc=(wx - 3.1, y, 6.0 * big + 1.2), color='sand', bev=0.05)]
    # crossing spire
    p += [box('lanternC', (7.0, 7.0, 6.0), loc=(6.0, 0, H + 7.0), color='sand', bev=0.15),
          lathe('cspire', [(0, 0), (4.4, 0), (0.1, 22.0), (0, 22.0)], loc=(6.0, 0, H + 10.0), color='teal', seg=8, rot=(0, 0, math.pi / 8)),
          box('crossV', (0.3, 0.3, 3.0), loc=(6.0, 0, H + 33.4), color='gold', bev=0.05),
          box('crossH', (0.3, 1.8, 0.3), loc=(6.0, 0, H + 34.0), color='gold', bev=0.05)]
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        p.append(lathe(f'cpin{k}', [(0, 0), (0.7, 0), (0.05, 4.0), (0, 4.0)], loc=(6.0 + math.cos(a) * 4.6, math.sin(a) * 4.6, H + 10.0), color='sand', seg=4))
    # transept rose windows
    for s in (-1, 1):
        p.append(cyl(f'trose{s}', 3.0, 0.3, loc=(6.0, s * (W / 2 + 12.05), 13.0), color='police', seg=32, rot=(math.pi / 2, 0, 0), bev=0.05))
        p.append(torus(f'troser{s}', 3.0, 0.3, loc=(6.0, s * (W / 2 + 12.15), 13.0), color='sand', seg=32, rseg=6, rot=(math.pi / 2, 0, 0)))
    ob = join(p, 'cathedral')
    ob.data.transform(Matrix.Scale(0.72, 4))  # authored at full size; the ladder wants it at tier ~20
    return finish(tag(ob, 'region'))
