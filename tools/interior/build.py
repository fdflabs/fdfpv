# build.py: the Interior's shared ground from the two cuts fetch.py made,
# written into src/share/interior/ where the room (Node) and every screen
# read the same bytes (src/share/interior/world.js decodes them):
#
#   height.bin   the ground, 769 by 769 little endian Uint16 samples 30 m
#                apart over the world square [-11520, 11520] in x and z,
#                x fastest, value round((y + 1000) * 10): the terrain
#                engine's tile encoding (src/maps/terrain/frame.js), so
#                its level 0 tiles are slices of it. ANADEM's bare earth,
#                with Rio Sereno's channel cut into it (below).
#   land.bin     the land cover, 2304 by 2304 cells 10 m square over the
#                same square, one class byte each (world.js LAND), run
#                length coded: "ILND", width and height as Uint16 LE, then
#                (class, run as a LEB128 varint) pairs, row major.
#   hydro.js     the river and its streams as polylines in world metres,
#                with the river's width and water level along it.
#
# World frame (src/share/interior/frame.js): metres, x east, z south, y up,
# the origin the square's centre. The source is turned by source.ORIENT
# on the way in, and nothing written here carries a coordinate of it.
#
# THE RIVER is the land's own: the largest flow path through the square,
# from a D8 flow accumulation over the bare earth (priority flood first,
# so the pits a 30 m model has do not break it). Its water level is the
# lowest ground near each point, held never to rise downstream; its
# channel is cut under that level and its banks kept a little over it,
# so the water the map draws meets the ground the room reads. The
# streams are the tributaries over STREAM_KM2 of catchment; they are
# drawn, not cut, and the story names two of them (Arroyo Manso and the
# canada: src/share/interior/places.js).
#
# Usage: uv run python build.py   (after fetch.py; under a minute)
#
# This file is part of WebFPVSimulator.
#
# WebFPVSimulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# WebFPVSimulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.

import heapq
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject
from scipy import ndimage

import source
from fetch import DATA, SOURCES

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'src' / 'share' / 'interior'
PREVIEW = DATA / 'preview'

# The world square (src/share/interior/frame.js HALF) and its grids.
HALF = 11520
H_CELL = 30
H_N = 2 * HALF // H_CELL + 1
L_CELL = 10
L_N = 2 * HALF // L_CELL

# Land classes (src/share/interior/world.js LAND), from WorldCover's.
WATER, FOREST, PASTURE, CROP, SHRUB, WETLAND, BARE = 0, 1, 2, 3, 4, 5, 6
FROM_WORLDCOVER = {10: FOREST, 20: SHRUB, 30: PASTURE, 40: CROP, 50: PASTURE, 60: BARE, 70: BARE, 80: WATER,
                   90: WETLAND, 95: FOREST, 100: PASTURE}

STREAM_KM2 = 2.0
# The grid the flow is found on: wide enough that the river's catchment
# inside it is most of its real one where it crosses the square.
F_HALF = 36000
F_CELL = 60
F_N = 2 * F_HALF // F_CELL + 1
RIVER_DEPTH = 1.8
BANK_RISE = 0.4


def orient_grid(cell, n, centred, half):
    """The source offsets (e, n) of every world sample, as two (n, n) arrays."""
    off = (-half + cell / 2) if centred else -half
    w = off + cell * np.arange(n)
    x, z = np.meshgrid(w, w)
    (a, b), (c, d) = source.ORIENT
    det = a * d - b * c
    e = (d * x - b * z) / det
    nn = (-c * x + a * z) / det
    return e, nn


