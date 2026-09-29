# build_osm.py: osm/*.json, the OpenStreetMap features the hero builds
# (docs/ITAIPU-PLAN.md section 7), in world metres, each with its OSM id
# ("w123", "r123", "n123") so the derived database stays traceable, as
# ODbL asks.
#
#   buildings.json  every building wholly inside the hero square, less
#                   the ones inside a concrete dam footprint (dam.json
#                   builds those): outline, holes, height and where the
#                   height came from, roof shape and where it came from
#   roads.json      every highway way touching the hero, cut to the
#                   square, with its width and where the width came from;
#                   plus the ring's one landmark, the Friendship Bridge
#   power.json      towers and poles, lines cut to their towers inside
#                   the square, substations and plants
#   trees.json      natural=tree nodes
#   landuse.json    landuse, natural and leisure areas, cut to the square
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

import re

from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

from common import DATA, HERO_HALF, dump_json, r1
from osm import polygons_of, ring_xz

HERO = box(-HERO_HALF, -HERO_HALF, HERO_HALF, HERO_HALF)
LEVEL_M = 3.2
LEVEL_BASE = 1.0
DEFAULT_HEIGHT = {'house': 4.5, 'apartments': 12.0, 'industrial': 9.0, 'warehouse': 9.0}
DEFAULT_HEIGHT_REST = 6.0
FLAT_ROOF = {'industrial', 'apartments'}
HOUSE_ROOF_AREA = 150.0
ROAD_WIDTH = {'motorway': 14, 'motorway_link': 14, 'trunk': 14, 'trunk_link': 14, 'primary': 10, 'primary_link': 10,
              'secondary': 8, 'secondary_link': 8, 'tertiary': 6, 'tertiary_link': 6, 'residential': 6,
              'service': 3.5, 'track': 3.5, 'path': 1.5}
# Classes the plan does not list, and the class they are drawn as.
ROAD_LIKE = {'unclassified': 'residential', 'living_street': 'residential', 'road': 'residential',
             'footway': 'path', 'cycleway': 'path', 'steps': 'path', 'pedestrian': 'path', 'bridleway': 'path',
             'construction': 'service', 'proposed': None, 'platform': None, 'bus_stop': None, 'elevator': None}
FRIENDSHIP_BRIDGE = 26122712
LANDUSE_KEYS = {'landuse': None,
                'natural': {'wood', 'scrub', 'grassland', 'wetland', 'bare_rock', 'sand', 'beach', 'cliff', 'heath'},
                'leisure': {'park', 'pitch', 'golf_course', 'stadium', 'nature_reserve', 'garden', 'playground'}}


def number(v):
    """A tag's leading number in metres ("12", "12.5 m", "12,5"); None when there is none or it is in feet."""
    if v is None or "'" in v or 'ft' in v:
        return None
    m = re.match(r'\s*([0-9]+(?:[.,][0-9]+)?)', v)
    return float(m.group(1).replace(',', '.')) if m else None


def layer(t):
    try:
        return int(t.get('layer', '0'))
    except ValueError:
        return 0


def building_height(t):
    h = number(t.get('height'))
    if h and h > 0:
        return h, 'height'
    lv = number(t.get('building:levels'))
    if lv and lv > 0:
        return lv * LEVEL_M + LEVEL_BASE, 'building:levels'
    kind = t.get('building', 'yes')
    return DEFAULT_HEIGHT.get(kind, DEFAULT_HEIGHT_REST), f'default:{kind if kind in DEFAULT_HEIGHT else "other"}'


def roof(t, area):
    if t.get('roof:shape'):
        return t['roof:shape'], 'roof:shape'
    kind = t.get('building', 'yes')
    if kind in FLAT_ROOF:
        return 'flat', f'rule:{kind}'
    if kind == 'house' and area < HOUSE_ROOF_AREA:
        return 'hipped', 'rule:house under 150 m2'
    return 'flat', 'rule:other'


def geom_xz(g):
    return {'outer': ring_xz(g.exterior), 'holes': [ring_xz(r) for r in g.interiors]}


