# water.py: the two plant water bodies (docs/ITAIPU-PLAN.md section 5):
# where each one is, on level 0's grid and on the hero's, and the outline
# the plant gets for it.
#
# Where. Copernicus flattens a water body to one height, so each body
# starts as the flat Copernicus samples at its level connected to a point
# known to be in it, and grows over every sample connected to it whose
# ground lies at most RISE above the level (the shore Copernicus smeared,
# the tailrace ANADEM reads at 105), or that OpenStreetMap maps as that
# water and whose ground is near the level. The dam's crest road and
# concrete footprints stop the growth: a 30 m DEM draws no wall there.
#
# Outline. The plant takes one ring of at most 256 vertices per body and
# ignores what it cannot store (docs/ITAIPU-PLAN.md section 5), so the
# outline has at most MAX_VERTICES. It must hold every sample of its body,
# because a float over a sample outside it would drop through the water,
# and it must not reach ground that lies under the water's level outside
# the body, the dam's footprints or the other body, because there the
# plant would put water where the map has none. Anywhere else it may run
# over land: land stands above the water there, so the ground wins. The
# plan asked for at most 30 m over land; the reservoir's shore inside the
# ring is several hundred kilometres of drowned valleys and cannot be
# held to 30 m in 240 vertices, so the rule is the one above, which is
# the reason the plan gave for its 30 m.
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

import heapq
import math
from dataclasses import dataclass, field

import numpy as np
import shapely
from rasterio.features import shapes
from scipy import ndimage
from shapely.geometry import Polygon, box, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

from common import HERO_X0, HERO_X1, RESERVOIR_Y, RING_HALF, RIVER_Y, r1
from grids import G10, G30, H30, flat_water
from osm import polygons_of

MAX_VERTICES = 240
# Vertices the simplifier stops at, under MAX_VERTICES: rounding to 0.1 m
# and the plant's closing edge need none, but a later rebuild whose shore
# moves should not land on the limit.
TARGET_VERTICES = 232
EIGHT = np.ones((3, 3), dtype=bool)

# name, level, the Copernicus range its flat water reads, how far above
# the level the body grows, a point inside it (the float spawn), the
# spawn's yaw, the fetch cap, and the OSM water that is it.
BODIES = [
    {'name': 'reservoir', 'title': 'Lago de Itaipu', 'y': RESERVOIR_Y, 'flat': (RESERVOIR_Y - 0.05, RESERVOIR_Y + 0.05),
     'rise': 0.2, 'spawn': {'x': 60.0, 'z': -2500.0, 'yaw': 3.142}, 'fetchMax': 12000.0,
     'osm': lambda t: t.get('name') == 'Lago de Itaipu'},
    {'name': 'river', 'title': 'Rio Parana below the dam', 'y': RIVER_Y, 'flat': (101.5, 105.5),
     'rise': 1.8, 'spawn': {'x': -925.0, 'z': 400.0, 'yaw': 0.0}, 'fetchMax': 400.0,
     'osm': lambda t: t.get('natural') == 'water' and t.get('water') == 'river'},
]
# Where the 10 m hero tiles are: there the bodies are the hero's 10 m
# ones, elsewhere level 0's.
HERO_TILES = box(HERO_X0, HERO_X0, HERO_X1, HERO_X1)
# OSM water is added only where the ground is within this of the level:
# an OSM polygon over a bank or a bridge must not dig a pit.
OSM_RISE = 3.0


@dataclass
class Body:
    spec: dict
    grid: object
    mask: np.ndarray
    notes: list = field(default_factory=list)

    @property
    def y(self):
        return self.spec['y']

    @property
    def name(self):
        return self.spec['name']


def osm_water(osm, match):
    """Polygons OSM maps as this water, from ways and multipolygons, with how many rings did not close in the cut."""
    polys, missing = [], 0
    for w in osm.tagged_ways:
        if w['tags'].get('natural') == 'water' and match(w['tags']):
            p = osm.polygon(w)
            if p is not None:
                polys.append(p)
    for r in osm.rels.values():
        t = r.get('tags', {})
        if t.get('type') == 'multipolygon' and match(t):
            p, miss = osm.multipolygon(r)
            missing += miss
            polys += polygons_of(p)
    return unary_union(polys) if polys else None, missing


def component_at(mask, grid, x, z):
    lab, _ = ndimage.label(mask, structure=EIGHT)
    k = lab[grid.index(z), grid.index(x)]
    if k == 0:
        raise RuntimeError(f'no water at {x}, {z}')
    return lab == k


