from lib import *


def build():
    b = sphere('ball', 0.22, loc=(0, 0, 0.22), color='white', seg=15)  # 15 * Q = 24 segments: 4 per panel, clean seams
    cols = ('red', 'white', 'sky', 'white', 'butter', 'white')
    for k, c in enumerate(cols):
        paint(b, c, faces=lambda f, k=k: int((math.atan2(f.center.y, f.center.x) + math.pi) / (math.pi / 3)) % 6 == k)
    return finish(join([b, sphere('cap', 0.05, loc=(0, 0, 0.44), color='white', seg=8)], 'beach_ball'), mass=0.02)
