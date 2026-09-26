"""Region pack (capital): the parliament (tier ~33). A long neoclassical palace with a colonnaded front, two
wings with pediments, a drum and great ribbed dome with a lantern and flag, statues on the balustrade and
formal gardens with fountains."""
from kit import *


def build():
    L, W, H = 64.0, 22.0, 16.0
    p = [box('body', (W, L, H), loc=(0, 0, H / 2), color='white', bev=0.25),
         box('plinth', (W + 1.0, L + 1.0, 3.0), loc=(0, 0, 1.5), color='sand', bev=0.12, seg=2),
         box('corn', (W + 1.2, L + 1.2, 0.8), loc=(0, 0, H), color='sand', bev=0.15, seg=2),
         box('attic', (W - 1.0, L - 1.0, 2.4), loc=(0, 0, H + 1.6), color='white', bev=0.15, seg=2),
         box('roof', (W - 3.0, L - 3.0, 1.5), loc=(0, 0, H + 3.4), color='teal', bev=0.4, seg=2)]
    for s in (-1, 1):  # end pavilions with pediments
        y = s * (L / 2 - 6)
        p += [box(f'pav{s}', (W + 3.0, 12.0, H + 2.0), loc=(1.5, y, (H + 2) / 2), color='white', bev=0.25),
              prism(f'pedi{s}', 12.0, 3.0, 4.0, loc=(W / 2 + 3.0, y, H + 2.0), color='sand', bev=0.1, rot=(0, 0, 0)),
              box(f'pedf{s}', (0.3, 9.0, 1.6), loc=(W / 2 + 3.2, y, H + 3.0), color='gold', bev=0.1, seg=1)]
        for k in range(4):
            p.append(cyl(f'pc{s}{k}', 0.7, H - 3.0, loc=(W / 2 + 3.6, y - 4.5 + k * 3.0, 3.0), color='white', seg=10, bev=0.06))
    for k in range(14):  # central colonnade
        y = -19.5 + k * 3.0
        p += [cyl(f'col{k}', 0.75, H - 3.0, loc=(W / 2 + 1.6, y, 3.0), color='white', seg=10, bev=0.06),
              box(f'cap{k}', (1.8, 1.8, 0.5), loc=(W / 2 + 1.6, y, H - 0.2), color='sand', bev=0.08, seg=1)]
    p += [box('entab', (3.0, 43.0, 1.4), loc=(W / 2 + 1.6, 0, H + 0.5), color='sand', bev=0.12, seg=2),
          box('steps', (8.0, 26.0, 3.0), loc=(W / 2 + 5.0, 0, 1.5), color='sand', bev=0.1, seg=2)]
    for k in range(5):
        p.append(box(f'step{k}', (1.2, 26.0, 0.6), loc=(W / 2 + 9.2 + k * 1.0, 0, 2.7 - k * 0.6), color='sand', bev=0.05, seg=1))
    for k in range(18):  # balustrade statues
        y = -L / 2 + 3 + k * (L - 6) / 17
        p += [cyl(f'sp{k}', 0.5, 0.8, loc=(W / 2 + 0.3, y, H + 2.8), color='sand', seg=6, bev=0),
              cyl(f'st{k}', 0.35, 2.2, loc=(W / 2 + 0.3, y, H + 3.6), color='white', seg=6, bev=0),
              sphere(f'sh{k}', 0.35, loc=(W / 2 + 0.3, y, H + 6.0), color='white', seg=6)]
    for face, c0 in (('+x', W / 2 + 0.02), ('-x', -W / 2 - 0.02)):
        for sy in (-1, 1):
            p += window_grid(c0, sy * 15, 5.5, 1.4, 3.0, 5, 2, 1.6, 2.6, face, frame='sand')
    # drum + dome + lantern
    p += [cyl('drum', 13.0, 10.0, loc=(0, 0, H + 3.0), color='white', seg=32, bev=0.2),
          cyl('drumcorn', 13.8, 1.0, loc=(0, 0, H + 12.6), color='sand', seg=32, bev=0.15),
          sphere('dome', 13.0, loc=(0, 0, H + 13.4), color='teal', seg=32, scale=(1, 1, 1.05)),
          cyl('lantern', 3.0, 6.0, loc=(0, 0, H + 26.5), color='white', seg=16, bev=0.1),
          lathe('lroof', [(0, 0), (3.6, 0), (0.1, 4.0), (0, 4.0)], loc=(0, 0, H + 32.5), color='teal', seg=16),
          sphere('orb', 0.8, loc=(0, 0, H + 36.8), color='gold', seg=12),
          cyl('pole', 0.15, 8.0, loc=(0, 0, H + 37.4), color='ink', seg=8, bev=0),
          box('flag', (0.1, 5.0, 3.2), loc=(0, 2.55, H + 43.5), color='police', bev=0.05),
          box('flagx', (0.12, 5.0, 0.8), loc=(0, 2.55, H + 43.5), color='white', bev=0.02, seg=1)]
    for k in range(16):
        a = k * math.tau / 16
        c, s = math.cos(a), math.sin(a)
        p += [cyl(f'dc{k}', 0.6, 9.0, loc=(c * 13.6, s * 13.6, H + 3.4), color='white', seg=8, bev=0),
              box(f'dw{k}', (0.12, 1.4, 4.0), loc=(c * 13.02, s * 13.02, H + 8.0), color='glow', bev=0.02, seg=1, rot=(0, 0, a)),
              box(f'rib{k}', (0.5, 0.5, 13.0), loc=(c * 9.3, s * 9.3, H + 22.2), color='gold', bev=0.1, seg=1, rot=(math.sin(a) * 0.78, -math.cos(a) * 0.78, 0))]
    # formal garden + fountains in front
    for s in (-1, 1):
        p += [box(f'lawn{s}', (14.0, 18.0, 0.3), loc=(W / 2 + 16.0, s * 14.0, 0.15), color='foliage_lt', bev=0.05, seg=1),
              cyl(f'fount{s}', 3.0, 0.8, loc=(W / 2 + 16.0, s * 14.0, 0.3), color='sand', seg=24, bev=0.1),
              cyl(f'fwater{s}', 2.6, 0.1, loc=(W / 2 + 16.0, s * 14.0, 1.0), color='water', seg=24, bev=0),
              cyl(f'fjet{s}', 0.3, 2.2, loc=(W / 2 + 16.0, s * 14.0, 1.0), color='sky', seg=10, bev=0, r2=0.05)]
        for k in range(5):
            p.append(lathe(f'topi{s}{k}', [(0, 0), (0.8, 0), (0.05, 2.4), (0, 2.4)], loc=(W / 2 + 10.0 + k * 3.0, s * 5.6, 0.3), color='foliage', seg=8))
    return finish(tag(join(p, 'parliament'), 'region'))
