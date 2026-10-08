# Builds the Phase 4 hero props in Blender (docs/PHASE4.md) and exports them as small GLBs with vertex colours:
#   COLOR_0 rgb = the colour, a = how emissive (0 lit by the sun, 1 glows). Each model is centred and scaled to a bounding radius of 1; +Y up.
# Earth's leftovers (comm satellite, station, capsule, rocket stage), a monolith, a ringworld, a neutron star with jets, a Dyson shell.
# Run inside Blender (MCP execute_blender_code):  exec(open('/Users/aieat/hole-game/art/space/build_props.py').read())
# Works in its own temporary scene (the open scene is untouched) and removes it afterwards.
import bpy, bmesh, math, os, random
from mathutils import Matrix, Vector

OUT = '/Users/aieat/hole-game/public/models/space'
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(7)


def hexc(h, a=0.0):
    return ((h >> 16 & 255) / 255) ** 2.2, ((h >> 8 & 255) / 255) ** 2.2, ((h & 255) / 255) ** 2.2, a   # (glTF colours are linear)


def two_sided(m, pts, color):
    for order in (pts, list(reversed(pts))):
        vs = [m.bm.verts.new(p) for p in order]; m.bm.faces.new(vs); m.paint(vs, color)


class Model:
    def __init__(self):
        self.bm = bmesh.new(); self.col = self.bm.verts.layers.color.new('Col')

    def paint(self, verts, color):
        for v in verts: v[self.col] = color

    def box(self, size, loc=(0, 0, 0), color=hexc(0xcccccc), rot=(0, 0, 0)):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        M = Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal((size[0], size[1], size[2], 1))
        bmesh.ops.transform(self.bm, matrix=M, verts=r['verts']); self.paint(r['verts'], color); return r['verts']

    def cyl(self, r1, r2, h, loc=(0, 0, 0), color=hexc(0xdddddd), rot=(0, 0, 0), seg=20, cap=True):
        r = bmesh.ops.create_cone(self.bm, cap_ends=cap, segments=seg, radius1=r1, radius2=r2, depth=h)
        M = Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
        bmesh.ops.transform(self.bm, matrix=M, verts=r['verts']); self.paint(r['verts'], color); return r['verts']

    def sphere(self, rad, loc=(0, 0, 0), color=hexc(0xffffff), scale=(1, 1, 1), seg=24):
        r = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=seg // 2, radius=rad)
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation(loc) @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1)), verts=r['verts']); self.paint(r['verts'], color); return r['verts']

    def torus(self, R, r, loc=(0, 0, 0), color=hexc(0xffffff), seg=64, tseg=10, scale=(1, 1, 1), axis='Z'):
        verts = []
        faces = []
        for i in range(seg):
            a = i / seg * math.tau
            for j in range(tseg):
                b = j / tseg * math.tau
                x = (R + r * math.cos(b)) * math.cos(a); y = (R + r * math.cos(b)) * math.sin(a); z = r * math.sin(b)
                verts.append(self.bm.verts.new((x * scale[0] + loc[0], y * scale[1] + loc[1], z * scale[2] + loc[2])))
        for i in range(seg):
            for j in range(tseg):
                a, b2, c, d = i * tseg + j, ((i + 1) % seg) * tseg + j, ((i + 1) % seg) * tseg + (j + 1) % tseg, i * tseg + (j + 1) % tseg
                faces.append(self.bm.faces.new((verts[a], verts[b2], verts[c], verts[d])))
        self.paint(verts, color); bmesh.ops.recalc_face_normals(self.bm, faces=faces); return verts

    def finish(self, name):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        pts = [v.co for v in bm.verts]; c = sum(pts, Vector()) / len(pts)
        rad = max((p - c).length for p in pts)
        bmesh.ops.translate(bm, vec=-c, verts=bm.verts); bmesh.ops.scale(bm, vec=Vector((1 / rad,) * 3), verts=bm.verts)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        me.color_attributes.active_color = me.color_attributes['Col'] if 'Col' in me.color_attributes else me.color_attributes[0]
        for p in me.polygons: p.use_smooth = name in ('neutron_star',)   # flat shading: low-poly hardware reads best at game distance
        return me


GOLD, WHITE, GREY, DARK, PANEL, FRAME, ORANGE = hexc(0xd8a838), hexc(0xe8ecf2), hexc(0x8a8f99), hexc(0x2a2d36), hexc(0x3568d8), hexc(0xb8bcc6), hexc(0xe0742a)