def in_square(grid, half):
    c = np.abs(grid.coords) <= half
    return c[:, None] & c[None, :]


def find30(osm, ana, cop, crest, foot):
    inring = in_square(G30, RING_HALF)
    barrier = G30.burn([crest.buffer(30.0)], all_touched=True) | G30.burn(foot)
    bodies = []
    taken = np.zeros(ana.shape, dtype=bool)
    # The river first: its flat water must not be taken by the reservoir's
    # growth, and the reservoir's growth stops at the dam anyway.
    for spec in sorted(BODIES, key=lambda s: s['y']):
        poly, missing = osm_water(osm, spec['osm'])
        mapped = G30.burn([poly]) if poly is not None else np.zeros(ana.shape, dtype=bool)
        ok = inring & ~barrier & ~taken
        flat = flat_water(cop, *spec['flat']) & ok
        seed = component_at(flat, G30, spec['spawn']['x'], spec['spawn']['z'])
        grow = ok & ((ana <= spec['y'] + spec['rise']) | (mapped & (ana <= spec['y'] + OSM_RISE)))
        mask = ndimage.binary_propagation(seed, structure=EIGHT, mask=grow | seed)
        b = Body(spec, G30, mask)
        b.notes.append(f'{mask.sum()} samples at 30 m ({mask.sum() * 900 / 1e6:.1f} km2): {seed.sum()} flat in '
                       f'Copernicus, {(mask & mapped & ~seed).sum()} more that OSM maps as this water; '
                       f'{missing} OSM member ways missing from the cut')
        print(f'  {spec["name"]}: ' + b.notes[-1])
        taken |= mask
        bodies.append(b)
    res = next(b for b in bodies if b.name == 'reservoir')
    riv = next(b for b in bodies if b.name == 'river')
    for x, z, b, want in ((0, 0, res, False), (-925, 400, res, False), (1484, -4206, riv, False),
                          (1484, -4206, res, True), (-925, 400, riv, True)):
        got = bool(b.mask[G30.index(z), G30.index(x)])
        if got != want:
            raise RuntimeError(f'{b.name} at {x}, {z}: {"water" if got else "dry"}, expected the opposite: a leak')
    return [res, riv]


def to_hero(mask30):
    k = np.rint(np.arange(G10.n) / 3.0).astype(int) + H30
    return mask30[np.ix_(k, k)]


def find10(osm, h, bodies30, crest, foot):
    barrier = G10.burn([crest.buffer(10.0)], all_touched=True) | G10.burn(foot)
    out = []
    taken = np.zeros(h.shape, dtype=bool)
    for b30 in sorted(bodies30, key=lambda b: b.y):
        spec = b30.spec
        grow = ~barrier & ~taken & (h <= spec['y'] + spec['rise'])
        seed = to_hero(b30.mask) & grow
        seed = ndimage.binary_erosion(seed, structure=EIGHT, iterations=2) & grow
        mask = ndimage.binary_propagation(seed, structure=EIGHT, mask=grow)
        # Only water connected to the float spawn: a pocket cut off at 10 m
        # would be a bed no outline needs to reach.
        mask = component_at(mask, G10, spec['spawn']['x'], spec['spawn']['z']) | edge_connected(mask)
        b = Body(spec, G10, mask)
        b.notes.append(f'{mask.sum()} samples at 10 m in the hero ({mask.sum() * 100 / 1e6:.2f} km2)')
        print(f'  {spec["name"]} (hero): ' + b.notes[-1])
        taken |= mask
        out.append(b)
    return sorted(out, key=lambda b: -b.y)


def edge_connected(mask):
    """The parts of mask that touch the hero's edge: they continue in the ring."""
    lab, _ = ndimage.label(mask, structure=EIGHT)
    keep = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    return np.isin(lab, keep[keep > 0])


def cells(grid, mask):
    """The samples of mask as the union of their cells, world x, z."""
    polys = [shape(g) for g, v in shapes(mask.astype('uint8'), mask=mask, transform=grid.world, connectivity=8) if v]
    return unary_union(polys)


def body_region(b30, b10):
    hero = HERO_TILES
    ring = box(-RING_HALF, -RING_HALF, RING_HALF, RING_HALF)
    outer = cells(G30, b30.mask).difference(hero).intersection(ring)
    inner = cells(G10, b10.mask).intersection(hero)
    # Cells that meet only at a corner are one body to the plant's
    # outline; a millimetre makes them one polygon.
    return unary_union([outer, inner]).buffer(0.001, join_style='mitre')


