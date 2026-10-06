# validate.py: re-reads the data folder and checks it against the
# contract (docs/ITAIPU-PLAN.md section 14, "Data formats"). Prints every
# group's result and every failure in it; exit status 1 if any failed.
#
#   files      the expected set and nothing else, tile sizes, every file
#              in the manifest with its sha256, the fetched total within
#              the plan's 25 MB (section 13), sources and attribution
#   tiles      tile counts and the origin rule, heights in range, shared
#              edges bit for bit, level L+1 the integer tent of level L
#              (tolerance 0 dm), the hero tiles whole level 0 tiles
#              covering the hero square, and level 0 equal to the hero
#              at every shared sample (tolerance 0 dm)
#   canopy     36 level 0 tiles, 0 to 40 m, shared edges
#   water      reservoir first at 219.0, river at 103.5, outlines of at
#              most 240 vertices, simple, disjoint and inside the ring;
#              each spawn on its body's water; every sample of the carved
#              bed connected to the spawn inside the outline; no sample
#              inside an outline lower than the level that is not bed
#   dam        every row of section 6's table with its figures, crest at
#              225, base at crest less height, each placed axis within 1 %
#              of its published length (2 % for the spillway's gate
#              bridge against its width), the crest lengths summing to
#              the published total, a citation per part whose quote is on
#              its page (when _sources is present), the ground under each
#              footprint as its groundRule says
#   osm        ids, every feature inside the square it belongs to, the
#              section 7 fields
#   imagery    1024 by 1024, colour sRGB, masks RGBA summing to 255
#
# Usage: uv run python validate.py
#
# This file is part of the Paraguayan Drone Combat Simulator.
#
# The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.

import hashlib
import json
import math
import sys

import numpy as np
import shapely
from PIL import Image
from scipy import ndimage
from shapely.geometry import LineString, Point, Polygon, box

from common import (DATA, HERO_HALF, HERO_I, HERO_J, HERO_X0, HERO_X1, LEVELS, RESERVOIR_Y, RING_HALF, RIVER_Y, SOURCES, TILE_BYTES,
                    TILE_CELLS, TILE_SAMPLES, decode, level_tiles, read_tile, tile_origin, tile_path, tile_size)

BUDGET = 25 * 1000 * 1000
LOW, HIGH = 95.0, 340.0
MAX_VERTICES = 240
ATTRIBUTION_NEEDS = ['ANADEM v1, Laipelt et al. 2024', 'CC BY 4.0', 'Copernicus DEM GLO-30', 'DLR e.V.',
                     'Airbus Defence and Space', 'Copernicus Sentinel data', 'OpenStreetMap contributors', 'ODbL']

# docs/ITAIPU-PLAN.md section 6's table, as the plan states it.
TABLE = {
    'main dam and connecting blocks': {'crestLength': 1064, 'maxHeight': 196, 'blocks': 69},
    'diversion structure': {'crestLength': 170, 'maxHeight': 162, 'blocks': 14},
    'right lateral dam': {'crestLength': 998, 'maxHeight': 64.5, 'blocks': 58},
    'spillway': {'length': 483, 'width': 362, 'maxHeight': 43.7, 'gates': 14, 'gateWidth': 20, 'gateHeight': 21.34,
                 'sillY': 199.16, 'blocks': 15, 'capacity': 62200},
    'powerhouse': {'length': 968, 'maxHeight': 112, 'width': 99, 'unitSpacing': 34, 'generatorFloorY': 108,
                   'roofY': 148},
    'penstocks': {'developedLength': 142.2, 'count': 20, 'innerDiameter': 10.5, 'discharge': 690},
    'intakes': {'count': 20, 'gateWidth': 8.2, 'gateHeight': 19.3, 'sillY': 177.6},
    'rockfill dam': {'crestLength': 1984, 'maxHeight': 70},
    'left bank earth dam': {'crestLength': 2294, 'maxHeight': 30},
    'right bank earth dam': {'crestLength': 872, 'maxHeight': 25},
    'Hernandarias dike': {'crestLength': 175},
    'whole dam': {'crestLength': 7919, 'maxHeight': 196},
}
CREST_Y = 225.0
# Parts whose axis is the published length cut from the crest road, and
# parts whose axis is an OSM way the published figure is checked against.
BY_LENGTH = {'right lateral dam', 'main dam and connecting blocks', 'diversion structure', 'rockfill dam',
             'left bank earth dam'}
