# manifest.py: manifest.json for the data folder: the frame, the tile
# levels and their counts, the hero tile set, what the other files hold,
# every source with its date and licence, and a sha256 per file.
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
import json

from common import (DATA, E0, EXTENT, HERO_CELL, LEVELS, N0, TILE_SAMPLES, UTM, Y0, cell, hero_tiles, level_tiles,
                    load_sources, tile_size)

SOURCE_GROUPS = [
    ('elevation', 'dem13_', 'USGS 3DEP 1/3 arc second DEM, via the TNM Access API: every level and the hero tiles'),
    ('hydrography', 'nhdplus_', 'USGS NHDPlus High Resolution'),
    ('land cover', 'nlcd', 'NLCD 2021 Land Cover, MRLC'),
    ('thermal inventory', 'rcn_', 'Yellowstone thermal feature inventory, RCN export'),
    ('names', 'gnis_', 'USGS GNIS domestic names'),
    ('roads', 'nps_', 'NPS national roads and trails'),
    ('roads outside the park', 'tiger_', 'US Census TIGER/Line roads'),
]


def data_files():
    return sorted(p for p in DATA.rglob('*') if p.is_file() and not any(part.startswith('_') for part in p.relative_to(DATA).parts)
                  and p.name != 'manifest.json')


def main():
    files = {}
    for p in data_files():
        files[str(p.relative_to(DATA))] = hashlib.sha256(p.read_bytes()).hexdigest()
    reg = load_sources()
    sources = []
    for what, prefix, title in SOURCE_GROUPS:
        items = {k: v for k, v in sorted(reg.items()) if k.startswith(prefix)}
        if not items:
            raise RuntimeError(f'no source recorded for {what}')
        sources.append({
            'what': what, 'title': title,
            'licence': sorted({v['licence'] for v in items.values()}),
            'files': [{'name': k, 'url': v['url'], 'published': v.get('published') or v.get('last_modified'),
                       'retrieved': v['retrieved'], 'bytes': v['bytes'], 'sha256': v['sha256']} for k, v in items.items()],
        })
    sources.append({'what': 'geyser eruption data', 'title': 'NPS, Yellowstone Geysers: Eruption Data',
                    'licence': ['Public domain (work of the United States Government, 17 U.S.C. 105)'],
                    'files': [{'url': 'https://www.nps.gov/yell/planyourvisit/geyser-activity.htm', 'published': '2025-04-18'}]})

    thermal = json.loads((DATA / 'thermal.json').read_text())
    hydro = json.loads((DATA / 'hydro.json').read_text())
    roads = json.loads((DATA / 'roads.json').read_text())
    manifest = {
        'name': 'Yellowstone',
        'built': datetime.date.today().isoformat(),
        'contract': 'docs/YELLOWSTONE-PLAN.md',
        'frame': {'crs': UTM, 'E0': E0, 'N0': N0, 'Y0': Y0, 'extent': [-EXTENT, EXTENT],
                  'x': 'E - E0', 'z': '-(N - N0)', 'y': 'elevation - Y0'},
        'encoding': {'type': 'uint16le', 'samples': TILE_SAMPLES, 'order': 'x fastest, then z',
                     'value': 'round((y + 1000) * 10)'},
        'levels': [{'level': L, 'cell': cell(L), 'tileSize': tile_size(L), 'tiles': len(level_tiles(L)),
                    'grid': max(i for i, _ in level_tiles(L)) + 1} for L in LEVELS],
        'hero': {'level': -1, 'cell': HERO_CELL, 'tileSize': HERO_CELL * (TILE_SAMPLES - 1),
                 'tiles': [[i, j] for i, j in hero_tiles()]},
        'landcover': {'levels': [0, 1], 'type': 'uint8', 'classes': 'NLCD 2021',
                      'tiles': {str(L): len(level_tiles(L)) for L in (0, 1)}},
        'counts': {
            'thermal': len(thermal['features']),
            'rivers': len(hydro['rivers']), 'lakes': len(hydro['lakes']),
            'roads': len(roads['lines']),
        },
        'sources': sources,
        'files': files,
    }
    (DATA / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print(f'manifest.json: {len(files)} files, {sum((DATA / f).stat().st_size for f in files):,} bytes')


if __name__ == '__main__':
    main()
