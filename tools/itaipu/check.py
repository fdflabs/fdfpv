# check.py: proves the fetched sources are the ones docs/ITAIPU-PLAN.md
# was written from, and prints the numbers the plan quotes. Exit status 1
# on any failed expectation, so it can gate a rebuild of the data folder.
#
#   1. every file in _sources/sources.json is present with its sha256
#   2. both DEMs cover the fetch square with no nodata, and read the
#      reservoir and the tailwater at the levels the plan uses
#   3. Sentinel-2's scene classification over the hero and ring squares
#      is under the plan's cloud and nodata limits
#   4. the OpenStreetMap extract holds the dam, spillway, powerhouse,
#      substations and power lines the plan builds, and its counts
#
# Usage: uv run python check.py
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

import gzip
import json
import sys
from collections import Counter

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.warp import Resampling, reproject
from shapely.geometry import LineString, Polygon, box

from common import E0, HERO_HALF, N0, RING_HALF, SOURCES, UTM
from fetch import sha256

# Levels in world y (metres above EGM2008) that the plan puts the water
# at, and how far a DEM may read from them. Copernicus flattens water
# bodies to one height per body, so these are exact to a few centimetres.
RESERVOIR_Y = 219.0
LEVEL_TOL = 0.05
# The river below the dam is not one flat body in Copernicus: it steps
# down in half metres from 105.0 at the tailrace to 102.0 three km
# downstream, and stays at 102.0 to the triple frontier. The plant's water
# is one flat level per body, so the plan puts the river at the middle of
# that range, 103.5, and carves the bed under it; the waterline on the
# canyon walls is then within 1.5 m of the DEM's. This check holds the
# data to that range: a source whose river reads outside it breaks the
# plan's one-body river, and the plan must change, not this number.
RIVER_Y = 103.5
RIVER_SPREAD = 1.5

# Sentinel-2 scene classification: 0 nodata, 3 cloud shadow, 8 and 9
# cloud, 10 thin cirrus.
SCL_BAD = [0, 3, 8, 9, 10]
SCL_BAD_MAX = 0.005

fails = []


def expect(ok, what):
    print(('  ok    ' if ok else '  FAIL  ') + what)
    if not ok:
        fails.append(what)


def grid(half, cell):
    """A world-aligned UTM grid: the transform and shape for a square of the given half width."""
    n = int(round(2 * half / cell))
    return rasterio.transform.from_origin(E0 - half, N0 + half, cell, cell), (n, n)


def warp(path, half, cell, resampling=Resampling.bilinear):
    tf, shape = grid(half, cell)
    out = np.full(shape, np.nan, dtype=np.float32)
    with rasterio.open(path) as src:
        reproject(rasterio.band(src, 1), out, src_transform=src.transform, src_crs=src.crs,
                  dst_transform=tf, dst_crs=UTM, resampling=resampling, src_nodata=src.nodata, dst_nodata=np.nan)
    return out


