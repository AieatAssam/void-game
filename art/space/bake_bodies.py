# Bakes the Phase 4 body textures (docs/PHASE4.md) in Blender: four seamless equirect patterns, packed into one 1024x512 atlas (2x2 tiles of 512x256).
# Each tile stores PATTERNS, not colours: R = albedo pattern 0..1 (the game maps it between two tint colours per body), G = fine detail / height, B = a mask (rim, cloud, storm, spot).
# Run inside Blender (MCP execute_blender_code):  exec(open('/Users/aieat/hole-game/art/space/bake_bodies.py').read())
# Works in its own temporary scene and removes it afterwards; the open scene is untouched.
import bpy, numpy as np, os

OUT = '/Users/aieat/hole-game/public/textures/space/bodies.png'
W, H = 512, 256
SEED = 11


def build_material(kind):
    m = bpy.data.materials.new(f'bake_{kind}'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    N = nt.nodes.new; L = nt.links.new
    tc = N('ShaderNodeTexCoord'); out = N('ShaderNodeOutputMaterial'); em = N('ShaderNodeEmission')
    comb = N('ShaderNodeCombineColor')

    def noise(scale, detail=4.0, rough=0.5, w=0.0, vec=None, dim='3D'):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = dim; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        if 'W' in n.inputs: n.inputs['W'].default_value = w
        L(vec or tc.outputs['Object'], n.inputs['Vector']); return n

    def math(op, a, b=None, clamp=False):
        n = N('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: L(v, n.inputs[i])
        return n.outputs[0]

    def ramp(x, stops):
        r = N('ShaderNodeValToRGB'); L(x, r.inputs['Fac']); e = r.color_ramp.elements
        while len(e) > len(stops): e.remove(e[-1])
        while len(e) < len(stops): e.new(0.5)
        for el, (p, v) in zip(e, stops): el.position = p; el.color = (v, v, v, 1)
        return r.outputs['Color']

    def sep(vec):
        s = N('ShaderNodeSeparateXYZ'); L(vec, s.inputs['Vector']); return s

    def mapped(vec, sx, sy, sz, off=(0, 0, 0)):
        mp = N('ShaderNodeMapping'); L(vec, mp.inputs['Vector'])
        mp.inputs['Scale'].default_value = (sx, sy, sz); mp.inputs['Location'].default_value = off; return mp.outputs['Vector']

    def voronoi(scale, feature='F1', metric='euclidean'):
        v = N('ShaderNodeTexVoronoi'); v.voronoi_dimensions = '3D'; v.feature = feature; v.distance = metric.upper(); v.inputs['Scale'].default_value = scale; v.inputs['Randomness'].default_value = 1.0
        L(tc.outputs['Object'], v.inputs['Vector']); return v

    if kind == 'rock':
        base = noise(2.2, 6, 0.55, SEED)
        fine = noise(14, 5, 0.6, SEED + 3)
        c1 = voronoi(3.2); c2 = voronoi(7.5); c3 = voronoi(17.0)
        def crater(v, r):
            pit = math('SUBTRACT', 1.0, ramp(v.outputs['Distance'], [(0.0, 0.0), (r, 1.0)]))   # 1 in the pit, 0 outside
            rim = ramp(v.outputs['Distance'], [(r * 0.8, 0.0), (r * 1.08, 1.0), (r * 1.5, 0.0)])
            return pit, rim
        p1, r1 = crater(c1, 0.34); p2, r2 = crater(c2, 0.32); p3, r3 = crater(c3, 0.3)
        pits = math('MAXIMUM', math('MAXIMUM', p1, math('MULTIPLY', p2, 0.8)), math('MULTIPLY', p3, 0.6))
        rims = math('MAXIMUM', math('MAXIMUM', r1, math('MULTIPLY', r2, 0.8)), math('MULTIPLY', r3, 0.6))
        albedo = math('ADD', math('MULTIPLY', ramp(base.outputs['Fac'], [(0.3, 0.1), (0.7, 0.9)]), 0.75), math('MULTIPLY', math('SUBTRACT', 1.0, pits), 0.25))
        height = math('SUBTRACT', math('ADD', math('MULTIPLY', fine.outputs['Fac'], 0.35), math('MULTIPLY', rims, 0.5)), math('MULTIPLY', pits, 0.6))
        r, g, b = albedo, math('ADD', height, 0.4, clamp=True), math('MAXIMUM', rims, pits)
    elif kind == 'world':
        warp = noise(3.0, 3, 0.5, SEED + 5)
        wv = N('ShaderNodeVectorMath'); wv.operation = 'ADD'; L(tc.outputs['Object'], wv.inputs[0]); L(warp.outputs['Color'], wv.inputs[1])
        land = noise(1.7, 7, 0.55, SEED + 7, vec=wv.outputs['Vector'])
        mount = noise(7, 6, 0.6, SEED + 9)
        landmask = ramp(land.outputs['Fac'], [(0.5, 0.0), (0.53, 1.0)])
        # latitude: polar caps and a hazy equator
        sz = sep(tc.outputs['Object']); lat = math('ABSOLUTE', sz.outputs['Z'])
        cap = ramp(math('ADD', lat, math('MULTIPLY', math('SUBTRACT', warp.outputs['Fac'], 0.5), 0.3)), [(0.78, 0.0), (0.9, 1.0)])
        cl = noise(2.6, 6, 0.55, SEED + 13, vec=mapped(tc.outputs['Object'], 1.0, 1.0, 3.0))
        clouds = ramp(cl.outputs['Fac'], [(0.5, 0.0), (0.72, 1.0)])
        r = math('ADD', math('MULTIPLY', landmask, 0.85), math('MULTIPLY', math('SUBTRACT', mount.outputs['Fac'], 0.5), 0.2))
        g = math('ADD', math('MULTIPLY', mount.outputs['Fac'], 0.6), math('MULTIPLY', landmask, 0.3))
        b = math('MAXIMUM', cap, math('MULTIPLY', clouds, 0.85))
    elif kind == 'giant':
        sz = sep(tc.outputs['Object'])
        turb = noise(2.4, 5, 0.6, SEED + 17, vec=mapped(tc.outputs['Object'], 1.0, 1.0, 2.2))
        warp = math('MULTIPLY', math('SUBTRACT', turb.outputs['Fac'], 0.5), 1.1)
        band = math('ADD', math('MULTIPLY', math('SINE', math('ADD', math('MULTIPLY', sz.outputs['Z'], 21.0), math('MULTIPLY', warp, 5.5))), 0.5), 0.5)
        band2 = math('ADD', math('MULTIPLY', math('SINE', math('ADD', math('MULTIPLY', sz.outputs['Z'], 47.0), math('MULTIPLY', warp, 9.0))), 0.5), 0.5)
        fine = noise(9, 5, 0.6, SEED + 19, vec=mapped(tc.outputs['Object'], 1.0, 1.0, 7.0))
        # a great storm at lon 0.6 rad, lat -0.3
        st = N('ShaderNodeVectorMath'); st.operation = 'DISTANCE'; L(tc.outputs['Object'], st.inputs[0]); st.inputs[1].default_value = (0.82, 0.48, -0.30)
        storm = math('SUBTRACT', 1.0, ramp(math('MULTIPLY', st.outputs['Value'], 3.2), [(0.0, 0.0), (0.7, 1.0)]))
        r = math('ADD', math('MULTIPLY', band, 0.62), math('MULTIPLY', math('MULTIPLY', band2, math('SUBTRACT', fine.outputs['Fac'], 0.2)), 0.5))
        g = math('ADD', fine.outputs['Fac'], 0.0); b = storm
    else:  # star: granulation, sunspots
        g1 = voronoi(34.0, 'F1'); g2 = voronoi(70.0, 'F1')
        nz = noise(5.0, 5, 0.6, SEED + 23)
        gran = math('ADD', math('MULTIPLY', ramp(g1.outputs['Distance'], [(0.0, 1.0), (0.7, 0.0)]), 0.6), math('MULTIPLY', ramp(g2.outputs['Distance'], [(0.0, 1.0), (0.7, 0.0)]), 0.3))
        spots = ramp(nz.outputs['Fac'], [(0.62, 0.0), (0.7, 1.0)])
        r = math('ADD', math('MULTIPLY', gran, 0.7), math('MULTIPLY', math('SUBTRACT', nz.outputs['Fac'], 0.5), 0.3))
        g = math('ADD', gran, 0.0); b = spots
    L(r, comb.inputs[0]); L(g, comb.inputs[1]); L(b, comb.inputs[2])
    L(comb.outputs['Color'], em.inputs['Color']); L(em.outputs['Emission'], out.inputs['Surface'])
    return m


def render_tile(kind):
    scn = bpy.data.scenes.new(f'bake_{kind}')
    try:
        scn.render.engine = 'CYCLES'
    except Exception as e:
        raise RuntimeError(f'Cycles unavailable: {e}')
    scn.cycles.samples = 1; scn.cycles.use_denoising = False; scn.cycles.device = 'CPU'
    scn.render.resolution_x = W; scn.render.resolution_y = H; scn.render.resolution_percentage = 100
    scn.render.film_transparent = False; scn.render.filter_size = 0.0 if hasattr(scn.render, 'filter_size') else 1.0
    scn.view_settings.view_transform = 'Standard'; scn.view_settings.look = 'None'; scn.display_settings.display_device = 'sRGB'
    scn.render.image_settings.file_format = 'PNG'; scn.render.image_settings.color_mode = 'RGB'; scn.render.image_settings.color_depth = '8'
    cam = bpy.data.cameras.new('c'); cam.type = 'PANO'
    try: cam.panorama_type = 'EQUIRECTANGULAR'
    except Exception: cam.cycles.panorama_type = 'EQUIRECTANGULAR'
    co = bpy.data.objects.new('cam', cam); scn.collection.objects.link(co); scn.camera = co
    co.rotation_euler = (1.5707963, 0, 0)   # looks along +Y with Z up: equirect centre at lon 0 = +Y... the game maps lon = atan2(z,x) so rotate in code
    me = bpy.data.meshes.new('s'); import bmesh
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=1.0); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('sphere', me); scn.collection.objects.link(ob)
    ob.data.materials.append(build_material(kind))
    path = f'/private/tmp/space_{kind}.png'
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scn.name)
    img = bpy.data.images.load(path); a = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4); bpy.data.images.remove(img)
    # cleanup
    for o in (ob, co): bpy.data.objects.remove(o)
    bpy.data.meshes.remove(me); bpy.data.cameras.remove(cam); bpy.data.scenes.remove(scn)
    return a


