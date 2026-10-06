/*
 * bands.js: what each of the sensor's picture modes is made of, as
 * numbers, for the two things that need them without a picture: what a
 * detector gets (src/avionics/sensors.js) and how much a still smears
 * (src/avionics/capture.js). Pure, so the checks read it in Node.
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

/*
 * WHAT A DETECTOR GETS FROM EACH MODE (docs/AVIONICS-SENSORS.md section 4).
 * native: the sensor's own pixels across the frame (a 1080p day camera, a
 * 1280 low light CMOS, a 640 thermal core). A detector looks at the
 * picture through a fixed 640 pixel input, so zoom brings more of the
 * native pixels onto a target until the crop has no more to give:
 * pxPerRad = min(native, 640 * zoom) / field.
 * contrast: how far a drone stands out of its background in that band, 0
 * to 1, by day and by night: an engine against a cold night is the
 * easiest thing a thermal camera ever sees, against sunlit concrete much
 * less so; a visible camera at night sees the lamps and little else.
 * light: whether the band needs light at all (thermal does not).
 * noise: the picture's own noise, by day and by night, before zoom and
 * snow add theirs.
 */
export const DETECTOR_PX = 640;
export const BAND = {
  eo: {
    tag: 'EO', native: 1920, contrast: [0.75, 0.12], light: true, noise: [0.04, 0.35],
  },
  contrast: {
    tag: 'EO', native: 1920, contrast: [0.85, 0.15], light: true, noise: [0.08, 0.4],
  },
  lowlight: {
    tag: 'EO', native: 1280, contrast: [0.6, 0.5], light: false, noise: [0.12, 0.3],
  },
  ir_wh: {
    tag: 'IR', native: 640, contrast: [0.6, 0.95], light: false, noise: [0.08, 0.08],
  },
  ir_bh: {
    tag: 'IR', native: 640, contrast: [0.6, 0.95], light: false, noise: [0.08, 0.08],
  },
  fusion: {
    tag: 'IR', native: 1920, contrast: [0.8, 0.95], light: false, noise: [0.08, 0.1],
  },
};

/*
 * How long each mode's picture integrates one frame, seconds, by day and
 * by night: what turns the picture's motion into smear. A day camera's
 * shutter runs fast in daylight and opens up toward a video frame at
 * night; the low light CMOS integrates long by design; an uncooled
 * thermal core's pixels answer with their own time constant, about 10 ms,
 * whatever the light. Acquisition and fusion take the day camera's.
 */
export const EXPOSURE_S = {
  eo: [0.002, 0.033],
  contrast: [0.002, 0.033],
  lowlight: [0.016, 0.033],
  ir_wh: [0.01, 0.01],
  ir_bh: [0.01, 0.01],
  fusion: [0.002, 0.033],
};
