"""Check the reversible packet-water trial against the current runtime texture."""
import math, struct, zlib

SOURCE = 'public/textures/water/water-detail.png'
CANDIDATE = 'art/candidates/water-detail-packets.png'


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', path
    pos, chunks = 8, []
    while pos < len(data):
        size = struct.unpack_from('>I', data, pos)[0]
        kind = data[pos + 4:pos + 8]
        payload = data[pos + 8:pos + 8 + size]
        pos += size + 12
        if kind == b'IHDR':
            width, height, depth, color, comp, filt, interlace = struct.unpack('>IIBBBBB', payload)
        elif kind == b'IDAT':
            chunks.append(payload)
    assert (depth, color, interlace) == (8, 6, 0), (depth, color, interlace)
    raw, stride, previous, rows = zlib.decompress(b''.join(chunks)), width * 4, bytearray(width * 4), []
    offset = 0
    for _ in range(height):
        mode, encoded = raw[offset], raw[offset + 1:offset + 1 + stride]
        offset += stride + 1
        row = bytearray(stride)
        for i, value in enumerate(encoded):
            left = row[i - 4] if i >= 4 else 0
            up = previous[i]
            upper_left = previous[i - 4] if i >= 4 else 0
            if mode == 1:
                value += left
            elif mode == 2:
                value += up
            elif mode == 3:
                value += (left + up) // 2
            elif mode == 4:
                p = left + up - upper_left
                distances = (abs(p - left), abs(p - up), abs(p - upper_left))
                value += (left, up, upper_left)[distances.index(min(distances))]
            else:
                assert mode == 0
            row[i] = value & 255
        rows.append(row)
        previous = row
    return width, height, rows


def slope_rms(rows):
    total = count = 0
    for row in rows:
        for i in range(0, len(row), 4):
            nz = max(row[i + 2] / 127.5 - 1, 0.4)
            sx = (row[i] / 127.5 - 1) / nz
            sz = (row[i + 1] / 127.5 - 1) / nz
            total += sx * sx + sz * sz
            count += 2
    return math.sqrt(total / count)


def slope_p99(rows):
    values = []
    for row in rows:
        for i in range(0, len(row), 4):
            nz = max(row[i + 2] / 127.5 - 1, 0.4)
            sx = (row[i] / 127.5 - 1) / nz
            sz = (row[i + 1] / 127.5 - 1) / nz
            values.append(math.hypot(sx, sz))
    return sorted(values)[math.ceil(0.99 * len(values)) - 1]


source = read_png(SOURCE)
candidate = read_png(CANDIDATE)
assert source[:2] == candidate[:2] == (256, 256)
alpha_diff = sum(a[i + 3] != b[i + 3] for ra, rb in zip(source[2], candidate[2])
                 for i in range(0, len(ra), 4) for a, b in ((ra, rb),))
assert alpha_diff == 0, f'{alpha_diff} alpha bytes differ'
old_rms, new_rms = slope_rms(source[2]), slope_rms(candidate[2])
delta = (new_rms / old_rms - 1) * 100
assert abs(delta) <= 5, f'slope RMS changed by {delta:.3f}%'
old_p99, new_p99 = slope_p99(source[2]), slope_p99(candidate[2])

seams = {}
width, height, rows = candidate
for axis in ('horizontal', 'vertical'):
    seam, interior = [], []
    for y in range(height):
        for x in range(width):
            nx, ny = (x + 1) % width, (y + 1) % height
            if axis == 'horizontal':
                step = max(abs(rows[y][4 * x + c] - rows[y][4 * nx + c]) for c in range(3))
                (seam if x == width - 1 else interior).append(step)
            else:
                step = max(abs(rows[y][4 * x + c] - rows[ny][4 * x + c]) for c in range(3))
                (seam if y == height - 1 else interior).append(step)
    seam_max, interior_max = max(seam), max(interior)
    seams[axis] = {'seam_max_rgb_step': seam_max, 'interior_max_rgb_step': interior_max}

print({'alpha_byte_differences': alpha_diff, 'alpha_bytes': width * height,
       'source_slope_rms': old_rms, 'candidate_slope_rms': new_rms,
       'slope_rms_delta_percent': delta, 'source_slope_p99': old_p99,
       'candidate_slope_p99': new_p99, 'slope_p99_limit': 0.467416,
       'seams': seams})
assert new_p99 <= 0.467416, f'slope p99 {new_p99:.6f} exceeds 0.467416'
assert all(v['seam_max_rgb_step'] <= v['interior_max_rgb_step'] for v in seams.values()), seams
