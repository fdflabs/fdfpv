# manifest.py: manifest.json for the data folder (docs/ITAIPU-PLAN.md
# section 14): the frame, the encoding, the tile levels, the hero set,
# the canopy, water and imagery blocks, the sources with their licences,
# the attribution the map must show (section 15), and a sha256 per file.
# Also writes the data repository's README.md and LICENCE.md, which carry
# the same notices.
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

from common import (DATA, E0, HERO_CELL, HERO_HALF, HERO_X0, HERO_X1, LEVELS, N0, RING_HALF, TILE_SAMPLES, UTM, Y0, cell,
                    level_tiles, load_sources, tile_size)

# Not data: the repository's own files, never fetched by the map.
DOCS = {'manifest.json', 'README.md', 'LICENCE.md', '.nojekyll', '.gitignore'}

# The four lines the map shows in its credits (docs/ITAIPU-PLAN.md
# section 15), verbatim.
ATTRIBUTION = [
    'Elevation: ANADEM v1, Laipelt et al. 2024, Remote Sensing 16(13):2321, ANA / IPH-UFRGS, CC BY 4.0, '
    'resampled and edited',
    'Copernicus DEM GLO-30: (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018 provided under '
    'COPERNICUS by the European Union and ESA; all rights reserved',
    'Contains modified Copernicus Sentinel data 2025 and 2026, processed by ESA',
    '(c) OpenStreetMap contributors, ODbL, openstreetmap.org/copyright',
]
LOADING_LINE = '(c) OpenStreetMap contributors'

# Source groups: registry keys (sources.json), what they became here, the
# licence in one line, and the files built from them.
SOURCE_GROUPS = [
    ('elevation', ['anadem'], 'ANADEM v1 bare earth terrain model (ANA and IPH-UFRGS)',
     'CC BY 4.0: attribution, and changes indicated (resampled to 30 and 10 m, water beds carved, the dam burnt in)',
     'every elevation tile (levels 0 to 3, hero), and the canopy tiles with Copernicus'),
    ('surface model', ['cop30'], 'Copernicus DEM GLO-30 (DSM)',
     'Copernicus DEM licence: free use, copy, modification and redistribution with the notice',
     'the water levels and extents (water.json, the beds in the tiles), the canopy tiles, the spillway chute profile'),
    ('imagery', ['s2_21JYM_blue', 's2_21JYM_green', 's2_21JYM_red', 's2_21JYM_nir', 's2_21JYM_scl', 's2_21JYN_blue',
                 's2_21JYN_green', 's2_21JYN_red', 's2_21JYN_nir', 's2_21JYN_scl', 's2_spill_tci'],
     'Sentinel-2 L2A, Copernicus, via Element 84 Earth Search',
     'Copernicus Sentinel data terms (Regulation (EU) 1159/2013): free, full and open, with the notice',
     'imagery/*.jpg, masks/*.png; the 26 September 2026 scene is a reference for the running spillway only'),
    ('OpenStreetMap', ['osm'], 'OpenStreetMap, Geofabrik Paraguay and Brazil South extracts',
     'ODbL 1.0: osm/*.json is a derived database offered under ODbL; attribution wherever the map is shown',
     'osm/*.json, the dam axes and footprints in dam.json, the urban and forest parts of masks/*.png'),
    ('dam figures', ['itaipu_barragem', 'itaipu_vertedouro', 'itaipu_casa-de-forca', 'itaipu_reservatorio'],
     'Itaipu Binacional, www.itaipu.gov.br/energia pages',
     'facts (dimensions and levels), cited by page and quote in dam.json; the pages are not redistributed',
     'dam.json'),
]


