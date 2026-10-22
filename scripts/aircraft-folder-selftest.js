/*
 * aircraft-folder-selftest.js: every row configs/aircraft.js assembles from
 * aircraft/<id>/aircraft.js equals the row today's hand module holds for
 * that id, field for field, key order, types and doubles exact (Object.is).
 * Then a negative control: one field changed in memory must fail, or the
 * comparison proves nothing. Also that the assembler's FOLDERS are the
 * folders on disk, each plain JSON after `export default`. Plain Node. Run
 * with npm run aircraft:folder.
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
import * as K from '../configs/kits.js';
import * as T from '../configs/tuning.js';
import * as P from '../configs/power.js';
import * as E from '../configs/power-estimates.js';
import * as H from '../configs/hangar-parts.js';
import * as L from '../configs/liveries.js';
import * as R from '../configs/registry.js';
import { PLANE_LEVELS } from '../src/game/progress.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';
import { FOLDERS, assemble } from '../configs/aircraft.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const AIRCRAFT_DIR = fileURLToPath(new URL('../aircraft/', import.meta.url));

/* What every aircraft starts on (configs/airframes.js): the per cell pack
 * states the pack row offers, and Betaflight 4.5.1's stock ACTUAL rates
 * (70 / 670 deg/s, no expo) with no throttle limit. Each folder states them
 * as data, so they must equal these in every folder, or one aircraft's
 * stock could drift from the rest. */
const axis = { rcRate: 7, srate: 67, expo: 0 };
const STOCK = {
  packVoltages: [4.2, 3.8, 3.5],
  packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
  rates: { type: 'ACTUAL', roll: axis, pitch: axis, yaw: axis, throttleCap: 100 },
};

function diff(a, b, path, out) {
  if (typeof a !== typeof b) return out.push(`${path}: ${typeof a} vs ${typeof b}`);
  if (a === null || b === null || typeof a !== 'object') {
    if (!Object.is(a, b)) out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return out.push(`${path}: array vs object`);
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.join() !== kb.join()) return out.push(`${path}: keys [${ka}] vs [${kb}]`);
  for (const k of ka) diff(a[k], b[k], `${path}.${k}`, out);
}

/* The hand modules' rows for one id, in the assembled tables' shapes. The
 * strings are the keys the folders carry, looked up in src/strings. */
function handRows(id) {
  const strings = (s, keys) => Object.fromEntries(keys.map((k) => [k, s[k]]));
  return {
    airframe: A.AIRFRAMES.find((a) => a.id === id),
    kit: K.KITS[id], drawn: K.DRAWN.has(id), tuning: T.TUNING[id],
    table: P.TABLE[id], power: P.POWER[id], estimates: E.ESTIMATES[id],
    props: H.PROPS[id], anchors: H.ANCHORS[id], livery: L.LIVERIES[id],
    tunes: R.TUNES.filter((t) => t.airframe === id), level: PLANE_LEVELS[id],
    strings: { en: strings(en, Object.keys(built.STRINGS.en)), es: strings(es, Object.keys(built.STRINGS.es)) },
  };
}

function compare(t) {
  const out = [];
  const ids = t.AIRFRAMES.map((a) => a.id);
  if (ids.length !== new Set(ids).size) out.push(`duplicate ids [${ids}]`);
  for (const row of t.AIRFRAMES) {
    const id = row.id;
    const want = handRows(id);
    const got = {
      airframe: row, kit: t.KITS[id], drawn: t.DRAWN.includes(id), tuning: t.TUNING[id],
      table: t.TABLE[id], power: t.POWER[id], estimates: t.ESTIMATES[id],
      props: t.PROPS[id], anchors: t.ANCHORS[id], livery: t.LIVERIES[id],
      tunes: t.TUNES.filter((x) => x.airframe === id), level: t.PLANE_LEVELS[id],
      strings: t.STRINGS,
    };
    diff(got, want, id, out);
  }
  return out;
}

/* Every English key a folder carries has its Spanish, as lint:copy asks of
 * src/strings. */
function stringsPaired(t) {
  const en = Object.keys(t.STRINGS.en).join(), es = Object.keys(t.STRINGS.es).join();
  return en === es ? [] : [`strings: en [${en}] vs es [${es}]`];
}

