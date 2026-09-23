"""Shared helpers for building Toybox Town assets. See ART.md.

Every asset script defines build() -> root object, built at the origin with its bottom at z=0.
run(name) clears the asset's collection, builds, exports to assets-raw/<name>.glb, then parks
the result on a display grid so the Blender scene doubles as a showroom.
"""
import bpy, bmesh, math, os, importlib, sys
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets-raw')
COLS, ROWS, PX = 8, 4, 16
# Detail multiplier for LOD0. Curves get more segments, bevels more steps. The optimizer derives
# LOD1 (~25%) and LOD2 (~8%) from these, so raising Q only costs triangles up close.
Q = 1.6


def q(n):
    return n if n < 8 else round(n * Q)  # < 8 = deliberate facets (hex nuts, pyramids)

PALETTE = [
    [('cream', 'F3E9D2'), ('white', 'FFF8EE'), ('sand', 'E6CFA7'), ('clay', 'C98B5B'),
     ('terracotta', 'D96C4F'), ('brick', 'A8483A'), ('asphalt', '3E4150'), ('asphalt_lt', '5A5E70')],
    [('mint', '9ED9BF'), ('sage', '6DB08E'), ('forest', '3F7F5E'), ('sky', '8EC5E8'),
     ('teal', '3E9CA8'), ('butter', 'F7D774'), ('peach', 'F5AE8A'), ('pink', 'F29BB2')],
    [('red', 'E4473C'), ('police', '2F5DA8'), ('navy', '1E2A4A'), ('olive', '7B8B4A'),
     ('concrete', 'B8B2A7'), ('steel', '8C94A3'), ('ink', '22222A'), ('hazard', 'F2C230')],
    # Row 3 is emissive: the emissive atlas lights these swatches only.
    [('glow', 'FFE7A3'), ('siren_red', 'FF3B3B'), ('siren_blue', '3B8BFF'), ('toxic', '7CFF6B'),
     ('lilac', 'B58CFF'), ('void', '1A0F3A'), ('warn', 'FF8A3D'), ('glow_white', 'FFFFFF')],
]
SWATCH = {n: (c, r) for r, row in enumerate(PALETTE) for c, (n, _) in enumerate(row)}


def _hex(h):
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def _atlas(name, emissive):
    img = bpy.data.images.get(name)
    if img and tuple(img.size) == (COLS * PX, ROWS * PX):
        return img
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, COLS * PX, ROWS * PX, alpha=False)
    px = [0.0] * (COLS * PX * ROWS * PX * 4)
    for r, row in enumerate(PALETTE):
        for c, (_, h) in enumerate(row):
            rgb = _hex(h) if (not emissive or r == 3) else [0, 0, 0]
            for y in range((ROWS - 1 - r) * PX, (ROWS - r) * PX):
                for x in range(c * PX, (c + 1) * PX):
                    i = (y * COLS * PX + x) * 4
                    px[i:i + 4] = rgb + [1.0]
    img.pixels = px
    img.filepath_raw = os.path.join(ROOT, 'public', name + '.png')
    img.file_format = 'PNG'
    os.makedirs(os.path.dirname(img.filepath_raw), exist_ok=True)
    img.save()
    return img


