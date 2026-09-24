# build_dem.py: USGS 3DEP 1/3 arc second ground resampled to the
# contract's UTM grid at 30 m, levels 1 to 5 by a tent filter, and the
# 10 m hero tiles from the same source, written as 257 by 257 Uint16
# tiles.
#
# Level 0 is made from 1/3 arc second, not the 1 arc second product the
# plan first named: that product is registered about 12 m (7 m west, 10 m
# south) from the 1/3 arc second one, which is the one that matches NHD's
# Yellowstone Lake shoreline. See docs/YELLOWSTONE-DATA.md.
#
# Every level is built from the previous level's written codes, not from
# floats, so a level L+1 sample is exactly the integer tent average of the
# nine level L samples around it and validate.py can check it bit for bit.
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

import numpy as np
import rasterio
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject, transform_bounds

from common import (DATA, E0, EXTENT, HERO_CELL, HERO_I, HERO_J, L0_CELL, LEVELS, MARGIN, N0, REAL_HIGH,
                    SOURCES, TILE_CELLS, TILE_SAMPLES, UTM, WORK, encode, hero_tiles, level_tiles, write_tile)


CROP = 3


def resample(files, x0, z0, cell, nx, nz):
    # Samples at world (x0 + k * cell, z0 + m * cell). Rasterio pixels are
    # areas, so the destination pixel centres are put on the samples.
    # Each source tile is warped straight into the destination: a mosaic
    # through rasterio.merge(bounds=...) starts its grid at the bounds, not
    # on the source pixels, and moved the ground by up to a pixel. The 3DEP
    # tiles overlap their neighbours by six pixels; each is cropped by CROP
    # first, so no sample comes from a bilinear footprint cut by a tile
    # edge, and the rest of the overlap still covers the seam.
    dst_transform = Affine(cell, 0, E0 + x0 - cell / 2, 0, -cell, N0 - z0 + cell / 2)
    out = np.full((nz, nx), np.nan, dtype=np.float32)
    for f in files:
        with rasterio.open(f) as src:
            w, s, e, n = transform_bounds(UTM, src.crs, E0 + x0 - cell, N0 - z0 - nz * cell, E0 + x0 + nx * cell,
                                          N0 - z0 + cell)
            b = src.bounds
            if e < b.left or w > b.right or n < b.bottom or s > b.top:
                continue
            data = src.read(1)[CROP:-CROP, CROP:-CROP]
            if src.nodata is not None:
                data = np.where(data == src.nodata, np.nan, data)
            t, crs = src.transform * Affine.translation(CROP, CROP), src.crs
        part = np.full((nz, nx), np.nan, dtype=np.float32)
        reproject(data, part, src_transform=t, src_crs=crs, src_nodata=np.nan, dst_transform=dst_transform,
                  dst_crs=UTM, dst_nodata=np.nan, resampling=Resampling.bilinear)
        fill = np.isnan(out) & ~np.isnan(part)
        out[fill] = part[fill]
        del data, part
    holes = int(np.isnan(out).sum())
    if holes:
        raise RuntimeError(f'{holes} samples have no 3DEP ground; a source tile is missing')
    return out


def tent_down(codes):
    # One level coarser: the (1 2 1) x (1 2 1) / 16 average centred on
    # every other sample, rounded half up, in integers.
    a = np.pad(codes.astype(np.int64), 1, mode='edge')
    a = a[:-2] + 2 * a[1:-1] + a[2:]
    a = a[::2]
    a = a[:, :-2] + 2 * a[:, 1:-1] + a[:, 2:]
    a = a[:, ::2]
    return (a + 8) // 16


def main():
    files = sorted((SOURCES / 'dem13').glob('*.tif'))
    real = MARGIN + int(round((REAL_HIGH + EXTENT) / L0_CELL)) + 1
    x0 = -EXTENT - MARGIN * L0_CELL
    print(f'level 0: resampling {len(files)} 3DEP 1/3 arc second tiles to {real} x {real} samples')
    elev = resample(files, x0, x0, L0_CELL, real, real)
    WORK.mkdir(parents=True, exist_ok=True)
    np.save(WORK / 'l0_elev.npy', elev)
    (WORK / 'l0_elev.json').write_text(json.dumps({'x0': x0, 'z0': x0, 'cell': L0_CELL, 'shape': elev.shape}))
    print(f'  elevation {np.nanmin(elev):.1f} .. {np.nanmax(elev):.1f} m')

    # Level 5's one tile spans 245 km; past the measured ground it repeats
    # the edge. The size keeps every level's highest tile inside its array.
    full = MARGIN + (TILE_CELLS << 5) + MARGIN + 1
    codes = np.pad(encode(elev).astype(np.int64), ((0, full - real), (0, full - real)), mode='edge')
    del elev

    counts = {}
    for level in LEVELS:
        if level > 0:
            codes = tent_down(codes)
        m = MARGIN >> level
        n = 0
        for i, j in level_tiles(level):
            r0, c0 = m + j * TILE_CELLS, m + i * TILE_CELLS
            tile = codes[r0:r0 + TILE_SAMPLES, c0:c0 + TILE_SAMPLES]
            assert tile.shape == (TILE_SAMPLES, TILE_SAMPLES), (level, i, j, tile.shape)
            write_tile(DATA / str(level) / f'{i}_{j}.bin', tile.astype('<u2'))
            n += 1
        counts[level] = n
        print(f'level {level}: {n} tiles, array {codes.shape[0]}')

    hs = TILE_CELLS * HERO_CELL
    hx0, hz0 = -EXTENT + HERO_I.start * hs, -EXTENT + HERO_J.start * hs
    nx, nz = len(HERO_I) * TILE_CELLS + 1, len(HERO_J) * TILE_CELLS + 1
    print(f'hero: resampling to {nx} x {nz} samples')
    hcodes = encode(resample(files, hx0, hz0, HERO_CELL, nx, nz))
    for i, j in hero_tiles():
        r0, c0 = (j - HERO_J.start) * TILE_CELLS, (i - HERO_I.start) * TILE_CELLS
        write_tile(DATA / 'hero' / f'{i}_{j}.bin', hcodes[r0:r0 + TILE_SAMPLES, c0:c0 + TILE_SAMPLES])
    print(f'hero: {len(hero_tiles())} tiles')


if __name__ == '__main__':
    main()
