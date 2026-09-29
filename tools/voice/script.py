# script.py: reads and checks assets/audio/war/lines.json, the one source
# of every voice line, and names the files a line becomes. Shared by
# build.py, which speaks the lines, and check.py, which audits the output.
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
import os
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LINES = REPO / 'assets/audio/war/lines.json'
CREDITS = REPO / 'assets/audio/war/CREDITS.md'
LANGS = ('en', 'es')
FORMATS = ('webm', 'mp3')

# The built audio is committed beside its script, as assets/music is.
# WAR_AUDIO points a trial build somewhere else.
AUDIO = REPO / 'assets/audio/war'
DEFAULT_OUT = Path(os.environ.get('WAR_AUDIO', AUDIO))

ID = re.compile(r'^[a-z][a-z0-9-]*$')
# The plan's rule is that no real figure is spoken until the plan sources
# it. No line has a sourced figure yet, so no line may speak a digit or a
# spelled number that reads as a quantity; the one year in the intro is
# the fiction's date, not a figure, and is spelled out.
DIGIT = re.compile(r'\d')
DASHES = (chr(0x2013), chr(0x2014))


def load():
    """lines.json, checked. Raises ValueError naming every fault at once."""
    doc = json.loads(LINES.read_text(encoding='utf-8'))
    faults = []
    for lang in LANGS:
        v = doc['voice'].get(lang)
        if not v or not v.get('kokoro') or not v.get('g2p') or not v.get('reference'):
            faults.append(f'voice.{lang}: needs kokoro, g2p and reference')
    seen = set()
    for i, line in enumerate(doc['lines']):
        where = line.get('id', f'lines[{i}]')
        if not ID.match(line.get('id', '')):
            faults.append(f'{where}: id must be lower case letters, digits and hyphens')
        if where in seen:
            faults.append(f'{where}: duplicate id')
        seen.add(where)
        if line.get('delivery') not in doc['delivery']:
            faults.append(f'{where}: delivery {line.get("delivery")!r} is not in the delivery table')
        if not line.get('notes') or not line.get('group'):
            faults.append(f'{where}: needs group and notes')
        for lang in LANGS:
            text = line.get(lang, '')
            if not text.strip():
                faults.append(f'{where}: no {lang} text')
            if DIGIT.search(text):
                faults.append(f'{where}.{lang}: a digit is a spoken figure, and none is sourced')
        for field in ('en', 'es', 'notes'):
            if any(d in line.get(field, '') for d in DASHES):
                faults.append(f'{where}.{field}: en or em dash')
    if faults:
        raise ValueError('lines.json:\n  ' + '\n  '.join(faults))
    return doc


def voice_files(doc):
    """Every voice file the build writes, as paths relative to the output root."""
    return [f'voice/{lang}/{line["id"]}.{fmt}'
            for line in doc['lines'] for lang in LANGS for fmt in FORMATS]
