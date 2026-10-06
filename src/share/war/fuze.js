/*
 * fuze.js: how close a defender's warhead goes off, by airframe and
 * warhead (docs/WARFARE-PLAN.md section 4.3). The room (edge/rooms/war.js)
 * is the authority: it judges every detonation and every chained kill
 * with fuzeM, and sends each seat's own radius in its view (`fuze`), which
 * the client draws as IN RANGE (src/ui/warmarkers.js, src/ui/avionicshud.js).
 *
 * A GAMEPLAY CHOICE, NOT A PHYSICAL MODEL. The radii grow with the payload
 * a class carries (configs/airframes.js combat.payloads, massKg), so a
 * bigger aircraft's warhead reaches further, but no number here is derived
 * from explosive physics. They were picked for play on 2026-10-01 and are
 * tuned with npm run war:balance, nothing else.
 *
 * The distance is the room's: from the nearest part box of the defender
 * (configs/hulls.js) to the attacker's centre, src/game/midair.js within
 * and hullDistance. A detonation also kills every other attacker within
 * the same radius of the attacker it went off on.
 *
 * Every radius is at least BLAST_M (src/share/war/routes.js), the bubble
 * every warhead had before, so no airframe's reach got shorter; the hunters'
 * terminal clearance (edge/rooms/warhunt.js) leans on that.
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

import { BLAST_M } from './routes.js';

/*
 * Metres, by airframe id, then warhead (edge/rooms/war.js WARHEADS). An
 * airframe not named here flies the FPV row: the 5 and 7 inch, the
 * interceptor (whose one payload, `proximity`, carries the standard
 * warhead), and every hangar aircraft without a combat block. The
 * penetrator is a focused charge, a step under the class's standard; the
 * EMP goes off as a standard warhead.
 */
const FPV = Object.freeze({ standard: BLAST_M, wide: 9, penetrator: BLAST_M, emp: BLAST_M });
export const FUZE_M = Object.freeze({
  '10inch': Object.freeze({ standard: 7, wide: 10, penetrator: 6, emp: 7 }),
  striker2500: Object.freeze({ standard: 9, wide: 12, penetrator: 8, emp: 9 }),
});

/* The radius a seat's warhead goes off at: its airframe's row, the
 * standard warhead's for a warhead the row does not know. */
export function fuzeM(airframe, warhead) {
  const row = Object.prototype.hasOwnProperty.call(FUZE_M, airframe) ? FUZE_M[airframe] : FPV;
  return row[warhead] ?? row.standard;
}
