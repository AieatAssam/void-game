"""Run through Blender MCP execute_blender_code. Writes a reversible water normal trial."""
import bpy, math, os, json
from array import array

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
size = 256
source = os.path.join(root, 'public/textures/water/water-detail.png')
out = os.path.join(root, 'art/candidates')
os.makedirs(out, exist_ok=True)
png = os.path.join(out, 'water-detail-sharp.png')
library = os.path.join(root, 'art/water-material-sharp.blend')

# Rebuild this library on reruns so datablock names and packed contents stay stable.
for old in [c for c in bpy.data.collections if c.name.startswith('VOID Water Material Library')]:
    for obj in list(old.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(old, do_unlink=True)
for mat in [m for m in bpy.data.materials if m.name.startswith('VOID • coastal water')]:
    bpy.data.materials.remove(mat, do_unlink=True)
for image in [im for im in bpy.data.images if im.name.startswith('VOID • sharp water normal + crest')]:
    bpy.data.images.remove(image, do_unlink=True)
for mesh in [m for m in bpy.data.meshes if m.name.startswith('Water preview') and m.users == 0]:
    bpy.data.meshes.remove(mesh)

img = bpy.data.images.load(source, check_existing=False)
img.name = 'VOID • sharp water normal + crest'
img.colorspace_settings.name = 'Non-Color'
img.alpha_mode = 'CHANNEL_PACKED'
pixels = array('f', [0.0]) * (size * size * 4)
img.pixels.foreach_get(pixels)

# Reviewer frequencies keep the texture at normal-map scale; the stronger aligned
# vectors set the swell direction and the crossing vector breaks parallel ridges.
waves = ((5, 2, 1.0, 0.0), (9, 4, 0.52, 0.7), (14, 6, 0.3, 1.4), (-2, 5, 0.22, 2.1))
crest_power = 2.5
height = array('f', [0.0]) * (size * size)
for y in range(size):
    v = (y + 0.5) / size
    for x in range(size):
        u = (x + 0.5) / size
        warp = 0.18 * math.sin(math.tau * (u + v)) + 0.08 * math.sin(math.tau * (2 * u - v))
        height[y * size + x] = sum(a * max(0.0, math.sin(math.tau * (kx * u + ky * v) + phase + warp)) ** crest_power
                                   for kx, ky, a, phase in waves)

# Wrapped central derivatives preserve periodicity at the tile boundary.
dx = array('f', [0.0]) * (size * size)
dz = array('f', [0.0]) * (size * size)
for y in range(size):
    ym, yp = (y - 1) % size, (y + 1) % size
    for x in range(size):
        xm, xp = (x - 1) % size, (x + 1) % size
        i = y * size + x
        dx[i] = (height[y * size + xp] - height[y * size + xm]) * size * 0.5
        dz[i] = (height[yp * size + x] - height[ym * size + x]) * size * 0.5

# Match the old shader-decoded RMS of x/z slopes, using the same 0.4 z floor.
target_sq = raw_sq = 0.0
for i in range(size * size):
    j = i * 4
    nz = max(2.0 * pixels[j + 2] - 1.0, 0.4)
    sx = (2.0 * pixels[j] - 1.0) / nz
    sz = (2.0 * pixels[j + 1] - 1.0) / nz
    target_sq += sx * sx + sz * sz
    raw_sq += dx[i] * dx[i] + dz[i] * dz[i]
target_rms = math.sqrt(target_sq / (2 * size * size))
raw_rms = math.sqrt(raw_sq / (2 * size * size))
gain = target_rms / raw_rms
for i in range(size * size):
    j = i * 4
    nx, ny = -dx[i] * gain, -dz[i] * gain
    inv = 1.0 / math.sqrt(nx * nx + ny * ny + 1.0)
    pixels[j] = 0.5 + 0.5 * nx * inv
    pixels[j + 1] = 0.5 + 0.5 * ny * inv
    pixels[j + 2] = 0.5 + 0.5 * inv

img.pixels.foreach_set(pixels)
img.filepath_raw = png
img.file_format = 'PNG'
img.save()
img.pack()

mat = bpy.data.materials.new('VOID • coastal water')
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
tex.label = 'Seamless sharp normal RGB / preserved crest A'
nrm = nodes.new('ShaderNodeNormalMap')
nrm.location = (-230, 50)
nrm.inputs['Strength'].default_value = 0.65
links.new(tex.outputs['Color'], nrm.inputs['Color'])
links.new(nrm.outputs['Normal'], p.inputs['Normal'])

mesh = bpy.data.meshes.new('Water preview')
mesh.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
mesh.update()
mesh.uv_layers.new()
for i, uv in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
    mesh.uv_layers.active.uv[i].vector = uv
obj = bpy.data.objects.new('VOID water material preview', mesh)
obj.data.materials.append(mat)
collection = bpy.data.collections.new('VOID Water Material Library')
collection.objects.link(obj)
bpy.data.libraries.write(library, {collection}, fake_user=True, compress=True)

# Re-read the quantized candidate through Blender's own decoder for a useful MCP result.
check = bpy.data.images.load(png, check_existing=False)
check_pixels = array('f', [0.0]) * (size * size * 4)
check.pixels.foreach_get(check_pixels)
actual_sq = 0.0
for i in range(size * size):
    j = i * 4
    nz = max(2.0 * check_pixels[j + 2] - 1.0, 0.4)
    sx = (2.0 * check_pixels[j] - 1.0) / nz
    sz = (2.0 * check_pixels[j + 1] - 1.0) / nz
    actual_sq += sx * sx + sz * sz
actual_rms = math.sqrt(actual_sq / (2 * size * size))
bpy.data.images.remove(check)
print(json.dumps({'texture': png, 'size': [size, size], 'bytes': os.path.getsize(png),
                  'library': library, 'collection': collection.name,
                  'slope_rms_target': target_rms, 'slope_rms_candidate': actual_rms,
                  'slope_rms_delta_percent': 100.0 * (actual_rms / target_rms - 1.0)}))
