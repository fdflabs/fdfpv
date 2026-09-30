/*
 * itaipu-4.js: Defend the Paraná, act 1, mission 4, "Night raid":
 * mission 1's targets, waves and routes, at night. `night: true` is the
 * flag the client's lighting reads (src/share/roomwar.js night(); the
 * Itaipu map's hook is to come, and until then the flag changes
 * nothing). The room plays it exactly as mission 1.
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

import itaipu1 from './itaipu-1.js';

export default {
  ...itaipu1,
  id: 'itaipu-4',
  /* A string key (src/strings): Night raid. */
  title: 'war.mission.itaipu_4',
  night: true,
};
