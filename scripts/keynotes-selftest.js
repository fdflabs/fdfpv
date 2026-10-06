/*
 * keynotes-selftest.js: pin src/fc/keynotes.js, the sentence the FC screen
 * shows beside each setting. Plain Node, no browser. Run with
 * npm run keynotes:selftest.
 *
 * Records which note every catalog key gets, the fallback for keys with no
 * written sentence, and hasKeyNote. String-table entries are swapped for
 * their key plus the placeholders the English carries before anything
 * loads, so the record says which sentence was chosen and what was filled
 * into it, and a copy edit in src/strings does not move the digest. The
 * digest was recorded from the code this file was written to hold still;
 * see scripts/lib/transcript.js for how to read a failure.
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

import en from '../src/strings/en.js';
import { canon, transcript } from './lib/transcript.js';

for (const key of Object.keys(en)) {
  const slots = (en[key].match(/\{[a-z0-9_]+\}/gi) ?? []).join('|');
  en[key] = `<${key}${slots ? `|${slots}` : ''}>`;
}
const K = await import('../src/fc/keynotes.js');
const { FIELDS } = await import('../src/fc/catalog.js');

const t = transcript();

for (const name of Object.keys(K).sort()) t.note(`export ${name}`, K[name]);

for (const f of FIELDS) {
  t.rec(`keyNote ${f.key}`, () => K.keyNote(f));
  t.rec(`hasKeyNote ${f.key}`, () => K.hasKeyNote(f.key));
}

const SYNTHETIC = [
  null, undefined, {}, { key: '' }, { key: 'p_roll' }, { key: 'p_rolls' }, { key: 'xp_roll' }, { key: 'roll_srate' },
  { key: 'something_expo' }, { key: 'throttle_boost_cutoff' }, { key: 'simplified_anything' }, { key: 'idle_min_rpm' },
  { key: 'dshot_idle_value' }, { key: 'thrust_linear_x' }, { key: 'unknown_key' },
  { key: 'unknown_key', lookup: 'OFF_ON' }, { key: 'unknown_key', min: 0, max: 100 },
  { key: 'unknown_key', min: 0, max: 100, units: 'Hz' }, { key: 'unknown_key', min: '0', max: '100' },
  { key: 'unknown_key', min: -5, max: NaN }, { key: 'unknown_key', min: 1.5, max: Infinity, units: '%' },
  { key: 'unknown_key', lookup: '', min: 3, max: 9, units: '' },
];
for (const f of SYNTHETIC) {
  t.rec(`keyNote ${canon(f)}`, () => K.keyNote(f));
  if (f) t.rec(`genericNote ${canon(f)}`, () => K.genericNote(f));
}
for (const key of [undefined, null, '', 0, 'p_roll', 'P_ROLL', 'yaw_lowpass_hz', 'a_srate', 'nothing']) {
  t.rec(`hasKeyNote ${canon(key)}`, () => K.hasKeyNote(key));
}

t.finish('src/fc/keynotes.js', '697f867e5b99ceabf26be2894b769c40c147cd737f51d722ae5421761eed508e');
