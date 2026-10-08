/*
 * registry-selftest.js: pin configs/registry.js, the tune list. Plain
 * Node, no browser. Run with npm run registry:selftest.
 *
 * Tune ids go into stored settings, so the table is recorded whole, with
 * which tunes each aircraft is offered, how an id resolves and where its
 * diff is fetched from (relative to configs/, so the digest does not
 * depend on the checkout's path). The digest moves when a tune is added or
 * changed on purpose; update it in the same commit and say so. See
 * scripts/lib/transcript.js for how to read a failure.
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

import * as R from '../configs/registry.js';
import { AIRFRAME_IDS } from '../configs/airframes.js';
import { canon, transcript } from './lib/transcript.js';

const t = transcript();
const base = new URL('../configs/', import.meta.url).href;

for (const name of Object.keys(R).sort()) t.note(`export ${name}`, R[name]);

for (const id of [...AIRFRAME_IDS, '5inch', 'bogus', '', undefined, null]) {
  t.rec(`tunesFor ${canon(id)}`, () => R.tunesFor(id).map((tune) => tune.id));
}
for (const id of [...R.TUNES.map((tune) => tune.id), R.CUSTOM_TUNE.id, 'betaflight-default', 'bogus', '', undefined, null]) {
  t.rec(`tuneById ${canon(id)}`, () => R.tuneById(id).id);
  t.rec(`tunePath ${canon(id)}`, () => {
    const href = R.tunePath(id);
    return href.startsWith(base) ? href.slice(base.length) : `outside configs/: ${href}`;
  });
}

t.finish('configs/registry.js', '98cd68e27a0f844378f6dd35df94cdfea64ab7dc1748fbd0a755212a625675d7');
