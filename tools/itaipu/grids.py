# grids.py: the two sample grids every raster step shares, and the
# resampling that puts the sources on them.
#
# G30 is level 0's grid: samples at x, z = X30 + k * 30, from MARGIN
# samples before the ring's low edge to far enough past its high edge for
# level 3's tent filter. G10 is the hero tiles' grid: samples at x, z =
# HERO_X0 + k * 10, and hero sample 3k is G30 sample H30 + k, so the hero is exactly
# level 0 at every third sample before the hero's own edits.
#
# Samples, not pixels: a raster warped onto a grid here has its pixel
# centres on the samples (Yellowstone's build_dem.py, the same rule).
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
from rasterio.features import rasterize
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject
from scipy import ndimage

from common import (DEM_HALF, E0, HERO_CELL, HERO_X0, HERO_X1, L0_CELL, MARGIN, N0, RING_HALF, SOURCES, TILE_CELLS, UTM,
                    load_sources)


class Grid:
    def __init__(self, x0, cell, n):
        self.x0, self.cell, self.n = x0, cell, n
        # Pixel centres on the samples: pixel (r, c) is centred on world (x0 + c * cell, x0 + r * cell).
        self.transform = Affine(cell, 0, E0 + x0 - cell / 2, 0, -cell, N0 - x0 + cell / 2)
        # The same grid in world x, z (z grows with the row), for shapes already in world metres.
        self.world = Affine(cell, 0, x0 - cell / 2, 0, cell, x0 - cell / 2)

    @property
    def coords(self):
        return self.x0 + np.arange(self.n) * self.cell

    def index(self, v):
        return int(round((v - self.x0) / self.cell))

    def square(self, half):
        """Slice of the samples with |x| <= half."""
        return slice(self.index(-half), self.index(half) + 1)

    def burn(self, shapes, all_touched=False):
        """Boolean raster of world (x, z) shapely shapes on this grid."""
        shapes = [s for s in shapes if s is not None and not s.is_empty]
        if not shapes:
            return np.zeros((self.n, self.n), dtype=bool)
        return rasterize(shapes, out_shape=(self.n, self.n), transform=self.world, all_touched=all_touched,
                         dtype='uint8').astype(bool)

    def distance(self, mask):
        """Metres from every sample to the nearest True sample of mask."""
        if not mask.any():
            return np.full(mask.shape, np.inf)
        return ndimage.distance_transform_edt(~mask) * self.cell


X30 = -RING_HALF - MARGIN * L0_CELL
N30 = MARGIN + (TILE_CELLS << 3) + MARGIN + 1
G30 = Grid(X30, L0_CELL, N30)
# Where the DEM is real: one sample inside DEM_HALF on the high side
# (fetch.py cut ANADEM there, and a bilinear sample on the cut has no
# neighbour past it).
REAL30 = G30.index(DEM_HALF - L0_CELL) + 1
G10 = Grid(HERO_X0, HERO_CELL, int((HERO_X1 - HERO_X0) / HERO_CELL) + 1)
H30 = G30.index(HERO_X0)


def warp_dem(key):
    """A DEM on G30, bilinear, edge-repeated past DEM_HALF."""
    reg = load_sources()
    out = np.full((REAL30, REAL30), np.nan, dtype=np.float64)
    tf = G30.transform
    with rasterio.open(SOURCES / reg[key]['file']) as src:
        reproject(rasterio.band(src, 1), out, src_transform=src.transform, src_crs=src.crs, src_nodata=src.nodata,
                  dst_transform=tf, dst_crs=UTM, dst_nodata=np.nan, resampling=Resampling.bilinear)
    holes = int(np.isnan(out).sum())
    if holes:
        raise RuntimeError(f'{key}: {holes} samples of G30 have no data')
    return np.pad(out, ((0, N30 - REAL30), (0, N30 - REAL30)), mode='edge')


def upsample_hero(a30):
    """G30 values bilinearly at every G10 sample: exact at every third one."""
    k = np.arange(G10.n) / 3.0
    rr, cc = np.meshgrid(H30 + k, H30 + k, indexing='ij')
    return ndimage.map_coordinates(a30, [rr, cc], order=1, mode='nearest')


def flat_water(cop, lo, hi):
    """Samples where Copernicus is flat water: within 1 cm of all eight neighbours (Copernicus flattens a water
    body to one value; bilinear resampling keeps it to rounding), within [lo, hi]."""
    c = cop[1:-1, 1:-1]
    flat = np.ones_like(c, dtype=bool)
    for dz in (0, 1, 2):
        for dx in (0, 1, 2):
            flat &= np.abs(cop[dz:dz + c.shape[0], dx:dx + c.shape[1]] - c) < 0.01
    out = np.zeros(cop.shape, dtype=bool)
    out[1:-1, 1:-1] = flat & (c >= lo) & (c <= hi)
    return out
