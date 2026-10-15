# orin.py: brings a voice build made on the Jetson Orin (jetson.sh build
# --out DIR) into assets/audio/war: each line's radio wav, encoded here
# with build.py's encode and this desktop's ffmpeg, as every other file in
# the folder was, and its manifest entry from the Orin's manifest with the
# files' sizes and sha256 replaced and "machine": "orin" added. The
# manifest keeps its order; a line new to it is added at the end.
#
# Usage, from tools/voice, after copying the Orin's DIR/manifest.json and
# DIR/_work/<id>-<lang>.wav here:
#   uv run python orin.py DIR ID ...
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

import argparse
import json
import sys
from pathlib import Path

import build
import script


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('built', type=Path, help="the Orin's --out folder, copied here")
    ap.add_argument('ids', nargs='+')
    args = ap.parse_args()

    orin = json.loads((args.built / 'manifest.json').read_text(encoding='utf-8'))['voice']
    manifest_path = script.AUDIO / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    missing = [f'{i}.{lang}' for i in args.ids for lang in script.LANGS if f'{i}.{lang}' not in orin]
    if missing:
        sys.exit(f'orin: not in the Orin build: {", ".join(missing)}')
    for line_id in args.ids:
        for lang in script.LANGS:
            entry = orin[f'{line_id}.{lang}']
            base = script.AUDIO / 'voice' / lang / line_id
            build.encode(args.built / '_work' / f'{line_id}-{lang}.wav', base)
            entry['files'] = {fmt: {'bytes': Path(f'{base}.{fmt}').stat().st_size, 'sha256': build.sha256(f'{base}.{fmt}')}
                              for fmt in script.FORMATS}
            entry['machine'] = 'orin'
            manifest['voice'][f'{line_id}.{lang}'] = entry
            print(f'orin: {line_id}.{lang} {entry["seconds"]:5.2f} s | {entry["takes"][-1]["heard"]}')
    manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