BY_OSM = {'right bank earth dam': ('crestLength', 0.01), 'spillway': ('width', 0.02)}

failures = []
results = []


def check(ok, msg):
    if not ok:
        failures.append(msg)
    return ok


def group(name, detail=''):
    n = len(failures) - sum(r[1] for r in results)
    results.append((name, n))
    print(('FAIL ' if n else 'ok   ') + name + (f'\n     {detail}' if detail else ''))
    for f in failures[len(failures) - n:][:30]:
        print('       ' + f)
    if n > 30:
        print(f'       ... and {n - 30} more')


def expected_files():
    files = set()
    for L in LEVELS:
        files |= {tile_path(L, i, j) for i, j in level_tiles(L)}
    files |= {tile_path(-1, i, j) for i, j in level_tiles(-1)}
    files |= {f'canopy/{i}_{j}.bin' for i, j in level_tiles(0)}
    files |= {'imagery/hero.jpg', 'imagery/ring.jpg', 'masks/hero.png', 'masks/ring.png', 'water.json', 'dam.json'}
    files |= {f'osm/{n}.json' for n in ('buildings', 'roads', 'power', 'trees', 'landuse')}
    return files


def mosaic(tiles, reader):
    i0, j0 = min(i for i, _ in tiles), min(j for _, j in tiles)
    n, m = max(i for i, _ in tiles) - i0 + 1, max(j for _, j in tiles) - j0 + 1
    out = np.full((m * TILE_CELLS + 1, n * TILE_CELLS + 1), -1, dtype=np.int64)
    for i, j in tiles:
        out[(j - j0) * TILE_CELLS:(j - j0) * TILE_CELLS + TILE_SAMPLES,
            (i - i0) * TILE_CELLS:(i - i0) * TILE_CELLS + TILE_SAMPLES] = reader(i, j)
    return out


def check_edges(tiles, reader, what):
    have = set(tiles)
    pairs = 0
    for i, j in tiles:
        a = reader(i, j)
        if (i + 1, j) in have:
            pairs += 1
            check(np.array_equal(a[:, -1], reader(i + 1, j)[:, 0]), f'{what} {i}_{j} east edge differs')
        if (i, j + 1) in have:
            pairs += 1
            check(np.array_equal(a[-1, :], reader(i, j + 1)[0, :]), f'{what} {i}_{j} south edge differs')
    return pairs


def check_files(man, present):
    want = expected_files()
    for f in sorted(want - present):
        check(False, f'missing {f}')
    for f in sorted(present - want):
        check(False, f'unexpected {f}')
    for f in sorted(want & present):
        if f.endswith('.bin'):
            size = (DATA / f).stat().st_size
            expect = TILE_BYTES if not f.startswith('canopy') else TILE_SAMPLES * TILE_SAMPLES
            check(size == expect, f'{f}: {size} bytes, expected {expect}')
    listed = set(man['files'])
    check(listed == present, f'manifest lists {len(listed - present)} missing and misses {len(present - listed)} present')
    for f in sorted(listed & present):
        check(hashlib.sha256((DATA / f).read_bytes()).hexdigest() == man['files'][f], f'manifest: {f} checksum differs')
    total = sum((DATA / f).stat().st_size for f in present)
    check(total <= BUDGET, f'{total:,} bytes, over the plan\'s {BUDGET:,}')
    check(man['bytes']['total'] == total, 'manifest byte total differs from the files')
    for L in man['levels']:
        check(L['tiles'] == len(level_tiles(L['level'])), f'manifest: level {L["level"]} count')
    check(man['hero']['tiles'] == [[i, j] for i, j in level_tiles(-1)], 'manifest: hero tile set')
    for s in man['sources']:
        check(bool(s['licence']) and all(f.get('retrieved') and f.get('sha256') for f in s['files']),
              f'manifest: source {s["what"]} lacks a licence, date or checksum')
    text = ' '.join(man['attribution'])
    for need in ATTRIBUTION_NEEDS:
        check(need in text, f'manifest attribution lacks "{need}"')
    readme = DATA / 'README.md'
    if check(readme.exists() and (DATA / 'LICENCE.md').exists(), 'README.md or LICENCE.md missing'):
        r = readme.read_text()
        for line in man['attribution']:
            check(line in r, f'README.md lacks the attribution line "{line[:40]}..."')
    return total


