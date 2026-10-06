/*
 * fc-catalog-selftest.js: pin what the FC catalog data and the firmware
 * table loader produce, so the generator behind them can be replaced
 * without the FC screen seeing a different table. Plain Node, no browser.
 * Run with npm run fc-catalog:selftest.
 *
 * The pins are digests of the exact structures, key order included,
 * because src/fc/catalog.js maps VALUE_TABLE in order and src/ui/fc.js
 * shows it in that order. A few rows are also spelled out, chosen for the
 * firmware entries that are easiest to parse wrongly: an expression as a
 * bound, a 32-bit field, a string field, and the extras that only
 * bf_settings.c carries. When Betaflight or bf_settings.c changes on
 * purpose, regenerate the catalog and update the digests in the same
 * commit, with the reason.
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

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIRMWARE_BOUNDS, FIRMWARE_LOOKUPS, VALUE_TABLE } from '../src/fc/catalog-data.js';
import { loadFirmwareTables } from './fc-valuetable.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const PINS = [
  ['VALUE_TABLE rows', VALUE_TABLE.length, 686],
  ['VALUE_TABLE digest', digest(VALUE_TABLE), 'fbbbbdd81f877479c66e62b0f231f6c2447cce8f7d35de4cf005d6573ea613c5'],
  ['FIRMWARE_LOOKUPS tables', Object.keys(FIRMWARE_LOOKUPS).length, 57],
  ['FIRMWARE_LOOKUPS digest', digest(FIRMWARE_LOOKUPS), 'ac41cdf8c82d626025c521325b9dba49015c3cba6c652e7ee6e5621736a91be5'],
  ['FIRMWARE_BOUNDS macros', Object.keys(FIRMWARE_BOUNDS).length, 66],
  ['FIRMWARE_BOUNDS digest', digest(FIRMWARE_BOUNDS), 'ecad8ca36388e5fca9c415abb2af567e6bc8d91144a9a507b95e3c85a018c3c4'],
];

const fw = await loadFirmwareTables(root);
PINS.push(
  ['parameter names', fw.names.size, 172],
  ['parameter names digest', digest([...fw.names]), '60710925b3476b9db67be763fe35f4a6e5296e9f505ecd785245b5938eb161b0'],
  ['valueTable rows', fw.table.length, 683],
  ['valueTable digest', digest(fw.table), '6d98b0082689f96bbfbccc50a071bfe5160579d8ea82263e5d116aad72c8cfa5'],
  ['bf_settings keys', fw.live.length, 186],
  ['bf_settings digest', digest(fw.live), '3dec169e9c4e735d2b8fb2338e52729d84e8933b9d46160176c6b3abfcc9ccf3'],
);

const row = (key, type, lookup, pg, min, max, live) => ({ key, type, lookup, pg, min, max, array: false, live });
const SPOT = [
  row('gyro_lpf1_static_hz', 'UINT16', null, 'GYRO_CONFIG', '0', 'LPF_MAX_HZ', true),
  row('gyro_offset_yaw', 'INT16', null, 'GYRO_CONFIG', '-1000', '1000', false),
  row('failsafe_recovery_delay', 'UINT16', null, 'FAILSAFE_CONFIG', '1', '200', true),
  row('gps_lap_timer_gate_lat', 'UINT8', null, 'GPS_LAP_TIMER', null, null, false),
  row('craft_name', 'UINT8', null, 'PILOT_CONFIG', null, null, false),
  row('vtx_power', 'UINT8', 'MAX_POWER_LEVELS', 'VTX_SETTINGS_CONFIG', '0', 'VTX_TABLE_MAX_POWER_LEVELS - 1', false),
  row('rpm_filter_weights_3', 'UINT8', null, 'RPM_FILTER_CONFIG', null, null, true),
];

const failures = [];
for (const [what, got, want] of PINS) {
  if (got !== want) failures.push(`${what}: got ${got}, pinned ${want}`);
}
for (const want of SPOT) {
  const got = VALUE_TABLE.find((r) => r.key === want.key);
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failures.push(`${want.key}: got ${JSON.stringify(got)}, pinned ${JSON.stringify(want)}`);
  }
}

if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  process.exit(1);
}
console.log(`ok  fc catalog: ${PINS.length} pins and ${SPOT.length} rows match`);
