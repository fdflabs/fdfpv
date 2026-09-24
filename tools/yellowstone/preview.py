# preview.py: two PNGs for a person to look at: a hillshade of level 3
# with the lakes drawn, and the thermal features over a faint level 2
# hillshade, coloured by kind. Written to the folder given, never into the
# data folder or the repository.
#
# Usage: uv run python preview.py OUT_DIR
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
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from common import DATA, EXTENT, TILE_CELLS, cell, decode, level_tiles, read_tile

KIND_RGB = {'geyser': (230, 30, 30), 'hot spring': (30, 90, 230), 'pool': (0, 190, 210), 'fumarole': (240, 240, 240),
            'mudpot': (140, 90, 40), 'terrace': (250, 170, 0)}


def extent_grid(level):
    tiles = level_tiles(level)
    n = max(i for i, _ in tiles) + 1
    g = np.zeros((n * TILE_CELLS + 1, n * TILE_CELLS + 1))
    for i, j in tiles:
        g[j * TILE_CELLS:j * TILE_CELLS + TILE_CELLS + 1, i * TILE_CELLS:i * TILE_CELLS + TILE_CELLS + 1] = \
            decode(read_tile(DATA / str(level) / f'{i}_{j}.bin'))
    k = int(round(2 * EXTENT / cell(level)))
    return g[:k + 1, :k + 1]


def hillshade(h, c):
    # Sun from the north west at 45 degrees; rows run south (+z).
    dz, dx = np.gradient(h, c)
    slope = np.arctan(np.hypot(dx, dz))
    aspect = np.arctan2(-dz, dx)
    az, alt = np.radians(315.0), np.radians(45.0)
    s = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(s, 0, 1)


def to_px(x, z, size):
    return (x + EXTENT) / (2 * EXTENT) * (size - 1), (z + EXTENT) / (2 * EXTENT) * (size - 1)


def main(out):
    out.mkdir(parents=True, exist_ok=True)
    hydro = json.loads((DATA / 'hydro.json').read_text())

    h = extent_grid(3)
    shade = hillshade(h, cell(3))
    tint = (h - h.min()) / (h.max() - h.min())
    rgb = np.stack([shade * (0.55 + 0.45 * tint), shade * (0.6 + 0.3 * tint), shade * 0.55], -1)
    img = Image.fromarray((rgb * 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    for lake in hydro['lakes']:
        if lake['area'] > 2e5:
            d.polygon([to_px(x, z, 1024) for x, z in lake['rings'][0]], fill=(60, 110, 200))
    for r in hydro['rivers']:
        if r['name'] and max(r['width']) >= 12:
            d.line([to_px(x, z, 1024) for x, z in r['points']], fill=(60, 110, 200), width=1)
    img.save(out / 'yellowstone-level3-hillshade.png')

    h2 = extent_grid(2)
    base = (hillshade(h2, cell(2)) * 110 + 130).astype(np.uint8)
    img = Image.fromarray(base).convert('RGB').resize((1024, 1024), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    thermal = json.loads((DATA / 'thermal.json').read_text())
    for f in sorted(thermal['features'], key=lambda f: f['kind'] == 'hot spring', reverse=True):
        px, pz = to_px(f['x'], f['z'], 1024)
        r = 2 if f['kind'] != 'hot spring' else 1
        d.ellipse([px - r, pz - r, px + r, pz + r], fill=KIND_RGB[f['kind']])
    img.save(out / 'yellowstone-thermal.png')
    print(f'wrote {out}/yellowstone-level3-hillshade.png and yellowstone-thermal.png')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
