"""Region pack (capital): the national stadium (tier ~42). An oval bowl of tiered stands in team colours, a
floating white roof ring on raked masts, floodlight banks, a striped pitch with goals and a big screen."""
from kit import *
from lib import _obj


def ellipse_ring(name, a, b, r_in_k, z0, h, color, seg=48):
    """An elliptical band (outer semi-axes a, b; inner = outer * r_in_k), bottom at z0, height h."""
    import bmesh
    bm = bmesh.new()
    rings = []
    for (k, z) in ((1.0, z0), (1.0, z0 + h), (r_in_k, z0 + h), (r_in_k, z0)):
        rings.append([bm.verts.new((a * k * math.cos(2 * math.pi * i / seg), b * k * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)])
    for r0, r1 in zip(rings, rings[1:] + rings[:1]):
        for i in range(seg):
            bm.faces.new((r0[i], r0[(i + 1) % seg], r1[(i + 1) % seg], r1[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, color, (0, 0, 0), (0, 0, 0))


def build():
    A, B = 44.0, 34.0
    p = [ellipse_ring('outer', A, B, 0.93, 0, 16.0, 'white'),
         box('pitch', (50.0, 32.0, 0.4), loc=(0, 0, 0.2), color='foliage_lt', bev=0.05, seg=1)]
    for k in range(10):  # mown stripes
        p.append(box(f'mow{k}', (2.5, 32.0, 0.05), loc=(-22.5 + k * 5, 0, 0.42), color='sage', bev=0, seg=1))
    for k in range(4):  # rising tiers of seats
        kk = 0.9 - k * 0.07
        z = 1.0 + k * 3.5
        p.append(ellipse_ring(f'tier{k}', A * kk, B * kk, 0.86 - k * 0.02, 0, z + 3.5, ('red', 'white', 'red', 'navy')[k]))
    p += [box('lineH', (0.2, 32.0, 0.06), loc=(0, 0, 0.45), color='white', bev=0, seg=1),
          torus('circle', 4.5, 0.12, loc=(0, 0, 0.45), color='white', seg=32, rseg=4)]
    for s in (-1, 1):
        p += [box(f'box{s}', (0.12, 14.0, 0.06), loc=(s * 17, 0, 0.45), color='white', bev=0, seg=1),
              box(f'goal{s}', (0.3, 7.3, 2.4), loc=(s * 25.3, 0, 1.6), color='white', bev=0.08, seg=1),
              box(f'net{s}', (1.6, 7.0, 2.2), loc=(s * 26.1, 0, 1.5), color='concrete', bev=0.05, seg=1)]
    # roof ring on masts + floodlights
    p.append(ellipse_ring('roof', A + 3.0, B + 3.0, 0.72, 20.0, 1.2, 'pearl'))
    for k in range(12):
        a = k * math.tau / 12
        x, y = math.cos(a) * (A + 3.5), math.sin(a) * (B + 3.5)
        p += [tube(f'mast{k}', (x, y, 0), (x * 1.06, y * 1.06, 30.0), r=0.6, color='white', seg=8),
              tube(f'stay{k}', (x * 1.06, y * 1.06, 29.0), (x * 0.82, y * 0.82, 21.2), r=0.2, color='steel', seg=4)]
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        x, y = math.cos(a) * (A - 6), math.sin(a) * (B - 6)
        p += [box(f'flood{k}', (6.0, 1.0, 3.0), loc=(x, y, 23.5), color='ink', bev=0.1, seg=1, rot=(0, 0, a + math.pi / 2)),
              box(f'floodL{k}', (5.6, 0.2, 2.6), loc=(x * 0.985, y * 0.985, 23.5), color='glow_white', bev=0.03, seg=1, rot=(0, 0, a + math.pi / 2))]
    p += [box('screen', (0.8, 12.0, 6.0), loc=(A - 6.5, 0, 17.0), color='gloss_black', bev=0.1, seg=1),
          box('screenOn', (0.1, 11.0, 5.0), loc=(A - 6.95, 0, 17.0), color='siren_blue', bev=0.02, seg=1)]
    ob = join(p, 'stadium')
    ob.data.transform(Matrix.Scale(0.76, 4))  # ladder: tier ~39 (parliament 32.6 x1.19)
    return finish(tag(ob, 'region'), smooth_angle=50)