def tile_checks():
    cache = {}

    def reader(level, dtype='<u2', root=None):
        def r(i, j):
            key = (root, level, i, j)
            if key not in cache:
                p = DATA / (f'{root}/{i}_{j}.bin' if root else tile_path(level, i, j))
                cache[key] = read_tile(p, dtype).astype(np.int64)
            return cache[key]
        return r

    stats, mos = [], {}
    for L in LEVELS:
        tiles = level_tiles(L)
        n = max(i for i, _ in tiles) + 1
        s = tile_size(L)
        check(n * s >= 2 * RING_HALF and (n - 1) * s < 2 * RING_HALF, f'level {L}: {n} tiles of {s} m do not just cover the ring')
        check(tile_origin(L, 0, 0) == (-RING_HALF, -RING_HALF), f'level {L}: origin rule')
        mos[L] = m = mosaic(tiles, reader(L))
        k = int(2 * RING_HALF // (s / TILE_CELLS)) + 1
        inner = decode(m[:k, :k])
        check(inner.min() >= LOW and inner.max() <= HIGH, f'level {L}: ring ground {inner.min():.1f} .. {inner.max():.1f}')
        pairs = check_edges(tiles, reader(L), f'level {L}')
        stats.append(f'L{L}: {len(tiles)} tiles of {s:.0f} m, {pairs} shared edges, ring {inner.min():.1f} .. {inner.max():.1f} m')
    for L in list(LEVELS)[:-1]:
        fine, coarse = mos[L], mos[L + 1]
        rs, cs = np.arange(coarse.shape[0]), np.arange(coarse.shape[1])
        fr, fc = 2 * rs, 2 * cs
        okr, okc = (fr >= 1) & (fr + 1 < fine.shape[0]), (fc >= 1) & (fc + 1 < fine.shape[1])
        rr, cc = np.meshgrid(fr[okr], fc[okc], indexing='ij')
        w = np.array([1, 2, 1])
        acc = np.zeros(rr.shape, dtype=np.int64)
        for di in range(3):
            for dj in range(3):
                acc += w[di] * w[dj] * fine[rr + di - 1, cc + dj - 1]
        diff = np.abs(coarse[np.ix_(rs[okr], cs[okc])] - (acc + 8) // 16)
        check(diff.max() == 0, f'level {L + 1}: {int((diff > 0).sum())} samples differ from the tent of level {L}')
        stats.append(f'L{L + 1} vs L{L}: {diff.size} samples, max tent error {diff.max()} dm')
    htiles = level_tiles(-1)
    hero = mosaic(htiles, reader(-1))
    pairs = check_edges(htiles, reader(-1), 'hero')
    h = decode(hero)
    check(h.min() >= LOW and h.max() <= HIGH, f'hero ground {h.min():.1f} .. {h.max():.1f}')
    x0, z0 = tile_origin(-1, HERO_I.start, HERO_J.start)
    x1 = x0 + len(HERO_I) * tile_size(-1)
    l0 = tile_size(0)
    check((x0, z0) == (HERO_X0, HERO_X0) and x1 == HERO_X1 and len(HERO_I) == len(HERO_J),
          'hero tiles are not the HERO_X0 .. HERO_X1 square')
    # The engine splits a level 0 node into hero nodes only where all nine
    # children have data: the hero must be whole level 0 tiles.
    check((x0 + RING_HALF) % l0 == 0 and (x1 + RING_HALF) % l0 == 0,
          f'hero {x0:.0f} .. {x1:.0f} is not whole level 0 tiles')
    check(x0 <= -HERO_HALF and x1 >= HERO_HALF, 'hero tiles do not cover the hero square')
    stats.append(f'hero: {len(htiles)} tiles, x and z {x0:.0f} .. {x1:.0f} (whole level 0 tiles), {pairs} shared '
                 f'edges, {h.min():.1f} .. {h.max():.1f} m')
    mos[-1] = hero
    return mos, h, stats


def hero_vs_l0(mos, stats):
    # Every third hero sample is a level 0 sample, and level 0 is built
    # from the hero there: the codes must be equal, not near.
    c0 = int((HERO_X0 + RING_HALF) / 30)
    sub = mos[-1][::3, ::3]
    l0 = mos[0][c0:c0 + sub.shape[0], c0:c0 + sub.shape[1]]
    d = np.abs(sub - l0)
    check(d.max() == 0, f'hero vs level 0: {int((d > 0).sum())} of {d.size} shared samples differ, worst {d.max()} dm')
    stats.append(f'hero vs level 0: all {d.size} shared samples equal (level 0 is the hero there)')


def canopy_checks():
    tiles = level_tiles(0)
    r = lambda i, j: read_tile(DATA / 'canopy' / f'{i}_{j}.bin', 'u1').astype(np.int64)
    m = mosaic(tiles, r)
    check(m.min() >= 0 and m.max() <= 40, f'canopy {m.min()} .. {m.max()} m')
    pairs = check_edges(tiles, r, 'canopy')
    return f'{len(tiles)} tiles, {pairs} shared edges, 0 .. {m.max()} m, {(m >= 5).mean():.1%} of samples at 5 m or more'


def ground_at(mos, h, x, z):
    """The finest tile's sample nearest (x, z)."""
    if HERO_X0 <= x <= HERO_X1 and HERO_X0 <= z <= HERO_X1:
        return h[int(round((z - HERO_X0) / 10)), int(round((x - HERO_X0) / 10))]
    return decode(mos[0][int(round((z + RING_HALF) / 30)), int(round((x + RING_HALF) / 30))])


def water_checks(water, mos, h, dam):
    ring = box(-RING_HALF, -RING_HALF, RING_HALF, RING_HALF)
    check([b['name'] for b in water] == ['reservoir', 'river'], 'water.json: not reservoir then river')
    want = {'reservoir': RESERVOIR_Y, 'river': RIVER_Y}
    polys, lines = {}, []
    for b in water:
        check(b['y'] == want.get(b['name']), f'{b["name"]}: level {b["y"]}, section 5 says {want.get(b["name"])}')
        n = len(b['outline'])
        check(3 <= n <= MAX_VERTICES, f'{b["name"]}: {n} outline vertices')
        p = Polygon(b['outline'])
        check(p.is_valid and p.is_simple, f'{b["name"]}: outline not a simple polygon')
        check(ring.buffer(0.05).contains(p), f'{b["name"]}: outline leaves the ring square')
        check(b['holes'] == [], f'{b["name"]}: holes (the plant takes one ring)')
        for k in ('bedDepth', 'spawn', 'fetch'):
            check(k in b, f'{b["name"]}: no {k}')
        s = b['spawn']
        check(p.contains(Point(s['x'], s['z'])), f'{b["name"]}: spawn outside the outline')
        g = ground_at(mos, h, s['x'], s['z'])
        check(g <= b['y'] - b['bedDepth'] + 0.05, f'{b["name"]}: ground {g:.1f} m under the spawn, not bed')
        check(len(b['fetch']) == 16 and all(0 <= v <= 12000 for v in b['fetch'].values()), f'{b["name"]}: fetch')
        polys[b['name']] = p
        lines.append(f'{b["name"]}: y {b["y"]}, {n} vertices, {p.area / 1e6:.1f} km2, spawn on {g:.1f} m, '
                     f'fetch {min(b["fetch"].values()):.0f} .. {max(b["fetch"].values()):.0f} m')
    if len(polys) == 2:
        inter = polys['reservoir'].intersection(polys['river']).area
        check(inter == 0, f'outlines overlap by {inter:.1f} m2')
        lines.append(f'outlines disjoint, {polys["reservoir"].distance(polys["river"]):.1f} m apart')

    # The carved bed: samples at exactly the level less the bed depth,
    # connected to the spawn. Every one must be inside the outline.
    zones = []
    for e in dam:
        zone = (e.get('burn') or {}).get('zone')
        if zone:
            g = Polygon(e['footprint']) if e['footprint'] else LineString(e['axis'])
            zones.append(g.buffer(zone + 10.0))
    dam_zone = shapely.union_all(zones)
    # A footprint is flattened to groundY, which can equal a bed's level
    # (the main dam's is the tailrace bed): those samples are the dam's.
    feet = shapely.union_all([Polygon(e['footprint']).buffer(1.0) for e in dam if e['footprint']])
    for b in water:
        p = polys.get(b['name'])
        if p is None:
            continue
        for grid, a, cell, x0, x1, depth in ((None, h, 10.0, HERO_X0, HERO_X1, b['bedDepth']),
                                              (0, decode(mos[0]), 30.0, -RING_HALF, RING_HALF, b['bedDepthRing'])):
            n = int((x1 - x0) // cell) + 1
            a = a[:n, :n]
            xs = x0 + cell * np.arange(n)
            # The carved bed is level less depth, or lower where the source
            # already was (ANADEM's river reads down to 101.5 in the ring).
            bed = (a <= b['y'] - depth + 0.05) & (a >= b['y'] - depth - 1.5)
            s = b['spawn']
            seed_rc = (int(round((s['z'] - x0) / cell)), int(round((s['x'] - x0) / cell)))
            lab, _ = ndimage.label(bed, structure=np.ones((3, 3), dtype=bool))
            k = lab[seed_rc]
            if grid == 0 and k == 0:
                # The ring's bed under a hero spawn: take the largest bed piece.
                sizes = ndimage.sum(bed, lab, range(1, lab.max() + 1))
                k = 1 + int(np.argmax(sizes))
            check(k > 0, f'{b["name"]}: no carved bed at the spawn ({"hero" if grid is None else "level 0"})')
            if grid == 0:
                # Inside the hero the hero tiles are the ground.
                c = (xs < HERO_X0) | (xs > HERO_X1)
                outside_hero = c[:, None] | c[None, :]
            else:
                outside_hero = np.ones(a.shape, dtype=bool)
            rr, cc = np.nonzero((lab == k) & outside_hero)
            pts = shapely.points(xs[cc], xs[rr])
            dams = shapely.contains(feet, pts)
            pts, rr, cc = pts[~dams], rr[~dams], cc[~dams]
            out = ~shapely.contains(p.buffer(0.05), pts)
            where = 'hero' if grid is None else 'level 0'
            check(not out.any(), f'{b["name"]}: {int(out.sum())} of {out.size} bed samples ({where}) outside the '
                  f'outline, first {xs[cc][out][0] if out.any() else 0:.0f}, {xs[rr][out][0] if out.any() else 0:.0f}')
            # Inside the outline, ground under the level is bed or the dam's.
            xx, zz = np.meshgrid(xs, xs)
            inside = shapely.contains(p, shapely.points(xx.ravel(), zz.ravel())).reshape(a.shape) & outside_hero
            low = inside & (a < b['y'] - 0.05) & (a > b['y'] - depth + 0.05)
            if low.any():
                rr, cc = np.nonzero(low)
                low_pts = shapely.points(xs[cc], xs[rr])
                stray = ~shapely.contains(dam_zone, low_pts)
            else:
                stray = np.zeros(0, dtype=bool)
            check(not stray.any(), f'{b["name"]}: {int(stray.sum())} samples ({where}) inside the outline lie under the '
                  f'water and are not bed')
            lines.append(f'{b["name"]} ({where}): {out.size} bed samples all inside the outline, '
                         f'{int(low.sum())} under-water non-bed samples inside it, all in the dam\'s zones')
    return lines


def dam_checks(dam):
    parts = {e['part']: e for e in dam}
    lines = []
    for name, figs in TABLE.items():
        e = parts.get(name)
        if not check(e is not None, f'dam.json: no entry for "{name}"'):
            continue
        for k, v in figs.items():
            check(e['figures'].get(k) == v, f'{name}: {k} {e["figures"].get(k)}, the table says {v}')
        check(e['crestY'] == CREST_Y, f'{name}: crestY {e["crestY"]}')
        # The powerhouse's 112 m stand under its roof, the rest under the crest.
        top = figs['roofY'] if name == 'powerhouse' else CREST_Y
        if 'maxHeight' in figs:
            check(e['baseY'] == round(top - figs['maxHeight'], 1), f'{name}: baseY {e["baseY"]}')
        check(bool(e['source']) and all(s.get('page') and s.get('quote') for s in e['source']),
              f'{name}: no citation')
        if name in BY_LENGTH:
            L = LineString(e['axis']).length
            want = figs['crestLength']
            check(abs(L - want) <= 0.01 * want, f'{name}: axis {L:.0f} m, published {want} m')
        if name in BY_OSM:
            k, tol = BY_OSM[name]
            L = LineString(e['axis']).length
            check(abs(L - figs[k]) <= tol * figs[k], f'{name}: axis {L:.0f} m against the published {figs[k]} m')
            lines.append(f'{name}: OSM axis {L:.0f} m, published {k} {figs[k]} m ({(L - figs[k]) / figs[k]:+.1%})')
        if e['footprint']:
            check(e['groundY'] is not None, f'{name}: footprint without groundY')
        for x, z in (e['axis'] or []) + (e['footprint'] or []):
            check(abs(x) <= HERO_HALF and abs(z) <= HERO_HALF, f'{name}: point {x}, {z} outside the hero')
    total = sum(TABLE[n]['crestLength'] for n in ('right lateral dam', 'main dam and connecting blocks',
                                                  'diversion structure', 'rockfill dam', 'left bank earth dam',
                                                  'right bank earth dam', 'Hernandarias dike')) + TABLE['spillway']['width']
    check(total == TABLE['whole dam']['crestLength'], f'crest lengths sum to {total}, not {TABLE["whole dam"]["crestLength"]}')
    whole = LineString(parts['whole dam']['axis']).length
    lines.append(f'crest lengths and the spillway width sum to {total} m, the published total; the crest road is '
                 f'{whole:.0f} m against {total - 175} m without the Hernandarias dike')
    pages = SOURCES / 'itaipu-pages'
    if pages.exists():
        import build_dam
        texts = {}
        for e in dam:
            for s in e['source']:
                name = s['file'].split('/')[-1].removesuffix('.html')
                texts.setdefault(name, build_dam.page_text(name))
                check(s['quote'] in texts[name], f'{e["part"]}: quote not on {name}: {s["quote"][:50]}')
        lines.append(f'every quote found on its page ({sum(len(e["source"]) for e in dam)} citations)')
    else:
        lines.append('quotes not re-read: no _sources/itaipu-pages here')
    return lines


def footprint_checks(dam, h):
    """The ground under every concrete footprint is what its groundRule says: flat at groundY, at most the right
    lateral dam's foundation, under the powerhouse's roof, and falling with the spillway's chute."""
    lines = []
    xs = HERO_X0 + 10.0 * np.arange(h.shape[1])
    xx, zz = np.meshgrid(xs, xs)
    for e in dam:
        if not e['footprint']:
            continue
        inside = shapely.contains_xy(Polygon(e['footprint']), xx, zz)
        g = h[inside]
        rule = e.get('groundRule')
        if rule == 'chute':
            sec = next(s for s in e['sections'] if s['at'] == 'chute')
            (ax, az), (bx, bz) = sec['axis'][0], sec['axis'][-1]
            n = math.hypot(bx - ax, bz - az)
            d = ((xx - ax) * (bx - ax) + (zz - az) * (bz - az)) / n
            k = np.array(e['groundProfile'])
            want = np.interp(d[inside], k[:, 0], k[:, 1])
            off = np.abs(g - want).max()
            check(off <= 0.051, f'{e["part"]}: ground off its profile by {off:.2f} m')
            check(k[:, 1].max() <= e['baseY'] + 0.05, f'{e["part"]}: ground profile over the foundation')
            lines.append(f'{e["part"]}: {g.size} samples on the chute ground profile within {off:.2f} m, '
                         f'{g.max():.1f} m at the gates to {g.min():.1f} m at the flip buckets')
            continue
        flat = np.abs(g - e['groundY']).max()
        check(flat <= 0.051, f'{e["part"]}: ground under the footprint off groundY {e["groundY"]} by {flat:.2f} m')
        if rule == 'ring, at most baseY':
            check(e['groundY'] <= e['baseY'] + 0.05, f'{e["part"]}: groundY {e["groundY"]} over baseY {e["baseY"]}')
        if e['part'] == 'powerhouse':
            check(g.max() < e['figures']['roofY'], f'powerhouse: ground {g.max():.1f} m over the roof')
        lines.append(f'{e["part"]}: {g.size} samples flat at {e["groundY"]} m ({rule})')
    return lines


def osm_checks():
    lines = []
    hero = box(-HERO_HALF, -HERO_HALF, HERO_HALF, HERO_HALF).buffer(0.05)
    ring = box(-RING_HALF, -RING_HALF, RING_HALF, RING_HALF).buffer(0.05)

    def pts_of(f):
        if 'outer' in f:
            return f['outer'] + [p for r in f['holes'] for p in r]
        if 'points' in f:
            return f['points']
        return [[f['x'], f['z']]]

    for name in ('buildings', 'roads', 'power', 'trees', 'landuse'):
        doc = json.loads((DATA / 'osm' / f'{name}.json').read_text())
        check('OpenStreetMap contributors' in doc.get('attribution', ''), f'osm/{name}.json: no attribution')
        feats = doc['features'] if 'features' in doc else [f for k in ('towers', 'lines', 'substations', 'plants')
                                                            for f in doc[k]]
        outside = 0
        for f in feats:
            check(isinstance(f.get('id'), str) and f['id'][0] in 'nwr' and f['id'][1:].isdigit(),
                  f'osm/{name}.json: bad id {f.get("id")}')
            sq = ring if f.get('square') == 'ring' else hero
            a = np.asarray(pts_of(f), dtype=np.float64)
            if not shapely.contains(sq, shapely.points(a)).all():
                outside += 1
        check(outside == 0, f'osm/{name}.json: {outside} features outside their square')
        if name == 'buildings':
            for f in feats:
                check(f['height'] > 0 and f['heightFrom'] and f['roof'] and f['roofFrom'], f'building {f["id"]}: fields')
            lines.append(f'buildings: {len(feats)}, heights from {doc["heightFromCounts"]}')
        elif name == 'roads':
            for f in feats:
                check(f['width'] > 0 and len(f['points']) >= 2, f'road {f["id"]}: fields')
            ring_n = sum(1 for f in feats if f.get('square') == 'ring')
            lines.append(f'roads: {len(feats)} pieces, {ring_n} in the ring (the Friendship Bridge), '
                         f'{sum(1 for f in feats if f.get("onDam"))} on the dam')
        elif name == 'power':
            lines.append('power: ' + ', '.join(f'{k} {len(doc[k])}' for k in ('towers', 'lines', 'substations', 'plants')))
        else:
            lines.append(f'{name}: {len(feats)}')
    return lines


def imagery_checks():
    lines = []
    for name in ('hero', 'ring'):
        im = Image.open(DATA / 'imagery' / f'{name}.jpg')
        check(im.size == (1024, 1024) and im.mode == 'RGB', f'imagery/{name}.jpg: {im.size} {im.mode}')
        m = Image.open(DATA / 'masks' / f'{name}.png')
        check(m.size == (1024, 1024) and m.mode == 'RGBA', f'masks/{name}.png: {m.size} {m.mode}')
        s = np.asarray(m, dtype=np.int32).sum(axis=-1)
        check((s == 255).all(), f'masks/{name}.png: {int((s != 255).sum())} pixels do not sum to 255')
        lines.append(f'{name}: jpg {(DATA / "imagery" / f"{name}.jpg").stat().st_size:,} bytes, png '
                     f'{(DATA / "masks" / f"{name}.png").stat().st_size:,} bytes, weights sum to 255 everywhere')
    return lines


def main():
    present = {str(p.relative_to(DATA)) for p in DATA.rglob('*') if p.is_file()
               and not any(q.startswith('_') or q.startswith('.') for q in p.relative_to(DATA).parts)
               and p.name not in ('manifest.json', 'README.md', 'LICENCE.md')}
    man = json.loads((DATA / 'manifest.json').read_text())
    total = check_files(man, present)
    group('files', f'{len(present)} files, {total:,} bytes (budget {BUDGET:,}), manifest checksums, '
                   f'{len(man["sources"])} sources, attribution in the manifest and README.md')
    mos, h, stats = tile_checks()
    water = json.loads((DATA / 'water.json').read_text())
    dam = json.loads((DATA / 'dam.json').read_text())
    hero_vs_l0(mos, stats)
    group('tiles', '\n     '.join(stats))
    group('canopy', canopy_checks())
    group('water', '\n     '.join(water_checks(water, mos, h, dam)))
    group('dam', '\n     '.join(dam_checks(dam) + footprint_checks(dam, h)))
    group('osm', '\n     '.join(osm_checks()))
    group('imagery', '\n     '.join(imagery_checks()))
    print(f'{len(failures)} failed' if failures else 'ALL CHECKS PASSED')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
