# build_roads.py: roads, boardwalks and paved paths in world metres,
# clipped to the extent: roads.json. Public domain sources only: the NPS
# national roads and trails datasets inside the park and US Census TIGER
# roads outside it (West Yellowstone, Gardiner, the highways in). Not
# OpenStreetMap, whose licence is not public domain.
#
# A TIGER line is dropped where it runs along an NPS road (80 percent of
# its length within 25 m of one): the park's own centreline is the one
# kept. Widths are estimates by class, since neither source gives one.
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
from collections import Counter

import numpy as np
import pyogrio
import shapely
from pyproj import Transformer

from common import DATA, E0, EXTENT, N0, SOURCES, UTM, bounds_in, dump_json

# Carriageway width in metres by class: two 3.6 m lanes and a margin for
# the park's main roads, less for spurs and service roads.
NPS_ROAD_WIDTH = {'Primary': 8.0, 'Secondary': 7.5, 'Local': 6.0, 'Service': 4.0, 'Private': 4.0, '4WD': 3.5}
# MTFCC: primary, secondary, local, ramp. Tracks, walkways, alleys and
# private drives outside the park are not kept.
TIGER_WIDTH = {'S1100': 11.0, 'S1200': 8.0, 'S1400': 7.0, 'S1630': 5.0}
BOARDWALK_WIDTH = 2.4
PATH_WIDTH = 2.5
SIMPLIFY = 1.0


def world(geom, crs):
    t = Transformer.from_crs(crs, UTM, always_xy=True)

    def f(c):
        e, n = t.transform(c[:, 0], c[:, 1])
        return np.column_stack([np.asarray(e) - E0, N0 - np.asarray(n)])
    return shapely.transform(shapely.force_2d(geom), f)


def lines(g):
    g = shapely.clip_by_rect(g, -EXTENT, -EXTENT, EXTENT, EXTENT)
    parts = [g] if g.geom_type == 'LineString' else list(getattr(g, 'geoms', []))
    return [p.simplify(SIMPLIFY) for p in parts if p.geom_type == 'LineString' and p.length >= 1]


def emit(out, kind, name, cls, width, g):
    for p in lines(g):
        out.append({'kind': kind, 'name': name or None, 'class': cls, 'width': width,
                    'points': [[round(float(x), 1), round(float(z), 1)] for x, z in shapely.get_coordinates(p)]})


def main():
    out = []
    nps_roads = []
    for f in json.loads((SOURCES / 'roads' / 'nps_roads_yell.geojson').read_text())['features']:
        if not f['geometry']:
            continue
        p = f['properties']
        g = world(shapely.geometry.shape(f['geometry']), 'EPSG:4326')
        nps_roads.append(g)
        emit(out, 'road', p.get('RDNAME') or p.get('MAPLABEL'), p['RDCLASS'], NPS_ROAD_WIDTH[p['RDCLASS']], g)
    for f in json.loads((SOURCES / 'roads' / 'nps_trails_yell.geojson').read_text())['features']:
        p = f['properties']
        surface = p.get('TRLSURFACE')
        if not f['geometry'] or surface not in ('Wood', 'Asphalt', 'Concrete'):
            continue
        g = world(shapely.geometry.shape(f['geometry']), 'EPSG:4326')
        kind, width = ('boardwalk', BOARDWALK_WIDTH) if surface == 'Wood' else ('path', PATH_WIDTH)
        emit(out, kind, (p.get('TRLNAME') or '').strip() or None, surface, width, g)

    near_nps = shapely.union_all([g.buffer(25) for g in nps_roads])
    shapely.prepare(near_nps)
    dropped = 0
    for zp in sorted((SOURCES / 'roads').glob('tl_*_roads.zip')):
        meta, _, geom, fields = pyogrio.raw.read(f'/vsizip/{zp}', columns=['FULLNAME', 'MTFCC'],
                                                 bbox=bounds_in('EPSG:4269', -EXTENT, EXTENT, -EXTENT, EXTENT))
        crs = meta['crs']
        for name, mtfcc, wkb in zip(fields[0], fields[1], geom):
            if mtfcc not in TIGER_WIDTH:
                continue
            g = world(shapely.from_wkb(wkb), crs)
            if g.length and shapely.intersection(g, near_nps).length > 0.8 * g.length:
                dropped += 1
                continue
            emit(out, 'road', name, mtfcc, TIGER_WIDTH[mtfcc], g)

    dump_json(DATA / 'roads.json', {
        'frame': 'world metres, x east, z south',
        'sources': 'NPS Public Roads and Public Trails (UNITCODE YELL); US Census TIGER/Line roads outside the park',
        'units': {'width': 'm, estimated by class'},
        'lines': out,
    })
    c = Counter((l['kind'], l['class']) for l in out)
    km = Counter()
    for l in out:
        km[l['kind']] += float(np.sum(np.hypot(*np.diff(np.array(l['points']), axis=0).T))) / 1000
    print(f'roads.json: {len(out)} lines, {dropped} TIGER lines dropped as duplicates of NPS roads')
    print('  km by kind', {k: round(v, 1) for k, v in km.items()})
    print('  by class', dict(c))


if __name__ == '__main__':
    main()
