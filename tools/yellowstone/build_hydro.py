# build_hydro.py: rivers, streams and lakes from USGS NHDPlus High
# Resolution, in world metres, clipped to the extent: hydro.json.
#
# Kept: perennial streams of Strahler order 2 and up, every named stream,
# and river centrelines through mapped river areas; lakes and reservoirs
# of a hectare and up, and every named one. Lines through lakes are
# dropped because the lake polygon is the water there.
#
# Widths: NHD publishes none. Where a river is mapped as an area polygon
# (the Yellowstone below the lake, the Madison, the lower Firehole) the
# width at a vertex is twice its distance to the polygon's bank. Elsewhere
# it comes from stream order through ORDER_WIDTH, an estimate for
# mountain streams, never less than the area width where both exist.
#
# Lake surface y is the median of the level 0 ground inside the polygon:
# 3DEP flattens mapped water, so that median is the water level the DEM
# already draws.
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

import json
import warnings
import zipfile
from collections import defaultdict

import numpy as np
import pyogrio
import shapely
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.transform import Affine

from common import DATA, E0, EXTENT, N0, SOURCES, UTM, WORK, Y0, bounds_in, dump_json

warnings.filterwarnings('ignore', message='Measured')

# Strahler order to channel width in metres. A judgement from the park's
# rivers where their width is mapped: the Firehole at Old Faithful (order
# 4) is about 15 m, the Madison leaving the park (order 6) about 40 m.
ORDER_WIDTH = {1: 1.5, 2: 3.0, 3: 6.0, 4: 12.0, 5: 20.0, 6: 35.0, 7: 50.0, 8: 70.0}
SIMPLIFY_LINE = 5.0
SIMPLIFY_LAKE = 5.0
MIN_LAKE_KM2 = 0.01
STREAM_RIVER, ARTIFICIAL_PATH, CONNECTOR, CANAL = 460, 558, 334, 336
LAKE_POND, RESERVOIR = 390, 436
INTERMITTENT = {46003, 46007}

TO_UTM = Transformer.from_crs('EPSG:4269', UTM, always_xy=True)
BOX = shapely.box(-EXTENT, -EXTENT, EXTENT, EXTENT)


def to_world(geom):
    def f(coords):
        e, n = TO_UTM.transform(coords[:, 0], coords[:, 1])
        return np.column_stack([np.asarray(e) - E0, N0 - np.asarray(n)])
    return shapely.transform(shapely.force_2d(geom), f)


# NAD83 box around the extent; reading only what touches it is most of
# the run time saved, since the four HU4 basins are far larger.
NAD83_BOX = bounds_in('EPSG:4269', -EXTENT - 200, EXTENT + 200, -EXTENT - 200, EXTENT + 200)


def unzipped(zp):
    # A file geodatabase read through /vsizip seeks inside a deflated
    # stream: the flowline read took 50 s per basin that way, 0.1 s from
    # an extracted copy.
    gdb = WORK / 'nhd' / zp.name.replace('.zip', '.gdb')
    if not (gdb / 'gdb').exists():
        with zipfile.ZipFile(zp) as z:
            z.extractall(WORK / 'nhd', [n for n in z.namelist() if n.startswith(gdb.name + '/')])
    return str(gdb)


def layer(path, name, columns):
    spatial = name != 'NHDPlusFlowlineVAA'
    meta, _, geom, fields = pyogrio.raw.read(path, layer=name, columns=columns, read_geometry=spatial,
                                             bbox=NAD83_BOX if spatial else None)
    rows = {c: fields[k] for k, c in enumerate(meta['fields'])}
    if geom is not None:
        rows['geometry'] = shapely.from_wkb(geom)
    return rows


