# build_imagery.py: the colour and the splat masks (docs/ITAIPU-PLAN.md
# section 8), 1024 by 1024 each: the hero square at 10 m a pixel, the
# ring square at 40 m.
#
# Colour. Sentinel-2 L2A of 20 December 2025 (21JYM, and 21JYN for the
# north 6.5 km), bands B04, B03, B02 as surface reflectance (Earth
# Search's COGs hold reflectance x 10 000 with the processing offset
# already removed), through one fixed curve: the sRGB transfer function
# of reflectance / WHITE. Samples the scene classification marks as no
# data, cloud or cloud shadow take the nearest good sample's colour. The
# two water bodies and the concrete footprints are filled with one flat
# colour each, so the water shader and the dam's geometry own them and
# the photograph's glint, shadows and white water are not drawn twice.
#
# Masks. Four weights per pixel, RGBA, summing to 255: forest, field, red
# soil, urban. From NDVI (B08, B04), the canopy height model, the red to
# green ratio that picks out terra roxa, and OpenStreetMap's buildings,
# built-up landuse and roads (the formula is in the manifest). Water is
# red soil (the beds) and the dam footprints urban.
#
# Pixel (0, 0) covers the square's north-west corner: x and z from -half
# to -half + size / 1024. The pixel grids are Sentinel-2's own 10 m grid
# (both squares' corners are whole multiples of 10 m in UTM), so the hero
# is read, not resampled, and the ring is 4 by 4 averages.
#
# This file is part of the Paraguayan Drone Combat Simulator.
#
# The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.

import numpy as np
import rasterio
from PIL import Image
from rasterio.features import rasterize
from rasterio.transform import Affine
from rasterio.windows import from_bounds
from scipy import ndimage
from shapely.geometry import Polygon

from common import DATA, E0, HERO_HALF, N0, RING_HALF, SOURCES, load_sources
from grids import G10, G30

SIZE = 1024
PX = 10.0
N = int(2 * RING_HALF / PX)
HERO0 = int((RING_HALF - HERO_HALF) / PX)
WHITE = 0.28
JPEG_QUALITY = 92
SCL_BAD = [0, 3, 8, 9, 10]
SCL_WATER = 6
CLOUD_GROW = 3
CLOUD_BRIGHT = 0.12
CLOUD_MIN_PX = 150
SHADOW_RATIO = 0.6
SHADOW_SHARE = 0.35
TILES = ['21JYM', '21JYN']
# Pixel centres of the 10 m ring grid in world x (and z).
CENTRES = -RING_HALF + PX / 2 + PX * np.arange(N)

# OSM tags that make ground urban in the masks, and road widths as in
# docs/ITAIPU-PLAN.md section 7 (metres).
URBAN_LANDUSE = {'residential', 'commercial', 'industrial', 'retail', 'construction', 'railway', 'garages'}
ROAD_WIDTH = {'motorway': 14, 'trunk': 14, 'primary': 10, 'secondary': 8, 'tertiary': 6, 'residential': 6,
              'unclassified': 6, 'service': 3.5, 'track': 3.5}
FOREST = {('landuse', 'forest'), ('natural', 'wood')}
WEIGHTS = {
    'ndvi': '(B08 - B04) / (B08 + B04)',
    'veg': 'smoothstep(0.2, 0.55, ndvi)',
    'tall': 'smoothstep(2, 8, canopy height in m); 1 inside OSM landuse=forest or natural=wood where veg > 0.5',
    'redness': 'smoothstep(1.1, 1.4, B04 / B03)',
    'forest': 'veg * tall',
    'field': 'veg * (1 - tall)',
    'soil': '(1 - veg) * redness',
    'urban': '(1 - veg) * (1 - redness) + 0.6 * osm_urban * (1 - forest), osm_urban being OSM buildings, built-up '
             'landuse and roads at their width',
    'normalise': 'each divided by their sum; floored to 1/255 and the remainder added to the largest',
    'water': 'soil 255 (the bed), for the two bodies and for any other water the scene classification marks',
    'dam footprints': 'urban 255',
}


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ring_transform():
    # The ring's 10 m pixels in UTM: north-west corner at x, z = -RING_HALF.
    return Affine(PX, 0, E0 - RING_HALF, 0, -PX, N0 + RING_HALF)