def dry_low(b30, b10, h30, h10):
    """Samples under the body's level that are not the body: what its outline must not reach."""
    hero = HERO_TILES
    inring = in_square(G30, RING_HALF)
    a = cells(G30, inring & (h30 < b30.y) & ~b30.mask).difference(hero)
    b = cells(G10, (h10 < b10.y) & ~b10.mask).intersection(hero)
    return unary_union([a, b])


class Pieces:
    """A polygon cut into 500 m squares under an STR tree: the area of its intersection with a small triangle
    costs a few small intersections, not one with the whole shore."""

    def __init__(self, geom, size=500.0):
        x0, z0, x1, z1 = geom.bounds
        parts = []
        for x in np.arange(math.floor(x0 / size) * size, x1, size):
            for z in np.arange(math.floor(z0 / size) * size, z1, size):
                p = geom.intersection(box(x, z, x + size, z + size))
                if not p.is_empty and p.area > 0:
                    parts.append(p)
        self.parts = np.array(parts, dtype=object)
        self.tree = shapely.STRtree(self.parts)

    def area(self, tri):
        idx = self.tree.query(tri)
        if idx.size == 0:
            return 0.0
        return float(shapely.area(shapely.intersection(self.parts[idx], tri)).sum())


def simplify_between(inner, avoid, target=TARGET_VERTICES, eps=0.5):
    """A simple polygon of at most target vertices holding inner and not overlapping avoid, by removing the vertex
    of least triangle area whose removal keeps both (Visvalingam's order, with the two constraints)."""
    polys = polygons_of(inner)
    if len(polys) != 1:
        raise RuntimeError(f'water: {len(polys)} separate pieces, the plant takes one ring: ' + ', '.join(
            f'{p.area:.0f} m2 at {p.centroid.x:.0f}, {p.centroid.y:.0f}' for p in sorted(polys, key=lambda p: -p.area)))
    ring = orient(Polygon(polys[0].exterior), 1.0)
    pts = [tuple(p) for p in ring.exterior.coords[:-1]]
    need, keep_out = Pieces(inner), Pieces(avoid)
    n = len(pts)
    prev = [(i - 1) % n for i in range(n)]
    nxt = [(i + 1) % n for i in range(n)]
    alive = [True] * n
    ver = [0] * n
    size = 200.0
    hashv = {}

    def key(p):
        return (int(p[0] // size), int(p[1] // size))

    for i, p in enumerate(pts):
        hashv.setdefault(key(p), set()).add(i)

    def tri_area(i):
        (ax, az), (bx, bz), (cx, cz) = pts[prev[i]], pts[i], pts[nxt[i]]
        return ((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2.0

    def others_inside(i, t):
        x0, z0, x1, z1 = t.bounds
        for kx in range(int(x0 // size), int(x1 // size) + 1):
            for kz in range(int(z0 // size), int(z1 // size) + 1):
                for j in hashv.get((kx, kz), ()):
                    if j in (i, prev[i], nxt[i]):
                        continue
                    if t.intersects(shapely.points(*pts[j])):
                        return True
        return False

    def ok(i):
        a = tri_area(i)
        if abs(a) < 1e-9:
            return True
        t = Polygon([pts[prev[i]], pts[i], pts[nxt[i]]])
        if others_inside(i, t):
            return False
        # Counter-clockwise ring: a left turn (a > 0) is convex, and removing
        # it cuts the triangle off; a right turn adds it.
        return (need.area(t) if a > 0 else keep_out.area(t)) < eps

    heap = [(abs(tri_area(i)), i, 0) for i in range(n)]
    heapq.heapify(heap)
    count = n
    blocked = set()
    while count > target and heap:
        a, i, v = heapq.heappop(heap)
        if not alive[i] or v != ver[i]:
            continue
        if not ok(i):
            blocked.add(i)
            continue
        alive[i] = False
        hashv[key(pts[i])].discard(i)
        p, q = prev[i], nxt[i]
        nxt[p], prev[q] = q, p
        count -= 1
        for j in (p, q):
            ver[j] += 1
            blocked.discard(j)
            heapq.heappush(heap, (abs(tri_area(j)), j, ver[j]))
    i0 = next(i for i in range(n) if alive[i])
    out, i = [], i0
    while True:
        out.append(pts[i])
        i = nxt[i]
        if i == i0:
            break
    return Polygon(out), n, len(blocked)


def outline(b30, b10, h30, h10, avoid_extra):
    inner = body_region(b30, b10)
    avoid_extra = [a.difference(inner) for a in avoid_extra]
    frame = box(-2 * RING_HALF, -2 * RING_HALF, 2 * RING_HALF, 2 * RING_HALF)
    ring = box(-RING_HALF, -RING_HALF, RING_HALF, RING_HALF)
    avoid = unary_union([dry_low(b30, b10, h30, h10), frame.difference(ring)] + avoid_extra)
    clash = inner.intersection(avoid).area
    if clash > 0.001 * inner.length + 1.0:
        raise RuntimeError(f'{b30.name}: the body overlaps what its outline must avoid by {clash:.0f} m2')
    poly, n0, blocked = simplify_between(inner, avoid)
    rounded = Polygon([(r1(x), r1(z)) for x, z in poly.exterior.coords[:-1]])
    if not rounded.is_valid:
        raise RuntimeError(f'{b30.name}: outline not simple')
    lost = inner.difference(rounded).area
    over = rounded.intersection(avoid).area
    note = (f'outline: {len(rounded.exterior.coords) - 1} vertices from {n0}; {rounded.area / 1e6:.1f} km2 against '
            f'{inner.area / 1e6:.1f} km2 of water; water left outside {lost:.1f} m2, dry low ground or a footprint '
            f'inside {over:.1f} m2')
    print(f'  {b30.name}: {note}')
    if len(rounded.exterior.coords) - 1 > MAX_VERTICES or lost > 50.0 or over > 50.0:
        raise RuntimeError(f'{b30.name}: {note}')
    return rounded, note


def fetch(b30, b10, spec):
    """Open water upwind of the float spawn, by the direction the wind comes from (degrees clockwise from north)."""
    x0, z0 = spec['spawn']['x'], spec['spawn']['z']
    out = {}
    for k in range(16):
        deg = k * 22.5
        a = math.radians(deg)
        dx, dz = math.sin(a), -math.cos(a)
        t = 0.0
        while t < spec['fetchMax']:
            x, z = x0 + dx * (t + 10), z0 + dz * (t + 10)
            if HERO_X0 <= x <= HERO_X1 and HERO_X0 <= z <= HERO_X1:
                wet = b10.mask[G10.index(z), G10.index(x)]
            elif abs(x) <= RING_HALF and abs(z) <= RING_HALF:
                wet = b30.mask[G30.index(z), G30.index(x)]
            else:
                wet = True
            if not wet:
                break
            t += 10
        out[f'{deg:g}'] = min(t, spec['fetchMax'])
    return out


def build(bodies30, bodies10, h30, h10, foot):
    by10 = {b.name: b for b in bodies10}
    entries, outlines = [], {}
    # The footprints as the hero's cells, as the terrain flattens them, so
    # a water cell beside one only touches it.
    foot_cells = cells(G10, G10.burn(foot))
    regions = {b.name: body_region(b, by10[b.name]) for b in bodies30}
    # The river first: it is the tighter of the two, and the reservoir's
    # outline then keeps off it.
    for b30 in sorted(bodies30, key=lambda b: b.y):
        b10 = by10[b30.name]
        spec = b30.spec
        s = spec['spawn']
        if not b10.mask[G10.index(s['z']), G10.index(s['x'])]:
            raise RuntimeError(f'{b30.name}: spawn {s} is not on the water')
        extra = [foot_cells] + [r for n, r in regions.items() if n != b30.name] + \
            [o.buffer(5.0) for o in outlines.values()]
        poly, note = outline(b30, b10, h30, h10, extra)
        outlines[b30.name] = poly
        entries.append({
            'name': b30.name, 'title': spec['title'], 'y': spec['y'],
            'outline': [[x, z] for x, z in poly.exterior.coords[:-1]], 'holes': [],
            'bedDepth': 3.0, 'bedDepthRing': 1.0,
            'spawn': dict(s), 'fetch': fetch(b30, b10, spec),
            'fetchFrom': 'open water upwind of the spawn, by the direction the wind comes from in degrees clockwise '
                         f'from north, capped at {spec["fetchMax"]:.0f} m',
            'notes': b30.notes + b10.notes + [note],
        })
    return sorted(entries, key=lambda e: -e['y']), outlines
