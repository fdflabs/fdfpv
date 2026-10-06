/*
 * itaipu-courses.js: the two courses Itaipu ships with (docs/ITAIPU-PLAN.md
 * section 11), written as the in-sim builder's own documents.
 *
 *   node scripts/itaipu-courses.js            write docs/itaipu-courses/*.json
 *   node scripts/itaipu-courses.js --check    exit 1 if a written one differs
 *
 * Each course is a list of gates by the centre of their opening in the
 * world (x, y, z, metres) and the way they are flown through: a level
 * heading, or for the quads' climbs and dives a heading and a pitch. The
 * gates are placed with the builder's own functions (src/builder/course.js
 * addGate), so a document here is exactly what the builder saves, and
 * scripts/itaipu-spawns-check.js loads each in the builder and flies it.
 *
 * ITAIPU RUN, the planes' course, 30 m hoops: over the reservoir toward the
 * main dam, over its crest, down past the penstocks to the tailrace, down
 * the canyon, round under the spillway's plume and up its chute, over the
 * gates' bridge and the right wing, and back out over the reservoir. The
 * plan starts it at the air spawn, 3 km north of the crest, but a lap has
 * to come back through its start, and 3 km each way is a 9 km lap: it
 * starts 850 m north of the crest instead.
 *
 * POWERHOUSE, the quads' course: along the powerhouse roof, up the gap
 * between two penstocks, over the crest, east along the crest road, down
 * another gap, and back along the tailrace under the roof's edge.
 *
 * The ids and the dates are fixed so the documents are the same every time
 * this runs.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addGate, headingOf, newCourse, openingCentre, qAxis, qMul,
} from '../src/builder/course.js';
import { toPlain } from '../src/trackbuilder/model.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'docs', 'itaipu-courses');
const STAMP = '2026-09-29T00:00:00.000Z';

/* A gate: its type, its opening's centre, the direction it is flown
 * through in plan (fx, fz, normalised here) and how far that climbs,
 * radians. A gate standing on a roof or the crest road is given by its
 * base instead, at the surface's height (`stand`). */
const g = (type, x, y, z, fx, fz, pitch = 0) => ({
  type, x, y, z, fx, fz, pitch, base: false,
});
const stand = (type, x, y, z, fx, fz) => ({
  type, x, y, z, fx, fz, pitch: 0, base: true,
});
/* The powerhouse roof and the crest road (docs/ITAIPU-PLAN.md section 6). */
const ROOF_Y = 148;
const CREST_Y = 225;

export const COURSES = [
  {
    file: 'itaipu-run.json',
    id: 'itaipu-run-planes',
    name: 'Itaipu run',
    gates: [
      g('hoop30', 450, 280, -2500, -0.42, 0.91),
      g('hoop30', 100, 262, -1729, -0.213, 0.977),
      g('hoop30', -150, 150, -1350, -0.45, 0.89),
      g('hoop30', -450, 150, -800, -0.55, 0.83),
      g('hoop30', -760, 170, -450, -0.4, -0.92),
      g('hoop30', -900, 215, -800, -0.3, -0.95),
      g('hoop30', -990, 262, -1030, -0.2, -0.98),
      g('hoop30', -760, 262, -1550, 0.45, -0.89),
      g('hoop30', -300, 262, -2300, 0.93, -0.36),
    ],
  },
  {
    file: 'powerhouse.json',
    id: 'itaipu-powerhouse-quads',
    name: 'Powerhouse',
    gates: [
      stand('gate', -150, ROOF_Y, -1670, 0.9746, 0.2238),
      g('hoop250', -30, 172, -1650, 0.8, -0.6),
      g('hoop250', 34.9, 173.1, -1682.2, 0.212, -0.977, 0.8),
      g('hoop250', 45, 250, -1738, 0.212, -0.977),
      g('hoop250', 200, 232, -1707, 0.977, 0.213),
      g('hoop250', 304, 236, -1672, -0.213, 0.977, -0.9),
      g('hoop250', 300.1, 173.1, -1621.9, -0.213, 0.977, -0.1),
      g('hoop250', 200, 155, -1515, -0.977, -0.213),
      g('hoop250', -60, 112, -1540, -0.977, -0.213),
      g('hoop250', -300, 152, -1600, -0.6, -0.8),
    ],
  },
];

/* The builder's document for one course. */
export function courseDocument(c) {
  const doc = newCourse('itaipu', c.name);
  doc.id = c.id;
  doc.createdUtc = STAMP;
  doc.modifiedUtc = STAMP;
  for (const s of c.gates) {
    const n = Math.hypot(s.fx, s.fz);
    /* Heading first, then the climb about the gate's own across axis:
     * at rest a gate is flown along -z, and a turn about +x lifts that. */
    const quat = qMul(qAxis(0, 1, 0, headingOf(s.fx / n, s.fz / n)), qAxis(1, 0, 0, s.pitch));
    /* Where the opening's centre sits from the base, measured on a gate
     * placed at the origin of a document thrown away. */
    const o = s.base ? { x: 0, y: 0, z: 0 }
      : openingCentre(addGate(newCourse('itaipu', 'probe'), s.type, { x: 0, y: 0, z: 0 }, quat));
    addGate(doc, s.type, { x: s.x - o.x, y: s.y - o.y, z: s.z - o.z }, quat);
  }
  return toPlain(doc);
}

async function main() {
  const check = process.argv.includes('--check');
  await mkdir(OUT, { recursive: true });
  let stale = 0;
  for (const c of COURSES) {
    const text = `${JSON.stringify(courseDocument(c), null, 2)}\n`;
    const path = join(OUT, c.file);
    if (check) {
      const had = await readFile(path, 'utf8').catch(() => '');
      const same = had === text;
      console.log(`${same ? 'ok  ' : 'STALE'} ${c.file}: ${c.gates.length} gates`);
      stale += same ? 0 : 1;
    } else {
      await writeFile(path, text);
      console.log(`wrote ${path}: ${c.gates.length} gates`);
    }
  }
  if (stale) {
    console.error(`${stale} document(s) differ from what this script writes; run it without --check`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
