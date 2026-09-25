"""Region pack: a curtain-wall segment (20 m) of the hilltop castle. Coursed stone with a battered base, a
crenellated wall walk with a timber hoard, arrow slits, a buttress and a curtain of ivy. Castles are built
from segments meeting at castle_tower drums."""
from kit import *


def build():
    L, T, H = 20.0, 3.4, 10.0
    p = [box('wall', (L, T, H), loc=(0, 0, H / 2), color='concrete', bev=0.2),
         box('batter', (L + 0.4, T + 1.6, 2.2), loc=(0, 0, 1.1), color='concrete', bev=0.5, seg=2),
         box('walk', (L, T + 0.6, 0.3), loc=(0, 0, H + 0.15), color='sand', bev=0.08, seg=2),
         box('string', (L + 0.1, T + 0.2, 0.3), loc=(0, 0, 6.5), color='sand', bev=0.08, seg=2)]
    for k in range(int(L / 1.6)):  # crenellations on the outer (-y) face, a low parapet inside
        x = -L / 2 + 0.8 + k * 1.6
        p.append(box(f'mer{k}', (1.0, 0.8, 1.5), loc=(x, -T / 2 - 0.1, H + 1.05), color='concrete', bev=0.12, seg=2))
    p.append(box('parapet', (L, 0.5, 0.8), loc=(0, T / 2 + 0.1, H + 0.7), color='concrete', bev=0.1, seg=2))
    for k in range(5):  # stone courses
        p.append(box(f'course{k}', (L + 0.05, T + 0.05, 0.08), loc=(0, 0, 2.6 + k * 1.6), color='sand', bev=0.02, seg=1))
    for k in range(4):  # arrow slits
        x = -7.5 + k * 5
        for s in (-1, 1):
            p += [box(f'slit{k}{s}', (0.25, 0.1, 1.6), loc=(x, s * (T / 2 + 0.02), 5.0), color='ink', bev=0.02, seg=1),
                  box(f'cross{k}{s}', (0.8, 0.1, 0.22), loc=(x, s * (T / 2 + 0.02), 5.2), color='ink', bev=0.02, seg=1)]
    # timber hoard over the middle, shield banners on the outer face
    p += [box('hoard', (5.0, 1.6, 2.0), loc=(0, -T / 2 - 0.9, H + 1.0), color='wood', bev=0.08),
          prism('hoardroof', 2.4, 5.4, 1.1, loc=(0, -T / 2 - 0.8, H + 2.0), color='roof_tile', bev=0.06)]
    for k in range(5):
        p.append(box(f'strut{k}', (0.2, 1.4, 0.2), loc=(-2.2 + k * 1.1, -T / 2 - 0.6, H - 0.4), color='wood', bev=0.04, seg=1, rot=(0.7, 0, 0)))
    for k, (x, c) in enumerate(((-6.5, 'red'), (6.5, 'police'))):
        p += [box(f'ban{k}', (1.6, 0.08, 3.2), loc=(x, -T / 2 - 0.08, H - 1.8), color=c, bev=0.03),
              box(f'banstripe{k}', (0.4, 0.09, 3.0), loc=(x, -T / 2 - 0.09, H - 1.8), color='butter', bev=0.02, seg=1),
              box(f'banpole{k}', (2.0, 0.14, 0.14), loc=(x, -T / 2 - 0.12, H - 0.15), color='wood', bev=0.03, seg=1)]
    # ivy creeping up the inner face
    import random
    r = random.Random(3)
    for k in range(26):
        x, z = r.uniform(-9, -3) if k < 13 else r.uniform(3, 8), r.uniform(0.6, 7.5)
        p.append(blob(f'ivy{k}', r.uniform(0.35, 0.6), (x, T / 2 + 0.15, z), ('foliage', 'foliage_lt')[k % 2], seed=k, amp=0.3, scale=(1.3, 0.4, 1), seg=8))
    return finish(tag(join(p, 'castle_wall'), 'region'))
