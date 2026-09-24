# fetch.py: downloads every source the Yellowstone data is built from
# into _sources/ under the data folder, and records for each one where it
# came from, when, its publication date, its licence, its size and its
# sha256 in _sources/sources.json. A file already present with the
# recorded checksum is not fetched again.
#
# Usage: uv run python fetch.py [name ...]   (no names fetches everything)
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

import datetime
import hashlib
import html
import http.cookiejar
import json
import re
import sys
import time
import urllib.parse
import urllib.request

from common import EXTENT, L0_CELL, MARGIN, REAL_HIGH, SOURCES, bounds_in

UA = 'fdfpv-yellowstone-data/0.1 (+https://github.com/fdflabs/fdfpv)'
PUBLIC_DOMAIN = 'Public domain (work of the United States Government, 17 U.S.C. 105)'

TNM_API = 'https://tnmaccess.nationalmap.gov/api/v1/products'
NHDPLUS = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Hydrography/NHDPlusHR/Beta/GDB/NHDPLUS_H_{}_HU4_GDB.zip'
# Upper Yellowstone, Missouri Headwaters (Madison, Gibbon, Firehole,
# Gallatin), Upper Snake (Lewis, Shoshone, Heart lakes) and Bighorn
# (the Shoshone River side of the Absarokas): the four HU4 basins the
# extent touches.
HU4 = ['1007', '1002', '1704', '1008']
NLCD_WCS = 'https://www.mrlc.gov/geoserver/mrlc_download/wcs'
NLCD_COVERAGE = 'mrlc_download__NLCD_2021_Land_Cover_L48'
RCN_SEARCH = 'https://rcn.montana.edu/Features/Search.aspx'
NPS_ROADS = 'https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Roads_Geographic/FeatureServer/0/query'
NPS_TRAILS = 'https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0/query'
GNIS = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/DomesticNames/DomesticNames_{}_Text.zip'
# The extent reaches into Montana and Idaho, and GNIS files by state.
GNIS_STATES = ['WY', 'MT', 'ID']
TIGER_YEAR = '2025'
TIGER = 'https://www2.census.gov/geo/tiger/TIGER{0}/ROADS/tl_{0}_{1}_roads.zip'
# Park WY, Teton WY, Gallatin MT, Park MT, Fremont ID.
COUNTIES = ['56029', '56039', '30031', '30067', '16043']


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def request(url, data=None, opener=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
    for attempt in range(5):
        try:
            return (opener or urllib.request.build_opener()).open(req, timeout=300)
        except Exception as e:
            if attempt == 4:
                raise
            print(f'  retry {attempt + 1} after {e}', file=sys.stderr)
            time.sleep(5 * (attempt + 1))


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


class Registry:
    def __init__(self):
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


def download(reg, key, url, file, **meta):
    if reg.have(key):
        print(f'  {key}: have it')
        return
    p = SOURCES / file
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + '.part')
    with request(url) as r, open(tmp, 'wb') as f:
        lm = r.headers.get('Last-Modified')
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    tmp.rename(p)
    reg.record(key, file, url=url, last_modified=lm, **meta)


def tnm_latest(dataset, bbox):
    q = urllib.parse.urlencode({'datasets': dataset, 'bbox': ','.join(f'{v:.4f}' for v in bbox),
                                'prodFormats': 'GeoTIFF', 'max': 200})
    items = json.load(request(f'{TNM_API}?{q}'))['items']
    best = {}
    for it in items:
        m = re.search(r'_(n\d\dw\d\d\d)_(\d{8})\.tif$', it['downloadURL'])
        if not m:
            continue
        tile, stamp = m.groups()
        if tile not in best or stamp > best[tile][0]:
            best[tile] = (stamp, it)
    return {tile: it for tile, (stamp, it) in sorted(best.items())}


def fetch_dem(reg):
    # 1/3 arc second for every level, not 1 arc second for level 0: the
    # 1 arc second product sits about 12 m from the 1/3 arc second one and
    # from NHD's shorelines (docs/YELLOWSTONE-DATA.md), and one source for
    # level 0 and the hero tiles keeps them registered to each other.
    lo, hi = -EXTENT - MARGIN * L0_CELL - 500, REAL_HIGH + 500
    for tile, it in tnm_latest('National Elevation Dataset (NED) 1/3 arc-second', bounds_in('EPSG:4326', lo, hi, lo, hi)).items():
        download(reg, f'dem13_{tile}', it['downloadURL'], f'dem13/{tile}.tif', published=it['publicationDate'],
                 title=it['title'], licence=PUBLIC_DOMAIN, via=TNM_API)


def fetch_hydro(reg):
    for h in HU4:
        download(reg, f'nhdplus_{h}', NHDPLUS.format(h), f'nhdplus/NHDPLUS_H_{h}_HU4_GDB.zip',
                 title=f'NHDPlus High Resolution, HU4 {h}, file geodatabase', licence=PUBLIC_DOMAIN)