def sat_comm():
    m = Model()
    m.box((1.0, 0.9, 1.1), color=GOLD); m.box((1.06, 0.95, 0.08), (0, 0, 0.5), GREY)
    for s in (-1, 1):
        m.box((0.14, 0.14, 0.14), (s * 0.6, 0, 0), GREY)
        m.box((2.4, 0.04, 0.9), (s * 1.9, 0, 0), PANEL); m.box((2.5, 0.05, 0.05), (s * 1.9, 0.0, 0.45), FRAME); m.box((2.5, 0.05, 0.05), (s * 1.9, 0.0, -0.45), FRAME)
        for k in range(1, 6): m.box((0.03, 0.045, 0.9), (s * (0.75 + k * 0.45), 0, 0), FRAME)
    m.cyl(0.55, 0.05, 0.3, (0, 0.0, -0.8), GREY, rot=(math.pi, 0, 0)); m.cyl(0.04, 0.04, 0.7, (0.15, 0, 0.9), GREY)
    m.cyl(0.6, 0.6, 0.06, (0, 0.62, 0.5), WHITE, rot=(math.pi / 2, 0, 0)); m.cyl(0.03, 0.03, 0.5, (0, 0.5, 0.5), GREY, rot=(math.pi / 2, 0, 0))
    m.sphere(0.05, (0.15, 0, 1.25), hexc(0xff4a3a, 0.9), seg=8)
    return m.finish('sat_comm')


def station():
    m = Model()
    m.box((6.0, 0.18, 0.18), color=FRAME)
    for x, l in ((-1.4, 1.5), (0.4, 2.0), (1.9, 1.3)): m.cyl(0.42, 0.42, l, (x, 0, 0), WHITE, rot=(0, math.pi / 2, 0), seg=16)
    m.cyl(0.3, 0.3, 1.2, (0.4, 0.8, 0), WHITE, rot=(math.pi / 2, 0, 0), seg=12)
    for x in (-2.7, -2.3, 2.3, 2.7):
        for s in (-1, 1):
            m.box((0.6, 0.03, 1.8), (x, 0, s * 1.15), PANEL); m.box((0.62, 0.04, 0.04), (x, 0, s * 1.15), FRAME)
        m.box((0.06, 0.06, 2.4), (x, 0, 0), FRAME)
    m.box((1.4, 0.05, 0.9), (-0.2, -0.55, 0.9), hexc(0xd9d9d9), rot=(0, 0, 0))
    m.cyl(0.2, 0.2, 0.5, (3.0, 0, 0), GOLD, rot=(0, math.pi / 2, 0), seg=10); m.sphere(0.06, (-3.0, 0, 0), hexc(0x66aaff, 1), seg=8)
    return m.finish('station')


def capsule():
    m = Model()
    m.cyl(1.0, 0.08, 1.6, (0, 0, 1.1), hexc(0xcfd2d8), seg=24)        # the command module cone (point +Z)
    m.cyl(1.0, 1.0, 0.2, (0, 0, 0.25), DARK, seg=24)                  # heat shield rim
    m.cyl(1.0, 1.0, 1.5, (0, 0, -0.6), hexc(0xe6e6e6), seg=24)        # service module
    m.cyl(0.82, 0.3, 0.55, (0, 0, -1.65), DARK, rot=(0, 0, 0), seg=18)   # engine bell
    m.box((0.5, 0.04, 0.5), (0, 0.99, 0.9), hexc(0xe0742a)); m.box((0.3, 0.3, 0.12), (0.85, 0, -0.4), GREY)
    m.sphere(0.06, (0, 0, 1.9), hexc(0xff5030, 0.8), seg=8)
    return m.finish('capsule')


def rocket_stage():
    m = Model()
    m.cyl(0.8, 0.8, 3.6, (0, 0, 0), hexc(0xf0f0f0), seg=24)
    m.cyl(0.82, 0.82, 0.55, (0, 0, 0.9), ORANGE, seg=24); m.cyl(0.82, 0.82, 0.18, (0, 0, -1.3), DARK, seg=24)
    m.cyl(0.8, 0.45, 0.6, (0, 0, 2.1), hexc(0xd8d8d8), seg=24)           # interstage
    for i in range(5):
        a = i / 5 * math.tau; m.cyl(0.26, 0.14, 0.55, (0.38 * math.cos(a), 0.38 * math.sin(a), -2.05), DARK, seg=10)
    m.cyl(0.26, 0.14, 0.55, (0, 0, -2.05), DARK, seg=10)
    for i in range(4):
        a = i / 4 * math.tau + 0.4; m.box((0.05, 0.5, 1.0), (0.82 * math.cos(a), 0.82 * math.sin(a), -1.3), FRAME, rot=(0, 0, a))
    return m.finish('rocket_stage')


def monolith():
    m = Model()
    m.box((1.0, 0.25, 4.0), color=hexc(0x050507))
    m.box((1.02, 0.02, 4.02), (0, 0.13, 0), hexc(0x20242c, 0.0)); m.box((0.9, 0.3, 0.02), (0, 0, 2.01), hexc(0x9fb4ff, 0.35))
    return m.finish('monolith')


