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

import os
import tempfile
from pathlib import Path

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
