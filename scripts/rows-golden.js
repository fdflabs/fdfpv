/*
 * rows-golden.js: the menu's row model (src/ui/rows.js) held to a record
 * taken from the helpers as they stood inside src/ui/ui.js.
 *
 *     node scripts/rows-golden.js            compare
 *     node scripts/rows-golden.js --record   write tests/fixtures/rows-golden.json
 *
 * ROWS_MODULE names another module exporting the same helpers, which is
 * how the record was taken from the old code before the move.
 *
 * Each helper is driven over a spread of inputs and every observable
 * result is written down: the row object's plain fields, and for each of
 * its functions (adjust both ways, pick, flip, typed) what reached `set`.
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
const FILE = join(root, 'tests', 'fixtures', 'rows-golden.json');
const RECORD = process.argv.includes('--record');
const target = process.env.ROWS_MODULE ? pathToFileURL(resolve(process.env.ROWS_MODULE)).href : '../src/ui/rows.js';
const rows = await import(target);
const { rateField } = await import('../configs/rates.js');

/* A row's plain fields, its functions replaced by what they do. */
function observe(row, probes) {
  const plain = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v !== 'function') plain[k] = v;
  }
  const effects = {};
  for (const [name, args] of probes) {
    if (typeof row[name] !== 'function') {
      effects[name] = '<absent>';
      continue;
    }
    for (const arg of args) {
      const got = [];
      row.__sink.length = 0;
      const ret = row[name](arg);
      got.push(...row.__sink);
      effects[`${name}(${JSON.stringify(arg)})`] = { set: got, returned: ret === undefined ? '<undefined>' : ret };
    }
  }
  delete plain.__sink;
  return { plain, functions: Object.keys(row).filter((k) => typeof row[k] === 'function' && k !== '__sink').sort(), effects };
}
function withSink(make) {
  const sink = [];
  const row = make((v) => sink.push(v === undefined ? '<undefined>' : v));
  row.__sink = sink;
  return row;
}

const out = {};
const labels = ['', 'Off', 'Acro', 'Low', 'Betaflight default', 'Karate race 6S', 'x'.repeat(25), null, undefined, 0, 'Ünïcode label', "Pilot's 1/2 deg"];
const optionSets = [[], ['a'], ['Off', 'On'], ['Acro', 'Angle'], ['Low', 'High', 'Ultra'], ['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd', 'e'], ['Betaflight default', 'Karate race 6S'], ['twelve chars', 'twelve chars'], ['twelve chars', 'twelve char!s']];
out.consts = { SEGMENT_MAX: rows.SEGMENT_MAX, SEGMENT_CHARS: rows.SEGMENT_CHARS };
out.fitsAsSegments = [null, undefined, {}, { options: null }, ...optionSets.map((o) => ({ options: o.map((label) => ({ label })) })), { options: [{ label: null }, { label: 5 }] }]
  .map((it) => rows.fitsAsSegments(it));
out.slugify = labels.map((l) => rows.slugify(l)).concat(['--A b--', '___', '42', 'a--b', ' Multi   space '].map((l) => rows.slugify(l)));
const lists = [['a', 'b', 'c'], [1, 2, 3, 4], [true, false], ['solo']];
out.cycle = lists.flatMap((list) => [...list, 'missing'].flatMap((v) => [-1, 1].map((d) => rows.cycle(list, v, d))));
const stampInput = () => [
  { label: 'Fly', action: 'fly' }, { label: 'Fly', action: 'fly' }, { label: 'Heading', section: true },
  { label: 'Heading', section: true }, { label: 'Keyed', key: 'roll_rate' }, { label: 'Plain row' }, { label: 'Plain row' },
  { label: 'Plain row' }, { label: 'Has id', id: 'given' }, null, 'string', 7, { label: '' }, { label: '!!!' },
  { action: 'fly', key: 'k', section: true, label: 'all' },
];
out.stampIds = ['title', '', null, undefined].map((screen) => rows.stampIds(stampInput(), screen));
out.stampIdsReturnsSame = (() => { const a = stampInput(); return rows.stampIds(a, 'x') === a; })();

out.choice = [
  [['acro', 'angle'], 'acro', null], [['acro', 'angle'], 'angle', (v) => v.toUpperCase()], [[1, 3, 5], 3, (v) => `${v} laps`],
  [[1, 3, 5], 4, null], [[true, false], false, null], [[], 'x', null], [[4.2, 3.8, 3.5], 3.8, (v) => v.toFixed(2)],
].map(([choices, current, format]) => observe(withSink((set) => rows.choice('Label', 'Note', choices, current, format, set)),
  [['adjust', [-1, 1]], ['pick', ['acro', 'angle', '3', 3, '4.2', 'false', 'nope', undefined]]]));
out.toggle = [true, false, 1, 0, null, 'yes', undefined].map((on) => observe(withSink((set) => rows.toggle('Sound', 'Note', on, set)),
  [['adjust', [-1, 1, 0]], ['flip', [undefined]]]));
const specs = ['rcRate', 'srate', 'expo'].flatMap((key) => ['ACTUAL', 'BETAFLIGHT'].map((type) => {
  try { return rateField(type, key); } catch (e) { return null; }
})).filter(Boolean);
out.number = specs.flatMap((spec) => [spec.cliMin, spec.cliMax, Math.round((spec.cliMin + spec.cliMax) / 2)].map((cli) => observe(
  withSink((set) => rows.number('Rate', 'Note', spec, cli, set)),
  [['adjust', [-1, 1]], ['typed', ['', '  ', '0', '1', '1500', '-5', 'abc', '0.42', ' 70 ', 1e9]], ['set', [7]]],
)));
out.stepper = [observe(withSink((set) => rows.stepper('Volume', 'Note', '6', (d) => set(d))), [['adjust', [-1, 1]]])];

const got = JSON.parse(JSON.stringify(out, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? `<${v}>` : v)));
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
