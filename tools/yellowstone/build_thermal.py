# build_thermal.py: every thermal feature in the extent, in world metres:
# thermal.json.
#
# The inventory is the Yellowstone Research Coordination Network's export
# of the park's thermal feature inventory, about 9 900 surveyed features
# with an inventory id, a position, a type when the survey recorded one
# and, for most, a temperature and pH. GNIS names fill in the named
# features the inventory lacks. Geyser intervals and durations are the
# National Park Service's published eruption data.
#
# Most inventory records have no type ("Not Reported"). Those take a kind
# from their name when named and "hot spring" otherwise, with reported:
# false so a renderer can tell a surveyed type from a default. Springs at
# Mammoth are "terrace", reported or not.
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

import csv
import datetime
import io
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

import numpy as np
from pyproj import Transformer

from common import DATA, SOURCES, UTM, dump_json, inside, utm_to_world

KINDS = ('geyser', 'hot spring', 'pool', 'fumarole', 'mudpot', 'terrace')
RCN_KIND = {'Geyser': 'geyser', 'Perpetual Spouter': 'geyser', 'Hot Spring': 'hot spring',
            'Fumarole': 'fumarole', 'Mud Pot': 'mudpot'}
NAME_KIND = [
    (re.compile(r'\bgeyser\b|\bspouter\b', re.I), 'geyser'),
    (re.compile(r'\bmud\b|\bmudpots?\b|paint ?pots?|\bmud volcano\b', re.I), 'mudpot'),
    (re.compile(r'\bfumaroles?\b|\bsteam vents?\b|\bvents?\b|\bsolfatara\b', re.I), 'fumarole'),
    (re.compile(r'\bterraces?\b', re.I), 'terrace'),
    (re.compile(r'\bpools?\b|\bcrater\b|\bcauldron\b|\bkettle\b', re.I), 'pool'),
    (re.compile(r'\bsprings?\b', re.I), 'hot spring'),
]
# A kind's radius when no size is published: a vent or a spring a couple
# of metres across, a named pool wider, a terrace step wider still.
DEFAULT_RADIUS = {'geyser': 1.5, 'hot spring': 1.5, 'pool': 4.0, 'fumarole': 1.0, 'mudpot': 2.0, 'terrace': 5.0}
# Published sizes, as mean radius in metres.
PUBLISHED_RADIUS = {
    # NPS: "200-330 feet in diameter", https://www.nps.gov/places/000/grand-prismatic-spring.htm
    'Grand Prismatic Spring': 40.0,
    # NPS: "a 200 x 300 foot crater", https://www.nps.gov/places/000/excelsior-geyser-crater.htm
    'Excelsior Geyser Crater': 38.0,
}
# Inventory ids at Mammoth Hot Springs start with MA (84 features, all
# within 1.2 km of the terraces); every spring there builds travertine,
# so a spring there is a terrace.
MAMMOTH_ID = re.compile(r'^MA\d')
# Published appearance where the inventory's one sample misleads: Grand
# Prismatic's only record is 23 C, water from its margin, and it would
# class brown. NPS: "a large, blue hot spring surrounded by yellow,
# orange, and brown microbial mats",
# https://www.nps.gov/places/000/grand-prismatic-spring.htm
PUBLISHED_COLOUR = {'Grand Prismatic Spring': 'blue'}
UNNAMED = re.compile(r'^[A-Za-z]+NN[0-9A-Za-z]*$')