def warp(path, cell, n, centred, resampling, dtype, half=HALF):
    """The source raster sampled at every world sample: warped first onto a north up UTM grid whose samples are
    the world's (ORIENT is a quarter turn or a mirror, so the two lattices coincide), then gathered."""
    t = Transformer.from_crs('EPSG:4326', source.UTM, always_xy=True)
    e0, n0 = t.transform(source.CENTRE_LON, source.CENTRE_LAT)
    e, nn = orient_grid(cell, n, centred, half)
    span = half + cell
    k = int(np.ceil(span / cell))
    left = e0 - k * cell - (0 if centred else cell / 2)
    top = n0 + k * cell + (0 if centred else cell / 2)
    m = 2 * k + (0 if centred else 1)
    dst = np.zeros((m, m), dtype)
    with rasterio.open(path) as src:
        reproject(rasterio.band(src, 1), dst, dst_transform=Affine(cell, 0, left, 0, -cell, top), dst_crs=source.UTM,
                  resampling=resampling)
    col = np.rint((e0 + e - left) / cell - 0.5).astype(int)
    row = np.rint((top - (n0 + nn)) / cell - 0.5).astype(int)
    assert col.min() >= 0 and row.min() >= 0 and col.max() < m and row.max() < m, 'the warp does not cover the square'
    return dst[row, col]


def flow(h):
    """Priority flood then D8: each sample's downstream index (-1 at the edge) and its accumulation in samples."""
    n = h.shape[0]
    seen = np.zeros(h.shape, bool)
    down = np.full(h.size, -1, np.int64)
    filled = h.astype(np.float64).copy()
    pq = []
    for j in range(n):
        for i in range(n):
            if i in (0, n - 1) or j in (0, n - 1):
                heapq.heappush(pq, (filled[j, i], j, i))
                seen[j, i] = True
    order = []
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    while pq:
        z, j, i = heapq.heappop(pq)
        order.append(j * n + i)
        for dj, di in nb:
            jj, ii = j + dj, i + di
            if 0 <= jj < n and 0 <= ii < n and not seen[jj, ii]:
                seen[jj, ii] = True
                filled[jj, ii] = max(filled[jj, ii], z + 1e-3)
                down[jj * n + ii] = j * n + i
                heapq.heappush(pq, (filled[jj, ii], jj, ii))
    acc = np.ones(h.size)
    for k in reversed(order):
        if down[k] >= 0:
            acc[down[k]] += acc[k]
    return down, acc


def trace_network(down, acc, n, min_acc):
    """The flow network over min_acc samples as polylines of sample indices, each from its head down to where it
    meets a larger one (or the edge), largest first. The first is the main river."""
    ups = {}
    for k in np.nonzero(acc >= min_acc)[0]:
        d = down[k]
        if d >= 0:
            ups.setdefault(int(d), []).append(int(k))
    edge = [k for k in np.nonzero(acc >= min_acc)[0] if down[k] < 0]
    lines = []
    stack = [(int(max(edge, key=lambda k: acc[k])), None)]
    for k in sorted(edge, key=lambda k: -acc[k])[1:]:
        stack.append((int(k), None))
    while stack:
        start, into = stack.pop(0)
        line = [start] if into is None else [into, start]
        k = start
        while True:
            up = sorted(ups.get(k, []), key=lambda u: -acc[u])
            if not up:
                break
            for u in up[1:]:
                stack.append((u, k))
            k = up[0]
            line.append(k)
        lines.append(line[::-1])
    lines.sort(key=lambda l: -max(acc[k] for k in l))
    return lines


def chaikin(p, rounds=3):
    p = np.asarray(p, float)
    for _ in range(rounds):
        q = np.empty((2 * len(p) - 2, 2))
        q[0::2] = 0.75 * p[:-1] + 0.25 * p[1:]
        q[1::2] = 0.25 * p[:-1] + 0.75 * p[1:]
        p = np.vstack([p[:1], q, p[-1:]])
    return p


def resample(p, step):
    seg = np.hypot(*np.diff(p, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], max(2, int(s[-1] / step) + 1))
    return np.stack([np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])], -1)


def sample_xz(k, n=F_N):
    j, i = divmod(int(k), n)
    return -F_HALF + F_CELL * i, -F_HALF + F_CELL * j


def inside_part(line, margin=600):
    """The longest run of the line's samples inside the square (plus margin), or []."""
    best, run = [], []
    for k in line:
        x, z = sample_xz(k)
        if abs(x) <= HALF + margin and abs(z) <= HALF + margin:
            run.append(k)
        else:
            best, run = (run if len(run) > len(best) else best), []
    return run if len(run) > len(best) else best


