/*
 * padprofiles-selftest.js: the device profile table (src/input/padprofiles.js)
 * against the matcher it replaced. builtInKind's value is pinned, not only
 * the map, because a truthy kind switches off the guess warnings
 * (guess.js) and a changed one rebuilds the map (input.js). The old
 * builtInKind is frozen below exactly as it shipped at d839f05c, so a row
 * added to the table that makes a known device fly differently fails here.
 *
 *   node scripts/padprofiles-selftest.js
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

import { AETR_MAP, builtInKind, builtInMap, standardPadMap } from '../src/input/padmap.js';
import { PAD_PROFILES, parsePadId, profileFor } from '../src/input/padprofiles.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
    return;
  }
  failed += 1;
  console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
}
const show = (v) => JSON.stringify(v);

/* builtInKind as it shipped before the table. */
function oldKind(gp, mode) {
  if (!gp) {
    return 0;
  }
  if (gp.mapping === 'standard') {
    return mode;
  }
  const named = /^ExpressLRS Joystick/.test(gp.id || '');
  return named && gp.axes.length > 4 ? 'elrs-bluetooth' : 0;
}

/* The ELRS map as measured on a RadioMaster Pocket, 2026-10-05 (padmap.js). */
const ELRS_MAP = {
  roll: { axis: 0, center: 0, full: 1 },
  pitch: { axis: 1, center: 0, full: -1 },
  yaw: { axis: 4, center: 0, full: 1 },
  throttle: { axis: 3, low: -1, high: 1 },
};
function oldMap(gp, mode) {
  const kind = oldKind(gp, mode);
  if (!kind) {
    return AETR_MAP;
  }
  return kind === 'elrs-bluetooth' ? ELRS_MAP : standardPadMap(mode);
}

const pad = (id, axes, mapping = '') => ({ id, mapping, axes: new Array(axes).fill(0), buttons: [] });

/* Ids as the browsers print them (formats cited in padprofiles.js). The
 * ELRS 3.x Chromium id is the one input-selftest.js already uses; the
 * Pocket's USB name is what SDL reported for the owner's radio on this
 * machine (2026-09-12); 045e:028e is the Xbox 360 pad in Linux's xpad.c;
 * 0000:0000 stands for a device nobody lists. */
const ELRS3_CHROMIUM = 'ExpressLRS Joystick (Vendor: e502 Product: bbab)';
const ELRS3_FIREFOX = 'e502-bbab-ExpressLRS Joystick';
const ELRS4_CHROMIUM = 'ELRS Joystick (Vendor: e502 Product: bbab)';
const EDGETX_CHROMIUM = 'Radiomaster Pocket Joystick (Vendor: 1209 Product: 4f54)';
const EDGETX_FIREFOX = '1209-4f54-Radiomaster Pocket Joystick';
const XBOX_CHROMIUM = 'Xbox 360 Controller (XInput STANDARD GAMEPAD Vendor: 045e Product: 028e)';

const FIXTURES = [
  ['no pad', null],
  ['standard pad', pad(XBOX_CHROMIUM, 4, 'standard')],
  ['standard pad named like an ELRS radio', pad(ELRS3_CHROMIUM, 8, 'standard')],
  ['ELRS 3.x, Chromium, 8 axes', pad(ELRS3_CHROMIUM, 8)],
  ['ELRS 3.x, Chromium, 5 axes', pad(ELRS3_CHROMIUM, 5)],
  ['ELRS 3.x, Chromium, 4 axes', pad(ELRS3_CHROMIUM, 4)],
  ['ELRS 3.x name with no ids', pad('ExpressLRS Joystick', 8)],
  ['ELRS 4.x, Chromium', pad(ELRS4_CHROMIUM, 8)],
  ['EdgeTX USB, Chromium', pad(EDGETX_CHROMIUM, 8)],
  ['EdgeTX USB, Firefox', pad(EDGETX_FIREFOX, 8)],
  ['unknown joystick', pad('Unknown Joystick (Vendor: 0000 Product: 0000)', 6)],
  ['empty id', pad('', 4)],
  ['id missing', { mapping: '', axes: [0, 0, 0, 0], buttons: [] }],
];
const MODES = [1, 2, 3, 4, 'x'];

