"""Validate the candidate RGBA8 volume's layout, periodic joins, alpha, and slopes."""
import math
from pathlib import Path

SIZE, DEPTH = 128, 16
DATA = Path(__file__).with_name('water-normal-volume-128x128x16.rgba8').read_bytes()
assert len(DATA) == SIZE * SIZE * DEPTH * 4, len(DATA)
pixels = SIZE * SIZE * DEPTH

for z in range(1, DEPTH):
    for i in range(SIZE * SIZE):
        assert DATA[(z * SIZE * SIZE + i) * 4 + 3] == DATA[i * 4 + 3], f'alpha differs at slice {z}, texel {i}'

slopes = []
for i in range(pixels):
    r, g, b = DATA[i * 4:i * 4 + 3]
    nz = max(b / 127.5 - 1, 0.4)
    sx, sy = (r / 127.5 - 1) / nz, (g / 127.5 - 1) / nz
    assert all(map(math.isfinite, (sx, sy, nz))), i
    slopes.append(math.hypot(sx, sy))

def steps(axis):
    seam, interior = [], []
    for z in range(DEPTH):
        for y in range(SIZE):
            for x in range(SIZE):
                p = (z * SIZE + y) * SIZE + x
                if axis == 'x':
                    q = (z * SIZE + y) * SIZE + (x + 1) % SIZE
                    edge = x == SIZE - 1
                elif axis == 'y':
                    q = (z * SIZE + (y + 1) % SIZE) * SIZE + x
                    edge = y == SIZE - 1
                else:
                    q = ((z + 1) % DEPTH * SIZE + y) * SIZE + x
                    edge = z == DEPTH - 1
                step = max(abs(DATA[p * 4 + c] - DATA[q * 4 + c]) for c in range(3))
                (seam if edge else interior).append(step)
    assert max(seam) <= max(interior), f'{axis} cyclic seam {max(seam)} > interior {max(interior)}'
    return {'seam_max': max(seam), 'interior_max': max(interior)}

print({'dimensions': (SIZE, SIZE, DEPTH), 'bytes': len(DATA), 'alpha_temporal_differences': 0,
       'finite_decoded_slopes': True, 'decoded_slope_magnitude_p99': sorted(slopes)[int(0.99 * (len(slopes) - 1))],
       'periodic_rgb_steps': {axis: steps(axis) for axis in ('x', 'y', 'z')}})
