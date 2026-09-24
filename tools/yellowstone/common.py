# common.py: the Yellowstone frame, tile grid and file encoding shared by
# every step of the data pipeline. docs/YELLOWSTONE-PLAN.md is the
# contract; this file is its executable form, so a change here that is
# not also a change there is a bug.
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
import math
import os
import tempfile
from pathlib import Path

import numpy as np

E0 = 540000.0
N0 = 4941000.0
Y0 = 2200.0
EXTENT = 50000.0
UTM = 'EPSG:32612'

TILE_CELLS = 256
TILE_SAMPLES = TILE_CELLS + 1
L0_CELL = 30.0
HERO_CELL = 10.0
LEVELS = range(0, 6)

DATA = Path(os.environ.get('YELLOWSTONE_DATA', Path.home() / 'Desktop' / 'fdfpv-yellowstone-data'))
SOURCES = DATA / '_sources'
WORK = DATA / '_work'

# /tmp on the build host is a small tmpfs; GDAL and Python scratch go
# beside the data instead.
TMP = DATA / '_tmp'
TMP.mkdir(parents=True, exist_ok=True)
os.environ['TMPDIR'] = os.environ['CPL_TMPDIR'] = str(TMP)
tempfile.tempdir = str(TMP)

# The base grid carries MARGIN level 0 samples on the low side of the
# extent so every level's tent filter reads real ground at x = -50000 and
# not a replicated edge. 64 halves cleanly through level 5 (64 >> 5 = 2),
# and index 0 of each level, the only sample built from a replicated
# neighbour, stays inside the margin.
MARGIN = 64

# Real 3DEP ground is resampled out to this world coordinate on the high
# side. Level 0 to 4 tiles that touch the extent end at 72880, and a
# level 4 sample's tent support reaches 930 m further, so 74800 keeps
# every written tile except level 5's on measured ground. Level 5 is one
# tile 245 km wide; past 74800 it repeats the edge, which is outside the
# extent and never drawn.
REAL_HIGH = 74800.0

# Hero tiles, level -1, 10 m. Columns 6 to 11 are x -34640 to -19280 and
# rows 18 to 27 are z -3920 to 21680: Madison Junction in the north, the
# Lower, Midway and Upper geyser basins and the Firehole River between
# them, and a 3.7 km buffer south of Old Faithful.
HERO_I = range(6, 12)
HERO_J = range(18, 28)


def cell(level):
    return L0_CELL * (1 << level)


def tile_size(level):
    return TILE_CELLS * cell(level)


def tiles_per_axis(level):
    return math.ceil(2 * EXTENT / tile_size(level))


def level_tiles(level):
    n = tiles_per_axis(level)
    return [(i, j) for j in range(n) for i in range(n)]


def tile_origin(level, i, j):
    s = tile_size(level)
    return -EXTENT + i * s, -EXTENT + j * s


def hero_size():
    return TILE_CELLS * HERO_CELL


def hero_tiles():
    return [(i, j) for j in HERO_J for i in HERO_I]


def hero_origin(i, j):
    s = hero_size()
    return -EXTENT + i * s, -EXTENT + j * s


def encode(elev_m):
    # Contract: value = round((y + 1000) * 10) with y = elevation - Y0.
    v = np.floor((np.asarray(elev_m, dtype=np.float64) - Y0 + 1000.0) * 10.0 + 0.5)
    if v.min() < 0 or v.max() > 65535:
        raise ValueError(f'elevation out of Uint16 range: {v.min()} .. {v.max()}')
    return v.astype('<u2')


def decode(code):
    return np.asarray(code, dtype=np.float64) / 10.0 - 1000.0 + Y0


def world_to_utm(x, z):
    return E0 + np.asarray(x), N0 - np.asarray(z)


def utm_to_world(e, n):
    return np.asarray(e) - E0, N0 - np.asarray(n)


def bounds_in(crs, x0, x1, z0, z1):
    # The bounding box in another CRS of a world rectangle, from points
    # along its edges, since a projected edge is not a straight line there.
    from pyproj import Transformer
    t = Transformer.from_crs(UTM, crs, always_xy=True)
    ks = np.linspace(0.0, 1.0, 17)
    xs = np.concatenate([x0 + (x1 - x0) * ks, x0 + (x1 - x0) * ks, np.full(17, x0), np.full(17, x1)])
    zs = np.concatenate([np.full(17, z0), np.full(17, z1), z0 + (z1 - z0) * ks, z0 + (z1 - z0) * ks])
    e, n = world_to_utm(xs, zs)
    lon, lat = t.transform(e, n)
    return float(np.min(lon)), float(np.min(lat)), float(np.max(lon)), float(np.max(lat))


def inside(x, z, pad=0.0):
    return abs(x) <= EXTENT + pad and abs(z) <= EXTENT + pad


def write_tile(path, arr):
    assert arr.shape == (TILE_SAMPLES, TILE_SAMPLES), arr.shape
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(np.ascontiguousarray(arr).tobytes())


def read_tile(path, dtype='<u2'):
    a = np.frombuffer(path.read_bytes(), dtype=dtype)
    if a.size != TILE_SAMPLES * TILE_SAMPLES:
        raise ValueError(f'{path}: {a.size} samples, expected {TILE_SAMPLES * TILE_SAMPLES}')
    return a.reshape(TILE_SAMPLES, TILE_SAMPLES)


def dump_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(obj, f, separators=(',', ':'), ensure_ascii=False)
        f.write('\n')


def load_sources():
    p = SOURCES / 'sources.json'
    return json.loads(p.read_text()) if p.exists() else {}
