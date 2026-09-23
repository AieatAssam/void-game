"""Composite parts shared by several assets (wheels, vehicles, windows, trees)."""
from lib import *


def wheel(name, r, w, x, y, z=None, tire='ink', hub='steel'):
    """Wheel with axle along Y centered at (x, y, z). Returns parts list."""
    z = r if z is None else z
    rot = (math.pi / 2, 0, 0)
    side = 1 if y >= 0 else -1
    out = [cyl(name, r, w, loc=(x, y + w / 2, z), color=tire, rot=rot, bev=r * 0.28, seg=28),
           cyl(name + 'h', r * 0.52, w * 1.08, loc=(x, y + w * 0.54, z), color=hub, rot=rot, seg=20, bev=r * 0.1),
           cyl(name + 'cap', r * 0.18, w * 1.16, loc=(x, y + w * 0.58, z), color='white', rot=rot, seg=12, bev=r * 0.05)]
    if r > 0.15:  # tread blocks + hub bolts on anything bigger than a toy-dog wheel
        for k in range(14):
            a = k * 2 * math.pi / 14
            out.append(box(f'{name}t{k}', (r * 0.2, w * 0.9, r * 0.08), loc=(x + math.cos(a) * r * 0.98, y, z + math.sin(a) * r * 0.98),
                           color=tire, bev=r * 0.03, seg=1, rot=(0, -a + math.pi / 2, 0)))
        for k in range(5):
            a = k * 2 * math.pi / 5
            out.append(sphere(f'{name}b{k}', r * 0.05, loc=(x + math.cos(a) * r * 0.34, y + side * w * 0.56, z + math.sin(a) * r * 0.34), color='steel', seg=8))
    return out


def wheels(L, W, r, w, xs=None, tire='ink', hub='steel'):
    xs = xs or (L * 0.32, -L * 0.32)
    out = []
    for i, x in enumerate(xs):
        for s in (-1, 1):
            out += wheel(f'w{i}{s}', r, w, x, s * (W / 2 - w * 0.35), tire=tire, hub=hub)
    return out


