"""Power-up capsules (HANDOVER.md 'Power-ups'): a toy gacha capsule - coloured lower shell, clear dome, white
seam band - hovering over a glowing ground ring, with an icon inside. One clip 'float' bobs and turns it."""
from kit import *


def capsule(name, shell, ring, icon_parts, effect):
    base = [cyl('glow_ring', 0.62, 0.03, color=ring, seg=40, bev=0.01),
            torus('glow_edge', 0.62, 0.035, loc=(0, 0, 0.03), color='glow_white', seg=40, rseg=5),
            cyl('shadow', 0.45, 0.02, loc=(0, 0, 0.005), color='ink', seg=32, bev=0)]
    for k in range(8):  # little light pips around the ring
        a = k * math.pi / 4
        base.append(sphere(f'pip{k}', 0.04, loc=(math.cos(a) * 0.75, math.sin(a) * 0.75, 0.04), color=ring, seg=6))
    root = join(base, name)
    # The palette 'glass' is glossy but opaque, so the icon rides on top of an open capsule half instead of inside it.
    R = 0.36
    cap = [lathe('shell', [(0.0, -R), (R * 0.6, -R * 0.8), (R * 0.92, -R * 0.4), (R, 0.0), (R * 0.9, 0.02), (0.0, 0.02)], color=shell, seg=32),
           torus('seam', R, 0.035, color='white', seg=32, rseg=5),
           cyl('stage', R * 0.75, 0.04, loc=(0, 0, 0.0), color='white', seg=24, bev=0.01)]
    for k in range(6):  # sparkle studs round the rim
        a = k * math.pi / 3
        cap.append(sphere(f'stud{k}', 0.03, loc=(math.cos(a) * R, math.sin(a) * R, 0.03), color='glow_white', seg=6))
    for part in icon_parts:  # stand the icon on the stage (icons are authored centred on the origin)
        part.location.z += 0.24
    cap += icon_parts
    c = join(cap, 'capsule')
    c.location = (0, 0, 0.9)
    parent(c, root)
    finish(root, tier=0.5, mass=0, kind='pickup')
    keys(c, 'location', [(0, (0, 0, 0.9)), (48, (0, 0, 1.1)), (96, (0, 0, 0.9))], name='float')
    spin(c, 'Z', frames=96, name='float')
    return tag(root, 'powerups', effect=effect, clone=True)
