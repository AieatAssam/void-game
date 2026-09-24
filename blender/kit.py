"""Composite parts shared by several assets (wheels, vehicles, windows, trees)."""
from lib import *


def wheel(name, r, w, x, y, z=None, tire='ink', hub='chrome'):
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


def wheels(L, W, r, w, xs=None, tire='ink', hub='chrome'):
    xs = xs or (L * 0.32, -L * 0.32)
    out = []
    for i, x in enumerate(xs):
        for s in (-1, 1):
            out += wheel(f'w{i}{s}', r, w, x, s * (W / 2 - w * 0.35), tire=tire, hub=hub)
    return out


def rim(name, r, w, x, y, z, side):
    """Five-spoke chrome rim face for a wheel at (x, y, z); side = +1/-1 (outer face direction)."""
    out = [cyl(name + 'disc', r * 0.62, 0.02, loc=(x, y + side * w * 0.55, z), color='gloss_black', rot=(math.pi / 2, 0, 0), seg=20, bev=0)]
    for k in range(5):
        a = k * 2 * math.pi / 5
        out.append(box(f'{name}sp{k}', (0.05, 0.03, r * 0.56), loc=(x + math.cos(a) * r * 0.28, y + side * w * 0.58, z + math.sin(a) * r * 0.28),
                       color='chrome', bev=0.01, seg=1, rot=(0, -a + math.pi / 2, 0)))
    out.append(torus(name + 'lip', r * 0.6, 0.025, loc=(x, y + side * w * 0.56, z), color='chrome', seg=24, rseg=6, rot=(math.pi / 2, 0, 0)))
    return out


