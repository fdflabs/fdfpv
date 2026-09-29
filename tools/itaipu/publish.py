# publish.py: makes main of the data repository (fdflabs/fdfpv-itaipu-data,
# served by GitHub Pages) exactly a built data folder, through GitHub's
# REST API: one blob per file, one full tree (files the folder no longer
# has are gone from it), one commit on main's head, main moved to it
# without force. The data folder is not a git clone, so the API is the
# push; `gh` supplies the token.
#
# Refuses unless every file the folder's manifest lists is there with its
# sha256. Everything not under a leading-underscore path is published
# (the data, manifest.json, README.md, LICENCE.md, .nojekyll, .gitignore).
#
# Usage: uv run python publish.py "commit message" [folder]
#        (folder: by default build.py's stage, the one validate.py passed)
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

import base64
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from swap import STAGE, whole

REPO = 'fdflabs/fdfpv-itaipu-data'


def token():
    return subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True, check=True).stdout.strip()


def api(tok, method, path, body=None):
    req = urllib.request.Request(f'https://api.github.com/repos/{REPO}/{path}', method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': f'Bearer {tok}', 'Accept': 'application/vnd.github+json',
                                          'X-GitHub-Api-Version': '2022-11-28'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read() or b'null')
        except urllib.error.HTTPError as e:
            if e.code in (502, 503, 504) and attempt < 4:
                time.sleep(2 + 3 * attempt)
                continue
            raise RuntimeError(f'{method} {path}: {e.code} {e.read()[:300]!r}') from None


def main():
    msg = sys.argv[1]
    folder = Path(sys.argv[2]) if len(sys.argv) > 2 else STAGE
    man, bad = whole(folder)
    if bad:
        print(f'{folder}: {len(bad)} files not as its manifest says, first {bad[0]}; not published')
        return 1
    files = sorted(p for p in folder.rglob('*') if p.is_file()
                   and not any(part.startswith('_') for part in p.relative_to(folder).parts))
    tok = token()
    head = api(tok, 'GET', 'git/ref/heads/main')['object']['sha']
    tree = []
    for k, p in enumerate(files):
        blob = api(tok, 'POST', 'git/blobs', {'content': base64.b64encode(p.read_bytes()).decode(), 'encoding': 'base64'})
        tree.append({'path': str(p.relative_to(folder)), 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        if k % 25 == 0:
            print(f'  {k + 1}/{len(files)}', flush=True)
    t = api(tok, 'POST', 'git/trees', {'tree': tree})
    c = api(tok, 'POST', 'git/commits', {'message': msg, 'tree': t['sha'], 'parents': [head]})
    api(tok, 'PATCH', 'git/refs/heads/main', {'sha': c['sha'], 'force': False})
    print(f'{REPO} main {head[:8]} -> {c["sha"][:8]}: {len(files)} files, built {man["built"]}, '
          f'{man["bytes"]["total"]:,} data bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
