/*
 * music-crates.js: the two crates as they stood before 2026-10-06, as data
 * for the tests that drive src/render/music.js through a walk, a skip and a
 * warm. Since the recorded music came out of the game (NOTICE) the real
 * crates are empty, and a player with nothing to play leaves those paths
 * unexercised. Ids and loudness figures only: no audio is fetched, and none
 * of these files exist any more.
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

export const FLIGHT = [
  { id: 'tarmac-pulse', name: 'Tarmac Pulse', lufs: -13.0 },
  { id: 'neon-horizon', name: 'Neon Horizon', lufs: -17.2 },
  { id: 'pace-shift-skyline', name: 'Pace Shift Skyline', lufs: -13.5 },
  { id: 'fractal-current', name: 'Fractal Current', lufs: -16.5 },
  { id: 'subway-rattle', name: 'Subway Rattle', lufs: -14.4 },
  { id: 'shroom-spiral', name: 'Shroom Spiral', lufs: -14.0 },
  { id: 'barnstorm-break', name: 'Barnstorm Break', lufs: -15.6 },
  { id: 'bluegrass-circuit', name: 'Bluegrass Circuit', lufs: -14.0 },
  { id: 'celtic-riser', name: 'Celtic Riser', lufs: -13.3 },
  { id: 'driving-tension', name: 'Driving Tension', lufs: -14.3 },
  { id: 'gritty-breakbeats', name: 'Gritty Breakbeats', lufs: -13.5 },
  { id: 'hypnotic-acid-loop', name: 'Hypnotic Acid Loop', lufs: -13.4 },
  { id: 'prop-wash', name: 'Prop Wash', lufs: -13.8 },
  { id: 'ground-effect', name: 'Ground Effect', lufs: -13.7 },
];

export const MENU = [
  { id: 'neon-gate', name: 'Neon Gate', lufs: -14.2 },
  { id: 'neon-gate-take-2', name: 'Neon Gate Take 2', lufs: -13.6 },
];
