/*
 * trickslist-golden.js: the Tricks screen's list (src/ui/trickslist.js)
 * held to a record taken from the functions as they stood inside
 * src/ui/ui.js.
 *
 *     node scripts/trickslist-golden.js            compare
 *     node scripts/trickslist-golden.js --record   write tests/fixtures/trickslist-golden.json
 *
 * TRICKSLIST_MODULE names another module exporting the same functions,
 * which is how the record was taken from the old code before the move.
 * Recorded in English and Spanish: the whole list in order, each trick's
 * status line, and the count.
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

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'tests', 'fixtures', 'trickslist-golden.json');
const RECORD = process.argv.includes('--record');
const target = process.env.TRICKSLIST_MODULE ? pathToFileURL(resolve(process.env.TRICKSLIST_MODULE)).href : '../src/ui/trickslist.js';
/* The trick sheet reads the string table when it loads, as the page loads
 * it after taking the pilot's language (src/boot.js), so each language is
 * taken in its own process before the list module is imported. */
const CHILD = process.env.TRICKSLIST_GOLDEN_LOCALE;
const { useLocale } = await import('../src/strings/index.js');
if (CHILD) await useLocale(CHILD);
const t = await import(target);

function snapshot() {
  const list = t.scoreableTricks();
  return {
    list,
    status: list.map((x) => t.trickStatus(x)),
    edge: [{ proven: { landed: 3, runs: 3 } }, { proven: { landed: 4, runs: 3 } }, { proven: { landed: 2, runs: 3 } }, { proven: { landed: 0, runs: 0 } }].map((x) => t.trickStatus(x)),
    count: t.countScoreableTricks(),
  };
}
if (CHILD) {
  process.stdout.write(JSON.stringify(snapshot()), () => process.exit(0));
  await new Promise(() => {});
}
const take = (locale) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
  encoding: 'utf8', env: { ...process.env, TRICKSLIST_GOLDEN_LOCALE: locale }, maxBuffer: 64 << 20,
}));
const got = { en: take('en'), es: take('es') };
if (RECORD) {
  writeFileSync(FILE, `${JSON.stringify(got, null, 1)}\n`);
  console.log(`wrote ${FILE}`);
  process.exit(0);
}
if (!existsSync(FILE)) {
  console.log(`FAIL no record at ${FILE}`);
  process.exit(1);
}
const want = JSON.parse(readFileSync(FILE, 'utf8'));
const bad = [];
for (const lang of ['en', 'es']) {
  for (const k of Object.keys({ ...want[lang], ...got[lang] })) {
    if (JSON.stringify(want[lang][k]) !== JSON.stringify(got[lang][k])) bad.push(`${lang}.${k}`);
  }
}
if (bad.length) {
  console.log(`FAIL ${bad.length} part(s) differ: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`ok ${got.en.count} tricks in two languages equal to the record`);
