/*
 * sensors.js: the SensorManager, the camera as a sensor (docs/AVIONICS-HUD.md
 * section 5): which mode it looks with, its zoom, exposure, stabilisation,
 * recording, and the picture in the picture.
 *
 * STUB. The lead's stand in with the exact interface, so the HUD runs end
 * to end before agent 2's thermal work lands: it keeps the state and cycles
 * it, draws nothing and changes nothing in the picture. Agent 2 replaces
 * the body and keeps the exports.
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

export const SENSOR_MODES = ['eo', 'ir-wh', 'ir-bh', 'lowlight', 'fusion', 'contrast'];
export const ZOOM_LEVELS = [1, 2, 4];

/* The modes whose picture is thermal, in whole or in part. */
export function thermalMode(mode) {
  return mode === 'ir-wh' || mode === 'ir-bh' || mode === 'fusion';
}

export function createSensorManager({ camera }) {
  const state = {
    mode: 'eo',
    zoom: 1,
    zoomLevels: ZOOM_LEVELS,
    fovRad: camera ? (camera.fov * Math.PI) / 180 : 1,
    exposure: { auto: true, ev: 0 },
    stab: true,
    rec: { on: false, s: 0 },
    pipMode: 'ir-wh',
    healthy: true,
    noise: 0,
  };
  let lastT = null;
  return {
    state,
    pip: null,
    update(tS) {
      if (state.rec.on && lastT !== null && tS > lastT) {
        state.rec.s += tS - lastT;
      }
      lastT = tS;
      if (camera) {
        state.fovRad = (camera.fov * Math.PI) / 180 / state.zoom;
      }
    },
    cycleMode() {
      state.mode = SENSOR_MODES[(SENSOR_MODES.indexOf(state.mode) + 1) % SENSOR_MODES.length];
    },
    cycleZoom() {
      state.zoom = ZOOM_LEVELS[(ZOOM_LEVELS.indexOf(state.zoom) + 1) % ZOOM_LEVELS.length];
    },
    toggleRec() {
      state.rec.on = !state.rec.on;
      if (state.rec.on) {
        state.rec.s = 0;
      }
    },
  };
}