def read_band(reg, band):
    """One band over the ring at 10 m, from 21JYM where it has data and 21JYN elsewhere; 0 is no data."""
    out = np.zeros((N, N), dtype=np.uint16)
    for tile in TILES:
        with rasterio.open(SOURCES / reg[f's2_{tile}_{band}']['file']) as src:
            win = from_bounds(E0 - RING_HALF, N0 - RING_HALF, E0 + RING_HALF, N0 + RING_HALF, src.transform)
            if band == 'scl':
                a = src.read(1, window=win.round_offsets().round_lengths(), boundless=True, fill_value=0,
                             out_shape=(N, N), resampling=rasterio.enums.Resampling.nearest)
            else:
                a = src.read(1, window=win.round_offsets().round_lengths(), boundless=True, fill_value=0)
        if a.shape != (N, N):
            raise RuntimeError(f'{tile} {band}: read {a.shape}, expected {(N, N)}')
        out = np.where(out == 0, a, out)
    return out


def clouds(red, green, blue, nir, scl):
    """Cloud and its shadow by colour: white blobs (all three visible bands over CLOUD_BRIGHT reflectance) of at
    least CLOUD_MIN_PX pixels that throw a shadow: ground darker in B08 than SHADOW_RATIO of its 1 km mean, not
    water, under at least SHADOW_SHARE of the blob moved 150 to 1000 m west, where the sun (due east, 66 degrees
    up) puts a cumulus's shadow. Measured on this scene: the ring's clouds score 0.46 to 0.92, the cities' white
    roofs 0.18 at most, so the roofs stay."""
    t = CLOUD_BRIGHT * 10000
    white = (red > t) & (green > t) & (blue > t)
    lab, n = ndimage.label(white, structure=np.ones((3, 3), dtype=bool))
    idx = np.arange(1, n + 1)
    size = ndimage.sum(white, lab, idx)
    nf = nir.astype(np.float32)
    dark = (nf < SHADOW_RATIO * ndimage.uniform_filter(nf, size=101)) & (scl != SCL_WATER)
    best = np.zeros(n)
    shifts = range(15, 101, 5)
    for shift in shifts:
        under = np.zeros_like(dark)
        under[:, shift:] = dark[:, :-shift]
        best = np.maximum(best, ndimage.sum(under, lab, idx))
    keep = idx[(size >= CLOUD_MIN_PX) & (best >= SHADOW_SHARE * size)]
    cloud = np.isin(lab, keep)
    reach = np.zeros_like(cloud)
    for shift in shifts:
        reach[:, :-shift] |= cloud[:, shift:]
    return cloud | (reach & dark), len(keep)


def fill_bad(arrs, bad):
    """Every bad pixel takes the nearest good pixel's values."""
    _, (ri, ci) = ndimage.distance_transform_edt(bad, return_indices=True)
    return [a[ri, ci] for a in arrs]


def display(refl):
    v = np.clip(refl / WHITE, 0.0, 1.0)
    return np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(v, 1 / 2.4) - 0.055)


def at_pixels(a30):
    """A G30 array bilinearly at the ring's 10 m pixel centres."""
    k = (CENTRES - G30.x0) / G30.cell
    out = np.empty((N, N), dtype=np.float32)
    for r0 in range(0, N, 512):
        rr, cc = np.meshgrid(k[r0:r0 + 512], k, indexing='ij')
        out[r0:r0 + 512] = ndimage.map_coordinates(a30, [rr, cc], order=1, mode='nearest')
    return out


