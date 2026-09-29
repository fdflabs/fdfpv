# swap.py: puts the staged build (build.py's ITAIPU_STAGE, by default the
# live folder's name with -next) live with one atomic rename, and leaves
# the build it replaces where the stage was, so a swap back is the same
# command. The live folder is never half built: readers see the old
# folder or the new one.
#
# Refuses unless every file the stage's manifest lists is there with its
# sha256, and the stage's _sources is the live folder's.
#
# Usage: uv run python swap.py
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

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

LIVE = Path(os.environ.get('ITAIPU_DATA', Path.home() / 'Desktop' / 'fdfpv-itaipu-data'))
STAGE = Path(os.environ.get('ITAIPU_STAGE', LIVE.with_name(LIVE.name + '-next')))


def whole(folder):
    man = json.loads((folder / 'manifest.json').read_text())
    bad = [f for f, h in man['files'].items()
           if not (folder / f).is_file() or hashlib.sha256((folder / f).read_bytes()).hexdigest() != h]
    return man, bad


def main():
    man, bad = whole(STAGE)
    if bad:
        print(f'{STAGE}: {len(bad)} files missing or not as its manifest says, first {bad[0]}; not swapped')
        return 1
    if (STAGE / '_sources').resolve() != (LIVE / '_sources').resolve():
        print(f'{STAGE}/_sources is not {LIVE}/_sources; not swapped')
        return 1
    # renameat2(RENAME_EXCHANGE): both names change in one step.
    subprocess.run(['mv', '-T', '--exchange', str(STAGE), str(LIVE)], check=True)
    print(f'{LIVE} is now the build of {man["built"]}, {len(man["files"])} files, {man["bytes"]["total"]:,} bytes; '
          f'the build it replaced is in {STAGE}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
