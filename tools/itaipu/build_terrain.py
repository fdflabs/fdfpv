# build_terrain.py: the ground. ANADEM on level 0's 30 m grid, the
# water bodies found on it, their beds carved, levels 1 to 3 by the tent
# filter, the 10 m hero from level 0 with the dam's edits and deeper beds,
# and the canopy height model.
#
# Order, and why:
#   1. ANADEM and Copernicus on G30 (grids.py).
#   2. The two water bodies on G30 (water.py): each is the flat water
#      Copernicus drew at its level, grown over every sample connected to
#      it that lies at most 0.2 m above the level, stopped by the dam.
#   3. The hero tiles: ANADEM on G30 bilinear at 10 m, then the dam
#      (below), then the bodies found again at 10 m and their beds 3 m
#      under the level, then each concrete footprint's ground as its
#      groundRule says: the lowest ground just outside it after the beds,
#      at most its foundation for the right lateral dam, and under the
#      spillway a ground that falls with the chute.
#   4. Level 0 = ANADEM with each body's bed 1 m under its level, and
#      the hero's own samples wherever the hero tiles are; levels 1 to 3
#      from level 0's codes (the integer tent). So every level
#      agrees with the hero over it, and the terrain engine has nothing
#      to reconcile.
#   5. Canopy: Copernicus minus ANADEM on G30, 0 to 40 m, 0 on water.
#
# The dam in the hero (docs/ITAIPU-PLAN.md section 4). A 30 m DEM smears
# a dam over the ground around it: the rockfill dam's crest reads 190 m
# along its crest road and 220 m 66 m out in the reservoir, and the
# ground in front of the powerhouse reads 105 to 117 m where Sentinel-2
# sees the tailrace. So around every part (its `burn.zone`, from its axis
# or footprint): on the reservoir's side, ground below the crest whose
# `burn.window` reaches the reservoir is the reservoir; on the other
# side, ground Sentinel-2 sees as water is the river. Both are then found
# as water and bedded like the rest. Then each embankment's section
# (crest at crestY, `crestWidth` wide, faces at `slope` horizontal to 1
# vertical) is raised along its axis where it stands above the ground.
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
import shapely
from rasterio.windows import from_bounds
from scipy import ndimage
from shapely.geometry import LineString, Polygon

import water
from build_dam import DESMEAR_WINDOW
from common import (DATA, E0, HERO_X0, HERO_X1, HERO_I, HERO_J, LEVELS, MARGIN, N0, RESERVOIR_Y, RING_HALF, RIVER_Y,
                    SOURCES, TILE_CELLS, TILE_SAMPLES, encode, level_tiles, load_sources, write_tile)
from grids import G10, G30, H30, upsample_hero, warp_dem

BED_HERO = 3.0
BED_RING = 1.0
CANOPY_MAX = 40
NDWI_WATER = 0.2


def tent_down(codes):
    # One level coarser: the (1 2 1) x (1 2 1) / 16 average centred on
    # every other sample, rounded half up, in integers.
    a = np.pad(codes.astype(np.int64), 1, mode='edge')
    a = a[:-2] + 2 * a[1:-1] + a[2:]
    a = a[::2]
    a = a[:, :-2] + 2 * a[:, 1:-1] + a[:, 2:]
    a = a[:, ::2]
    return (a + 8) // 16


def reservoir_side(crest):
    """The half plane beyond the crest road from the downstream country: a polygon closed far to the north, so a
    point inside it is on the reservoir's side of the dam."""
    c = list(crest.coords)
    far = 4 * RING_HALF
    zw, ze = c[0][1], c[-1][1]
    return Polygon(c + [(far, ze), (far, -far), (-far, -far), (-far, zw)])


