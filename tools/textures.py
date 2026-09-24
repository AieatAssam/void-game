# Builds the PBR detail library in public/tex/ from CC0 sources (Poly Haven textures, ambientCG leaf sets).
#   python3 tools/textures.py        (needs Pillow + numpy; downloads into assets-raw/, which is git-ignored)
# Every surface layer ships three 512px JPGs: _col (albedo, sRGB), _nrm (OpenGL normal), _rha (R roughness,
# G height, B ambient occlusion). The game packs them into texture arrays (src/pbr.js); layer order = LAYERS.
# Leaf cluster cards for trees and bushes are composited here from single scanned leaves.
import io, json, math, os, random, urllib.request, zipfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets-raw', 'tex')
OUT = os.path.join(ROOT, 'public', 'tex')
SIZE = 512

# (layer name, Poly Haven id). Keep in sync with LAYER in src/pbr.js.
LAYERS = [
    ('plaster', 'white_stucco'),
    ('asphalt', 'asphalt_02'),
    ('concrete', 'concrete_floor_worn_001'),
    ('grass', 'leafy_grass'),
    ('paving', 'rectangular_paving'),
    ('sand', 'coast_sand_01'),
    ('dirt', 'dirt'),
    ('brick', 'brick_wall_02'),
    ('wood', 'brown_planks_03'),
    ('foliage', 'forest_leaves_02'),
    ('metal', 'metal_plate'),
    ('roof', 'clay_roof_tiles_02'),
    ('rock', 'aerial_rocks_02'),
    ('bark', 'bark_brown_02'),
    ('forest', 'forrest_ground_01'),
    ('shore', 'coast_sand_rocks_02'),
]


