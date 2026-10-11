/*
 * es-leak-lint.js: no English in the Spanish menus.
 *
 *     node scripts/es-leak-lint.js            check
 *     node scripts/es-leak-lint.js --record   rewrite the list of known leaks
 *
 * lint:copy proves every sentence has a key in both tables; it cannot see
 * English that reaches a Spanish screen another way: a name from data (a
 * tune's mode word, a graphics preset), a sentence built in code, a key
 * whose es value was pasted in English. This renders every scenario of
 * scripts/items-golden.js twice, each language taken before the screens
 * load as the page does (its --dump), and flags a Spanish row field that
 *
 *   A. is the English field word for word, or
 *   B. carries an English function word (the, and, you, ...).
 *
 * Words both languages use (Acro, a brand, an aircraft's name) are in
 * SHARED. Rows the harness itself stands in for (its ghost, live and room
 * rows) are in STAND_INS: they are not game text.
 *
 * The pause menu and its Flight panel (scenarios paused*, quick*) must be
 * clean. Every other leak the menus still have is written down, exactly, in
 * tests/fixtures/es-leaks.json, and that list may only shrink: a leak not
 * on it fails, and so does an entry that no longer happens, so a fix takes
 * its line off. It is a ratchet, not an excuse list. Every name a tune can
 * have must have a key (tune.name.<word>) or be in SHARED, and every
 * aircraft its description (airframe.blurb.<id>).
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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRFRAMES } from '../configs/airframes.js';
import { TUNES } from '../configs/registry.js';
import { TRICKS } from '../src/game/tricks-sheet.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'tests', 'fixtures', 'es-leaks.json');
const RECORD = process.argv.includes('--record');
const STRICT = /^(paused|quick)/;
const FIELDS = ['label', 'value', 'note'];
const ENGLISH = /\b(the|and|you|your|with|is|it|of|to|this|that|from|when|here)\b/i;

/* The same word in Spanish, or a name nobody translates. */
const SHARED = new Set([
  'Acro', 'Manual', 'AS3X', 'SAFE Select', 'KISS', 'Actual', 'Raceflight', 'Quick', 'Expo', 'PID', 'PIDs', 'FPV', 'HUD',
  'GPU', 'Radio', 'Sticks', 'Feedforward', 'D max', 'Hangar', 'Arcade', 'Taranis', 'ELRS 250 Hz', 'ironbow', '60 fps',
  ...AIRFRAMES.flatMap((a) => [a.short, a.name]),
  /* Freestyle trick names are the sport's English jargon in Spanish too. */
  ...TRICKS.map((t) => t.name),
]);
/* A value made only of shared words ("Cub, Acro"), or a duration. */
const sharedValue = (text) => text.split(', ').every((part) => SHARED.has(part)) || /^\d+ (h|min)( \d+ min)?$/.test(text);

/* scripts/items-golden.js's own rows (friendsRowInRoom and the others). */
const STAND_INS = new Set([
  'OWLS', 'Two pilots in the room.', 'No room', 'Make one or join one.', 'Off', 'Nobody is watching.', 'Best lap', 'Your best, beside you.', 'Room',
  'Leave the room', 'Back to flying alone.', 'The code.', 'Start the race', 'Everybody is ready.', 'Rejoin', 'OWLS is still open.',
  'Room results', 'rows of rooms', 'rows of roomnew', 'Rooms panel home=true', 'Rooms panel home=false', 'bench row',
  'Storage refused the save.', 'Hung track', 'No author', 'Nameless', 'Old world', 'Valley run', 'Barn loop', 'Empty field', 'One gate', 'Callsign', 'Ace Pilot', 'A fine card.', 'Stand-in GPU 9000', 'Bando', 'Saved before creative mode',
]);

function dump(locale) {
  return JSON.parse(execFileSync(process.execPath, [join(root, 'scripts', 'items-golden.js'), '--dump', locale], {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  }));
}

const english = dump('en');
const spanish = dump('es');
const leaks = [];
for (const [name, scene] of Object.entries(english)) {
  const theirs = spanish[name] ? spanish[name].items : [];
  scene.items.forEach((row, i) => {
    const es = theirs[i];
    if (!es) {
      return;
    }
    for (const field of FIELDS) {
      const text = es[field];
      if (typeof text !== 'string' || sharedValue(text) || STAND_INS.has(text)) {
        continue;
      }
      const same = text === row[field] && /[A-Za-z]{3}/.test(text);
      if (same || ENGLISH.test(text)) {
        leaks.push(`${name} | ${field} | ${text}`);
      }
    }
  });
}

const names = [...new Set(TUNES.map((t) => t.name))];
const unkeyed = names.filter((n) => !SHARED.has(n) && en[`tune.name.${n.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`] === undefined);
/* The aircraft row reads airframe.blurb.<id>; the page throws on a missing key. */
const unblurbed = AIRFRAMES.filter((a) => en[`airframe.blurb.${a.id}`] === undefined).map((a) => a.id);
const found = [...new Set(leaks)].sort();
const strict = found.filter((l) => STRICT.test(l));
const rest = found.filter((l) => !STRICT.test(l));

if (RECORD) {
  writeFileSync(FILE, `${JSON.stringify(rest, null, 1)}\n`);
  console.log(`es-leak-lint: wrote ${rest.length} known leaks to ${FILE}`);
}
const known = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : [];
const knownSet = new Set(known);
const fresh = rest.filter((l) => !knownSet.has(l));
const restSet = new Set(rest);
const gone = known.filter((l) => !restSet.has(l));

let bad = 0;
for (const l of strict) {
  console.error(`FAIL  pause menu leak: ${l}`);
  bad += 1;
}
for (const l of fresh) {
  console.error(`FAIL  new leak: ${l}`);
  bad += 1;
}
for (const l of gone) {
  console.error(`FAIL  fixed, take it off ${FILE}: ${l}`);
  bad += 1;
}
for (const n of unkeyed) {
  console.error(`FAIL  tune name "${n}" has no key tune.name.<word> in src/strings and is not in SHARED`);
  bad += 1;
}
for (const id of unblurbed) {
  console.error(`FAIL  aircraft "${id}" has no airframe.blurb.${id} in src/strings (en and es)`);
  bad += 1;
}
if (bad) {
  console.error(`es-leak-lint: ${bad} problem(s)`);
  process.exit(1);
}
console.log(`es-leak-lint: ${STRICT} scenarios clean of ${Object.keys(english).length}; ${known.length} known leaks elsewhere, none new; ${names.length} tune names keyed`);
