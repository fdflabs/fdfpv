/*
 * aircraft-folder-selftest.js: every row configs/aircraft.js assembles from
 * aircraft/<id>/aircraft.json equals the row today's hand module holds for
 * that id, field for field, key order, types and doubles exact (Object.is).
 * Then a negative control: one field changed in memory must fail, or the
 * comparison proves nothing. Plain Node. Run with npm run aircraft:folder.
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
import { aircraftIds, readAircraft, assemble } from '../configs/aircraft.js';

/* Airframe fields configs/airframes.js computes rather than states
 * (packStates(), stockRates(), a degrees to radians product). The folder
 * leaves them out until a later slice decides how a folder says them; the
 * hand row must still have each, so this list cannot go stale silently. */
const COMPUTED = [['gear', 'restPitch'], ['packVoltages'], ['packLabels'], ['rates']];

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

function withoutComputed(row, id, out) {
  const copy = structuredClone(row);
  for (const p of COMPUTED) {
    const parent = p.slice(0, -1).reduce((o, k) => o?.[k], copy);
    const leaf = p.at(-1);
    if (!parent || !(leaf in parent)) out.push(`airframe ${id}: computed field ${p.join('.')} gone from the hand row`);
    else delete parent[leaf];
  }
  return copy;
}

/* The hand modules' rows for one id, in the assembled tables' shapes. The
 * strings are the keys the folders carry, looked up in src/strings. */
function handRows(id, out) {
  const strings = (s, keys) => Object.fromEntries(keys.map((k) => [k, s[k]]));
  return {
    airframe: withoutComputed(A.AIRFRAMES.find((a) => a.id === id), id, out),
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
    const want = handRows(id, out);
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

const folders = aircraftIds().map((id) => readAircraft(id));
const built = assemble(folders);
let failed = 0;
const report = (name, problems) => {
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name}`);
  for (const p of problems) console.log(`     ${p}`);
  if (problems.length) failed++;
};

if (folders.length === 0) report('aircraft folders found', ['none under aircraft/']);
report(`assembled rows equal the hand modules (${folders.map((f) => f.id).join(', ')})`, [...compare(built), ...stringsPaired(built)]);

/* Negative controls: each change, made to a copy, must be caught. */
const MUTATIONS = [
  ['airframe stall', (f) => { f.airframe.stall += 1e-9; }],
  ['tuning cg mm', (f) => { f.tuning.cg.mm += 1; }],
  ['power option kv', (f) => { f.power.options[0].kv += 1; }],
  ['hangar anchor', (f) => { f.hangar.anchors.prop[0] = -f.hangar.anchors.prop[0]; }],
  ['livery colour', (f) => { f.livery.regions[0].stock = '#000000'; }],
  ['tune note', (f) => { f.tunes[0].note += ' '; }],
  ['progress level', (f) => { f.progress.level += 1; }],
  ['es string', (f) => { const k = Object.keys(f.strings.es)[0]; f.strings.es[k] += '.'; }],
  ['kit drawn', (f) => { f.kit.drawn = !f.kit.drawn; }],
  ['extra airframe field', (f) => { f.airframe.extra = 1; }],
];
for (const [name, mutate] of MUTATIONS) {
  const copy = structuredClone(folders);
  mutate(copy[0]);
  const caught = compare(assemble(copy)).length > 0;
  report(`negative control: ${name} is caught`, caught ? [] : ['changed folder still compared equal']);
}

console.log(failed ? `${failed} FAILED` : 'aircraft:folder ok');
process.exit(failed ? 1 : 0);
