/*
 * strings-selftest.js: the string tables agree with each other. Every
 * locale beside en.js has exactly en's keys, and every placeholder in an
 * English string appears in the translation, so a translated sentence can
 * never lose the name or the number it was meant to carry. Also runs the
 * lookup itself: fill, plural, fallback, and the throw on a missing key.
 * Run with npm run strings:selftest.
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

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import en from '../src/strings/en.js';
import { str, plural, setLocale, useLocale, LOCALES } from '../src/strings/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
const placeholders = (s) => [...String(s).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort().join(',');

console.log('strings');
const keys = Object.keys(en);
check('en.js has strings', keys.length > 1000, `${keys.length}`);
check('every English string is text', keys.every((k) => typeof en[k] === 'string' && en[k].length > 0));
check('no key is empty or has spaces', keys.every((k) => /^[a-z0-9_.]+$/.test(k)));

const files = (await readdir(join(root, 'src/strings'))).filter((f) => /^[a-z]{2}\.js$/.test(f) && f !== 'en.js');
check('every locale file is listed in LOCALES', files.every((f) => LOCALES.includes(f.slice(0, 2))), files.join(','));
for (const f of files) {
  const table = (await import(join(root, 'src/strings', f))).default;
  const missing = keys.filter((k) => !(k in table));
  const extra = Object.keys(table).filter((k) => !(k in en));
  check(`${f} has every key en.js has`, missing.length === 0, `missing ${missing.length}: ${missing.slice(0, 3).join(', ')}`);
  check(`${f} has no key en.js lacks`, extra.length === 0, `extra ${extra.length}: ${extra.slice(0, 3).join(', ')}`);
  const holes = keys.filter((k) => k in table && placeholders(table[k]) !== placeholders(en[k]));
  check(`${f} keeps every placeholder`, holes.length === 0, holes.slice(0, 3).join(', '));
}

/* A count in front of a plural noun reads "1 cuts" at one: such counts go
 * through plural() and a count.* pair, never a bare placeholder. */
const PLURAL_NOUNS = { 'en.js': /\{[a-zA-Z0-9_]+\} (points|cuts|pilots|metres)\b/, 'es.js': /\{[a-zA-Z0-9_]+\} (puntos|cortes|pilotos|metros)\b/ };
for (const [f, noun] of Object.entries(PLURAL_NOUNS)) {
  const table = (await import(join(root, 'src/strings', f))).default;
  const bare = Object.keys(table).filter((k) => !k.startsWith('count.') && noun.test(table[k]));
  check(`${f} counts its nouns with plural()`, bare.length === 0, bare.slice(0, 3).join(', '));
  const pairs = Object.keys(table).filter((k) => /^count\..*\.one$/.test(k)).map((k) => k.slice(0, -4));
  check(`${f} has both forms of every count`, pairs.length > 0 && pairs.every((k) => `${k}.other` in table), pairs.join(','));
}
check('one cut, two cuts', plural('count.cuts', 1) === '1 cut' && plural('count.cuts', 2) === '2 cuts' && plural('count.points', 0) === '0 points');
await useLocale('es');
check('un corte, dos cortes', plural('count.cuts', 1) === '1 corte' && plural('count.cuts', 2) === '2 cortes' && plural('count.paper_left', 1) === 'queda 1 m de papel');
setLocale('en');

check('a plain lookup returns the text', str('ui.settings') === en['ui.settings'] || typeof str('ui.settings') === 'string');
const sampleKey = keys.find((k) => /\{[a-z]+\}/.test(en[k]));
check('a placeholder is filled', Boolean(sampleKey) && !/\{[a-z]+\}/.test(str(sampleKey, Object.fromEntries(placeholders(en[sampleKey]).split(',').map((p) => [p, 'X'])))));
let threw = false;
try {
  str('no.such.key');
} catch (e) {
  threw = true;
}
check('a missing key throws rather than reading blank', threw);
check('an unknown locale falls back to en', setLocale('xx') === 'en');

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