def data_files():
    return sorted(p for p in DATA.rglob('*') if p.is_file() and p.name not in DOCS
                  and not any(part.startswith('_') or part.startswith('.') for part in p.relative_to(DATA).parts))


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main(extra):
    reg = load_sources()
    files = {str(p.relative_to(DATA)): sha(p) for p in data_files()}
    sizes = {f: (DATA / f).stat().st_size for f in files}
    groups = {}
    for f, b in sizes.items():
        g = f.split('/')[0] if '/' in f else f
        groups[g] = groups.get(g, 0) + b
    sources = []
    for what, keys, title, licence, used in SOURCE_GROUPS:
        items = []
        for k in keys:
            v = reg[k]
            items.append({'name': k, 'url': v.get('url'), 'title': v['title'], 'licence': v['licence'],
                          'published': v.get('datetime') or v.get('last_modified'), 'retrieved': v['retrieved'],
                          'bytes': v['bytes'], 'sha256': v['sha256']})
            if k == 'osm':
                items[-1]['extracts'] = {n: {'url': e['url'], 'replicationTimestamp': e['replication_timestamp']}
                                         for n, e in v['extracts'].items()}
        sources.append({'what': what, 'title': title, 'licence': licence, 'usedFor': used, 'files': items})
    manifest = {
        'name': 'Itaipu',
        'built': datetime.date.today().isoformat(),
        'contract': 'docs/ITAIPU-PLAN.md',
        'frame': {'crs': UTM, 'E0': E0, 'N0': N0, 'Y0': Y0, 'x': 'E - E0', 'z': '-(N - N0)',
                  'y': 'metres above EGM2008 (both DEMs\' datum), no offset',
                  'hero': [-HERO_HALF, HERO_HALF], 'ring': [-RING_HALF, RING_HALF]},
        'encoding': {'type': 'uint16le', 'samples': TILE_SAMPLES, 'order': 'x fastest, then z',
                     'value': 'round((y + 1000) * 10)', 'origin': 'tile (i, j) of a level starts at x, z = '
                     f'{-RING_HALF:.0f} + (i, j) * tileSize'},
        'levels': [{'level': L, 'cell': cell(L), 'tileSize': tile_size(L), 'tiles': len(level_tiles(L)),
                    'grid': max(i for i, _ in level_tiles(L)) + 1} for L in LEVELS],
        'hero': {'level': -1, 'cell': HERO_CELL, 'tileSize': tile_size(-1),
                 'tiles': [[i, j] for i, j in level_tiles(-1)],
                 'extent': [HERO_X0, HERO_X1],
                 'note': f'the hero tiles cover x and z {HERO_X0:.0f} to {HERO_X1:.0f}, whole level 0 tiles, so every '
                         f'level 0 node over them has all its 10 m children; the hero square (buildings, the dam, '
                         f'hero.jpg) is {-HERO_HALF:.0f} to {HERO_HALF:.0f}. Level 0 to 3 are built from the hero '
                         f'over it: level 0 is every third hero sample there.'},
        'canopy': {'tiling': 'level 0', 'type': 'uint8', 'unit': 'm', 'max': 40, 'tiles': len(level_tiles(0)),
                   'path': 'canopy/{i}_{j}.bin',
                   'from': 'Copernicus GLO-30 minus ANADEM on level 0\'s samples, rounded, clamped to 0..40, 0 on '
                           'the two water bodies: forest canopy and buildings'},
        'water': extra['water'],
        'imagery': extra['imagery'],
        'dam': extra['dam'],
        'osm': extra['osm'],
        'attribution': ATTRIBUTION,
        'loadingScreen': LOADING_LINE,
        'sources': sources,
        'bytes': {'total': sum(sizes.values()), 'byGroup': groups},
        'files': files,
    }
    (DATA / 'manifest.json').write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n')
    print(f'manifest.json: {len(files)} files, {sum(sizes.values()):,} bytes; '
          + ', '.join(f'{g} {b:,}' for g, b in sorted(groups.items())))
    write_docs(manifest)
    return manifest


