# common.py: the Itaipu frame and the paths shared by every step of the
# data pipeline. docs/ITAIPU-PLAN.md is the contract; this file is its
# executable form, so a change here that is not also a change there is a
# bug.
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
from pyproj import Transformer

# World frame, as docs/ITAIPU-PLAN.md section 2 states it: x = E - E0
# (east), z = -(N - N0) (south), y = height in metres above EGM2008, the
# DEMs' own datum, with no offset: Yellowstone's tile encoding (decimetres
# from 1000 m below y 0) covers Itaipu's 90 to 340 m as it is. Both DEMs
# read the reservoir at 219.0, 1.3 m under Itaipu's published 220.30.
# The origin is 1.7 km south of the main dam's crest so that the mapped
# concrete and earth structures (x -1240 to +2860, z -1840 to +1960) sit
# near the middle of the hero square.
E0 = 742500.0
N0 = 7186000.0
UTM = 'EPSG:32721'

# Half widths, metres (docs/ITAIPU-PLAN.md section 3). The elevation
# tiles keep Yellowstone's origin rule (tile i starts at x = -RING_HALF +
# i * size), so both squares are whole numbers of 2560 m hero tiles:
# HERO_HALF is two tiles, RING_HALF eight. HERO is where solids, OSM
# buildings and 10 m terrain live; RING is drawn terrain only. Imagery and
# OSM are cut to FETCH_HALF. Level 0's six 7680 m tiles reach 25600 m on
# the high side, and its tent filter reads 64 cells (1920 m) past the low
# side, so the DEM is cut to DEM_HALF.
HERO_HALF = 5120.0
RING_HALF = 20480.0
FETCH_HALF = 20500.0
DEM_HALF = 27600.0

DATA = Path(os.environ.get('ITAIPU_DATA', Path.home() / 'Desktop' / 'fdfpv-itaipu-data'))
SOURCES = DATA / '_sources'
WORK = DATA / '_work'

# Water levels, world y (docs/ITAIPU-PLAN.md section 5): where Copernicus
# flattened each body, not Itaipu's published 220.30 and 104.00, so the
# water meets the shore the DEM drew.
RESERVOIR_Y = 219.0
RIVER_Y = 103.5

# The tile pyramid, Yellowstone's (tools/yellowstone/common.py) with this
# map's frame: 257 by 257 samples, level L's cell 30 * 2^L m, level -1
# (hero) 10 m, tile (i, j) starting at x, z = -RING_HALF + (i, j) * size.
# Y0 is 0: the encoding holds 96 to 336 m as they are.
Y0 = 0.0
TILE_CELLS = 256
TILE_SAMPLES = TILE_CELLS + 1
TILE_BYTES = TILE_SAMPLES * TILE_SAMPLES * 2
L0_CELL = 30.0
HERO_CELL = 10.0
LEVELS = range(0, 4)
HERO_I = range(6, 10)
HERO_J = range(6, 10)
# Level 0 samples on the low side of the ring, so every level's tent
# filter reads real ground at x = -RING_HALF (64 >> 3 = 8 samples at
# level 3). The DEM is real to DEM_HALF on the high side; level 2 and 3's
# last tiles run past it and repeat its edge, outside the ring.
MARGIN = 64


def cell(level):
    return HERO_CELL if level < 0 else L0_CELL * (1 << level)


def tile_size(level):
    return TILE_CELLS * cell(level)


def level_tiles(level):
    if level < 0:
        return [(i, j) for j in HERO_J for i in HERO_I]
    n = math.ceil(2 * RING_HALF / tile_size(level))
    return [(i, j) for j in range(n) for i in range(n)]


def tile_origin(level, i, j):
    s = tile_size(level)
    return -RING_HALF + i * s, -RING_HALF + j * s


def tile_path(level, i, j):
    return ('hero' if level < 0 else str(level)) + f'/{i}_{j}.bin'


def encode(y):
    # Contract: value = round((y + 1000) * 10), y = height - Y0, half up.
    v = np.floor((np.asarray(y, dtype=np.float64) - Y0 + 1000.0) * 10.0 + 0.5)
    if v.min() < 0 or v.max() > 65535:
        raise ValueError(f'height out of Uint16 range: {v.min()} .. {v.max()}')
    return v.astype('<u2')


def decode(code):
    return np.asarray(code, dtype=np.float64) / 10.0 - 1000.0 + Y0


def write_tile(path, arr, dtype='<u2'):
    assert arr.shape == (TILE_SAMPLES, TILE_SAMPLES), arr.shape
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(np.ascontiguousarray(arr, dtype=dtype).tobytes())


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
    return json.loads((SOURCES / 'sources.json').read_text())


def r1(v):
    """World metres as written to JSON: decimetres, which is the tiles' own resolution."""
    return round(float(v), 1)

# /tmp on the build host is a small tmpfs; GDAL and Python scratch go
# beside the data instead.
TMP = DATA / '_tmp'
TMP.mkdir(parents=True, exist_ok=True)
os.environ['TMPDIR'] = os.environ['CPL_TMPDIR'] = str(TMP)
tempfile.tempdir = str(TMP)


def world_to_utm(x, z):
    return E0 + x, N0 - z


def utm_bounds(half):
    return E0 - half, N0 - half, E0 + half, N0 + half


def lonlat_bounds(half):
    """(west, south, east, north) in degrees covering the square of the given half width."""
    t = Transformer.from_crs(UTM, 'EPSG:4326', always_xy=True)
    w, s, e, n = utm_bounds(half)
    return t.transform_bounds(w, s, e, n, densify_pts=21)