def car(L, W, body, roof=None, glass='sky', cabin=0.52, cabin_x=-0.15, H=0.62, ch=0.6, r=0.42):
    """Toy car: chunky body, glass cabin, roof slab, bumpers, lights, 4 fat wheels. Returns parts."""
    z0 = r * 0.7
    roof = roof or body
    p = [
        box('body', (L, W, H), loc=(0, 0, z0 + H / 2), color=body, bev=0.2),
        box('glass', (L * cabin, W * 0.84, ch), loc=(L * cabin_x, 0, z0 + H + ch / 2 - 0.05), color=glass, bev=0.12),
        box('roof', (L * cabin + 0.12, W * 0.9, 0.14), loc=(L * cabin_x, 0, z0 + H + ch - 0.02), color=roof, bev=0.06),
        box('bump_f', (0.22, W * 0.96, 0.26), loc=(L / 2, 0, z0 + 0.14), color='steel', bev=0.09),
        box('bump_r', (0.22, W * 0.96, 0.26), loc=(-L / 2, 0, z0 + 0.14), color='steel', bev=0.09),
    ]
    for s in (-1, 1):
        p.append(cyl(f'hl{s}', 0.14, 0.08, loc=(L / 2 - 0.02, s * W * 0.32, z0 + H * 0.62), color='glow', rot=(0, math.pi / 2, 0), seg=16, bev=0.02))
        p.append(torus(f'hlr{s}', 0.15, 0.025, loc=(L / 2 + 0.05, s * W * 0.32, z0 + H * 0.62), color='steel', seg=20, rseg=6, rot=(0, math.pi / 2, 0)))
        p.append(box(f'tl{s}', (0.06, 0.3, 0.14), loc=(-L / 2, s * W * 0.34, z0 + H * 0.65), color='siren_red', bev=0.02))
        p.append(box(f'mirror{s}', (0.12, 0.18, 0.1), loc=(L * (cabin_x + cabin / 2) + 0.05, s * (W / 2 + 0.06), z0 + H + 0.05), color=body, bev=0.03))
        # chrome side trim, door seam, handle
        p.append(box(f'trim{s}', (L * 0.86, 0.03, 0.05), loc=(0, s * (W / 2 + 0.005), z0 + H * 0.35), color='steel', bev=0.012, seg=1))
        p.append(box(f'seam{s}', (0.025, 0.02, H * 0.8), loc=(L * (cabin_x + 0.02), s * (W / 2 + 0.004), z0 + H * 0.55), color='ink', bev=0, seg=1))
        p.append(box(f'handle{s}', (0.16, 0.03, 0.04), loc=(L * (cabin_x + 0.1), s * (W / 2 + 0.01), z0 + H * 0.75), color='steel', bev=0.01, seg=1))
        # wheel arches: body-coloured half rings over each wheel
        for x in (L * 0.32, -L * 0.32):
            p.append(torus(f'arch{s}{x}', r * 1.12, 0.07, loc=(x, s * (W / 2 - 0.02), r), color=body, seg=24, rseg=8, rot=(math.pi / 2, 0, 0)))
    # grille, plates, roof rails
    p.append(box('grille', (0.06, W * 0.42, H * 0.36), loc=(L / 2 + 0.01, 0, z0 + H * 0.5), color='steel', bev=0.02))
    for i in range(4):
        p.append(box(f'slot{i}', (0.07, W * 0.38, 0.025), loc=(L / 2 + 0.02, 0, z0 + H * 0.38 + i * 0.07), color='ink', bev=0, seg=1))
    for sx in (1, -1):
        p.append(box(f'plate{sx}', (0.03, 0.44, 0.14), loc=(sx * (L / 2 + 0.12), 0, z0 + 0.14), color='white', bev=0.01))
        p.append(box(f'platetxt{sx}', (0.035, 0.3, 0.04), loc=(sx * (L / 2 + 0.125), 0, z0 + 0.14), color='navy', bev=0, seg=1))
    p.append(box('wiper', (0.03, W * 0.5, 0.02), loc=(L * (cabin_x + cabin / 2) + 0.02, 0, z0 + H + 0.06), color='ink', bev=0, seg=1, rot=(0, 0, 0.15)))
    return p + wheels(L, W, r, 0.34)


def window_grid(cx, cy, z0, w, h, cols, rows, gap_x, gap_z, face, color='glow', frame='white', depth=0.12):
    """Windows on a facade. face: '+x','-x','+y','-y' at coordinate cx or cy. Returns parts."""
    out = []
    for i in range(cols):
        for j in range(rows):
            off = (i - (cols - 1) / 2) * (w + gap_x)
            z = z0 + j * (h + gap_z)
            if face[1] == 'x':
                sgn = 1 if face[0] == '+' else -1
                loc, size = (cx + sgn * depth / 2, cy + off, z), (depth, w, h)
                fl, fs = (cx + sgn * depth * 0.6, cy + off, z - h / 2 - 0.06), (depth * 1.6, w + 0.16, 0.1)
            else:
                sgn = 1 if face[0] == '+' else -1
                loc, size = (cx + off, cy + sgn * depth / 2, z), (w, depth, h)
                fl, fs = (cx + off, cy + sgn * depth * 0.6, z - h / 2 - 0.06), (w + 0.16, depth * 1.6, 0.1)
            out.append(box(f'win{face}{i}{j}', size, loc=loc, color=color, bev=0.03, seg=1))
            out.append(box(f'sill{face}{i}{j}', fs, loc=fl, color=frame, bev=0.03, seg=1))
    return out


