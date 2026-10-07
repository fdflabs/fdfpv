/*
 * format-golden.js: the shell's clock and date formatting
 * (src/ui/format.js) held to a record taken from the functions as they
 * stood inside src/ui/ui.js.
 *
 *     node scripts/format-golden.js            compare
 *     node scripts/format-golden.js --record   write tests/fixtures/format-golden.json
 *
 * FORMAT_MODULE names another module exporting the same functions, which
 * is how the record was taken from the old code before the move. Every
 * clock shape is driven across its edges: zero, rounding at hundredths
 * and at whole seconds, the minute boundary, negatives, the non-numbers.
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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* A date's day depends on the zone it is read in; the record is UTC's. */
process.env.TZ = 'UTC';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'tests', 'fixtures', 'format-golden.json');
const RECORD = process.argv.includes('--record');
const target = process.env.FORMAT_MODULE ? pathToFileURL(resolve(process.env.FORMAT_MODULE)).href : '../src/ui/format.js';
const f = await import(target);
const { useLocale } = await import('../src/strings/index.js');

const ms = [
  0, -0, 1, 4, 5, 6, 9, 10, 994, 995, 996, 999, 1000, 1001, 1004.9, 1005, 9994, 9995, 9999, 10000,
  59000, 59994, 59995, 59999, 60000, 60001, 61234, 69995, 119999, 120000, 599999, 600000, 3599999, 3600000, 7322100,
  -1, -999, -1000, -1001, -61234, 0.4, 0.5, 1e12, NaN, Infinity, -Infinity, null, undefined, '61234', '', true,
];
const label = (v) => (typeof v === 'number' ? (Object.is(v, -0) ? '-0' : String(v)) : JSON.stringify(v) ?? 'undefined');
const out = {
  formatTime: ms.map((v) => [label(v), f.formatTime(v)]),
  formatRunClock: ms.map((v) => [label(v), f.formatRunClock(v)]),
  formatDelta: ms.map((v) => [label(v), f.formatDelta(v)]),
};
const days = ['2026-10-06T12:00:00Z', '2026-01-01T00:00:00Z', '1999-12-31T23:00:00Z', 1759752000000, 0, 'nonsense', null, undefined, NaN];
out.formatDayEn = days.map((d) => [label(d), f.formatDay(d)]);
await useLocale('es');
out.formatDayEs = days.map((d) => [label(d), f.formatDay(d)]);

if (RECORD) {
  writeFileSync(FILE, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ${FILE}`);
  process.exit(0);
}
if (!existsSync(FILE)) {
  console.log(`FAIL no record at ${FILE}`);
  process.exit(1);
}
const want = JSON.parse(readFileSync(FILE, 'utf8'));
const bad = [];
for (const k of Object.keys({ ...want, ...out })) {
  (want[k] || []).forEach((row, i) => {
    if (JSON.stringify(row) !== JSON.stringify((out[k] || [])[i])) bad.push(`${k}(${row[0]}): ${JSON.stringify(row[1])} vs ${JSON.stringify(((out[k] || [])[i] || [])[1])}`);
  });
}
if (bad.length) {
  console.log(`FAIL ${bad.length} value(s) differ:\n  ${bad.slice(0, 12).join('\n  ')}`);
  process.exit(1);
}
console.log(`ok ${Object.values(out).reduce((n, a) => n + a.length, 0)} values equal to the record`);
