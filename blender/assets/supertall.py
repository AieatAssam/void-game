"""Region pack (capital): the supertall (tier ~25, 190 m) - the capital's icon. A twisting stack of glass floor
plates on a chamfered triangular plan, with a gold crown, a needle spire, observation deck ring and a podium."""
from kit import *


def build():
    p = [cyl('podium', 26.0, 10.0, loc=(0, 0, 0), color='concrete', seg=6, bev=0.4),
         cyl('podglass', 26.3, 6.0, loc=(0, 0, 1.0), color='glass', seg=6, bev=0.1)]
    N, z, dz = 34, 10.0, 4.8
    for k in range(N):  # floor plates twisting 1.8 deg each, tapering
        t = k / (N - 1)
        r = 20.0 - t * 9.0
        ang = k * math.radians(1.8)
        p += [cyl(f'fl{k}', r, dz - 0.6, loc=(0, 0, z), color='glass', seg=3, bev=0.9, rot=(0, 0, ang)),
              cyl(f'sl{k}', r + 0.4, 0.6, loc=(0, 0, z + dz - 0.6), color='white', seg=3, bev=0.4, rot=(0, 0, ang))]
        z += dz
    top = z
    p += [torus('deck', 12.0, 0.8, loc=(0, 0, top - 14), color='glow', seg=40, rseg=8),
          cyl('crown', 9.0, 12.0, loc=(0, 0, top), color='gold', seg=3, bev=0.6, r2=3.0, rot=(0, 0, N * math.radians(1.8))),
          cyl('needle', 0.9, 28.0, loc=(0, 0, top + 12.0), color='chrome', seg=12, bev=0, r2=0.1),
          sphere('beacon', 0.6, loc=(0, 0, top + 40.3), color='siren_red', seg=10)]
    return finish(tag(join(p, 'supertall'), 'region'), smooth_angle=30)
