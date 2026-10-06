/*
 * fc-catalog-gen.js: build src/fc/catalog-data.js, the FC screen's table of
 * every Betaflight 4.5.1 CLI key, from vendor/betaflight and bf_settings.c.
 *
 * catalog-data.js holds firmware facts and nothing we decide, so it is
 * never edited by hand: change bf_settings.c, or the status rules in
 * src/fc/catalog.js, and run npm run gen:catalog. lint:catalog renders the
 * file again and fails when the committed copy differs.
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

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadFirmwareTables } from './fc-valuetable.js';

export const CATALOG_DATA = 'src/fc/catalog-data.js';

/*
 * bf_settings.c may write keys the valueTable lacks. The only ones allowed
 * are the expanded rpm_filter_weights_1..3, which patches/0001 adds and
 * which live in RPM_FILTER_CONFIG. Any other stray key stops the build,
 * because giving it a parameter group is a decision, and a typo in
 * bf_settings.c would otherwise look like a complete catalog.
 */
const EXTRA_KEY = /^rpm_filter_weights_[123]$/;
const extraRow = (key) => ({
  key, type: 'UINT8', lookup: null, pg: 'RPM_FILTER_CONFIG', min: null, max: null, array: false,
});

const HEADER = `/*
 * catalog-data.js: generated from vendor/betaflight 4.5.1 (the CLI
 * valueTable, its lookup tables and the integer macros its bounds name)
 * and src/native/bf/bf_settings.c by scripts/fc-catalog-gen.js. Do not
 * edit; run npm run gen:catalog. VALUE_TABLE has one key per line, in
 * valueTable order, then the keys only bf_settings.c writes.
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
`;

// Returns the file text and the counts the CLI prints.
export async function renderCatalogData(root) {
  const { table, live, lookups, defines } = await loadFirmwareTables(root);
  const writes = new Set(live);
  const known = new Set(table.map((r) => r.key));
  const extras = live.filter((k) => !known.has(k));
  const stray = extras.filter((k) => !EXTRA_KEY.test(k));
  if (stray.length) {
    throw new Error(
      `fc-catalog-gen: bf_settings.c writes ${stray.join(', ')}, which the valueTable does not `
      + 'have and which is not an rpm_filter_weights key. Decide its parameter group here.',
    );
  }
  const rows = [...table, ...extras.map(extraRow)].map((r) => ({ ...r, live: writes.has(r.key) }));
  const lines = (entries) => entries.map((e) => `  ${e},\n`).join('');
  const text = `${HEADER}\nexport const VALUE_TABLE = [\n${lines(rows.map((r) => JSON.stringify(r)))}];\n`
    + `\nexport const FIRMWARE_LOOKUPS = {\n${lines(Object.entries(lookups).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`))}};\n`
    + `\nexport const FIRMWARE_BOUNDS = {\n${lines(Object.entries(defines).map(([k, v]) => `${JSON.stringify(k)}: ${v}`))}};\n`;
  return { text, keys: rows.length, table: table.length, extras: extras.length, live: writes.size };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const out = await renderCatalogData(root);
  await writeFile(join(root, CATALOG_DATA), out.text, 'utf8');
  console.log(
    `fc-catalog-gen: ${out.keys} keys (${out.table} valueTable, ${out.extras} bf_settings only), `
    + `${out.live} live, written to ${CATALOG_DATA}`,
  );
}
