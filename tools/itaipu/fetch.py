# fetch.py: downloads every source the Itaipu map is built from into
# _sources/ under the data folder, and records for each one where it came
# from, when, its licence, its size and its sha256 in
# _sources/sources.json. A file already present with the recorded
# checksum is not fetched again. Cloud rasters are cut to FETCH_HALF
# around the frame origin by windowed reads, so only the area the plan
# needs is stored.
#
# Usage: uv run python fetch.py [name ...]   (no names fetches everything)
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

import datetime
import gzip
import hashlib
import json
import os
import sys
import time
import urllib.request

from common import DEM_HALF, FETCH_HALF, HERO_HALF, SOURCES, UTM, lonlat_bounds, utm_bounds

# Remote COG reads: never list the bucket directory for every open.
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')

import rasterio  # noqa: E402  (after the GDAL environment is set)
from rasterio.windows import Window, from_bounds  # noqa: E402

UA = 'fdfpv-itaipu-data/0.1 (+https://github.com/fdflabs/fdfpv)'

COP30 = ('https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S26_00_W055_00_DEM/'
         'Copernicus_DSM_COG_10_S26_00_W055_00_DEM.tif')
COP30_LICENCE = ('Copernicus DEM GLO-30, free and open licence (ESA, "Licence for the use of the Copernicus '
                 'WorldDEM-30"): use, copy, modify and redistribute, including commercially, with the notice '
                 '"(c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018 provided under '
                 'COPERNICUS by the European Union and ESA; all rights reserved"')
ANADEM = 'https://metadados.snirh.gov.br/files/anadem_v1_tiles/anadem_v1_21J.tif'
ANADEM_LICENCE = ('CC BY 4.0 (OpenTopography dataset OTSDEM.082025.4674.1). Cite Laipelt et al. 2024, '
                  '"ANADEM: A Digital Terrain Model for South America", Remote Sensing 16(13):2321, '
                  'doi:10.3390/rs16132321; ANA / IPH-UFRGS')

STAC = 'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/'
# Earth Search lists 22 scenes of tile 21JYM under 3 % cloud from June
# 2025 to September 2026; four (2025-09-26, 2025-11-20, 2025-12-20,
# 2026-09-26) were compared by eye over the dam. 20 December 2025 is
# summer, the crispest, 0.02 % cloud, no nodata,
# and the spillway is shut, so the chute is dry concrete in the colour
# layer. 26 September 2026 has the spillway running and is kept, hero
# area only, as a reference for the white water.
# The fetch square's north 6.5 km (N 7200000 to 7206500, reservoir) is
# in the next tile, 21JYN, from the same pass.
S2_MAIN = ['S2B_21JYM_20251220_0_L2A', 'S2B_21JYN_20251220_0_L2A']
S2_MAIN_BANDS = ['blue', 'green', 'red', 'nir', 'scl']
S2_SPILL = 'S2B_21JYM_20260926_0_L2A'
S2_LICENCE = ('Copernicus Sentinel data, free, full and open (Commission Delegated Regulation (EU) '
              'No 1159/2013). Attribution: "Contains modified Copernicus Sentinel data 2025, processed by ESA"')

# OpenStreetMap comes from Geofabrik's country extracts, not Overpass: on
# 2026-09-29 every public Overpass endpoint answered 504 for a quarter of
# an hour, even to a ten-way query. The dam sits on the border, so both
# the Paraguay and the Brazil South extracts are read; they are cut to
# the fetch square here and deleted, and only the cut is kept.
GEOFABRIK = {'paraguay': 'https://download.geofabrik.de/south-america/paraguay-latest.osm.pbf',
             'brazil-sul': 'https://download.geofabrik.de/south-america/brazil/sul-latest.osm.pbf'}
OSM_LICENCE = ('Open Database License 1.0 (ODbL). Attribution: "(c) OpenStreetMap contributors", '
               'https://www.openstreetmap.org/copyright')
# What the plan turns into geometry, colliders or masks, as tag keys and,
# where a key alone is too broad, the values. Buildings, barriers and
# single trees only inside the hero square: the ring draws none.
OSM_RING = {'waterway': None, 'water': None, 'landuse': None, 'man_made': None, 'power': None,
            'bridge': None, 'aeroway': None, 'highway': None, 'railway': None,
            'natural': {'water', 'wood', 'scrub', 'grassland', 'wetland', 'bare_rock', 'sand', 'beach', 'cliff'},
            'leisure': {'park', 'pitch', 'golf_course', 'stadium', 'nature_reserve'}}
OSM_HERO = {'building': None, 'barrier': None, 'tourism': None, 'natural': {'tree'}}


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


