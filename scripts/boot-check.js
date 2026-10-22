/*
 * boot-check.js: the boot path's shape. It guarded the order of the boot
 * fetches and the board's read deadline while boot asked the board for a
 * linked track before dist/sim.wasm; that read left with the track
 * builder and the race (the combat-only cut, 2026-10-20). What stays is
 * what boot still does: the sim stage is announced only once it is live,
 * a thrown frame is caught and reported, and main.js has one entry point.
 *
 * The checks read source text, which is a weak test: it exists because
 * the alternative was no test.
 *
 * Run with npm run lint:boot.
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

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFile(join(root, rel), 'utf8');

const main = await read('src/main.js');

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail });
};

/*
 * The loading screen's report starts a stage when it is not the current
 * one, so an ungated progress callback on a fetch that overlaps another
 * stage would show "Flight controller" while that stage is the holdup.
 */
{
  const gated = /if \(simStageLive\) \{\s*\n\s*loading\.report\('sim'/.test(main);
  record('the sim stage is not announced early',
    gated && main.includes('simStageLive = true;'),
    gated ? 'progress is gated on the stage being live' : 'the progress callback is ungated, so it steals the stage');
}

/*
 * The loop schedules the next frame first so a slow frame does not stop
 * it, which also meant a throwing frame did not stop it: the picture
 * froze, the console filled with one identical error per frame, and the
 * pilot was told nothing.
 */
{
  const wrapped = /function frame\(nowWall\) \{\s*\n\s*requestAnimationFrame\(frame\);\s*\n\s*try \{\s*\n\s*frameBody\(nowWall\);/.test(main);
  record('a thrown frame is caught and reported',
    wrapped && main.includes('window.__frameFault'),
    wrapped ? 'frameBody runs inside a try, and the fault reaches the bug report' : 'the frame body is not wrapped');
}

/*
 * main.js used to end by calling boot() with no argument, which threw on
 * every load and appended a failure banner that a microtask later was
 * wiped by the UI build: invisible by accident, not by design.
 */
{
  const stray = main.includes('\nboot().catch(');
  record('main.js has no second entry point', !stray,
    stray ? 'boot() is still called at module scope and still throws' : 'boot.js owns the entry');
}

const width = Math.max(...results.map((r) => r.name.length));
console.log('boot-check: the shape of the boot path');
console.log('');
for (const r of results) {
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
const passed = results.filter((r) => r.ok).length;
console.log('');
console.log(`${passed} of ${results.length} checks clean`);

/* An abandoned fetch holds a socket open and Node will not exit while it does. */
process.exit(passed === results.length ? 0 : 1);
