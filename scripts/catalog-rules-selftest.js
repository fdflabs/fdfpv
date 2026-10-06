/*
 * catalog-rules-selftest.js: pin everything src/fc/catalog.js exports, the
 * status, tab, page, units, reason, bounds and lookups the FC screen shows
 * for every Betaflight key. Plain Node, no browser. Run with
 * npm run catalog-rules:selftest.
 *
 * lint:catalog proves the catalog covers the firmware and that its
 * statuses are honest; this pins the exact answer for each key, so the
 * rules can be restructured without a key moving tab, changing reason or
 * gaining a dropdown. Every string-table entry is swapped for its own key
 * before the catalog loads, so reasons and labels are recorded as the key
 * they name and a copy edit in src/strings does not move the digest. The
 * digest was recorded from the code this file was written to hold still;
 * see scripts/lib/transcript.js for how to read a failure.
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

import en from '../src/strings/en.js';
import { transcript } from './lib/transcript.js';

for (const key of Object.keys(en)) en[key] = `<${key}>`;
const C = await import('../src/fc/catalog.js');

const t = transcript();

for (const name of Object.keys(C).sort()) t.note(`export ${name}`, C[name]);

const keys = [...C.FIELDS.map((f) => f.key), 'bogus_key', '', 'osd_new_thing', 'name', 'rpm_filter_weights'];
for (const key of keys) {
  t.rec(`field ${key}`, () => C.field(key));
  t.rec(`status ${key}`, () => C.status(key));
  t.rec(`fieldEnabled ${key}`, () => C.fieldEnabled({ key }));
}
for (const f of C.FIELDS) {
  t.rec(`fieldBounds ${f.key}`, () => C.fieldBounds(f));
  t.rec(`lookupValues ${f.lookup}`, () => C.lookupValues(f.lookup));
}
const SYNTHETIC = [
  { type: 'UINT8' }, { type: 'UINT16' }, { type: 'INT8' }, { type: 'INT16' }, { type: 'UINT32' }, { type: null },
  { type: 'UINT8', min: '-5', max: '300' }, { type: 'INT16', min: 'PID_GAIN_MAX', max: 'UINT16_MAX' },
  { type: 'UINT8', min: '', max: null }, { type: 'UINT8', min: '1.5', max: '0x10' },
  { type: 'UINT8', min: 'NOT_A_MACRO', max: 'toString' }, { type: 'UINT8', min: '-0', max: ' 7' },
];
for (const f of SYNTHETIC) t.rec(`fieldBounds ${JSON.stringify(f)}`, () => C.fieldBounds(f));
for (const name of [...Object.keys(C.LOOKUPS), 'ALIGNMENT', 'BOGUS', null, undefined, 'toString']) {
  t.rec(`lookupValues ${name}`, () => C.lookupValues(name));
}
for (const tab of [...C.TABS.map((x) => x.id), 'bogus']) t.rec(`tabFields ${tab}`, () => C.tabFields(tab).map((f) => f.key));
t.rec('catalogCounts', () => C.catalogCounts());

t.finish('src/fc/catalog.js', '321776d5cabaf5ef122ce77c762c9127e661d20a8a804a6db564bd3d2e19aa84');
