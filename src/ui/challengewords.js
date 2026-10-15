/*
 * challengewords.js: an aircraft challenge's words (src/game/progress.js
 * AIRCRAFT_CHALLENGE_IDS), with the amounts its class gives, for the
 * hangar's row, the toast and the debrief's line. Its own file so the
 * debrief's facts (factlines.js) need not import the hangar.
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

import { airframeById } from '../../configs/airframes.js';
import { challengeAmounts } from '../game/progress.js';
import { str } from '../strings/index.js';
import { formatTime } from './format.js';

function vars(airframe) {
  const a = challengeAmounts(airframe);
  return a ? { n: a.landings, time: formatTime(a.lapMs), min: a.airMs / 60000, plane: airframeById(airframe).name } : null;
}

/* The challenge's title, or '' for an aircraft with none. */
export function challengeTitle(airframe, id) {
  const v = vars(airframe);
  return v ? str(`progress.aircraft.${id}`, v) : '';
}

/* The challenge's one line of how, naming the aircraft. */
export function challengeNote(airframe, id) {
  const v = vars(airframe);
  return v ? str(`progress.aircraft.${id}_note`, v) : '';
}
