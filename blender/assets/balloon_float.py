"""Giant inflatable teddy balloon (parade event), tethered by four ropes to sandbag handler carts.
Aloft - only a big hole can pull it down (extras.flying)."""
from kit import *


def build():
    p = []
    Z = 6.2  # balloon body centre
    body = 'butter'
    p += [blob('belly', 1.5, (0, 0, Z), body, seed=1, amp=0.05, scale=(1.0, 1.1, 1.2)),
          blob('tummy', 0.95, (0.85, 0, Z - 0.15), 'white', seed=2, amp=0.04, scale=(0.5, 1.0, 1.1)),
          blob('head', 1.15, (0.2, 0, Z + 2.1), body, seed=3, amp=0.05),
          blob('snout', 0.5, (1.2, 0, Z + 1.85), 'white', seed=4, amp=0.05, scale=(0.9, 1.1, 0.8)),
          sphere('nose', 0.2, loc=(1.66, 0, Z + 1.95), color='gloss_black', seg=16, scale=(0.8, 1.2, 0.8)),
          box('mouth', (0.04, 0.3, 0.05), loc=(1.62, 0, Z + 1.66), color='ink', bev=0.02)]
    for s in (-1, 1):
        p += [blob(f'ear{s}', 0.45, (0.0, s * 0.95, Z + 3.0), body, seed=5 + s, amp=0.05, scale=(0.6, 1, 1)),
              sphere(f'earin{s}', 0.26, loc=(0.18, s * 0.95, Z + 2.98), color='pink', seg=14, scale=(0.4, 1, 1)),
              sphere(f'eye{s}', 0.16, loc=(1.12, s * 0.42, Z + 2.35), color='gloss_black', seg=14, scale=(0.6, 1, 1.2)),
              sphere(f'eyeglint{s}', 0.05, loc=(1.22, s * 0.38, Z + 2.43), color='glow_white', seg=8),
              sphere(f'cheek{s}', 0.2, loc=(1.05, s * 0.7, Z + 1.85), color='pink', seg=12, scale=(0.4, 1, 0.7)),
              blob(f'arm{s}', 0.5, (0.6, s * 1.45, Z + 0.5), body, seed=7 + s, amp=0.05, scale=(0.8, 0.9, 1.5)),
              blob(f'leg{s}', 0.6, (0.5, s * 0.8, Z - 1.55), body, seed=9 + s, amp=0.05, scale=(1.3, 1, 0.9)),
              sphere(f'pad{s}', 0.35, loc=(1.05, s * 0.8, Z - 1.6), color='pink', seg=14, scale=(0.3, 1, 1))]
    # bow tie + seams (inflatables show their panel seams)
    p += [sphere('bowknot', 0.2, loc=(1.02, 0, Z + 1.25), color='red', seg=14),
          *[sphere(f'bow{s}', 0.3, loc=(0.98, s * 0.38, Z + 1.25), color='red', seg=14, scale=(0.5, 1.2, 0.8)) for s in (-1, 1)],
          torus('seam_neck', 1.0, 0.03, loc=(0.35, 0, Z + 1.3), color='white', seg=40, rseg=5, rot=(0, 0.25, 0)),
          torus('seam_belly', 1.52, 0.03, loc=(0, 0, Z), color='hazard', seg=48, rseg=5, rot=(0, math.pi / 2, 0))]
    # tethers: four ropes down to wheeled sandbag carts
    for i, (x, y) in enumerate(((-2.4, -2.4), (2.4, -2.4), (2.4, 2.4), (-2.4, 2.4))):
        p += [box(f'cart{i}', (0.8, 0.6, 0.3), loc=(x, y, 0.35), color='red', bev=0.06),
              blob(f'sandbag{i}', 0.3, (x, y, 0.62), 'sand', seed=20 + i, amp=0.12, scale=(1.2, 0.9, 0.55)),
              cyl(f'cleat{i}', 0.05, 0.3, loc=(x, y, 0.7), color='steel', seg=8, bev=0.01)]
        for s in (-1, 1):
            p += wheel(f'cw{i}{s}', 0.12, 0.08, x, y + s * 0.3)
        ax = 0.9 * math.copysign(1, x)
        ay = 0.9 * math.copysign(1, y)
        p += rope(f'teth{i}', (x, y, 1.0), (ax, ay, Z - 1.0), sag=0.35, r=0.025, color='white', segs=8)
    root = finish(join(p, 'balloon_float'), tier=2.9, mass=6, below=False)
    return tag(root, 'events', event='parade', flying=True, mover='parade', lod=[0.3, 0.1])
