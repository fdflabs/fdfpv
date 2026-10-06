/*
 * ratescurve-selftest.js: pin src/fc/ratescurve.js, the Rates screen's
 * preview of Betaflight's five rate curves, to the last bit. Plain Node,
 * no browser. Run with npm run ratescurve:selftest.
 *
 * fc-trace F15 checks the preview against the compiled module within a
 * tolerance; this pins the exact doubles, so a rewrite cannot drift inside
 * that tolerance unnoticed. Every rates type, the full uint8 range of each
 * field at its edges and at random, both quickrates_rc_expo settings, odd
 * rate limits and stick positions across -1..1. The digest was recorded
 * from the code this file was written to hold still; see
 * scripts/lib/transcript.js for how to read a failure.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as C from '../src/fc/ratescurve.js';
import { canon, pick, seeded, transcript } from './lib/transcript.js';

const t = transcript();
const rand = seeded(0xc0e5);

for (const name of Object.keys(C).sort()) t.note(`export ${name}`, C[name]);

const TYPES = ['BETAFLIGHT', 'RACEFLIGHT', 'KISS', 'ACTUAL', 'QUICK', 'BOGUS', undefined];
const EDGES = [0, 1, 2, 7, 37, 45, 67, 99, 100, 101, 199, 200, 201, 254, 255];
const LIMITS = [undefined, null, 0, -5, 200, 670, 1998, 2000, NaN, Infinity, '900'];
const STICKS = [-1, -0.75, -0.5, -0.25, -0.01, -0, 0, 0.01, 0.1, 0.25, 0.333, 0.5, 0.75, 0.9, 0.99, 1];

const value = () => (rand() < 0.5 ? pick(rand, EDGES) : Math.floor(rand() * 256));

for (let i = 0; i < 4000; i += 1) {
  const type = pick(rand, TYPES);
  const axis = { rcRate: value(), srate: value(), expo: rand() < 0.9 ? Math.min(100, value()) : value() };
  if (rand() < 0.5) axis.quickRcExpo = rand() < 0.5;
  if (rand() < 0.3) axis.limit = pick(rand, LIMITS);
  const sticks = rand() < 0.5 ? STICKS : [pick(rand, STICKS), rand() * 2 - 1, rand() * 2 - 1];
  for (const stick of sticks) {
    t.rec(`${type} ${canon(axis)} ${canon(stick)}`, () => C.angleRateDeg(type, axis, stick));
  }
}

// The sweep the Rates screen draws, for the stock and touch profiles.
for (const type of TYPES.slice(0, 5)) {
  for (const axis of [{ rcRate: 7, srate: 67, expo: 0 }, { rcRate: 6, srate: 45, expo: 25 }, { rcRate: 100, srate: 70, expo: 0 }]) {
    for (let k = 0; k <= C.ANGLE_RATE_SAMPLES; k += 1) {
      const stick = -1 + (2 * k) / C.ANGLE_RATE_SAMPLES;
      t.rec(`sweep ${type} ${canon(axis)} ${k}`, () => C.angleRateDeg(type, axis, stick));
    }
  }
}

t.finish('src/fc/ratescurve.js', '59a8eb3574d7187dc659f182313ddd19d105c0d7cb26131064cdd50468863f09');