def ringworld():
    m = Model()
    m.torus(6.0, 0.18, (0, 0, 0), hexc(0x6a7280), seg=72, tseg=6, scale=(1, 1, 0.3))   # (flattened torus: a band)
    # the inner surface: land strips and glowing city lines
    for i in range(48):
        a0 = i / 48 * math.tau; a1 = (i + 1) / 48 * math.tau
        col = hexc(0x3f8f55) if i % 3 else hexc(0x3a6fb5)
        vs = [m.bm.verts.new((5.75 * math.cos(a), 5.75 * math.sin(a), z)) for a, z in ((a0, -0.9), (a1, -0.9), (a1, 0.9), (a0, 0.9))]
        m.bm.faces.new(vs); m.paint(vs, col)
        if i % 4 == 0:
            ls = [m.bm.verts.new((5.74 * math.cos(a), 5.74 * math.sin(a), z)) for a, z in ((a0, -0.05), (a1, -0.05), (a1, 0.05), (a0, 0.05))]
            m.bm.faces.new(ls); m.paint(ls, hexc(0xffe9a0, 1.0))
    for z in (-0.95, 0.95): m.torus(5.9, 0.07, (0, 0, z), hexc(0xb8bcc6), seg=96, tseg=5)
    return m.finish('ringworld')


def neutron_star():
    m = Model()
    m.sphere(0.35, (0, 0, 0), hexc(0xcfe4ff, 1.0), seg=24)
    for s in (-1, 1):
        m.cyl(0.02, 0.45, 5.0, (0, 0, s * 2.9), hexc(0x6aa8ff, 1.0), rot=(0 if s > 0 else math.pi, 0, 0), seg=18, cap=False)
        m.cyl(0.0, 0.2, 5.0, (0, 0, s * 2.9), hexc(0xe8f2ff, 1.0), rot=(0 if s > 0 else math.pi, 0, 0), seg=12, cap=False)
    m.torus(1.5, 0.03, (0, 0, 0), hexc(0x9ac0ff, 1.0), seg=40, tseg=4, scale=(1, 1, 1))
    m.torus(2.4, 0.02, (0, 0, 0), hexc(0x7aa0ff, 0.8), seg=40, tseg=4)
    return m.finish('neutron_star')


def dyson():
    m = Model()
    m.sphere(0.7, (0, 0, 0), hexc(0xfff0c0, 1.0), seg=24)
    r = bmesh.ops.create_icosphere(m.bm, subdivisions=3, radius=3.0)
    faces = list({f for v in r['verts'] for f in v.link_faces})
    keep = [f for f in faces if rnd.random() > 0.38]
    drop = [f for f in faces if f not in keep]
    bmesh.ops.delete(m.bm, geom=drop, context='FACES')
    # panels: slightly shrunk, gold with dark gaps
    for f in keep:
        if not f.is_valid: continue
        c = f.calc_center_median()
        for v in f.verts: v.co = c + (v.co - c) * 0.9; v[m.col] = hexc(0xd8a838) if rnd.random() > 0.2 else hexc(0x3a3f4d)
    for f in keep:
        if f.is_valid:
            for v in f.verts: v[m.col] = v[m.col]
    return m.finish('dyson')


def telescope():
    m = Model()
    m.cyl(0.55, 0.55, 2.6, (0, 0, 0), hexc(0xc9ced8), rot=(0, math.pi / 2, 0), seg=20)           # the tube along X
    m.cyl(0.6, 0.6, 0.5, (-1.2, 0, 0), GOLD, rot=(0, math.pi / 2, 0), seg=20)                    # foil shroud
    m.cyl(0.5, 0.5, 0.08, (1.32, 0, 0), DARK, rot=(0, math.pi / 2, 0), seg=20)                   # the aperture
    m.cyl(0.52, 0.62, 0.35, (1.12, 0, 0), WHITE, rot=(0, math.pi / 2, 0), seg=20)               # the sun shield lip
    for s2 in (-1, 1):
        m.box((0.08, 0.04, 0.9), (-0.2, 0.0, s2 * 0.95), FRAME); m.box((1.2, 0.03, 0.9), (-0.2, 0.0, s2 * 1.55), PANEL); m.box((1.22, 0.04, 0.04), (-0.2, 0.0, s2 * 1.55), FRAME)
    m.cyl(0.28, 0.04, 0.2, (-0.3, 0.7, 0), GREY, rot=(0, 0, 0), seg=14); m.cyl(0.03, 0.03, 0.4, (-0.3, 0.6, 0), GREY, rot=(math.pi / 2, 0, 0), seg=8)
    return m.finish('telescope')


