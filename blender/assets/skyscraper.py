"""Art-deco stepped tower: the biggest bite in the city."""
from kit import *


def build():
    tiers = [(17.0, 24.0), (13.0, 16.0), (9.0, 12.0), (5.5, 7.0)]
    p, z = [], 0.0
    for t, (S, H) in enumerate(tiers):
        p.append(box(f'tier{t}', (S, S, H), loc=(0, 0, z + H / 2), color='cream', bev=0.3))
        p.append(box(f'cap{t}', (S + 0.4, S + 0.4, 0.5), loc=(0, 0, z + H), color='butter', bev=0.15))
        n = max(2, int(S / 2.6))
        for k in range(4):
            a = k * math.pi / 2
            for i in range(n):
                off = (i - (n - 1) / 2) * (S - 2.0) / max(1, n - 1)
                x = math.cos(a) * (S / 2 + 0.02) - math.sin(a) * off
                y = math.sin(a) * (S / 2 + 0.02) + math.cos(a) * off
                p.append(box(f'strip{t}{k}{i}', (0.3 if k % 2 == 0 else 0.9, 0.9 if k % 2 == 0 else 0.3, H - 2.0),
                             loc=(x, y, z + H / 2 + 0.2), color='sky' if t < 3 else 'glow', bev=0.1, seg=2))
        z += H
    p += [box('door', (0.4, 4.0, 3.6), loc=(tiers[0][0] / 2 + 0.1, 0, 1.8), color='glow', bev=0.1),
          box('marquee', (1.8, 6.0, 0.4), loc=(tiers[0][0] / 2 + 0.8, 0, 4.0), color='navy', bev=0.1),
          lathe('spire', [(0.0, 0.0), (1.6, 0.0), (1.2, 2.0), (0.4, 7.0), (0.1, 11.0), (0.0, 11.5)], loc=(0, 0, z), color='butter', seg=16),
          sphere('orb', 0.5, loc=(0, 0, z + 11.6), color='siren_red', seg=16)]
    return finish(join(p, 'skyscraper'))
