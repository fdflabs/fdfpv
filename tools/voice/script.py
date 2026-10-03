# script.py: reads and checks assets/audio/war/lines.json, the one source
# of every voice line, and names the files a line becomes. Shared by
# build.py, which speaks the lines, and check.py, which audits the output.
#
# lines.json has `voices`, the speakers of docs/campaign/BIBLE.md 5.2 (each
# a role, and per language a Kokoro stock voice, a g2p and the reference
# text that voice reads), and `lines`, each with its `speaker` and, once a
# person has listened and chosen, the pinned `take` (a seed per language,
# build.py --takes).
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
import unicodedata
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
# The g2p names a voice may use: build.py turns each into Kokoro's own.
G2P = ('en-us', 'en-gb', 'es-419')
# The radio's colour for each speaker (radio.py), named here so a check
# with no numpy can hold lines.json to it.
PRESETS = ('crest', 'mirador', 'taller', 'despacho', 'carancho')
# The plan's rule is that no real figure is spoken until the plan sources
# it. No line has a sourced figure yet, so no line may speak a digit or a
# spelled number that reads as a quantity; the one year in the intro is
# the fiction's date, not a figure, and is spelled out.
DIGIT = re.compile(r'\d')
DASHES = (chr(0x2013), chr(0x2014))

# The commander speaks to the squad, so every Spanish line is ustedes and
# never tú (the owner's decision for the war mode; the rest of the game's
# Spanish stays tú, per docs/SPANISH-GLOSSARY.md). Spanish has no reliable
# way to spot every tú verb, so this catches the pronouns, the preterite
# ending -aste/-iste, and unambiguous forms, including those this script
# once used. "sube", "baja" or "mira" are also third person ("la oleada
# sube"), so such an imperative is left to review. A word that only looks
# like a tú form goes in TU_ALLOWED.
TU_WORDS = {'tu', 'tus', 'tú', 'te', 'ti', 'contigo', 'mantente', 'pierdes', 'vuelves',
            'eres', 'estás', 'tienes', 'puedes', 'sabes', 'quieres', 'vas'}
TU_PRETERITE = re.compile(r'(aste|iste)$')
TU_ALLOWED = {'resiste', 'existe', 'insiste', 'persiste', 'consiste', 'triste', 'chiste', 'desiste'}
SPANISH_WORD = re.compile(r'[a-záéíóúüñ]+')


def tu_forms(text):
    """Words in a Spanish line that address one person as tú."""
    return [w for w in SPANISH_WORD.findall(text.lower())
            if w not in TU_ALLOWED and (w in TU_WORDS or TU_PRETERITE.search(w))]


def load():
    """lines.json, checked. Raises ValueError naming every fault at once."""
    doc = json.loads(LINES.read_text(encoding='utf-8'))
    faults = []
    voices = doc.get('voices') or {}
    if 'crest' not in voices:
        faults.append('voices: needs crest, the commander, whose lines are every line from before speakers')
    for name, voice in voices.items():
        if not ID.match(name) or not voice.get('role'):
            faults.append(f'voices.{name}: a lower case name and a role')
        for lang in LANGS:
            v = voice.get(lang)
            if not v or not v.get('kokoro') or v.get('g2p') not in G2P or not v.get('reference'):
                faults.append(f'voices.{name}.{lang}: needs kokoro, a g2p of {", ".join(G2P)}, and reference')
            elif DIGIT.search(v['reference']):
                faults.append(f'voices.{name}.{lang}: a digit in the reference')
        if voice.get('preset', name) not in PRESETS:
            faults.append(f'voices.{name}: no radio preset {voice.get("preset", name)!r} (radio.py PRESETS)')
    seen = set()
    for i, line in enumerate(doc['lines']):
        where = line.get('id', f'lines[{i}]')
        if not ID.match(line.get('id', '')):
            faults.append(f'{where}: id must be lower case letters, digits and hyphens')
        if where in seen:
            faults.append(f'{where}: duplicate id')
        seen.add(where)
        if line.get('speaker') not in voices:
            faults.append(f'{where}: speaker {line.get("speaker")!r} is not in voices')
        for lang, seed in (line.get('take') or {}).items():
            if lang not in LANGS or not isinstance(seed, int) or seed < 0:
                faults.append(f'{where}.take.{lang}: a pinned take is a seed, a whole number')
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
        tu = tu_forms(line.get('es', ''))
        if tu:
            faults.append(f'{where}.es: addresses one pilot as tú ({", ".join(tu)}); the squad is ustedes')
        for lang, readings in line.get('heard', {}).items():
            if lang not in LANGS or not isinstance(readings, list) or not all(isinstance(r, str) for r in readings):
                faults.append(f'{where}.heard.{lang}: must be a list of strings')
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