def probe():
    m = Model()
    m.cyl(0.55, 0.55, 0.45, (0, 0, 0), hexc(0xb8bcc6), seg=10)                                    # the decagonal bus
    m.cyl(1.7, 0.1, 0.55, (0, 0, 0.5), hexc(0xe8e8e8), seg=32)                                    # the big dish
    m.cyl(0.12, 0.12, 0.7, (0, 0, 0.9), GREY, seg=8)
    m.box((0.06, 0.06, 3.2), (1.2, 0.0, -0.9), FRAME, rot=(0, 0, 0))                                 # the science boom
    m.box((0.3, 0.3, 0.3), (1.2, 0, -2.5), GREY); m.sphere(0.12, (1.2, 0, -2.7), hexc(0xffd070, 0.5), seg=8)
    m.cyl(0.14, 0.14, 0.7, (-0.9, 0, -0.5), DARK, rot=(0, math.pi / 2, 0), seg=10); m.cyl(0.14, 0.14, 0.7, (-0.9, 0.4, -0.5), DARK, rot=(0, math.pi / 2, 0), seg=10)
    m.box((0.05, 0.05, 1.6), (-1.5, 0, -0.5), FRAME); m.sphere(0.08, (-1.5, 0, 0.35), hexc(0x66ffaa, 0.9), seg=8)
    return m.finish('probe')


def freighter():
    m = Model()
    m.box((5.0, 1.0, 1.0), (0, 0, 0), hexc(0x5b6572))                                                   # the hull
    m.box((1.2, 0.8, 0.8), (-2.1, 0.75, 0), hexc(0xd8dce4)); m.box((0.7, 0.4, 0.9), (-2.1, 1.3, 0), hexc(0x2a2d36)); m.sphere(0.07, (-2.1, 1.55, 0), hexc(0xff4a3a, 0.9), seg=8)  # bridge
    cols = [0xc8402e, 0x2e6fc8, 0xe0a52e, 0x3fa05a, 0xd8dce4, 0x8a4fc8]
    for i in range(5):
        for j in range(3):
            m.box((0.55, 0.45, 0.45), (-0.9 + i * 0.62, 0.72, -0.5 + j * 0.5), hexc(cols[(i * 3 + j) % len(cols)]))
    m.box((1.0, 0.7, 0.9), (2.3, 0, 0), hexc(0x3c434d))
    for z in (-0.35, 0.35): m.cyl(0.28, 0.2, 0.5, (2.95, 0, z), DARK, rot=(0, math.pi / 2, 0), seg=12); m.cyl(0.18, 0.05, 0.4, (3.3, 0, z), hexc(0x66b8ff, 1.0), rot=(0, math.pi / 2, 0), seg=12)
    m.box((4.4, 0.05, 0.05), (0, -0.55, 0.52), GREY); m.box((4.4, 0.05, 0.05), (0, -0.55, -0.52), GREY)
    return m.finish('freighter')


def miner():
    m = Model()
    m.box((1.6, 0.9, 1.2), (0, 0, 0), hexc(0xe0a52e)); m.box((1.0, 0.5, 1.25), (-0.1, 0.6, 0), hexc(0x2a2d36)); m.box((0.7, 0.4, 0.7), (-0.5, 0.95, 0), hexc(0x9fd8ff, 0.2))
    m.cyl(0.5, 0.05, 1.4, (1.5, 0, 0), hexc(0xb8bcc6), rot=(0, math.pi / 2, 0), seg=14)                    # the drill
    for i in range(4): m.torus(0.5 - i * 0.09, 0.025, (0.9 + i * 0.3, 0, 0), hexc(0x6a7280), seg=16, tseg=4)
    for z in (-1, 1):
        m.box((0.9, 0.12, 0.12), (0.3, -0.25, z * 0.75), GREY, rot=(0, z * 0.4, 0)); m.box((0.3, 0.3, 0.3), (0.85, -0.25, z * 1.05), DARK)
        m.sphere(0.12, (0.95, 0.15, z * 0.55), hexc(0xffe9a0, 1.0), seg=8)
    m.cyl(0.4, 0.4, 0.7, (-1.1, 0, 0), hexc(0x6a7280), rot=(0, math.pi / 2, 0), seg=12); m.sphere(0.1, (-1.5, 0, 0), hexc(0xff9a3a, 1.0), seg=8)
    return m.finish('miner')


def void_whale():
    m = Model()
    m.sphere(1.0, (0, 0, 0), hexc(0x2c6a86), scale=(3.0, 0.95, 1.05), seg=32)                               # the body, nose along +X
    m.sphere(0.8, (-2.2, 0, 0), hexc(0x3b8aa0), scale=(1.4, 0.7, 0.8), seg=20)
    m.cyl(0.55, 0.04, 2.0, (-3.9, 0, 0), hexc(0x3b7aa0), rot=(0, -math.pi / 2, 0), seg=14)                    # the tail
    for s2 in (-1, 1):
        m.box((0.2, 0.05, 1.3), (-4.6, 0, s2 * 0.5), hexc(0x4fa0c0), rot=(0, 0, 0.0))                          # flukes
        m.box((1.1, 0.06, 0.8), (0.6, -0.35, s2 * 1.15), hexc(0x4fa0c0), rot=(0.5 * s2, 0, 0.3))                  # flippers
        m.sphere(0.1, (2.3, 0.2, s2 * 0.75), hexc(0xfff0b0, 0.6), seg=8)                                        # eyes
    m.box((2.0, 0.25, 0.1), (0.2, 0.95, 0), hexc(0x5ab8d0))
    for i in range(14):
        a = i / 14 * math.tau; x = 1.8 - i * 0.38
        for s2 in (-1, 1): m.sphere(0.07, (x, 0.35 - 0.1 * math.sin(a), s2 * 0.98), hexc(0x66ffd9, 1.0), seg=6)    # glowing spots
    return m.finish('void_whale')