def car(L, W, body, roof=None, glass='gloss_black', cabin=0.52, cabin_x=-0.15, H=0.62, ch=0.6, r=0.42):
    """AAA toy car: bevelled body with shoulder crease, sloped cabin shell, tinted glass panes with pillars,
    chrome bezels, LED DRLs, taillight clusters, five-spoke rims, mirrors, exhaust. Returns parts."""
    z0 = r * 0.7
    roof = roof or body
    zb, zt = z0 + H - 0.04, z0 + H + ch
    xf, xr = L * (cabin_x + cabin / 2), L * (cabin_x - cabin / 2)
    rake_f, rake_r = ch * 0.75, ch * 0.45
    wb, wt = W * 0.43, W * 0.36
    cab = mesh('cabin', [(xr, -wb, zb), (xf, -wb, zb), (xf - rake_f, -wt, zt), (xr + rake_r, -wt, zt),
                         (xr, wb, zb), (xf, wb, zb), (xf - rake_f, wt, zt), (xr + rake_r, wt, zt)],
               [(0, 1, 2, 3), (5, 4, 7, 6), (1, 5, 6, 2), (4, 0, 3, 7), (3, 2, 6, 7), (0, 4, 5, 1)], roof)
    bevel(cab, 0.07, 3)
    p = [box('body', (L, W, H), loc=(0, 0, z0 + H / 2), color=body, bev=0.2, seg=4),
         cab,
         box('crease', (L * 0.9, W + 0.02, 0.035), loc=(0, 0, z0 + H * 0.78), color=body, bev=0.015, seg=1),
         box('bump_f', (0.22, W * 0.96, 0.26), loc=(L / 2, 0, z0 + 0.14), color='chrome', bev=0.09),
         box('bump_r', (0.22, W * 0.96, 0.26), loc=(-L / 2, 0, z0 + 0.14), color='chrome', bev=0.09),
         box('grille', (0.06, W * 0.42, H * 0.36), loc=(L / 2 + 0.01, 0, z0 + H * 0.5), color='chrome', bev=0.02),
         cyl('exhaust', 0.05, 0.18, loc=(-L / 2 - 0.02, -W * 0.3, z0 + 0.08), color='chrome', rot=(0, -math.pi / 2, 0), seg=12, bev=0.01),
         cyl('antenna', 0.008, 0.45, loc=(xr + 0.2, wt - 0.1, zt - 0.02), color='ink', seg=6, bev=0)]
    for i in range(4):
        p.append(box(f'slot{i}', (0.07, W * 0.38, 0.025), loc=(L / 2 + 0.02, 0, z0 + H * 0.38 + i * 0.07), color='ink', bev=0, seg=1))
    # glass: windshield + rear window follow the rake, sides are split by the B-pillar
    for name, (xa, za, xb, zbb, w_) in {'wind': (xf - 0.03, zb + 0.06, xf - rake_f + 0.04, zt - 0.05, wt * 0.9),
                                        'rear': (xr + 0.03, zb + 0.06, xr + rake_r - 0.03, zt - 0.05, wt * 0.9)}.items():
        side = 1 if name == 'wind' else -1
        p.append(mesh(name, [(xa + side * 0.012, -w_, za), (xa + side * 0.012, w_, za), (xb + side * 0.012, w_, zbb), (xb + side * 0.012, -w_, zbb)],
                      [(0, 1, 2, 3)], glass))
    xm = (xf + xr) / 2 - 0.05
    for sgn in (-1, 1):
        y = sgn * (wb + 0.004)
        yt = sgn * (wt + 0.004)
        for (xa, xb) in ((xr + 0.12, xm - 0.05), (xm + 0.05, xf - 0.12)):
            ta = xa + (rake_r if xa < xm else 0) * 0.75 * (1 if xa < xm else 0)
            tb = xb - (rake_f * 0.75 if xb > xm else 0)
            p.append(mesh(f'side{sgn}{xa:.2f}', [(xa, y, zb + 0.08), (xb, y, zb + 0.08), (tb, yt, zt - 0.08), (max(ta, xr + rake_r * 0.8), yt, zt - 0.08)],
                          [(0, 1, 2, 3)], glass))
        # mirrors, door handles, lights
        p += [box(f'mstalk{sgn}', (0.06, 0.14, 0.04), loc=(xf - 0.12, sgn * (W / 2 + 0.05), z0 + H + 0.04), color='ink', bev=0.01, seg=1),
              box(f'mirror{sgn}', (0.14, 0.12, 0.1), loc=(xf - 0.12, sgn * (W / 2 + 0.13), z0 + H + 0.1), color=body, bev=0.03),
              box(f'mglass{sgn}', (0.02, 0.1, 0.07), loc=(xf - 0.2, sgn * (W / 2 + 0.13), z0 + H + 0.1), color='chrome', bev=0.005, seg=1),
              box(f'handle{sgn}', (0.16, 0.03, 0.04), loc=(xm + 0.2, sgn * (W / 2 + 0.01), z0 + H * 0.72), color='chrome', bev=0.01, seg=1),
              box(f'handle2{sgn}', (0.16, 0.03, 0.04), loc=(xm - 0.55, sgn * (W / 2 + 0.01), z0 + H * 0.72), color='chrome', bev=0.01, seg=1),
              box(f'seam{sgn}', (0.02, 0.02, H * 0.8), loc=(xm, sgn * (W / 2 + 0.004), z0 + H * 0.55), color='ink', bev=0, seg=1),
              box(f'trim{sgn}', (L * 0.86, 0.03, 0.05), loc=(0, sgn * (W / 2 + 0.005), z0 + H * 0.3), color='chrome', bev=0.012, seg=1),
              cyl(f'hl{sgn}', 0.14, 0.08, loc=(L / 2 - 0.02, sgn * W * 0.32, z0 + H * 0.62), color='glow', rot=(0, math.pi / 2, 0), seg=16, bev=0.02),
              torus(f'hlr{sgn}', 0.15, 0.025, loc=(L / 2 + 0.05, sgn * W * 0.32, z0 + H * 0.62), color='chrome', seg=20, rseg=6, rot=(0, math.pi / 2, 0)),
              box(f'drl{sgn}', (0.03, 0.22, 0.03), loc=(L / 2 + 0.03, sgn * W * 0.32, z0 + H * 0.42), color='glow_white', bev=0.008, seg=1),
              box(f'tl{sgn}', (0.06, 0.34, 0.12), loc=(-L / 2, sgn * W * 0.33, z0 + H * 0.68), color='siren_red', bev=0.02),
              box(f'rev{sgn}', (0.065, 0.1, 0.08), loc=(-L / 2, sgn * W * 0.2, z0 + H * 0.68), color='glow_white', bev=0.015, seg=1)]
        for x in (L * 0.32, -L * 0.32):
            p.append(torus(f'arch{sgn}{x}', r * 1.12, 0.07, loc=(x, sgn * (W / 2 - 0.02), r), color=body, seg=24, rseg=8, rot=(math.pi / 2, 0, 0)))
            p += rim(f'rim{sgn}{x}', r, 0.34, x, sgn * (W / 2 - 0.34 * 0.35), r, sgn)
    for sx in (1, -1):
        p.append(box(f'plate{sx}', (0.03, 0.44, 0.14), loc=(sx * (L / 2 + 0.12), 0, z0 + 0.14), color='white', bev=0.01))
        p.append(box(f'platetxt{sx}', (0.035, 0.3, 0.04), loc=(sx * (L / 2 + 0.125), 0, z0 + 0.14), color='navy', bev=0, seg=1))
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
        ]
    # Curb: a raised concrete ring under the sidewalk (not a full slab, so sunken interiors stay open).
    cw = 3.3
    for k, (sx, sy, cx, cy) in enumerate(((BLOCK + 0.6, cw, 0, (BLOCK + 0.6 - cw) / 2), (BLOCK + 0.6, cw, 0, -(BLOCK + 0.6 - cw) / 2),
                                          (cw, BLOCK + 0.6 - 2 * cw + 0.2, (BLOCK + 0.6 - cw) / 2, 0), (cw, BLOCK + 0.6 - 2 * cw + 0.2, -(BLOCK + 0.6 - cw) / 2, 0))):
        p.append(box(f'curb{k}', (sx, sy, 0.16), loc=(cx, cy, 0.08), color='concrete', bev=0.05, seg=2))
    # Sidewalk is a 3m ring around the block. The interior belongs to each tile (lot, lawn, canal, beach...),
    # so sunken features like the canal are never paved over.
    w = 3.0
    for k, (sx, sy, cx, cy) in enumerate(((BLOCK, w, 0, (BLOCK - w) / 2), (BLOCK, w, 0, -(BLOCK - w) / 2),
                                          (w, BLOCK - 2 * w, (BLOCK - w) / 2, 0), (w, BLOCK - 2 * w, -(BLOCK - w) / 2, 0))):
        p.append(grid(f'walk{k}', sx, sy, 1, 1, z=0.162, color_fn=lambda i, j: 'cream', loc=(cx, cy, 0)))
    for rot in range(4):
        m = Matrix.Rotation(rot * math.pi / 2, 4, 'Z')
        parts = []
        for k in range(8):  # center-line dashes, half of a shared line
            parts.append(box(f'dash{rot}{k}', (0.3, 2.2, 0.02), loc=(h, -16.1 + k * 4.6, 0.01), color='white', bev=0.02, seg=1))  # centred on the shared edge, mirror-symmetric
        for end in (-1, 1):  # zebra crossings just before each junction (never overlapping the other road's)
            for k in range(4):
                parts.append(box(f'zeb{rot}{end}{k}', (0.55, 2.6, 0.02), loc=(BLOCK / 2 + 0.8 + k * 1.15, end * (BLOCK / 2 - 2.2), 0.01),
                                 color='white', bev=0.01, seg=1))
        parts.append(cyl(f'manhole{rot}', 0.5, 0.03, loc=(h - 2.5, 7 * (1 if rot % 2 else -1), 0), color='steel', seg=20, bev=0.01))
        bpy.context.view_layer.update()
        for o in parts:
            o.matrix_world = m @ o.matrix_world
        p += parts
    return p


