# build_war_height.py: the war room's floor for hunters over Itaipu
# (docs/WARFARE-PLAN.md section 4.4), src/share/war/itaipu-height.bin.
#
# The room steers hunters and cannot load the map, so it gets this: the
# hero square at 40 m, 256 by 256 cells, one Uint16 a cell, little
# endian, row major from the north west corner (index j * 256 + i, cell
# (i, j) centred on x = -HERO_HALF + 40 i + 20, z = -HERO_HALF + 40 j +
# 20), in the tiles' own encoding, decimetres from 1000 m below y 0. No
# header: the contract fixes the size at 131 072 bytes, and
# edge/rooms/warhunt.js loadHeight refuses any other.
#
# What a cell holds is a FLOOR, not a sample: the highest of ground,
# water (the reservoir at 219.0 and the river at 103.5 inside their
# water.json outlines) and the dam's concrete (crestY over every dam.json
# footprint: the terrain under the main dam is flattened to its 100.5 m
# toe and the wall is a solid, so ground and water alone would let a
# hunter through 125 m of concrete) over every 10 m hero sample within
# 50 m of the cell's centre, rounded up. The room reads it bilinearly between cell
# centres, so a point is always within 40 m of each of the four centres
# it reads and its 10 m triangle's corners within 50 m: the room's floor
# is never under the client's ground (terrain engine finestAt) anywhere
# in the hero square. The price is that it stands over the ground by up
# to the rise within 50 m on slopes, which only makes a hunter cautious;
# scripts/warhunt-check.js measures both against finestAt.
#
# Run: uv run python build_war_height.py (reads ITAIPU_DATA, by default
# ~/Desktop/fdfpv-itaipu-data, and writes into this repository).
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
from pathlib import Path

import numpy as np
import shapely
from scipy import ndimage

from common import DATA, HERO_CELL, HERO_HALF, HERO_I, HERO_J, RESERVOIR_Y, RIVER_Y, TILE_CELLS, TILE_SAMPLES

CELL = 40.0
N = int(2 * HERO_HALF / CELL)
# Fine samples per cell, and the reach of a cell's window in fine samples:
# 40 m to the farthest point that reads the cell plus one 10 m triangle.
FAN = int(CELL / HERO_CELL)
REACH = FAN + 1
OUT = Path(__file__).resolve().parents[2] / 'src' / 'share' / 'war' / 'itaipu-height.bin'
LEVELS = {'reservoir': RESERVOIR_Y, 'river': RIVER_Y}


def hero_heights():
    """The hero square's 10 m samples, world y, (z, x) from the north west."""
    n = len(HERO_I) * TILE_CELLS + 1
    codes = np.zeros((n, n), dtype='<u2')
    for j in HERO_J:
        for i in HERO_I:
            tile = np.fromfile(DATA / 'hero' / f'{i}_{j}.bin', dtype='<u2')
            assert tile.size == TILE_SAMPLES * TILE_SAMPLES, (i, j, tile.size)
            r0, c0 = (j - HERO_J.start) * TILE_CELLS, (i - HERO_I.start) * TILE_CELLS
            codes[r0:r0 + TILE_SAMPLES, c0:c0 + TILE_SAMPLES] = tile.reshape(TILE_SAMPLES, TILE_SAMPLES)
    return codes.astype(np.float64) * 0.1 - 1000.0


def fold_water(h):
    bodies = json.loads((DATA / 'water.json').read_text())
    names = sorted(b['name'] for b in bodies)
    assert names == sorted(LEVELS), f'water.json holds {names}, the floor knows {sorted(LEVELS)}'
    xs = -HERO_HALF + HERO_CELL * np.arange(h.shape[1])
    x, z = np.meshgrid(xs, xs)
    for b in bodies:
        assert b['y'] == LEVELS[b['name']], (b['name'], b['y'])
        assert not b['holes'], f"{b['name']} has holes the floor does not read"
        inside = shapely.contains_xy(shapely.Polygon(b['outline']), x, z)
        h = np.where(inside, np.maximum(h, b['y']), h)
        print(f"{b['name']}: {inside.mean():.1%} of the hero's samples at {b['y']} m")
    return h


def fold_dam(h):
    xs = -HERO_HALF + HERO_CELL * np.arange(h.shape[1])
    x, z = np.meshgrid(xs, xs)
    for p in json.loads((DATA / 'dam.json').read_text()):
        if not p.get('footprint'):
            continue
        inside = shapely.contains_xy(shapely.Polygon(p['footprint']), x, z)
        h = np.where(inside, np.maximum(h, p['crestY']), h)
        print(f"{p['part']}: {inside.sum()} samples at {p['crestY']} m")
    return h


def main():
    h = fold_dam(fold_water(hero_heights()))
    peak = ndimage.maximum_filter(h, size=2 * REACH + 1, mode='nearest')
    centre = FAN // 2
    floor = peak[centre::FAN, centre::FAN][:N, :N]
    assert floor.shape == (N, N), floor.shape
    codes = np.ceil(np.round((floor + 1000.0) * 10.0, 6)).astype(np.int64)
    assert codes.min() >= 0 and codes.max() <= 65535, (codes.min(), codes.max())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    codes.astype('<u2').tofile(OUT)
    y = codes * 0.1 - 1000.0
    print(f'{OUT}: {N} x {N} cells of {CELL:.0f} m, {OUT.stat().st_size} bytes, floor {y.min():.1f} .. {y.max():.1f} m, '
          f'over the samples at the centres by mean {(y - h[centre::FAN, centre::FAN][:N, :N]).mean():.1f} m')


if __name__ == '__main__':
    main()
