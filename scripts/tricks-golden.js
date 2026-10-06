/*
 * tricks-golden.js: src/game/tricks.js held to the exact outputs it gave
 * when tests/fixtures/tricks-golden.json was written. npm run tricks:golden.
 *
 * score-selftest already checks the catalogue against the workbook name for
 * name and point for point. This pins the rest of what a caller can see:
 * every exported table in full (key order included), in English and in
 * Spanish, because the names are looked up in the string table when the
 * tables are built and a rewrite must look up the same ones; and every helper
 * over a spread of arguments that includes the awkward ones (negative,
 * fractional, NaN, past the end of a table, a name the catalogue lacks).
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Stream, goldenMain } from './lib/golden.js';
import { useLocale } from '../src/strings/index.js';

const FIXTURE = new URL('../tests/fixtures/tricks-golden.json', import.meta.url);

/*
 * The string table is read when the tables are built, so the locale has to
 * be set before the module is first imported, and a module is imported once
 * per process. The Spanish cases therefore run in a child process that
 * switches locale first and prints its streams back.
 */
const CHILD = process.env.TRICKS_GOLDEN_LOCALE;
if (CHILD) await useLocale(CHILD);
const m = await import('../src/game/tricks.js');

const NUMBERS = [-1, -0, 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 17, 18, 20, 21, 22, 30, 50, 100,
  1e9, Infinity, -Infinity, NaN, undefined, null, '2'];

function tables(m) {
  const out = {};
  for (const k of Object.keys(m).sort()) {
    if (typeof m[k] !== 'function') out[k] = m[k];
  }
  return out;
}

function helpers(s, m) {
  s.say('exports', Object.keys(m).sort().map((k) => `${k}:${typeof m[k]}`));
  const names = m.trickNames();
  s.say('trickNames', names);
  for (const name of [...names, 'Not A Trick', '', undefined]) {
    s.call(`trickByName(${String(name)})`, () => m.trickByName(name));
    s.call(`trickPoints(${String(name)})`, () => m.trickPoints(name));
  }
  for (const n of NUMBERS) {
    const tag = typeof n === 'string' ? `'${n}'` : String(n);
    s.call(`repeatTrickFactor(${tag})`, () => m.repeatTrickFactor(n));
    s.call(`backToBackFactor(${tag})`, () => m.backToBackFactor(n));
    s.call(`repeatObstacleFactor(${tag})`, () => m.repeatObstacleFactor(n));
    s.call(`obstacleBonusMultiplier(${tag})`, () => m.obstacleBonusMultiplier(n));
  }
}

function spanish(id) {
  return (s) => {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      encoding: 'utf8', env: { ...process.env, TRICKS_GOLDEN_LOCALE: 'es' }, maxBuffer: 64 << 20,
    });
    if (r.status !== 0) throw new Error(`tricks-golden: the Spanish child failed: ${r.stderr}`);
    s.lines.push(...JSON.parse(r.stdout)[id]);
  };
}

if (CHILD) {
  const out = {};
  for (const [id, run] of [['tables', (s) => s.say('tables', tables(m))], ['helpers', (s) => helpers(s, m)]]) {
    const s = new Stream();
    run(s);
    out[id] = s.lines;
  }
  process.stdout.write(JSON.stringify(out));
} else {
  goldenMain('tricks:golden', FIXTURE, [
    { id: 'tables-en', run: (s) => s.say('tables', tables(m)) },
    { id: 'tables-es', run: spanish('tables') },
    { id: 'helpers-en', run: (s) => helpers(s, m) },
    { id: 'helpers-es', run: spanish('helpers') },
  ]);
}
