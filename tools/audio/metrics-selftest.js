/*
 * metrics-selftest.js: tools/audio/metrics.js against signals whose answers
 * are known, so a loudness figure in docs/AUDIO.md or a pull request is a
 * figure from a meter that has been shown to read right.
 *
 *   npm run audio:metrics
 *
 * The loudness cases are EBU Tech 3341's (V4, 2016) minimum requirements:
 * a 1 kHz stereo sine at -23 and -33 dBFS reads -23.0 and -33.0 LUFS within
 * 0.1, and its gating case (-36, -23, -36 dBFS) still reads -23.0. Plain
 * Node, no browser, under a few seconds.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { loudness, truePeak, bands, repetition, hygiene } from './metrics.js';

const RATE = 48000;
let failed = 0;
function check(name, ok, detail) {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
  if (!ok) {
    failed += 1;
  }
}

/* A sine at a peak level in dBFS, `seconds` long, segments concatenated. */
function sines(segments, hz = 1000, rate = RATE) {
  const total = segments.reduce((a, s) => a + Math.round(s.seconds * rate), 0);
  const x = new Float32Array(total);
  let i = 0;
  for (const s of segments) {
    const amp = 10 ** (s.dbfs / 20);
    const n = Math.round(s.seconds * rate);
    for (let k = 0; k < n; k += 1, i += 1) {
      x[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate);
    }
  }
  return x;
}

for (const level of [-23, -33]) {
  const x = sines([{ seconds: 20, dbfs: level }]);
  const l = loudness([x, x], RATE);
  check(`EBU 3341 case: stereo 1 kHz at ${level} dBFS`, Math.abs(l.integrated - level) <= 0.1, `${l.integrated.toFixed(3)} LUFS`);
}
{
  const x = sines([{ seconds: 10, dbfs: -36 }, { seconds: 60, dbfs: -23 }, { seconds: 10, dbfs: -36 }]);
  const l = loudness([x, x], RATE);
  check('EBU 3341 gating case: -36, -23, -36 dBFS', Math.abs(l.integrated + 23) <= 0.1, `${l.integrated.toFixed(3)} LUFS`);
}
{
  /* 44.1 kHz too: the K weighting is derived per rate, not hard coded. */
  const x = sines([{ seconds: 20, dbfs: -23 }], 1000, 44100);
  const l = loudness([x, x], 44100);
  check('the same at 44.1 kHz', Math.abs(l.integrated + 23) <= 0.1, `${l.integrated.toFixed(3)} LUFS`);
}
{
  /* A sine at a quarter of the rate, phased 45 degrees off its samples:
   * every sample sits at 0.707 of the waveform's real peak, so the
   * sample peak reads -3.01 dBFS and a true peak meter must read 0. */
  const n = RATE * 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    x[i] = Math.sin((Math.PI / 2) * i + Math.PI / 4);
  }
  const tp = truePeak([x]);
  check('true peak finds the peak between samples', Math.abs(tp) <= 0.3, `${tp.toFixed(2)} dBTP, sample peak -3.01 dBFS`);
}
{
  const x = sines([{ seconds: 4, dbfs: -12 }], 3000);
  const b = bands(Float64Array.from(x), RATE);
  check('a 3 kHz tone is all in the 2 to 5 kHz band', b.harshA > 99, `${b.harshA.toFixed(2)} percent A weighted`);
  const y = sines([{ seconds: 4, dbfs: -12 }], 150);
  const c = bands(Float64Array.from(y), RATE);
  check('a 150 Hz tone has none there', c.harshA < 0.5, `${c.harshA.toFixed(3)} percent A weighted`);
}
{
  /* The same click every half second against the same length of noise. */
  const n = RATE * 8;
  const clicks = new Float64Array(n);
  for (let t = 0; t < n; t += RATE / 2) {
    for (let k = 0; k < 400; k += 1) {
      clicks[t + k] = Math.exp(-k / 60) * Math.sin(k * 0.9);
    }
  }
  let s = 1;
  const noise = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    /* Math.imul, not a float multiply: s * 1103515245 overflows 2^53 and
     * the float version repeats every 10466 samples, which is a pitch. */
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    noise[i] = 0.2 * ((s / 0x80000000) - 1);
  }
  const rc = repetition(clicks, RATE);
  const rn = repetition(noise, RATE);
  check('a repeated click scores as a repeat', rc.peak > 0.8 && Math.abs(rc.lagS - 0.5) < 0.02, `${rc.peak.toFixed(3)} at ${rc.lagS.toFixed(3)} s`);
  check('steady noise does not', rn.peak < 0.3, `${rn.peak.toFixed(3)}`);
}
{
  const x = new Float32Array(100);
  x[3] = NaN;
  x[4] = Infinity;
  x[5] = 1e-40;
  const h = hygiene([x]);
  check('non finite and subnormal samples are counted', h.nonFinite === 2 && h.subnormal === 1, JSON.stringify(h));
}

if (failed) {
  console.log(`audio:metrics: ${failed} FAILED`);
  process.exit(1);
}
console.log('audio:metrics: all pass');