NPS_ERUPTIONS_URL = 'https://www.nps.gov/yell/planyourvisit/geyser-activity.htm'
NPS_ERUPTIONS_DATE = '2025-04-18'
MIN, HOUR, DAY = 60, 3600, 86400
# name: (interval [s, s] or None, duration [s, s], height [m, m], note)
NPS_ERUPTIONS = {
    'Old Faithful Geyser': ([58 * MIN, 104 * MIN], [90, 300], [30, 55], '94 or 68 min, plus or minus 10 min'),
    'Castle Geyser': ([12 * HOUR + 45 * MIN, 14 * HOUR + 15 * MIN], [15 * MIN, 20 * MIN], [24, 24], '13 h 30 min, plus or minus 45 min'),
    'Daisy Geyser': ([2 * HOUR + 15 * MIN, 3 * HOUR + 15 * MIN], [210, 210], [24, 24], '2 h 45 min, plus or minus 30 min or more'),
    'Grand Geyser': ([5 * HOUR + 30 * MIN, 7 * HOUR + 30 * MIN], [8 * MIN, 12 * MIN], [48, 48], '6 h 30 min, plus or minus 60 min'),
    'Riverside Geyser': ([6 * HOUR, 7 * HOUR], [20 * MIN, 20 * MIN], [24, 24], '6 h 30 min, plus or minus 30 min'),
    'Great Fountain Geyser': ([9 * HOUR + 30 * MIN, 13 * HOUR + 30 * MIN], [45 * MIN, 60 * MIN], [22, 60], '11 h 30 min, plus or minus 2 h'),
    'Fountain Geyser': ([4 * HOUR + 30 * MIN, 7 * HOUR], [25 * MIN, 50 * MIN], [15, 15], ''),
    'Baby Daisy Geyser': ([35 * MIN, 55 * MIN], [3 * MIN, 3 * MIN], [8, 8], ''),
    'Artemisia Geyser': ([9 * HOUR, 31 * HOUR], [5 * MIN, 25 * MIN], [9, 9], 'irregular'),
    'Aurum Geyser': ([4 * HOUR, 22 * HOUR], [70, 70], [6, 6], 'irregular'),
    'Beehive Geyser': ([22 * HOUR, 14 * DAY], [5 * MIN, 5 * MIN], [45, 45], 'irregular, 22 to 36 h to more than 2 weeks'),
    'Depression Geyser': ([2 * HOUR + 30 * MIN, 4 * HOUR], [6 * MIN, 6 * MIN], [3, 3], 'irregular'),
    'Oblong Geyser': ([3 * HOUR, 7 * HOUR], [5 * MIN, 7 * MIN], [8, 8], ''),
    'Lion Geyser': ([60 * MIN, 90 * MIN], [6 * MIN, 7 * MIN], [18, 18], 'interval within a series; initial eruption duration'),
    'Little Cub Geyser': ([30 * MIN, 45 * MIN], [3 * MIN, 5 * MIN], [1.5, 1.5], 'when regular'),
    'Fan Geyser': (None, [35 * MIN, 35 * MIN], [30, 30], 'irregular, erupts with Mortar'),
    'Mortar Geyser': (None, [35 * MIN, 35 * MIN], [30, 30], 'irregular, erupts with Fan'),
    'Giant Geyser': (None, [90 * MIN, 90 * MIN], [60, 60], 'last eruption 2010-01-22'),
    'Giantess Geyser': (None, [4 * HOUR, 48 * HOUR], [45, 45], 'last eruption 2020-09-10'),
    'Plume Geyser': (None, [60, 60], [8, 8], 'dormant since 2012'),
    'Echinus Geyser': (None, [3 * MIN, 5 * MIN], [9, 9], 'irregular, last eruption 2019-01-26'),
    'Steamboat Geyser': (None, [10 * MIN, 10 * MIN], [90, 90], 'irregular; water phase 10 min or more'),
}

# Colour class from the hottest recorded temperature and its pH. Pigmented mats
# grow in the outflow below about 73 C, yellow nearest that limit, orange
# cooler, brown and green coolest; above it the water is clear and deep
# pools look blue. Acid features below pH 3.5 are milky grey and sulphur.
def colour(temp, ph):
    if ph is not None and ph < 3.5:
        return 'acid'
    if temp is None:
        return None
    if temp >= 73:
        return 'blue'
    if temp >= 60:
        return 'yellow'
    if temp >= 40:
        return 'orange'
    return 'brown'


