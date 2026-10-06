/*
 * hudstate.js: the Avionics HUD's state, MANUAL, ASSIST, SEARCH, TRACK,
 * THERMAL or DEGRADED (docs/AVIONICS-HUD.md section 9), recomputed every
 * frame from the systems and kept nowhere else. Pure: state objects in, a
 * state out, so a check in Node can drive it.
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

import { thermalMode } from './sensors.js';

export const HUD_STATES = ['MANUAL', 'ASSIST', 'SEARCH', 'TRACK', 'THERMAL', 'DEGRADED'];

/* The picture is no use to fly or to track by from this much snow: the
 * same line src/game/signal.js draws for its own snow. */
const VIDEO_SNOW_MAX = 0.5;

/*
 * Each cause of DEGRADED, in the order the HUD names them: a test of the
 * systems' state, and the reason's id (avionics.hud.why.<id>).
 */
const CAUSES = [
  ['link', (t) => t.link.state !== 'ok'],
  ['video', (t) => t.video.lost || t.video.snow >= VIDEO_SNOW_MAX],
  ['nav', (t) => t.nav.source === 'DR'],
  ['battery', (t) => t.battery.state === 'critical'],
];

/*
 * Into `out` ({ state, reasons: [] }): tel FlightTelemetry's state, sensor
 * SensorManager's, snap TrackManager's snapshot, aiOn the pilot's switch.
 */
export function hudStateOf(tel, sensor, snap, aiOn, out) {
  out.reasons.length = 0;
  for (const [id, test] of CAUSES) {
    if (test(tel)) {
      out.reasons.push(id);
    }
  }
  if (out.reasons.length) {
    out.state = 'DEGRADED';
  } else if (aiOn) {
    out.state = snap.primaryId != null ? 'TRACK' : 'SEARCH';
  } else if (thermalMode(sensor.mode) && sensor.mainView === 'sensor') {
    /* Only when the thermal picture is the main view: by default it is
     * the inset, and the ink stays as it is over the pilot's picture. */
    out.state = 'THERMAL';
  } else if (tel.flightMode === 'angle' || tel.flightMode === 'stab') {
    out.state = 'ASSIST';
  } else {
    out.state = 'MANUAL';
  }
  return out;
}