class Registry:
    def __init__(self):
        SOURCES.mkdir(parents=True, exist_ok=True)
        self.path = SOURCES / 'sources.json'
        self.items = json.loads(self.path.read_text()) if self.path.exists() else {}

    def have(self, key):
        it = self.items.get(key)
        return it is not None and (SOURCES / it['file']).exists() and sha256(SOURCES / it['file']) == it['sha256']

    def record(self, key, file, **meta):
        p = SOURCES / file
        self.items[key] = {'file': file, 'bytes': p.stat().st_size, 'sha256': sha256(p), 'retrieved': now(), **meta}
        self.path.write_text(json.dumps(self.items, indent=1, sort_keys=True) + '\n')
        print(f'  {key}: {file} {p.stat().st_size:,} bytes')


def request(url, data=None, timeout=300):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
    for attempt in range(5):
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except Exception as e:
            if attempt == 4:
                raise
            print(f'  retry {attempt + 1} after {e}', file=sys.stderr)
            time.sleep(10 * (attempt + 1))


def download(reg, key, url, file, **meta):
    if reg.have(key):
        print(f'  {key}: have it')
        return
    p = SOURCES / file
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + '.part')
    with request(url) as r, open(tmp, 'wb') as f:
        lm = r.headers.get('Last-Modified')
        while b := r.read(1 << 20):
            f.write(b)
    tmp.rename(p)
    reg.record(key, file, url=url, last_modified=lm, **meta)


def cut(reg, key, url, file, bounds, **meta):
    """Windowed read of a remote COG, written as a tiled deflate GeoTIFF in the source's own grid."""
    if reg.have(key):
        print(f'  {key}: have it')
        return
    p = SOURCES / file
    p.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(url) as src:
        # A square that runs off the scene is clipped to it; the georeference
        # must come from the clipped window, not the requested one.
        w = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        w = w.intersection(Window(0, 0, src.width, src.height))
        a = src.read(window=w, boundless=False)
        prof = src.profile | {'driver': 'GTiff', 'height': a.shape[1], 'width': a.shape[2],
                              'transform': src.window_transform(w), 'tiled': True, 'blockxsize': 256,
                              'blockysize': 256, 'compress': 'deflate', 'predictor': 2}
        prof.pop('interleave', None)
        with rasterio.open(p, 'w', **prof) as dst:
            dst.write(a)
    reg.record(key, file, url=url, window=[int(w.col_off), int(w.row_off), int(w.width), int(w.height)], **meta)


def fetch_dem(reg):
    download(reg, 'cop30', COP30, 'dem/Copernicus_DSM_COG_10_S26_00_W055_00_DEM.tif',
             title='Copernicus DEM GLO-30 (DSM), tile S26 W055, 1 arc second, EGM2008 heights',
             licence=COP30_LICENCE)
    # ANADEM's 21J tile is 1.5 GB; only the DEM square is kept.
    w, s, e, n = lonlat_bounds(DEM_HALF)
    cut(reg, 'anadem', ANADEM, 'dem/anadem_v1_21J_itaipu.tif', (w, s, e, n),
        title='ANADEM v1 bare earth DTM, MGRS 21J, cut to the Itaipu DEM square, EGM2008 heights',
        licence=ANADEM_LICENCE)


def stac_item(item_id):
    return json.load(request(STAC + item_id))


def fetch_imagery(reg):
    for scene in S2_MAIN:
        it = stac_item(scene)
        tile = scene.split('_')[1]
        meta = dict(scene=scene, datetime=it['properties']['datetime'],
                    cloud=it['properties']['eo:cloud_cover'], licence=S2_LICENCE, via=STAC + scene)
        for band in S2_MAIN_BANDS:
            cut(reg, f's2_{tile}_{band}', it['assets'][band]['href'], f's2/{scene}_{band}.tif', utm_bounds(FETCH_HALF),
                title=f'Sentinel-2 L2A {band}, tile {tile}, cut to the fetch square', **meta)
    it = stac_item(S2_SPILL)
    cut(reg, 's2_spill_tci', it['assets']['visual']['href'], f's2/{S2_SPILL}_tci.tif', utm_bounds(HERO_HALF),
        title='Sentinel-2 L2A true colour, spillway running, hero square only', scene=S2_SPILL,
        datetime=it['properties']['datetime'], cloud=it['properties']['eo:cloud_cover'], licence=S2_LICENCE,
        via=STAC + S2_SPILL)


def wanted(tags, rules):
    return any(k in tags and (v is None or tags[k] in v) for k, v in rules.items())


