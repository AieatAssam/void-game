"""Kid peg with a balloon: smaller, and the balloon makes it readable from far away."""
from peg import *


def build():
    kid = join(peg_parts('butter', 'peach', 'clay', 'hair'), 'kid')
    kid.data.transform(Matrix.Scale(0.75, 4))
    p = [kid,
         cyl('string', 0.006, 0.6, loc=(0.08, 0.1, 0.38), color='white', seg=6, bev=0),
         sphere('balloon', 0.2, loc=(0.08, 0.1, 1.2), color='red', seg=24, scale=(1, 1, 1.2)),
         cyl('knot', 0.03, 0.05, loc=(0.08, 0.1, 0.96), color='red', seg=6, r2=0.01, bev=0)]
    return finish(join(p, 'peg_d'), tier=0.13, mass=0.05)