def buildings(osm, dam_foot):
    out, skipped = [], {'straddle': 0, 'dam': [], 'invalid': 0}
    items = [(f'w{w["id"]}', w['tags'], osm.polygon(w)) for w in osm.tagged_ways if 'building' in w['tags']]
    items += [(f'r{r["id"]}', r['tags'], osm.multipolygon(r)[0]) for r in osm.rels.values()
              if 'building' in r.get('tags', {}) and r['tags'].get('type') == 'multipolygon']
    for oid, t, g in items:
        if g is None or g.is_empty:
            skipped['invalid'] += 1
            continue
        if not g.intersects(HERO):
            continue
        if not HERO.contains(g):
            skipped['straddle'] += 1
            continue
        if dam_foot.contains(g.representative_point()):
            skipped['dam'].append(oid)
            continue
        for p in polygons_of(g):
            h, hf = building_height(t)
            rs, rf = roof(t, p.area)
            mh = number(t.get('min_height'))
            e = {'id': oid, 'building': t.get('building'), **geom_xz(p), 'area': round(p.area, 1),
                 'height': round(h, 1), 'heightFrom': hf, 'minHeight': round(mh, 1) if mh else 0.0,
                 'levels': number(t.get('building:levels')), 'roof': rs, 'roofFrom': rf}
            for k in ('name', 'building:material', 'roof:material', 'roof:colour', 'building:colour'):
                if k in t:
                    e[k.replace('building:', '').replace(':', '_')] = t[k]
            out.append(e)
    return out, skipped