def cut_osm(pbfs, ring, hero):
    """Every element the plan uses inside the squares, as Overpass JSON: a way is kept whole if any of its
    nodes is inside, a relation if it is wanted and any member way was kept or is inside."""
    import osmium

    def inside(box, lon, lat):
        return box[0] <= lon <= box[2] and box[1] <= lat <= box[3]

    nodes, ways, rels = {}, {}, {}
    for pbf in pbfs:
        member_ways = set()
        for r in osmium.FileProcessor(str(pbf), osmium.osm.RELATION):
            tags = dict(r.tags)
            if wanted(tags, OSM_RING) or wanted(tags, OSM_HERO):
                rels[r.id] = {'type': 'relation', 'id': r.id, 'tags': tags,
                              'members': [{'type': {'n': 'node', 'w': 'way', 'r': 'relation'}[m.type], 'ref': m.ref,
                                           'role': m.role} for m in r.members]}
                member_ways.update(m.ref for m in r.members if m.type == 'w')
        for o in osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY).with_locations():
            if o.is_node():
                tags = dict(o.tags)
                loc = o.location
                if tags and loc.valid() and ((wanted(tags, OSM_RING) and inside(ring, loc.lon, loc.lat))
                                             or (wanted(tags, OSM_HERO) and inside(hero, loc.lon, loc.lat))):
                    nodes[o.id] = {'type': 'node', 'id': o.id, 'lat': loc.lat, 'lon': loc.lon, 'tags': tags}
                continue
            tags = dict(o.tags)
            pts = [(n.ref, n.lon, n.lat) for n in o.nodes if n.location.valid()]
            keep = ((wanted(tags, OSM_RING) or o.id in member_ways) and any(inside(ring, x, y) for _, x, y in pts)) \
                or (wanted(tags, OSM_HERO) and any(inside(hero, x, y) for _, x, y in pts))
            if not keep:
                continue
            ways[o.id] = {'type': 'way', 'id': o.id, 'nodes': [r for r, _, _ in pts], **({'tags': tags} if tags else {})}
            for ref, x, y in pts:
                nodes.setdefault(ref, {'type': 'node', 'id': ref, 'lat': y, 'lon': x})
    rels = {k: r for k, r in rels.items() if any(m['type'] == 'way' and m['ref'] in ways for m in r['members'])
            or any(m['type'] == 'node' and m['ref'] in nodes for m in r['members'])}
    return {'version': 0.6, 'generator': 'tools/itaipu/fetch.py from Geofabrik extracts',
            'elements': list(nodes.values()) + list(ways.values()) + list(rels.values())}


def fetch_osm(reg):
    if reg.have('osm'):
        print('  osm: have it')
        return
    import osmium
    tmp = SOURCES / 'osm' / '_country'
    tmp.mkdir(parents=True, exist_ok=True)
    got = {}
    for name, url in GEOFABRIK.items():
        p = tmp / url.rsplit('/', 1)[1]
        with request(url) as r, open(p, 'wb') as f:
            lm = r.headers.get('Last-Modified')
            while b := r.read(1 << 20):
                f.write(b)
        hdr = osmium.io.Reader(str(p), osmium.osm.osm_entity_bits.NOTHING).header()
        got[name] = {'url': url, 'last_modified': lm, 'bytes': p.stat().st_size, 'sha256': sha256(p),
                     'replication_timestamp': hdr.get('osmosis_replication_timestamp')}
        print(f'  {name}: {p.stat().st_size:,} bytes, data to {got[name]["replication_timestamp"]}')
    doc = cut_osm([tmp / u.rsplit('/', 1)[1] for u in GEOFABRIK.values()], lonlat_bounds(FETCH_HALF),
                  lonlat_bounds(HERO_HALF))
    out = SOURCES / 'osm' / 'itaipu.osm.json.gz'
    with gzip.open(out, 'wt', compresslevel=9) as f:
        json.dump(doc, f, separators=(',', ':'))
    for u in GEOFABRIK.values():
        (tmp / u.rsplit('/', 1)[1]).unlink()
    tmp.rmdir()
    reg.record('osm', 'osm/itaipu.osm.json.gz', licence=OSM_LICENCE, extracts=got, rules={'ring': str(OSM_RING),
               'hero': str(OSM_HERO)}, title='OpenStreetMap, cut to the fetch square (buildings, barriers and '
               'trees to the hero square) from the Geofabrik Paraguay and Brazil South extracts')


# Itaipu Binacional's own pages, the source of every dimension and level
# in docs/ITAIPU-PLAN.md section 6. Kept so a citation can be checked
# against the page as it was read, not as it is later.
ITAIPU_PAGES = ['barragem', 'reservatorio', 'vertedouro', 'casa-de-forca']


def fetch_pages(reg):
    for page in ITAIPU_PAGES:
        download(reg, f'itaipu_{page}', f'https://www.itaipu.gov.br/energia/{page}', f'itaipu-pages/{page}.html',
                 title=f'Itaipu Binacional, Energia: {page}',
                 licence='Cited for facts (dimensions and levels) only; the page text is not redistributed')


STEPS = {'dem': fetch_dem, 'imagery': fetch_imagery, 'osm': fetch_osm, 'pages': fetch_pages}

if __name__ == '__main__':
    reg = Registry()
    for name in sys.argv[1:] or STEPS:
        print(name, UTM)
        STEPS[name](reg)
