/*
 * factlines.js: a debrief record's facts as [label, value, tone] lines
 * (docs/DEBRIEF.md), for every screen that shows them: the results
 * screen (results.js) and the ops debrief (debrief.js). Its own file so
 * debrief.js need not import results.js, which sits in ui.js's import
 * cycle.
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

import { formatScore } from '../game/score.js';
import { splitDuration } from '../share/flighttime.js';
import { str } from '../strings/index.js';
import { formatRunClock, formatTime, lengthText } from './format.js';

function hoursText(s) {
  const { h, m } = splitDuration(s);
  if (h) {
    return str('debrief.hours', { h, m });
  }
  return m ? str('debrief.minutes', { m }) : str('debrief.seconds', { s: Math.floor(s) });
}

/* A record line's value in its own unit: a lap time, a board score or a
 * total flight time. */
function recordText(r) {
  if (r.what === 'debrief.aircraft_time') {
    return hoursText(r.now);
  }
  if (r.what === 'debrief.run_best' && r.improved) {
    return str('debrief.board_best_new', { now: formatScore(r.now) });
  }
  const unit = r.what === 'debrief.track_record' ? formatTime : formatScore;
  if (r.before == null) {
    return str('debrief.record_first', { now: unit(r.now) });
  }
  return r.improved ? str('debrief.record_beat', { now: unit(r.now), before: unit(r.before) }) : str('debrief.record_stands', { before: unit(r.before) });
}

/* The debrief's facts (src/game/debrief.js): every line the record has,
 * in the contract's order; the result is the screen's head and the next
 * actions its menu, so neither is repeated here. */
export function factLines(d) {
  const lines = [[str('debrief.air_time'), formatRunClock(d.time.flightMs)]];
  if (d.route) {
    lines.push([str('debrief.distance'), lengthText(d.route.distanceM)]);
    lines.push([str('debrief.top'), str('debrief.top_value', { m: Math.max(0, Math.round(d.route.topM)) })]);
  }
  for (const a of d.accuracy) {
    lines.push([str(a.what), a.of == null ? String(a.n) : str('debrief.n_of', { n: a.n, of: a.of })]);
  }
  if (d.result.landed != null) {
    lines.push([str('debrief.landing'), str(d.result.landed ? 'debrief.landed' : 'debrief.not_landed')]);
  }
  for (const r of d.records) {
    lines.push([str(r.what), recordText(r), r.improved === true ? 'gain' : r.improved === false ? 'off' : '']);
  }
  return lines;
}