def xlsx_rows(path):
    ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    z = zipfile.ZipFile(path)
    strings = [''.join(t.text or '' for t in si.iter(ns + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    rows = []
    for r in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter(ns + 'row'):
        row = {}
        for c in r.findall(ns + 'c'):
            v = c.find(ns + 'v')
            if v is not None:
                row[re.match(r'[A-Z]+', c.get('r')).group(0)] = strings[int(v.text)] if c.get('t') == 's' else v.text
        rows.append(row)
    head = rows[0]
    return [{head[k]: v for k, v in r.items() if k in head} for r in rows[1:]]


def num(v, lo=-1e9, hi=1e9):
    # The export writes missing values as -999.x; anything outside the
    # plausible range is treated as missing.
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if lo <= f <= hi else None


def date(v):
    try:
        return datetime.datetime.strptime(v, '%B %d, %Y').date()
    except (TypeError, ValueError):
        return datetime.date.min


def kind_of(rcn_type, name, inv):
    reported = rcn_type in RCN_KIND
    k = RCN_KIND.get(rcn_type)
    if k is None or k == 'hot spring':
        k = next((nk for pattern, nk in NAME_KIND if name and pattern.search(name)), k or 'hot spring')
    if k == 'hot spring' and inv and MAMMOTH_ID.match(inv):
        k = 'terrace'
    return k, reported


def gnis_springs():
    out = {}
    for zp in sorted((SOURCES / 'thermal').glob('DomesticNames_*_Text.zip')):
        with zipfile.ZipFile(zp) as z:
            name = next(n for n in z.namelist() if n.endswith('.txt'))
            text = z.read(name).decode('utf-8-sig')
        for row in csv.DictReader(io.StringIO(text), delimiter='|'):
            if row['feature_class'] == 'Spring' and row['prim_lat_dec']:
                out[row['feature_id']] = (row['feature_name'], float(row['prim_lat_dec']), float(row['prim_long_dec']))
    return out


def main():
    to_utm = Transformer.from_crs('EPSG:4326', UTM, always_xy=True)
    rows = xlsx_rows(SOURCES / 'thermal' / 'rcn_features.xlsx')
    groups = defaultdict(list)
    for r in rows:
        if num(r.get('Lat'), 40, 50) is None or num(r.get('Lon'), -115, -105) is None:
            continue
        key = r.get('Inv. Id') or f"RCN:{r.get('Name')}"
        groups[key].append(r)

    feats = []
    for key, rs in groups.items():
        rep = max(rs, key=lambda r: (r.get('Provider') == 'Park', date(r.get('Survey Date'))))
        e, n = to_utm.transform(float(rep['Lon']), float(rep['Lat']))
        x, z = utm_to_world(e, n)
        if not inside(x, z):
            continue
        name = rep.get('Name')
        if not name or name == rep.get('Inv. Id') or UNNAMED.match(name):
            name = None
        k, reported = kind_of(rep.get('Type'), name, rep.get('Inv. Id'))
        # The hottest record stands for the source: samples are often
        # taken downstream in the runoff. pH comes from that same record.
        temps = [(max(num(r.get('Temp'), 0, 130) or 0, num(r.get('Vent'), 1, 130) or 0), r) for r in rs]
        temp, hot = max(temps, key=lambda t: t[0])
        temp = temp or None
        ph = num(hot.get('pH'), 0, 14) if temp else None
        f = {'id': key, 'kind': k, 'reported': reported, 'x': round(float(x), 1), 'z': round(float(z), 1),
             'radius': PUBLISHED_RADIUS.get(name, DEFAULT_RADIUS[k]), 'source': 'rcn'}
        if name:
            f['name'] = name
        c = PUBLISHED_COLOUR.get(name) or colour(temp, ph)
        if c:
            f['colour'] = c
        if temp is not None:
            f['temp'] = round(temp, 1)
        if ph is not None:
            f['ph'] = round(ph, 2)
        feats.append(f)

    # GNIS springs near the inventory (so thermal, not a cold spring in a
    # meadow) whose name the inventory does not carry nearby.
    xy = np.array([[f['x'], f['z']] for f in feats])
    named = defaultdict(list)
    for f in feats:
        if 'name' in f:
            named[f['name'].lower()].append((f['x'], f['z']))
    added = 0
    for fid, (name, lat, lon) in gnis_springs().items():
        e, n = to_utm.transform(lon, lat)
        x, z = (float(v) for v in utm_to_world(e, n))
        if not inside(x, z) or '(historical)' in name:
            continue
        if np.min(np.hypot(xy[:, 0] - x, xy[:, 1] - z)) > 300:
            continue
        if any(np.hypot(px - x, pz - z) < 300 for px, pz in named.get(name.lower(), [])):
            continue
        k, _ = kind_of(None, name, None)
        feats.append({'id': f'GNIS:{fid}', 'name': name, 'kind': k, 'reported': False, 'x': round(x, 1), 'z': round(z, 1),
                      'radius': PUBLISHED_RADIUS.get(name, DEFAULT_RADIUS[k]), 'source': 'gnis'})
        added += 1

    for f in feats:
        e = NPS_ERUPTIONS.get(f.get('name'))
        if e and f['kind'] == 'geyser':
            interval, duration, height, note = e
            f.update({'interval': interval, 'duration': duration, 'height': height, 'note': note})
    matched = {f['name'] for f in feats if 'duration' in f}
    missing = sorted(set(NPS_ERUPTIONS) - matched)
    if missing:
        raise RuntimeError(f'NPS eruption data for {missing} found no geyser of that name')

    feats.sort(key=lambda f: f['id'])
    ids = Counter(f['id'] for f in feats)
    dup = [k for k, v in ids.items() if v > 1]
    if dup:
        raise RuntimeError(f'duplicate ids: {dup[:10]}')

    thermal = {
        'frame': 'world metres, x east, z south',
        'kinds': list(KINDS),
        'colours': {'blue': 'clear water at 73 C or more', 'yellow': '60 to 73 C', 'orange': '40 to 60 C',
                    'brown': 'below 40 C', 'acid': 'pH below 3.5'},
        'units': {'radius': 'm', 'interval': 's, [min, max]', 'duration': 's, [min, max]', 'height': 'm, [min, max]',
                  'temp': 'C, hottest recorded sample'},
        'eruptions': {'source': NPS_ERUPTIONS_URL, 'date': NPS_ERUPTIONS_DATE},
        'features': feats,
    }
    dump_json(DATA / 'thermal.json', thermal)
    print(f'thermal.json: {len(feats)} features ({added} from GNIS), {len(groups)} inventory records read')
    print('  kinds', dict(Counter(f['kind'] for f in feats)))
    print('  reported kind', sum(f['reported'] for f in feats), 'named', sum('name' in f for f in feats),
          'with colour', sum('colour' in f for f in feats), 'with eruption data', len(matched))


if __name__ == '__main__':
    main()
