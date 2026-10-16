/*
 * held.js: an Act 1 or The Interior mission held in development for the
 * length of a check's block, so the checks still prove the release gate
 * (src/game/campaign.js released, edge/rooms/war.js start, gamelobby.js,
 * core.js, front.js create) now that every mission with a file is
 * available (the owner, 2026-10-15 for Act 1's 1 to 4, 2026-10-16 for
 * the rest: "make everything available to everyone"). released() reads
 * the module's own ACT1 and INTERIOR rows, not a room's mission table, so
 * a fixture mission outside them would never be held; the row's `release`
 * is set here and put back after, in this process only (a child server
 * or a browser page still sees the build's).
 *
 *   withHeld(['itaipu-2'], () => { ... })        sync or async, put back
 *                                                 when it returns, throws
 *                                                 or settles
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

import { ACT1, INTERIOR } from '../../src/game/campaign.js';

export function withHeld(ids, fn) {
  const rows = ids.map((id) => {
    const row = ACT1.find((m) => m.id === id) ?? INTERIOR.find((m) => m.id === id);
    if (!row || row.release === 'soon') {
      throw new Error(`held.js: ${id} is not an Act 1 or The Interior mission with a file`);
    }
    return [row, row.release];
  });
  const restore = () => rows.forEach(([row, was]) => { row.release = was; });
  rows.forEach(([row]) => { row.release = 'development'; });
  let out;
  try {
    out = fn();
  } catch (e) {
    restore();
    throw e;
  }
  if (out && typeof out.then === 'function') {
    return out.finally(restore);
  }
  restore();
  return out;
}