console.log('\nevery device a Chromium build saw before flies exactly as it did');
for (const [label, gp] of FIXTURES) {
  for (const mode of MODES) {
    const kind = builtInKind(gp, mode);
    const was = oldKind(gp, mode);
    const map = show(builtInMap(gp, mode));
    const wasMap = show(oldMap(gp, mode));
    check(`${label}, mode ${mode}: kind ${show(was)} and the same map`, kind === was && map === wasMap,
      `kind ${show(kind)}, map ${map}`);
  }
}

console.log('\nthe one deliberate change: the ELRS 3.x radio in Firefox id form');
const firefoxElrs = pad(ELRS3_FIREFOX, 8);
check('was the AETR guess', oldKind(firefoxElrs, 2) === 0);
check('is now the measured ELRS map', builtInKind(firefoxElrs, 2) === 'elrs-bluetooth'
  && show(builtInMap(firefoxElrs, 2)) === show(ELRS_MAP), show(builtInMap(firefoxElrs, 2)));

console.log('\nknown ids resolve to their rows');
const keyOf = (gp) => profileFor(gp).key;
check('ELRS 3.x (Chromium) is elrs-bluetooth', keyOf(pad(ELRS3_CHROMIUM, 8)) === 'elrs-bluetooth');
check('ELRS 3.x (Firefox) is elrs-bluetooth', keyOf(firefoxElrs) === 'elrs-bluetooth');
check('EdgeTX (Chromium) is edgetx-usb', keyOf(pad(EDGETX_CHROMIUM, 8)) === 'edgetx-usb');
check('EdgeTX (Firefox) is edgetx-usb', keyOf(pad(EDGETX_FIREFOX, 8)) === 'edgetx-usb');
check('EdgeTX vouches for nothing: AETR guess, warnings on', builtInKind(pad(EDGETX_CHROMIUM, 8), 2) === 0);
check('ELRS 4.x is not given the 3.x map (its axes moved)', keyOf(pad(ELRS4_CHROMIUM, 8)) === 'aetr');
check('standard mapping wins over any id', keyOf(pad(EDGETX_CHROMIUM, 8, 'standard')) === 'standard');
check('unknown is the AETR guess', keyOf(pad('Generic', 6)) === 'aetr' && keyOf(null) === 'aetr');

console.log('\nids parse in both browser formats');
const parsed = (id, want) => check(`"${id}"`, show(parsePadId(id)) === show(want), show(parsePadId(id)));
parsed(EDGETX_CHROMIUM, { name: 'Radiomaster Pocket Joystick', vendor: '1209', product: '4f54' });
parsed(XBOX_CHROMIUM, { name: 'Xbox 360 Controller', vendor: '045e', product: '028e' });
parsed(EDGETX_FIREFOX, { name: 'Radiomaster Pocket Joystick', vendor: '1209', product: '4f54' });
parsed('Some (odd) name', { name: 'Some (odd) name', vendor: null, product: null });
check('a non string id parses as empty', show(parsePadId(undefined)) === show({ name: '', vendor: null, product: null }));

console.log('\nnegative control: a mutated row must be caught');
const edgetx = PAD_PROFILES.find((row) => row.key === 'edgetx-usb');
edgetx.vouched = true;
const caught = builtInKind(pad(EDGETX_CHROMIUM, 8), 2) !== oldKind(pad(EDGETX_CHROMIUM, 8), 2);
edgetx.vouched = false;
check('EdgeTX made to vouch changes the kind the old matcher gave', caught);
const elrs = PAD_PROFILES.find((row) => row.key === 'elrs-bluetooth');
elrs.match.minAxes = 4;
const caughtAxes = builtInKind(pad(ELRS3_CHROMIUM, 4), 2) !== oldKind(pad(ELRS3_CHROMIUM, 4), 2);
elrs.match.minAxes = 5;
check('ELRS taking a 4 axis device changes the kind the old matcher gave', caughtAxes);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