def relic():
    m = Model()
    m.cyl(0.7, 0.35, 4.0, (0, 0, 0), hexc(0x2a2540), rot=(0, 0, 0), seg=8)                                   # an obelisk along Z
    m.cyl(0.35, 0.02, 0.7, (0, 0, 2.3), hexc(0x4a3f78), seg=8)
    for i in range(12):
        a = i * 0.9; z = -1.6 + i * 0.28; r2 = 0.55 - (z + 2) * 0.07
        m.box((0.16, 0.05, 0.12), (math.cos(a) * r2, math.sin(a) * r2, z), hexc(0x9fffe0, 1.0), rot=(0, 0, a))  # glowing runes in a spiral
    m.torus(1.6, 0.06, (0, 0, 0.3), hexc(0x9a86ff, 0.8), seg=48, tseg=5); m.torus(2.0, 0.04, (0, 0, -0.5), hexc(0x9a86ff, 0.6), seg=48, tseg=5, scale=(1, 1, 1))
    for i in range(6):
        a = i / 6 * math.tau; m.box((0.2, 0.2, 0.7), (math.cos(a) * 1.9, math.sin(a) * 1.9, -1.9), hexc(0x3a3358))
    return m.finish('relic')


def warp_gate():
    m = Model()
    m.torus(3.0, 0.22, (0, 0, 0), hexc(0x8a93a6), seg=64, tseg=8)
    m.torus(2.75, 0.07, (0, 0, 0), hexc(0x66d8ff, 1.0), seg=64, tseg=5)
    for i in range(8):
        a = i / 8 * math.tau + 0.2; m.box((0.35, 0.5, 0.9), (math.cos(a) * 3.0, math.sin(a) * 3.0, 0), hexc(0xd8dce4), rot=(0, 0, a))
        m.sphere(0.1, (math.cos(a) * 3.0, math.sin(a) * 3.0, 0.5), hexc(0xff5a3a, 1.0), seg=6)
    for s2 in (-1, 1): m.box((0.3, 1.6, 0.3), (s2 * 1.4, -3.3, 0), GREY, rot=(0, 0, s2 * 0.4))
    m.cyl(1.9, 1.9, 0.02, (0, 0, 0), hexc(0x8fe8ff, 0.9), seg=48)                                            # the shimmering surface
    return m.finish('warp_gate')


def refinery():
    m = Model()
    m.sphere(1.3, (0, 0, 0), hexc(0xd8dce4), seg=24)
    m.torus(1.45, 0.07, (0, 0, 0), hexc(0xe0742a), seg=40, tseg=5)
    for i in range(4):
        a = i / 4 * math.tau + 0.4; m.sphere(0.55, (math.cos(a) * 2.2, math.sin(a) * 2.2, -0.2), hexc(0xb8bcc6), seg=16); m.box((1.2, 0.1, 0.1), (math.cos(a) * 1.4, math.sin(a) * 1.4, -0.1), GREY, rot=(0, 0, a))
    m.cyl(0.18, 0.12, 2.6, (0, 0, 2.0), hexc(0x6a7280), seg=10); m.cone = None
    m.sphere(0.32, (0, 0, 3.5), hexc(0xff9a3a, 1.0), scale=(1, 1, 1.8), seg=10)                              # the flare stack's flame
    for i in range(6):
        a = i / 6 * math.tau; m.box((0.08, 0.08, 1.6), (math.cos(a) * 0.9, math.sin(a) * 0.9, 1.2), FRAME)
    m.cyl(0.25, 0.25, 0.6, (0, 0, -1.6), GOLD, seg=10)
    return m.finish('refinery')


def siege_orb():
    m = Model()
    r = m.sphere(2.0, (0, 0, 0), hexc(0xa0a8b8), seg=40)
    for v in r:                                                                                             # latitude bands: a dark trench round the middle, panel stripes
        lat = abs(v.co.z) / 2.0
        v[m.col] = hexc(0x14161c) if lat < 0.07 else hexc(0xc4ccdc) if int(lat * 14) % 2 else hexc(0x939bab)
    m.cyl(0.9, 0.9, 0.25, (1.85, 0.0, 0.9), hexc(0x4a505e), rot=(0, math.pi / 2 - 0.45, 0), seg=24)          # the dish
    m.sphere(0.34, (2.1, 0, 0.95), hexc(0xff3a2a, 1.0), seg=14)                                             # the lens
    for i in range(5):
        a = i / 5 * math.tau; m.cyl(0.12, 0.08, 0.5, (math.cos(a) * 1.5, math.sin(a) * 1.5, -1.1), DARK, rot=(0, 0.5, a), seg=8); m.sphere(0.05, (math.cos(a) * 1.75, math.sin(a) * 1.75, -1.3), hexc(0xffd070, 1.0), seg=6)
    m.cyl(0.04, 0.04, 1.2, (0, 0, 2.5), GREY, seg=6)
    return m.finish('siege_orb')


