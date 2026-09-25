"""Fireworks stand (chain reaction: swallowing it launches a volley that pops props loose nearby).
A striped market tent over a trestle table stacked with rocket crates, cakes, sparkler bundles and a
rack of rockets with coloured tips, plus a 'BANG!' banner."""
from kit import *


def build():
    p = [box('table', (1.0, 2.4, 0.06), loc=(0, 0, 0.9), color='wood', bev=0.02),
         box('cloth', (1.05, 2.45, 0.5), loc=(0, 0, 0.66), color='red', bev=0.02)]
    for s in (-1, 1):
        for x in (-0.4, 0.4):
            p.append(tube(f'trestle{s}{x}', (x, s * 1.1, 0), (x * 0.6, s * 1.1, 0.88), r=0.03, color='wood', seg=6))
    for x in (-0.55, 0.55):  # tent poles + striped roof
        for y in (-1.3, 1.3):
            p.append(cyl(f'pole{x}{y}', 0.04, 2.3, loc=(x, y, 0), color='white', seg=8, bev=0.01))
    for k in range(8):
        y = -1.35 + (k + 0.5) * 2.7 / 8
        for s in (-1, 1):
            p.append(box(f'roof{k}{s}', (0.7, 2.7 / 8 + 0.01, 0.03), loc=(s * 0.3, y, 2.45), color='navy' if k % 2 else 'butter', bev=0.01, seg=1, rot=(0, s * 0.45, 0)))
        p.append(sphere(f'lip{k}', 0.1, loc=(0.65, y, 2.25), color='navy' if k % 2 else 'butter', seg=8, scale=(0.4, 1, 0.8)))
    p += [box('banner', (0.04, 1.8, 0.4), loc=(0.62, 0, 2.05), color='hazard', bev=0.02)]
    for k in range(5):  # 'BANG!' glyph blocks
        p.append(box(f'glyph{k}', (0.02, 0.22, 0.26), loc=(0.645, -0.65 + k * 0.32, 2.05), color='red', bev=0.01, seg=1))
    # merchandise
    for k, (y, c) in enumerate(((-0.8, 'red'), (-0.25, 'sky'), (0.3, 'hot_pink'))):  # firework 'cakes'
        p += [box(f'cake{k}', (0.35, 0.4, 0.3), loc=(0.2, y, 1.08), color=c, bev=0.03)]
        for i in range(3):
            for j in range(3):
                p.append(cyl(f'tube{k}{i}{j}', 0.04, 0.02, loc=(0.1 + i * 0.1, y - 0.1 + j * 0.1, 1.23), color='ink', seg=6, bev=0))
    p += [box('crate', (0.5, 0.6, 0.35), loc=(-0.2, 0.85, 1.1), color='wood', bev=0.03),
          box('crate_label', (0.51, 0.3, 0.12), loc=(-0.2, 0.85, 1.12), color='hazard', bev=0, seg=1)]
    for k in range(9):  # rack of rockets
        y = -0.9 + k * 0.22
        c = ('red', 'sky', 'butter', 'hot_pink', 'mint')[k % 5]
        p += [cyl(f'rocket{k}', 0.05, 0.55, loc=(-0.3, y, 0.95), color=c, seg=10, bev=0.01),
              cyl(f'cone{k}', 0.055, 0.14, loc=(-0.3, y, 1.5), color='white', seg=10, r2=0.005, bev=0),
              cyl(f'stick{k}', 0.01, 0.5, loc=(-0.3, y, 0.45), color='wood', seg=4, bev=0)]
    p.append(box('rack', (0.12, 2.1, 0.08), loc=(-0.3, 0, 1.25), color='wood', bev=0.02))
    for k in range(3):  # sparkler bundles
        for i in range(5):
            a = i * 1.2
            p.append(tube(f'spark{k}{i}', (0.35, 0.7 + k * 0.12, 0.93), (0.35 + math.cos(a) * 0.05, 0.7 + k * 0.12 + math.sin(a) * 0.05, 1.35), r=0.006, color='steel', seg=4))
    return tag(finish(join(p, 'fireworks_stand'), mass=0.6), 'chain', effect='fireworks')
