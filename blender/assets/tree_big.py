from kit import *


def build():
    p = lolly_tree(1.7, leaf=('foliage_lt', 'foliage_mint'), seed=7)
    p.append(cyl('ring', 0.9, 0.2, color='concrete', seg=24, bev=0.06))
    return finish(join(p, 'tree_big'), mass=4)
