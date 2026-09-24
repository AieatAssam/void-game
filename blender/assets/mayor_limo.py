"""Rare: the mayor's stretch limo with flags."""
from kit import *


def build():
    p = car(6.4, 2.0, 'gloss_black', roof='gloss_black', cabin=0.62, cabin_x=-0.05, glass='gloss_black')
    for s in (-1, 1):
        p += [cyl(f'flagpole{s}', 0.02, 0.5, loc=(3.0, s * 0.8, 1.0), color='steel', seg=6, bev=0),
              box(f'flag{s}', (0.3, 0.02, 0.2), loc=(2.85, s * 0.8, 1.4), color=('red', 'police')[s > 0], bev=0, seg=1)]
    p.append(box('crest', (0.05, 0.4, 0.3), loc=(3.22, 0, 0.9), color='gold', bev=0.02))
    ob = join(p, 'mayor_limo')
    finish(ob)
    ob['rare'] = True
    return ob
