"""Planet pack: toy mushroom cloud (unit size: 1 tall, ~0.9 wide; the game scales it). Stacked blobs and rings in
palette swatches (hot emissive core, warm cap, sooty stem, dust skirt). Animate by scale / rise in the shader."""
from kit import *

DETAIL = 0.65  # lib.run reads this (as lib.Q): trims segment counts to the planet-pack tri budget


def build():
    p = [lathe('stem', [(0.01, 0.0), (0.2, 0.02), (0.14, 0.12), (0.12, 0.3), (0.15, 0.48), (0.2, 0.62), (0.01, 0.66)], color='asphalt_lt', seg=18),
         torus('skirt', 0.3, 0.09, loc=(0, 0, 0.07), color='sand', seg=22, rseg=8), torus('skirt2', 0.4, 0.06, loc=(0, 0, 0.04), color='clay', seg=24, rseg=8),
         sphere('core', 0.2, loc=(0, 0, 0.55), color='warn', seg=14, scale=(1, 1, 0.8)),
         sphere('fire', 0.12, loc=(0, 0, 0.18), color='warn', seg=10)]
    for k in range(6):  # puffy cap: a ring of blobs, then a crown
        a = k * math.tau / 6
        p.append(blob(f'cap{k}', 0.24, (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.74 + (k % 2) * 0.03), 'terracotta' if k % 2 else 'clay', seed=k, amp=0.1, scale=(1, 1, 0.8), seg=12))
    for k in range(5):
        a = k * math.tau / 5 + 0.3
        p.append(blob(f'top{k}', 0.2, (math.cos(a) * 0.17, math.sin(a) * 0.17, 0.9), 'sand' if k % 2 else 'peach', seed=k + 9, amp=0.1, seg=12))
    p += [blob('crown', 0.2, (0, 0, 0.96), 'cream', seed=3, amp=0.1, seg=12), torus('ringA', 0.34, 0.05, loc=(0, 0, 0.64), color='cream', seg=22, rseg=8),
          torus('ringB', 0.46, 0.06, loc=(0, 0, 0.74), color='peach', seg=24, rseg=8), sphere('under', 0.3, loc=(0, 0, 0.62), color='brick', seg=14, scale=(1, 1, 0.45))]
    return finish(tag(join(p, 'mushroom_cloud'), 'planet', lod=[0.5, 0.2]), tier=0.5, kind='fx', unit='cloud')
