# validate.py: re-reads the data folder and checks it against the
# contract. Exits non-zero on the first failed group, printing every
# failure in it.
#
# Tile checks: every expected file exists at 132 098 bytes and nothing
# else is there; ground inside the extent lies in 1500 to 3700 m (the
# park runs from about 1600 m where the Yellowstone leaves it to 3462 m on
# Eagle Peak, and the extent reaches past the park's east edge onto
# Overlook Mountain in the Absarokas, 3606 m, and down the Yellowstone to
# about 1560 m below Gardiner); neighbours share their edge samples bit
# for bit; and each
# level L+1 sample equals the (1 2 1) x (1 2 1) / 16 average of the nine
# level L samples around it, rounded half up. That tolerance is zero
# decimetres: build_dem.py makes each level from the previous level's
# codes in integers, so anything else is a bug, not rounding.
#
# Spot elevations are sampled bilinearly from the finest tile present
# and compared with published values.
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

import hashlib
import json
import math
import sys

import numpy as np
from pyproj import Transformer

from common import (DATA, EXTENT, HERO_CELL, LEVELS, TILE_CELLS, TILE_SAMPLES, UTM, Y0, cell, decode, hero_origin,
                    hero_tiles, level_tiles, read_tile, tile_origin, tile_size, utm_to_world)

TILE_BYTES = TILE_SAMPLES * TILE_SAMPLES * 2
LOW, HIGH = 1500.0, 3700.0
NLCD = {11, 12, 21, 22, 23, 24, 31, 41, 42, 43, 52, 71, 81, 82, 90, 95}

# Contract landmarks, world x, z.
LANDMARKS = {
    'Old Faithful': (-26325, 17964),
    'Grand Prismatic Spring': (-27143, 10790),
    'Mammoth Hot Springs': (-16630, -39394),
    'Lower Falls': (-83, -10748),
    'Yellowstone Lake centre': (11718, 18939),
    'West Yellowstone airport': (-49335, -7343),
}

# name, lat, lon (GNIS unless noted), published elevation m, tolerance
# m, search radius m (0 samples the point; more takes the highest ground
# within it, for a summit a 30 m grid may straddle).
SPOTS = [
    # GNIS 1592386 Old Faithful Geyser; about 2240 m (7350 ft), NPS.
    ('Old Faithful', 44.46048, -110.828276, 2240.0, 15.0, 0),
    # GNIS 1609321 Mount Washburn; 3122 m (10 243 ft), NPS.
    ('Mount Washburn summit', 44.797557, -110.4339048, 3122.0, 10.0, 100),
    # Contract landmark near the lake's centre; 2357 m (7733 ft), NPS.
    ('Yellowstone Lake surface', None, None, 2357.0, 3.0, 0),
    # GNIS 1591192 Mammoth, the village; about 1900 m (6239 ft), NPS.
    ('Mammoth', 44.9766022, -110.701599, 1900.0, 20.0, 0),
]

failures = []


def check(ok, msg):
    if not ok:
        failures.append(msg)
    return ok


def group(name):
    if failures:
        print(f'FAIL {name}:')
        for f in failures[:40]:
            print('  ' + f)
        if len(failures) > 40:
            print(f'  ... and {len(failures) - 40} more')
        sys.exit(1)
    print(f'ok   {name}')


def mosaic(tiles, reader):
    # One array per level, NaN where a tile is not written.
    n = max(i for i, _ in tiles) + 1
    m = max(j for _, j in tiles) + 1
    out = np.full((m * TILE_CELLS + 1, n * TILE_CELLS + 1), -1, dtype=np.int64)
    for i, j in tiles:
        t = reader(i, j)
        out[j * TILE_CELLS:j * TILE_CELLS + TILE_SAMPLES, i * TILE_CELLS:i * TILE_CELLS + TILE_SAMPLES] = t
    return out


def check_edges(tiles, reader, what):
    have = set(tiles)
    pairs = 0
    for i, j in tiles:
        a = reader(i, j)
        if (i + 1, j) in have:
            pairs += 1
            check(np.array_equal(a[:, -1], reader(i + 1, j)[:, 0]), f'{what} {i}_{j} east edge differs from {i + 1}_{j}')
        if (i, j + 1) in have:
            pairs += 1
            check(np.array_equal(a[-1, :], reader(i, j + 1)[0, :]), f'{what} {i}_{j} south edge differs from {i}_{j + 1}')
    return pairs