def material():
    mat = bpy.data.materials.get('Toy')
    if mat:
        return mat
    mat = bpy.data.materials.new('Toy')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    for img, sock in ((_atlas('palette', False), 'Base Color'), (_atlas('palette_emit', True), 'Emission Color')):
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.interpolation = 'Closest'
        nt.links.new(tex.outputs['Color'], bsdf.inputs[sock])
    bsdf.inputs['Emission Strength'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.55
    return mat


def uv_of(color):
    c, r = SWATCH[color]
    return ((c + 0.5) / COLS, (ROWS - 1 - r + 0.5) / ROWS)


# ---------- collections ----------
_current = None


def coll():
    return _current or bpy.context.scene.collection


def begin(name):
    global _current
    old = bpy.data.collections.get(name)
    if old:
        for ob in list(old.all_objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(old)
    _current = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(_current)
    return _current


# ---------- mesh building ----------
def _obj(name, bm, color, loc, rot, scale=(1, 1, 1)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    coll().objects.link(ob)
    ob.location, ob.rotation_euler, ob.scale = loc, rot, scale
    me.materials.append(material())
    if color:
        paint(ob, color)
    return ob


def paint(ob, color, faces=None):
    """Point face UVs at a palette swatch. faces: optional predicate(face) -> bool."""
    me = ob.data
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    u = uv_of(color)
    for p in me.polygons:
        if faces is None or faces(p):
            for li in p.loop_indices:
                uv.data[li].uv = u
    return ob


def bevel(ob, width, seg=3, angle=None):
    m = ob.modifiers.new('bevel', 'BEVEL')
    m.width, m.segments = width, seg if seg <= 1 else seg + 1
    m.limit_method = 'ANGLE' if angle else 'NONE'
    if angle:
        m.angle_limit = math.radians(angle)
    m.profile = 0.5
    apply_mods(ob)
    return ob


def apply_mods(ob):
    if not ob.modifiers:
        return ob
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def box(name, size, loc=(0, 0, 0), color='cream', bev=None, seg=3, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = _obj(name, bm, color, loc, rot)
    b = min(size) * 0.08 if bev is None else bev
    return bevel(ob, b, seg) if b > 0 else ob


def cyl(name, r, h, loc=(0, 0, 0), color='cream', seg=32, bev=None, bseg=3, rot=(0, 0, 0), r2=None):
    """Cylinder/cone standing on its base at loc (loc is base center)."""
    bm = bmesh.new()
    seg = q(seg)
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=bm.verts)
    ob = _obj(name, bm, color, loc, rot)
    b = min(r, h) * 0.12 if bev is None else bev
    return bevel(ob, b, bseg, angle=40) if b > 0 else ob


def sphere(name, r, loc=(0, 0, 0), color='cream', seg=24, scale=(1, 1, 1), rot=(0, 0, 0)):
    bm = bmesh.new()
    seg = q(seg)
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    return _obj(name, bm, color, loc, rot, scale)


def torus(name, R, r, loc=(0, 0, 0), color='cream', seg=32, rseg=12, rot=(0, 0, 0)):
    seg, rseg = q(seg), q(rseg)
    bm = bmesh.new()
    grid = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            d = R + r * math.cos(b)
            ring.append(bm.verts.new((d * math.cos(a), d * math.sin(a), r * math.sin(b))))
        grid.append(ring)
    for i in range(seg):
        for j in range(rseg):
            bm.faces.new((grid[i][j], grid[(i + 1) % seg][j], grid[(i + 1) % seg][(j + 1) % rseg], grid[i][(j + 1) % rseg]))
    return _obj(name, bm, color, loc, rot)


def lathe(name, profile, loc=(0, 0, 0), color='cream', seg=32, rot=(0, 0, 0)):
    """Revolve [(radius, z), ...] around Z. Great for hydrants, lamps, bottles."""
    seg = q(seg)
    bm = bmesh.new()
    rings = []
    for (rr, z) in profile:
        rings.append([bm.verts.new((rr * math.cos(2 * math.pi * i / seg), rr * math.sin(2 * math.pi * i / seg), z))
                      for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        if ring[0].co.xy.length > 1e-4:
            f = bm.faces.new(ring[::-1] if flip else ring)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, color, loc, rot)


def mesh(name, verts, faces, color='cream', loc=(0, 0, 0), rot=(0, 0, 0)):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, color, loc, rot)


def prism(name, w, d, h, loc=(0, 0, 0), color='terracotta', rot=(0, 0, 0), bev=0.06):
    """Gable roof: triangle (width w along Y, height h) extruded length d along X, base at loc."""
    x, y = d / 2, w / 2
    ob = mesh(name, [(-x, -y, 0), (-x, y, 0), (-x, 0, h), (x, -y, 0), (x, y, 0), (x, 0, h)],
              [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], color, loc, rot)
    return bevel(ob, bev, 2) if bev else ob


def join(parts, name):
    """Merge parts into one mesh object (one draw call). Returns the new object."""
    bpy.context.view_layer.update()  # fresh objects without modifiers have stale matrix_world
    bm = bmesh.new()
    for p in parts:
        apply_mods(p)
        me = p.data.copy()
        me.transform(p.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    for p in parts:
        bpy.data.objects.remove(p, do_unlink=True)
    return _obj(name, bm, None, (0, 0, 0), (0, 0, 0))


def bounds(ob):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in [ob] + list(ob.children_recursive) if o.type == 'MESH' for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def finish(ob, tier=None, mass=None, kind='prop', smooth_angle=35, **extra):
    """Smooth shading + weighted normals, metadata for the game.
    tier (footprint radius, m) and mass (growth value) default to values measured from the model."""
    for o in [ob] + list(ob.children_recursive):
        if o.type != 'MESH':
            continue
        o.data.shade_smooth()
        o.data.set_sharp_from_angle(angle=math.radians(smooth_angle))
        wn = o.modifiers.new('wn', 'WEIGHTED_NORMAL')
        wn.keep_sharp = True
        apply_mods(o)
    lo, hi = bounds(ob)
    d = hi - lo
    if tier is None:
        tier = round(0.5 * max(d.x, d.y), 3)
    if mass is None:
        mass = round(d.x * d.y * d.z * 0.4, 3)
    ob['tier'], ob['mass'], ob['kind'] = float(tier), float(mass), kind
    ob['height'] = round(d.z, 3)
    for k, v in extra.items():
        ob[k] = v
    return ob


def parent(child, root):
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = root
    child.matrix_world = mw
    return child


# ---------- animation ----------
def _name_action(ob, name):
    """Give ob's action an exact name (stale actions from earlier builds would force a .001 suffix)."""
    act = ob.animation_data.action
    old = bpy.data.actions.get(name)
    if old and old != act:
        bpy.data.actions.remove(old)
    act.name = name

def spin(ob, axis='Z', frames=24, turns=1, name=None):
    """Seamless looping spin clip on ob."""
    prefs = bpy.context.preferences.edit
    old = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = 'LINEAR'
    i = 'XYZ'.index(axis)
    base = ob.rotation_euler[i]
    ob.keyframe_insert('rotation_euler', index=i, frame=0)
    ob.rotation_euler[i] = base + 2 * math.pi * turns
    ob.keyframe_insert('rotation_euler', index=i, frame=frames)
    ob.rotation_euler[i] = base
    prefs.keyframe_new_interpolation_type = old
    if name and ob.animation_data and ob.animation_data.action:
        _name_action(ob, name)
    return ob


def keys(ob, path, frames_values, name=None, interp='BEZIER'):
    """frames_values: [(frame, value_tuple_or_float), ...]"""
    prefs = bpy.context.preferences.edit
    old = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = interp
    for f, v in frames_values:
        setattr(ob, path, v)
        ob.keyframe_insert(path, frame=f)
    prefs.keyframe_new_interpolation_type = old
    if name and ob.animation_data and ob.animation_data.action:
        _name_action(ob, name)
    return ob


# ---------- export ----------
def tris(ob):
    n = 0
    for o in [ob] + list(ob.children_recursive):
        if o.type == 'MESH':
            n += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return n


def export(root, name):
    os.makedirs(RAW, exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in [root] + list(root.children_recursive):
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    path = os.path.join(RAW, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_extras=True,
                              export_apply=True, export_animations=True, export_yup=True)
    return path


def focus(*names):
    """Frame named objects in the viewport (material preview, no selection outline) for screenshots."""
    for o in bpy.context.view_layer.objects:
        o.select_set(bool(o.name in names or (o.parent and o.parent.name in names)))
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces[0].shading.type = 'MATERIAL'
            area.spaces[0].overlay.show_overlays = False
            region = next(r for r in area.regions if r.type == 'WINDOW')
            with bpy.context.temp_override(area=area, region=region):
                bpy.ops.view3d.view_selected()
    for o in bpy.context.view_layer.objects:
        o.select_set(False)


def run(name, grid=(0, 0)):
    """Build blender/assets/<name>.py, export, park on the showroom grid."""
    sys.path.insert(0, os.path.join(ROOT, 'blender', 'assets'))
    for dep in ('kit', 'peg'):
        if dep in sys.modules:
            importlib.reload(sys.modules[dep])
    mod = importlib.import_module(name)
    importlib.reload(mod)
    begin('A_' + name)
    root = mod.build()
    root.name = name
    path = export(root, name)
    root.location = (grid[0] * 12, grid[1] * 12, 0)
    return {'name': name, 'tris': tris(root), 'bytes': os.path.getsize(path),
            'tier': root.get('tier'), 'kind': root.get('kind')}


def run_all(names, cols=8):
    out = []
    for i, n in enumerate(names):
        try:
            out.append(run(n, (i % cols, i // cols)))
        except Exception as e:
            import traceback
            out.append({'name': n, 'error': traceback.format_exc(limit=3)})
    return out
