"""Fairground ticket booth: candy-striped kiosk with an onion dome, glazed window and counter, ticket roll,
bulb-framed sign board and a pennant."""
from kit import *


def build():
    W, D, H = 1.5, 1.3, 2.0
    p = [box('body', (D, W, H), loc=(0, 0, H / 2 + 0.12), color='white', bev=0.06),
         box('plinth', (D + 0.12, W + 0.12, 0.14), loc=(0, 0, 0.07), color='butter', bev=0.03),
         box('cornice', (D + 0.16, W + 0.16, 0.12), loc=(0, 0, H + 0.18), color='butter', bev=0.03)]
    for k in range(5):  # candy stripes all round
        for s in (-1, 1):
            p.append(box(f'strY{k}{s}', (D * 0.12, 0.02, H - 0.1), loc=(-D / 2 + 0.15 + k * D * 0.22, s * (W / 2 + 0.005), H / 2 + 0.12), color='red', bev=0.005, seg=1))
    for k in range(3):
        p.append(box(f'strX{k}', (0.02, W * 0.12, H - 0.1), loc=(-D / 2 - 0.005, -W / 2 + 0.3 + k * W * 0.3, H / 2 + 0.12), color='red', bev=0.005, seg=1))
    p += [box('window', (0.03, 0.9, 0.7), loc=(D / 2 + 0.005, 0, 1.45), color='glass', bev=0.02),
          box('wframe', (0.04, 1.0, 0.8), loc=(D / 2, 0, 1.45), color='butter', bev=0.02),
          box('counter', (0.35, 1.1, 0.06), loc=(D / 2 + 0.15, 0, 1.05), color='wood', bev=0.02),
          box('slot', (0.04, 0.3, 0.06), loc=(D / 2 + 0.02, 0, 1.12), color='ink', bev=0.01),
          cyl('ticket_roll', 0.08, 0.15, loc=(D / 2 + 0.2, -0.35, 1.08), color='red', seg=14, bev=0.02),
          box('ticket_tongue', (0.18, 0.1, 0.004), loc=(D / 2 + 0.3, -0.35, 1.12), color='butter', bev=0, seg=1),
          box('sign', (0.05, 1.3, 0.4), loc=(D / 2 + 0.03, 0, 2.05), color='butter', bev=0.03)]
    for k in range(14):  # bulbs around the sign
        t = k / 13
        p.append(sphere(f'sb{k}', 0.035, loc=(D / 2 + 0.07, -0.62 + t * 1.24, 2.23), color='glow', seg=6))
        p.append(sphere(f'sbb{k}', 0.035, loc=(D / 2 + 0.07, -0.62 + t * 1.24, 1.87), color='glow', seg=6))
    for k in range(4):  # 'ticket' glyph blocks
        p.append(box(f'glyph{k}', (0.02, 0.18, 0.2), loc=(D / 2 + 0.06, -0.39 + k * 0.26, 2.05), color='red', bev=0.01, seg=1))
    p += [lathe('dome', [(0, H + 0.24), (0.72, H + 0.24), (0.78, H + 0.45), (0.6, H + 0.8), (0.2, H + 1.1), (0.05, H + 1.25), (0, H + 1.26)], color='red', seg=32),
          torus('dome_ring', 0.73, 0.04, loc=(0, 0, H + 0.26), color='gold', seg=32, rseg=5),
          cyl('spire', 0.025, 0.5, loc=(0, 0, H + 1.22), color='gold', seg=8, bev=0),
          sphere('spire_ball', 0.06, loc=(0, 0, H + 1.3), color='gold', seg=10),
          box('flag', (0.35, 0.015, 0.22), loc=(0.19, 0, H + 1.58), color='butter', bev=0.005)]
    for k in range(8):  # dome ribs
        a = k * math.pi / 4
        p.append(tube(f'rib{k}', (math.cos(a) * 0.76, math.sin(a) * 0.76, H + 0.42), (math.cos(a) * 0.1, math.sin(a) * 0.1, H + 1.15), r=0.02, color='gold', seg=5))
    return tag(finish(join(p, 'ticket_booth'), mass=0.7), 'fair')