tiles = [render_tile(k) for k in ('rock', 'world', 'giant', 'star')]
for t in tiles:  # stretch R and G to the full range (2nd..98th percentile): the game maps them between tints, so contrast lives here
    for c in (0, 1):
        lo, hi = np.percentile(t[..., c], (2, 98)); t[..., c] = np.clip((t[..., c] - lo) / max(hi - lo, 1e-4), 0, 1)
atlas = np.zeros((H * 2, W * 2, 4), np.float32); atlas[..., 3] = 1
for i, t in enumerate(tiles):
    cx, cy = i % 2, i // 2
    atlas[cy * H:(cy + 1) * H, cx * W:(cx + 1) * W] = t   # Blender images are bottom-up: row 0 = bottom
atlas[..., 3] = 1.0


def write_png(path, rgba):  # (Blender's own image save wrote zeros here: encode the PNG directly, rows top-down)
    import zlib, struct
    a = (np.clip(rgba[::-1, :, :3], 0, 1) * 255 + 0.5).astype(np.uint8)
    raw = b''.join(b'\x00' + a[y].tobytes() for y in range(a.shape[0]))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', a.shape[1], a.shape[0], 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


write_png(OUT, atlas)
for m in [m for m in bpy.data.materials if m.name.startswith('bake_')]: bpy.data.materials.remove(m)
print('baked', OUT, os.path.getsize(OUT), [float(t[..., :3].mean()) for t in tiles])