def fetch(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print('  get', url)
        req = urllib.request.Request(url, headers={'User-Agent': 'void-game-texture-builder'})
        with urllib.request.urlopen(req) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


def ph_map(files, key, name):
    if key not in files:
        return None
    url = files[key]['1k']['jpg']['url'] if 'jpg' in files[key]['1k'] else files[key]['1k']['png']['url']
    return Image.open(fetch(url, os.path.join(RAW, name, os.path.basename(url))))


def gray(im, fill):
    if im is None:
        return np.full((SIZE, SIZE), fill, np.float32)
    return np.asarray(im.convert('L').resize((SIZE, SIZE), Image.LANCZOS), np.float32) / 255


def build_layers():
    for layer, pid in LAYERS:
        print(layer, pid)
        meta_path = fetch(f'https://api.polyhaven.com/files/{pid}', os.path.join(RAW, pid, 'files.json'))
        files = json.load(open(meta_path))
        col = ph_map(files, 'Diffuse', pid).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
        nrm = ph_map(files, 'nor_gl', pid).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
        rough = gray(ph_map(files, 'Rough', pid), 0.8)
        disp = ph_map(files, 'Displacement', pid)
        height = gray(disp, 0.5)
        lo, hi = np.percentile(height, 1), np.percentile(height, 99)  # full 0..1 range: the shader scales per layer
        height = np.clip((height - lo) / max(hi - lo, 1e-3), 0, 1)
        ao = gray(ph_map(files, 'AO', pid), 1.0)
        if 'AO' not in files:  # derive a cavity term from the height field
            ao = np.clip(0.55 + height * 0.6, 0, 1)
        rha = np.stack([rough, height, ao], -1)
        col.save(os.path.join(OUT, f'{layer}_col.jpg'), quality=88)
        nrm.save(os.path.join(OUT, f'{layer}_nrm.jpg'), quality=92)
        Image.fromarray((rha * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{layer}_rha.jpg'), quality=90)


# ---------- leaf cluster cards ----------
LEAF_SETS = ['LeafSet014', 'LeafSet024', 'LeafSet029']


def leaf_sprites():
    """Cut every individual leaf out of the ambientCG leaf-set sheets (connected opacity blobs)."""
    sprites = []
    for s in LEAF_SETS:
        zpath = fetch(f'https://ambientcg.com/get?file={s}_1K-PNG.zip', os.path.join(ROOT, 'assets-raw', 'leaves', f'{s}.zip'))
        z = zipfile.ZipFile(zpath)
        col = Image.open(io.BytesIO(z.read(f'{s}_1K-PNG_Color.png'))).convert('RGB')
        op = Image.open(io.BytesIO(z.read(f'{s}_1K-PNG_Opacity.png'))).convert('L')
        nrm = Image.open(io.BytesIO(z.read(f'{s}_1K-PNG_NormalGL.png'))).convert('RGB')
        a = np.asarray(op) > 128
        # label blobs with a simple flood fill over a coarse grid
        h, w = a.shape
        seen = np.zeros_like(a)
        for y0 in range(0, h, 8):
            for x0 in range(0, w, 8):
                if not a[y0, x0] or seen[y0, x0]:
                    continue
                stack, xs, ys = [(y0, x0)], [], []
                seen[y0, x0] = True
                while stack:
                    y, x = stack.pop()
                    xs.append(x); ys.append(y)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and a[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
                if len(xs) < 2000:
                    continue
                box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
                sprites.append((s, col.crop(box), op.crop(box), nrm.crop(box)))
    print('leaf sprites', len(sprites))
    return sprites


def rotate_normal(nrm_img, angle_deg):
    """Rotate a tangent-space normal map image, also rotating its xy vectors."""
    n = np.asarray(nrm_img, np.float32) / 127.5 - 1
    a = math.radians(angle_deg)
    c, s = math.cos(a), math.sin(a)
    x, y = n[..., 0], n[..., 1]
    # image y is down while GL normal y is up: a CCW image rotation by a turns the vector by +a
    rx, ry = x * c - y * s, x * s + y * c
    n2 = np.stack([rx, ry, n[..., 2]], -1)
    return Image.fromarray(np.clip((n2 + 1) * 127.5, 0, 255).astype(np.uint8))


def build_leaves(kind, set_name, out, n_leaves, leaf_px, seed, tint):
    """One 1024px card sheet in a 2x2 grid of twig clusters: leaves fan out from a stem toward the top."""
    rnd = random.Random(seed)
    sprites = [sp for sp in leaf_sprites_cache if sp[0] == set_name and sp[1].size[0] < sp[1].size[1] * 1.6 or sp[0] == set_name]
    N = 1024
    col = Image.new('RGB', (N, N), (60, 80, 40))
    alpha = Image.new('L', (N, N), 0)
    nrm = Image.new('RGB', (N, N), (128, 128, 255))
    q = N // 2
    for cell in range(4):
        ox, oy = (cell % 2) * q, (cell // 2) * q
        # stem from bottom centre up; leaves attach along it and along 3-5 side twigs
        stem = ImageDraw.Draw(col)
        adraw = ImageDraw.Draw(alpha)
        twigs = []
        base = (ox + q / 2 + rnd.uniform(-20, 20), oy + q - 12)
        for t in range(rnd.randint(6, 8)):
            ang = math.radians(-90 + rnd.uniform(-75, 75))
            ln = rnd.uniform(q * 0.3, q * 0.55)
            start = (base[0], base[1] - rnd.uniform(0, q * 0.25))
            end = (start[0] + math.cos(ang) * ln, start[1] + math.sin(ang) * ln)
            twigs.append((start, end))
            stem.line([start, end], fill=(74, 58, 40), width=5)
            adraw.line([start, end], fill=255, width=5)
        placed = 0
        order = []
        for k in range(n_leaves):
            (sx, sy), (ex, ey) = rnd.choice(twigs)
            t = rnd.uniform(0.2, 1.0)
            ln = math.hypot(ex - sx, ey - sy) or 1
            side = rnd.uniform(-1, 1) * leaf_px * 0.55  # leaves stand off both sides of the twig
            px = sx + (ex - sx) * t - (ey - sy) / ln * side
            py = sy + (ey - sy) * t + (ex - sx) / ln * side
            order.append((py, px, py, (ex - sx), (ey - sy)))
        order.sort(key=lambda o: -o[0])  # lower leaves first, upper ones overlap
        for _, px, py, dx, dy in order:
            _, c, o, nm = rnd.choice(sprites)
            scale = leaf_px * rnd.uniform(0.75, 1.15) / max(c.size)
            size = (max(4, int(c.size[0] * scale)), max(4, int(c.size[1] * scale)))
            c2, o2, n2 = c.resize(size, Image.LANCZOS), o.resize(size, Image.LANCZOS), nm.resize(size, Image.LANCZOS)
            # leaf sheets have the stem at the bottom: point it back toward the twig, tip outward
            twig_ang = math.degrees(math.atan2(dy, dx))
            ang = -(twig_ang + 90) + rnd.uniform(-70, 70)
            c2 = c2.rotate(ang, expand=True, resample=Image.BICUBIC)
            o2 = o2.rotate(ang, expand=True, resample=Image.BICUBIC)
            n2 = rotate_normal(n2.rotate(ang, expand=True, resample=Image.BICUBIC, fillcolor=(128, 128, 255)), ang)
            # per-leaf hue/brightness variation, some leaves yellowing, and a darker interior
            f = np.asarray(c2, np.float32)
            shade = rnd.uniform(0.72, 1.12) * (0.8 + 0.2 * (1 - (py - oy) / q))
            f = f * np.array(tint) * shade
            if rnd.random() < 0.08:
                f = f * np.array([1.25, 1.1, 0.7])
            c2 = Image.fromarray(np.clip(f, 0, 255).astype(np.uint8))
            pos = (int(px - c2.size[0] / 2), int(py - c2.size[1] / 2))
            col.paste(c2, pos, o2)
            nrm.paste(n2, pos, o2)
            alpha.paste(255, pos, o2)
            placed += 1
    # bleed colour into transparent texels so mipmaps don't fringe dark/pink
    a = np.asarray(alpha, np.float32) / 255
    cf = np.asarray(col, np.float32)
    leaf_mean = (cf * a[..., None]).sum((0, 1)) / max(a.sum(), 1)
    fill = np.zeros_like(cf)
    wsum = np.zeros(a.shape, np.float32)
    for radius in (4, 12, 32):  # premultiplied blur pyramid: nearest leaf colour bleeds outward
        pm = Image.fromarray(np.clip(cf * a[..., None], 0, 255).astype(np.uint8))
        b = np.asarray(pm.filter(ImageFilter.GaussianBlur(radius)), np.float32)
        ab = np.asarray(alpha.filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255
        take = (wsum < 0.5) & (ab > 0.02)
        fill[take] = b[take] / ab[take][..., None]
        wsum[take] = 1
    fill[wsum < 0.5] = leaf_mean
    cf = cf * a[..., None] + np.clip(fill, 0, 255) * (1 - a[..., None])
    rgba = np.concatenate([cf, np.asarray(alpha, np.float32)[..., None]], -1)
    Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, f'{out}_col.png'), optimize=True)
    nrm.save(os.path.join(OUT, f'{out}_nrm.jpg'), quality=90)
    print(out, 'cards done')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    build_layers()
    leaf_sprites_cache = leaf_sprites()
    build_leaves('broadleaf', 'LeafSet024', 'leaves_broad', 230, 64, 1, (0.92, 1.0, 0.85))
    build_leaves('birch', 'LeafSet014', 'leaves_fine', 260, 54, 2, (1.0, 1.02, 0.9))
    build_leaves('bush', 'LeafSet029', 'leaves_bush', 240, 58, 3, (0.85, 0.95, 0.8))
