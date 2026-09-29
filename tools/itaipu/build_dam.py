# build_dam.py: dam.json, one entry per row of docs/ITAIPU-PLAN.md
# section 6's table, each with the figure it came from and the page that
# publishes it, and the axis and footprint it is placed on.
#
# Placement. Itaipu's crest is one continuous service road in
# OpenStreetMap, four ways end to end from the right bank earth dam's
# west end to the left bank earth dam's south end (CREST below). It is
# 7 741 m long; Itaipu publishes 7 919 m for the whole dam, of which the
# Hernandarias dike's 175 m is elsewhere, leaving 7 744 m. So the road
# is the crest, and each part is the stretch of it that Itaipu's
# published crest length says, starting from three points the imagery
# fixes: the two ends of the spillway's gate bridge and the start of the
# rockfill dam's straight crest road. Where an OSM footprint exists for a
# concrete part it is used; otherwise the footprint is the crest road
# buffered, and the entry says so.
#
# Terrain. build_terrain.py raises the embankments along their axes and
# flattens every concrete footprint to groundY, the lowest ground around
# it; it fills that field in before dam.json is written.
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

import html
import math
import re

import numpy as np
import rasterio
from pyproj import Transformer
from shapely.geometry import LineString, Point
from shapely.ops import substring

from common import E0, N0, SOURCES, UTM, load_sources, r1
from osm import ring_xz

# The crest road, west to east: right bank earth dam, the spillway's gate
# bridge and the right lateral dam, the main dam to the rockfill dam, the
# rockfill and left bank earth dams. Each way's direction as OSM stores it.
CREST = [(1395860536, False), (203751164, False), (1395860535, False), (262638260, False)]
# Vertices of the crest road that start a part, from the imagery: the
# west and east ends of the spillway's gate bridge (way 203751164's first
# and fourth nodes) and the rockfill dam's first vertex (the start of way
# 262638260, where the straight crest of way 30657423 also starts).
SPILL_WEST = (-1136, -952)
SPILL_EAST = (-798, -1065)
ROCKFILL_START = (901, -1555)

CREST_Y = 225.0
PAGES = {'barragem': 'https://www.itaipu.gov.br/energia/barragem',
         'vertedouro': 'https://www.itaipu.gov.br/energia/vertedouro',
         'casa-de-forca': 'https://www.itaipu.gov.br/energia/casa-de-forca',
         'reservatorio': 'https://www.itaipu.gov.br/energia/reservatorio'}

# Crest elevation, and the two water levels, cited on every part.
CREST_QUOTES = [('casa-de-forca', 'localizadas na cota 225, na crista da barragem'),
                ('casa-de-forca', 'Cota do topo dos trilhos 225')]

# How the terrain step treats the ground around each part (metres). A
# 30 m DEM smears a dam's crest over 60 to 90 m each side (the rockfill
# crest reads 220 m 66 m out into the reservoir from its crest road), so
# the ground inside `desmear` of an axis or footprint is replaced by the
# lowest ground within DESMEAR_WINDOW before the part goes in.
DESMEAR_CONCRETE = 60.0
DESMEAR_EMBANKMENT = 90.0
DESMEAR_WINDOW = 150.0


def page_text(name):
    """A page's visible text, with Elementor's animated counters (which the HTML holds as data-to-value and
    shows as 0) written out as the figure they count to."""
    t = (SOURCES / 'itaipu-pages' / f'{name}.html').read_text(encoding='utf-8', errors='replace')
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    t = re.sub(r'<span class="elementor-counter-number"[^>]*data-to-value="([^"]*)"[^>]*>[^<]*</span>\s*'
               r'<span class="elementor-counter-number-suffix">', r'\1', t)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    return re.sub(r'\s+', ' ', t)


def cite(reg, quotes):
    """The source block of a part: every quoted figure with its page. build() checks each quote is on its page."""
    return [{'page': PAGES[p], 'file': reg[f'itaipu_{p}']['file'], 'retrieved': reg[f'itaipu_{p}']['retrieved'],
             'quote': q} for p, q in quotes]