def water_pixels(bodies30, bodies10):
    """The ring's 10 m pixels over either water body: the hero's 10 m masks inside the hero, level 0's outside."""
    k30 = np.rint((CENTRES - G30.x0) / G30.cell).astype(int)
    wet = np.zeros((N, N), dtype=bool)
    for b in bodies30:
        wet |= b.mask[np.ix_(k30, k30)]
    hero = slice(HERO0, HERO0 + SIZE)
    # Hero pixel centres sit between hero samples; the sample at the pixel's north-west corner decides.
    k10 = np.clip(np.floor((CENTRES[hero] - G10.x0) / G10.cell).astype(int), 0, G10.n - 1)
    h = np.zeros((SIZE, SIZE), dtype=bool)
    for b in bodies10:
        h |= b.mask[np.ix_(k10, k10)]
    wet[hero, hero] = h
    return wet


def burn(shapes, all_touched=False):
    shapes = [s for s in shapes if s is not None and not s.is_empty]
    world = Affine(PX, 0, -RING_HALF, 0, PX, -RING_HALF)
    if not shapes:
        return np.zeros((N, N), dtype=bool)
    return rasterize(shapes, out_shape=(N, N), transform=world, all_touched=all_touched, dtype='uint8').astype(bool)


def osm_layers(osm):
    urban, forest = [], []
    for w in osm.tagged_ways:
        t = w['tags']
        if 'building' in t or t.get('landuse') in URBAN_LANDUSE:
            p = osm.polygon(w)
            if p is not None:
                urban.append(p)
        elif t.get('highway') in ROAD_WIDTH:
            ln = osm.line(w)
            if ln is not None:
                urban.append(ln.buffer(ROAD_WIDTH[t['highway']] / 2, cap_style='flat'))
        elif any((k, t.get(k)) in FOREST for k in ('landuse', 'natural')):
            p = osm.polygon(w)
            if p is not None:
                forest.append(p)
    for r in osm.rels.values():
        t = r.get('tags', {})
        if t.get('type') != 'multipolygon':
            continue
        if 'building' in t or t.get('landuse') in URBAN_LANDUSE:
            urban.append(osm.multipolygon(r)[0])
        elif any((k, t.get(k)) in FOREST for k in ('landuse', 'natural')):
            forest.append(osm.multipolygon(r)[0])
    return burn(urban, all_touched=True), burn(forest)


def quantise(w):
    """Weights (..., 4) summing to 1 as bytes summing to exactly 255."""
    q = np.floor(w * 255.0).astype(np.int32)
    rest = 255 - q.sum(axis=-1)
    top = np.argmax(w, axis=-1)
    np.put_along_axis(q, top[..., None], np.take_along_axis(q, top[..., None], axis=-1) + rest[..., None], axis=-1)
    return q.astype(np.uint8)