def lolly_tree(scale=1.0, trunk='clay', leaf=('forest', 'sage'), seed=0):
    """Toy tree: stout trunk + clustered canopy spheres. Returns parts."""
    import random
    rnd = random.Random(seed)
    s = scale
    p = [cyl('trunk', 0.22 * s, 1.6 * s, color=trunk, r2=0.16 * s, seg=16, bev=0.05 * s)]
    p.append(sphere('c0', 1.0 * s, loc=(0, 0, 2.3 * s), color=leaf[0], seg=20))
    for i in range(7):
        a = i * 2 * math.pi / 7 + rnd.random()
        p.append(sphere(f'c{i+1}', (0.5 + rnd.random() * 0.22) * s,
                        loc=(math.cos(a) * 0.78 * s, math.sin(a) * 0.78 * s, (1.8 + rnd.random() * 0.9) * s),
                        color=leaf[i % 2], seg=16))
    p.append(sphere('crown', 0.6 * s, loc=(0.1 * s, -0.1 * s, 3.0 * s), color=leaf[1], seg=16))
    for i in range(3):  # roots
        a = i * 2 * math.pi / 3 + 0.4
        p.append(sphere(f'root{i}', 0.14 * s, loc=(math.cos(a) * 0.2 * s, math.sin(a) * 0.2 * s, 0.05 * s), color=trunk, seg=10, scale=(2, 1, 0.6), rot=(0, 0, a)))
    for i in range(5):  # fruit/blossom dots for readability up close
        a = rnd.random() * 2 * math.pi
        p.append(sphere(f'dot{i}', 0.09 * s, loc=(math.cos(a) * 1.05 * s, math.sin(a) * 1.05 * s, (2.0 + rnd.random() * 0.8) * s), color='pink' if seed % 2 else 'butter', seg=8))
    return p


def grid(name, w, d, nx, ny, z=0.0, color_fn=None, loc=(0, 0, 0)):
    """Flat quad grid w x d centered at origin (top at z). color_fn(i, j) -> swatch name."""
    vs, fs = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            vs.append((-w / 2 + w * i / nx, -d / 2 + d * j / ny, z))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            fs.append((a, a + 1, a + nx + 2, a + nx + 1))
    ob = mesh(name, vs, fs, 'cream', loc)
    if color_fn:
        uv = ob.data.uv_layers['UVMap']
        for k, p in enumerate(ob.data.polygons):
            u = uv_of(color_fn(k % nx, k // nx))
            for li in p.loop_indices:
                uv.data[li].uv = u
    for p in ob.data.polygons:
        if p.normal.z < 0:
            p.flip()
    return ob


TILE = 40.0
BLOCK = 30.0  # road is (TILE - BLOCK) wide between blocks; each tile holds half of it on every edge


def tile_base():
    """Road half-ring + curb + sidewalk for a 40m tile. Returns parts; block top is at z=0.18."""
    h = TILE / 2
    p = [grid('road', TILE, TILE, 1, 1, color_fn=lambda i, j: 'asphalt'),
         box('curb', (BLOCK + 0.6, BLOCK + 0.6, 0.16), loc=(0, 0, 0.08), color='concrete', bev=0.05, seg=2),
         grid('walk', BLOCK, BLOCK, 15, 15, z=0.162, color_fn=lambda i, j: 'sand' if (i + j) % 2 else 'cream')]
    for rot in range(4):
        m = Matrix.Rotation(rot * math.pi / 2, 4, 'Z')
        parts = []
        for k in range(8):  # center-line dashes, half of a shared line
            parts.append(box(f'dash{rot}{k}', (0.16, 2.2, 0.02), loc=(h - 0.08, -16 + k * 4.6, 0.01), color='white', bev=0, seg=1))
        for end in (-1, 1):  # zebra crossings at both block corners
            for k in range(4):
                parts.append(box(f'zeb{rot}{end}{k}', (0.6, 3.0, 0.02), loc=(BLOCK / 2 + 0.9 + k * 1.1, end * (BLOCK / 2 + 2.0), 0.01),
                                 color='white', bev=0, seg=1))
        parts.append(cyl(f'manhole{rot}', 0.5, 0.03, loc=(h - 2.5, 7 * (1 if rot % 2 else -1), 0), color='steel', seg=20, bev=0.01))
        bpy.context.view_layer.update()
        for o in parts:
            o.matrix_world = m @ o.matrix_world
        p += parts
    return p