# Section 6's table, one row each: part, kind, published figures, quotes
# on the page. The figures are what D builds to and validate.py checks.
ROWS = [
    ('right lateral dam', 'buttress', {'crestLength': 998, 'maxHeight': 64.5, 'blocks': 58},
     [('barragem', 'Barragem lateral direita (concreto) Tipo Contraforte Comprimento da crista 998 m Altura máxima 64,5 m '
                   'Quantidade de blocos 58')]),
    ('main dam and connecting blocks', 'hollow gravity and buttress', {'crestLength': 1064, 'maxHeight': 196, 'blocks': 69},
     [('barragem', 'Barragem principal e blocos de ligação (concreto) Tipo Gravidade aliviada e contrafortes '
                   'Comprimento 1.064 m Altura máxima 196 m Quantidade de blocos 69')]),
    ('diversion structure', 'gravity', {'crestLength': 170, 'maxHeight': 162, 'blocks': 14},
     [('barragem', 'Estrutura de desvio (concreto) Tipo Gravidade Comprimento 170 m Altura máxima 162 m '
                   'Quantidade de blocos 14')]),
    ('spillway', 'chute', {'width': 362, 'length': 483, 'maxHeight': 43.7, 'gates': 14, 'gateWidth': 20,
                           'gateHeight': 21.34, 'sillY': 199.16, 'blocks': 15, 'capacity': 62200},
     [('vertedouro', 'Número de comportas 14 Dimensões das comportas 20 x 21,34 m'),
      ('vertedouro', 'Nº de blocos 15 Elevação da soleira 199,16 m Altura máxima 43,7 m Largura 362 m Comprimento 483 m'),
      ('vertedouro', 'Capacidade máxima 62.200 m³/s'),
      ('vertedouro', 'foi colocado na margem direita')]),
    ('powerhouse', 'powerhouse', {'length': 968, 'width': 99, 'maxHeight': 112, 'units': 20, 'unitSpacing': 34,
                                  'roofY': 148, 'generatorFloorY': 108},
     [('casa-de-forca', 'COMPRIMENTO 968 m LARGURA 99 m ALTURA 112 m ESPAÇAMENTO ENTRE AS UNIDADES 34 m '
                        'ELEVAÇÃO DA COBERTURA 148 m ELEVAÇÃO DO PISO DOS GERADORES 108 m'),
      ('casa-de-forca', 'São 20 unidades geradoras')]),
    ('penstocks', 'steel penstocks', {'count': 20, 'innerDiameter': 10.5, 'developedLength': 142.2, 'discharge': 690},
     [('casa-de-forca', 'Quantidade 20 Diâmetro interno 10,5 m Comprimento desenvolvido 142,2 m Descarga nominal 690 m3/s')]),
    ('intakes', 'intake gates', {'count': 20, 'gateWidth': 8.2, 'gateHeight': 19.3, 'sillY': 177.6},
     [('casa-de-forca', 'Comportas de serviço: Quantidade 20 Vão livre 8,2 m Altura livre total 19,3 m '
                        'Vazão máxima pela comporta 750 m3/2 Cota da soleira 177,6 m')]),
    ('rockfill dam', 'rockfill', {'crestLength': 1984, 'maxHeight': 70},
     [('barragem', 'Barragem de enrocamento Comprimento da crista 1.984 m Altura máxima 70 m')]),
    ('left bank earth dam', 'earth', {'crestLength': 2294, 'maxHeight': 30},
     [('barragem', 'Barragem de terra da margem esquerda Comprimento da crista 2.294 m Altura máxima 30 m')]),
    ('right bank earth dam', 'earth', {'crestLength': 872, 'maxHeight': 25},
     [('barragem', 'Barragem de terra da margem direita Comprimento da crista 872 m Altura máxima 25 m')]),
    ('Hernandarias dike', 'earth', {'crestLength': 175},
     [('barragem', 'Dique de terra de Hernandárias (margem direita) Comprimento 175 m')]),
    ('whole dam', 'whole', {'crestLength': 7919, 'maxHeight': 196},
     [('barragem', 'A barragem da Itaipu tem 7.919 metros de extensão e altura máxima de 196 metros')]),
]

