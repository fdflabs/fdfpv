/*
 * kits-replay.js: the physics-zero guarantee's flight half (docs/KITS.md
 * section 5, check 3). The contact golden's recorded throws
 * (scripts/contact-golden.js, tests/fixtures/contact-golden.json, all on
 * the interceptor) are flown again with every kit option and the lights
 * fitted, a set at a time, and each set's per step state hashes (state
 * in, ground handed over, state out) must equal the STOCK record bit for
 * bit. Between them the sets fit every option of every interceptor slot.
 *
 * usage: node scripts/kits-replay.js [set]   (set: a, b or c; all three by default)
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

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slotsFor } from '../configs/kits.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const LIGHTS = { v: 1, led: '#00b7ff', pattern: 'chase', glow: '#ff2bd6' };
const SETS = {
  a: { arms: 'cutout', top: 'vented', antenna: 'dualt' },
  b: { arms: 'blade', top: 'armoured', antenna: 'pagoda' },
  c: { arms: 'tapered', top: 'vented', antenna: 'pagoda' },
};

/* Every option of every slot is in some set, so a slot added later and
 * left out here fails this rather than passing unflown. */
const missing = slotsFor('interceptor').flatMap((s) => s.options.slice(1)
  .filter((o) => !Object.values(SETS).some((set) => set[s.id] === o)).map((o) => `${s.id}:${o}`));
if (missing.length) {
  console.log(`FAIL  options no set flies: ${missing.join(', ')}`);
  process.exit(1);
}

const want = process.argv[2] ? [process.argv[2]] : Object.keys(SETS);
let failed = 0;
for (const id of want) {
  const livery = { interceptor: { kit: { v: 1, parts: SETS[id] }, lights: LIGHTS } };
  console.log(`set ${id}: ${JSON.stringify(livery)}`);
  const run = spawnSync(process.execPath, [join(root, 'scripts', 'contact-golden.js')], {
    cwd: root, stdio: 'inherit', env: { ...process.env, CONTACT_LIVERY: JSON.stringify(livery) },
  });
  if (run.status !== 0) {
    failed += 1;
    console.log(`FAIL  set ${id}: the throws with this kit are not the stock record`);
  } else {
    console.log(`ok    set ${id}: every throw bit identical to the stock record`);
  }
}
console.log(`${want.length - failed} of ${want.length} sets identical to stock`);
process.exit(failed ? 1 : 0);
