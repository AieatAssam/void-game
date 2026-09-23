from kit import *


def build():
    S, F, FH = 13.0, 9, 3.2
    H = F * FH
    p = [box('core', (S - 0.4, S - 0.4, H), loc=(0, 0, H / 2), color='sky', bev=0.2),
         box('lobby', (S + 0.4, S + 0.4, 4.0), loc=(0, 0, 2.0), color='white', bev=0.2),
         box('lobbyglass', (S + 0.5, 6.0, 3.0), loc=(0, 0, 1.6), color='glow', bev=0.1),
         box('crown', (S + 0.4, S + 0.4, 1.0), loc=(0, 0, H + 0.3), color='white', bev=0.2),
         cyl('pad', 4.6, 0.3, loc=(0, 0, H + 0.8), color='ink', seg=40, bev=0.08),
         torus('padring', 4.1, 0.12, loc=(0, 0, H + 1.12), color='hazard', seg=40, rseg=6),
         box('H1', (1.8, 0.4, 0.06), loc=(0, 0, H + 1.12), color='white', bev=0, seg=1),
         box('H2', (0.4, 2.8, 0.06), loc=(0.9, 0, H + 1.12), color='white', bev=0, seg=1),
         box('H3', (0.4, 2.8, 0.06), loc=(-0.9, 0, H + 1.12), color='white', bev=0, seg=1),
         cyl('mast', 0.12, 5.0, loc=(S / 2 - 1.2, S / 2 - 1.2, H + 0.8), color='steel', seg=8, bev=0),
         sphere('beacon', 0.3, loc=(S / 2 - 1.2, S / 2 - 1.2, H + 5.9), color='siren_red', seg=12)]
    for j in range(2, F + 1):
        p.append(box(f'floor{j}', (S + 0.1, S + 0.1, 0.35), loc=(0, 0, j * FH), color='white', bev=0.1, seg=2))
    for k in range(4):
        a = k * math.pi / 2
        for i in range(5):
            off = -S / 2 + 1.3 + i * (S - 2.6) / 4
            x, y = math.cos(a) * (S / 2 - 0.1) - math.sin(a) * off, math.sin(a) * (S / 2 - 0.1) + math.cos(a) * off
            p.append(box(f'fin{k}{i}', (0.35, 0.35, H - 4.0), loc=(x, y, 4.0 + (H - 4.0) / 2), color='white', bev=0.1, seg=2))
    return finish(join(p, 'office'))
