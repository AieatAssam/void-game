"""Carousel (fairground ride): striped canopy with a scalloped valance and bulb-lit rounding board, mirrored
centre column, brass poles and eight galloping toy horses. Everything above the plinth turns (clip 'spin')."""
from kit import *

RP, RC = 3.8, 4.1  # platform and canopy radius


def horse(k, col):
    """Toy horse facing +X at the origin (pole passes through the saddle)."""
    p = [sphere('body', 0.45, loc=(0, 0, 0), color=col, seg=14, scale=(1.45, 0.55, 0.6)),
         tube('neck', (0.45, 0, 0.1), (0.72, 0, 0.5), r=0.14, color=col, seg=8),
         sphere('head', 0.2, loc=(0.85, 0, 0.55), color=col, seg=12, scale=(1.45, 0.7, 0.8), rot=(0, 0.45, 0)),
         sphere('muzzle', 0.11, loc=(1.07, 0, 0.44), color='pearl', seg=12, scale=(1.1, 0.9, 0.8)),
         box('saddle', (0.42, 0.52, 0.08), loc=(-0.02, 0, 0.26), color='red', bev=0.03),
         box('saddle_cloth', (0.5, 0.6, 0.03), loc=(-0.02, 0, 0.22), color='gold', bev=0.01),
         torus('bridle', 0.12, 0.018, loc=(0.95, 0, 0.5), color='gold', seg=16, rseg=5, rot=(0, math.pi / 2 - 0.45, 0))]
    for s in (-1, 1):
        p += [cyl(f'ear{s}', 0.04, 0.13, loc=(0.78, s * 0.06, 0.68), color=col, seg=8, r2=0.005, bev=0),
              sphere(f'eye{s}', 0.028, loc=(0.95, s * 0.1, 0.6), color='gloss_black', seg=8),
              tube(f'rein{s}', (0.98, s * 0.09, 0.47), (0.1, s * 0.2, 0.3), r=0.012, color='gold', seg=5),
              box(f'stirrup{s}', (0.06, 0.02, 0.1), loc=(0.0, s * 0.3, 0.02), color='chrome', bev=0.01, seg=1)]
    for i, (x, fore) in enumerate(((0.42, True), (-0.42, False))):  # galloping legs: fore reach, hind push
        for s in (-1, 1):
            knee = (x + (0.2 if fore else -0.15), s * 0.14, -0.35)
            hoof = (x + (0.35 if fore else -0.35), s * 0.14, -0.62 if fore else -0.55)
            p += [tube(f'thigh{i}{s}', (x, s * 0.14, -0.1), knee, r=0.07, color=col, seg=6),
                  tube(f'shin{i}{s}', knee, hoof, r=0.05, color=col, seg=6),
                  sphere(f'hoof{i}{s}', 0.06, loc=hoof, color='gold', seg=8)]
    for i in range(6):  # mane
        t = i / 5
        p.append(blob(f'mane{i}', 0.09, (0.5 + t * 0.35, 0, 0.3 + t * 0.35 + 0.06), 'white' if k % 2 else 'butter', seed=k * 10 + i, amp=0.3, scale=(0.8, 0.5, 1), seg=8))
    p.append(blob('tail', 0.14, (-0.72, 0, 0.0), 'white' if k % 2 else 'butter', seed=k, amp=0.3, scale=(1.4, 0.5, 0.7), seg=10))
    return p


