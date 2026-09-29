# osm.py: the OpenStreetMap cut in _sources/osm, read once and put in
# world metres: nodes as (x, z), ways as point lists, multipolygon
# relations assembled into shapely polygons from their member ways.
#
# The cut keeps a way whole if any node of it is inside the fetch square,
# so a relation that runs past the square (the reservoir, the rivers)
# can have rings that do not close here. Those rings are dropped, and
# say so: the Copernicus water mask, not OpenStreetMap, carries the water
# bodies (build_water.py).
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

import gzip
import json
from functools import cached_property

import numpy as np
from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.ops import linemerge, polygonize, unary_union

from common import E0, N0, SOURCES, UTM


class Osm:
    def __init__(self):
        reg = json.loads((SOURCES / 'sources.json').read_text())
        with gzip.open(SOURCES / reg['osm']['file'], 'rt') as f:
            doc = json.load(f)
        self.meta = reg['osm']
        els = doc['elements']
        raw = [e for e in els if e['type'] == 'node']
        t = Transformer.from_crs('EPSG:4326', UTM, always_xy=True)
        e, n = t.transform(np.array([r['lon'] for r in raw]), np.array([r['lat'] for r in raw]))
        self.xz = {r['id']: (float(a - E0), float(N0 - b)) for r, a, b in zip(raw, e, n)}
        self.nodes = {r['id']: r for r in raw}
        self.ways = {w['id']: w for w in els if w['type'] == 'way'}
        self.rels = {r['id']: r for r in els if r['type'] == 'relation'}

    def points(self, way):
        return [self.xz[n] for n in way['nodes'] if n in self.xz]

    def line(self, way):
        p = self.points(way)
        return LineString(p) if len(p) > 1 else None

    def closed(self, way):
        nd = way['nodes']
        return len(nd) > 3 and nd[0] == nd[-1]

    def polygon(self, way):
        p = self.points(way)
        if not self.closed(way) or len(p) < 4:
            return None
        g = Polygon(p)
        return g if g.is_valid else g.buffer(0)

    def multipolygon(self, rel):
        """(polygon or None, number of member ways missing or left in open rings)."""
        rings = {'outer': [], 'inner': []}
        missing = 0
        for m in rel['members']:
            if m['type'] != 'way':
                continue
            w = self.ways.get(m['ref'])
            ln = self.line(w) if w else None
            if ln is None:
                missing += 1
                continue
            rings['inner' if m['role'] == 'inner' else 'outer'].append(ln)
        polys = {}
        for role, lines in rings.items():
            merged = linemerge(lines) if lines else None
            parts = list(polygonize(merged)) if merged is not None and not merged.is_empty else []
            polys[role] = unary_union(parts) if parts else None
        outer = polys['outer']
        if outer is None:
            return None, missing
        if polys['inner'] is not None:
            outer = outer.difference(polys['inner'])
        return (outer if outer.is_valid else outer.buffer(0)), missing

    @cached_property
    def tagged_ways(self):
        return [w for w in self.ways.values() if w.get('tags')]


def polygons_of(geom):
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in getattr(geom, 'geoms', []) if isinstance(g, Polygon)]


def ring_xz(ring):
    """A shapely ring as [[x, z], ...] without the repeated closing point."""
    c = list(ring.coords)
    if len(c) > 1 and c[0] == c[-1]:
        c = c[:-1]
    return [[round(x, 1), round(z, 1)] for x, z in c]