def parapet(D, W, z, h=0.45, t=0.3, color='white'):
    """Hollow roof parapet (a ring, not a slab - so the roof inside shows)."""
    out = []
    for k, (sx, sy, cx, cy) in enumerate(((D + t, t, 0, (W + t) / 2 - t / 2), (D + t, t, 0, -(W + t) / 2 + t / 2),
                                          (t, W, (D + t) / 2 - t / 2, 0), (t, W, -(D + t) / 2 + t / 2, 0))):
        out.append(box(f'par{k}', (sx, sy, h), loc=(cx, cy, z + h / 2), color=color, bev=0.06, seg=2))
    return out


def rooftop(D, W, z, seed=0, solar=True):
    """Top-down richness for flat roofs: gravel deck, skylights, solar panels, vents, pipes, hatch."""
    import random
    r = random.Random(seed)
    out = [box('deck', (D - 0.2, W - 0.2, 0.08), loc=(0, 0, z + 0.04), color='concrete', bev=0.02, seg=1)]
    for k in range(r.randint(1, 3)):  # skylights
        x, y = r.uniform(-D / 2 + 1.2, D / 2 - 1.2), r.uniform(-W / 2 + 1.2, W / 2 - 1.2)
        out += [box(f'skyf{k}', (1.3, 0.9, 0.18), loc=(x, y, z + 0.17), color='white', bev=0.04),
                box(f'skyg{k}', (1.1, 0.7, 0.06), loc=(x, y, z + 0.28), color='glass', bev=0.02)]
    if solar:
        x0 = r.uniform(-D / 2 + 1.5, 0)
        for i in range(3):
            for j in range(2):
                out += [box(f'sol{i}{j}', (0.9, 0.55, 0.04), loc=(x0 + i * 1.0, -W / 2 + 1.2 + j * 0.65, z + 0.35), color='navy', bev=0.01, seg=1, rot=(0.3, 0, 0)),
                        box(f'solf{i}{j}', (0.94, 0.04, 0.05), loc=(x0 + i * 1.0, -W / 2 + 1.2 + j * 0.65 - 0.27, z + 0.28), color='chrome', bev=0, seg=1)]
    for k in range(r.randint(2, 4)):  # mushroom vents
        x, y = r.uniform(-D / 2 + 0.8, D / 2 - 0.8), r.uniform(-W / 2 + 0.8, W / 2 - 0.8)
        out += [cyl(f'vent{k}', 0.12, 0.35, loc=(x, y, z + 0.08), color='steel', seg=12, bev=0.02),
                cyl(f'ventc{k}', 0.22, 0.08, loc=(x, y, z + 0.43), color='steel', seg=14, bev=0.02)]
    px = r.uniform(-D / 2 + 1, D / 2 - 1)
    out += [cyl('pipe', 0.07, W * 0.6, loc=(px, W * 0.3, z + 0.2), color='steel', rot=(math.pi / 2, 0, 0), seg=10, bev=0.01),
            box('hatch', (0.9, 0.9, 0.25), loc=(D / 2 - 1.2, W / 2 - 1.2, z + 0.12), color='asphalt_lt', bev=0.05)]
    return out
