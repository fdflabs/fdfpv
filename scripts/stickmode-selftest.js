/*
 * stickmode-selftest.js: the stick mode table (src/input/stickmode.js)
 * pinned cell by cell, in plain Node. The table decides which thumb flies
 * which channel for the keyboard, the touch sticks, the calibration wizard
 * and every caption in Settings, so a wrong cell is a pilot flying pitch
 * on the throttle stick. input-selftest.js checks the four layouts; this
 * pins everything else the callers lean on: what counts as a mode (a
 * stored setting can be a string, a number or garbage), which side an
 * unknown channel lands on, the caption for every side and separator, and
 * that a caller may mutate what it was handed.
 *
 * The expected values were read off the shipped module before it was
 * rewritten, so this is the contract the rewrite had to keep.
 *
 *   node scripts/stickmode-selftest.js
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
  STICK_MODES, DEFAULT_STICK_MODE, normaliseStickMode, stickChannels, stickSideOf, stickCaption,
} from '../src/input/stickmode.js';
import * as everything from '../src/input/stickmode.js';

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('the exports');
check('exactly the six names the callers import',
  same(Object.keys(everything).sort(),
    ['DEFAULT_STICK_MODE', 'STICK_MODES', 'normaliseStickMode', 'stickCaption', 'stickChannels', 'stickSideOf']),
  Object.keys(everything).join(' '));
check('the modes are 1 to 4 in order, the order Settings cycles them', same(STICK_MODES, [1, 2, 3, 4]));
check('Mode 2 is the default', DEFAULT_STICK_MODE === 2);

/* A stored setting reaches normaliseStickMode as whatever JSON or an old
 * build left there. Number() semantics decide: a numeric string counts,
 * padding included, and so does `true`, which Number makes 1. */
console.log('what counts as a mode');
const NORMALISE = [
  [1, 1], [2, 2], [3, 3], [4, 4], ['1', 1], ['2', 2], ['3', 3], ['4', 4],
  [0, 2], [5, 2], [9, 2], [-1, 2], [2.5, 2], [3.0, 3],
  [null, 2], [undefined, 2], [NaN, 2], [Infinity, 2],
  ['x', 2], ['', 2], ['2 ', 2], [' 4', 4], [true, 1], [false, 2], [{}, 2], [[], 2],
];
for (const [input, want] of NORMALISE) {
  const label = input === undefined ? 'undefined' : Number.isNaN(input) ? 'NaN'
    : input === Infinity ? 'Infinity' : JSON.stringify(input);
  const got = normaliseStickMode(input);
  check(`${label} is Mode ${want}`, got === want, `got ${got}`);
  check(`${label} lays out as Mode ${want}`, stickChannels(input).mode === want, `got ${stickChannels(input).mode}`);
}

console.log('the layouts');
const LAYOUT = {
  1: { mode: 1, left: { horiz: 'yaw', vert: 'pitch' }, right: { horiz: 'roll', vert: 'throttle' } },
  2: { mode: 2, left: { horiz: 'yaw', vert: 'throttle' }, right: { horiz: 'roll', vert: 'pitch' } },
  3: { mode: 3, left: { horiz: 'roll', vert: 'pitch' }, right: { horiz: 'yaw', vert: 'throttle' } },
  4: { mode: 4, left: { horiz: 'roll', vert: 'throttle' }, right: { horiz: 'yaw', vert: 'pitch' } },
};
for (const mode of STICK_MODES) {
  const got = stickChannels(mode);
  check(`Mode ${mode}, shape and every cell`, same(got, LAYOUT[mode]), JSON.stringify(got));
}
{
  const a = stickChannels(2);
  a.left.vert = 'pitch';
  a.mode = 9;
  check('a caller mutating its layout does not change the next one', same(stickChannels(2), LAYOUT[2]));
  check('every call hands out its own object', stickChannels(3) !== stickChannels(3)
    && stickChannels(3).left !== stickChannels(3).left);
}

/* Anything that is not on the left stick is reported on the right, aux
 * channels and junk included: the wizard and the keyboard only ask about
 * the four sticks, and right is where they draw everything else. */
console.log('which side a channel is on');
const SIDE = {
  1: { roll: 'right', pitch: 'left', yaw: 'left', throttle: 'right' },
  2: { roll: 'right', pitch: 'right', yaw: 'left', throttle: 'left' },
  3: { roll: 'left', pitch: 'left', yaw: 'right', throttle: 'right' },
  4: { roll: 'left', pitch: 'right', yaw: 'right', throttle: 'left' },
};
for (const mode of STICK_MODES) {
  for (const [ch, want] of Object.entries(SIDE[mode])) {
    check(`Mode ${mode}: ${ch} on the ${want}`, stickSideOf(mode, ch) === want);
  }
  check(`Mode ${mode}: aux1 and an empty name land on the right`,
    stickSideOf(mode, 'aux1') === 'right' && stickSideOf(mode, '') === 'right');
}
check('a bad mode answers as Mode 2', Object.entries(SIDE[2]).every(([ch, want]) => stickSideOf('x', ch) === want));

/* Captions are English on purpose: they name channels, and the strings
 * that frame them are the ones translated. Any side that is not 'right'
 * reads as the left stick. */
console.log('captions');
const CAPTION = {
  1: { left: ['Yaw', 'pitch'], right: ['Roll', 'throttle'] },
  2: { left: ['Yaw', 'throttle'], right: ['Roll', 'pitch'] },
  3: { left: ['Roll', 'pitch'], right: ['Yaw', 'throttle'] },
  4: { left: ['Roll', 'throttle'], right: ['Yaw', 'pitch'] },
};
for (const mode of STICK_MODES) {
  for (const side of ['left', 'right']) {
    const [h, v] = CAPTION[mode][side];
    check(`Mode ${mode} ${side}: "${h}, ${v}"`, stickCaption(mode, side) === `${h}, ${v}`, stickCaption(mode, side));
    check(`Mode ${mode} ${side} with the touch separator`, stickCaption(mode, side, ' · ') === `${h} · ${v}`);
  }
  check(`Mode ${mode}: an unknown side captions the left stick`,
    stickCaption(mode, 'other') === stickCaption(mode, 'left'));
}
check('a bad mode captions as Mode 2', stickCaption(9, 'left') === 'Yaw, throttle');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