def points_distance(grid, geom, pad):
    """Metres from every sample of grid within pad of geom's bounds to geom; inf elsewhere."""
    x0, z0, x1, z1 = geom.bounds
    c = grid.coords
    ci = np.nonzero((c >= x0 - pad) & (c <= x1 + pad))[0]
    ri = np.nonzero((c >= z0 - pad) & (c <= z1 + pad))[0]
    out = np.full((grid.n, grid.n), np.inf)
    if ci.size == 0 or ri.size == 0:
        return out
    xx, zz = np.meshgrid(c[ci], c[ri])
    d = shapely.distance(shapely.points(xx.ravel(), zz.ravel()), geom).reshape(xx.shape)
    out[ri[0]:ri[-1] + 1, ci[0]:ci[-1] + 1] = d
    return out


def seen_water():
    """Hero samples Sentinel-2 (20 December 2025, 21JYM) sees as open water: NDWI, (B03 - B08) / (B03 + B08),
    over NDWI_WATER, averaged over the four 10 m pixels that meet at the sample."""
    reg = load_sources()
    bands = {}
    for b in ('green', 'nir'):
        with rasterio.open(SOURCES / reg[f's2_21JYM_{b}']['file']) as src:
            win = from_bounds(E0 + HERO_X0 - G10.cell, N0 - HERO_X1 - G10.cell, E0 + HERO_X1 + G10.cell,
                              N0 - HERO_X0 + G10.cell, src.transform).round_offsets().round_lengths()
            bands[b] = src.read(1, window=win).astype(np.float64)
    ndwi = (bands['green'] - bands['nir']) / np.maximum(bands['green'] + bands['nir'], 1.0)
    # Pixel k spans the samples k - 1 and k of G10 (the window starts one pixel before the hero's first sample).
    four = (ndwi[:-1, :-1] + ndwi[1:, :-1] + ndwi[:-1, 1:] + ndwi[1:, 1:]) / 4
    assert four.shape == (G10.n, G10.n), four.shape
    return four > NDWI_WATER


