"""Bake a seamless, shallow-water caustic tile by tracing refracted sun rays in Blender MCP."""
import bpy, math, os
from array import array

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
size, rays, tile, depth = 128, 512, 8.0, 1.1
png = os.path.join(root, 'public/textures/terrain/caustics.png')
library = os.path.join(root, 'art/caustics.blend')
os.makedirs(os.path.dirname(png), exist_ok=True)
old = bpy.data.collections.get('VOID Shallow Water Caustics')
if old:
    for obj in list(old.objects): bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(old, do_unlink=True)
for data, name in ((bpy.data.materials, 'VOID • caustic reference'), (bpy.data.images, 'VOID • refracted shallow-water caustics')):
    item = data.get(name)
    if item: data.remove(item, do_unlink=True)

# Periodic low-amplitude waves make a physically projected caustic distribution,
# not a hand-painted cellular mask. The 8 m tile closes exactly at its edges.
waves = ((0.10, 3, 0, 0.4), (0.075, 3, 3, 2.1), (0.045, 5, -3, 4.0), (0.03, 6, 4, 1.3))
accum = [0.0] * (size * size)
sun_x, sun_z = 0.19, -0.13
sun_y = -math.sqrt(1.0 - sun_x * sun_x - sun_z * sun_z)
eta = 1.0 / 1.333
for j in range(rays):
    z = (j + 0.5) * tile / rays
    for i in range(rays):
        x = (i + 0.5) * tile / rays
        dx = dz = 0.0
        for amp, kx, kz, phase in waves:
            angle = math.tau * (kx * x + kz * z) / tile + phase
            dx += amp * math.tau * kx / tile * math.cos(angle)
            dz += amp * math.tau * kz / tile * math.cos(angle)
        nx, ny, nz = -dx, 1.0, -dz
        inv_n = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
        nx, ny, nz = nx * inv_n, ny * inv_n, nz * inv_n
        dot_ni = nx * sun_x + ny * sun_y + nz * sun_z
        k = 1.0 - eta * eta * (1.0 - dot_ni * dot_ni)
        if k <= 0.0:
            continue
        q = eta * dot_ni + math.sqrt(k)
        rx, ry, rz = eta * sun_x - q * nx, eta * sun_y - q * ny, eta * sun_z - q * nz
        if ry >= -1e-5:
            continue
        t = -depth / ry
        u = ((x + rx * t) % tile) * size / tile - 0.5
        v = ((z + rz * t) % tile) * size / tile - 0.5
        x0, y0 = math.floor(u), math.floor(v)
        fx, fy = u - x0, v - y0
        for ox, oy, w in ((0, 0, (1-fx)*(1-fy)), (1, 0, fx*(1-fy)), (0, 1, (1-fx)*fy), (1, 1, fx*fy)):
            accum[((y0 + oy) % size) * size + ((x0 + ox) % size)] += w

mean = sum(accum) / len(accum)
pixels = array('f', [0.0]) * (size * size * 4)
for i, energy in enumerate(accum):
    # Preserve only focused illumination; shader gain is separately capped at 1.6.
    value = max(0.0, min(1.0, (energy / max(mean, 1e-6) - 0.82) * 2.8))
    k = i * 4
    pixels[k:k+4] = array('f', (value, value, value, 1.0))

image = bpy.data.images.new('VOID • refracted shallow-water caustics', width=size, height=size, alpha=False, float_buffer=False)
image.colorspace_settings.name = 'Non-Color'
image.pixels.foreach_set(pixels)
image.filepath_raw, image.file_format = png, 'PNG'
image.save()
image.pack()

mat = bpy.data.materials.new('VOID • caustic reference')
mat.use_nodes = True
nodes, links = mat.node_tree.nodes, mat.node_tree.links
nodes.clear()
out = nodes.new('ShaderNodeOutputMaterial')
emission = nodes.new('ShaderNodeEmission')
tex = nodes.new('ShaderNodeTexImage')
tex.image = image
tex.extension = 'REPEAT'
links.new(tex.outputs['Color'], emission.inputs['Color'])
links.new(emission.outputs['Emission'], out.inputs['Surface'])
mesh = bpy.data.meshes.new('Caustic tile preview mesh')
mesh.from_pydata([(-tile/2, -tile/2, 0), (tile/2, -tile/2, 0), (tile/2, tile/2, 0), (-tile/2, tile/2, 0)], [], [(0, 1, 2, 3)])
uv = mesh.uv_layers.new()
for loop, coord in zip(uv.data, ((0,0), (1,0), (1,1), (0,1))): loop.uv = coord
obj = bpy.data.objects.new('Refracted caustic tile reference', mesh)
obj.data.materials.append(mat)
collection = bpy.data.collections.new('VOID Shallow Water Caustics')
collection.objects.link(obj)
bpy.data.libraries.write(library, {collection}, fake_user=True, compress=True)
print({'texture': png, 'size': size, 'tile_m': tile, 'bed_depth_m': depth, 'ray_count': rays*rays,
       'mean_energy': mean, 'library': library})
