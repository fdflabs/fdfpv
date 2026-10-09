/*
 * airframes-selftest.js: pin configs/airframes.js, the copy of record for
 * airframe ids, their order and their shape. Plain Node, no browser. Run
 * with npm run airframes:selftest.
 *
 * Ids go into stored settings, record keys and the board (the leaderboard's
 * craft table was built from this file), so the whole table is recorded,
 * key order and frozenness included, with every lookup over every id, the
 * retired ids and ids nobody has. The digest moves whenever an aircraft is
 * added or changed on purpose; update it in the same commit and say so.
 * See scripts/lib/transcript.js for how to read a failure.
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

import * as A from '../configs/airframes.js';
import { canon, transcript } from './lib/transcript.js';

const t = transcript();

for (const name of Object.keys(A).sort()) t.note(`export ${name}`, A[name]);

const IDS = [...A.AIRFRAME_IDS, '5inch', 'whoop65', 'wing1000', 'edge1524', 'pitts850', 'bogus', '', undefined, null, 7,
  'toString', 'constructor'];
for (const id of IDS) {
  const tag = canon(id);
  t.rec(`airframeById ${tag}`, () => A.airframeById(id).id);
  t.rec(`simIdFor ${tag}`, () => A.simIdFor(id));
  t.rec(`trackClassFor ${tag}`, () => A.trackClassFor(id));
  t.rec(`isWarAirframe ${tag}`, () => A.isWarAirframe(id));
  t.rec(`retiredAirframe ${tag}`, () => A.retiredAirframe(id));
  t.rec(`currentAirframeId ${tag}`, () => A.currentAirframeId(id));
  t.rec(`landPlaneOf ${tag}`, () => A.landPlaneOf(id));
  t.rec(`floatVersionOf ${tag}`, () => A.floatVersionOf(id));
  t.rec(`isFloatVersion ${tag}`, () => A.isFloatVersion(id));
}
for (const af of A.AIRFRAMES) t.rec(`airStartSpeed ${af.id}`, () => A.airStartSpeed(af));

// Each aircraft's objects are its own: changing one must not change another.
t.rec('rows do not share objects', () => {
  const seen = new Set();
  let shared = 0;
  for (const af of A.AIRFRAMES) {
    for (const v of Object.values(af)) {
      if (v && typeof v === 'object') {
        if (seen.has(v)) shared += 1;
        seen.add(v);
      }
    }
  }
  return shared;
});

t.finish('configs/airframes.js', '6e6d86ecd12ab8025e813d3cb12e222f460707df1d24da810589ff6dbdd219da');
