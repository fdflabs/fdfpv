# pick.py: pins a take for every line with takes in the review folder
# (build.py --takes N, _review/<lang>/<id>/<seed>.webm), by the measured
# rule below, into assets/audio/war/lines.json, so a rebuild speaks it.
# A person can listen and pin another (docs/campaign/TECH-NEEDS.md T3.2);
# this is what stands until they do.
#
# Usage, from tools/voice:
#   python3 pick.py [--only ID ...] [--dry]
# then rebuild the pinned lines: build.py --only ID ...
#
# THE RULE, per line and language, over its takes in the review folder:
#   1. Clarity: the lowest word error rate of what Whisper heard against
#      the script (the take's .txt, written by build.py).
#   2. Phrasing: the fewest sentence stops (. ! ? and the ellipsis)
#      Whisper heard too many or too few against the script's: Whisper
#      writes a stop where the speaker paused, so a take that runs two
#      sentences together, or breaks one, shows here and not in its word
#      error rate.
#   3. Level: a take whose integrated loudness (EBU R128, ffmpeg's
#      ebur128, on the take as the radio made it) is more than
#      LEVEL_LU from the median of the line's takes loses to every take
#      that is not: it was spoken louder or softer than the voice is.
#   4. Length: a film line (its id starts film-) nearest the length its
#      shot was written for (docs/campaign/INTROS.md, "target N s" in the
#      line's cue); any other line, the shortest, since a radio call that
#      drags is late.
#   5. The lowest seed, so the rule never ties.
# Every take's numbers are printed, so the choice can be read back.
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
import json
import re
import statistics
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LINES = ROOT / 'assets/audio/war/lines.json'
REVIEW = ROOT / 'assets/audio/war/_review'
INTROS = ROOT / 'docs/campaign/INTROS.md'
LANGS = ('en', 'es')

# How far from its line's median a take's loudness may be, LU.
LEVEL_LU = 2.0


def loudness(path):
    """Integrated loudness, LUFS, and length, seconds, of an audio file."""
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af', 'ebur128', '-f', 'null', '-'],
                         capture_output=True, text=True, check=True).stderr
    lufs = re.findall(r'I:\s+(-?[\d.]+) LUFS', out)
    if not lufs:
        raise SystemExit(f'pick: ffmpeg measured no loudness in {path}')
    secs = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                          capture_output=True, text=True, check=True).stdout.strip()
    return float(lufs[-1]), float(secs)


def targets():
    """Each film line's written length, seconds, from INTROS.md's tables."""
    out = {}
    for m in re.finditer(r'^\| (film-[\w-]+) \|[^|]*target ([\d.]+) s', INTROS.read_text(encoding='utf-8'), re.M):
        out[m.group(1)] = float(m.group(2))
    return out


def takes_of(folder):
    out = []
    for txt in sorted(folder.glob('*.txt')):
        heard, wer = txt.read_text(encoding='utf-8').splitlines()[:2]
        if not wer.startswith('wer '):
            raise SystemExit(f'pick: {txt} has no wer line')
        lufs, secs = loudness(txt.with_suffix('.webm'))
        out.append({'seed': int(txt.stem), 'heard': heard, 'wer': float(wer[4:]), 'lufs': lufs, 'secs': secs})
    return out


def stops(text):
    return len(re.findall(r'[.!?…]+', text.strip()))


def choose(script, takes, target):
    median = statistics.median(t['lufs'] for t in takes)
    for t in takes:
        t['stops'] = abs(stops(t['heard']) - stops(script))
        t['off'] = abs(t['lufs'] - median) > LEVEL_LU
        t['len'] = abs(t['secs'] - target) if target is not None else t['secs']
    return min(takes, key=lambda t: (t['wer'], t['stops'], t['off'], t['len'], t['seed']))


def pin(text, line_id, seeds):
    """lines.json with the line's take set to seeds, its layout kept: the
    take goes on its own row before the line's English, replacing one
    already there."""
    start = text.index(f'{{ "id": "{line_id}",')
    end = text.index(' }', text.index('"es":', start))
    record = text[start:end]
    record = re.sub(r'\n\s*"take": \{[^}]*\},', '', record)
    row = '"take": {' + ', '.join(f'"{lang}": {seed}' for lang, seed in seeds.items()) + '},'
    at = record.index('\n      "en":')
    record = record[:at] + '\n      ' + row + record[at:]
    return text[:start] + record + text[end:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='*', help='line ids to pin (default: every line with takes)')
    ap.add_argument('--dry', action='store_true', help='print the choice, write nothing')
    args = ap.parse_args()
    goal = targets()
    ids = sorted({p.name for lang in LANGS for p in (REVIEW / lang).glob('*') if p.is_dir()})
    if args.only:
        ids = [i for i in ids if i in args.only]
    text = LINES.read_text(encoding='utf-8')
    script = {line['id']: line for line in json.loads(text)['lines']}
    for line_id in ids:
        seeds = {}
        for lang in LANGS:
            folder = REVIEW / lang / line_id
            takes = takes_of(folder) if folder.is_dir() else []
            if not takes:
                continue
            target = goal.get(line_id) if line_id.startswith('film-') else None
            best = choose(script[line_id][lang], takes, target)
            seeds[lang] = best['seed']
            for t in takes:
                mark = '*' if t is best else ' '
                print(f'{mark} {line_id:20s} {lang} {t["seed"]:>10d} wer {t["wer"]:.3f} stops {t["stops"]} {t["lufs"]:6.1f} LUFS'
                      f'{" off" if t["off"] else "    "} {t["secs"]:5.2f} s'
                      f'{f" (target {target})" if target is not None else ""} | {t["heard"]}')
        if seeds:
            text = pin(text, line_id, seeds)
    if not args.dry:
        LINES.write_text(text, encoding='utf-8')


if __name__ == '__main__':
    main()
