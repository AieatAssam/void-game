"""Region pack: thatched village cottage. Whitewashed walls with black timber framing, a deep rounded thatch
with an eyebrow over the upstairs window, brick chimney, a rose-covered porch and a tiny front garden."""
from kit import *


def build():
    D, W, H = 4.2, 5.6, 2.9
    p = [box('walls', (D, W, H), loc=(0, 0, H / 2), color='white', bev=0.14),
         box('plinth', (D + 0.2, W + 0.2, 0.4), loc=(0, 0, 0.2), color='concrete', bev=0.1)]
    # thatch: three stacked, slightly stepped gables with fat rounded eaves (hand-laid layers), a ridge roll with
    # a scalloped block-cut edge, and a hooded dormer poking through
    for k, (grow, col) in enumerate(((0.0, 'clay'), (0.35, 'sand'), (0.7, 'sand'))):
        p.append(prism(f'thatch{k}', W + 1.5 - grow * 1.3, D + 1.2 - grow * 0.2, 3.1 - grow * 0.9, loc=(0, 0, H - 0.3 + grow * 0.55), color=col, bev=0.4))
    p.append(cyl('ridge', 0.32, D + 1.3, loc=(-(D + 1.3) / 2, 0, H + 2.62), color='clay', seg=16, bev=0.1, rot=(0, math.pi / 2, 0)))
    for k in range(7):
        x = -(D + 1.0) / 2 + k * (D + 1.0) / 6
        for s_ in (-1, 1):
            p.append(sphere(f'scal{k}{s_}', 0.26, loc=(x, s_ * 0.42, H + 2.45), color='clay', seg=10, scale=(1.0, 0.5, 0.7)))
    p += [box('dormer', (1.2, 1.3, 1.1), loc=(D / 2 - 0.1, 0, H + 0.55), color='white', bev=0.1),
          box('dwin', (0.1, 0.8, 0.6), loc=(D / 2 + 0.52, 0, H + 0.5), color='glow', bev=0.03),
          prism('dhood', 1.9, 1.7, 0.9, loc=(D / 2 - 0.1, 0, H + 1.05), color='sand', bev=0.3)]
    # timber frame on the gable ends and front
    for x in (-D / 2 - 0.03, D / 2 + 0.03):
        for y in (-W / 2 + 0.15, -0.9, 0.9, W / 2 - 0.15):
            p.append(box(f'post{x}{y}', (0.08, 0.18, H - 0.4), loc=(x, y, H / 2 + 0.2), color='ink', bev=0.03, seg=1))
        p.append(box(f'beam{x}', (0.08, W, 0.18), loc=(x, 0, H - 0.1), color='ink', bev=0.03, seg=1))
        p.append(box(f'mid{x}', (0.08, W, 0.14), loc=(x, 0, 1.45), color='ink', bev=0.03, seg=1))
    for s in (-1, 1):
        p.append(box(f'brace{s}', (0.08, 1.3, 0.14), loc=(D / 2 + 0.04, s * 1.75, 2.1), color='ink', bev=0.03, seg=1, rot=(s * 0.6, 0, 0)))
    p += [box('door', (0.12, 1.0, 1.9), loc=(D / 2 + 0.05, 0, 1.15), color='forest', bev=0.05),
          box('lintel', (0.2, 1.3, 0.18), loc=(D / 2 + 0.08, 0, 2.2), color='wood', bev=0.04),
          box('step', (0.6, 1.4, 0.2), loc=(D / 2 + 0.4, 0, 0.1), color='concrete', bev=0.05),
          prism('porch', 1.6, 1.0, 0.55, loc=(D / 2 + 0.45, 0, 2.3), color='roof_tile', bev=0.05),
          cyl('pl', 0.06, 2.3, loc=(D / 2 + 0.85, 0.7, 0), color='wood', seg=8, bev=0),
          cyl('pr', 0.06, 2.3, loc=(D / 2 + 0.85, -0.7, 0), color='wood', seg=8, bev=0),
          box('chimney', (0.8, 0.8, 2.6), loc=(-D / 2 + 0.6, W / 2 - 0.9, H + 1.6), color='brick_wall', bev=0.08),
          box('chimcap', (1.0, 1.0, 0.15), loc=(-D / 2 + 0.6, W / 2 - 0.9, H + 2.95), color='ink', bev=0.04),
          cyl('pot', 0.15, 0.4, loc=(-D / 2 + 0.6, W / 2 - 0.9, H + 3.0), color='terracotta', seg=12, bev=0.03)]
    p += window_grid(D / 2 + 0.02, 0, 1.3, 0.7, 0.8, 2, 1, 1.9, 0, '+x', frame='white')
    p += window_grid(-D / 2 - 0.02, 0, 1.3, 0.7, 0.8, 2, 1, 1.6, 0, '-x', frame='white')
    for s in (-1, 1):
        p += window_grid(0, s * (W / 2 + 0.02), 1.3, 0.7, 0.8, 1, 1, 0, 0, '+y' if s > 0 else '-y', frame='white')
    # climbing roses round the porch, and a picket-fenced front garden
    for k in range(9):
        a = k / 8
        p.append(sphere(f'rose{k}', 0.2, loc=(D / 2 + 0.1, 0.85 - a * 0.1, 0.4 + a * 1.9), color=('pink', 'forest', 'red')[k % 3], seg=8))
        p.append(sphere(f'rosb{k}', 0.2, loc=(D / 2 + 0.1, -0.85 + a * 0.1, 0.4 + a * 1.9), color=('forest', 'pink', 'foliage')[k % 3], seg=8))
    for k in range(11):
        y = -W / 2 + 0.2 + k * (W - 0.4) / 10
        if abs(y) < 0.6:
            continue
        p.append(box(f'pk{k}', (0.06, 0.12, 0.7), loc=(D / 2 + 1.7, y, 0.35), color='white', bev=0.02, seg=1))
    p.append(box('rail', (0.05, W - 0.3, 0.08), loc=(D / 2 + 1.7, 0, 0.55), color='white', bev=0.02, seg=1))
    for k, y in enumerate((-2.0, -1.3, 1.3, 2.0)):
        p.append(blob(f'bush{k}', 0.35, (D / 2 + 1.1, y, 0.3), ('foliage', 'foliage_lt')[k % 2], seed=k, amp=0.2, seg=10))
    return finish(tag(join(p, 'cottage'), 'region'))