def crystal_cluster():
    m = Model()
    rr = random.Random(3)
    m.sphere(0.55, (0, 0, 0), hexc(0x3a3358), scale=(1.2, 1.2, 0.6), seg=12)
    cols = [0x66e8ff, 0xb48cff, 0xff7ad8, 0x7affc8]
    for i in range(14):
        a = rr.random() * math.tau; tilt = 0.25 + rr.random() * 0.7; h = 1.0 + rr.random() * 1.6; w = 0.12 + rr.random() * 0.14
        d = (math.sin(tilt) * math.cos(a), math.sin(tilt) * math.sin(a), math.cos(tilt))
        c = hexc(cols[i % 4], 0.55 if i % 2 else 0.0)
        verts = m.cyl(w, 0.01, h, (d[0] * h * 0.5, d[1] * h * 0.5, d[2] * h * 0.5), c, seg=6)
        # tilt the prism along d: rotate its verts about the origin of the shard
        up = Vector((0, 0, 1)); q = up.rotation_difference(Vector(d)); cen = Vector((d[0] * h * 0.5, d[1] * h * 0.5, d[2] * h * 0.5))
        for v in verts: v.co = cen + q @ (v.co - cen)
    return m.finish('crystal_cluster')


def gas_manta():
    m = Model()
    m.sphere(1.0, (0, 0, 0), hexc(0xe8c9a0), scale=(1.6, 0.35, 0.8), seg=24)
    for s2 in (-1, 1):                                                                   # the wings: flat swept triangles
        two_sided(m, ((0.8, 0, s2 * 0.5), (-1.2, 0.0, s2 * 3.6), (-1.9, 0.0, s2 * 0.6)), hexc(0xc98a58))
        two_sided(m, ((-1.2, 0.02, s2 * 3.6), (-1.5, 0.02, s2 * 2.6), (-0.9, 0.02, s2 * 2.8)), hexc(0xffe2a8, 0.7))
        m.sphere(0.07, (1.4, 0.2, s2 * 0.4), hexc(0xfff0c0, 0.9), seg=6)
    m.cyl(0.07, 0.01, 3.0, (-3.0, 0, 0), hexc(0xb87a50), rot=(0, -math.pi / 2, 0), seg=6)    # the tail
    for i in range(6): m.sphere(0.06, (-0.4 - i * 0.2, 0.3, (i - 2.5) * 0.18), hexc(0xffd8a0, 1.0), seg=6)
    return m.finish('gas_manta')


def generation_ship():
    m = Model()
    m.cyl(1.0, 1.0, 5.0, (0, 0, 0), hexc(0x6a7280), rot=(0, math.pi / 2, 0), seg=28)             # the habitat drum along X
    for x in (-2.0, 0.0, 2.0): m.torus(1.3, 0.12, (x, 0, 0), hexc(0xb8bcc6), seg=40, tseg=6, scale=(1, 1, 1))
    for i in range(10):
        a = i / 10 * math.tau
        m.box((3.6, 0.04, 0.12), (0.0, math.cos(a) * 0.92, math.sin(a) * 0.92), hexc(0xfff0b8, 1.0))   # glowing windows
    m.cyl(0.5, 0.8, 1.2, (2.9, 0, 0), hexc(0x3c434d), rot=(0, math.pi / 2, 0), seg=18); m.cyl(0.9, 1.4, 0.8, (-3.1, 0, 0), DARK, rot=(0, math.pi / 2, 0), seg=18)
    m.cyl(0.6, 0.15, 0.7, (-3.7, 0, 0), hexc(0x66b8ff, 1.0), rot=(0, math.pi / 2, 0), seg=14)
    for s2 in (-1, 1):
        for z in (-1, 1): m.box((1.4, 0.04, 0.9), (-0.5, s2 * 1.9, z * 1.4), PANEL)
    return m.finish('generation_ship')


def jellyfish():
    m = Model()
    m.sphere(1.0, (0, 0, 0.4), hexc(0xb88aff, 0.35), scale=(1.0, 1.0, 0.75), seg=24)                  # the bell, open end -Z
    m.sphere(0.55, (0, 0, 0.5), hexc(0xffe0ff, 0.9), scale=(1, 1, 0.8), seg=14)
    for i in range(12):                                                                                 # tentacles: chains of glowing beads
        a = i / 12 * math.tau; L = 6 + (i % 3) * 2
        for k in range(L):
            t = k / L; rad = 0.8 * (1 - 0.5 * t) + 0.12 * math.sin(k * 0.8 + i); z = -0.1 - t * 3.2
            m.sphere(0.07 * (1 - 0.6 * t), (math.cos(a) * rad, math.sin(a) * rad, z), hexc(0x66ffd9 if k % 3 == 0 else 0xd89aff, 0.9 - 0.5 * t), seg=4)
    return m.finish('jellyfish')