def fetch_landcover(reg):
    lo, hi = -EXTENT - MARGIN * L0_CELL - 1000, REAL_HIGH + 1000
    minx, miny, maxx, maxy = bounds_in('EPSG:5070', lo, hi, lo, hi)
    # Snap to the NLCD 30 m pixel grid so the subset is not resampled.
    x0, x1 = 30 * (minx // 30), 30 * (maxx // 30 + 1)
    y0, y1 = 30 * (miny // 30), 30 * (maxy // 30 + 1)
    q = [('service', 'WCS'), ('version', '2.0.1'), ('request', 'GetCoverage'), ('coverageId', NLCD_COVERAGE),
         ('format', 'image/geotiff'), ('subset', f'X({x0:.0f},{x1:.0f})'), ('subset', f'Y({y0:.0f},{y1:.0f})')]
    download(reg, 'nlcd2021', f'{NLCD_WCS}?{urllib.parse.urlencode(q)}', 'nlcd/nlcd2021_yellowstone.tif',
             title='NLCD 2021 Land Cover (CONUS), MRLC WCS subset', published='2023',
             licence='Public domain (USGS / MRLC, no restrictions on use)')


def fetch_thermal(reg):
    if not reg.have('rcn_features'):
        # The RCN search page offers "Download Results to Spreadsheet"; an
        # empty search is every feature in the database.
        op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        page = request(RCN_SEARCH, opener=op).read().decode('utf-8', 'replace')
        form = {}
        for m in re.finditer(r'<input[^>]*type="hidden"[^>]*>', page):
            n = re.search(r'name="([^"]+)"', m.group(0))
            v = re.search(r'value="([^"]*)"', m.group(0))
            if n:
                form[html.unescape(n.group(1))] = html.unescape(v.group(1)) if v else ''
        form['ctl00$MainContent$DownloadButton'] = 'Download Results to Spreadsheet'
        r = request(RCN_SEARCH, data=urllib.parse.urlencode(form).encode(), opener=op)
        if 'spreadsheetml' not in (r.headers.get('Content-Type') or ''):
            raise RuntimeError(f'RCN download returned {r.headers.get("Content-Type")}, not a spreadsheet')
        p = SOURCES / 'thermal' / 'rcn_features.xlsx'
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(r.read())
        reg.record('rcn_features', 'thermal/rcn_features.xlsx', url=RCN_SEARCH,
                   title='Yellowstone Research Coordination Network, Geothermal Features database, full export',
                   licence='Locations and types from the Yellowstone National Park thermal inventory (provider Park) '
                           'and USGS; republished by Montana State University with no licence stated. Facts, '
                           'not creative expression; see docs/YELLOWSTONE-DATA.md.')
    for state in GNIS_STATES:
        download(reg, f'gnis_{state}', GNIS.format(state), f'thermal/DomesticNames_{state}_Text.zip',
                 title=f'USGS Geographic Names Information System, domestic names, {state}', licence=PUBLIC_DOMAIN)


def arcgis_all(url, where, key, file, reg, **meta):
    if reg.have(key):
        print(f'  {key}: have it')
        return
    feats, offset = [], 0
    while True:
        q = urllib.parse.urlencode({'where': where, 'outFields': '*', 'outSR': '4326', 'f': 'geojson',
                                    'resultOffset': offset, 'resultRecordCount': 1000, 'orderByFields': 'OBJECTID'})
        page = json.load(request(f'{url}?{q}'))
        feats += page['features']
        offset += len(page['features'])
        if not page['features'] or not (page.get('exceededTransferLimit') or page.get('properties', {}).get('exceededTransferLimit')):
            break
    p = SOURCES / file
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({'type': 'FeatureCollection', 'features': feats}))
    reg.record(key, file, url=url, where=where, **meta)


def fetch_roads(reg):
    arcgis_all(NPS_ROADS, "UNITCODE='YELL'", 'nps_roads', 'roads/nps_roads_yell.geojson', reg,
               title='NPS Public Roads (national dataset), Yellowstone', licence=PUBLIC_DOMAIN)
    arcgis_all(NPS_TRAILS, "UNITCODE='YELL'", 'nps_trails', 'roads/nps_trails_yell.geojson', reg,
               title='NPS Public Trails (national dataset), Yellowstone', licence=PUBLIC_DOMAIN)
    for c in COUNTIES:
        download(reg, f'tiger_{c}', TIGER.format(TIGER_YEAR, c), f'roads/tl_{TIGER_YEAR}_{c}_roads.zip',
                 title=f'US Census TIGER/Line {TIGER_YEAR} all roads, county {c}', licence=PUBLIC_DOMAIN)


STEPS = {'dem': fetch_dem, 'hydro': fetch_hydro, 'landcover': fetch_landcover,
         'thermal': fetch_thermal, 'roads': fetch_roads}

if __name__ == '__main__':
    reg = Registry()
    for name in sys.argv[1:] or STEPS:
        print(name)
        STEPS[name](reg)
