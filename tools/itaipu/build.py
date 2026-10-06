# build.py: the whole data folder from _sources, in order: the dam's
# parts, the terrain and the water bodies, the water outlines, the
# imagery and masks, the OpenStreetMap files, dam.json, the manifest, and
# then validate.py. Everything it writes is rebuilt from scratch, so a
# stale file from an earlier layout cannot survive a build.
#
# It builds into the staging folder beside the live one (the live folder's
# name with -next, or ITAIPU_STAGE), never into the live folder, which the
# local server and every other check read while a build runs; swap.py
# then puts the staged build live with one rename. The stage reads the
# live folder's _sources through a symlink.
#
# Usage: uv run python build.py   (after fetch.py; about two minutes)
#        uv run python swap.py    (when the staged build is to go live)
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

import os
import shutil
import sys
import time
from pathlib import Path

LIVE = Path(os.environ.get('ITAIPU_DATA', Path.home() / 'Desktop' / 'fdfpv-itaipu-data'))
STAGE = Path(os.environ.get('ITAIPU_STAGE', LIVE.with_name(LIVE.name + '-next')))
# Every module below reads the data folder from ITAIPU_DATA at import.
os.environ['ITAIPU_DATA'] = str(STAGE)
STAGE.mkdir(parents=True, exist_ok=True)
if not (STAGE / '_sources').exists():
    (STAGE / '_sources').symlink_to((LIVE / '_sources').resolve())

from shapely.geometry import Polygon  # noqa: E402 (after the data folder is chosen)

import build_dam  # noqa: E402
import build_imagery  # noqa: E402
import build_osm  # noqa: E402
import build_terrain  # noqa: E402
import manifest  # noqa: E402
import validate  # noqa: E402
import water  # noqa: E402
from common import DATA, dump_json  # noqa: E402
from osm import Osm  # noqa: E402

# What build.py owns in the data folder. _sources, _tmp and the
# repository's own files are never touched.
OUTPUTS = ['0', '1', '2', '3', 'hero', 'canopy', 'imagery', 'masks', 'osm', 'water.json', 'dam.json', 'manifest.json']


def step(name):
    print(f'== {name}')
    return time.time()


def main():
    t0 = time.time()
    assert DATA == STAGE, (DATA, STAGE)
    print(f'building into {STAGE} (live: {LIVE})')
    for o in OUTPUTS:
        p = DATA / o
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()
    step('osm')
    osm = Osm()
    step('dam parts')
    parts, crest = build_dam.build(osm)
    step('terrain')
    terrain = build_terrain.run(osm, parts, crest)
    step('water')
    foot = [Polygon(e['footprint']) for e in parts if e['footprint']]
    bodies, _ = water.build(terrain['bodies30'], terrain['bodies10'], terrain['l0'], terrain['hero'], foot)
    dump_json(DATA / 'water.json', bodies)
    step('imagery')
    imagery = build_imagery.run(osm, parts, terrain)
    step('osm files')
    counts = build_osm.run(osm, parts, crest)
    step('dam.json')
    dump_json(DATA / 'dam.json', parts)
    step('manifest')
    manifest.main({
        'water': {'file': 'water.json', 'bodies': [{'name': b['name'], 'y': b['y'], 'bedDepth': b['bedDepth'],
                                                    'bedDepthRing': b['bedDepthRing'], 'vertices': len(b['outline'])}
                                                   for b in bodies],
                  'levelsFrom': 'where Copernicus GLO-30 flattened each body (docs/ITAIPU-PLAN.md section 5); '
                                'Itaipu publishes 220.30 m normal upstream and 104.00 m normal downstream'},
        'imagery': {'hero': {'file': 'imagery/hero.jpg', 'masks': 'masks/hero.png', 'size': build_imagery.SIZE,
                             'cell': 10.0, 'square': 'hero'},
                    'ring': {'file': 'imagery/ring.jpg', 'masks': 'masks/ring.png', 'size': build_imagery.SIZE,
                             'cell': 40.0, 'square': 'ring'},
                    'pixels': 'pixel (0, 0) covers the square\'s north-west corner, x and z from -half; sRGB',
                    **imagery},
        'dam': {'file': 'dam.json', 'parts': [e['part'] for e in parts]},
        'osm': {'files': {k: f'osm/{k}.json' for k in counts}, 'counts': counts,
                'data': {k: v['replication_timestamp'] for k, v in osm.meta['extracts'].items()}},
    })
    print(f'built in {time.time() - t0:.0f} s')
    step('validate')
    return validate.main()


if __name__ == '__main__':
    sys.exit(main())
