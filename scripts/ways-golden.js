/*
 * ways-golden.js: the title's ways in (src/ui/ways.js) held to a record
 * taken from the table and helpers as they stood inside src/ui/ui.js.
 *
 *     node scripts/ways-golden.js            compare
 *     node scripts/ways-golden.js --record   write tests/fixtures/ways-golden.json
 *
 * WAYS_MODULE names another module exporting the same names, which is how
 * the record was taken from the old code before the move. Recorded: the
 * whole WAYS table, the hubs and which cards each shows, the hub of every
 * action, the card seated for every aircraft in each mode, each card's
 * picker filter, every aircraft's board class, every plan drawing, and
 * the set of actions that need no sign in.
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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'tests', 'fixtures', 'ways-golden.json');
const RECORD = process.argv.includes('--record');
const target = process.env.WAYS_MODULE ? pathToFileURL(resolve(process.env.WAYS_MODULE)).href : '../src/ui/ways.js';
const w = await import(target);
const { AIRFRAME_IDS, airframeById } = await import('../configs/airframes.js');
const { useLocale } = await import('../src/strings/index.js');

const out = {};
out.ways = w.WAYS;
out.gateWays = w.GATE_WAYS.map((x) => x.id);
out.hubs = w.HUBS;
out.hubWays = Object.fromEntries([...w.HUBS.map((h) => h.id), 'nope'].map((id) => [id, w.hubWays(id).map((x) => x.id)]));
out.hubOfAction = Object.fromEntries([...w.WAYS.map((x) => x.action), 'fly', 'way-nope'].map((a) => [a, w.hubOfAction(a)]));
out.seatedWay = Object.fromEntries(AIRFRAME_IDS.flatMap((id) => ['race', 'freestyle', null, 'nope'].map((mode) => [`${id}/${mode}`, w.seatedWay({ airframe: id }, mode).id])));
out.wayFilter = Object.fromEntries(w.WAYS.map((x) => [x.id, w.wayFilter(x)]));
out.boardCraft = Object.fromEntries(AIRFRAME_IDS.map((id) => [id, w.boardCraft(id)]));
out.craftSvg = Object.fromEntries(AIRFRAME_IDS.map((id) => [id, w.craftSvg(airframeById(id))]));
out.reticleSvg = w.reticleSvg();
out.openActions = [...w.OPEN_ACTIONS].sort();
/* Card text comes from the string table at import, so the Spanish table
 * is read by a second import of a fresh copy. */
await useLocale('es');
const es = await import(`${target}?es`);
out.waysEs = es.WAYS.map((x) => ({ id: x.id, label: x.label, blurb: x.blurb, facts: x.facts }));

/* Key order inside a card is not behaviour; sorted, so it is not compared. */
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const got = sortKeys(JSON.parse(JSON.stringify(out)));
if (RECORD) {
  writeFileSync(FILE, `${JSON.stringify(got, null, 1)}\n`);
  console.log(`wrote ${FILE}`);
  process.exit(0);
}
if (!existsSync(FILE)) {
  console.log(`FAIL no record at ${FILE}`);
  process.exit(1);
}
const want = JSON.parse(readFileSync(FILE, 'utf8'));
const bad = Object.keys({ ...want, ...got }).filter((k) => JSON.stringify(want[k]) !== JSON.stringify(got[k]));
if (bad.length) {
  console.log(`FAIL ${bad.length} group(s) differ: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`ok ${Object.keys(got).length} groups equal to the record`);
