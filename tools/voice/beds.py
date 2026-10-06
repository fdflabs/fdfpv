# beds.py: generates The Interior's music and sound beds (docs/campaign/
# interior/BIBLE.md section 8, TECH-NEEDS.md N22, FILMS.md) from nothing but
# numbers: no sample, no recording, no model, so every sound is this file's
# and GPLv3 like it. Written to the war audio folder beside the war's two
# downloaded tracks, in the same formats (tools/voice/music.py encode), and
# entered in its manifest, so warradio.js plays them as beds by name and
# voice:check holds them to their credits and sha256.
#
# Usage, from tools/voice: ~/.local/bin/uv run python beds.py [--out DIR] [--only NAME ...]
#
# The beds, each made to loop (music.py make_loop):
#   interior  THE INTERIOR: sparse, wide, atmospheric; a low drone in
#             fifths that swells and falls, wind like noise, a soft low
#             drum now and then, far bells; long reverb for distance
#   column    THE COLUMN: old textures processed: one held reed organ
#             note alone for its first COLUMN_ALONE_S (the outro's "single
#             sustained note"), then nylon string and low harp plucks
#             (Karplus-Strong) through tape wow, saturation and a dark
#             reverb, the note under them throughout
#   static    an old receiver: hum, hiss, crackle (the opening's archive)
#   wind      wind at altitude and a distant pusher prop (the camera ball)
#   room      the operations room's tone: a generator outside the walls
#             and a fan
#
# Deterministic: every random draw is from a generator seeded by the bed's
# name, and the encode is bit exact, so a rebuild writes the same bytes.
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
import hashlib
import json
import sys
import zlib
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt

import music
import script

SR = music.SR
# Each bed's length once looped, seconds, and its level, RMS dBFS before
# the encode: the music sits under the voices, the sound beds under that.
BEDS = {
    'interior': {'seconds': 90.0, 'rms_db': -22.0},
    'column': {'seconds': 75.0, 'rms_db': -23.0},
    'static': {'seconds': 16.0, 'rms_db': -31.0},
    'wind': {'seconds': 20.0, 'rms_db': -29.0},
    'room': {'seconds': 20.0, 'rms_db': -33.0},
}
COLUMN_ALONE_S = 30.0
# The plucks stop this long before the end, so the loop's seam (and the
# held note the outro opens on) is the organ alone.
COLUMN_TAIL_S = 9.0


def rng_for(name):
    return np.random.default_rng(zlib.crc32(name.encode()))


def lowpass(x, hz, order=2):
    return sosfilt(butter(order, hz, btype='lowpass', fs=SR, output='sos'), x, axis=0)


def highpass(x, hz, order=2):
    return sosfilt(butter(order, hz, btype='highpass', fs=SR, output='sos'), x, axis=0)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, (lo, hi), btype='bandpass', fs=SR, output='sos'), x, axis=0)


def smooth_noise(rng, n, rate_hz):
    """A slow random curve in [-1, 1], rate_hz changes a second."""
    k = max(4, int(n / SR * rate_hz) + 4)
    pts = rng.uniform(-1, 1, k)
    x = np.linspace(0, k - 3, n)
    i = np.floor(x).astype(int)
    f = x - i
    f = f * f * (3 - 2 * f)
    return pts[i] * (1 - f) + pts[i + 1] * f