def mothership():
    m = Model()
    m.sphere(1.0, (0, 0, 0), hexc(0x9aa3b4), scale=(3.0, 3.0, 0.5), seg=28)                           # the saucer in XY
    m.sphere(0.9, (0, 0, 0.45), hexc(0xd8dce4), scale=(1.0, 1.0, 0.9), seg=24); m.sphere(0.55, (0, 0, 0.8), hexc(0x9fd8ff, 0.4), seg=16)
    m.torus(2.7, 0.08, (0, 0, 0.0), hexc(0xffd070, 1.0), seg=64, tseg=5)
    for i in range(16):
        a = i / 16 * math.tau
        m.sphere(0.1, (math.cos(a) * 2.2, math.sin(a) * 2.2, -0.34), hexc(0x66d8ff if i % 2 else 0xff6a4a, 1.0), seg=6)
    m.cyl(0.9, 0.5, 0.4, (0, 0, -0.5), hexc(0x3c434d), seg=18)
    for i in range(4):
        a = i / 4 * math.tau + 0.4; m.box((0.7, 0.3, 0.2), (math.cos(a) * 1.6, math.sin(a) * 1.6, -0.45), DARK, rot=(0, 0, a))
    return m.finish('mothership')


def nebula_serpent():
    m = Model()
    N = 34
    for i in range(N):
        t = i / (N - 1); x = (0.5 - t) * 9.0; y = math.sin(t * 7.0) * 0.9; rad = 0.55 * (1 - 0.6 * t) * (1.0 + 0.3 * math.sin(t * 20))
        if i == 0: rad = 0.7
        c = hexc(0x2a6a8a if i % 2 else 0x4a3a9a, 0.0)
        m.sphere(rad, (x, y, 0), c, seg=8)
        if i % 3 == 0: m.sphere(rad * 0.45, (x, y, rad * 0.8), hexc(0x66ffd9, 1.0), seg=6)
    m.sphere(0.12, (4.7, 0.2, 0.5), hexc(0xfff0b0, 1.0), seg=8); m.sphere(0.12, (4.7, 0.2, -0.5), hexc(0xfff0b0, 1.0), seg=8)
    for s2 in (-1, 1): m.cyl(0.06, 0.01, 1.1, (4.9, 0.2, s2 * 0.35), hexc(0x8affea, 0.8), rot=(0, 0, s2 * 0.7), seg=6)
    return m.finish('nebula_serpent')


def star_hub():
    m = Model()
    m.sphere(0.9, (0, 0, 0), hexc(0xfff0c0, 1.0), seg=20)
    for R, r in ((2.2, 0.1), (3.4, 0.14), (4.6, 0.1)): m.torus(R, r, (0, 0, 0), hexc(0x9aa3b4), seg=40, tseg=5)
    for i in range(8):
        a = i / 8 * math.tau
        m.box((3.6, 0.07, 0.07), (math.cos(a) * 2.3, math.sin(a) * 2.3, 0), hexc(0xb8bcc6), rot=(0, 0, a))                 # spokes
        m.box((0.6, 0.6, 0.6), (math.cos(a) * 4.6, math.sin(a) * 4.6, 0), hexc(0xd8dce4), rot=(0, 0, a)); m.sphere(0.12, (math.cos(a) * 4.9, math.sin(a) * 4.9, 0.35), hexc(0x66d8ff, 1.0), seg=6)
    m.torus(3.4, 0.05, (0, 0, 0.3), hexc(0xffb050, 1.0), seg=64, tseg=4)
    return m.finish('star_hub')


def cosmic_egg():
    m = Model()
    r = m.sphere(1.0, (0, 0, 0), hexc(0xd8c8f0), scale=(0.9, 0.9, 1.25), seg=36)
    rr = random.Random(9)
    for v in r:                                                                                         # cracks glow along noise lines
        c = hexc(0xe8d8ff); n = math.sin(v.co.x * 9 + v.co.z * 5) * math.sin(v.co.y * 8 - v.co.z * 7)
        if abs(n) < 0.06: c = hexc(0xff9ad8, 1.0)
        elif n > 0.5: c = hexc(0xb8a0e8)
        v[m.col] = c
    for i in range(10):
        a = rr.random() * math.tau; z = rr.uniform(-1, 1) * 1.1; rad = math.sqrt(max(0.0, 1 - (z / 1.25) ** 2)) * 0.9
        m.sphere(0.07, (math.cos(a) * rad * 1.02, math.sin(a) * rad * 1.02, z), hexc(0xffe0a0, 1.0), seg=6)
    return m.finish('cosmic_egg')