def dam_edits(h, parts, crest):
    """The hero ground h with every part's smear replaced and the embankments raised (in place). Returns the
    mask of samples it changed the rule for (every part's zone)."""
    upstream = G10.burn([reservoir_side(crest)])
    low = ndimage.minimum_filter(h, size=int(DESMEAR_WINDOW // G10.cell) | 1)
    zone = np.zeros(h.shape, dtype=bool)
    raise_to = np.full(h.shape, -np.inf)
    for e in parts:
        burn = e.get('burn')
        if not burn:
            continue
        if e['footprint']:
            geom = Polygon(e['footprint'])
        else:
            geom = LineString(e['axis'])
        d = points_distance(G10, geom, burn['zone'])
        zone |= d <= burn['zone']
        if not e['footprint']:
            sec = e['sections'][0]
            prof = e['crestY'] - np.maximum(0.0, d - sec['crestWidth'] / 2) / sec['slope']
            raise_to = np.maximum(raise_to, np.where(d <= burn['zone'], prof, -np.inf))
    crest_y = max(e['crestY'] for e in parts if e.get('burn'))
    smear = zone & upstream & (low <= RESERVOIR_Y + 0.05) & (h < crest_y - 2.0)
    h[smear] = RESERVOIR_Y
    tail = zone & ~upstream & seen_water() & (h > RIVER_Y)
    h[tail] = RIVER_Y
    np.maximum(h, raise_to, out=h)
    return zone


def flatten(h, e, poly):
    """The ground under a concrete footprint, as its `groundRule` says (build_dam.py), and its groundY set."""
    inside = G10.burn([poly])
    ring = ndimage.binary_dilation(inside, structure=np.ones((3, 3), dtype=bool)) & ~inside
    low = float(h[ring].min())
    rule = e['groundRule']
    if rule == 'chute':
        sec = next(s for s in e['sections'] if s['at'] == 'chute')
        (ax, az), (bx, bz) = sec['axis'][0], sec['axis'][-1]
        ux, uz = bx - ax, bz - az
        n = np.hypot(ux, uz)
        xx, zz = np.meshgrid(G10.coords, G10.coords)
        d = ((xx - ax) * ux + (zz - az) * uz) / n
        knots = np.array(e['groundProfile'])
        h[inside] = np.interp(d[inside], knots[:, 0], knots[:, 1])
        e['groundY'] = round(float(h[inside].min()), 1)
        return
    y = min(low, e['baseY']) if rule == 'ring, at most baseY' else low
    e['groundY'] = round(y, 1)
    h[inside] = e['groundY']


def run(osm, parts, crest):
    ana = warp_dem('anadem')
    cop = warp_dem('cop30')
    print(f'G30: {G30.n} x {G30.n} samples from {G30.x0:.0f} m, ANADEM {ana.min():.1f} .. {ana.max():.1f} m')

    foot = [Polygon(e['footprint']) for e in parts if e['footprint']]
    bodies30 = water.find30(osm, ana, cop, crest, foot)

    h = upsample_hero(ana)
    zone = dam_edits(h, parts, crest)
    bodies10 = water.find10(osm, h, bodies30, crest, foot)
    for b in bodies10:
        h[b.mask] = np.minimum(h[b.mask], b.y - BED_HERO)
    for e, poly in zip([e for e in parts if e['footprint']], foot):
        flatten(h, e, poly)
    hcodes = encode(h)
    for i, j in level_tiles(-1):
        r0, c0 = (j - HERO_J.start) * TILE_CELLS, (i - HERO_I.start) * TILE_CELLS
        write_tile(DATA / 'hero' / f'{i}_{j}.bin', hcodes[r0:r0 + TILE_SAMPLES, c0:c0 + TILE_SAMPLES])
    print(f'hero: {len(level_tiles(-1))} tiles, {h.min():.1f} .. {h.max():.1f} m, dam zone {zone.mean():.2%} of it')

    # Level 0 is the hero wherever the hero is (every third hero sample),
    # so every level agrees with the ground the craft lands on, and the
    # 1 m beds on the 30 m water outside it.
    l0 = ana.copy()
    for b in bodies30:
        l0[b.mask] = np.minimum(l0[b.mask], b.y - BED_RING)
    k = (G10.n - 1) // 3 + 1
    l0[H30:H30 + k, H30:H30 + k] = h[::3, ::3]
    codes = encode(l0).astype(np.int64)
    counts = {}
    for level in LEVELS:
        if level > 0:
            codes = tent_down(codes)
        m = MARGIN >> level
        for i, j in level_tiles(level):
            r0, c0 = m + j * TILE_CELLS, m + i * TILE_CELLS
            tile = codes[r0:r0 + TILE_SAMPLES, c0:c0 + TILE_SAMPLES]
            assert tile.shape == (TILE_SAMPLES, TILE_SAMPLES), (level, i, j, tile.shape)
            write_tile(DATA / str(level) / f'{i}_{j}.bin', tile)
        counts[level] = len(level_tiles(level))
        print(f'level {level}: {counts[level]} tiles')

    canopy = np.clip(np.rint(cop - ana), 0, CANOPY_MAX)
    for b in bodies30:
        canopy[b.mask] = 0
    canopy = canopy.astype('u1')
    for i, j in level_tiles(0):
        r0, c0 = MARGIN + j * TILE_CELLS, MARGIN + i * TILE_CELLS
        write_tile(DATA / 'canopy' / f'{i}_{j}.bin', canopy[r0:r0 + TILE_SAMPLES, c0:c0 + TILE_SAMPLES], dtype='u1')
    ring = G30.square(RING_HALF)
    print(f'canopy: {len(level_tiles(0))} tiles, ring mean {canopy[ring, ring].mean():.1f} m, '
          f'{(canopy[ring, ring] >= 5).mean():.1%} of the ring at 5 m or more')
    return {'l0': l0, 'hero': h, 'bodies30': bodies30, 'bodies10': bodies10, 'zone': zone, 'ana': ana, 'cop': cop}
