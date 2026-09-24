"""Detailed toy people (replaces the simple pegs). Arms/legs carry _swing/_pivot attributes so the game's
vertex shader swings them while walking - instanced crowds that still animate."""
from lib import *

HIP, SHOULDER = 0.42, 0.78


def face(p, skin, hair, style, glasses=False):
    H = 0.93  # head centre
    p += [sphere('head', 0.17, loc=(0, 0, H), color=skin, seg=28, scale=(1, 1, 1.05)),
          sphere('nose', 0.028, loc=(0.165, 0, H - 0.01), color=skin, seg=12),
          box('mouth', (0.02, 0.07, 0.014), loc=(0.158, 0, H - 0.07), color='brick', bev=0.006, seg=1)]
    for s in (-1, 1):
        p += [sphere(f'white{s}', 0.034, loc=(0.14, s * 0.06, H + 0.03), color='white', seg=14),
              sphere(f'pupil{s}', 0.02, loc=(0.168, s * 0.06, H + 0.03), color='ink', seg=10),
              sphere(f'glint{s}', 0.007, loc=(0.184, s * 0.055, H + 0.045), color='glow_white', seg=6),
              box(f'brow{s}', (0.02, 0.06, 0.012), loc=(0.15, s * 0.06, H + 0.085), color=hair if style != 'bald' else skin, bev=0.005, seg=1),
              sphere(f'ear{s}', 0.035, loc=(0.0, s * 0.165, H), color=skin, seg=10, scale=(0.6, 0.5, 1)),
              sphere(f'cheek{s}', 0.025, loc=(0.14, s * 0.1, H - 0.04), color='pink', seg=8, scale=(0.4, 1, 0.7))]
        if glasses:
            p.append(torus(f'lens{s}', 0.036, 0.008, loc=(0.172, s * 0.06, H + 0.03), color='ink', seg=16, rseg=6, rot=(0, math.pi / 2, 0)))
    if glasses:
        p.append(box('bridge', (0.01, 0.05, 0.008), loc=(0.175, 0, H + 0.035), color='ink', bev=0, seg=1))
    if style == 'short':
        p += [sphere('hair', 0.178, loc=(-0.015, 0, H + 0.03), color=hair, seg=24, scale=(1, 1.02, 0.95)),
              box('fringe', (0.05, 0.26, 0.06), loc=(0.12, 0, H + 0.13), color=hair, bev=0.025)]
    elif style == 'bun':
        p += [sphere('hair', 0.178, loc=(-0.02, 0, H + 0.03), color=hair, seg=24),
              sphere('bun', 0.075, loc=(-0.1, 0, H + 0.17), color=hair, seg=16)]
    elif style == 'ponytail':
        p += [sphere('hair', 0.178, loc=(-0.02, 0, H + 0.03), color=hair, seg=24),
              sphere('tail', 0.06, loc=(-0.2, 0, H - 0.02), color=hair, seg=14, scale=(1, 0.8, 1.9), rot=(0, 0.4, 0)),
              torus('band', 0.045, 0.012, loc=(-0.17, 0, H + 0.06), color='hot_pink', seg=14, rseg=6, rot=(0, 1.2, 0))]
    elif style == 'spiky':
        p.append(sphere('hair', 0.172, loc=(-0.02, 0, H + 0.04), color=hair, seg=24))
        for k in range(7):
            a = k * math.pi / 3.5
            p.append(cyl(f'spike{k}', 0.045, 0.1, loc=(-0.02 + math.cos(a) * 0.08, math.sin(a) * 0.08, H + 0.14), color=hair, r2=0.005, seg=8, bev=0,
                         rot=(math.sin(a) * -0.5, math.cos(a) * 0.5, 0)))
    return H


def body(p, top, legs, shoes, skin, sleeve=None, kid=False):
    sleeve = sleeve or top
    p += [lathe('torso', [(0.0, HIP - 0.02), (0.14, HIP - 0.02), (0.16, 0.5), (0.155, 0.66), (0.13, SHOULDER), (0.07, 0.82), (0.0, 0.83)], color=top, seg=24),
          cyl('neck', 0.05, 0.08, loc=(0, 0, 0.8), color=skin, seg=12, bev=0.01),
          torus('belt', 0.148, 0.016, loc=(0, 0, HIP + 0.03), color='ink', seg=24, rseg=6),
          box('buckle', (0.02, 0.05, 0.035), loc=(0.15, 0, HIP + 0.03), color='gold', bev=0.006, seg=1)]
    for s in (-1, 1):
        leg = join([cyl('thigh', 0.068, HIP - 0.06, loc=(0, 0, 0.06), color=legs, seg=14, r2=0.075, bev=0.02),
                    box('shoe', (0.2, 0.1, 0.08), loc=(0.035, 0, 0.04), color=shoes, bev=0.035),
                    box('sole', (0.21, 0.105, 0.02), loc=(0.035, 0, 0.01), color='white', bev=0.008, seg=1)], f'leg{s}')
        leg.location = (0, s * 0.075, 0)
        swing(leg, s * 1, HIP)
        arm = join([sphere('shoulder', 0.06, loc=(0, 0, 0), color=sleeve, seg=14),
                    cyl('arm', 0.05, 0.3, loc=(0, 0, -0.3), color=sleeve, seg=12, r2=0.055, bev=0.015),
                    sphere('hand', 0.048, loc=(0.01, 0, -0.33), color=skin, seg=12)], f'arm{s}')
        arm.location = (0, s * 0.19, SHOULDER - 0.03)
        arm.rotation_euler = (s * 0.12, 0, 0)
        swing(arm, s * 2, SHOULDER - 0.03)
        p += [leg, arm]