# The acceptance gate for a take, from Whisper's transcript of it. It lives
# here, not in build.py, so check.py can hold every committed take to it
# with no model: the manifest keeps what Whisper heard.
MAX_WER = 0.15
# The most sound a take may have after its last word, ms (build.py
# tail_ms): a mumble after the line passes Whisper, which leaves it out.
MAX_TAIL_MS = 150

# Whisper writes a small spoken number as a digit about half the time.
DIGITS = {'en': {'1': 'one', '2': 'two', '3': 'three'}, 'es': {'1': 'uno', '2': 'dos', '3': 'tres'}}


# Words a line can lose without changing what it says. Every other word of
# the script must be in Whisper's transcript, exactly, after case and
# accents are folded: the word error rate alone let "cada abuelo cuente"
# through for "cada vuelo cuente", one wrong word in eight, and a native
# speaker heard nonsense. "no" is not here on purpose.
FUNCTION = {
    'en': set('a an the and or of to in on at for is are be it its this that as by with'.split()),
    'es': set('el la los las lo un una unos unas de del a al y o en por para con que se le les su sus es'.split()),
}


def words(text, lang):
    text = unicodedata.normalize('NFD', text.lower())
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    text = re.sub(r'\b[123]\b', lambda m: DIGITS[lang][m.group(0)], text)
    text = re.sub(r"[^\w\s]", ' ', text.replace("'", ''))
    return text.split()


def missing(ref, hyp, lang):
    """The script's content words that Whisper did not hear."""
    heard = set(words(hyp, lang))
    return [w for w in words(ref, lang) if w not in FUNCTION[lang] and w not in heard]


def judge(readings, hyp, lang):
    """Score a transcript against every accepted reading of a line; the
    take passes if any one reading passes all three tests."""
    best = None
    for want in readings:
        e, extra = score(want, hyp, lang)
        lost = missing(want, hyp, lang)
        verdict = {'wer': round(e, 3), 'extra': extra, 'missing': lost,
                   'ok': e <= MAX_WER and extra == 0 and not lost}
        if best is None or verdict['ok'] or len(lost) < len(best['missing']):
            best = verdict
        if verdict['ok']:
            break
    return best


def score(ref, hyp, lang):
    """Word error rate, and how many words were heard that the script does
    not have. Each cell is (edits, insertions); the cheapest path wins and a
    tie goes to the one with fewer insertions."""
    r, h = words(ref, lang), words(hyp, lang)
    d = [(j, j) for j in range(len(h) + 1)]
    for i, rw in enumerate(r, 1):
        prev, d[0] = d[0], (i, 0)
        for j, hw in enumerate(h, 1):
            delete = (d[j][0] + 1, d[j][1])
            insert = (d[j - 1][0] + 1, d[j - 1][1] + 1)
            swap = (prev[0] + (rw != hw), prev[1])
            prev, d[j] = d[j], min(delete, insert, swap)
    edits, inserted = d[len(h)]
    return edits / max(1, len(r)), inserted
