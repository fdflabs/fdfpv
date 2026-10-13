/*
 * bugs-selftest.js: a tester ticket sent to the board (src/share/bugs.js),
 * pinned as a transcript.
 *
 *     node scripts/bugs-selftest.js [--dump=<file>]   (npm run bugs:selftest)
 *
 * The kinds offered, and for each kind of answer from a stand in board
 * (accepted, refused with and without an error, not JSON, empty, a board
 * that cannot be reached) what submitBug sends and resolves or throws.
 * Pinned by digest (scripts/lib/transcript.js) on the module before its
 * rewrite.
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

import { transcript } from './lib/transcript.js';

/* Re-pinned 2026-10-13 when reportFields was exported: the one record
 * that moved is `exports`, diffed against the dump at the old revision. */
const PINNED = '425bc1d254ac5b501e15cea72a981f6112b49d933875c5e29a320dc0586f363b';

const sent = [];
let reply = [200, '{}'];
globalThis.fetch = async (url, init) => {
  sent.push({ url, method: init.method, headers: init.headers, body: init.body, keys: Object.keys(init) });
  if (reply === 'unreachable') {
    throw new TypeError('fetch failed');
  }
  return new Response(reply[1], { status: reply[0] });
};

const bugs = await import('../src/share/bugs.js');
const t = transcript();
t.note('exports', Object.keys(bugs).sort());
t.note('kinds', bugs.BUG_KINDS);

const TICKET = {
  kind: 'wrong', title: 'Gate missing', what: 'The third gate is not there.', expected: 'A gate', steps: '1. fly', reporter: 'Ada', context: { map: 'alps' }, images: ['data:image/webp;base64,AA'],
};
for (const [label, r, origin] of [
  ['accepted', [201, '{"id":"bug-1","ok":true}'], 'https://board.example/b/'],
  ['accepted with an empty body', [200, ''], 'https://board.example/b'],
  ['accepted with text', [200, 'thanks'], 'https://board.example/b'],
  ['refused with an error', [400, '{"error":"Title too long."}'], 'https://board.example/b'],
  ['refused with text', [413, 'Payload Too Large'], 'https://board.example/b'],
  ['refused empty', [500, ''], 'https://board.example/b'],
  ['refused with a JSON body and no error', [409, '{"conflict":true}'], 'https://board.example/b'],
  ['a board that cannot be reached', 'unreachable', 'https://board.example/b'],
  ['to the default board', [201, '{"id":"bug-2"}'], undefined],
  ['to a blank origin', [201, '{}'], '   '],
]) {
  reply = r;
  sent.length = 0;
  let out;
  try {
    out = { resolved: await bugs.submitBug(TICKET, origin) };
  } catch (e) {
    out = { threw: e.constructor.name, message: e.message, status: e.status, conflict: e.conflict };
  }
  t.note(label, { out, sent: sent.slice() });
}

t.finish('bugs.js', PINNED);

/* What a report says about the build, aircraft, activity and controller. */
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const show = (v) => JSON.stringify(v);
{
  const pad = { kind: 'pad', id: 'Radiomaster Pocket Joystick (Vendor: 1209 Product: 4f54)', index: 0 };
  const a = bugs.reportFields({ version: '9db1f45e6', airframe: 'timber1500', mode: 'race', pad });
  check('a deployed page, a radio, a race', show(a) === show({
    build: '9db1f45e6', airframe: 'timber1500', activity: 'race', controller: pad.id,
  }), show(a));
  const b = bugs.reportFields({ pad: { kind: 'none' } });
  check('a checkout on the title with the keyboard on purpose', show(b) === show({
    build: 'local', airframe: '', activity: '', controller: 'none',
  }), show(b));
  check('no choice yet reads auto', bugs.reportFields({ pad: { kind: 'auto' } }).controller === 'auto');
  check('nothing given at all is four empty fields but the build', show(bugs.reportFields()) === show({
    build: 'local', airframe: '', activity: '', controller: '',
  }));
  const long = 'x'.repeat(5000);
  const c = bugs.reportFields({ version: long, airframe: long, mode: long, pad: { kind: 'pad', id: long } });
  check('every field is clipped', show(c).length < 300, String(show(c).length));
  const d = bugs.reportFields({ version: 7, airframe: {}, mode: [], pad: { kind: 'pad', id: 3 } });
  check('a value that is not text is empty, never thrown or sent as it is', show(d) === show({
    build: 'local', airframe: '', activity: '', controller: '',
  }), show(d));
}
if (failed) process.exit(1);
