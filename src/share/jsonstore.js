/*
 * jsonstore.js: a JSON value kept under one localStorage key, read and
 * written so that a refusal is an answer and never a throw.
 *
 * It lived in trackseat.js, the share seat's store, until that left with
 * the track builder (the combat-only cut, 2026-10-20); the rate presets
 * keep their library through it (configs/ratepresets.js).
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

/* The parsed value under `key`, or `fallback` when there is none, it is
 * not JSON, or storage refuses to be read. */
export function readJson(key, fallback) {
  let text;
  try {
    text = localStorage.getItem(key);
  } catch (e) {
    return fallback;
  }
  if (!text) {
    return fallback;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

/* False when storage refuses the write (private mode, full quota) or the
 * value cannot be written as JSON. */
export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    return false;
  }
  return true;
}
