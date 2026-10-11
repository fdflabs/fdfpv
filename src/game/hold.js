/*
 * hold.js: the Hercules' cargo hold (docs/HERCULES-CONTRACT.md, lead
 * decision 2026-10-09). Eight loads of paradrop.js's 250 g, two abreast
 * on the cargo floor, four deep about the CG, each a point mass at its
 * own place, which the plant takes as add-ons (sim_set_addons): a full
 * hold is 2.0 kg on a 6.73 kg aircraft, 30 percent, the full size's
 * payload share (42,000 lb on a 155,000 lb C-130H, 27 percent, the USAF
 * fact sheet). They leave by the ramp aft pair first, so the CG walks
 * forward as the hold empties. Reloaded when the aircraft stands on the
 * ground.
 *
 * Body frame, the plant's: x forward, y left, z up, metres from the
 * table's CG.
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

import { LOAD } from './paradrop.js';

export const HOLD_LOADS = 8;
/* The cargo floor 0.03 m over the belly (0.195 m under the CG), a load's
 * centre half its side over that; the rows 0.05 m each side; the pairs
 * 0.10 m apart from 0.05 m ahead of the CG back to 0.25 m behind it, the
 * packs filling the floor ahead of them (scripts/hercules-derive.js). */
const FLOOR_Z = -0.195 + 0.03 + LOAD.side / 2;
const PAIR_X = [0.05, -0.05, -0.15, -0.25];

/* Where load i sits, 0 the forward left one; the last two out are the
 * forward pair. */
function station(i) {
  return [PAIR_X[i >> 1], (i & 1) ? -0.05 : 0.05, FLOOR_Z];
}

/* The loads still aboard with n of them left, as add-on points: the
 * forward n of the eight, since they go aft pair first. */
export function holdPoints(n) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    pts.push({ kg: LOAD.mass, at: station(i), cda: 0 });
  }
  return pts;
}

/* The CG's move and the added mass with n aboard, for the doc and the
 * gate: the add-ons' own figures. */
export function holdShift(n, baseKg) {
  let m = 0;
  let mx = 0;
  for (const p of holdPoints(n)) {
    m += p.kg;
    mx += p.kg * p.at[0];
  }
  return { kg: m, dx: mx / (baseKg + m) };
}
