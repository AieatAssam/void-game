"""Scarecrow (farm fair): sack-cloth head with a stitched grin and button eyes, floppy straw hat, patched
plaid shirt stretched on a crossbar with straw bursting from the cuffs, rope belt, and a cheeky crow."""
from kit import *


def build():
    p = [cyl('pole', 0.05, 2.3, loc=(0, 0, 0), color='wood', seg=8, bev=0.01),
         tube('crossbar', (0, -0.85, 1.55), (0, 0.85, 1.55), r=0.04, color='wood', seg=8),
         lathe('shirt', [(0.0, 0.85), (0.24, 0.85), (0.3, 1.1), (0.28, 1.45), (0.2, 1.62), (0.0, 1.64)], color='red', seg=20),
         torus('belt', 0.27, 0.03, loc=(0, 0, 0.98), color='sand', seg=20, rseg=5),
         box('patch1', (0.02, 0.14, 0.14), loc=(0.28, 0.08, 1.25), color='sky', bev=0.01, rot=(0, 0, 0.2)),
         box('patch2', (0.12, 0.02, 0.12), loc=(-0.05, -0.27, 1.15), color='butter', bev=0.01)]
    for k in range(4):  # plaid lines
        p.append(torus(f'plaid{k}', 0.285 - (k % 2) * 0.01, 0.008, loc=(0, 0, 1.05 + k * 0.13), color='ink', seg=20, rseg=3))
    for s in (-1, 1):
        p += [tube(f'sleeve{s}', (0, s * 0.18, 1.55), (0, s * 0.72, 1.55), r=0.11, color='red', seg=10),
              blob(f'cuff_straw{s}', 0.1, (0, s * 0.85, 1.55), 'hazard', seed=s + 3, amp=0.5, scale=(0.8, 1.2, 0.8), seg=10),
              tube(f'leg{s}', (0, s * 0.1, 0.9), (0.05, s * 0.14, 0.35), r=0.1, color='police', seg=10),
              blob(f'leg_straw{s}', 0.08, (0.05, s * 0.14, 0.3), 'hazard', seed=s + 7, amp=0.5, scale=(1, 1, 0.8), seg=8)]
        for k in range(4):
            p.append(tube(f'wisp{s}{k}', (0, s * 0.86, 1.55), (0.08 * (k - 1.5), s * (0.95 + k * 0.02), 1.45 + k * 0.06), r=0.008, color='sand', seg=4))
    H = 1.85
    p += [blob('head', 0.2, (0, 0, H), 'sand', seed=9, amp=0.08, scale=(1, 1, 1.1), seg=14),
          sphere('eye1', 0.035, loc=(0.18, -0.07, H + 0.04), color='ink', seg=8),
          sphere('eye2', 0.035, loc=(0.18, 0.07, H + 0.04), color='ink', seg=8),
          cyl('nose', 0.03, 0.08, loc=(0.18, 0, H - 0.02), color='terracotta', seg=8, r2=0.005, bev=0, rot=(0, math.pi / 2, 0)),
          torus('neck_tie', 0.12, 0.02, loc=(0, 0, H - 0.18), color='sand', seg=16, rseg=4)]
    for k in range(5):  # stitched grin
        a = -0.6 + k * 0.3
        p.append(box(f'stitch{k}', (0.01, 0.012, 0.04), loc=(0.19 - abs(a) * 0.02, math.sin(a) * 0.1, H - 0.08 + abs(a) * 0.03), color='ink', bev=0, seg=1))
    p += [cyl('brim', 0.34, 0.03, loc=(0, 0, H + 0.14), color='butter', seg=24, bev=0.01, rot=(0.12, 0.08, 0)),
          cyl('crown', 0.17, 0.2, loc=(0, 0, H + 0.15), color='butter', seg=16, r2=0.14, bev=0.04, rot=(0.12, 0.08, 0)),
          torus('hatband', 0.16, 0.02, loc=(0, 0, H + 0.2), color='red', seg=16, rseg=4, rot=(0.12, 0.08, 0))]
    # the crow on the crossbar
    cy = 0.6
    p += [sphere('crow', 0.1, loc=(0, cy, 1.7), color='gloss_black', seg=12, scale=(1.4, 0.9, 1)),
          sphere('crow_head', 0.065, loc=(0.12, cy, 1.8), color='gloss_black', seg=10),
          cyl('crow_beak', 0.025, 0.08, loc=(0.17, cy, 1.8), color='hazard', seg=6, r2=0.004, bev=0, rot=(0, math.pi / 2, 0)),
          sphere('crow_eye', 0.012, loc=(0.16, cy + 0.04, 1.83), color='glow_white', seg=6),
          box('crow_tail', (0.12, 0.08, 0.02), loc=(-0.16, cy, 1.66), color='gloss_black', bev=0.01, rot=(0, 0.4, 0))]
    return tag(finish(join(p, 'scarecrow'), mass=0.12), 'farmfair')