def write_docs(m):
    (DATA / '.nojekyll').write_text('')
    (DATA / '.gitignore').write_text('_sources/\n_work/\n_tmp/\n')
    lines = '\n'.join(f'- {a}' for a in m['attribution'])
    (DATA / 'README.md').write_text(f'''# FDFPV Itaipu data

Terrain tiles, imagery and map data for the Itaipu map of
[FDFPV](https://fdflabs.github.io/fdfpv/): the Itaipu Dam on the Parana
River at real scale, a 10.24 km hero square around the dam and a 40.96 km
ring of terrain around it. The simulator fetches these files at run time;
this repository is served as a static site for that.

The format is the contract in the simulator's `docs/ITAIPU-PLAN.md`
(section 14), and `manifest.json` lists every file with its checksum. The
files are built by `tools/itaipu/` in the simulator's repository
(github.com/fdflabs/fdfpv); do not edit them by hand.

## Attribution

Wherever the map is shown:

{lines}

## Sources and licences

Each file is under the licence of the source it was made from; `LICENCE.md`
has the terms.

- Elevation: ANADEM v1 (Agencia Nacional de Aguas e Saneamento Basico and
  IPH-UFRGS; Laipelt et al. 2024, "ANADEM: A Digital Terrain Model for
  South America", Remote Sensing 16(13):2321, doi:10.3390/rs16132321),
  CC BY 4.0. Changed: resampled to 30 and 10 m, water beds carved under
  the reservoir and the river, the dam's embankments raised and its
  concrete footprints flattened.
- Water levels and extents, canopy height: Copernicus DEM GLO-30, (c) DLR
  e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018 provided
  under COPERNICUS by the European Union and ESA; all rights reserved.
  Used under the Copernicus DEM licence.
- Colour and ground masks: contains modified Copernicus Sentinel data
  2025 and 2026, processed by ESA (Sentinel-2 L2A, via Element 84 Earth
  Search).
- Buildings, roads, power lines, trees, land use, and the dam's axes and
  footprints: (c) OpenStreetMap contributors. `osm/*.json` is a derived
  database of OpenStreetMap and is made available under the Open
  Database License 1.0 (openstreetmap.org/copyright); each feature keeps
  its OpenStreetMap id.
- The dam's dimensions: Itaipu Binacional's published figures
  (www.itaipu.gov.br/energia), cited by page in `dam.json`. Facts, not
  text; no Itaipu Binacional logo or branding is used.

Each source's download URL, dates, retrieval time and checksum are in
`manifest.json`.
''')
    (DATA / 'LICENCE.md').write_text(f'''# Licences

The files in this repository are data, each under the licence of the
source it was made from. None of them is under the simulator's GPL; the
simulator (github.com/fdflabs/fdfpv) is GPLv3 and uses them as data.

| Files | Source | Licence |
| --- | --- | --- |
| `0/`, `1/`, `2/`, `3/`, `hero/` (elevation) | ANADEM v1, ANA / IPH-UFRGS | CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ ; changed as README.md says |
| the same tiles' water beds, `water.json`, `canopy/` | Copernicus DEM GLO-30 | Copernicus DEM licence (free use, copying, modification and redistribution, with the notice below) |
| `imagery/`, `masks/` | Sentinel-2 L2A (and OpenStreetMap in `masks/`) | Copernicus Sentinel data terms, Regulation (EU) 1159/2013: free, full and open; ODbL for the OpenStreetMap part |
| `osm/` | OpenStreetMap | Open Database License 1.0, https://opendatacommons.org/licenses/odbl/1-0/ |
| `dam.json` | OpenStreetMap (axes, footprints) and Itaipu Binacional's published figures | ODbL 1.0 for the geometry; the figures are cited facts |
| `manifest.json`, `README.md`, `LICENCE.md` | this project | CC0 |

## Notices

{lines}

`osm/*.json` and the OpenStreetMap-derived geometry in `dam.json` and
`masks/` are a derived database of OpenStreetMap, offered here under the
ODbL 1.0: you may copy, distribute and adapt them as long as you
attribute OpenStreetMap and its contributors and keep any adapted
database under the ODbL. A map drawn from them (a produced work) may be
under any licence, with the attribution above shown where it is used.
''')
