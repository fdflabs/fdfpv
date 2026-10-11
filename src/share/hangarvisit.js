/*
 * hangarvisit.js: what another pilot may see of a hangar
 * (docs/HANGAR-VISITS.md), built from the account's synced blob
 * (src/share/progressmerge.js, its `data`) by an ALLOW LIST: every field is picked
 * out and checked, never the blob with things deleted from it, so a key a
 * later version adds to the blob cannot leak through here.
 *
 * The owner's switch is the synced section `hangarVisit`: { on, airframe },
 * airframe the one seated when they last walked into their hangar. A blob
 * without it (every blob before this section existed) is closed.
 *
 * Pure and DOM free: tracks-api/accounts.js answers GET /api/hangar/<callsign>
 * with it and its selftest runs it in Node.
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

import { airframeById } from '../../configs/airframes.js';
import { liveryKey } from '../../configs/liveries.js';
import { levelOf } from '../game/progress.js';
import { tierFor } from '../game/hangarroom.js';

const isRecord = (o) => Boolean(o) && typeof o === 'object' && !Array.isArray(o);
const ID_RE = /^[a-z0-9_-]{1,40}$/;
/* The most firsts a visit carries: the wall shows eighteen. */
const FIRSTS_MAX = 200;

/* Whether the blob's owner lets others visit. */
export function visitsOpen(blob) {
  return isRecord(blob) && isRecord(blob.hangarVisit) && blob.hangarVisit.on === true;
}

/*
 * The visit, or null when the hangar is closed: { callsign, tier,
 * airframe, look, parts, firsts }. look and parts are the seated
 * aircraft's own entries (null when it has none); firsts the keys only.
 */
export function visitOf(blob, callsign) {
  if (!visitsOpen(blob)) {
    return null;
  }
  const want = blob.hangarVisit.airframe;
  const airframe = typeof want === 'string' && ID_RE.test(want) ? airframeById(want).id : null;
  const p = isRecord(blob.progress) ? blob.progress : {};
  const xp = Number.isFinite(p.xp) && p.xp >= 0 ? p.xp : 0;
  const entry = (section) => {
    if (!airframe || !isRecord(blob[section])) {
      return null;
    }
    const e = blob[section][liveryKey(airframe)] ?? blob[section][airframe];
    return isRecord(e) ? JSON.parse(JSON.stringify(e)) : null;
  };
  const firsts = isRecord(p.firsts) ? Object.keys(p.firsts).filter((k) => p.firsts[k] === true && k.length <= 80).slice(0, FIRSTS_MAX) : [];
  return {
    callsign: String(callsign),
    tier: tierFor(levelOf(xp), p.unlockAll === true),
    airframe,
    look: entry('livery'),
    parts: entry('parts'),
    firsts,
  };
}
