/*
 * itaipu-4.js: Defend the Paraná, act 1, mission 4, "Night raid": the
 * drill's rounds, routes and targets (itaipu-drill.js, mission 1 as it
 * was before First Light), at night, until its own design
 * (docs/campaign/MISSIONS.md M4). `night: true` is the flag the client's
 * lighting reads (src/share/roomwar.js night()).
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

import drill from './itaipu-drill.js';

export default {
  ...drill,
  id: 'itaipu-4',
  /* A string key (src/strings): Night raid. */
  title: 'war.mission.itaipu_4',
  /* Minutes, low and high, a squad takes (docs/campaign/MISSIONS.md 2);
   * Operations' briefing shows it (src/ui/briefing.js). */
  estimatedMinutes: [12, 16],
  night: true,
  radio: { brief: ['brief-itaipu-4-1', 'brief-itaipu-4-2'], win: 'debrief-itaipu-4-win', lose: 'debrief-itaipu-4-lose' },
  /* The countdown's extra length (war.js start). The client rebuilds its
   * world at night when the countdown begins (src/main.js warNightFrame)
   * and seats its pilot only once that is done, so a rebuild that ends
   * after the go seats the pilot after it, spawn protected into the live
   * war. Measured in war:twopage: 2.7 to 4.1 s idle, 6.1 to 6.3 s with 16
   * other workers on the CPU, where with no extra time it ended 0.3 s
   * after the go and seated both pilots 1.7 s into the war. */
  prepMs: 15000,
};