/* FOLDERS against the disk: one folder per directory holding an
 * aircraft.js, in name order, each the module at its own path. */
async function onDisk() {
  const out = [];
  const dirs = readdirSync(AIRCRAFT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(AIRCRAFT_DIR, e.name, 'aircraft.js')))
    .map((e) => e.name).sort();
  const ids = FOLDERS.map((f) => f.id);
  if (ids.join() !== dirs.join()) out.push(`FOLDERS [${ids}] vs aircraft/ [${dirs}]`);
  for (const dir of dirs) {
    const mod = await import(pathToFileURL(join(AIRCRAFT_DIR, dir, 'aircraft.js')).href);
    if (!FOLDERS.includes(mod.default)) out.push(`aircraft/${dir}/aircraft.js is not in FOLDERS`);
    if (mod.default.id !== dir) out.push(`aircraft/${dir}: id ${mod.default.id}`);
  }
  return out;
}

/* Each folder is its header comment, then `export default ` and plain JSON:
 * no expression, no import, nothing a generator in another language could
 * not read. */
function dataOnly(folder) {
  const out = [];
  const text = readFileSync(join(AIRCRAFT_DIR, folder.id, 'aircraft.js'), 'utf8');
  const m = /^\/\*[\s\S]*?\*\/\n\nexport default ([\s\S]*);\n$/.exec(text);
  if (!m) return [`aircraft/${folder.id}: not a header, export default and JSON`];
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch (e) {
    return [`aircraft/${folder.id}: ${e.message}`];
  }
  diff(data, folder, `aircraft/${folder.id}`, out);
  return out;
}

function stockFields(t) {
  const out = [];
  for (const row of t.AIRFRAMES) {
    for (const [k, v] of Object.entries(STOCK)) diff(row[k], v, `${row.id}.${k} vs stock`, out);
  }
  return out;
}

const folders = FOLDERS;
const built = assemble(folders);
let failed = 0;
const report = (name, problems) => {
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name}`);
  for (const p of problems) console.log(`     ${p}`);
  if (problems.length) failed++;
};

if (folders.length === 0) report('aircraft folders found', ['none under aircraft/']);
report('FOLDERS are the folders on disk', await onDisk());
report('each folder is plain JSON after export default', folders.flatMap(dataOnly));
report('folder rows carry the stock packs and rates', stockFields(built));
report(`assembled rows equal the hand modules (${folders.map((f) => f.id).join(', ')})`, [...compare(built), ...stringsPaired(built)]);

/* Negative controls: each change, made to a copy, must be caught. The
 * folder changed is the first that states every row the changes touch. A
 * row stated null that the hand module has must be caught too. No kept
 * aircraft has landing gear or an unlock level since the recreational
 * planes left (2026-10-21): the gear's control went with them, and the
 * level is set where it was null. */
const MUTATIONS = [
  ['airframe stall', (f) => { f.airframe.stall += 1e-9; }],
  ['tuning cg mm', (f) => { f.tuning.cg.mm += 1; }],
  ['power option kv', (f) => { f.power.options[0].kv += 1; }],
  ['hangar anchor', (f) => { f.hangar.anchors.prop[0] = -f.hangar.anchors.prop[0]; }],
  ['livery colour', (f) => { f.livery.regions[0].stock = '#000000'; }],
  ['tune note', (f) => { f.tunes[0].note += ' '; }],
  ['progress level', (f) => { f.progress.level = (f.progress.level ?? 0) + 1; }],
  ['es string', (f) => { const k = Object.keys(f.strings.es)[0]; f.strings.es[k] += '.'; }],
  ['kit drawn', (f) => { f.kit.drawn = !f.kit.drawn; }],
  ['extra airframe field', (f) => { f.airframe.extra = 1; }],
  ['tuning stated null', (f) => { f.tuning = null; }],
];
const full = folders.findIndex((f) => f.tuning && f.power.options && f.hangar.anchors && f.livery && f.tunes.length);
for (const [name, mutate] of MUTATIONS) {
  const copy = structuredClone(folders);
  mutate(copy[full]);
  const caught = compare(assemble(copy)).length > 0;
  report(`negative control: ${name} is caught`, caught ? [] : ['changed folder still compared equal']);
}

console.log(failed ? `${failed} FAILED` : 'aircraft:folder ok');
process.exit(failed ? 1 : 0);
