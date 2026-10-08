"""Bake a periodic crossing-wave RGBA8 normal volume through Blender MCP."""
import bpy, json, math, os
from array import array

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
size, depth = 128, 16
source = os.path.join(root, 'public/textures/water/water-detail.png')
out = os.path.dirname(os.path.abspath(__file__))
raw_path = os.path.join(out, 'water-normal-volume-128x128x16.rgba8')
atlas_path = os.path.join(out, 'water-normal-volume-atlas.png')
blend_path = os.path.join(out, 'water-normal-volume.blend')

# Integer spatial and temporal frequencies make all three volume axes periodic.
# Different directions/speeds create crossings and evolving interference.
waves = ((2, 1, 1.00, 1, 0.0), (-1, 3, 0.72, -2, 0.9),
         (4, -2, 0.48, 3, 2.2), (3, 4, 0.27, -1, 4.1))

img = bpy.data.images.load(source, check_existing=False)
img.colorspace_settings.name = 'Non-Color'
src_w, src_h = img.size
src = array('f', [0.0]) * (src_w * src_h * 4)
img.pixels.foreach_get(src)

def alpha_at(x, y):
    # Bilinear resampling keeps the existing crest mask stable in every slice.
    fx, fy = (x + 0.5) * src_w / size - 0.5, (y + 0.5) * src_h / size - 0.5
    x0, y0 = math.floor(fx), math.floor(fy)
    tx, ty = fx - x0, fy - y0
    x0 %= src_w; y0 %= src_h
    x1, y1 = (x0 + 1) % src_w, (y0 + 1) % src_h
    a = src[(y0 * src_w + x0) * 4 + 3]; b = src[(y0 * src_w + x1) * 4 + 3]
    c = src[(y1 * src_w + x0) * 4 + 3]; d = src[(y1 * src_w + x1) * 4 + 3]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty

heights = [0.0] * (depth * size * size)
for z in range(depth):
    phase_t = math.tau * z / depth
    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            i = (z * size + y) * size + x
            heights[i] = sum(a * math.sin(math.tau * (kx * u + ky * v) + speed * phase_t + phase)
                             for kx, ky, a, speed, phase in waves)

slopes = [(0.0, 0.0)] * (depth * size * size)
for z in range(depth):
    for y in range(size):
        ym, yp = (y - 1) % size, (y + 1) % size
        for x in range(size):
            xm, xp = (x - 1) % size, (x + 1) % size
            i = (z * size + y) * size + x
            dx = (heights[(z * size + y) * size + xp] - heights[(z * size + y) * size + xm]) * size * 0.5
            dy = (heights[(z * size + yp) * size + x] - heights[(z * size + ym) * size + x]) * size * 0.5
            slopes[i] = (dx, dy)

# Match the existing normal texture's decoded slope RMS after the same 128x128 resampling.
target_sq = 0.0
for y in range(size):
    for x in range(size):
        fx, fy = (x + 0.5) * src_w / size - 0.5, (y + 0.5) * src_h / size - 0.5
        ix, iy = max(0, min(src_w - 1, round(fx))), max(0, min(src_h - 1, round(fy)))
        j = (iy * src_w + ix) * 4
        nz = max(src[j + 2] * 2 - 1, 0.4)
        sx, sy = (src[j] * 2 - 1) / nz, (src[j + 1] * 2 - 1) / nz
        target_sq += sx * sx + sy * sy
target_rms = math.sqrt(target_sq / (2 * size * size))
raw_sq = sum(x * x + y * y for x, y in slopes[:size * size])
gain = target_rms / math.sqrt(raw_sq / (2 * size * size))

bytes_out = bytearray(depth * size * size * 4)
atlas = array('f', [0.0]) * len(bytes_out)
for z in range(depth):
    for y in range(size):
        for x in range(size):
            i = (z * size + y) * size + x
            dx, dy = slopes[i]
            nx, ny = -dx * gain, -dy * gain
            inv = 1 / math.sqrt(nx * nx + ny * ny + 1)
            rgba = (0.5 + 0.5 * nx * inv, 0.5 + 0.5 * ny * inv, 0.5 + 0.5 * inv, alpha_at(x, y))
            j = i * 4
            for c, value in enumerate(rgba):
                q = max(0, min(255, round(value * 255)))
                bytes_out[j + c] = q
                atlas[j + c] = q / 255

with open(raw_path, 'wb') as f:
    f.write(bytes_out)

# Store a slice atlas and a slice-zero material preview in the .blend for inspection.
image = bpy.data.images.new('VOID • crossing water normal volume • 16 slices', size, size * depth, alpha=True, float_buffer=False)
image.colorspace_settings.name = 'Non-Color'
image.alpha_mode = 'CHANNEL_PACKED'
atlas_rows = array('f', [0.0]) * len(atlas)
for z in range(depth):
    for y in range(size):
        src_off = (z * size + y) * size * 4
        dst_off = (z * size + y) * size * 4
        atlas_rows[dst_off:dst_off + size * 4] = atlas[src_off:src_off + size * 4]
