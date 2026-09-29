# check.py: the war audio's audit. Standard library only, so it runs
# with a bare python3 and no model environment.
#
#   python3 tools/voice/check.py              lines.json and CREDITS.md
#   python3 tools/voice/check.py --out DIR    and a built folder against both
#   python3 tools/voice/check.py --fix        rewrite CREDITS.md's voice table
#
# What it holds: lines.json passes script.load() (ids, delivery, notes, no
# digit spoken, no dashes); CREDITS.md's voice table is the one lines.json
# implies; every music file has a credit row; and, given a folder, every
# audio file in it is credited, is in the manifest with the same sha256,
# and every credited file exists.
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
    ap.add_argument('--out', type=Path)
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

    total = 0
    if args.out:
        manifest = json.loads((args.out / 'manifest.json').read_text(encoding='utf-8'))
        shas = {}
        for key, v in manifest.get('voice', {}).items():
            line_id, lang = key.rsplit('.', 1)
            for fmt, f in v['files'].items():
                shas[f'voice/{lang}/{line_id}.{fmt}'] = f['sha256']
        for name, v in manifest.get('music', {}).items():
            for fmt, f in v['files'].items():
                shas[f'music/{name}.{fmt}'] = f['sha256']
        on_disk = {p.relative_to(args.out).as_posix(): p for p in args.out.rglob('*')
                   if p.is_file() and AUDIO.search(p.name) and not p.relative_to(args.out).parts[0].startswith('_')}
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
    summary = f'check: ok, {len(doc["lines"])} lines, {len(expected)} files credited'
    if args.out:
        summary += f', {len(on_disk)} built, {total / 1e6:.2f} MB'
    print(summary)


if __name__ == '__main__':
    main()
