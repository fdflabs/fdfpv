/*
 * perception.js: PerceptionAI, what the sensor could see turned into
 * detections (docs/AVIONICS-HUD.md section 6).
 *
 * STUB. The lead's stand in with the exact interface: it detects nothing
 * and reports a fixed idle load. Agent 3 replaces the body and keeps the
 * exports.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* The compute model's floor: the detector runs on every frame whether or
 * not there is anything to find. */
const IDLE_LOAD = 0.18;

export function createPerception() {
  const detections = [];
  return {
    detections,
    load: IDLE_LOAD,
    update() {
      detections.length = 0;
    },
  };
}
