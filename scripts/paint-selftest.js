/*
 * paint-selftest.js: the paint shop's data and its livery code, in Node.
 *
 * 1. A livery with finishes and decals goes through the code and comes
 *    back the same entry, name and plane, a UTF-8 name included.
 * 2. The code is refused whole, with its reason, when it is not one, is
 *    over CODE_MAX, carries a field a livery does not have (at the top,
 *    in the entry or in a decal), has a value out of range (a size, a
 *    colour, a finish on a trim that takes its part's, a number with
 *    letters), too many decals, or names a plane with no paint.
 * 3. The settings keep what is safe of a stale blob and drop the rest,
 *    and the saved list keeps names clean and within MAX_SAVED.
 * 4. Every decal kind makes a valid new decal, and a mirror of a number
 *    is the only kind kept reading the right way round.
 *
 * Run with npm run paint:selftest.
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

import {
  CODE_MAX, CODE_PREFIX, DECAL_KINDS, DECAL_KIND_IDS, MAX_DECALS, MAX_SAVED, encodeLivery, newDecal,
} from '../configs/paint.js';
import { normaliseEntry, normaliseLiveries, normaliseSaves, readCode } from '../configs/liveries.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* A code from any object, for the refusals: the same wrapping as
 * encodeLivery without its cleaning. */
function rawCode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return CODE_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const num = newDecal('num', [0.052, 0.018, -0.21], [1, 0, 0], { c: '#f2f2f2', c2: '#0e1213' });
const stripe = newDecal('stripe', [0.3, 0.06, 0.02], [0, 1, 0]);
const entry = normaliseEntry('timber1500', {
  scheme: 'super', regions: { stripe: '#3355aa' }, finishes: { wing: 'chrome', fuselage: 'gloss' }, decals: [num, stripe],
});

console.log('1. round trip');
{
  const code = encodeLivery('timber1500', 'Número 7', entry);
  const back = readCode(code);
  check('a Timber livery with a chrome wing, a number and a stripe comes back whole', same(back.entry, entry) && back.family === 'timber1500' && back.name === 'Número 7',
    `${code.length} characters`);
  check('the code is URL safe', /^FPV1-[A-Za-z0-9_-]+$/.test(code));
  const spaced = code.replace(/(.{40})/g, '$1\n  ');
  check('a code broken over lines by a chat window still reads', same(readCode(spaced).entry, entry));
  const full = normaliseEntry('timber1500', { decals: Array.from({ length: MAX_DECALS }, () => num) });
  const big = encodeLivery('timber1500', 'x'.repeat(40), full);
  check(`${MAX_DECALS} numbers fit a code under CODE_MAX`, big.length <= CODE_MAX && same(readCode(big).entry, full), `${big.length} of ${CODE_MAX}`);
  check('the stock look is a code too', same(readCode(encodeLivery('kadet1981', 'Stock', {})).entry, {}));
}