def box_down(a, k):
    s = a.shape
    return a.reshape(s[0] // k, k, s[1] // k, k, *s[2:]).mean(axis=(1, 3))


def run(osm, parts, terrain):
    reg = load_sources()
    red, green, blue, nir, scl = (read_band(reg, b) for b in ('red', 'green', 'blue', 'nir', 'scl'))
    # The scene classification misses most of the small cumulus over the
    # ring's west and north: it calls them bare soil (class 5) and their
    # shadows vegetation, so clouds() also finds them by colour.
    found, n_clouds = clouds(red, green, blue, nir, scl)
    bad = np.isin(scl, SCL_BAD) | found | (red == 0) | (green == 0) | (blue == 0) | (nir == 0)
    bad = ndimage.binary_dilation(bad, iterations=CLOUD_GROW)
    # Water the plant does not float on (Lago Acaray, ponds): the scene
    # classification's water class, drawn as bed like the two bodies.
    other_water = scl == SCL_WATER
    hero = slice(HERO0, HERO0 + SIZE)
    print(f'  clouds by colour: {n_clouds}, {found.mean():.3%} of the ring, {found[hero, hero].mean():.3%} of the hero')
    what = (f'pixels no data, cloud or shadow (the scene classification\'s, and {n_clouds} clouds found by colour), '
            f'grown by {CLOUD_GROW * PX:.0f} m and filled from the nearest good one')
    notes = {'hero': f'{bad[hero, hero].mean():.3%} of {what}', 'ring': f'{bad.mean():.3%} of {what}'}
    print('  ' + '; '.join(f'{k} {v}' for k, v in notes.items()))
    red, green, blue, nir = (a.astype(np.float32) / 10000.0 for a in fill_bad([red, green, blue, nir], bad))
    del scl, bad

    wet = water_pixels(terrain['bodies30'], terrain['bodies10'])
    dam = burn([Polygon(e['footprint']) for e in parts if e['footprint']])

    rgb = np.stack([display(red), display(green), display(blue)], axis=-1)
    water_rgb = np.median(rgb[wet], axis=0)
    dam_grey = float(np.median(rgb[dam].mean(axis=-1)))
    rgb[wet] = water_rgb
    rgb[dam] = dam_grey

    ndvi = (nir - red) / np.maximum(nir + red, 1e-4)
    canopy = at_pixels(np.clip(terrain['cop'] - terrain['ana'], 0, 40))
    urban_osm, forest_osm = osm_layers(osm)
    veg = smoothstep(0.2, 0.55, ndvi)
    tall = smoothstep(2.0, 8.0, canopy)
    tall = np.where(forest_osm & (veg > 0.5), 1.0, tall)
    redness = smoothstep(1.1, 1.4, red / np.maximum(green, 1e-4))
    forest = veg * tall
    w = np.stack([forest, veg * (1 - tall), (1 - veg) * redness,
                  (1 - veg) * (1 - redness) + 0.6 * urban_osm * (1 - forest)], axis=-1).astype(np.float32)
    del ndvi, canopy, veg, tall, redness, forest, nir
    w /= np.maximum(w.sum(axis=-1, keepdims=True), 1e-6)
    w[wet | other_water] = (0, 0, 1, 0)
    w[dam] = (0, 0, 0, 1)

    out = {}
    (DATA / 'imagery').mkdir(parents=True, exist_ok=True)
    (DATA / 'masks').mkdir(parents=True, exist_ok=True)
    for name, img, wts in (('hero', rgb[hero, hero], w[hero, hero]), ('ring', box_down(rgb, 4), box_down(w, 4))):
        assert img.shape[:2] == (SIZE, SIZE), img.shape
        p = DATA / 'imagery' / f'{name}.jpg'
        Image.fromarray(np.clip(np.rint(img * 255), 0, 255).astype(np.uint8)).save(p, quality=JPEG_QUALITY, optimize=True)
        q = quantise(wts / wts.sum(axis=-1, keepdims=True))
        m = DATA / 'masks' / f'{name}.png'
        Image.fromarray(q, mode='RGBA').save(m, optimize=True)
        share = q.reshape(-1, 4).mean(axis=0) / 255
        out[name] = {'cover': ', '.join(f'{k} {v:.1%}' for k, v in zip(('forest', 'field', 'soil', 'urban'), share))}
        print(f'  {name}: {p.stat().st_size:,} bytes jpg, {m.stat().st_size:,} bytes png, masks {out[name]["cover"]}')
    return {
        'colour': {'scene': [reg[f's2_{t}_red']['scene'] for t in TILES], 'datetime': reg['s2_21JYM_red']['datetime'],
                   'bands': {'r': 'B04', 'g': 'B03', 'b': 'B02'},
                   'curve': f'sRGB transfer function of min(1, reflectance / {WHITE})', 'white': WHITE,
                   'water': [int(round(v * 255)) for v in water_rgb], 'dam': int(round(dam_grey * 255)),
                   'notes': notes},
        'masks': {'channels': ['forest', 'field', 'red soil', 'urban'], 'sum': 255, 'weights': WEIGHTS,
                  'cover': {k: v['cover'] for k, v in out.items()}},
    }
