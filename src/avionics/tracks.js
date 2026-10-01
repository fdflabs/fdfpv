/*
 * tracks.js: the TrackManager, detections turned into tracks with an age,
 * an estimate and a prediction (docs/AVIONICS-HUD.md section 7).
 *
 * STUB. The lead's stand in with the exact interface: no tracks, ever.
 * Agent 3 replaces the body and keeps the exports.
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

export function createTrackManager() {
  const snapshot = { tracks: [], primaryId: null, lost: [] };
  return {
    snapshot,
    update() {},
    reset() {
      snapshot.tracks.length = 0;
      snapshot.lost.length = 0;
      snapshot.primaryId = null;
    },
    cycle() {},
  };
}
