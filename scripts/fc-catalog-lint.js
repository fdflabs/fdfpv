/*
 * fc-catalog-lint.js: the FC catalog (src/fc/catalog.js) must agree with the
 * firmware. Fails on a Betaflight 4.5.1 valueTable key missing from the
 * catalog, a LIVE catalog key our bf_settings.c does not write, a status
 * that lies, a missing required tab, or a stale generated
 * src/fc/catalog-data.js. Run with npm run lint:catalog.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ABSENT_FIELDS, APPLIED_INERT_KEYS, FIELDS, GATED_KEYS, STATUS, TABS, catalogCounts,
} from '../src/fc/catalog.js';
import { CATALOG_DATA, renderCatalogData } from './fc-catalog-gen.js';
import { loadFirmwareTables } from './fc-valuetable.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_TABS = [
  'setup', 'ports', 'configuration', 'pid', 'receiver', 'modes', 'adjustments', 'servos', 'motors', 'osd',
  'vtx', 'led', 'gps', 'failsafe', 'blackbox', 'blackbox-viewer', 'power', 'presets', 'cli', 'flasher',
  'autotune', 'flight-plan', 'cloud-profile', 'cloud-backups',
];

/* A key the module stores but the catalog greys as INERT is a lie to the
 * pilot, so bf_settings.c keys may only carry these. */
const STORED_STATUSES = new Set(['LIVE', 'GATED', 'APPLIED_INERT']);

const blank = (value) => value == null || String(value).trim() === '';
const validStatus = (s) => Object.hasOwn(STATUS, s) && STATUS[s] === s;

const { table, live } = await loadFirmwareTables(root);
const liveSet = new Set(live);
const tableKeys = new Set(table.map((row) => row.key));
const catalogCli = FIELDS.filter((f) => !f.key.startsWith('#'));
const cliKeys = new Set(catalogCli.map((f) => f.key));
const byKey = new Map();
for (const f of FIELDS) {
  if (!byKey.has(f.key)) {
    byKey.set(f.key, f);
  }
}

const failures = [];
const fail = (message) => failures.push(message);

for (const row of table) {
  if (!cliKeys.has(row.key)) {
    fail(`valueTable key missing from catalog: ${row.key}`);
  }
}
for (const f of catalogCli) {
  if (!tableKeys.has(f.key) && !liveSet.has(f.key)) {
    fail(`catalog CLI key is neither valueTable nor bf_settings: ${f.key}`);
  }
}
for (const f of FIELDS) {
  if (!validStatus(f.status)) {
    fail(`${f.key}: bad status ${f.status}`);
  }
  if (f.status !== 'LIVE' && blank(f.reason)) {
    fail(`${f.key}: ${f.status} is missing a reason string`);
  }
}
for (const f of FIELDS) {
  if (f.status === 'LIVE' && !liveSet.has(f.key)) {
    fail(`LIVE catalog key missing from bf_settings.c: ${f.key}`);
  }
}
for (const [keys, want] of [[GATED_KEYS, 'GATED'], [APPLIED_INERT_KEYS, 'APPLIED_INERT']]) {
  for (const key of keys) {
    const f = byKey.get(key);
    if (!f) {
      fail(`${want} key missing from catalog: ${key}`);
    } else if (f.status !== want) {
      fail(`${key}: expected ${want}, got ${f.status}`);
    }
    if (!liveSet.has(key)) {
      fail(`${want} key missing from bf_settings.c: ${key}`);
    }
  }
}
for (const key of liveSet) {
  const f = byKey.get(key);
  if (!f) {
    fail(`bf_settings.c key missing from catalog: ${key}`);
  } else if (!STORED_STATUSES.has(f.status)) {
    fail(`bf_settings.c key ${key} is catalogued ${f.status}; must be LIVE, GATED, or APPLIED_INERT`);
  }
}
const tabIds = new Set(TABS.map((t) => t.id));
for (const id of REQUIRED_TABS) {
  if (!tabIds.has(id)) {
    fail(`required tab missing: ${id}`);
  }
}
for (const t of TABS) {
  if (t.grey && blank(t.reason)) {
    fail(`grey tab ${t.id} is missing a reason string`);
  }
}
if (ABSENT_FIELDS.length === 0) {
  fail('ABSENT_FIELDS is empty; Configurator chrome must be catalogued');
}

const committed = await readFile(join(root, CATALOG_DATA), 'utf8');
const { text: generated } = await renderCatalogData(root);
if (committed !== generated) {
  fail(`${CATALOG_DATA} differs from what npm run gen:catalog writes; regenerate it`);
}

const counts = catalogCounts();
const summary = [
  ['valueTable keys', table.length],
  ['bf_settings.c keys', live.length],
  ['catalog CLI keys', catalogCli.length],
  ['LIVE', counts.LIVE],
  ['GATED', counts.GATED],
  ['APPLIED_INERT', counts.APPLIED_INERT],
  ['INERT', counts.INERT],
  ['ABSENT', counts.ABSENT],
  ['tabs', TABS.length],
];

console.log('fc-catalog-lint: 4.5.1 valueTable against src/fc/catalog.js\n');
for (const [label, value] of summary) {
  console.log(`  ${label.padEnd(20)}${value}`);
}

if (failures.length > 0) {
  console.log(`\n${failures.length} failure(s):`);
  for (const message of failures) {
    console.log(`  FAIL  ${message}`);
  }
  process.exit(1);
}
console.log('\nok  catalog covers valueTable, LIVE keys are in bf_settings.c');
