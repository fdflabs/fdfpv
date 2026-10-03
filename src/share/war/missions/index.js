/*
 * index.js: every war mission, by id (docs/WARFARE-PLAN.md section 4.2).
 * The one table the room (edge/rooms/war.js) and the client
 * (src/share/roomwar.js) both read, so a mission the room can start is
 * always one every screen can fly. A new mission is a file beside this one
 * and a line here.
 *
 * A wave is { at, kind, n, per, route, target, spread }: n attackers for
 * one pilot and `per` more for each pilot after the first (waveSize), all
 * going for `target`, or, where it is a list, the k-th of them for
 * target[k % target.length] (waveTarget), so a group splits over several
 * and costs more than one target's megawatts when it gets through. The
 * room sizes a wave by the pilots at the go and writes each attacker's n
 * and target in its birth, so a screen never sizes one itself.
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
import itaipu2 from './itaipu-2.js';
import itaipu3 from './itaipu-3.js';
import itaipu4 from './itaipu-4.js';
import drill from './itaipu-drill.js';

/* Act 1 of the campaign, Defend the Paraná, in order, and after it the
 * drill (itaipu-drill.js), which no campaign offers. */
export const MISSIONS = Object.freeze(Object.fromEntries([itaipu1, itaipu2, itaipu3, itaipu4, drill].map((m) => [m.id, m])));

/* How many attackers a wave sends against `pilots` pilots (at least 1). */
export function waveSize(wave, pilots) {
  return Math.max(1, Math.round(wave.n + (wave.per || 0) * (Math.max(1, pilots) - 1)));
}

/* The target of a wave's k-th attacker, or null for a wave with none. */
export function waveTarget(wave, k) {
  const t = wave.target;
  return Array.isArray(t) ? t[k % t.length] : t ?? null;
}
