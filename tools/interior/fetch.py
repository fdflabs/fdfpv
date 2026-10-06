# fetch.py: cuts the Interior's two sources (source.py) out of their
# cloud optimised GeoTIFFs by windowed reads, into _sources/ under the data
# folder, and records each cut's URL, licence, size and sha256 in
# _sources/sources.json. A cut already there with its recorded checksum is
# not fetched again.
#
# The data folder is INTERIOR_DATA, by default
# ~/Desktop/fdfpv-loop/interior/data. Nothing in it is committed: the
# build (build.py) writes the few files the game reads into
# src/share/interior/.
#
# Usage: uv run python fetch.py
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
import hashlib
import json
import os
import sys
from pathlib import Path

os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')

import rasterio  # noqa: E402  (after the GDAL environment is set)
from rasterio.windows import Window, from_bounds  # noqa: E402

import source  # noqa: E402

DATA = Path(os.environ.get('INTERIOR_DATA', Path.home() / 'Desktop' / 'fdfpv-loop' / 'interior' / 'data'))
SOURCES = DATA / '_sources'
TMP = DATA / '_tmp'
TMP.mkdir(parents=True, exist_ok=True)
os.environ['TMPDIR'] = os.environ['CPL_TMPDIR'] = str(TMP)


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def registry():
    p = SOURCES / 'sources.json'
    return json.loads(p.read_text()) if p.exists() else {}


def record(items, key, file, **meta):
    p = SOURCES / file
    items[key] = {'file': file, 'bytes': p.stat().st_size, 'sha256': sha256(p), 'retrieved': now(), **meta}
    (SOURCES / 'sources.json').write_text(json.dumps(items, indent=1, sort_keys=True) + '\n')
    print(f'  {key}: {file} {p.stat().st_size:,} bytes')


def bounds(d=source.FETCH_DEG):
    return source.CENTRE_LON - d, source.CENTRE_LAT - d, source.CENTRE_LON + d, source.CENTRE_LAT + d


def cut(items, key, url, file, deg=source.FETCH_DEG, **meta):
    """A windowed read of a remote COG in its own grid, written as a tiled deflate GeoTIFF."""
    it = items.get(key)
    if it and (SOURCES / it['file']).exists() and sha256(SOURCES / it['file']) == it['sha256']:
        print(f'  {key}: have it')
        return
    p = SOURCES / file
    p.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(url) as src:
        w = from_bounds(*bounds(deg), transform=src.transform).round_offsets().round_lengths()
        w = w.intersection(Window(0, 0, src.width, src.height))
        a = src.read(window=w, boundless=False)
        prof = src.profile | {'driver': 'GTiff', 'height': a.shape[1], 'width': a.shape[2],
                              'transform': src.window_transform(w), 'tiled': True, 'blockxsize': 256,
                              'blockysize': 256, 'compress': 'deflate'}
        prof.pop('interleave', None)
        with rasterio.open(p, 'w', **prof) as dst:
            dst.write(a)
    record(items, key, file, url=url, window=[int(w.col_off), int(w.row_off), int(w.width), int(w.height)], **meta)


def main():
    SOURCES.mkdir(parents=True, exist_ok=True)
    items = registry()
    cut(items, 'anadem', source.ANADEM_URL, 'anadem.tif',
        title='ANADEM v1 bare earth DTM, cut to the Interior square, EGM2008 heights', licence=source.ANADEM_LICENCE)
    cut(items, 'anadem_flow', source.ANADEM_URL, 'anadem_flow.tif', deg=source.FLOW_DEG,
        title='ANADEM v1 bare earth DTM, the wider cut the river\'s flow is found on', licence=source.ANADEM_LICENCE)
    for k, url in enumerate(source.WORLDCOVER_URLS):
        cut(items, f'worldcover{k}', url, f'worldcover{k}.tif',
            title='ESA WorldCover 10 m 2021 v200, cut to the Interior square', licence=source.WORLDCOVER_LICENCE)
    return 0


if __name__ == '__main__':
    sys.exit(main())