def bilinear(h, x, z):
    fx = (np.asarray(x) + HALF) / H_CELL
    fz = (np.asarray(z) + HALF) / H_CELL
    i = np.clip(np.floor(fx).astype(int), 0, H_N - 2)
    j = np.clip(np.floor(fz).astype(int), 0, H_N - 2)
    tx, tz = fx - i, fz - j
    return (h[j, i] * (1 - tx) * (1 - tz) + h[j, i + 1] * tx * (1 - tz) + h[j + 1, i] * (1 - tx) * tz
            + h[j + 1, i + 1] * tx * tz)


def distance_to(points, gx, gz):
    """Each grid point's distance to the polyline and the index of its nearest vertex."""
    from scipy.spatial import cKDTree
    dense = resample(points, 3.0)
    tree = cKDTree(dense)
    d, k = tree.query(np.stack([gx.ravel(), gz.ravel()], -1))
    near = cKDTree(points).query(dense[k])[1]
    return d.reshape(gx.shape), near.reshape(gx.shape)


def thalweg(h, guide, reach=210.0):
    """The river's line on the 30 m ground. The 60 m flow's line (guide, head to mouth) is the river's course but
    stands off its bed by up to a cell or two, so the bed is found again on the finer grid: the cheapest path from
    the guide's first sample in the square to its last, through samples within reach of the guide, a step costing
    its length times the square of its height over the lowest ground near it plus one, which keeps it in the
    valley's bottom."""
    from scipy.spatial import cKDTree
    n = H_N
    dense = resample(guide, 10.0)
    keep = (np.abs(dense[:, 0]) < HALF - H_CELL) & (np.abs(dense[:, 1]) < HALF - H_CELL)
    dense = dense[keep]
    w = -HALF + H_CELL * np.arange(n)
    gx, gz = np.meshgrid(w, w)
    dist, _ = cKDTree(dense).query(np.stack([gx.ravel(), gz.ravel()], -1), distance_upper_bound=reach)
    ok = np.isfinite(dist).reshape(n, n)
    low = ndimage.minimum_filter(np.where(ok, h, np.inf), size=11)
    cost = (np.maximum(h - low, 0) + 1) ** 2
    idx = lambda x, z: int(round((z + HALF) / H_CELL)) * n + int(round((x + HALF) / H_CELL))
    start, goal = idx(*dense[0]), idx(*dense[-1])
    best = {start: 0.0}
    back = {}
    pq = [(0.0, start)]
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    flat = cost.ravel()
    okf = ok.ravel()
    while pq:
        c, k = heapq.heappop(pq)
        if k == goal:
            break
        if c > best.get(k, np.inf):
            continue
        j, i = divmod(k, n)
        for dj, di in nb:
            jj, ii = j + dj, i + di
            if not (0 <= jj < n and 0 <= ii < n):
                continue
            kk = jj * n + ii
            if not okf[kk]:
                continue
            step = (1.4142 if dj and di else 1.0) * 0.5 * (flat[k] + flat[kk])
            nc = c + step
            if nc < best.get(kk, np.inf):
                best[kk] = nc
                back[kk] = k
                heapq.heappush(pq, (nc, kk))
    assert goal in back, 'the river\'s bed has no path inside its corridor'
    line = [goal]
    while line[-1] != start:
        line.append(back[line[-1]])
    print(f'   thalweg: {len(line)} samples')
    return np.array([sample_xz_h(k) for k in line[::-1]], float)


def descending_fit(v):
    """The least squares fit to v that never rises along it (pool adjacent violators): water that follows its bed
    as closely as water that only runs downhill can."""
    blocks = []
    for x in v:
        blocks.append([float(x), 1])
        while len(blocks) > 1 and blocks[-2][0] < blocks[-1][0]:
            m2, n2 = blocks.pop()
            m1, n1 = blocks.pop()
            blocks.append([(m1 * n1 + m2 * n2) / (n1 + n2), n1 + n2])
    return np.concatenate([[m] * n for m, n in blocks])


def sample_xz_h(k):
    j, i = divmod(int(k), H_N)
    return -HALF + H_CELL * i, -HALF + H_CELL * j