def at(a, half, cell, x, z):
    """Value of a world grid from warp() at world (x, z)."""
    return a[int((z + half) // cell), int((x + half) // cell)]


def check_files(reg):
    print('files')
    for key, it in sorted(reg.items()):
        p = SOURCES / it['file']
        expect(p.exists() and sha256(p) == it['sha256'], f'{key}: {it["file"]} {it["bytes"]:,} bytes')


def check_dem():
    print('elevation (world grid, 30 m, ring square)')
    cop = warp(SOURCES / 'dem/Copernicus_DSM_COG_10_S26_00_W055_00_DEM.tif', RING_HALF, 30)
    ana = warp(SOURCES / 'dem/anadem_v1_21J_itaipu.tif', RING_HALF, 30)
    for name, a in (('copernicus', cop), ('anadem', ana)):
        expect(not np.isnan(a).any(), f'{name}: no nodata over the ring square, range {np.nanmin(a):.1f} to {np.nanmax(a):.1f} m')
    # Water cells are the ones Copernicus flattened to the reservoir's value.
    res = np.abs(cop - RESERVOIR_Y) < 0.05
    expect(res.mean() > 0.1, f'reservoir: {res.mean():.1%} of the ring square reads {RESERVOIR_Y} m in Copernicus')
    # Probe points from docs/ITAIPU-PLAN.md section 2, world metres.
    probes = {'reservoir 2.5 km N of the crest': (1484, -4206, RESERVOIR_Y),
              'reservoir 10 km N': (4112, -10254, RESERVOIR_Y)}
    for name, (x, z, want) in probes.items():
        # The levels come from Copernicus, which flattens each water body to
        # one value; ANADEM's water is not flat (0.3 m off in the canyon),
        # so it is reported, not held to the level.
        c, a = at(cop, RING_HALF, 30, x, z), at(ana, RING_HALF, 30, x, z)
        expect(abs(c - want) <= LEVEL_TOL, f'{name}: copernicus {c:.2f} (anadem {a:.2f}), plan {want}')
    # Water is where Copernicus is flat: a cell equal to all eight
    # neighbours on the source's own values (nearest, not bilinear).
    near = warp(SOURCES / 'dem/Copernicus_DSM_COG_10_S26_00_W055_00_DEM.tif', RING_HALF, 30, Resampling.nearest)
    k = int((RING_HALF - HERO_HALF) / 30)
    h = near[k - 1:-k + 1, k - 1:-k + 1]
    c = h[1:-1, 1:-1]
    flat = np.ones_like(c, dtype=bool)
    for dz in (0, 1, 2):
        for dx in (0, 1, 2):
            flat &= h[dz:dz + c.shape[0], dx:dx + c.shape[1]] == c
    river = c[flat & (c < 150)]
    expect(river.size > 1000 and np.abs(river - RIVER_Y).max() <= RIVER_SPREAD,
           f'river in the hero square: {river.size} flat cells read {river.min():.1f} to {river.max():.1f}, '
           f'plan {RIVER_Y} +- {RIVER_SPREAD}')
    crest = at(cop, RING_HALF, 30, 60, -1672)
    expect(crest < 215, f'main dam crest cell reads {crest:.1f} m: a 30 m DEM cannot hold the 225 m crest, so the dam is geometry')
    hero = slice(int((RING_HALF - HERO_HALF) / 30), int((RING_HALF + HERO_HALF) / 30))
    land = ~res[hero, hero] & (cop[hero, hero] > RIVER_Y + RIVER_SPREAD)
    canopy = (cop - ana)[hero, hero][land]
    print(f'  info  hero land cells: Copernicus minus ANADEM median {np.median(canopy):.1f} m, '
          f'90th percentile {np.percentile(canopy, 90):.1f} m (canopy and buildings ANADEM removed)')


def check_imagery(reg):
    print('imagery')
    # The fetch square spans two tiles of one pass; a world grid is filled
    # from 21JYM first, then 21JYN where 21JYM has no data.
    tf, shape = grid(RING_HALF, 20)
    scl = np.zeros(shape, dtype=np.uint8)
    for tile in ('21JYM', '21JYN'):
        part = np.zeros(shape, dtype=np.uint8)
        with rasterio.open(SOURCES / reg[f's2_{tile}_scl']['file']) as src:
            reproject(rasterio.band(src, 1), part, src_transform=src.transform, src_crs=src.crs, dst_transform=tf,
                      dst_crs=UTM, resampling=Resampling.nearest, src_nodata=0, dst_nodata=0)
        scl = np.where(scl == 0, part, scl)
    for name, half in (('hero', HERO_HALF), ('ring', RING_HALF)):
        k = int((RING_HALF - half) / 20)
        a = scl[k:shape[0] - k, k:shape[1] - k]
        bad = np.isin(a, SCL_BAD).mean()
        hist = Counter(a.ravel().tolist())
        expect(bad <= SCL_BAD_MAX, f'{name} square: {bad:.3%} nodata, cloud or shadow (limit {SCL_BAD_MAX:.1%}); '
               f'water {hist.get(6, 0) / a.size:.1%}, vegetation {hist.get(4, 0) / a.size:.1%}, '
               f'bare {hist.get(5, 0) / a.size:.1%}')
    for tile in ('21JYM', '21JYN'):
        for band in ('blue', 'green', 'red', 'nir'):
            with rasterio.open(SOURCES / reg[f's2_{tile}_{band}']['file']) as src:
                b = src.bounds
                expect(src.res == (10.0, 10.0) and str(src.crs) == UTM,
                       f'{tile} {band}: 10 m in {UTM}, N {b.bottom:.0f} to {b.top:.0f}, E {b.left:.0f} to {b.right:.0f}')


def check_osm(reg):
    print('openstreetmap')
    with gzip.open(SOURCES / reg['osm']['file'], 'rt') as f:
        doc = json.load(f)
    print('  info  osm data to ' + ', '.join(f'{k} {v["replication_timestamp"]}' for k, v in reg['osm']['extracts'].items()))
    nodes = {e['id']: (e['lon'], e['lat']) for e in doc['elements'] if e['type'] == 'node'}
    ways = [e for e in doc['elements'] if e['type'] == 'way' and 'tags' in e]
    rels = [e for e in doc['elements'] if e['type'] == 'relation' and 'tags' in e]
    fwd = Transformer.from_crs('EPSG:4326', UTM, always_xy=True)

    def world(nd):
        pts = [fwd.transform(*nodes[n]) for n in nd if n in nodes]
        return [(e - E0, -(n - N0)) for e, n in pts]

    def inside(line, half):
        return any(abs(x) <= half and abs(z) <= half for x, z in line)

    hero = [(w, world(w['nodes'])) for w in ways]
    buildings = [w for w, g in hero if 'building' in w['tags'] and inside(g, HERO_HALF)]
    b_rel = [r for r in rels if 'building' in r['tags']]
    heights = sum(1 for w in buildings if 'height' in w['tags'] or 'building:levels' in w['tags'])
    expect(len(buildings) > 500, f'buildings in the hero square: {len(buildings)} ways + {len(b_rel)} relations, '
           f'{heights} with height or levels')
    roads = Counter(w['tags']['highway'] for w, g in hero if 'highway' in w['tags'] and inside(g, HERO_HALF))
    road_m = sum(LineString(g).length for w, g in hero if 'highway' in w['tags'] and len(g) > 1 and inside(g, HERO_HALF))
    expect(road_m > 50000, f'roads touching the hero square: {sum(roads.values())} ways, {road_m / 1000:.0f} km; '
           + ', '.join(f'{k} {v}' for k, v in roads.most_common(8)))
    dams = [(w, g) for w, g in hero if w['tags'].get('waterway') == 'dam' or w['tags'].get('man_made') == 'dyke']
    dam_m = sum(LineString(g).length if g[0] != g[-1] else 0 for w, g in dams if inside(g, HERO_HALF) and len(g) > 1)
    dam_area = sum(Polygon(g).area for w, g in dams if inside(g, HERO_HALF) and len(g) > 3 and g[0] == g[-1])
    expect(len(dams) >= 4, f'dam and dyke ways in the hero square: {len(dams)} ({dam_m:.0f} m of lines, '
           f'{dam_area / 1e4:.1f} ha of areas)')
    lines = [(w, g) for w, g in hero if w['tags'].get('power') in ('line', 'minor_line') and len(g) > 1]
    towers = sum(1 for e in doc['elements'] if e['type'] == 'node' and e.get('tags', {}).get('power') == 'tower'
                 and abs(fwd.transform(e['lon'], e['lat'])[0] - E0) <= HERO_HALF
                 and abs(fwd.transform(e['lon'], e['lat'])[1] - N0) <= HERO_HALF)
    ring_box = box(-RING_HALF, -RING_HALF, RING_HALF, RING_HALF)
    ring_km = sum(LineString(g).intersection(ring_box).length for w, g in lines) / 1000
    expect(len(lines) > 10 and towers > 100, f'power lines: {len(lines)} ways, {ring_km:.0f} km inside the ring square; '
           f'towers in the hero square: {towers}')
    subs = [w for w, g in hero if w['tags'].get('power') == 'substation' and inside(g, HERO_HALF)]
    expect(len(subs) >= 2, f'substations in the hero square: {len(subs)} '
           + ', '.join(sorted({w["tags"].get("name", "?") for w in subs}))[:200])
    water = [(w, g) for w, g in hero if w['tags'].get('natural') == 'water' or 'water' in w['tags']]
    wrel = [r for r in rels if r['tags'].get('natural') == 'water' or r['tags'].get('water')]
    print(f'  info  water: {len(water)} ways, {len(wrel)} relations '
          + ', '.join(sorted({r["tags"].get("name", "?") for r in wrel}))[:200])
    spill = [w for w, g in hero if 'spillway' in json.dumps(w['tags']).lower() or 'vertedouro' in json.dumps(w['tags']).lower()]
    print(f'  info  ways tagged or named as spillway: {len(spill)}')
    landuse = Counter(w['tags']['landuse'] for w, g in hero if 'landuse' in w['tags'] and inside(g, HERO_HALF))
    print('  info  landuse ways in the hero square: ' + ', '.join(f'{k} {v}' for k, v in landuse.most_common(10)))
    trees = sum(1 for e in doc['elements'] if e['type'] == 'node' and e.get('tags', {}).get('natural') == 'tree')
    print(f'  info  natural=tree nodes in the hero square: {trees}')
    print('landmarks (world x, z; docs/ITAIPU-PLAN.md section 2)')
    by_id = {w['id']: g for w, g in hero}
    for wid, name in LANDMARK_WAYS.items():
        g = by_id.get(wid)
        expect(g is not None and len(g) > 1, f'way {wid} {name}: ' + describe(g))
    for nid, name in LANDMARK_NODES.items():
        n = next((e for e in doc['elements'] if e['type'] == 'node' and e['id'] == nid), None)
        ok = n is not None
        x, z = world([nid]) [0] if ok else (0, 0)
        expect(ok, f'node {nid} {name}: {x:.0f}, {z:.0f}')


# The OpenStreetMap features section 2's landmark table is read from.
LANDMARK_WAYS = {
    32236291: 'main dam and powerhouse (building, "Usina Hidreletrica de Itaipu")',
    428443544: 'right lateral dam footprint, main dam to spillway (waterway=dam area, height 150)',
    32303023: 'right lateral dam axis (waterway=dam line)',
    32303021: 'dam axis east of the main dam (waterway=dam line)',
    262637862: 'spillway (waterway=dam area, usage=spillway)',
    428251279: 'left bank rockfill and earth dams (waterway=dam area)',
    262638260: 'left bank crest road (highway=service)',
    30657423: 'rockfill crest road, the straight part (highway=service)',
    32302779: 'Itaipu right bank substation (power=substation, 50 Hz, 500 kV)',
    32300871: 'Foz do Iguacu converter station (power=substation, HVDC)',
    262532170: 'Acaray hydro plant (power=plant)',
    26122712: 'Friendship Bridge (bridge, Puente de la Amistad)',
}
LANDMARK_NODES = {7029899286: 'Mirante da Barragem (tourism=viewpoint)',
                  12272109001: 'Mirante do Vertedouro (tourism=viewpoint)'}


def describe(g):
    if not g:
        return 'missing'
    if g[0] == g[-1] and len(g) > 3:
        p = Polygon(g)
        r = list(p.minimum_rotated_rectangle.exterior.coords)
        a, b = LineString(r[:2]).length, LineString(r[1:3]).length
        long_ = r[:2] if a >= b else r[1:3]
        ang = np.degrees(np.arctan2(long_[1][1] - long_[0][1], long_[1][0] - long_[0][0])) % 180
        return (f'area {p.area / 1e4:.1f} ha, centroid {p.centroid.x:.0f}, {p.centroid.y:.0f}, '
                f'{max(a, b):.0f} x {min(a, b):.0f} m, long side {ang:.1f} deg from +x toward +z')
    return f'line {LineString(g).length:.0f} m from {g[0][0]:.0f}, {g[0][1]:.0f} to {g[-1][0]:.0f}, {g[-1][1]:.0f}'


if __name__ == '__main__':
    reg = json.loads((SOURCES / 'sources.json').read_text())
    check_files(reg)
    check_dem()
    check_imagery(reg)
    if 'osm' in reg:
        check_osm(reg)
    else:
        expect(False, 'osm: not fetched')
    print(f'{len(fails)} failed' if fails else 'all passed')
    sys.exit(1 if fails else 0)
