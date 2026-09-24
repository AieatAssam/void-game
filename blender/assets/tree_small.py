from kit import *


def build():
    return finish(join(lolly_tree(1.0, seed=1, roots=1.1), 'tree_small'), tier=1.1, mass=1.2, below=True, smooth_angle=75)