# Embankment faces, horizontal to vertical, both sides. Itaipu's pages do
# not publish them; these are the usual figures for a rockfill and an
# earth dam, and the entry says so.
EMBANKMENT = {'rockfill': {'slope': 1.4, 'crestWidth': 14.0}, 'earth': {'slope': 2.5, 'crestWidth': 14.0}}


def crest_line(osm):
    pts = []
    for wid, rev in CREST:
        p = osm.points(osm.ways[wid])
        p = p[::-1] if rev else p
        if pts:
            gap = math.dist(pts[-1], p[0])
            if gap > 1.0:
                raise RuntimeError(f'crest road: way {wid} starts {gap:.1f} m from the previous way')
            p = p[1:]
        pts += p
    return LineString(pts)


def along(line, xz):
    s = line.project(Point(xz))
    d = line.interpolate(s).distance(Point(xz))
    if d > 2.0:
        raise RuntimeError(f'crest road: anchor {xz} is {d:.1f} m off it')
    return s


def xz_list(line):
    return [[r1(x), r1(z)] for x, z in line.coords]


def extend_end(line, metres):
    c = list(line.coords)
    (x0, z0), (x1, z1) = c[-2], c[-1]
    k = metres / math.dist((x0, z0), (x1, z1))
    return LineString(c + [(x1 + (x1 - x0) * k, z1 + (z1 - z0) * k)])


def rect_axes(poly):
    """The minimum rotated rectangle of a polygon: centre, unit long axis, unit short axis, long and short sides."""
    r = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
    a, b = np.subtract(r[1], r[0]), np.subtract(r[2], r[1])
    if np.hypot(*a) < np.hypot(*b):
        a, b = b, a
    la, lb = float(np.hypot(*a)), float(np.hypot(*b))
    c = np.mean(r, axis=0)
    return c, a / la, b / lb, la, lb


# The spillway's ground: the chute floor less SLAB, never over the
# published foundation. The floor is the sill from the gates to SILL_END
# (the gates stand 10.5 to 12 m down the axis), then straight to the
# surface model's profile, which is the floor from FLOOR_DEM_FROM on (the
# surface model reads 216.9 at the gates, the bridge's smear).
SLAB = 4.0
SILL_END = 12.0
FLOOR_DEM_FROM = 90.0


def spill_ground(floor, sill, foundation):
    knots = [(SILL_END, sill)] + [(d, y) for d, y in floor if d >= FLOOR_DEM_FROM]
    ds = np.array([k[0] for k in knots])
    ys = np.array([k[1] for k in knots]) - SLAB
    pts = [(-30.0, foundation)]
    for k in range(len(ds) - 1):
        a, b = ys[k] - foundation, ys[k + 1] - foundation
        if a > 0 >= b:
            pts.append((ds[k] + (ds[k + 1] - ds[k]) * a / (a - b), foundation))
    pts += [(d, y) for d, y in zip(ds, ys) if y < foundation]
    pts.append((pts[-1][0] + 30.0, pts[-1][1]))
    return [[r1(d), r1(y)] for d, y in pts]