def build():
    base = [cyl('plinth', RP + 0.3, 0.3, color='white', seg=64, bev=0.06),
            torus('plinth_trim', RP + 0.3, 0.05, loc=(0, 0, 0.26), color='gold', seg=64, rseg=6),
            box('entry_step', (0.6, 1.6, 0.15), loc=(RP + 0.55, 0, 0.075), color='concrete', bev=0.03)]
    for k in range(24):  # skirting bulbs around the plinth
        a = k * 2 * math.pi / 24
        base.append(sphere(f'pbulb{k}', 0.06, loc=(math.cos(a) * (RP + 0.32), math.sin(a) * (RP + 0.32), 0.14), color='glow', seg=5))
    root = join(base, 'carousel')

    top = [cyl('platform', RP, 0.15, color='cream', seg=64, bev=0.04),
           torus('inlay', RP * 0.7, 0.03, loc=(0, 0, 0.15), color='gold', seg=64, rseg=5),
           cyl('column', 0.7, 3.4, loc=(0, 0, 0.15), color='red', seg=24, bev=0.06)]
    for k in range(8):  # mirrored column panels with gold frames
        a = k * math.pi / 4
        top += [box(f'mirror{k}', (0.03, 0.42, 1.6), loc=(math.cos(a) * 0.71, math.sin(a) * 0.71, 1.9), color='glass', bev=0.01, rot=(0, 0, a)),
                box(f'mframe{k}', (0.02, 0.5, 1.7), loc=(math.cos(a) * 0.70, math.sin(a) * 0.70, 1.9), color='gold', bev=0.01, rot=(0, 0, a))]
    # canopy: 16 striped wedges from the rounding board up to the crown
    zr, zt, th = 3.55, 4.9, 0.08
    for k in range(16):
        a0, a1 = k * math.pi / 8, (k + 1) * math.pi / 8
        v = [(0, 0, zt), (math.cos(a0) * RC, math.sin(a0) * RC, zr), (math.cos(a1) * RC, math.sin(a1) * RC, zr)]
        vd = [(x, y, z - th) for (x, y, z) in v]
        top.append(mesh(f'wedge{k}', v + vd, [(0, 1, 2), (3, 5, 4), (1, 4, 5, 2), (0, 3, 4, 1), (2, 5, 3, 0)], color='red' if k % 2 else 'white'))
    top += [cyl('rounding', RC, 0.45, loc=(0, 0, zr - 0.45), color='butter', seg=64, bev=0.04),
            torus('round_trim_t', RC, 0.04, loc=(0, 0, zr), color='gold', seg=64, rseg=5),
            torus('round_trim_b', RC, 0.04, loc=(0, 0, zr - 0.45), color='gold', seg=64, rseg=5),
            cyl('crown', 0.35, 0.4, loc=(0, 0, zt - 0.1), color='gold', seg=16, bev=0.05),
            cyl('finial', 0.04, 0.9, loc=(0, 0, zt + 0.3), color='gold', seg=8, bev=0),
            sphere('finial_ball', 0.12, loc=(0, 0, zt + 0.35), color='gold', seg=12),
            box('pennant', (0.5, 0.02, 0.3), loc=(0.27, 0, zt + 1.05), color='red', bev=0.01)]
    for k in range(32):  # bulbs on the rounding board + scalloped valance
        a = (k + 0.5) * 2 * math.pi / 32
        top += [sphere(f'rbulb{k}', 0.07, loc=(math.cos(a) * (RC + 0.02), math.sin(a) * (RC + 0.02), zr - 0.22), color=('glow', 'hot_pink')[k % 2], seg=5),
                sphere(f'valance{k}', 0.2, loc=(math.cos(a) * (RC - 0.02), math.sin(a) * (RC - 0.02), zr - 0.5), color='red' if k % 2 else 'white', seg=7, scale=(1, 1, 0.7))]
    cols = ('white', 'pearl', 'sky', 'pink', 'butter', 'mint', 'peach', 'white')
    for k in range(8):  # brass poles through galloping horses, alternate heights
        a = k * math.pi / 4
        x, y = math.cos(a) * 2.7, math.sin(a) * 2.7
        top += [cyl(f'pole{k}', 0.045, zr - 0.6, loc=(x, y, 0.15), color='gold', seg=10, bev=0),
                torus(f'polecap{k}', 0.06, 0.02, loc=(x, y, zr - 0.46), color='gold', seg=10, rseg=4)]
        parts = horse(k, cols[k])
        h = join(parts, f'horse{k}')
        h.rotation_euler = (0, 0, a + math.pi / 2)  # facing the direction of travel
        h.location = (x, y, 1.35 if k % 2 else 1.1)
        top.append(h)
    for k in range(2):  # a sleigh bench for the little ones
        a = k * math.pi + math.pi / 8
        top.append(box(f'bench{k}', (0.9, 0.5, 0.45), loc=(math.cos(a) * 1.7, math.sin(a) * 1.7, 0.38), color='gold', bev=0.1, rot=(0, 0, a + math.pi / 2)))
    t = join(top, 'carousel_top')
    t.location = (0, 0, 0.3)
    parent(t, root)
    finish(root, mass=40)
    spin(t, 'Z', frames=240, name='spin')
    return tag(root, 'fair', clone=True, lod=[0.4, 0.14])
