# music.py: fetches the war mode's two music tracks from their published
# sources, checks each download against the sha256 it had when its licence
# was read, and writes them to the war audio folder in the crate's formats
# (Opus in WebM at 80 kbps and an mp3 fallback at LAME V7, 48 kHz stereo,
# bit exact: the settings of scripts/music.js).
#
# Usage, from tools/voice: ~/.local/bin/uv run python music.py [--out DIR]
#
# The intro score is used as published. The combat bed is made to loop:
# its last LOOP_S seconds are crossfaded, equal power, over its first
# LOOP_S, and the file ends where that tail began, so the end of the file
# runs into its start with no seam. That is a modification, and the
# credit says so, as CC BY asks.
#
# No loudness processing, for the reason scripts/music.js gives: the
# level is a mix decision (src/render/tracks.js carries each file's
# measured LUFS and the mix levels them). One exception, a ceiling: a file
# whose true peak, four times oversampled, is over CEILING_DBTP is turned
# down until it is not, and nothing else. The combat bed measured +2.6
# dBTP as shipped, which a converter clips (docs/AUDIO.md); a gain is not a
# remaster. It is measured on the ENCODED files, decoded, because a lossy
# codec rings past the source's peak: the combat bed's own decode peaks
# 1.9 dB over its source.
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
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf

import script

SR = 48000
LOOP_S = 3.0
OPUS_KBPS = 80
LAME_Q = 7
CEILING_DBTP = -1.0
BITEXACT = ['-fflags', '+bitexact', '-flags:a', '+bitexact']

# Every field here is repeated, for people, in assets/audio/war/CREDITS.md.
TRACKS = {
    'intro': {
        'url': 'https://opengameart.org/sites/default/files/gregor_quendel_-_cinematic_trailer_music_-_14_-_cinematic_suspense_trailer.mp3',
        'sha256': 'f177a515fe3a4640311f87aa1d4263e2562cf1ed8782c63f031e8c393a94fee7',
        'loop': False,
    },
    'combat': {
        'url': 'https://opengameart.org/sites/default/files/Enemy%20spotted.mp3',
        'sha256': 'b92302f5207effff4db81a7b65f1e041e4c65c96ddc49c52eca361f85eb0d562',
        'loop': True,
    },
}


def fetch(url, sha, dest):
    if not dest.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'fdfpv-war-audio'})
        with urllib.request.urlopen(req, timeout=60) as r:
            dest.write_bytes(r.read())
    got = hashlib.sha256(dest.read_bytes()).hexdigest()
    if got != sha:
        raise SystemExit(f'music: {url} has sha256 {got}, not the {sha} whose licence was checked. '
                         'Read the source page again before changing the pin.')


def decode(src):
    raw = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(src), '-map_metadata', '-1',
                          '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2).astype(np.float64)


def make_loop(y):
    """Crossfade the tail over the head, equal power; the result loops without a seam."""
    n = int(LOOP_S * SR)
    if len(y) < 4 * n:
        raise ValueError('track too short to loop')
    t = np.linspace(0.0, np.pi / 2, n)[:, None]
    head = y[:n] * np.sin(t) + y[-n:] * np.cos(t)
    return np.concatenate([head, y[n:-n]])


def true_peak_db(y):
    """Four times oversampled peak, dBTP, by zero stuffing and a windowed sinc."""
    taps = 48
    k = np.arange(-taps // 2, taps // 2 + 1)
    up = 4
    h = np.sinc(k / up) * np.blackman(len(k))
    h /= h.sum() / up
    peak = 0.0
    for c in range(y.shape[1]):
        z = np.zeros(len(y) * up)
        z[::up] = y[:, c]
        peak = max(peak, float(np.max(np.abs(np.convolve(z, h, mode='same')))))
    return 20 * np.log10(peak) if peak > 0 else -np.inf


def encode(wav, base):
    common = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact', '-i', str(wav),
              '-map_metadata', '-1', '-vn', '-ac', '2', '-ar', str(SR)]
    subprocess.run(common + ['-c:a', 'libopus', '-b:a', f'{OPUS_KBPS}k', '-vbr', 'on', '-compression_level', '10',
                             '-application', 'audio', *BITEXACT, f'{base}.webm'], check=True)
    subprocess.run(common + ['-c:a', 'libmp3lame', '-q:a', str(LAME_Q), '-write_xing', '1', *BITEXACT,
                             f'{base}.mp3'], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, default=script.DEFAULT_OUT)
    args = ap.parse_args()
    out = args.out
    (out / '_sources').mkdir(parents=True, exist_ok=True)
    (out / '_work').mkdir(parents=True, exist_ok=True)
    (out / 'music').mkdir(parents=True, exist_ok=True)

    manifest_path = out / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    manifest['music'] = {}
    for name, t in TRACKS.items():
        src = out / '_sources' / Path(t['url']).name.replace('%20', '_')
        fetch(t['url'], t['sha256'], src)
        y = decode(src)
        if t['loop']:
            y = make_loop(y)
        wav = out / '_work' / f'music-{name}.wav'
        base = out / 'music' / name
        gain_db = 0.0
        for _ in range(4):
            sf.write(wav, (y * 10 ** (gain_db / 20)).astype(np.float32), SR, subtype='FLOAT')
            encode(wav, base)
            tp = max(true_peak_db(decode(Path(f'{base}.{fmt}'))) for fmt in script.FORMATS)
            if tp <= CEILING_DBTP:
                break
            gain_db += CEILING_DBTP - tp - 0.1
        else:
            raise SystemExit(f'music: {name} is still over {CEILING_DBTP} dBTP after four encodes')
        files = {fmt: {'bytes': Path(f'{base}.{fmt}').stat().st_size,
                       'sha256': hashlib.sha256(Path(f'{base}.{fmt}').read_bytes()).hexdigest()}
                 for fmt in script.FORMATS}
        manifest['music'][name] = {'source': t['url'], 'source_sha256': t['sha256'],
                                   'seconds': round(len(y) / SR, 3), 'loop': t['loop'], 'ceiling_db': round(gain_db, 2),
                                   'files': files}
        print(f'ok   music/{name:8s} {len(y) / SR:6.1f}s {gain_db:+.2f} dB webm {files["webm"]["bytes"]:>9,d} mp3 {files["mp3"]["bytes"]:>9,d}')
    manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
