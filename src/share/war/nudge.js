/*
 * nudge.js: the war's guide nudge (docs/campaign/WAR-NUDGE.md): when a
 * pilot has made no progress for a while, CREST says where the attacker
 * nearest the mission's targets is, as a clock bearing off the nose and a
 * distance. The war's view carries every live attacker openly (roomwar
 * attackersAt), so unlike the ops guide there is no quiet rule to keep:
 * the threat named is the one the radar already draws.
 *
 * When a nudge is due is the ops guide's createNudger (src/share/ops/
 * guide.js), unchanged, so the two campaigns pace their nudges alike.
 * Pure: no DOM, no clock of its own, runs in Node.
 *
 * Positions in are scene metres (y up, -z north), as the room's attackers
 * and the mission's targets are; out, the ground plane as guide.js reads
 * it, [east, north].
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

import { clockOf } from '../ops/guide.js';

export { createNudger } from '../ops/guide.js';

/* The distance bands a nudge can say, metres, each its line (lines.json
 * war-g-dist-*): the first band the distance is under. */
export const DIST_BANDS = [
  [750, 'war-g-dist-500'], [1500, 'war-g-dist-1k'], [2500, 'war-g-dist-2k'],
  [4000, 'war-g-dist-3k'], [6500, 'war-g-dist-5k'], [Infinity, 'war-g-dist-far'],
];

/* A scene position on the ground plane, [east, north]. */
export const ground = (p) => [p[0], -p[2]];

/* A scene forward vector as a bearing, rad clockwise from north. */
export const headingOf = (fwd) => Math.atan2(fwd[0], -fwd[2]);

/*
 * The live attacker nearest any of the mission's targets (the guide
 * lines' rule: "the closest to the dam first"): { id, at: [east, north],
 * d } with d its distance to that target, or null when none is alive.
 * live: [{ id, p: [x, y, z] }]; targets: { id: { at: [x, y, z] } }.
 */
export function threatOf(live, targets) {
  const ats = Object.values(targets || {}).map((t) => ground(t.at));
  let best = null;
  for (const a of live || []) {
    const g = ground(a.p);
    for (const t of ats) {
      const d = Math.hypot(g[0] - t[0], g[1] - t[1]);
      if (!best || d < best.d) {
        best = { id: a.id, at: g, d };
      }
    }
  }
  return best;
}

/* The distance band's line for d metres. */
export const distLine = (d) => DIST_BANDS.find(([upTo]) => d < upTo)[1];

/* What a nudge says about a threat from here (ground, [east, north]) on
 * this heading: one radio item, or null with no threat. */
export function nudgeOf(threat, here, heading) {
  if (!threat) {
    return null;
  }
  const d = Math.hypot(threat.at[0] - here[0], threat.at[1] - here[1]);
  return ['war-g-next', `war-g-clock-${clockOf(here, threat.at, heading)}`, distLine(d)];
}
