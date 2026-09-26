"""Region pack: the castle gatehouse. Twin drum towers flank a vaulted arch with a raised portcullis, a
drawbridge on chains over a dry moat edge, a heraldic shield and crenellated tops with pennants."""
from kit import *


def build():
    W, D, H = 9.0, 8.0, 12.0
    s = 28
    p = [box('block', (D, W, H), loc=(0, 0, H / 2), color='concrete', bev=0.2),
         box('arch', (D + 0.4, 4.0, 5.2), loc=(0, 0, 2.6), color='ink', bev=0.1),
         cyl('archtop', 2.0, D + 0.4, loc=(-(D + 0.4) / 2, 0, 5.2), color='ink', seg=s, bev=0, rot=(0, math.pi / 2, 0)),
         box('string', (D + 0.2, W + 0.2, 0.35), loc=(0, 0, 8.4), color='sand', bev=0.08, seg=2)]
    for sgn in (-1, 1):  # flanking drums
        y = sgn * (W / 2 + 1.2)
        p += [cyl(f'drum{sgn}', 3.4, H + 2.0, loc=(D / 2 - 2.2, y, 0), color='concrete', seg=s, bev=0.2),
              cyl(f'drumbat{sgn}', 4.0, 2.2, loc=(D / 2 - 2.2, y, 0), color='concrete', seg=s, bev=0.4, r2=3.4),
              cyl(f'drumtop{sgn}', 3.8, 1.0, loc=(D / 2 - 2.2, y, H + 1.6), color='sand', seg=s, bev=0.12),
              cyl(f'mast{sgn}', 0.07, 4.0, loc=(D / 2 - 2.2, y, H + 2.6), color='ink', seg=8, bev=0),
              mesh(f'pen{sgn}', [(0, 0, 0), (0, 0, -1.0), (2.2, 0, -0.5)], [(0, 1, 2)], color=('red', 'police')[sgn > 0], loc=(D / 2 - 2.15, y, H + 6.5))]
        for k in range(10):
            a = k * math.tau / 10
            p.append(box(f'dm{sgn}{k}', (0.9, 0.9, 1.1), loc=(D / 2 - 2.2 + math.cos(a) * 3.4, y + math.sin(a) * 3.4, H + 2.6), color='concrete', bev=0.1, seg=2, rot=(0, 0, a)))
        for k in range(2):
            p.append(box(f'dloop{sgn}{k}', (0.1, 0.28, 1.6), loc=(D / 2 - 2.2 + 3.42, y, 4.5 + k * 4), color='ink', bev=0.02, seg=1))
    for k in range(6):  # merlons on the block front + back
        for sx in (-1, 1):
            p.append(box(f'mer{k}{sx}', (0.8, 1.0, 1.3), loc=(sx * (D / 2 - 0.4), -W / 2 + 0.75 + k * 1.5, H + 0.65), color='concrete', bev=0.1, seg=2))
    # portcullis (raised, teeth showing) + drawbridge
    for k in range(6):
        p.append(box(f'pv{k}', (0.16, 0.16, 2.4), loc=(D / 2 + 0.25, -1.5 + k * 0.6, 6.1), color='ink', bev=0.03, seg=1))
        p.append(cyl(f'tooth{k}', 0.1, 0.4, loc=(D / 2 + 0.25, -1.5 + k * 0.6, 4.6), color='steel', seg=8, bev=0, r2=0.01))
    for k in range(3):
        p.append(box(f'ph{k}', (0.16, 3.6, 0.16), loc=(D / 2 + 0.25, 0, 5.3 + k * 0.8), color='ink', bev=0.03, seg=1))
    p += [box('bridge', (6.0, 4.2, 0.4), loc=(D / 2 + 3.0, 0, 0.35), color='wood', bev=0.08),
          tube('chainL', (D / 2 + 0.3, -1.9, 6.5), (D / 2 + 5.8, -1.9, 0.6), r=0.07, color='steel', seg=6),
          tube('chainR', (D / 2 + 0.3, 1.9, 6.5), (D / 2 + 5.8, 1.9, 0.6), r=0.07, color='steel', seg=6)]
    for k in range(8):
        p.append(box(f'plank{k}', (0.08, 4.2, 0.05), loc=(D / 2 + 0.5 + k * 0.72, 0, 0.57), color='ink', bev=0, seg=1))
    # heraldic shield over the arch
    p += [box('shield', (0.2, 1.8, 2.0), loc=(D / 2 + 0.1, 0, 10.0), color='red', bev=0.3),
          box('chev', (0.22, 1.2, 0.3), loc=(D / 2 + 0.12, 0, 10.1), color='gold', bev=0.05)]
    return finish(tag(join(p, 'castle_gate'), 'region'))