def expected_files():
    files = set()
    for L in LEVELS:
        files |= {f'{L}/{i}_{j}.bin' for i, j in level_tiles(L)}
    files |= {f'hero/{i}_{j}.bin' for i, j in hero_tiles()}
    for L in (0, 1):
        files |= {f'landcover/{L}/{i}_{j}.bin' for i, j in level_tiles(L)}
    return files | {'hydro.json', 'thermal.json', 'roads.json'}


def main():
    present = {str(p.relative_to(DATA)) for p in DATA.rglob('*') if p.is_file()
               and not any(part.startswith('_') for part in p.relative_to(DATA).parts) and p.name != 'manifest.json'}
    want = expected_files()
    for f in sorted(want - present):
        check(False, f'missing {f}')
    for f in sorted(present - want):
        check(False, f'unexpected {f}')
    for f in sorted(want & present):
        if f.endswith('.bin'):
            size = (DATA / f).stat().st_size
            expect = TILE_BYTES if not f.startswith('landcover') else TILE_SAMPLES * TILE_SAMPLES
            check(size == expect, f'{f}: {size} bytes, expected {expect}')
    group(f'file set: {len(want)} files, sizes')

    cache = {}

    def elev_reader(level):
        def r(i, j):
            key = (level, i, j)
            if key not in cache:
                cache[key] = read_tile(DATA / ('hero' if level < 0 else str(level)) / f'{i}_{j}.bin').astype(np.int64)
            return cache[key]
        return r

    mosaics = {}
    stats = []
    for L in LEVELS:
        tiles = level_tiles(L)
        reader = elev_reader(L)
        mos = mosaic(tiles, reader)
        mosaics[L] = mos
        c = cell(L)
        k = int(round(2 * EXTENT / c))
        inner = decode(mos[:k + 1, :k + 1])
        check(inner.min() >= LOW and inner.max() <= HIGH,
              f'level {L}: ground in extent {inner.min():.1f} .. {inner.max():.1f} m, outside {LOW} .. {HIGH}')
        full = decode(mos)
        check(full.min() >= 1000 and full.max() <= 4500, f'level {L}: ground {full.min():.1f} .. {full.max():.1f} m')
        pairs = check_edges(tiles, reader, f'level {L}')
        stats.append(f'L{L} {len(tiles)} tiles, {pairs} shared edges, extent {inner.min():.1f} .. {inner.max():.1f} m')
    group('elevation tiles: range, shared edges\n     ' + '\n     '.join(stats))

    lines = []
    for L in list(LEVELS)[:-1]:
        fine, coarse = mosaics[L], mosaics[L + 1]
        # Coarse sample (r, c) sits on fine sample (2r, 2c); check those
        # whose whole 3 x 3 support is written at level L.
        rs = np.arange(coarse.shape[0])
        cs = np.arange(coarse.shape[1])
        fr, fc = 2 * rs, 2 * cs
        okr = (fr >= 1) & (fr + 1 < fine.shape[0])
        okc = (fc >= 1) & (fc + 1 < fine.shape[1])
        rr, cc = np.meshgrid(fr[okr], fc[okc], indexing='ij')
        w = np.array([1, 2, 1])
        acc = np.zeros(rr.shape, dtype=np.int64)
        valid = np.ones(rr.shape, dtype=bool)
        for di in range(3):
            for dj in range(3):
                v = fine[rr + di - 1, cc + dj - 1]
                valid &= v >= 0
                acc += w[di] * w[dj] * v
        expect = (acc + 8) // 16
        got = coarse[np.ix_(rs[okr], cs[okc])]
        valid &= got >= 0
        diff = np.abs(got - expect)[valid]
        check(diff.size > 0, f'level {L + 1}: no samples with a full level {L} support')
        check(diff.max() == 0, f'level {L + 1}: {int((diff > 0).sum())} of {diff.size} samples differ from the tent average '
              f'of level {L}, worst {diff.max()} dm')
        box = np.abs(decode(got[valid]) - decode(fine[rr, cc][valid]))
        lines.append(f'L{L + 1} vs L{L}: {diff.size} samples, max tent error {diff.max()} dm, '
                     f'coincident sample moved by the filter p50 {np.percentile(box, 50):.2f} m p99 {np.percentile(box, 99):.2f} m')
    group('levels: L+1 is the integer tent average of L, tolerance 0 dm\n     ' + '\n     '.join(lines))

    htiles = hero_tiles()
    hreader = elev_reader(-1)
    hmos = mosaic([(i - min(i for i, _ in htiles), j - min(j for _, j in htiles)) for i, j in htiles],
                  lambda i, j: hreader(i + min(a for a, _ in htiles), j + min(b for _, b in htiles)))
    h = decode(hmos)
    check(h.min() >= LOW and h.max() <= HIGH, f'hero ground {h.min():.1f} .. {h.max():.1f} m')
    pairs = check_edges(htiles, hreader, 'hero')
    # Every third hero sample is a level 0 sample.
    hx0, hz0 = hero_origin(*htiles[0])
    c0, r0 = int(round((hx0 + EXTENT) / cell(0))), int(round((hz0 + EXTENT) / cell(0)))
    sub = h[::3, ::3]
    l0 = decode(mosaics[0][r0:r0 + sub.shape[0], c0:c0 + sub.shape[1]])
    d = np.abs(sub - l0)
    med, p99 = float(np.median(d)), float(np.percentile(d, 99))
    check(med <= 1.0 and p99 <= 10.0, f'hero vs level 0: |diff| median {med:.2f} m p99 {p99:.2f} m (limits 1, 10)')
    group(f'hero tiles: {len(htiles)} tiles, {pairs} shared edges, {h.min():.1f} .. {h.max():.1f} m, '
          f'vs level 0 |diff| median {med:.2f} m p99 {p99:.2f} m max {d.max():.2f} m')

    to_utm = Transformer.from_crs('EPSG:4326', UTM, always_xy=True)

    def ground(x, z):
        hs = TILE_CELLS * HERO_CELL
        i, j = int((x + EXTENT) // hs), int((z + EXTENT) // hs)
        if (i, j) in set(htiles):
            ox, oz = hero_origin(i, j)
            t, c = decode(hreader(i, j)), HERO_CELL
        else:
            s = tile_size(0)
            i, j = int((x + EXTENT) // s), int((z + EXTENT) // s)
            ox, oz = tile_origin(0, i, j)
            t, c = decode(elev_reader(0)(i, j)), cell(0)
        fx, fz = (x - ox) / c, (z - oz) / c
        a, b = int(fx), int(fz)
        u, v = fx - a, fz - b
        return float((t[b, a] * (1 - u) + t[b, a + 1] * u) * (1 - v) + (t[b + 1, a] * (1 - u) + t[b + 1, a + 1] * u) * v)

    out = []
    for name, lat, lon, published, tol, radius in SPOTS:
        if lat is None:
            x, z = LANDMARKS['Yellowstone Lake centre']
        else:
            e, n = to_utm.transform(lon, lat)
            x, z = (float(q) for q in utm_to_world(e, n))
        if radius:
            got = max(ground(x + dx, z + dz) for dx in range(-radius, radius + 1, 10) for dz in range(-radius, radius + 1, 10)
                      if dx * dx + dz * dz <= radius * radius)
        else:
            got = ground(x, z)
        check(abs(got - published) <= tol, f'{name}: {got:.1f} m, published {published:.0f} m, tolerance {tol:.0f} m')
        out.append(f'{name}: {got:.1f} m, published {published:.0f} m, off {got - published:+.1f} m (tolerance {tol:.0f})')
    group('spot elevations\n     ' + '\n     '.join(out))

    for L in (0, 1):
        tiles = level_tiles(L)
        r = lambda i, j, L=L: read_tile(DATA / 'landcover' / str(L) / f'{i}_{j}.bin', dtype='u1')
        codes = set()
        for i, j in tiles:
            codes |= set(np.unique(r(i, j)).tolist())
        check(codes <= NLCD, f'landcover {L}: codes {sorted(codes - NLCD)} are not NLCD classes')
        check_edges(tiles, r, f'landcover {L}')
    group('landcover: NLCD classes, shared edges')

    pad = 0.05

    def inside(pts, what):
        a = np.asarray(pts, dtype=np.float64)
        bad = (np.abs(a) > EXTENT + pad).any(axis=1)
        check(not bad.any(), f'{what}: {int(bad.sum())} points outside the extent, first {a[bad][0].tolist() if bad.any() else None}')

    hydro = json.loads((DATA / 'hydro.json').read_text())
    for r in hydro['rivers']:
        check(len(r['points']) >= 2 and len(r['points']) == len(r['width']), f'river {r["name"]}: points and widths disagree')
        check(min(r['width']) > 0, f'river {r["name"]}: width not positive')
    inside([p for r in hydro['rivers'] for p in r['points']], 'rivers')
    inside([p for l in hydro['lakes'] for ring in l['rings'] for p in ring], 'lakes')
    names = {r['name'] for r in hydro['rivers']}
    for n in ('Yellowstone River', 'Firehole River', 'Madison River', 'Gibbon River', 'Lamar River', 'Gardner River'):
        check(n in names, f'hydro: no river named {n}')
    lake = [l for l in hydro['lakes'] if l['name'] == 'Yellowstone Lake']
    check(len(lake) >= 1, 'hydro: no Yellowstone Lake')
    ly = lake[0]['y'] + Y0 if lake else float('nan')
    check(abs(ly - 2357) <= 3, f'Yellowstone Lake surface {ly:.1f} m, published 2357 m')
    for l in hydro['lakes']:
        check(LOW <= l['y'] + Y0 <= HIGH and len(l['rings'][0]) >= 3, f'lake {l["name"]}: y {l["y"]} or ring bad')
    group(f'hydro.json: {len(hydro["rivers"])} rivers, {len(hydro["lakes"])} lakes, named rivers present, '
          f'Yellowstone Lake at {ly:.1f} m')

    thermal = json.loads((DATA / 'thermal.json').read_text())
    feats = thermal['features']
    ids = [f['id'] for f in feats]
    check(len(ids) == len(set(ids)), 'thermal: duplicate ids')
    check(len(feats) >= 9000, f'thermal: only {len(feats)} features')
    for f in feats:
        check(f['kind'] in thermal['kinds'], f'thermal {f["id"]}: kind {f["kind"]}')
        check(f['radius'] > 0, f'thermal {f["id"]}: radius {f["radius"]}')
    inside([[f['x'], f['z']] for f in feats], 'thermal')
    near = []
    for fname, lname in (('Old Faithful Geyser', 'Old Faithful'), ('Grand Prismatic Spring', 'Grand Prismatic Spring')):
        lx, lz = LANDMARKS[lname]
        m = [f for f in feats if f.get('name') == fname]
        dist = min((math.hypot(f['x'] - lx, f['z'] - lz) for f in m), default=float('inf'))
        check(dist <= 100, f'thermal: {fname} is {dist:.0f} m from the contract landmark')
        near.append(f'{fname} {dist:.0f} m from its landmark')
    of = [f for f in feats if f.get('name') == 'Old Faithful Geyser']
    check(bool(of) and of[0].get('interval') and of[0]['kind'] == 'geyser', 'thermal: Old Faithful has no interval')
    group(f'thermal.json: {len(feats)} features, ' + ', '.join(near))

    roads = json.loads((DATA / 'roads.json').read_text())
    kinds = {l['kind'] for l in roads['lines']}
    check(kinds <= {'road', 'boardwalk', 'path'} and {'road', 'boardwalk'} <= kinds, f'roads: kinds {kinds}')
    inside([p for l in roads['lines'] for p in l['points']], 'roads')
    for lname in ('Old Faithful', 'Grand Prismatic Spring'):
        lx, lz = LANDMARKS[lname]
        dist = min(math.hypot(p[0] - lx, p[1] - lz) for l in roads['lines'] if l['kind'] == 'boardwalk' for p in l['points'])
        check(dist <= 300, f'roads: nearest boardwalk vertex to {lname} is {dist:.0f} m')
    group(f'roads.json: {len(roads["lines"])} lines, kinds {sorted(kinds)}, boardwalks at the landmarks')

    man = json.loads((DATA / 'manifest.json').read_text())
    listed = set(man['files'])
    check(listed == present, f'manifest: {len(listed - present)} listed but missing, {len(present - listed)} present but unlisted')
    for f in sorted(listed & present):
        check(hashlib.sha256((DATA / f).read_bytes()).hexdigest() == man['files'][f], f'manifest: {f} checksum differs')
    for L in man['levels']:
        check(L['tiles'] == len(level_tiles(L['level'])), f'manifest: level {L["level"]} count')
    for s in man['sources']:
        check(bool(s['licence']) and all(f.get('published') or f.get('retrieved') for f in s['files']), f'manifest: source {s["what"]}')
    group(f'manifest.json: {len(listed)} checksums match, {len(man["sources"])} sources with dates and licences')
    print('ALL CHECKS PASSED')


if __name__ == '__main__':
    main()
