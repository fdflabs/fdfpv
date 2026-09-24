# build_landcover.py: NLCD 2021 land cover as Uint8 class codes on the
# level 0 and level 1 elevation grids, same tiling and sample positions.
# Level 0 takes the class of the 30 m NLCD pixel under each sample
# (nearest); level 1 takes the most common class in the 60 m square
# centred on each sample (mode), so a thin class does not alias.
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

import numpy as np
import rasterio
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject

from common import DATA, E0, EXTENT, N0, SOURCES, TILE_CELLS, TILE_SAMPLES, UTM, cell, level_tiles, tiles_per_axis, write_tile

NLCD_CLASSES = {11, 12, 21, 22, 23, 24, 31, 41, 42, 43, 52, 71, 81, 82, 90, 95}


def main():
    src = rasterio.open(SOURCES / 'nlcd' / 'nlcd2021_yellowstone.tif')
    nlcd = src.read(1)
    for level, how in ((0, Resampling.nearest), (1, Resampling.mode)):
        c = cell(level)
        n = tiles_per_axis(level) * TILE_CELLS + 1
        dst = np.zeros((n, n), dtype=np.uint8)
        t = Affine(c, 0, E0 - EXTENT - c / 2, 0, -c, N0 + EXTENT + c / 2)
        reproject(nlcd, dst, src_transform=src.transform, src_crs=src.crs, src_nodata=0,
                  dst_transform=t, dst_crs=UTM, dst_nodata=0, resampling=how)
        bad = set(np.unique(dst).tolist()) - NLCD_CLASSES
        if bad:
            raise RuntimeError(f'level {level}: codes {sorted(bad)} are not NLCD classes (0 is no data)')
        for i, j in level_tiles(level):
            r0, c0 = j * TILE_CELLS, i * TILE_CELLS
            write_tile(DATA / 'landcover' / str(level) / f'{i}_{j}.bin', dst[r0:r0 + TILE_SAMPLES, c0:c0 + TILE_SAMPLES])
        v, k = np.unique(dst, return_counts=True)
        print(f'landcover level {level}: {len(level_tiles(level))} tiles, classes', dict(zip(v.tolist(), k.tolist())))


if __name__ == '__main__':
    main()
