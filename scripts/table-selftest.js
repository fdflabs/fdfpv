/*
 * table-selftest.js: the text table the verify runner prints
 * (tests/lib/table.js) pinned as a transcript.
 *
 *     node scripts/table-selftest.js [--dump=<file>]   (npm run table:selftest)
 *
 * Tables of the shapes verify.js prints and the ones that stress the
 * layout: cells wider than their header and narrower, numbers and
 * booleans, null and undefined, empty strings, one column, no rows, a
 * ragged row shorter than the header, unicode text. Pinned by digest
 * (scripts/lib/transcript.js) on the renderer before its rewrite.
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

import { renderTable } from '../tests/lib/table.js';
import { transcript } from './lib/transcript.js';

const PINNED = 'b7f0a8c66be965d2eb428b5c2c8836cc0a9d5fb7c30efa408333b624ffff1ed9';
const t = transcript();

const VERIFY_HEADERS = ['#', 'check', 'measured', 'threshold', 'result', 'reason'];

const TABLES = {
  'the verify report': [VERIFY_HEADERS, [
    [1, 'build', 'exit 0', 'exit 0', 'PASS', ''],
    [2, 'ABI version', 1, '1', 'PASS', ''],
    [5, 'hover trim', 0.4123456789, '0.30..0.60', 'PASS', 'bisected in 9 steps'],
    [13, 'browser harness', 'NaN', 'all green', 'FAIL', 'SimError: NOT_IMPLEMENTED'],
  ]],
  'cells wider than headers, headers wider than cells': [['a', 'longer header'], [
    ['a much wider cell', 'x'],
    ['y', ''],
  ]],
  'numbers, booleans, null, undefined': [['v'], [[0], [-0], [1.5], [true], [false], [null], [undefined], [NaN]]],
  'one column, no rows': [['only'], []],
  'no columns': [[], []],
  'a ragged row': [['a', 'b', 'c'], [['1', '2'], ['x', 'y', 'z']]],
  'unicode text': [['nombre', 'país'], [['Añoranza', 'Paraguay'], ['ñandutí', 'PY']]],
  'cells that look like markup': [['k', 'v'], [['pipe', 'a|b'], ['newline', 'a\nb'], ['dash', '---']]],
};

for (const [label, [headers, rows]] of Object.entries(TABLES)) {
  t.rec(label, () => renderTable(headers, rows));
}
t.rec('a non-array row', () => renderTable(['a'], [{ 0: 'x' }]));
t.rec('headers that are not strings', () => renderTable([1, 22], [[333, 4]]));

t.finish('table.js', PINNED);
