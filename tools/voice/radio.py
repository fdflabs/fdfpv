# radio.py: the radio chain every voice line goes through at build time.
# A clean take in, a line as heard over a field radio out: band limited to
# the telephone band, lightly driven into saturation, a hiss and crackle bed
# under it, a key-up click before and a squelch tail after.
#
# Pure numpy and scipy, no model. Every random thing is drawn from a
# generator seeded by the caller, so the same take and seed give the same
# samples on any machine.
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

import numpy as np
from scipy.signal import butter, sosfilt

BAND_HZ = (300.0, 3400.0)
# tanh drive: 1 is clean, 2.5 rounds the peaks of a shout without the
# fizz a harder clip adds inside a 3 kHz band.
DRIVE = 2.5
# Speech RMS before the drive, in dBFS. Sets how hard every line hits the
# saturation, so a whisper and a shout come out of the radio at one level.
SPEECH_RMS_DB = -16.0
BED_DB = -34.0          # hiss under the speech, relative to full scale
CRACKLE_PER_S = 6.0     # mean crackle impulses a second
KEYUP_S = 0.035
SQUELCH_S = 0.16
PAD_S = 0.12            # hiss before the key-up and after the squelch
PEAK = 0.891            # -1 dBFS


def _band(sr, order=4):
    return butter(order, BAND_HZ, btype='bandpass', fs=sr, output='sos')


def trim(x, sr, floor_db=-45.0, keep_s=0.03):
    """Cut leading and trailing silence, judged on 10 ms frames."""
    hop = int(sr * 0.01)
    n = len(x) // hop
    if n == 0:
        raise ValueError('take is shorter than one 10 ms frame')
    frames = x[: n * hop].reshape(n, hop)
    rms = np.sqrt(np.mean(frames * frames, axis=1) + 1e-20)
    loud = np.nonzero(20 * np.log10(rms / (np.max(np.abs(x)) + 1e-20)) > floor_db)[0]
    if len(loud) == 0:
        raise ValueError('take is silent')
    keep = int(sr * keep_s)
    a = max(0, loud[0] * hop - keep)
    b = min(len(x), (loud[-1] + 1) * hop + keep)
    return x[a:b]


def _burst(rng, sr, seconds, attack_s, level):
    n = int(sr * seconds)
    t = np.arange(n) / sr
    env = np.minimum(1.0, t / attack_s) * np.exp(-t / (seconds / 3.0))
    return rng.standard_normal(n) * env * level


def radio(take, sr, seed):
    """Run a clean mono float take through the radio. Returns float32 in [-1, 1]."""
    rng = np.random.default_rng(seed)
    x = trim(np.asarray(take, dtype=np.float64), sr)
    sos = _band(sr)

    x = sosfilt(sos, x)
    rms = np.sqrt(np.mean(x * x))
    x = x * (10 ** (SPEECH_RMS_DB / 20) / rms)
    x = np.tanh(DRIVE * x) / np.tanh(DRIVE)
    # The drive makes harmonics above the band; take them back out so the
    # line stays a telephone band line.
    x = sosfilt(sos, x)

    key = _burst(rng, sr, KEYUP_S, 0.002, 0.35)
    squelch = _burst(rng, sr, SQUELCH_S, 0.004, 0.22)
    pad = np.zeros(int(sr * PAD_S))
    y = np.concatenate([pad, key, np.zeros(int(sr * 0.04)), x, squelch, pad])

    bed = rng.standard_normal(len(y)) * (10 ** (BED_DB / 20))
    clicks = rng.random(len(y)) < CRACKLE_PER_S / sr
    bed += clicks * rng.choice([-1.0, 1.0], len(y)) * 0.08
    y = y + sosfilt(sos, bed)

    peak = np.max(np.abs(y))
    if peak > PEAK:
        y = y * (PEAK / peak)
    return y.astype(np.float32)