def build_river(h, acc, main):
    n = H_N
    from scipy.spatial import cKDTree
    pts = np.array([sample_xz(k) for k in main], float)
    a = np.array([acc[k] for k in main])
    bed = thalweg(h, pts)
    smooth = resample(chaikin(bed, 2), 20.0)
    acc_at = a[cKDTree(pts).query(smooth)[1]]
    km2 = acc_at * F_CELL * F_CELL / 1e6
    width = np.clip(34 + 14 * np.log10(np.maximum(km2, 1) / 400), 26, 48)
    # The bed's own ground, never rising downstream (the line runs head to mouth), a little under it.
    g = np.array([bilinear(h, x, z) for x, z in smooth])
    level = descending_fit(ndimage.uniform_filter1d(g, 5, mode='nearest') - 0.5)
    gap = g - level
    print(f'   ground over the water along the line: median {np.median(gap):.1f} m, p95 {np.percentile(gap, 95):.1f}, '
          f'max {gap.max():.1f}')
    w = -HALF + H_CELL * np.arange(n)
    gx, gz = np.meshgrid(w, w)
    d, near = distance_to(smooth, gx, gz)
    half = width[near] / 2
    lv = level[near]
    out = h.copy()
    inside = d < half
    out[inside] = np.minimum(out[inside], lv[inside] - RIVER_DEPTH * (1 - (d[inside] / half[inside]) ** 2) - 0.2)
    bank = (~inside) & (d < half + 60)
    rise = lv + BANK_RISE + (d - half) * 0.02
    out[bank] = np.maximum(out[bank], rise[bank])
    return out, {'points': smooth, 'width': width, 'level': level, 'km2': km2}


def write_rle(path, a):
    flat = a.ravel()
    change = np.nonzero(np.diff(flat))[0] + 1
    starts = np.concatenate([[0], change])
    runs = np.diff(np.concatenate([starts, [flat.size]]))
    out = bytearray(b'ILND')
    out += int(a.shape[1]).to_bytes(2, 'little') + int(a.shape[0]).to_bytes(2, 'little')
    for v, r in zip(flat[starts], runs):
        out.append(int(v))
        r = int(r)
        while True:
            b = r & 0x7F
            r >>= 7
            out.append(b | (0x80 if r else 0))
            if not r:
                break
    path.write_bytes(bytes(out))
    return len(out)


def clean_land(lc):
    land = np.full(lc.shape, PASTURE, np.uint8)
    for k, v in FROM_WORLDCOVER.items():
        land[lc == k] = v
    # One pass of a 3 by 3 majority: WorldCover's lone pixels are noise at the scale anything is drawn.
    counts = np.stack([ndimage.uniform_filter((land == c).astype(np.float32), 3, mode='nearest')
                       for c in range(BARE + 1)])
    return counts.argmax(0).astype(np.uint8)


def marsh(land, h, river, reach=130.0, rise=2.6):
    """Rio Sereno's marsh: open ground within reach of the water and less than rise over it is wetland, as on
    the slow rivers of the region; forest there stays forest (the gallery)."""
    w = -HALF + L_CELL / 2 + L_CELL * np.arange(L_N)
    gx, gz = np.meshgrid(w, w)
    d, near = distance_to(river['points'], gx, gz)
    over = bilinear(h, gx, gz) - river['level'][near]
    wet = (d < reach) & (over < rise) & (land != FOREST)
    wet &= d > river['width'][near] / 2
    land[wet] = WETLAND
    land[d <= river['width'][near] / 2] = WATER


