"""Run through Blender MCP execute_blender_code. Writes a short-crest packet trial."""
import bpy, math, os, json, random
from array import array

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
size = 256
source = os.path.join(root, 'public/textures/water/water-detail.png')
out = os.path.join(root, 'art/candidates')
os.makedirs(out, exist_ok=True)
png = os.path.join(out, 'water-detail-packets-short.png')
library = os.path.join(root, 'art/water-material-packets-short.blend')

# Keep this trial in its own Blender datablocks and library.
for old in [c for c in bpy.data.collections if c.name.startswith('VOID Water Packet Short Trial')]:
    for obj in list(old.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(old, do_unlink=True)
for mat in [m for m in bpy.data.materials if m.name.startswith('VOID • short packet coastal water')]:
    bpy.data.materials.remove(mat, do_unlink=True)
for image in [im for im in bpy.data.images if im.name.startswith('VOID • short packet water normal + crest')]:
    bpy.data.images.remove(image, do_unlink=True)
for mesh in [m for m in bpy.data.meshes if m.name.startswith('Water short packet preview') and m.users == 0]:
    bpy.data.meshes.remove(mesh)

img = bpy.data.images.load(source, check_existing=False)
img.name = 'VOID • short packet water normal + crest'
img.colorspace_settings.name = 'Non-Color'
img.alpha_mode = 'CHANNEL_PACKED'
pixels = array('f', [0.0]) * (size * size * 4)
img.pixels.foreach_get(pixels)

# The UV tile spans 200 m. A jittered 8x8 layout fixes seed, coverage and packet count.
tile = 200.0
step = tile / size
rng = random.Random(20261005)
packets = []
wind_angle = 0.0
for gy in range(8):
    for gx in range(8):
        cx, cz = (gx + rng.random()) * tile / 8, (gy + rng.random()) * tile / 8
        angle = wind_angle + math.radians(rng.uniform(-20, 20))
        packets.append((cx, cz, angle, 0.75 + rng.random() * 0.5, rng.random() * math.tau))
height = array('f', [0.0]) * (size * size)
for cx0, cz0, angle, amp, phase in packets:
    ca, sa = math.cos(angle), math.sin(angle)
    extent_x = 6.0 * math.hypot(9.0 * ca, 8.0 * sa)
    extent_z = 6.0 * math.hypot(9.0 * sa, 8.0 * ca)
    for tx in (-1, 0, 1):
        cx = cx0 + tx * tile
        x0, x1 = max(0, int((cx - extent_x) / step) - 1), min(size - 1, int((cx + extent_x) / step) + 1)
        for tz in (-1, 0, 1):
            cz = cz0 + tz * tile
            y0, y1 = max(0, int((cz - extent_z) / step) - 1), min(size - 1, int((cz + extent_z) / step) + 1)
            for y in range(y0, y1 + 1):
                pz = (y + 0.5) * step
                for x in range(x0, x1 + 1):
                    px = (x + 0.5) * step
                    ox, oz = px - cx, pz - cz
                    along, across = ox * ca + oz * sa, -ox * sa + oz * ca
                    radius2 = (along / 9.0) ** 2 + (across / 8.0) ** 2
                    if radius2 <= 36.0:  # six sigma; omitted Gaussian tails are below 2e-8
                        i = y * size + x
                        height[i] += amp * math.exp(-0.5 * radius2) * math.cos(math.tau * across / 12.0 + phase)

# Wrapped central derivatives preserve periodicity at the tile boundary.
dx = array('f', [0.0]) * (size * size)
dz = array('f', [0.0]) * (size * size)
for y in range(size):
    ym, yp = (y - 1) % size, (y + 1) % size
    for x in range(size):
        xm, xp = (x - 1) % size, (x + 1) % size
        i = y * size + x
        dx[i] = (height[y * size + xp] - height[y * size + xm]) / (2.0 * step)
        dz[i] = (height[yp * size + x] - height[ym * size + x]) / (2.0 * step)

# Match the old shader-decoded RMS of x/z slopes, using the same 0.4 z floor.
target_sq = raw_sq = 0.0
target_slopes = []
for i in range(size * size):
    j = i * 4
    nz = max(2.0 * pixels[j + 2] - 1.0, 0.4)
    sx = (2.0 * pixels[j] - 1.0) / nz
    sz = (2.0 * pixels[j + 1] - 1.0) / nz
    target_sq += sx * sx + sz * sz
    target_slopes.append(math.hypot(sx, sz))
    raw_sq += dx[i] * dx[i] + dz[i] * dz[i]
target_rms = math.sqrt(target_sq / (2 * size * size))
raw_rms = math.sqrt(raw_sq / (2 * size * size))
gain = target_rms / raw_rms
limited = 0
limit = 0.445
for i in range(size * size):
    j = i * 4
    sx, sz = dx[i] * gain, dz[i] * gain
    magnitude = math.hypot(sx, sz)
    if magnitude > limit:
        limited += 1
        sx, sz = sx * limit / magnitude, sz * limit / magnitude
    nx, ny = -sx, -sz
    inv = 1.0 / math.sqrt(nx * nx + ny * ny + 1.0)
    pixels[j] = 0.5 + 0.5 * nx * inv
    pixels[j + 1] = 0.5 + 0.5 * ny * inv
    pixels[j + 2] = 0.5 + 0.5 * inv

img.pixels.foreach_set(pixels)
img.filepath_raw = png
img.file_format = 'PNG'
img.save()
img.pack()
assert img.packed_file is not None

limited_percent = 100.0 * limited / (size * size)
assert limited_percent <= 5.0, f'{limited_percent:.3f}% of texels hit the slope limit'
mat = bpy.data.materials.new('VOID • short packet coastal water')
mat.use_nodes = True
nodes, links = mat.node_tree.nodes, mat.node_tree.links
nodes.clear()
out_node = nodes.new('ShaderNodeOutputMaterial')
p = nodes.new('ShaderNodeBsdfPrincipled')
p.inputs['Base Color'].default_value = (0.016, 0.13, 0.17, 1)
p.inputs['Roughness'].default_value = 0.16
p.inputs['IOR'].default_value = 1.333
links.new(p.outputs['BSDF'], out_node.inputs['Surface'])
tex = nodes.new('ShaderNodeTexImage')
tex.image = img
tex.location = (-500, 50)
tex.label = 'Seamless short packet normal RGB / preserved crest A'
nrm = nodes.new('ShaderNodeNormalMap')
nrm.location = (-230, 50)
nrm.inputs['Strength'].default_value = 0.65
links.new(tex.outputs['Color'], nrm.inputs['Color'])
links.new(nrm.outputs['Normal'], p.inputs['Normal'])

mesh = bpy.data.meshes.new('Water short packet preview')
mesh.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
mesh.update()
mesh.uv_layers.new()
for i, uv in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
    mesh.uv_layers.active.uv[i].vector = uv
obj = bpy.data.objects.new('VOID short packet water material preview', mesh)
obj.data.materials.append(mat)
collection = bpy.data.collections.new('VOID Water Packet Short Trial')
collection.objects.link(obj)
bpy.data.libraries.write(library, {collection}, fake_user=True, compress=True)

# Re-read the quantized candidate through Blender's own decoder for a useful MCP result.
check = bpy.data.images.load(png, check_existing=False)
check.colorspace_settings.name = 'Non-Color'
check_pixels = array('f', [0.0]) * (size * size * 4)
check.pixels.foreach_get(check_pixels)
actual_sq = 0.0
candidate_slopes = []
alpha_delta = 0.0
for i in range(size * size):
    j = i * 4
    nz = max(2.0 * check_pixels[j + 2] - 1.0, 0.4)
    sx = (2.0 * check_pixels[j] - 1.0) / nz
    sz = (2.0 * check_pixels[j + 1] - 1.0) / nz
    actual_sq += sx * sx + sz * sz
    candidate_slopes.append(math.hypot(sx, sz))
    alpha_delta = max(alpha_delta, abs(check_pixels[j + 3] - pixels[j + 3]))
actual_rms = math.sqrt(actual_sq / (2 * size * size))
target_p99 = sorted(target_slopes)[math.ceil(0.99 * len(target_slopes)) - 1]
candidate_p99 = sorted(candidate_slopes)[math.ceil(0.99 * len(candidate_slopes)) - 1]
assert abs(actual_rms / target_rms - 1) <= 0.05
assert candidate_p99 <= 0.467416
assert alpha_delta == 0.0
bpy.data.images.remove(check)
print(json.dumps({'texture': png, 'size': [size, size], 'bytes': os.path.getsize(png),
                  'library': library, 'collection': collection.name,
                  'packed_image': img.packed_file is not None,
                  'limited_texel_percent': limited_percent,
                  'slope_rms_target': target_rms, 'slope_rms_candidate': actual_rms,
                  'slope_rms_delta_percent': 100.0 * (actual_rms / target_rms - 1.0),
                  'slope_p99_target': target_p99, 'slope_p99_candidate': candidate_p99,
                  'slope_p99_limit': 0.467416, 'alpha_float_delta': alpha_delta}))