def void_eye():
    m = Model()
    m.sphere(1.0, (0, 0, 0), hexc(0xece4f0), seg=28)                                                    # the eyeball, looks along +X
    m.sphere(0.5, (0.78, 0, 0), hexc(0x3a8aff), scale=(0.35, 1, 1), seg=24); m.sphere(0.5, (0.88, 0, 0), hexc(0x4aa8ff, 0.35), scale=(0.18, 1, 1), seg=24)
    m.sphere(0.22, (0.97, 0, 0), hexc(0x04040a), scale=(0.2, 0.55, 1), seg=16)                          # the slit pupil
    for i in range(18):
        a = i / 18 * math.tau; m.box((0.02, 0.5, 0.03), (0.74 + 0.0, math.cos(a) * 0.55, math.sin(a) * 0.55), hexc(0x8ad0ff, 0.7), rot=(a, 0, 0))
    for i in range(36):                                                                                # veins
        a = i * 2.4; b = 0.6 + (i % 7) * 0.12
        m.sphere(0.03, (-0.3 + math.cos(b) * 0.9, math.sin(a) * math.sin(b) * 0.9, math.cos(a) * math.sin(b) * 0.9), hexc(0xd85a6a), seg=4)
    return m.finish('void_eye')


def solar_sail():
    m = Model()
    for i in range(4):
        a = i / 4 * math.tau + 0.4; c, sn = math.cos(a), math.sin(a)
        two_sided(m, ((0, 0, 0), (c * 4.0 - sn * 1.1, sn * 4.0 + c * 1.1, 0), (c * 4.0 + sn * 1.1, sn * 4.0 - c * 1.1, 0)), hexc(0xffd890, 0.45))
        m.box((4.1, 0.05, 0.05), (c * 2.0, sn * 2.0, 0), hexc(0xb8bcc6), rot=(0, 0, a))
    m.box((0.5, 0.5, 0.4), (0, 0, 0), GOLD); m.sphere(0.12, (0, 0, 0.3), hexc(0xff5a3a, 1.0), seg=8)
    return m.finish('solar_sail')


def asteroid_base():
    m = Model()
    rr = random.Random(5)
    r = m.sphere(1.0, (0, 0, 0), hexc(0x7a7168), scale=(1.5, 1.1, 1.0), seg=24)
    for v in r:
        n = math.sin(v.co.x * 7) * math.sin(v.co.y * 6 + v.co.z * 4); v.co *= 1 + 0.12 * n; v[m.col] = hexc(0x8a7f74) if n > 0 else hexc(0x5e564e)
    m.cyl(0.4, 0.4, 0.9, (1.6, 0, 0.5), hexc(0xd8dce4), rot=(0, math.pi / 2, 0), seg=12); m.torus(0.5, 0.06, (1.0, 0, 0.5), hexc(0xb8bcc6), seg=24, tseg=4, scale=(1, 1, 1))
    for s2 in (-1, 1): m.box((1.3, 0.03, 0.8), (0.0, s2 * 1.5, 0.7), PANEL); m.box((0.06, 0.06, 0.5), (0.0, s2 * 1.1, 0.6), FRAME)
    for i in range(10):
        a = rr.random() * math.tau; z = rr.uniform(-0.4, 0.8); m.sphere(0.06, (math.cos(a) * 1.2, math.sin(a) * 0.9, z + 0.5), hexc(0xffe9a0, 1.0), seg=4)
    m.box((0.08, 0.08, 1.2), (-0.8, 0.0, 1.3), GREY); m.sphere(0.07, (-0.8, 0, 1.95), hexc(0xff4a3a, 1.0), seg=6)
    return m.finish('asteroid_base')


MODELS = [crystal_cluster, gas_manta, generation_ship, jellyfish, mothership, nebula_serpent, star_hub, cosmic_egg, void_eye, solar_sail, asteroid_base, freighter, miner, void_whale, relic, warp_gate, refinery, siege_orb, telescope, probe, sat_comm, station, capsule, rocket_stage, monolith, ringworld, neutron_star, dyson]
scn = bpy.data.scenes.new('space_props'); win = bpy.context.window; old = win.scene if win else None
try:
    if win: win.scene = scn
    out = []
    for fn in MODELS:
        me = fn(); ob = bpy.data.objects.new(me.name, me); scn.collection.objects.link(ob)
        for o in scn.objects: o.select_set(False)
        ob.select_set(True)
        path = os.path.join(OUT, me.name + '.glb')
        kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='NONE')
        try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
        except TypeError: bpy.ops.export_scene.gltf(**kw)
        out.append((me.name, len(me.polygons), os.path.getsize(path)))
        scn.collection.objects.unlink(ob); bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    print(out)
finally:
    if win and old: win.scene = old
    bpy.data.scenes.remove(scn)