def lines_in(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    return [p for p in getattr(g, 'geoms', []) if isinstance(p, LineString)]


def roads(osm, crest_zone):
    out, ring = [], []
    for w in osm.tagged_ways:
        t = w['tags']
        cls = t.get('highway')
        if cls is None:
            continue
        drawn = cls if cls in ROAD_WIDTH else ROAD_LIKE.get(cls, 'service')
        if drawn is None:
            continue
        ln = osm.line(w)
        if ln is None:
            continue
        width = number(t.get('width'))
        base = {'id': f'w{w["id"]}', 'highway': cls, 'drawnAs': drawn,
                'width': round(width if width else ROAD_WIDTH[drawn], 1), 'widthFrom': 'width' if width else 'class',
                'bridge': t.get('bridge', 'no') != 'no', 'tunnel': t.get('tunnel', 'no') != 'no',
                'layer': layer(t)}
        for k in ('name', 'surface', 'oneway', 'lanes'):
            if k in t:
                base[k] = t[k]
        if w['id'] == FRIENDSHIP_BRIDGE:
            ring.append({**base, 'square': 'ring', 'points': [[r1(x), r1(z)] for x, z in ln.coords]})
            continue
        if not ln.intersects(HERO):
            continue
        for part in lines_in(ln.intersection(HERO)):
            e = {**base, 'points': [[r1(x), r1(z)] for x, z in part.coords]}
            # A road on the dam's crest is the dam's: D lays it on its roof
            # records, and F must not drape it on the terrain under them.
            inside = part.intersection(crest_zone).length
            if inside > 0.5 * part.length:
                e['onDam'] = True
            out.append(e)
    return out + ring


def power(osm):
    towers = []
    for nid, n in osm.nodes.items():
        t = n.get('tags', {})
        if t.get('power') in ('tower', 'pole', 'portal'):
            x, z = osm.xz[nid]
            if abs(x) <= HERO_HALF and abs(z) <= HERO_HALF:
                e = {'id': f'n{nid}', 'kind': t['power'], 'x': r1(x), 'z': r1(z)}
                h = number(t.get('height'))
                if h:
                    e['height'] = round(h, 1)
                for k in ('ref', 'design', 'structure', 'material', 'line_attachment'):
                    if k in t:
                        e[k] = t[k]
                towers.append(e)
    tower_ids = {e['id'] for e in towers}
    lines, subs, plants = [], [], []
    for w in osm.tagged_ways:
        t = w['tags']
        pw = t.get('power')
        if pw in ('line', 'minor_line', 'cable'):
            # Runs of consecutive nodes inside the square: a conductor ends
            # at a tower the map builds, never at the square's edge.
            run = []
            runs = []
            for nid in w['nodes']:
                x, z = osm.xz.get(nid, (1e9, 1e9))
                if abs(x) <= HERO_HALF and abs(z) <= HERO_HALF:
                    run.append(nid)
                else:
                    if len(run) > 1:
                        runs.append(run)
                    run = []
            if len(run) > 1:
                runs.append(run)
            for k, run in enumerate(runs):
                e = {'id': f'w{w["id"]}', 'part': k, 'kind': pw,
                     'nodes': [f'n{n}' for n in run], 'points': [[r1(osm.xz[n][0]), r1(osm.xz[n][1])] for n in run],
                     'towers': [f'n{n}' in tower_ids for n in run]}
                for key in ('voltage', 'cables', 'circuits', 'frequency', 'name', 'operator', 'wires'):
                    if key in t:
                        e[key] = t[key]
                lines.append(e)
        elif pw in ('substation', 'plant'):
            g = osm.polygon(w)
            if g is None or not g.intersects(HERO):
                continue
            for p in polygons_of(g.intersection(HERO)):
                e = {'id': f'w{w["id"]}', 'kind': pw, **geom_xz(p)}
                for key in ('name', 'voltage', 'frequency', 'operator', 'substation', 'plant:source'):
                    if key in t:
                        e[key] = t[key]
                (subs if pw == 'substation' else plants).append(e)
    return {'towers': towers, 'lines': lines, 'substations': subs, 'plants': plants}


def trees(osm):
    out = []
    for nid, n in osm.nodes.items():
        t = n.get('tags', {})
        if t.get('natural') == 'tree':
            x, z = osm.xz[nid]
            if abs(x) <= HERO_HALF and abs(z) <= HERO_HALF:
                e = {'id': f'n{nid}', 'x': r1(x), 'z': r1(z)}
                for k in ('species', 'genus', 'leaf_type', 'leaf_cycle', 'height', 'denotation', 'name'):
                    if k in t:
                        e[k] = t[k]
                out.append(e)
    return out


def landuse(osm):
    out = []

    def match(t):
        for k, vals in LANDUSE_KEYS.items():
            if k in t and (vals is None or t[k] in vals):
                return k, t[k]
        return None

    items = [(f'w{w["id"]}', w['tags'], osm.polygon(w)) for w in osm.tagged_ways if match(w['tags'])]
    items += [(f'r{r["id"]}', r['tags'], osm.multipolygon(r)[0]) for r in osm.rels.values()
              if r.get('tags', {}).get('type') == 'multipolygon' and match(r['tags'])]
    for oid, t, g in items:
        if g is None or g.is_empty or not g.intersects(HERO):
            continue
        k, v = match(t)
        for p in polygons_of(g.intersection(HERO)):
            if p.area < 1.0:
                continue
            e = {'id': oid, 'key': k, 'value': v, **geom_xz(p), 'area': round(p.area, 1)}
            if 'name' in t:
                e['name'] = t['name']
            out.append(e)
    return out


def run(osm, parts, crest):
    foot = unary_union([Polygon(e['footprint']) for e in parts if e['footprint']])
    crest_zone = unary_union([crest.buffer(20.0), foot])
    b, skipped = buildings(osm, foot)
    files = {'buildings': b, 'roads': roads(osm, crest_zone), 'power': power(osm), 'trees': trees(osm),
             'landuse': landuse(osm)}
    meta = {'licence': 'ODbL 1.0', 'attribution': '(c) OpenStreetMap contributors, ODbL, openstreetmap.org/copyright',
            'data': 'OpenStreetMap data to ' + ', '.join(f'{k} {v["replication_timestamp"]}'
                                                            for k, v in osm.meta['extracts'].items()),
            'frame': 'world metres, docs/ITAIPU-PLAN.md section 2', 'square': 'hero'}
    counts = {}
    for name, feats in files.items():
        doc = {**meta, 'features': feats} if isinstance(feats, list) else {**meta, **feats}
        if name == 'buildings':
            doc['skipped'] = {'straddlingTheHeroEdge': skipped['straddle'], 'insideDamFootprints': skipped['dam'],
                              'noGeometry': skipped['invalid']}
            hf = {}
            for f in feats:
                hf[f['heightFrom']] = hf.get(f['heightFrom'], 0) + 1
            doc['heightFromCounts'] = hf
        dump_json(DATA / 'osm' / f'{name}.json', doc)
        counts[name] = len(feats) if isinstance(feats, list) else {k: len(v) for k, v in feats.items()}
    print('  ' + ', '.join(f'{k} {v}' for k, v in counts.items()) +
          f'; buildings skipped: {skipped["straddle"]} across the hero edge, {len(skipped["dam"])} inside dam footprints')
    return counts
