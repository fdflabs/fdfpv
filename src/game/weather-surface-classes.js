/*
 * weather-surface-classes.js: the ground classes the weather knows
 * (docs/WEATHER-CONTRACT.md, "The surface"), shared by the baked grids
 * (scripts/weather-surface-build.js) and the air (weather.js).
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

/* water: lakes, rivers, the reservoir. forest: tree cover and wetland.
 * open: pasture, crops, shrub, meadow. bare: bare soil, rock, scree and
 * built ground. snow: lying snow. */
export const CLASS = {
  water: 0,
  forest: 1,
  open: 2,
  bare: 3,
  snow: 4,
};