def person(name, top, legs, shoes, skin, hair, style, extras=(), glasses=False, sleeve=None, scale=1.22, tier=None):
    p = []
    body(p, top, legs, shoes, skin, sleeve)
    face(p, skin, hair, style, glasses)
    for e in extras:
        p += e()
    ob = join(p, name)
    if scale != 1.0:
        ob.data.transform(Matrix.Scale(scale, 4))
        for a in ('_pivot',):
            for d in ob.data.attributes[a].data:
                d.value *= scale
    return finish(ob, tier=tier, mass=0.08)


# ---------- accessories (each returns parts) ----------
def briefcase():
    return [box('case', (0.26, 0.07, 0.2), loc=(0.02, 0.26, 0.3), color='clay', bev=0.02),
            torus('chandle', 0.04, 0.01, loc=(0.02, 0.26, 0.42), color='gold', seg=12, rseg=6, rot=(math.pi / 2, 0, 0))]


def tie():
    return [box('tie', (0.02, 0.06, 0.24), loc=(0.155, 0, 0.66), color='red', bev=0.008),
            box('collarL', (0.05, 0.07, 0.03), loc=(0.12, 0.05, 0.79), color='white', bev=0.01, rot=(0.4, 0, 0)),
            box('collarR', (0.05, 0.07, 0.03), loc=(0.12, -0.05, 0.79), color='white', bev=0.01, rot=(-0.4, 0, 0))]


def camera():
    return [box('cam', (0.1, 0.14, 0.09), loc=(0.17, 0, 0.62), color='gloss_black', bev=0.02),
            cyl('lens', 0.035, 0.06, loc=(0.2, 0, 0.62), color='chrome', seg=14, rot=(0, math.pi / 2, 0), bev=0.008),
            torus('strap', 0.14, 0.008, loc=(0.03, 0, 0.72), color='ink', seg=20, rseg=5, rot=(0, 0.6, 0))]


def sunhat():
    return [cyl('brim', 0.28, 0.02, loc=(0, 0, 1.06), color='butter', seg=28, bev=0.008),
            cyl('crown', 0.15, 0.12, loc=(0, 0, 1.06), color='butter', seg=20, r2=0.13, bev=0.03),
            torus('ribbon', 0.145, 0.015, loc=(0, 0, 1.1), color='red', seg=20, rseg=6)]


def handbag():
    return [box('bag', (0.18, 0.08, 0.14), loc=(0, 0.27, 0.46), color='rose_gold', bev=0.03),
            torus('bstrap', 0.07, 0.008, loc=(0, 0.27, 0.56), color='rose_gold', seg=12, rseg=5, rot=(math.pi / 2, 0, 0))]


def backpack():
    return [box('pack', (0.16, 0.26, 0.3), loc=(-0.2, 0, 0.62), color='red', bev=0.05),
            box('pocket', (0.05, 0.2, 0.12), loc=(-0.29, 0, 0.55), color='navy', bev=0.02)]


def beanie():
    return [sphere('beanie', 0.182, loc=(-0.01, 0, 0.99), color='hot_pink', seg=24, scale=(1, 1, 0.85)),
            torus('cuff', 0.165, 0.03, loc=(0, 0, 0.99), color='hot_pink', seg=24, rseg=8),
            sphere('pom', 0.05, loc=(-0.02, 0, 1.17), color='white', seg=12)]


def toque():
    return [cyl('band', 0.16, 0.08, loc=(0, 0, 1.03), color='white', seg=24, bev=0.02),
            sphere('puff', 0.19, loc=(0, 0, 1.2), color='white', seg=24, scale=(1, 1, 0.75)),
            lathe('apron', [(0.165, 0.3), (0.172, 0.4), (0.168, 0.6), (0.16, 0.6), (0.164, 0.4), (0.157, 0.3)], color='white', seg=24),
            torus('ties', 0.165, 0.01, loc=(0, 0, 0.58), color='concrete', seg=24, rseg=5)]


def hardhat():
    return [sphere('hat', 0.19, loc=(0, 0, 1.0), color='hazard', seg=24, scale=(1.05, 1, 0.75)),
            cyl('hbrim', 0.22, 0.02, loc=(0.02, 0, 0.98), color='hazard', seg=24, bev=0.006),
            lathe('vest', [(0.165, 0.47), (0.17, 0.52), (0.165, 0.66), (0.14, 0.77), (0.13, 0.77), (0.155, 0.66), (0.16, 0.52), (0.155, 0.47)], color='warn', seg=24),
            torus('reflect', 0.168, 0.012, loc=(0, 0, 0.58), color='glow_white', seg=24, rseg=6),
            torus('reflect2', 0.166, 0.012, loc=(0, 0, 0.52), color='glow_white', seg=24, rseg=6)]


def headband():
    return [torus('hb', 0.172, 0.022, loc=(0, 0, 1.02), color='mint', seg=24, rseg=6, rot=(0, 0.15, 0)),
            box('stripeT', (0.03, 0.3, 0.04), loc=(0.15, 0, 0.62), color='white', bev=0.01)]


def balloon():
    return [cyl('string', 0.004, 0.75, loc=(0.02, 0.24, 0.45), color='white', seg=6, bev=0),
            sphere('balloon', 0.16, loc=(0.02, 0.24, 1.35), color='red', seg=24, scale=(1, 1, 1.2)),
            sphere('shine', 0.03, loc=(0.1, 0.2, 1.42), color='glow_white', seg=8)]