def reverb(rng, x, seconds, wet, dark_hz=4000.0):
    """A stereo reverb: x convolved with decaying noise, a different tail
    each side so the room is wide."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    env = np.exp(-6.9 * t / seconds)
    ir = np.stack([lowpass(rng.standard_normal(n), dark_hz) * env for _ in range(2)], axis=1)
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    mono = x.mean(axis=1) if x.ndim == 2 else x
    tail = np.stack([fftconvolve(mono, ir[:, c])[: len(mono)] for c in range(2)], axis=1)
    dry = x if x.ndim == 2 else np.stack([x, x], axis=1)
    return dry * (1 - wet) + tail * wet


def place(out, sig, at, pan=0.0):
    """Adds a mono sound at sample `at`, panned -1 left to 1 right."""
    a = int(at)
    b = min(len(out), a + len(sig))
    if a >= len(out):
        return
    left = np.cos((pan + 1) * np.pi / 4)
    right = np.sin((pan + 1) * np.pi / 4)
    out[a:b, 0] += sig[: b - a] * left
    out[a:b, 1] += sig[: b - a] * right


def pluck(rng, hz, seconds, damp, bright):
    """Karplus-Strong: a burst of noise round a delay line the string's
    length, each pass averaged with its neighbour, the way a plucked string
    loses its top. A period at a time: every sample of a period reads only
    the periods before it."""
    n = int(seconds * SR)
    p = max(2, int(round(SR / hz)))
    y = np.zeros(n + p + 1)
    y[1:p + 1] = lowpass(rng.uniform(-1, 1, p), bright)
    for a in range(p + 1, len(y), p):
        b = min(len(y), a + p)
        y[a:b] = damp * 0.5 * (y[a - p:b - p] + y[a - p - 1:b - p - 1])
    env = np.minimum(1.0, np.arange(n) / (0.002 * SR))
    return y[1:n + 1] * env


def interior(rng, n):
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    # The drone: D and A in fifths, a little E above now and then, every
    # partial detuned apart on each side so the chord stands wide.
    for hz, gain, period in ((73.42, 1.0, 23.0), (110.0, 0.7, 29.0), (146.83, 0.45, 19.0), (164.81, 0.25, 37.0)):
        swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / period + rng.uniform(0, 2 * np.pi))
        for c, det in enumerate((-0.0016, 0.0016)):
            s = np.zeros(n)
            for k in range(1, 7):
                s += np.sin(2 * np.pi * hz * k * (1 + det * k) * t + rng.uniform(0, 2 * np.pi)) / k ** 1.6
            out[:, c] += s * swell * gain
    out = lowpass(out, 900.0)
    out *= 0.16
    # Wind: two bands of noise, each breathing on its own slow curve.
    for lo, hi, gain in ((120.0, 420.0, 0.35), (500.0, 1500.0, 0.12)):
        noise = bandpass(rng.standard_normal((n, 2)), lo, hi)
        noise /= np.std(noise)
        out += noise * gain * (0.5 + 0.5 * smooth_noise(rng, n, 0.25))[:, None] * 0.12
    # A soft low drum, irregular, far off.
    hits = np.zeros((n, 2))
    at = 2.5
    while at < n / SR - 2:
        m = int(1.4 * SR)
        tt = np.arange(m) / SR
        f = 48 + 34 * np.exp(-tt / 0.07)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.45)
        skin = lowpass(rng.standard_normal(m), 260.0) * np.exp(-tt / 0.03) * 0.4
        place(hits, (body + skin) * rng.uniform(0.6, 1.0), at * SR, rng.uniform(-0.4, 0.4))
        at += rng.choice([3.6, 4.8, 6.0, 7.2]) + (0.0 if rng.random() > 0.25 else -2.4)
    # Bells, very far, from D minor's pentatonic.
    bells = np.zeros((n, 2))
    at = 6.0
    while at < n / SR - 6:
        hz = rng.choice([440.0, 587.33, 698.46, 880.0, 1046.5])
        m = int(5 * SR)
        tt = np.arange(m) / SR
        index = 2.4 * np.exp(-tt / 0.8)
        bell = np.sin(2 * np.pi * hz * tt + index * np.sin(2 * np.pi * hz * 1.4 * tt)) * np.exp(-tt / 1.4)
        place(bells, bell * rng.uniform(0.15, 0.3), at * SR, rng.uniform(-0.8, 0.8))
        at += rng.uniform(9.0, 16.0)
    out += reverb(rng, hits * 0.5 + bells * 0.22, 4.5, 0.6, 2500.0)
    return reverb(rng, out, 3.0, 0.25)


def column(rng, n):
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    # The held note: a reed organ's A, its harmonics uneven, a slow tape
    # wow under its pitch, faded in.
    wow = 1 + 0.0025 * np.sin(2 * np.pi * 0.31 * t) + 0.0008 * np.sin(2 * np.pi * 5.2 * t)
    phase = 2 * np.pi * 110.0 * np.cumsum(wow) / SR
    organ = np.zeros(n)
    for k, a in enumerate((1.0, 0.55, 0.42, 0.18, 0.22, 0.08, 0.06), start=1):
        organ += a * np.sin(k * phase + k)
    organ = np.tanh(1.6 * organ) * (0.6 + 0.4 * smooth_noise(rng, n, 0.08))
    organ = lowpass(organ, 2200.0) * np.minimum(1.0, t / 3.0) * 0.22
    out += np.stack([organ, np.roll(organ, int(0.011 * SR))], axis=1)
    # From COLUMN_ALONE_S: nylon strings and low harp, A dorian, sparse.
    strings = np.zeros((n, 2))
    at = COLUMN_ALONE_S
    notes = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0]
    while at < n / SR - COLUMN_TAIL_S:
        for k in range(rng.choice([1, 1, 2, 3])):
            hz = rng.choice(notes)
            s = pluck(rng, hz, 2.5, 0.996, 3500.0)
            place(strings, s * rng.uniform(0.25, 0.4), (at + k * 0.18) * SR, rng.uniform(-0.5, 0.5))
        at += rng.choice([1.4, 1.8, 2.2, 2.8, 3.6])
    harp = np.zeros((n, 2))
    at = COLUMN_ALONE_S + 1.0
    while at < n / SR - COLUMN_TAIL_S - 2:
        hz = rng.choice([55.0, 73.42, 82.41, 110.0])
        s = pluck(rng, hz, 6.0, 0.9993, 1800.0)
        # A swell into it: its own first second, reversed.
        swell = s[: SR][::-1] * np.linspace(0, 1, SR) ** 2 * 0.5
        place(harp, swell, (at - 1.0) * SR, rng.uniform(-0.3, 0.3))
        place(harp, s * 0.6, at * SR, rng.uniform(-0.3, 0.3))
        at += rng.uniform(5.0, 8.0)
    plucked = strings + harp
    # Processed: the same wow on them, a little crush, a dark room.
    plucked = np.tanh(2.0 * plucked) / 2.0
    plucked = np.round(plucked * 1024) / 1024
    plucked = lowpass(plucked, 3400.0)
    out += reverb(rng, plucked, 3.2, 0.45, 3000.0)
    return reverb(rng, out, 2.5, 0.2, 3000.0)


def static(rng, n):
    t = np.arange(n) / SR
    hum = 0.05 * np.sin(2 * np.pi * 50 * t) + 0.03 * np.sin(2 * np.pi * 100 * t) + 0.02 * np.sin(2 * np.pi * 150 * t)
    hiss = bandpass(rng.standard_normal(n), 300.0, 3200.0) * 0.12 * (0.7 + 0.3 * smooth_noise(rng, n, 0.6))
    crackle = (rng.random(n) < 9.0 / SR) * rng.choice([-1.0, 1.0], n) * 0.7
    crackle = bandpass(crackle, 600.0, 4000.0)
    whine = 0.006 * np.sin(2 * np.pi * (1300 + 200 * smooth_noise(rng, n, 0.2)) * t) * (smooth_noise(rng, n, 0.1) > 0.4)
    mono = hum + hiss + crackle + whine
    return np.stack([mono, mono * 0.92 + 0.08 * np.roll(mono, 97)], axis=1)


def wind(rng, n):
    t = np.arange(n) / SR
    out = lowpass(rng.standard_normal((n, 2)), 550.0) * (0.55 + 0.45 * smooth_noise(rng, n, 0.35))[:, None]
    out += bandpass(rng.standard_normal((n, 2)), 900.0, 2400.0) * 0.08 * (0.5 + 0.5 * smooth_noise(rng, n, 0.5))[:, None]
    # A pusher prop far off: a buzz and its harmonics, darkened.
    f = 92.0 * (1 + 0.004 * smooth_noise(rng, n, 0.15))
    phase = 2 * np.pi * np.cumsum(f) / SR
    prop = sum(np.sin(k * phase) / k for k in range(1, 9))
    prop = lowpass(prop, 650.0) * 0.18 * (0.8 + 0.2 * smooth_noise(rng, n, 0.3))
    return out + np.stack([prop, np.roll(prop, 211)], axis=1)


def room(rng, n):
    t = np.arange(n) / SR
    # The generator outside: a firing rhythm's harmonics through the walls.
    gen = sum(np.sin(2 * np.pi * 25.0 * k * t + k) / k for k in range(1, 12))
    gen = lowpass(gen + 0.6 * lowpass(rng.standard_normal(n), 180.0), 320.0) * 0.5
    fan = bandpass(rng.standard_normal(n), 400.0, 3500.0) * 0.12 + 0.04 * np.sin(2 * np.pi * 113.0 * t)
    mono = gen + fan
    return np.stack([mono, 0.95 * mono + 0.05 * np.roll(mono, 331)], axis=1)


MAKERS = {'interior': interior, 'column': column, 'static': static, 'wind': wind, 'room': room}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, default=script.DEFAULT_OUT)
    ap.add_argument('--only', nargs='*')
    args = ap.parse_args()
    out = args.out
    (out / '_work').mkdir(parents=True, exist_ok=True)
    (out / 'music').mkdir(parents=True, exist_ok=True)
    manifest_path = out / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    manifest.setdefault('music', {})
    for name, bed in BEDS.items():
        if args.only and name not in args.only:
            continue
        rng = rng_for(name)
        n = int((bed['seconds'] + music.LOOP_S) * SR)
        y = highpass(MAKERS[name](rng, n), 25.0)
        y = music.make_loop(y)
        y *= 10 ** (bed['rms_db'] / 20) / np.sqrt(np.mean(y ** 2))
        wav = out / '_work' / f'bed-{name}.wav'
        base = out / 'music' / name
        gain_db = 0.0
        for _ in range(4):
            sf.write(wav, (y * 10 ** (gain_db / 20)).astype(np.float32), SR, subtype='FLOAT')
            music.encode(wav, base)
            tp = max(music.true_peak_db(music.decode(Path(f'{base}.{fmt}'))) for fmt in script.FORMATS)
            if tp <= music.CEILING_DBTP:
                break
            gain_db += music.CEILING_DBTP - tp - 0.1
        else:
            raise SystemExit(f'beds: {name} is still over {music.CEILING_DBTP} dBTP after four encodes')
        files = {fmt: {'bytes': Path(f'{base}.{fmt}').stat().st_size,
                       'sha256': hashlib.sha256(Path(f'{base}.{fmt}').read_bytes()).hexdigest()}
                 for fmt in script.FORMATS}
        manifest['music'][name] = {'source': 'generated by tools/voice/beds.py', 'seconds': round(len(y) / SR, 3),
                                   'loop': True, 'rms_db': bed['rms_db'], 'ceiling_db': round(gain_db, 2), 'files': files}
        print(f'ok   music/{name:8s} {len(y) / SR:6.1f}s {gain_db:+.2f} dB true peak {tp:+.2f} dBTP '
              f'webm {files["webm"]["bytes"]:>9,d} mp3 {files["mp3"]["bytes"]:>9,d}', flush=True)
    manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
