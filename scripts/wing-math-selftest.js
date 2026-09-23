/*
 * wing-math-selftest.js: the fixed libm's atan2 against the host's, on a
 * grid dense enough to cross every reduction boundary, plus the zeros
 * and axes the C library defines. Run with npm run wing:math.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
const atan2 = sim.e.sim_math_atan2;

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

console.log('wing maths');
check('the module exports the fixed atan2', typeof atan2 === 'function');
let worst = 0;
let at = '';
let n = 0;
for (let i = -400; i <= 400; i += 1) {
  for (let j = -400; j <= 400; j += 1) {
    const y = i / 40;
    const x = j / 40;
    const got = atan2(y, x);
    const want = Math.atan2(y, x);
    const err = Math.abs(got - want);
    n += 1;
    if (err > worst) {
      worst = err;
      at = `atan2(${y}, ${x}) = ${got} vs ${want}`;
    }
  }
}
check(`${n} grid points within 1e-12 of the host`, worst < 1e-12, `worst ${worst} at ${at}`);
let worstBig = 0;
for (const [y, x] of [[1e6, 1], [1, 1e6], [-1e6, -1], [3e-7, 1], [1, 3e-7], [-5, 1e-9], [1e300, 1e300], [1e-300, 1e-300]]) {
  worstBig = Math.max(worstBig, Math.abs(atan2(y, x) - Math.atan2(y, x)));
}
check('extreme ratios within 1e-12', worstBig < 1e-12, `${worstBig}`);
check('atan2(0, 1) is 0', atan2(0, 1) === 0);
check('atan2(1, 0) is pi/2', Math.abs(atan2(1, 0) - Math.PI / 2) < 1e-15);
check('atan2(-1, 0) is -pi/2', Math.abs(atan2(-1, 0) + Math.PI / 2) < 1e-15);
check('atan2(0, -1) is pi', Math.abs(atan2(0, -1) - Math.PI) < 1e-15);
check('atan2(0, 0) is 0', atan2(0, 0) === 0);
check('the same input gives the same bits twice', atan2(0.3, -0.7) === atan2(0.3, -0.7));

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
