"""Region pack: a stone village church. Nave with a steep slate roof and buttresses, a square west tower with
battlements and a tall shingled spire, a lychgate, a round rose window and a little graveyard."""
from kit import *


def build():
    L, W, H = 14.0, 6.4, 6.0
    x0 = 1.5  # nave centre (tower sits at -x)
    p = [box('nave', (L, W, H), loc=(x0, 0, H / 2), color='concrete', bev=0.18),
         box('plinth', (L + 0.3, W + 0.3, 0.6), loc=(x0, 0, 0.3), color='asphalt_lt', bev=0.1),
         prism('roof', W + 1.0, L + 0.4, 4.6, loc=(x0, 0, H - 0.05), color='asphalt_lt', bev=0.1),
         box('chancel', (3.5, 4.6, 4.8), loc=(x0 + L / 2 + 1.6, 0, 2.4), color='concrete', bev=0.15),
         prism('chroof', 5.4, 3.8, 3.2, loc=(x0 + L / 2 + 1.6, 0, 4.75), color='asphalt_lt', bev=0.08)]
    for k in range(6):  # buttresses + lancet windows between them
        x = x0 - L / 2 + 1.2 + k * (L - 2.4) / 5
        for s in (-1, 1):
            p.append(box(f'but{k}{s}', (0.7, 0.8, 4.2), loc=(x, s * (W / 2 + 0.35), 2.1), color='concrete', bev=0.12, seg=2))
            p.append(prism(f'butcap{k}{s}', 0.8, 0.7, 0.6, loc=(x, s * (W / 2 + 0.35), 4.2), color='concrete', bev=0.05, rot=(0, 0, 0)))
            if k < 5:
                xm = x + (L - 2.4) / 10
                p += [box(f'lan{k}{s}', (0.8, 0.1, 2.4), loc=(xm, s * (W / 2 + 0.03), 3.0), color='glow', bev=0.04),
                      cyl(f'lanarch{k}{s}', 0.4, 0.1, loc=(xm, s * (W / 2 + 0.03), 4.2), color='glow', seg=16, rot=(math.pi / 2, 0, 0), bev=0)]
    # square west tower, battlements, spire
    T, TH = 4.6, 13.0
    tx = x0 - L / 2 - T / 2 + 0.2
    p += [box('tower', (T, T, TH), loc=(tx, 0, TH / 2), color='concrete', bev=0.18),
          box('string', (T + 0.3, T + 0.3, 0.3), loc=(tx, 0, 8.5), color='sand', bev=0.06),
          box('tdoor', (0.15, 1.6, 2.8), loc=(tx - T / 2 - 0.03, 0, 1.4), color='wood', bev=0.06),
          cyl('tdoorarch', 0.8, 0.15, loc=(tx - T / 2 - 0.03, 0, 2.8), color='wood', seg=20, rot=(0, math.pi / 2, 0), bev=0)]
    for k in range(4):
        a = k * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        for j in (-1, 0, 1):
            off = j * 1.5
            p.append(box(f'crenel{k}{j}', (0.9, 0.9, 0.9), loc=(tx + c * (T / 2 - 0.3) - s * off, s * (T / 2 - 0.3) + c * off, TH + 0.45), color='concrete', bev=0.1, seg=2))
        p += [box(f'louvre{k}', (0.12, 1.1, 1.8), loc=(tx + c * (T / 2 + 0.03), s * (T / 2 + 0.03), 10.6), color='ink', bev=0.03, rot=(0, 0, a)),
              cyl(f'clock{k}', 0.9, 0.12, loc=(tx + c * (T / 2 + 0.06), s * (T / 2 + 0.06), 7.0), color='white', seg=28, rot=(0, math.pi / 2, a), bev=0.03),
              box(f'hand{k}', (0.06, 0.1, 0.7), loc=(tx + c * (T / 2 + 0.14), s * (T / 2 + 0.14), 7.2), color='gold', bev=0.02, rot=(0, 0, a))]
    p += [lathe('spire', [(0, 0), (1.9, 0), (0.06, 11.0), (0, 11.0)], loc=(tx, 0, TH), color='asphalt', seg=8, rot=(0, 0, math.pi / 8)),
          sphere('ball', 0.3, loc=(tx, 0, TH + 11.1), color='gold', seg=12),
          box('cross_v', (0.12, 0.12, 1.4), loc=(tx, 0, TH + 12.0), color='gold', bev=0.03),
          box('cross_h', (0.12, 0.8, 0.12), loc=(tx, 0, TH + 12.3), color='gold', bev=0.03)]
    # east rose window
    ex = x0 + L / 2 + 3.4
    p += [cyl('rose', 1.2, 0.14, loc=(ex, 0, 3.2), color='glow', seg=32, rot=(0, math.pi / 2, 0), bev=0.03),
          torus('rosering', 1.2, 0.1, loc=(ex + 0.08, 0, 3.2), color='concrete', seg=32, rseg=8, rot=(0, math.pi / 2, 0))]
    for k in range(8):
        a = k * math.pi / 4
        p.append(box(f'spoke{k}', (0.05, 0.08, 2.2), loc=(ex + 0.09, 0, 3.2), color='concrete', bev=0, seg=1, rot=(a, 0, 0)))
    # porch on the south side + graveyard
    p += [box('porch', (2.6, 2.2, 3.0), loc=(x0 - 3.0, -W / 2 - 1.1, 1.5), color='concrete', bev=0.1),
          prism('porchroof', 3.0, 2.6, 1.4, loc=(x0 - 3.0, -W / 2 - 1.1, 3.0), color='asphalt_lt', bev=0.05, rot=(0, 0, math.pi / 2)),
          box('pdoor', (1.0, 0.1, 2.0), loc=(x0 - 3.0, -W / 2 - 2.22, 1.1), color='wood', bev=0.04)]
    import random
    r = random.Random(7)
    for k in range(14):
        x, y = x0 - 6 + (k % 7) * 2.0 + r.uniform(-0.2, 0.2), (W / 2 + 2.2 + (k // 7) * 1.6) * (1 if k % 2 else 1)
        if r.random() < 0.3:
            p += [box(f'gx{k}', (0.12, 0.12, 1.0), loc=(x, y, 0.5), color='white', bev=0.03), box(f'gy{k}', (0.12, 0.6, 0.12), loc=(x, y, 0.75), color='white', bev=0.03)]
        else:
            p.append(box(f'grave{k}', (0.2, 0.6, 0.8), loc=(x, y, 0.4), color=('concrete', 'asphalt_lt')[k % 2], bev=0.08, seg=1, rot=(r.uniform(-0.1, 0.1), 0, 0)))
    for k in range(3):
        p.append(blob(f'yew{k}', 1.1, (x0 - 6 + k * 6, W / 2 + 5.4, 1.4), 'foliage', seed=k, amp=0.2, scale=(1, 1, 1.4), seg=12))
    return finish(tag(join(p, 'village_church'), 'region'))
