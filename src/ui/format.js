/*
 * format.js: how the shell writes times and dates.
 *
 *   formatTime      a lap: m:ss.hh, or s.hh under a minute. Hundredths,
 *                   because laps are won and lost in them.
 *   formatDelta     a gap between laps, signed, in formatTime's shape
 *   formatRunClock  the freestyle run's countdown: m:ss, whole seconds
 *                   rounded up so it reads 0:00 exactly as the run ends.
 *                   No hundredths: it is redrawn every frame, and a
 *                   number changing a hundred times a second only jitters.
 *   formatDay       the day a track was saved, in the pilot's language
 *
 * Anything that is not a time prints as dashes (or nothing, for a gap),
 * so a missing best lap reads as missing rather than as zero.
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

import { currentLocale } from '../strings/index.js';

/* Only a finite number is a time: no coercion of strings or null. */
const isTime = (ms) => Number.isFinite(ms);

export function formatTime(ms) {
  if (!isTime(ms)) return '--.--';
  const seconds = ms / 1000;
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds - minutes * 60).toFixed(2);
  return minutes > 0 ? `${minutes}:${rest.padStart(5, '0')}` : rest;
}

export function formatDelta(ms) {
  if (!isTime(ms)) return '';
  const sign = ms < 0 ? '-' : ms > 0 ? '+' : '';
  return sign + formatTime(Math.abs(ms));
}

/* An untimed run reports Infinity, which has no clock to show. */
export function formatRunClock(ms) {
  if (!Number.isFinite(ms)) return '--:--';
  const seconds = Math.ceil(Math.max(ms, 0) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatDay(utc) {
  const when = new Date(utc);
  if (!Number.isFinite(when.getTime())) return '';
  return when.toLocaleDateString(currentLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
}