console.log('2. refusals');
{
  const base = { v: 1, p: 'timber1500', n: 'x', e: entry };
  const cases = [
    ['not a code at all', 'hello', 'not_code'],
    ['the prefix and garbage', `${CODE_PREFIX}!!!`, 'not_code'],
    ['the prefix and base64 of not JSON', `${CODE_PREFIX}bm90IGpzb24`, 'not_code'],
    ['over CODE_MAX', CODE_PREFIX + 'A'.repeat(CODE_MAX), 'too_long'],
    ['a newer version', rawCode({ ...base, v: 2 }), 'version'],
    ['an unknown top field', rawCode({ ...base, x: 1 }), 'unknown_field'],
    ['an unknown entry field', rawCode({ ...base, e: { ...entry, script: 'alert(1)' } }), 'unknown_field'],
    ['an unknown decal field', rawCode({ ...base, e: { decals: [{ ...num, url: 'x' }] } }), 'unknown_field'],
    ['letters in a number', rawCode({ ...base, e: { decals: [{ ...num, t: '7a' }] } }), 'bad_value'],
    ['a decal size out of range', rawCode({ ...base, e: { decals: [{ ...num, s: 5 }] } }), 'bad_value'],
    ['a decal far off the model', rawCode({ ...base, e: { decals: [{ ...num, p: [0, 90, 0] }] } }), 'bad_value'],
    ['a decal colour that is not a colour', rawCode({ ...base, e: { decals: [{ ...stripe, c: 'red' }] } }), 'bad_value'],
    ['a stripe with lettering', rawCode({ ...base, e: { decals: [{ ...stripe, f: 'block' }] } }), 'unknown_field'],
    ['too many decals', rawCode({ ...base, e: { decals: Array.from({ length: MAX_DECALS + 1 }, () => num) } }), 'bad_value'],
    ['a finish that is not one', rawCode({ ...base, e: { finishes: { wing: 'velvet' } } }), 'bad_value'],
    ['a finish on a region the plane lacks', rawCode({ ...base, e: { finishes: { rotor: 'gloss' } } }), 'bad_value'],
    ['film on a region that is not film', rawCode({ ...base, e: { finishes: { wing: 'film' } } }), 'bad_value'],
    ['a finish on the Kadet\'s trim', rawCode({ ...base, p: 'kadet1981', e: { finishes: { wing_trim: 'chrome' } } }), 'bad_value'],
    ['a scheme the plane has not got', rawCode({ ...base, e: { scheme: 'nope' } }), 'bad_value'],
    ['a region colour that is not a colour', rawCode({ ...base, e: { regions: { wing: '#12345' } } }), 'bad_value'],
    ['a plane with no paint', rawCode({ ...base, p: '5inch', e: {} }), 'unknown_plane'],
  ];
  for (const [what, code, want] of cases) {
    const got = readCode(code);
    check(`refused, ${what}: ${want}`, got.error === want && !got.entry, got.error ?? 'taken');
  }
}

console.log('3. the settings');
{
  const stale = normaliseLiveries({
    timber1500: { scheme: 'super', finishes: { wing: 'velvet', tail: 'matte' }, decals: [num, { k: 'logo' }, stripe] },
    kadet1981: { finishes: { wing: 'film', fuselage: 'chrome' } },
    nope: { scheme: 'x' },
  });
  check('a stale blob keeps what is safe and drops the rest', same(stale, {
    timber1500: { scheme: 'super', finishes: { tail: 'matte' }, decals: [num, stripe] },
    kadet1981: { finishes: { fuselage: 'chrome' } },
  }), JSON.stringify(stale));
  const saves = normaliseSaves({
    timber1500: [{ name: '  Race\tday  ', entry }, { name: '', entry }, { name: 'x'.repeat(50), entry: { finishes: { wing: 'velvet' } } }],
    kadet1981: Array.from({ length: MAX_SAVED + 5 }, (_, i) => ({ name: `L${i}`, entry: {} })),
    nope: [{ name: 'a', entry: {} }],
  });
  check('saved names are cleaned, empty ones dropped, entries made safe', same(saves.timber1500, [{ name: 'Race day', entry }, { name: 'x'.repeat(32), entry: {} }]));
  check(`a saved list is at most ${MAX_SAVED}`, saves.kadet1981.length === MAX_SAVED && !saves.nope);
}

console.log('4. the decal kinds');
{
  const made = DECAL_KIND_IDS.map((k) => newDecal(k, [0, 0.1, 0], [0, 1, 0]));
  check(`every kind makes a valid decal: ${DECAL_KIND_IDS.join(', ')}`, made.every((d) => normaliseEntry('cub1400', { decals: [d] }).decals.length === 1));
  const text = DECAL_KIND_IDS.filter((k) => DECAL_KINDS[k].text);
  check('only the number and the words read the right way round when mirrored', same(text, ['num', 'text']));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
