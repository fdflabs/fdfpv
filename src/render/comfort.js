/*
 * comfort.js: the camera's comfort settings as numbers. Pure, so the
 * shell, the settings loader and a selftest all read the same table.
 *
 * Camera shake scales the three shakes of the FPV picture together (the
 * lens's plate vibration, src/render/lens.js; the kick of a hit; a war
 * boom's buzz). 'on' is the measured picture and the default; 'reduced'
 * and 'off' are a pilot's opt out for motion sickness, a comfort choice
 * and not a model: the craft flies the same either way. A pilot whose
 * system asks for reduced motion and who never chose starts on 'reduced'.
 *
 * Chase smoothing is the chase camera's lag behind the aircraft, the time
 * constant of its exponential follow. 'standard' is the 120 ms the chase
 * camera always had.
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

export const SHAKE_LEVELS = ['on', 'reduced', 'off'];

/* A third of the picture's shake: enough to feel a hit, little enough not
 * to churn a stomach. Chosen, not measured. */
const SHAKE_SCALE = { on: 1, reduced: 1 / 3, off: 0 };

export function shakeScale(level) {
  return SHAKE_SCALE[level] ?? 1;
}

/* A stored level as it is; a missing or unknown one is 'on', or 'reduced'
 * for a system that asks for reduced motion. */
export function normaliseShake(raw, reducedMotion) {
  if (SHAKE_LEVELS.includes(raw)) {
    return raw;
  }
  return reducedMotion ? 'reduced' : 'on';
}

/* Whether the system asks for reduced motion; false where there is no
 * window to ask (Node). */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* The menus' size, percent: CSS zoom on every screen (index.html .screen),
 * because the sheet sizes its type in px and a root font size would move
 * nothing. The flight HUD keeps its size. */
export const UI_SCALES = [100, 115, 130];

export function normaliseUiScale(raw) {
  return UI_SCALES.includes(raw) ? raw : 100;
}

export const CHASE_SMOOTHING = ['tight', 'standard', 'smooth'];

const CHASE_LAG_MS = { tight: 60, standard: 120, smooth: 300 };

/* ms: the chase camera's follow time constant. */
export function chaseLagMs(level) {
  return CHASE_LAG_MS[level] ?? CHASE_LAG_MS.standard;
}
