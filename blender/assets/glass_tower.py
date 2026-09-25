"""Region pack (capital): a modern glass office tower (tier ~15, 110 m). A tapering blue curtain wall with white
mullion fins every few metres, setbacks, a crown of lit fins, a rooftop helipad and a stone podium lobby."""
from kit import *


def build():
    p = [box('podium', (30.0, 30.0, 8.0), loc=(0, 0, 4.0), color='concrete', bev=0.3),
         box('lobby', (30.4, 20.0, 5.0), loc=(0, 0, 2.5), color='glass', bev=0.08, seg=1)]
    tiers = ((22.0, 8.0, 50.0), (19.0, 58.0, 30.0), (15.0, 88.0, 18.0))
    for k, (w, z0, h) in enumerate(tiers):
        p += [box(f'glass{k}', (w, w, h), loc=(0, 0, z0 + h / 2), color='glass', bev=0.3, seg=2),
              box(f'slab{k}', (w + 0.8, w + 0.8, 0.8), loc=(0, 0, z0 + h), color='white', bev=0.15, seg=2)]
        n = int(w / 3.0)
        for side in range(4):
            a = side * math.pi / 2
            c, s = math.cos(a), math.sin(a)
            for i in range(n + 1):
                u = -w / 2 + i * w / n
                p.append(box(f'fin{k}{side}{i}', (0.5, 0.25, h), loc=(c * (w / 2 + 0.1) - s * u, s * (w / 2 + 0.1) + c * u, z0 + h / 2), color='white', bev=0.05, seg=1, rot=(0, 0, a)))
        for j in range(int(h / 4)):  # spandrel bands
            p.append(box(f'band{k}{j}', (w + 0.3, w + 0.3, 0.3), loc=(0, 0, z0 + 3.6 + j * 4), color='navy', bev=0.05, seg=1))
    # crown: lit fins + helipad
    top = 106.0
    for k in range(12):
        a = k * math.tau / 12
        p.append(box(f'crown{k}', (0.6, 3.0, 8.0), loc=(math.cos(a) * 6.5, math.sin(a) * 6.5, top + 4.0), color='glow_white', bev=0.1, seg=1, rot=(0, 0, a)))
    p += [cyl('pad', 7.0, 0.6, loc=(0, 0, top), color='asphalt', seg=32, bev=0.1),
          torus('padring', 5.0, 0.15, loc=(0, 0, top + 0.62), color='hazard', seg=32, rseg=4),
          box('H1', (0.5, 3.0, 0.1), loc=(-1.0, 0, top + 0.62), color='white', bev=0, seg=1),
          box('H2', (0.5, 3.0, 0.1), loc=(1.0, 0, top + 0.62), color='white', bev=0, seg=1),
          box('H3', (2.0, 0.5, 0.1), loc=(0, 0, top + 0.62), color='white', bev=0, seg=1),
          cyl('mast', 0.2, 10.0, loc=(4.0, 4.0, top), color='steel', seg=8, bev=0),
          sphere('beacon', 0.5, loc=(4.0, 4.0, top + 10.2), color='siren_red', seg=10)]
    return finish(tag(join(p, 'glass_tower'), 'region'))
