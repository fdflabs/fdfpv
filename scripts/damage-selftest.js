/*
 * damage-selftest.js: the condition the player reads (src/game/damage.js
 * conditionOf, damagedPart) and the OSD line it puts up (src/ui/fpvhud.js
 * warningFor), in Node with no module loaded: every damage flag alone on a
 * quad and a plane, the place flags alone, and the warning order against
 * the power warnings. Contract: docs/TRAINING-DAMAGE-CONTRACT.md.
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

import { DAMAGE_FLAGS } from '../configs/parts.js';
import { conditionOf, damagedPart, isWreck } from '../src/game/damage.js';
import { FpvOsd } from '../src/ui/fpvhud.js';
import { useLocale } from '../src/strings/index.js';

let failed = 0;
function expect(what, got, want) {
  const ok = got === want;
  if (!ok) {
    failed += 1;
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}: ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
}

const PLACE = new Set(['inTree', 'inWater']);
for (const fixedWing of [false, true]) {
  const craft = fixedWing ? 'plane' : 'quad';
  expect(`${craft} whole`, conditionOf(0, fixedWing), 'operational');
  expect(`${craft} whole names no part`, damagedPart(0), null);
  for (const [name, bit] of Object.entries(DAMAGE_FLAGS)) {
    let want = 'impaired';
    if (PLACE.has(name)) {
      want = 'operational';
    } else if (isWreck(bit, fixedWing)) {
      want = 'destroyed';
    }
    expect(`${craft} ${name}`, conditionOf(bit, fixedWing), want);
    if (!PLACE.has(name)) {
      expect(`${name} names a part`, typeof damagedPart(bit), 'string');
    }
    expect(`${craft} ${name} in a tree`, conditionOf(bit | DAMAGE_FLAGS.inTree, fixedWing), want === 'operational' ? 'operational' : want);
  }
}
expect('a plane flies on without its prop', conditionOf(DAMAGE_FLAGS.propLost, true), 'impaired');
expect('a quad does not', conditionOf(DAMAGE_FLAGS.propLost, false), 'destroyed');
expect('worst part first', damagedPart(DAMAGE_FLAGS.propChipped | DAMAGE_FLAGS.armBent), 'arm');

/* The OSD, as power-check.js builds it: only what warningFor reads. */
function osd({ lq = 100, batt = 'ok' } = {}) {
  const o = Object.create(FpvOsd.prototype);
  Object.assign(o, { lq, batt, power: null, vFilt: 4.2 * 4 });
  return o;
}
function warning(o, flags, fixedWing = false) {
  return o.warningFor({ launchState: 0 }, {
    armed: true, flown: true, crashFlip: false, cells: 4,
    condition: conditionOf(flags, fixedWing), damagedPart: damagedPart(flags),
  }).warning;
}
await useLocale('en');
expect('OSD whole', warning(osd(), 0), '');
expect('OSD chipped prop', warning(osd(), DAMAGE_FLAGS.propChipped), 'DAMAGED: PROP');
expect('OSD wreck adds nothing', warning(osd(), DAMAGE_FLAGS.armLost), '');
expect('OSD in a tree', warning(osd(), DAMAGE_FLAGS.inTree), '');
expect('LAND NOW outranks damage', warning(osd({ batt: 'critical' }), DAMAGE_FLAGS.propChipped), 'LAND NOW');
expect('link outranks damage', warning(osd({ lq: 10 }), DAMAGE_FLAGS.propChipped), 'LINK QUALITY');
expect('does not blink', osd().warningFor({ launchState: 0 }, {
  armed: true, flown: true, cells: 4, condition: 'impaired', damagedPart: 'prop',
}).blink, false);
for (const bit of Object.values(DAMAGE_FLAGS)) {
  const w = warning(osd(), bit, true);
  expect(`OSD fits a row: ${w}`, w.length <= 28, true);
}
await useLocale('es');
expect('OSD es', warning(osd(), DAMAGE_FLAGS.propChipped), 'AVERIA: HELICE');

console.log(failed ? `FAIL, ${failed} case(s)` : 'PASS, the condition and its OSD line');
process.exit(failed ? 1 : 0);
