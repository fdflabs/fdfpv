/*
 * track.js: how big the game builds a course, one published course kept as
 * cited data, and the two lap aggregates a race reports.
 *
 * Obstacles are built larger than MultiGP publishes them. That is a
 * playability call by the owner, not a measurement, so it lives here as one
 * named number that every builder multiplies by instead of being folded
 * into the obstacle library's dimensions.
 *
 * Sources: https://www.multigp.com/multigp-drone-race-course-obstacles/ for
 * obstacle sizes, https://www.multigp.com/universal-time-trial-utt/ and the
 * UTT 3 guide PDF for the Bessel Run layout. The PDF is not vendored
 * (MultiGP artwork, licence unstated), so the UTT 3 numbers below are hand
 * transcribed from its dimensioned diagram.
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

import { FT, FRAME_TUBE_OD } from '../units.js';
import { str } from '../strings/index.js';

export { FRAME_TUBE_OD };

/* Owner request: "the gates need to be 15 percent larger in the track".
 * Mirrored in tests/thresholds.json world-scale.gate_scale. */
export const GATE_SCALE = 1.15;

/* Wing gates are authored in metres against the aircraft span, so they are
 * built one to one. A plain object on purpose: unknown classes fall through
 * to GATE_SCALE, and the golden record pins the lookup as an ordinary
 * property read, inherited names included. */
const SCALE_BY_CLASS = { full: GATE_SCALE, wing: 1 };

export function gateScaleFor(cls) {
  return SCALE_BY_CLASS[cls] ?? GATE_SCALE;
}

/* The tube the scene draws and the colliders follow. FRAME_TUBE_OD itself
 * is an assumption (1 in schedule 40 PVC): MultiGP publishes no tube size. */
export const BUILT_FRAME_TUBE_OD = FRAME_TUBE_OD * GATE_SCALE;

/* MultiGP UTT 3 "Bessel Run", kept as provenance; nothing builds from it.
 * Course frame: x along the field's long axis, z across, origin at gate 3.
 * The timing gate's station along the row is not dimensioned on the
 * diagram; it measures 1.1 m +/- 0.3 m from gate 3, inside drawing
 * tolerance, so it sits at exactly x = 0. Facing is read off the glyphs:
 * front elevations face 'z', the edge-on timing gate faces 'x'. The rule
 * text is MultiGP's wording from the UTT 9 guide, which applies to every
 * UTT. Text is looked up once at load, so it is in whatever locale is
 * active then (English on every boot path). */
export const UTT3 = {
  id: 'utt3',
  name: str('track.utt_3_bessel_run'),
  designer: str('track.multigp_2016_season_track_3_v002'),
  source: 'https://www.multigp.com/universal-time-trial-utt/',
  fieldLength: 300 * FT,
  fieldWidth: 120 * FT,
  flagsAllowed: false,
  rule: str('track.obstacles_must_be_traversed_in_the') + str('track.obstacles_must_be_traversed_in_this')
    + str('track.obstacle_is_entered_out_of_sequence') + str('track.run_is_invalid'),
  gates: [
    { n: 1, kind: 'timingGate', x: 0, z: -46 * FT, facing: 'x', role: str('track.start_and_finish') },
    { n: 2, kind: 'standardGate', x: 92 * FT, z: 0, facing: 'z' },
    { n: 3, kind: 'standardGate', x: 0, z: 0, facing: 'z' },
    { n: 4, kind: 'standardGate', x: -69 * FT, z: 0, facing: 'z' },
    { n: 5, kind: 'standardGate', x: -(69 + 23) * FT, z: 0, facing: 'z' },
  ],
  dimensions: {
    gate5ToGate4Ft: 23,
    gate4ToGate3Ft: 69,
    gate3ToGate2Ft: 92,
    timingGateOffsetFt: 46,
  },
};

/* Lap times in ms; null or undefined entries are skipped. Ties keep the
 * earlier lap. Returns null when there is no lap. */
export function fastestLap(laps) {
  let best = null;
  for (const ms of laps) {
    if (ms == null) continue;
    if (best == null || ms < best) best = ms;
  }
  return best;
}

/* Race.log in flying order. A record with no ms is a voided attempt and
 * breaks the run, so only three clean laps flown back to back count.
 * The sum is taken in flying order because the result is compared bit for
 * bit. Returns null when no such run exists. */
export function fastestThreeConsecutive(log) {
  let best = null;
  const run = [];
  for (const record of log) {
    const ms = record.ms;
    if (ms == null) {
      run.length = 0;
      continue;
    }
    run.push(ms);
    if (run.length > 3) run.shift();
    if (run.length < 3) continue;
    const total = run[0] + run[1] + run[2];
    if (best == null || total < best) best = total;
  }
  return best;
}
