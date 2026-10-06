# radio.py: the radio chain every voice line goes through at build time.
# A clean take in, a line as heard over a field radio out: band limited,
# lightly driven into saturation, a hiss and crackle bed under it, a key-up
# click before and a squelch tail after; each speaker with its own colour
# of all that (PRESETS).
#
# Pure numpy and scipy, no model. Every random thing is drawn from a
# generator seeded by the caller, so the same take and seed give the same
# samples on any machine.
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

import numpy as np
from scipy.signal import butter, sosfilt

# Each speaker's radio (docs/campaign/TECH-NEEDS.md T3.3), so the voices
# are told apart in a fight: its band, how hard it is driven (tanh: 1 is
# clean, 2.5 rounds a shout's peaks without the fizz a harder clip adds
# inside a 3 kHz band), the hiss under it, the crackle a second, and a
# colour of its own laid under the speech:
#   crest     the console: the chain every line had before speakers
#   mirador   wider and cleaner, a faint data hiss above the voice
#   taller    a handheld in the shed: room noise and a fan's hum
#   despacho  a telephone line: narrower, squeezed, the mains hum
#   carancho  the farthest: more static under him
# The Interior's (docs/campaign/interior/BIBLE.md 5, each voice's radio
# colour):
#   consola   Vega at the room's console: clean, close, barely driven
#   analista  Ibarra's desk: clean with a faint data hiss
#   campo     Rojas on a handheld or a vehicle set: an engine's drone and
#             wind under him
#   banco     Ferrer's systems bench: clean with a soft fan
#   archivo   the opening film's old recordings, years earlier: a narrow
#             band, driven hard, heavy hiss and crackle
# No preset drops or cuts a word: there is no radio breakup in any mission
# (the lead's decision of 2 October, under the owner's no jamming rule).
PRESETS = {
    'crest': {'band': (300.0, 3400.0), 'drive': 2.5, 'bed_db': -34.0, 'crackle': 6.0},
    'mirador': {'band': (200.0, 5000.0), 'drive': 1.8, 'bed_db': -38.0, 'crackle': 2.0, 'data_db': -42.0},
    'taller': {'band': (250.0, 3800.0), 'drive': 2.2, 'bed_db': -36.0, 'crackle': 4.0,
               'room_db': -36.0, 'fan_hz': 117.0, 'fan_db': -40.0},
    'despacho': {'band': (350.0, 3000.0), 'drive': 3.4, 'bed_db': -38.0, 'crackle': 3.0,
                 'hum_hz': 50.0, 'hum_db': -38.0},
    'carancho': {'band': (300.0, 3200.0), 'drive': 2.6, 'bed_db': -28.0, 'crackle': 14.0},
    'consola': {'band': (180.0, 6000.0), 'drive': 1.3, 'bed_db': -46.0, 'crackle': 0.5},
    'analista': {'band': (200.0, 5500.0), 'drive': 1.4, 'bed_db': -44.0, 'crackle': 1.0, 'data_db': -46.0},
    'campo': {'band': (280.0, 3600.0), 'drive': 2.3, 'bed_db': -34.0, 'crackle': 5.0,
              'room_db': -33.0, 'fan_hz': 96.0, 'fan_db': -40.0},
    'banco': {'band': (200.0, 5200.0), 'drive': 1.5, 'bed_db': -44.0, 'crackle': 1.0,
              'fan_hz': 141.0, 'fan_db': -46.0},
    'archivo': {'band': (420.0, 2600.0), 'drive': 3.2, 'bed_db': -25.0, 'crackle': 18.0},
}
# Speech RMS before the drive, in dBFS. Sets how hard every line hits the
# saturation, so a whisper and a shout come out of the radio at one level.
SPEECH_RMS_DB = -16.0
KEYUP_S = 0.035
SQUELCH_S = 0.16
PAD_S = 0.12            # hiss before the key-up and after the squelch
PEAK = 0.891            # -1 dBFS


def _band(sr, band, order=4):
    return butter(order, band, btype='bandpass', fs=sr, output='sos')


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


def _colour(rng, sr, n, p):
    """A preset's own colour under the speech, drawn after everything the
    console draws, so a crest line is the same samples it always was."""
    out = np.zeros(n)
    t = np.arange(n) / sr
    if 'data_db' in p:
        hiss = sosfilt(butter(4, (4200.0, 5600.0), btype='bandpass', fs=sr, output='sos'), rng.standard_normal(n))
        out += hiss / (np.std(hiss) + 1e-12) * 10 ** (p['data_db'] / 20)
    if 'room_db' in p:
        room = sosfilt(butter(2, 900.0, btype='lowpass', fs=sr, output='sos'), rng.standard_normal(n))
        out += room / (np.std(room) + 1e-12) * 10 ** (p['room_db'] / 20)
    if 'fan_hz' in p:
        out += 10 ** (p['fan_db'] / 20) * (np.sin(2 * np.pi * p['fan_hz'] * t) + 0.4 * np.sin(4 * np.pi * p['fan_hz'] * t))
    if 'hum_hz' in p:
        out += 10 ** (p['hum_db'] / 20) * (np.sin(2 * np.pi * p['hum_hz'] * t) + 0.5 * np.sin(6 * np.pi * p['hum_hz'] * t))
    return out


def radio(take, sr, seed, preset='crest'):
    """Run a clean mono float take through a speaker's radio. Returns
    float32 in [-1, 1]."""
    p = PRESETS[preset]
    rng = np.random.default_rng(seed)
    x = trim(np.asarray(take, dtype=np.float64), sr)
    sos = _band(sr, p['band'])

    x = sosfilt(sos, x)
    rms = np.sqrt(np.mean(x * x))
    x = x * (10 ** (SPEECH_RMS_DB / 20) / rms)
    x = np.tanh(p['drive'] * x) / np.tanh(p['drive'])
    # The drive makes harmonics above the band; take them back out so the
    # line stays inside its band.
    x = sosfilt(sos, x)

    key = _burst(rng, sr, KEYUP_S, 0.002, 0.35)
    squelch = _burst(rng, sr, SQUELCH_S, 0.004, 0.22)
    pad = np.zeros(int(sr * PAD_S))
    y = np.concatenate([pad, key, np.zeros(int(sr * 0.04)), x, squelch, pad])

    bed = rng.standard_normal(len(y)) * (10 ** (p['bed_db'] / 20))
    clicks = rng.random(len(y)) < p['crackle'] / sr
    bed += clicks * rng.choice([-1.0, 1.0], len(y)) * 0.08
    y = y + sosfilt(sos, bed)
    if preset != 'crest':
        y = y + _colour(rng, sr, len(y), p)

    peak = np.max(np.abs(y))
    if peak > PEAK:
        y = y * (PEAK / peak)
    return y.astype(np.float32)
