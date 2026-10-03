# check.py: the war audio's audit. Standard library only, so it runs
# with a bare python3 and no model environment.
#
#   python3 tools/voice/check.py              the committed folder, assets/audio/war
#   python3 tools/voice/check.py --out DIR    a trial build somewhere else
#   python3 tools/voice/check.py --fix        rewrite CREDITS.md's voice table
#
# What it holds: lines.json passes script.load() (ids, delivery, notes, no
# digit spoken, no dashes); CREDITS.md's voice table is the one lines.json
# implies; every music file has a credit row; every audio file in the
# folder is credited and is in manifest.json with the same sha256; every
# credited file exists; and every take in the manifest was spoken from the
# text lines.json has now, so a line edited without a rebuild fails; and
# what Whisper heard of every take, kept in the manifest, still passes
# build.py's gate (script.judge), so a loosened or bypassed gate fails;
# every take is its line's speaker's, the take lines.json pins when it pins
# one, and has no more than script.MAX_TAIL_MS of sound after its last
# word. No Spanish line addresses one pilot as tú. CI runs it: no GPU, no model, no
# download.
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

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import script

BEGIN = '<!-- voice table: written by tools/voice/check.py --fix from lines.json -->'
END = '<!-- end voice table -->'
MUSIC = ('intro', 'combat')
AUDIO = re.compile(r'\.(webm|mp3|ogg|wav|flac|m4a)$')


def voice_table(doc):
    rows = ['| Line | Files |', '| --- | --- |']
    for line in doc['lines']:
        files = ', '.join(f'`voice/{lang}/{line["id"]}.{fmt}`' for lang in script.LANGS for fmt in script.FORMATS)
        rows.append(f'| {line["id"]} | {files} |')
    return '\n'.join([BEGIN, *rows, END])


def credited(text):
    return set(re.findall(r'`((?:voice|music)/[^`]+)`', text))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, default=script.AUDIO)
    ap.add_argument('--fix', action='store_true')
    args = ap.parse_args()
    faults = []

    try:
        doc = script.load()
    except ValueError as e:
        sys.exit(f'check: {e}')

    credits = script.CREDITS.read_text(encoding='utf-8')
    if BEGIN not in credits or END not in credits:
        sys.exit(f'check: {script.CREDITS.name} has no voice table markers')
    head, rest = credits.split(BEGIN, 1)
    now = BEGIN + rest.split(END, 1)[0] + END
    want = voice_table(doc)
    if now != want:
        if args.fix:
            credits = credits.replace(now, want)
            script.CREDITS.write_text(credits, encoding='utf-8')
            print(f'check: rewrote the voice table in {script.CREDITS.name}')
        else:
            faults.append(f'{script.CREDITS.name}: the voice table is stale; run check.py --fix')
    for ch in script.DASHES:
        if ch in credits:
            faults.append(f'{script.CREDITS.name}: en or em dash')

    listed = credited(credits)
    expected = set(script.voice_files(doc)) | {f'music/{m}.{fmt}' for m in MUSIC for fmt in script.FORMATS}
    for f in sorted(expected - listed):
        faults.append(f'{script.CREDITS.name}: {f} has no credit')

    manifest_path = args.out / 'manifest.json'
    if not manifest_path.exists():
        sys.exit(f'check: no {manifest_path}; build the folder with tools/voice/build.py and music.py')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    spoken = {f'{line["id"]}.{lang}': line[lang] for line in doc['lines'] for lang in script.LANGS}
    shas = {}
    for key, v in manifest.get('voice', {}).items():
        line_id, lang = key.rsplit('.', 1)
        if key not in spoken:
            faults.append(f'manifest.json: {key} is not a line in lines.json')
        elif v['text'] != spoken[key]:
            faults.append(f'voice/{lang}/{line_id}: spoken as {v["text"]!r}, but lines.json says '
                          f'{spoken[key]!r}; rebuild it with build.py --only {line_id}')
        else:
            line = next(l for l in doc['lines'] if l['id'] == line_id)
            heard = v['takes'][-1]['heard']
            pinned = (line.get('take') or {}).get(lang)
            if v['takes'][-1].get('tail_ms', 0) > script.MAX_TAIL_MS:
                faults.append(f'voice/{lang}/{line_id}: {v["takes"][-1]["tail_ms"]} ms of sound after its last '
                              f'word, over {script.MAX_TAIL_MS}; rebuild it with build.py --only {line_id}')
            if pinned is not None and v['takes'][-1]['seed'] != pinned:
                faults.append(f'voice/{lang}/{line_id}: lines.json pins take {pinned}, but the file is take '
                              f'{v["takes"][-1]["seed"]}; rebuild it with build.py --only {line_id}')
            if v.get('speaker', 'crest') != line['speaker']:
                faults.append(f'voice/{lang}/{line_id}: spoken by {v.get("speaker", "crest")}, but lines.json '
                              f'gives it to {line["speaker"]}; rebuild it with build.py --only {line_id}')
            verdict = script.judge([line[lang], *line.get('heard', {}).get(lang, [])], heard, lang)
            if not verdict['ok']:
                faults.append(f'voice/{lang}/{line_id}: Whisper heard {heard!r}, which fails the gate '
                              f'(missing {verdict["missing"]}, wer {verdict["wer"]}, extra {verdict["extra"]}); '
                              f'rebuild it with build.py --only {line_id}')
        for fmt, f in v['files'].items():
            shas[f'voice/{lang}/{line_id}.{fmt}'] = f['sha256']
    for name, v in manifest.get('music', {}).items():
        for fmt, f in v['files'].items():
            shas[f'music/{name}.{fmt}'] = f['sha256']

    on_disk = {p.relative_to(args.out).as_posix(): p for p in args.out.rglob('*')
               if p.is_file() and AUDIO.search(p.name) and not p.relative_to(args.out).parts[0].startswith('_')}
    total = 0
    for rel, p in sorted(on_disk.items()):
        total += p.stat().st_size
        if rel not in listed:
            faults.append(f'{rel}: on disk with no credit')
        if rel not in shas:
            faults.append(f'{rel}: on disk, not in manifest.json')
        elif hashlib.sha256(p.read_bytes()).hexdigest() != shas[rel]:
            faults.append(f'{rel}: sha256 differs from manifest.json')
    for rel in sorted(expected - set(on_disk)):
        faults.append(f'{rel}: credited, not built')

    if faults:
        sys.exit('check: FAIL\n  ' + '\n  '.join(faults))
    print(f'check: ok, {len(doc["lines"])} lines, {len(expected)} files credited, '
          f'{len(on_disk)} built in {args.out.name}, {total / 1e6:.2f} MB, every sha256 matches manifest.json')


if __name__ == '__main__':
    main()
