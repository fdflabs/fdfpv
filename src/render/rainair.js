/*
 * rainair.js: how much rain thickens the air, for every map's look
 * (swiss2/post.js's aerial perspective, the alps' linear fog).
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
 * Rain's extinction, per metre, at rain intensity `wet` (0 to 1, the
 * weather's out.wet, docs/WEATHER-CONTRACT.md). Measured visibility in
 * rain falls as a power of the rate: MOR = 13.0 R^-0.58 km, R in mm/h
 * (Montero-Martinez and Garcia-Garcia 2025, Atmosfera 39:247, the
 * power law of Atlas 1953; their other site fits 19.5 R^-0.77), and
 * MOR is where a beam keeps 5%, so the extinction is ln 20 / MOR, about
 * 3 / MOR (WMO No. 8). A front's middle (wet 1) rains RAIN_MM_H, heavy
 * convective rain: MOR 2.0 km against the dry air's 40 to 70; wet 0.1 is
 * 2.5 mm/h, 7.6 km. Grey: raindrops are far larger than light's
 * wavelength, so every channel loses alike.
 */
export const RAIN_MM_H = 25;
export function rainBeta(wet) {
  return 3 / (13000 * (RAIN_MM_H * wet) ** -0.58);
}
