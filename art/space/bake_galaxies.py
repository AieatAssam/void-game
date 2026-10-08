# Bakes the Phase 4 galaxy sprites in Blender (docs/PHASE4.md): four 256x256 top-down emission renders (spiral, barred spiral, elliptical, irregular) packed 2x2 into a 512x512 atlas.
# RGB is premultiplied light (the game draws them additively and tints them per instance), so alpha is not stored.
# Run inside Blender (MCP execute_blender_code):  exec(open('/Users/aieat/hole-game/art/space/bake_galaxies.py').read())
import bpy, numpy as np, os, math

OUT = '/Users/aieat/hole-game/public/textures/space/galaxies.png'
S = 256
SEED = 5


def build_material(kind):
    m = bpy.data.materials.new(f'gal_{kind}'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    tc = N('ShaderNodeTexCoord'); out = N('ShaderNodeOutputMaterial'); em = N('ShaderNodeEmission'); tr = N('ShaderNodeBsdfTransparent'); mix = N('ShaderNodeMixShader')

    def math_(op, a, b=None, clamp=False):
        n = N('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: L(v, n.inputs[i])
        return n.outputs[0]

    def noise(scale, detail=4.0, rough=0.55, vec=None, w=0.0):
        n = N('ShaderNodeTexNoise'); n.noise_dimensions = '4D'; n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough; n.inputs['W'].default_value = w
        L(vec or tc.outputs['Generated'], n.inputs['Vector']); return n.outputs['Fac']

    def voronoi(scale):
        v = N('ShaderNodeTexVoronoi'); v.voronoi_dimensions = '3D'; v.feature = 'F1'; v.inputs['Scale'].default_value = scale; L(tc.outputs['Generated'], v.inputs['Vector']); return v.outputs['Distance']

    def ramp(x, stops):
        r = N('ShaderNodeValToRGB'); L(x, r.inputs['Fac']); e = r.color_ramp.elements
        while len(e) > len(stops): e.remove(e[-1])
        while len(e) < len(stops): e.new(0.5)
        for el, (p, v) in zip(e, stops): el.position = p; el.color = (v, v, v, 1)
        return r.outputs['Color']

    sub = N('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; L(tc.outputs['Generated'], sub.inputs[0]); sub.inputs[1].default_value = (0.5, 0.5, 0)
    sep = N('ShaderNodeSeparateXYZ'); L(sub.outputs['Vector'], sep.inputs['Vector'])
    x = math_('MULTIPLY', sep.outputs['X'], 2.0); y = math_('MULTIPLY', sep.outputs['Y'], 2.0)
    r = math_('SQRT', math_('ADD', math_('MULTIPLY', x, x), math_('MULTIPLY', y, y)))
    th = math_('ARCTAN2', y, x)
    edge = ramp(math_('SUBTRACT', 1.0, r), [(0.0, 0.0), (0.18 if kind != 'irregular' else 0.5, 1.0)])           # fades to nothing at the rim of the tile
    lr = math_('LOGARITHM', math_('MAXIMUM', r, 0.02), math.e)
    stars = ramp(voronoi(60.0), [(0.0, 1.0), (0.12, 0.0)])
    turb = noise(7.0, 6, 0.6, w=SEED)
    if kind == 'spiral' or kind == 'barred':
        k = 3.1 if kind == 'spiral' else 2.2
        phase = math_('ADD', math_('MULTIPLY', th, 2.0), math_('MULTIPLY', lr, -k * 2.0 if kind == 'spiral' else -k * 2.4))
        arms = math_('POWER', math_('ADD', math_('MULTIPLY', math_('COSINE', math_('ADD', phase, math_('MULTIPLY', math_('SUBTRACT', turb, 0.5), 2.6))), 0.5), 0.5), 2.2)
        disk = math_('MULTIPLY', math_('POWER', math_('SUBTRACT', 1.0, math_('MINIMUM', r, 1.0)), 2.2), math_('ADD', 0.12, math_('MULTIPLY', arms, 0.95)))
        bulge = math_('MULTIPLY', ramp(math_('SUBTRACT', 1.0, math_('MULTIPLY', r, 3.2)), [(0.0, 0.0), (1.0, 1.0)]), 1.1)
        dens = math_('ADD', disk, bulge)
        if kind == 'barred':
            bx = math_('ADD', math_('MULTIPLY', x, 0.9), math_('MULTIPLY', y, 0.25)); by = math_('SUBTRACT', math_('MULTIPLY', y, 0.9), math_('MULTIPLY', x, 0.25))
            bar = math_('EXPONENT', math_('MULTIPLY', math_('ADD', math_('MULTIPLY', math_('MULTIPLY', bx, bx), 5.5), math_('MULTIPLY', math_('MULTIPLY', by, by), 150.0)), -1.0))  # a soft gaussian bar
            dens = math_('ADD', dens, math_('MULTIPLY', bar, 0.6))
        lanes = ramp(noise(11.0, 5, 0.6, w=SEED + 2), [(0.42, 1.0), (0.62, 0.35)])
        dens = math_('MULTIPLY', dens, math_('ADD', 0.35, math_('MULTIPLY', lanes, 0.65)))
        warm = ramp(math_('SUBTRACT', 1.0, math_('MULTIPLY', r, 2.4)), [(0.0, 0.0), (1.0, 1.0)])
    elif kind == 'elliptical':
        dens = math_('ADD', math_('POWER', math_('SUBTRACT', 1.0, math_('MINIMUM', r, 1.0)), 3.2), math_('MULTIPLY', ramp(math_('SUBTRACT', 1.0, math_('MULTIPLY', r, 4.0)), [(0.0, 0.0), (1.0, 1.0)]), 0.9))
        dens = math_('MULTIPLY', dens, math_('ADD', 0.85, math_('MULTIPLY', math_('SUBTRACT', turb, 0.5), 0.5)))
        warm = ramp(math_('SUBTRACT', 1.0, math_('MULTIPLY', r, 1.2)), [(0.0, 0.5), (1.0, 1.0)])
    else:  # irregular / dwarf: a handful of clumps
        clump = ramp(noise(3.6, 6, 0.65, w=SEED + 4), [(0.38, 0.0), (0.7, 1.0)])
        dens = math_('MULTIPLY', math_('MULTIPLY', clump, 1.3), math_('EXPONENT', math_('MULTIPLY', math_('MULTIPLY', r, r), -3.2)))
        warm = ramp(noise(5.0, 3, 0.5, w=SEED + 6), [(0.3, 0.0), (0.7, 0.8)])
    dens = math_('MULTIPLY', math_('ADD', dens, math_('MULTIPLY', math_('MULTIPLY', stars, dens), 1.4)), edge)
    dens = math_('MINIMUM', dens, 1.6)
    # colour: warm core, blue-white arms
    col = N('ShaderNodeMix'); col.data_type = 'RGBA'; L(warm, col.inputs['Factor']); col.inputs['A'].default_value = (0.55, 0.72, 1.0, 1); col.inputs['B'].default_value = (1.0, 0.82, 0.55, 1)
    mult = N('ShaderNodeVectorMath'); mult.operation = 'SCALE'; L(col.outputs['Result'], mult.inputs[0]); L(dens, mult.inputs['Scale'])
    L(mult.outputs['Vector'], em.inputs['Color']); em.inputs['Strength'].default_value = 1.0
    L(math_('MINIMUM', dens, 1.0), mix.inputs['Fac']); L(tr.outputs['BSDF'], mix.inputs[1]); L(em.outputs['Emission'], mix.inputs[2]); L(mix.outputs['Shader'], out.inputs['Surface'])
    return m


def render_tile(kind):
    scn = bpy.data.scenes.new(f'gal_{kind}'); scn.render.engine = 'CYCLES'
    scn.cycles.samples = 4; scn.cycles.use_denoising = False; scn.cycles.device = 'CPU'
    scn.render.resolution_x = S; scn.render.resolution_y = S; scn.render.resolution_percentage = 100; scn.render.film_transparent = True
    scn.view_settings.view_transform = 'Standard'; scn.view_settings.look = 'None'; scn.display_settings.display_device = 'sRGB'
    scn.render.image_settings.file_format = 'PNG'; scn.render.image_settings.color_mode = 'RGBA'
    cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 2.0
    co = bpy.data.objects.new('cam', cam); scn.collection.objects.link(co); scn.camera = co; co.location = (0, 0, 5)
    me = bpy.data.meshes.new('p'); me.from_pydata([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [], [(0, 1, 2, 3)]); me.update()
    uvl = me.uv_layers.new(name='UV')
    for l, uvp in zip(me.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]): uvl.data[l.index].uv = uvp
    ob = bpy.data.objects.new('plane', me); scn.collection.objects.link(ob); ob.data.materials.append(build_material(kind))
    path = f'/private/tmp/space_gal_{kind}.png'; scn.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scn.name)
    img = bpy.data.images.load(path); a = np.array(img.pixels[:], dtype=np.float32).reshape(S, S, 4); bpy.data.images.remove(img)
    for o in (ob, co): bpy.data.objects.remove(o)
    bpy.data.meshes.remove(me); bpy.data.cameras.remove(cam); bpy.data.scenes.remove(scn)
    return a


def write_png(path, rgb):
    import zlib, struct
    a = (np.clip(rgb[::-1], 0, 1) * 255 + 0.5).astype(np.uint8)
    raw = b''.join(b'\x00' + a[y].tobytes() for y in range(a.shape[0]))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', a.shape[1], a.shape[0], 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


tiles = [render_tile(k) for k in ('spiral', 'barred', 'elliptical', 'irregular')]
atlas = np.zeros((S * 2, S * 2, 3), np.float32)
for i, t in enumerate(tiles):
    cx, cy = i % 2, i // 2
    atlas[cy * S:(cy + 1) * S, cx * S:(cx + 1) * S] = t[..., :3]   # premultiplied light
write_png(OUT, atlas)
for m in [m for m in bpy.data.materials if m.name.startswith('gal_')]: bpy.data.materials.remove(m)
print('baked', OUT, os.path.getsize(OUT), [float(t[..., :3].mean()) for t in tiles])