def chute_profile(axis):
    """Copernicus GLO-30 along the spillway chute's axis every 30 m, [[metres from the gates, y]]. A DSM on a
    30 m grid: the floor's shape, smeared by the grid, not its concrete to the decimetre."""
    t = Transformer.from_crs(UTM, 'EPSG:4326', always_xy=True)
    n = int(axis.length // 30) + 1
    s = np.linspace(0, axis.length, n)
    xs = np.array([axis.interpolate(v).x for v in s])
    zs = np.array([axis.interpolate(v).y for v in s])
    lon, lat = t.transform(E0 + xs, N0 - zs)
    reg = load_sources()
    with rasterio.open(SOURCES / reg['cop30']['file']) as src:
        a = src.read(1)
        inv = ~src.transform
        c, r = inv * (np.asarray(lon), np.asarray(lat))
    c, r = np.asarray(c) - 0.5, np.asarray(r) - 0.5
    c0, r0 = np.floor(c).astype(int), np.floor(r).astype(int)
    fc, fr = c - c0, r - r0
    y = (a[r0, c0] * (1 - fc) + a[r0, c0 + 1] * fc) * (1 - fr) + (a[r0 + 1, c0] * (1 - fc) + a[r0 + 1, c0 + 1] * fc) * fr
    return [[r1(v), r1(h)] for v, h in zip(s, y)]


def build(osm):
    """The parts, as dam.json will hold them, less groundY (build_terrain.py). Also returns the crest line."""
    reg = load_sources()
    texts = {p: page_text(p) for p in PAGES}
    rows = {name: (kind, figs, quotes) for name, kind, figs, quotes in ROWS}
    for name, (kind, figs, quotes) in rows.items():
        for p, q in quotes:
            if q not in texts[p]:
                raise RuntimeError(f'{name}: quote not on the {p} page: {q}')
    for p, q in CREST_QUOTES:
        if q not in texts[p]:
            raise RuntimeError(f'crest: quote not on the {p} page: {q}')

    crest = crest_line(osm)
    s_sw, s_se, s_rock = along(crest, SPILL_WEST), along(crest, SPILL_EAST), along(crest, ROCKFILL_START)
    cuts = {'right bank earth dam': (0.0, s_sw), 'spillway': (s_sw, s_se)}
    s = s_se
    for name in ('right lateral dam', 'main dam and connecting blocks', 'diversion structure'):
        cuts[name] = (s, s + rows[name][1]['crestLength'])
        s += rows[name][1]['crestLength']
    if s >= s_rock:
        raise RuntimeError(f'crest: the concrete parts end {s - s_rock:.0f} m past the rockfill dam')
    # Between the diversion structure and the rockfill dam: Itaipu's plan
    # letters this the left lateral dam (G) but publishes no figure for it.
    cuts['left lateral dam'] = (s, s_rock)
    cuts['rockfill dam'] = (s_rock, s_rock + rows['rockfill dam'][1]['crestLength'])
    cuts['left bank earth dam'] = (cuts['rockfill dam'][1], crest.length)

    main_bldg = osm.polygon(osm.ways[32236291])
    c, u, v, la, lb = rect_axes(main_bldg)
    # v, the short axis, pointed downstream (+z, south, away from the
    # reservoir): the powerhouse is the downstream 99 m of the building.
    if v[1] < 0:
        v = -v
    ph = rows['powerhouse'][1]
    ph_c = c + v * (lb / 2 - ph['width'] / 2)
    ph_axis = LineString([tuple(ph_c - u * la / 2), tuple(ph_c + u * la / 2)])
    if ph_axis.coords[0][0] > ph_axis.coords[1][0]:
        ph_axis = LineString(ph_axis.coords[::-1])
    # The published 968 m runs past the building's 868 m; the rest is in
    # the diversion channel, east of the main dam (casa-de-forca: "at the
    # toe of the main dam and in the diversion channel").
    ph_axis = extend_end(ph_axis, ph['length'] - ph_axis.length)
    n_units, spacing = ph['units'], ph['unitSpacing']
    mid = ph_axis.length / 2
    units = [mid + (k - (n_units - 1) / 2) * spacing for k in range(n_units)]
    unit_pts = [ph_axis.interpolate(sv) for sv in units]
    crest_main = substring(crest, *cuts['main dam and connecting blocks'])

    spill_poly = osm.polygon(osm.ways[262637862])
    sc, su, sv, sla, slb = rect_axes(spill_poly)
    gate_mid = np.mean([SPILL_WEST, SPILL_EAST], axis=0)
    if su[1] < 0:
        su = -su
    chute = LineString([tuple(gate_mid), tuple(gate_mid + su * rows['spillway'][1]['length'])])

    parts = []

    def part(name, kind, axis, axis_from, figs=None, quotes=None, footprint=None, footprint_from=None, extra=None):
        base = figs.get('maxHeight') if figs else None
        e = {'part': name, 'kind': kind, 'inTable': name in rows,
             'axis': xz_list(axis) if axis is not None else None, 'axisFrom': axis_from,
             'axisLength': r1(axis.length) if axis is not None else None,
             'crestY': CREST_Y, 'baseY': r1(CREST_Y - base) if base is not None else None,
             'figures': figs or {},
             'footprint': ring_xz(footprint.exterior) if footprint is not None else None,
             'footprintFrom': footprint_from, 'groundY': None,
             'sections': [], 'source': cite(reg, (quotes or []) + CREST_QUOTES)}
        e.update(extra or {})
        parts.append(e)
        return e

    def row(name):
        return rows[name][0], rows[name][1], rows[name][2]

    def embankment(name, axis, axis_from):
        kind, figs, quotes = row(name)
        emb = EMBANKMENT[kind]
        return part(name, kind, axis, axis_from, figs, quotes, extra={
            'sections': [{'at': 'whole length', 'crestWidth': emb['crestWidth'], 'slope': emb['slope'],
                          'from': f'assumed: the pages publish no face slopes; {emb["slope"]} horizontal to 1 vertical is '
                                  f'usual for {kind} dams'}],
            'burn': {'zone': DESMEAR_EMBANKMENT, 'window': DESMEAR_WINDOW}})

    def concrete(name, axis, axis_from, footprint, footprint_from, sections=None, ground='ring', extra=None):
        kind, figs, quotes = row(name)
        return part(name, kind, axis, axis_from, figs, quotes, footprint, footprint_from,
                    extra={'sections': sections or [], 'burn': {'zone': DESMEAR_CONCRETE, 'window': DESMEAR_WINDOW},
                           'groundRule': ground, **(extra or {})})

    rb = substring(crest, *cuts['right bank earth dam'])
    embankment('right bank earth dam', rb,
               'OSM way 1395860536, the crest road west of the spillway (868 m; not tagged as a dam in OSM). ANADEM shows '
               'a 220 to 225 m bench along it between the reservoir and 207 m ground south of it.')
    sp = substring(crest, *cuts['spillway'])
    floor = chute_profile(chute)
    spill_figs = rows['spillway'][1]
    concrete('spillway', sp, 'OSM way 203751164 from its first to its fourth node: the gate bridge, '
             f'{sp.length:.0f} m (Itaipu: 362 m wide)', spill_poly, 'OSM way 262637862 (waterway=dam, usage=spillway)',
             sections=[{'at': 'chute', 'axis': xz_list(chute), 'axisFrom': 'from the middle of the gate bridge along '
                        'the long side of the OSM footprint, for the published 483 m',
                        'floor': floor,
                        'floorFrom': 'Copernicus GLO-30 (a surface model, 30 m grid) along the chute axis every 30 m, '
                                     'metres from the gates and y'}],
             ground='chute',
             extra={'groundProfile': spill_ground(floor, spill_figs['sillY'], CREST_Y - spill_figs['maxHeight']),
                    'groundProfileFrom': f'[metres down the chute axis from the middle of the gates, y]: the lower of '
                    f'the published foundation ({CREST_Y - spill_figs["maxHeight"]:.1f} m, 225 less 43.7) and the '
                    f'floor less {SLAB} m, the floor being the published sill ({spill_figs["sillY"]} m) to '
                    f'{SILL_END} m and the surface model from {FLOOR_DEM_FROM} m; flat past both ends. The terrain '
                    'under the footprint is this at each sample\'s distance along the axis.'})
    rl = substring(crest, *cuts['right lateral dam'])
    concrete('right lateral dam', rl, 'the crest road (OSM way 203751164) from the spillway, for the published 998 m',
             osm.polygon(osm.ways[428443544]), 'OSM way 428443544 (waterway=dam, height 150)',
             ground='ring, at most baseY')
    concrete('main dam and connecting blocks', crest_main,
             'the crest road (OSM ways 203751164 and 1395860535) after the right lateral dam, for the published 1 064 m',
             main_bldg, 'OSM way 32236291, "Usina Hidreletrica de Itaipu" (building=industrial): the dam and the '
             'powerhouse at its toe together')
    dv = substring(crest, *cuts['diversion structure'])
    concrete('diversion structure', dv, 'the crest road (OSM way 1395860535) after the main dam, for the published 170 m',
             dv.buffer(20.0, cap_style='flat'), 'derived: the axis buffered 20 m each side (no OSM footprint)')
    ll = substring(crest, *cuts['left lateral dam'])
    part('left lateral dam', 'concrete', ll,
         'the crest road between the diversion structure and the rockfill dam; Itaipu letters it G on its plan and '
         'publishes no figure for it', footprint=ll.buffer(20.0, cap_style='flat'),
         footprint_from='derived: the axis buffered 20 m each side (no OSM footprint)',
         extra={'burn': {'zone': DESMEAR_CONCRETE, 'window': DESMEAR_WINDOW}, 'groundRule': 'ring'})
    embankment('rockfill dam', substring(crest, *cuts['rockfill dam']),
               'OSM way 262638260, the crest road, from its start for the published 1 984 m')
    le = substring(crest, *cuts['left bank earth dam'])
    short = rows['left bank earth dam'][1]['crestLength'] - le.length
    le = extend_end(le, short)
    embankment('left bank earth dam', le, f'OSM way 262638260 after the rockfill dam, extended {short:.0f} m past its '
               'south end along its last segment to the published 2 294 m')
    kind, figs, quotes = row('powerhouse')
    e = part('powerhouse', kind, ph_axis, 'the centre line of the downstream 99 m of OSM way 32236291, extended east to '
             'the published 968 m into the diversion channel', figs, quotes,
             ph_axis.buffer(ph['width'] / 2, cap_style='flat').simplify(0.01),
             'derived: the axis buffered half the published 99 m width each side, the length of the axis',
             extra={'units': [[r1(p.x), r1(p.y)] for p in unit_pts],
                    'unitsFrom': 'derived: 20 units 34 m apart, centred on the axis',
                    'burn': {'zone': DESMEAR_CONCRETE, 'window': DESMEAR_WINDOW}, 'groundRule': 'ring'})
    # The powerhouse's top is its roof, not the crest: its 112 m stand
    # under the published 148 m roof.
    e['baseY'] = r1(ph['roofY'] - ph['maxHeight'])
    kind, figs, quotes = row('penstocks')
    # Each penstock runs from its intake on the crest down the downstream
    # face to its unit: from the crest road's nearest point to the unit.
    pens = []
    for p in unit_pts:
        q = crest_main.interpolate(crest_main.project(p))
        pens.append([[r1(q.x), r1(q.y)], [r1(p.x), r1(p.y)]])
    part('penstocks', kind, None, 'one per unit: from the crest road above it to the unit on the powerhouse axis', figs,
         quotes, extra={'lines': pens})
    kind, figs, quotes = row('intakes')
    part('intakes', kind, None, 'one per penstock, on the crest', figs, quotes, extra={'points': [l[0] for l in pens]})
    kind, figs, quotes = row('Hernandarias dike')
    part('Hernandarias dike', kind, None, 'not placed: Itaipu publishes its length and bank (right) only, OpenStreetMap '
         'does not map it, and ANADEM shows no saddle along the reservoir inside the ring that a dike would close', figs,
         quotes)
    kind, figs, quotes = row('whole dam')
    part('whole dam', kind, crest, 'the crest road, OSM ways ' + ', '.join(str(w) for w, _ in CREST) + f' end to end: '
         f'{crest.length:.0f} m against the published 7 919 m less the Hernandarias dike 175 m, 7 744 m', figs, quotes)
    order = [n for n, *_ in ROWS]
    order.insert(order.index('diversion structure') + 1, 'left lateral dam')
    parts.sort(key=lambda e: order.index(e['part']))
    return parts, crest