def local_streams(h, river):
    """The streams on the 30 m ground's own flow: the paths are its valleys (the 60 m flow's stand off them),
    their catchments the part inside the square. The river's own line is left out."""
    from scipy.spatial import cKDTree
    down, acc = flow(h)
    lines = trace_network(down, acc, H_N, STREAM_KM2 * 1e6 / (H_CELL * H_CELL))
    rtree = cKDTree(resample(river['points'], 10.0))
    out = []
    for line in lines:
        if len(line) < 8:
            continue
        p = np.array([sample_xz_h(k) for k in line], float)
        d, _ = rtree.query(p)
        if np.median(d) < 80:
            continue
        p = p[d > river['width'].max() / 2 - 5] if (d <= river['width'].max() / 2 - 5).any() else p
        if len(p) < 6:
            continue
        p = resample(chaikin(p, 2), 30.0)
        if not (np.abs(p) < HALF).all():
            continue
        out.append({'id': f's{len(out)}', 'points': p, 'km2': acc[line[-2]] * H_CELL * H_CELL / 1e6})
    return out


def drains(h, km2=0.25):
    """The small drainage lines on the 30 m ground, over km2 of catchment: an authoring aid for places.js (the
    canada, the forest's gaps), written beside the data and never read by the game."""
    down, acc = flow(h)
    lines = trace_network(down, acc, H_N, km2 * 1e6 / (H_CELL * H_CELL))
    out = []
    for line in lines:
        if len(line) < 4:
            continue
        pts = [(-HALF + H_CELL * (k % H_N), -HALF + H_CELL * (k // H_N)) for k in line]
        out.append({'km2': float(acc[line[-2]] * H_CELL * H_CELL / 1e6), 'points': [[float(x), float(z)] for x, z in pts]})
    (DATA / 'drains.json').write_text(json.dumps(out))


def js_number(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


def write_hydro(river, streams):
    lines = ['/*',
             ' * hydro.js: Rio Sereno and its streams, GENERATED by tools/interior/build.py',
             ' * from the bare earth model\'s own flow: do not edit, rebuild. World',
             ' * metres (src/share/interior/frame.js): x east, z south.',
             ' *',
             ' *   RIVER    { points: [[x, z]], width: [m], level: [water y, m] }, from',
             ' *            its head to its mouth, a vertex every 20 m',
             ' *   STREAMS  [{ id, points: [[x, z]], km2 }], each from its head to where',
             ' *            it meets the river or a larger stream; km2 the catchment at',
             ' *            its lower end',
             ' *',
             ' * This file is part of WebFPVSimulator.',
             ' *',
             ' * WebFPVSimulator is free software: you can redistribute it and/or modify',
             ' * it under the terms of the GNU General Public License as published by',
             ' * the Free Software Foundation, either version 3 of the License, or (at',
             ' * your option) any later version.',
             ' *',
             ' * WebFPVSimulator is distributed in the hope that it will be useful, but',
             ' * WITHOUT ANY WARRANTY; without even the implied warranty of',
             ' * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU',
             ' * General Public License for more details.',
             ' *',
             ' * You should have received a copy of the GNU General Public License',
             ' * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.',
             ' */',
             '']
    pts = ','.join(f'[{js_number(x)},{js_number(z)}]' for x, z in river['points'])
    wd = ','.join(js_number(v) for v in river['width'])
    lv = ','.join(js_number(v) for v in river['level'])
    lines.append(f'export const RIVER = {{\n  points: [{pts}],\n  width: [{wd}],\n  level: [{lv}],\n}};')
    lines.append('')
    lines.append('export const STREAMS = [')
    for s in streams:
        p = ','.join(f'[{js_number(x)},{js_number(z)}]' for x, z in s['points'])
        lines.append(f"  {{ id: '{s['id']}', km2: {js_number(s['km2'])}, points: [{p}] }},")
    lines.append('];')
    (OUT / 'hydro.js').write_text('\n'.join(lines) + '\n')


def preview(h, land, river, streams):
    PREVIEW.mkdir(parents=True, exist_ok=True)
    pal = np.array([(40, 80, 160), (34, 80, 30), (150, 150, 80), (196, 170, 120), (110, 120, 60), (60, 130, 110),
                    (170, 110, 70)], np.uint8)
    img = pal[land[::4, ::4]].astype(float)
    hh = np.array(Image.fromarray(h.astype(np.float32)).resize(img.shape[1::-1], Image.BILINEAR))
    gy, gx = np.gradient(hh)
    img *= np.clip(1 + (gx - gy) * 0.15, 0.6, 1.4)[..., None]
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(im)
    s = im.size[0] / (2 * HALF)
    xy = lambda p: [((x + HALF) * s, (z + HALF) * s) for x, z in p]
    dr.line(xy(river['points']), fill=(80, 140, 255), width=3)
    for st in streams:
        dr.line(xy(st['points']), fill=(120, 170, 255), width=1)
    dr.rectangle([(HALF - 8000) * s, (HALF - 8000) * s, (HALF + 8000) * s, (HALF + 8000) * s], outline=(255, 255, 255))
    for k in range(17):
        x = (HALF - 8000 + k * 1000) * s
        dr.line([(x, (HALF + 8000) * s), (x, (HALF + 8000) * s + 6)], fill=(255, 255, 255))
        dr.line([((HALF - 8000) * s - 6, x), ((HALF - 8000) * s, x)], fill=(255, 255, 255))
    im.save(PREVIEW / 'ground.png')


# Nothing written may carry a coordinate: a decimal degree pair, or the source's tile names.
LEAK = re.compile(r'[NSns]\d{2}[EWew]\d{3}|-?\b(2[0-9]|5[0-9])\.\d{3,}\b')


def main():
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    print('== height')
    h = warp(SOURCES / 'anadem.tif', H_CELL, H_N, False, Resampling.bilinear, np.float32).astype(np.float64)
    print(f'   {h.min():.1f} .. {h.max():.1f} m')
    print('== flow')
    hf = warp(SOURCES / 'anadem_flow.tif', F_CELL, F_N, False, Resampling.bilinear, np.float32, F_HALF)
    down, acc = flow(hf)
    min_acc = STREAM_KM2 * 1e6 / (F_CELL * F_CELL)
    lines = [inside_part(l) for l in trace_network(down, acc, F_N, min_acc)]
    lines = [l for l in lines if len(l) >= 6]
    lines.sort(key=lambda l: -max(acc[k] for k in l))
    print('== river')
    h2, river = build_river(h, acc, lines[0])
    print(f"   {len(river['points'])} vertices, {river['km2'][0]:.0f} to {river['km2'][-1]:.0f} km2, "
          f"width {river['width'].min():.0f} to {river['width'].max():.0f} m, "
          f"level {river['level'][0]:.1f} to {river['level'][-1]:.1f} m")
    streams = local_streams(h, river)
    print(f'   {len(streams)} streams over {STREAM_KM2} km2 of catchment inside the square')
    drains(h)
    code = np.floor((h2 + 1000) * 10 + 0.5)
    assert code.min() >= 0 and code.max() <= 65535
    (OUT / 'height.bin').write_bytes(code.astype('<u2').tobytes())
    print('== land')
    lc = warp(SOURCES / 'worldcover0.tif', L_CELL, L_N, True, Resampling.nearest, np.uint8)
    land = clean_land(lc)
    marsh(land, h2, river)
    n = write_rle(OUT / 'land.bin', land)
    frac = {name: float((land == c).mean()) for name, c in
            [('water', WATER), ('forest', FOREST), ('pasture', PASTURE), ('crop', CROP), ('shrub', SHRUB),
             ('wetland', WETLAND), ('bare', BARE)]}
    print(f'   land.bin {n:,} bytes; ' + ', '.join(f'{k} {v:.1%}' for k, v in frac.items()))
    write_hydro(river, streams)
    preview(h2, land, river, streams)
    for f in ('height.bin', 'land.bin', 'hydro.js'):
        p = OUT / f
        if f.endswith('.js') and LEAK.search(p.read_text()):
            print(f'FAIL {p} carries what reads as a coordinate', file=sys.stderr)
            return 1
        print(f'   {f} {p.stat().st_size:,} bytes')
    meta = {'height': {'n': H_N, 'cell': H_CELL, 'half': HALF}, 'land': {'n': L_N, 'cell': L_CELL},
            'fractions': frac, 'river_km2': [float(river['km2'][0]), float(river['km2'][-1])]}
    (DATA / 'build.json').write_text(json.dumps(meta, indent=1) + '\n')
    print(f'built in {time.time() - t0:.0f} s; preview {PREVIEW / "ground.png"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
