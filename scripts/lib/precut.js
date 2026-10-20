/*
 * precut.js: the 20 recreational aircraft's airframe rows and tuning as
 * they stood before they left the shell (2026-10-21), with their power
 * rows, for the checks that still use them as inputs to shared code.
 *
 * Their plants left the module too, so nothing flies them. What is left
 * reads their numbers only: their sizes put collide.js through twenty
 * real shapes (collide:golden, collide-state:selftest), and the Kadet's
 * glow engine row walks configs/wear.js's fuel branch (wear:selftest).
 * The rows are tests/fixtures/precut-aircraft.json, copied from 988b8dfc6
 * and never edited.
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

import { readFileSync } from 'node:fs';

import { airframeById } from '../../configs/airframes.js';
import { POWER, TABLE } from '../../configs/power.js';
import { TUNING } from '../../configs/tuning.js';

const FIXTURE = JSON.parse(readFileSync(new URL('../../tests/fixtures/precut-aircraft.json', import.meta.url), 'utf8'));

/* An airframe row by id: a kept one from configs/airframes.js, a cut one
 * from the fixture. An id that is neither throws, where airframeById
 * would hand back the interceptor. */
export function precutRow(id) {
  if (Object.hasOwn(FIXTURE.airframes, id)) {
    return FIXTURE.airframes[id];
  }
  const af = airframeById(id);
  if (af.id !== id) {
    throw new Error(`${id} is no airframe, before the cut or after it`);
  }
  return af;
}

/* Every airframe row as configs/airframes.js listed them before the cut. */
export const PRECUT_AIRFRAMES = FIXTURE.order.map(precutRow);

/* Puts the cut aircraft's power rows (configs/power.js TABLE and POWER)
 * and tuning (configs/tuning.js TUNING) back, so the helpers over them
 * (powerBlock, setupFor, stockEntry, tuneBlock) answer for those aircraft
 * as they did. These are the modules' own objects: call this only from a
 * check, never from anything the shell loads. */
export function seatPrecutAircraft() {
  Object.assign(TABLE, FIXTURE.table);
  Object.assign(POWER, FIXTURE.power);
  Object.assign(TUNING, FIXTURE.tuning);
}
