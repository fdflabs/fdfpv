/*
 * rates-selftest.js: pin everything configs/rates.js exports, over a fixed
 * corpus of well formed, out of range and malformed rate profiles. Plain
 * Node, no browser. Run with npm run rates:selftest.
 *
 * The rate profile is stored in the pilot's settings and written into the
 * module as CLI text, so a change in how a profile is clamped, migrated or
 * printed is a change in what a pilot flies. The digest below was recorded
 * from the code this file was written to hold still; see
 * scripts/lib/transcript.js for how to read a failure.
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

import * as R from '../configs/rates.js';
import { canon, pick, seeded, transcript } from './lib/transcript.js';

const t = transcript();
const rand = seeded(0x5a7e5);

for (const name of Object.keys(R).sort()) t.note(`export ${name}`, R[name]);

const TYPES = [...R.RATE_TYPES, 'BOGUS', undefined, null, 'actual'];
const KEYS = [...R.RATE_FIELDS, 'thrMid', 'thrExpo', 'nope', undefined];
const VALUES = [undefined, null, NaN, Infinity, -Infinity, -5, -0, 0, 0.4, 0.5, 1, 6.5, 7, 37.5, 45,
  67, 99, 100, 100.5, 101, 199, 200, 254.5, 255, 256, 670, 1000, '50', ' 7 ', 'abc', true, [], {}];
const AXES = [...R.RATE_AXES, 'bogus', undefined];
// A fixed list rather than AIRFRAME_IDS, so adding an aircraft elsewhere
// does not move this digest.
const AIRFRAMES = [undefined, 'interceptor', 'striker2500', '7inch', '10inch', 'bogus', null];

const randomAxis = () => {
  if (rand() < 0.08) return pick(rand, [undefined, null, 5, 'x', []]);
  const a = {};
  for (const k of R.RATE_FIELDS) if (rand() < 0.9) a[k] = pick(rand, VALUES);
  return a;
};
const randomProfile = () => {
  if (rand() < 0.04) return pick(rand, [undefined, null, 7, 'ACTUAL', [], true]);
  const p = {};
  if (rand() < 0.9) p.type = pick(rand, TYPES);
  for (const axis of R.RATE_AXES) if (rand() < 0.9) p[axis] = randomAxis();
  for (const k of ['throttleCap', 'thrMid', 'thrExpo']) {
    if (rand() < 0.7) p[k] = pick(rand, [...VALUES, ...R.THROTTLE_CAP_CHOICES, 33, 72, 77, 85, 95, 45, 55]);
  }
  return p;
};

const profiles = [R.RATE_DEFAULTS, R.TOUCH_RATE_DEFAULTS, {}, undefined, null];
for (let i = 0; i < 600; i += 1) profiles.push(randomProfile());
for (const type of R.RATE_TYPES) profiles.push(R.profileForType(type, {}));

profiles.forEach((p, i) => {
  const before = canon(p);
  const tag = `p${i} ${before}`;
  t.rec(`normaliseRates ${tag}`, () => R.normaliseRates(p));
  t.rec(`ratesAreDefault ${tag}`, () => R.ratesAreDefault(p));
  t.rec(`pitchMatchesRoll ${tag}`, () => R.pitchMatchesRoll(p));
  t.rec(`ratesDiff ${tag}`, () => R.ratesDiff(p));
  t.rec(`ratesSummary ${tag}`, () => R.ratesSummary(p));
  for (const axis of AXES) {
    t.rec(`rateAxis ${tag} ${axis}`, () => R.rateAxis(p, axis));
    t.rec(`fullStickDeg ${tag} ${axis}`, () => R.fullStickDeg(p, axis));
  }
  t.rec(`throttleSummary ${tag}`, () => R.throttleSummary(p));
  t.rec(`throttleSummary ${tag} ${AIRFRAMES[i % AIRFRAMES.length]}`, () => R.throttleSummary(p, AIRFRAMES[i % AIRFRAMES.length]));
  t.rec(`profileForType ${tag} ${TYPES[i % TYPES.length]}`, () => R.profileForType(TYPES[i % TYPES.length], p));
  t.rec(`unmutated ${tag}`, () => canon(p) === before);
});

// A result is the caller's to change: it must not write through into the
// next call or the defaults.
t.rec('fresh result', () => {
  const a = R.normaliseRates(R.RATE_DEFAULTS);
  a.roll.rcRate = 99;
  a.type = 'KISS';
  const b = R.profileForType('ACTUAL', {});
  b.roll.srate = 1;
  return [R.normaliseRates(R.RATE_DEFAULTS), R.profileForType('ACTUAL', {}), R.RATE_DEFAULTS];
});

const legacyKeys = ['rateMax', 'rateYawMax', 'rateCentre', 'rateExpo', 'throttleCap'];
const legacy = [undefined, null, 5, 'x', {}, { other: 1 }, { rateMax: 900, rateExpo: 20 }];
for (let i = 0; i < 300; i += 1) {
  const s = {};
  for (const k of legacyKeys) if (rand() < 0.6) s[k] = pick(rand, [...VALUES, 900, 1400, 350, 140, 20, 60]);
  legacy.push(s);
}
for (const s of legacy) t.rec(`ratesFromLegacy ${canon(s)}`, () => R.ratesFromLegacy(s));

for (const type of TYPES) {
  for (const key of KEYS) {
    t.rec(`rateField ${type} ${key}`, () => R.rateField(type, key));
    const spec = R.rateField(type, key);
    for (const v of VALUES) {
      t.rec(`cliOf ${type} ${key} ${canon(v)}`, () => R.cliOf(spec, v));
      t.rec(`formatRate ${type} ${key} ${canon(v)}`, () => R.formatRate(spec, v));
    }
  }
}
for (const spec of Object.values(R.THROTTLE_CURVE_FIELDS)) {
  for (const v of VALUES) t.rec(`cliOf throttle ${spec.label} ${canon(v)}`, () => R.cliOf(spec, v));
}

for (const af of AIRFRAMES) {
  for (const cap of [...VALUES, ...R.THROTTLE_CAP_CHOICES, 33, 72, 77, 85, 95, 45, 55, 62.5, 67.5]) {
    t.rec(`hoverStickPercent ${canon(cap)} ${af}`, () => R.hoverStickPercent(cap, af));
  }
}

t.finish('configs/rates.js', 'f77301103a709957cbd8066cda730daa212c53a12c565a6b65c77cfe8995e824');
