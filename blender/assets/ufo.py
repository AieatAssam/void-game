"""Landed flying saucer (UFO event): riveted chrome hull, glass dome with a pilot seat, a spinning ring of
running lights (clip 'lights'), tractor-beam emitter, three landing legs and a boarding ramp."""
from kit import *


def build():
    R = 3.0
    zh = 1.25  # hull centre height (on its legs)
    hull = [lathe('hull', [(0, zh - 0.55), (0.9, zh - 0.55), (2.3, zh - 0.3), (R, zh - 0.05), (R + 0.05, zh), (R, zh + 0.07),
                           (2.2, zh + 0.35), (1.4, zh + 0.55), (0, zh + 0.58)], color='pearl', seg=64),
            torus('rim_band', R, 0.08, loc=(0, 0, zh), color='steel', seg=64, rseg=8),
            torus('lower_band', 2.3, 0.05, loc=(0, 0, zh - 0.3), color='gloss_black', seg=64, rseg=6),
            lathe('dome', [(1.25, zh + 0.5), (1.2, zh + 0.85), (0.95, zh + 1.3), (0.5, zh + 1.58), (0, zh + 1.65)], color='glass', seg=48),
            torus('dome_ring', 1.25, 0.06, loc=(0, 0, zh + 0.52), color='gold', seg=48, rseg=6),
            cyl('seat', 0.3, 0.3, loc=(0, 0, zh + 0.55), color='hot_pink', seg=16, bev=0.06),
            sphere('pilot_head', 0.22, loc=(0.1, 0, zh + 1.05), color='sage', seg=16, scale=(1, 1, 1.15)),
            cyl('beam_emitter', 0.7, 0.12, loc=(0, 0, zh - 0.67), color='gloss_black', seg=32, bev=0.03),
            cyl('beam_lens', 0.55, 0.04, loc=(0, 0, zh - 0.7), color='lilac', seg=32, bev=0)]
    for k in range(32):  # rivets around the upper hull
        a = k * 2 * math.pi / 32
        hull.append(sphere(f'riv{k}', 0.03, loc=(math.cos(a) * 2.45, math.sin(a) * 2.45, zh + 0.28), color='steel', seg=6))
    for k in range(6):  # panel seams
        a = k * math.pi / 3
        hull.append(tube(f'seam{k}', (math.cos(a) * 1.45, math.sin(a) * 1.45, zh + 0.53), (math.cos(a) * 2.95, math.sin(a) * 2.95, zh + 0.1), r=0.015, color='steel'))
    for k in range(3):  # landing legs with pads and pistons
        a = k * 2 * math.pi / 3 + math.pi / 6
        c, s = math.cos(a), math.sin(a)
        hull += [tube(f'leg{k}', (c * 1.5, s * 1.5, zh - 0.4), (c * 2.3, s * 2.3, 0.12), r=0.09, color='steel'),
                 tube(f'piston{k}', (c * 1.2, s * 1.2, zh - 0.45), (c * 2.0, s * 2.0, 0.45), r=0.05, color='chrome'),
                 cyl(f'pad{k}', 0.35, 0.12, loc=(c * 2.35, s * 2.35, 0), color='steel', seg=20, bev=0.04),
                 sphere(f'padlight{k}', 0.06, loc=(c * 2.35, s * 2.35, 0.14), color='toxic', seg=8)]
    ramp = box('ramp', (2.2, 1.0, 0.08), loc=(-2.1, 0, 0.45), color='steel', bev=0.03, rot=(0, -0.42, 0))
    hull += [ramp, *[box(f'ramp_rib{k}', (0.06, 0.9, 0.03), loc=(-1.3 - k * 0.35, 0, 0.83 - k * 0.15), color='gloss_black', bev=0.01, seg=1, rot=(0, -0.42, 0)) for k in range(5)],
             box('hatch_glow', (0.05, 0.9, 0.5), loc=(-1.05, 0, zh - 0.25), color='lilac', bev=0.02)]
    root = join(hull, 'ufo')
    lights = join([sphere(f'light{k}', 0.11, loc=(math.cos(k * math.pi / 8) * (R - 0.12), math.sin(k * math.pi / 8) * (R - 0.12), 0.0),
                          color=('toxic', 'lilac', 'glow')[k % 3], seg=10) for k in range(16)] +
                  [torus('light_track', R - 0.12, 0.03, color='gloss_black', seg=64, rseg=6)], 'ufo_lights')
    lights.location = (0, 0, zh - 0.1)
    parent(lights, root)
    finish(root, mass=12)
    spin(lights, 'Z', frames=48, name='lights')
    return tag(root, 'events', event='ufo', clone=True, rare=True, lod=[0.3, 0.1])