def lines_of(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'LineString':
        return [g]
    return [p for p in getattr(g, 'geoms', []) if p.geom_type == 'LineString' and not p.is_empty]


def polys_of(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon' and not p.is_empty]


class Ground:
    def __init__(self):
        meta = json.loads((WORK / 'l0_elev.json').read_text())
        self.elev = np.load(WORK / 'l0_elev.npy', mmap_mode='r')
        self.x0, self.z0, self.cell = meta['x0'], meta['z0'], meta['cell']
        self.transform = Affine(self.cell, 0, self.x0 - self.cell / 2, 0, self.cell, self.z0 - self.cell / 2)

    def at(self, x, z):
        fx, fz = (x - self.x0) / self.cell, (z - self.z0) / self.cell
        i, j = int(fx), int(fz)
        tx, tz = fx - i, fz - j
        e = self.elev
        return float((e[j, i] * (1 - tx) + e[j, i + 1] * tx) * (1 - tz) + (e[j + 1, i] * (1 - tx) + e[j + 1, i + 1] * tx) * tz)

    def lake_level(self, poly):
        minx, minz, maxx, maxz = poly.bounds
        i0, j0 = max(int((minx - self.x0) / self.cell) - 1, 0), max(int((minz - self.z0) / self.cell) - 1, 0)
        i1, j1 = int((maxx - self.x0) / self.cell) + 2, int((maxz - self.z0) / self.cell) + 2
        t = self.transform * Affine.translation(i0, j0)
        mask = rasterize([poly], out_shape=(j1 - j0, i1 - i0), transform=t, all_touched=False, dtype='uint8')
        vals = np.asarray(self.elev[j0:j1, i0:i1])[mask == 1]
        if vals.size >= 4:
            return float(np.median(vals)), int(vals.size)
        p = poly.representative_point()
        return self.at(p.x, p.y), 0


def main():
    ground = Ground()
    segments = {}
    lakes = {}
    river_areas = {}
    for zp in sorted((SOURCES / 'nhdplus').glob('NHDPLUS_H_*_HU4_GDB.zip')):
        path = unzipped(zp)
        vaa = layer(path, 'NHDPlusFlowlineVAA', ['NHDPlusID', 'StreamOrde'])
        order = dict(zip(vaa['NHDPlusID'].tolist(), vaa['StreamOrde'].tolist()))
        area = layer(path, 'NHDArea', ['Permanent_Identifier', 'GNIS_Name', 'FType'])
        for pid, name, ftype, g in zip(area['Permanent_Identifier'], area['GNIS_Name'], area['FType'], area['geometry']):
            if ftype == STREAM_RIVER:
                w = to_world(g)
                if w.intersects(BOX):
                    river_areas[pid] = shapely.make_valid(w)
        wb = layer(path, 'NHDWaterbody', ['Permanent_Identifier', 'GNIS_Name', 'FType', 'AreaSqKm'])
        lake_ids = set()
        for pid, name, ftype, km2, g in zip(wb['Permanent_Identifier'], wb['GNIS_Name'], wb['FType'], wb['AreaSqKm'], wb['geometry']):
            if ftype not in (LAKE_POND, RESERVOIR):
                continue
            lake_ids.add(pid)
            if km2 < MIN_LAKE_KM2 and not name:
                continue
            w = to_world(g)
            if not w.intersects(BOX):
                continue
            lakes[pid] = (name or None, shapely.make_valid(w))
        fl = layer(path, 'NHDFlowline', ['NHDPlusID', 'GNIS_Name', 'FType', 'FCode', 'WBArea_Permanent_Identifier'])
        for nid, name, ftype, fcode, wbid, g in zip(fl['NHDPlusID'], fl['GNIS_Name'], fl['FType'], fl['FCode'],
                                                     fl['WBArea_Permanent_Identifier'], fl['geometry']):
            if nid in segments:
                continue
            o = int(order.get(nid) or 0)
            if ftype not in (STREAM_RIVER, ARTIFICIAL_PATH, CONNECTOR, CANAL) or wbid in lake_ids:
                continue
            if not name and (o < 2 or fcode in INTERMITTENT):
                continue
            w = to_world(g)
            if not w.intersects(BOX):
                continue
            segments[nid] = (name or None, max(o, 1), wbid, w)
        print(f'{zp.name}: {len(segments)} segments, {len(lakes)} lakes, {len(river_areas)} river areas so far')

    # Per vertex width, carried to the merged lines by coordinate.
    width_at = {}
    by_name = defaultdict(list)
    for nid, (name, o, wbid, g) in segments.items():
        for line in lines_of(shapely.clip_by_rect(g, -EXTENT, -EXTENT, EXTENT, EXTENT)):
            line = line.simplify(SIMPLIFY_LINE)
            if line.length < 1:
                continue
            xy = shapely.get_coordinates(line)
            wv = np.full(len(xy), ORDER_WIDTH.get(o, 70.0))
            ra = river_areas.get(wbid)
            if ra is not None:
                d = shapely.distance(ra.boundary, shapely.points(xy))
                wv = np.clip(np.maximum(2 * d, wv), 1.0, 400.0)
            for (x, z), wd in zip(xy, wv):
                k = (round(x, 3), round(z, 3))
                width_at[k] = max(width_at.get(k, 0.0), float(wd))
            by_name[name].append(line)

    rivers = []
    for name, lines in by_name.items():
        merged = shapely.line_merge(shapely.MultiLineString(lines))
        for line in lines_of(merged):
            xy = shapely.get_coordinates(line)
            pts = [[round(float(x), 1), round(float(z), 1)] for x, z in xy]
            ws = [round(width_at.get((round(x, 3), round(z, 3)), 1.5), 1) for x, z in xy]
            rivers.append({'name': name, 'points': pts, 'width': ws})
    rivers.sort(key=lambda r: (r['name'] is None, r['name'] or '', -len(r['points'])))

    out_lakes = []
    for pid, (name, g) in lakes.items():
        for poly in polys_of(shapely.clip_by_rect(g, -EXTENT, -EXTENT, EXTENT, EXTENT)):
            poly = poly.simplify(SIMPLIFY_LAKE, preserve_topology=True)
            if poly.is_empty or poly.area < 100:
                continue
            level, n = ground.lake_level(poly)
            rings = [poly.exterior] + list(poly.interiors)
            out_lakes.append({
                'name': name,
                'y': round(level - Y0, 2),
                'area': round(poly.area),
                'samples': n,
                'rings': [[[round(float(x), 1), round(float(z), 1)] for x, z in shapely.get_coordinates(r)[:-1]] for r in rings],
            })
    out_lakes.sort(key=lambda l: -l['area'])

    hydro = {
        'frame': 'world metres, x east, z south, y = elevation - 2200',
        'source': 'USGS NHDPlus High Resolution, HU4 1002 1007 1008 1704',
        'rivers': rivers,
        'lakes': out_lakes,
    }
    dump_json(DATA / 'hydro.json', hydro)
    named = sorted({r['name'] for r in rivers if r['name']})
    print(f'hydro.json: {len(rivers)} polylines ({sum(len(r["points"]) for r in rivers)} vertices, '
          f'{len(named)} named streams), {len(out_lakes)} lakes')
    for l in out_lakes[:8]:
        print(f'  {l["name"]}: {l["area"] / 1e6:.2f} km2, surface {l["y"] + Y0:.1f} m from {l["samples"]} samples')


if __name__ == '__main__':
    main()
