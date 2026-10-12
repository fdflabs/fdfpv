/*
 * figures-plant-sweep.js: every catalogue figure not yet proven on the
 * plant, flown by the person paced pilot on the Extra 330 in Manual, and
 * what the detector and the judge make of it. It measures, it does not
 * gate: docs/TRICKS-CATALOG.md ("Plant sweep") records the answers and
 * what each one says needs tuning, in the detector, the judge, the pilot
 * program or the physics. One thing it does gate: a figure it has named
 * before (tests/figures-sweep-named.json) must still be named, or it
 * exits 1, so a change cannot lose one silently.
 *
 *   node scripts/figures-plant-sweep.js [--only id,id] [--trace]
 *
 * The pilot is figures-plant-check.js's: it sees the aircraft 0.2 s late
 * (McRuer and Jex 1967), moves the sticks twenty times a second in
 * fiftieths, and lets a rotation go early by what it has not seen yet. A
 * figure is a program of phases a pilot would call out to themselves
 * ("pull to the vertical, hold the line, kick the rudder..."), in
 * tests/lib/figureprograms.js.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROGRAMS, fly } from '../tests/lib/figureprograms.js';
import { FIGURES } from '../src/game/figures.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const trace = process.argv.includes('--trace');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',') : null;

const rows = [];
for (const f of FIGURES.filter((x) => x.physics === 'unproven' && PROGRAMS[x.id] && (!only || only.includes(x.id)))) {
  const r = await fly(PROGRAMS[f.id], { wasmBytes, configText, trace });
  /* Named at grade 0 is a figure a judge gives nothing: no pin protects it. */
  const hit = r.got.find((g) => g.figure === f.id && g.grade > 0);
  const zero = !hit && r.got.some((g) => g.figure === f.id);
  const named = r.got.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing';
  rows.push({ id: f.id, hit: Boolean(hit), grade: hit ? hit.grade : null, named, finished: r.finished, minZ: r.minZ });
  const end = r.crashed ? ' (CRASHED, program unfinished)' : r.finished ? '' : ' (program unfinished)';
  console.log(`${hit ? 'NAMED ' : zero ? 'ZERO  ' : 'MISSED'} ${f.id.padEnd(20)} ${hit ? `grade ${hit.grade}` : ''}  flew: ${named}${end}  lowest ${r.minZ.toFixed(0)} m`);
}
const n = rows.filter((r) => r.hit).length;
console.log(`\nfigures plant sweep: ${n} of ${rows.length} named as flown`);

const pinned = JSON.parse(await readFile(join(root, 'tests/figures-sweep-named.json'), 'utf8')).named;
const swept = new Set(FIGURES.filter((x) => x.physics === 'unproven' && PROGRAMS[x.id]).map((x) => x.id));
/* A pinned figure the sweep no longer flies has been promoted or lost its
 * program: either way the pin is stale and says so. */
const stale = pinned.filter((id) => !swept.has(id));
const lost = rows.filter((r) => pinned.includes(r.id) && !r.hit).map((r) => r.id);
const fresh = rows.filter((r) => r.hit && !pinned.includes(r.id)).map((r) => r.id);
if (fresh.length) console.log(`newly named (pin them in tests/figures-sweep-named.json): ${fresh.join(', ')}`);
if (stale.length) console.log(`FAIL pinned but not swept (promoted to flown or no program; unpin): ${stale.join(', ')}`);
if (lost.length) console.log(`FAIL named before and not now: ${lost.join(', ')}`);
process.exit(stale.length || lost.length ? 1 : 0);
