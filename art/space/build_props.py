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
    m.torus(1.5, 0.03, (0, 0, 0), hexc(0x9ac0ff, 1.0), seg=64, tseg=5, scale=(1, 1, 1))
    m.torus(2.4, 0.02, (0, 0, 0), hexc(0x7aa0ff, 0.8), seg=64, tseg=5)
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


MODELS = [sat_comm, station, capsule, rocket_stage, monolith, ringworld, neutron_star, dyson]
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