image.pixels.foreach_set(atlas_rows)
image.filepath_raw = atlas_path
image.file_format = 'PNG'
image.save()
image.pack()

preview = bpy.data.images.new('VOID • crossing water normal volume • slice 0', size, size, alpha=True, float_buffer=False)
preview.colorspace_settings.name = 'Non-Color'
preview.alpha_mode = 'CHANNEL_PACKED'
preview.pixels.foreach_set(atlas[:size * size * 4])
preview.pack()
mat = bpy.data.materials.new('VOID • crossing-wave water normal volume preview')
mat.use_nodes = True
nodes, links = mat.node_tree.nodes, mat.node_tree.links
nodes.clear()
out_node = nodes.new('ShaderNodeOutputMaterial')
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
bsdf.inputs['Base Color'].default_value = (0.016, 0.13, 0.17, 1)
bsdf.inputs['Roughness'].default_value = 0.16
tex = nodes.new('ShaderNodeTexImage'); tex.image = preview; tex.label = 'Slice 0 (atlas above stores all 16 periodic slices)'
nrm = nodes.new('ShaderNodeNormalMap'); links.new(tex.outputs['Color'], nrm.inputs['Color'])
links.new(nrm.outputs['Normal'], bsdf.inputs['Normal']); links.new(bsdf.outputs['BSDF'], out_node.inputs['Surface'])
mesh = bpy.data.meshes.new('Water normal volume preview plane')
mesh.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
mesh.update(); mesh.uv_layers.new()
for i, uv in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))): mesh.uv_layers.active.uv[i].vector = uv
obj = bpy.data.objects.new('VOID crossing-wave water volume preview', mesh); obj.data.materials.append(mat)
coll = bpy.data.collections.new('VOID Water Normal Volume Candidate'); coll.objects.link(obj)
coll['water_volume_dimensions'] = '128x128x16 RGBA8, x-fastest, z is loop phase'
coll['water_volume_wave_components'] = json.dumps(waves)
coll['water_volume_source_alpha'] = os.path.relpath(source, root)
bpy.data.libraries.write({coll}, blend_path, fake_user=True, compress=True)

# Read encoded output back and report decoded slopes, finite normals, and seam continuity.
decoded_sq, count, magnitudes = 0.0, 0, []
for i in range(depth * size * size):
    j = i * 4
    nx, ny, nz = (bytes_out[j + k] / 127.5 - 1 for k in range(3))
    nz = max(nz, 0.4)
    sx, sy = nx / nz, ny / nz
    decoded_sq += sx * sx + sy * sy; count += 2
    if not all(math.isfinite(v) for v in (nx, ny, nz, sx, sy)):
        raise ValueError('non-finite decoded normal')
    magnitudes.append(math.hypot(sx, sy))
if any(bytes_out[z * size * size * 4 + i] != bytes_out[i]
       for z in range(1, depth) for i in range(size * size * 4)
       if i % 4 == 3):
    raise ValueError('crest alpha differs between temporal slices')
def channel_step(a, b, channel):
    return max(abs(bytes_out[a * 4 + channel] - bytes_out[b * 4 + channel]) for channel in range(3))
spatial_seams, temporal_steps = {}, []
for axis in ('x', 'y'):
    seam, interior = [], []
    for z in range(depth):
        for y in range(size):
            for x in range(size):
                i = (z * size + y) * size + x
                j = (z * size + y) * size + ((x + 1) % size) if axis == 'x' else (z * size + ((y + 1) % size)) * size + x
                (seam if (x == size - 1 if axis == 'x' else y == size - 1) else interior).append(channel_step(i, j, 0))
                if x == 0 and y == 0:
                    temporal_steps.append(channel_step(i, (((z + 1) % depth) * size * size), 0))
    if max(seam) > max(interior):
        raise ValueError(f'{axis} spatial seam exceeds interior step')
    spatial_seams[axis] = {'seam_max': max(seam), 'interior_max': max(interior)}
candidate_rms = math.sqrt(decoded_sq / count)
print(json.dumps({'raw': raw_path, 'atlas': atlas_path, 'blend': blend_path,
                  'dimensions': [size, size, depth], 'raw_bytes': len(bytes_out),
                  'stable_alpha_across_slices': True, 'finite_decoded_normals': True,
                  'slope_rms_target': target_rms, 'slope_rms_candidate': candidate_rms,
                  'slope_rms_delta_percent': 100 * (candidate_rms / target_rms - 1),
                  'decoded_slope_magnitude_p99': sorted(magnitudes)[int(0.99 * (len(magnitudes) - 1))],
                  'spatial_rgb_steps': spatial_seams,
                  'temporal_corner_rgb_steps': temporal_steps}))
