/*
 * frame-check.js: a world direction converted into the plant's frame carries
 * the spawn yaw with it, and src/main.js has exactly one place where it hands
 * directions to the plant, a helper that takes the spawn rotation out first.
 * Arithmetic plus a source lint: no browser, no wasm. Run with
 * npm run lint:frame.
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

/*
 * The same bug has been written three times and shipped twice. The parked
 * cars' roof lift compared a direction in the wrong frame. The ground plane
 * sent its point through the position conversion, which undoes the spawn
 * yaw, and its normal through the bare permutation, which does not, so a
 * hillside reached the plant as a roll instead of a pitch on every map whose
 * spawn is not axis aligned. The obstacle contact normal kept the same fault
 * for four more days, which is why a wall tap welded the craft to the wall
 * in the town.
 *
 * It survives because a level floor hides it: a yaw about world up leaves a
 * vertical normal unchanged, so only a vertical face shows it. The freestyle
 * city spawned at yaw pi, which turns a wall's outward normal into its
 * negative, so the plant read a craft flying into a wall as one leaving it.
 *
 * src/main.js cannot be imported into Node (it pulls in three.js and a
 * document), so the algebra runs on a restatement of the shell's conversion,
 * and a source lint binds the restatement to the shell: deleting the one
 * de-rotating line there would otherwise leave all the algebra green. The
 * behavioural half is scripts/wall-check.js and window.__contacts().
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { simPosToThree, threePosToSim, threeDirToSim } from '../src/render/frame.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const EPS = 1e-9;

const YAWS = [
  ['0', 0],
  ['90', Math.PI / 2],
  ['180', Math.PI],
  ['270', -Math.PI / 2],
  ['37', 0.6457718],
];
/* The diagonal lies on no axis of either frame. */
const VELOCITIES = [
  ['forward', [10, 0, 0]],
  ['sideways', [0, 8, 0]],
  ['climbing', [0, 0, 6]],
  ['diagonal', [5, -4, 3]],
];
const SPAWN = [12, -30, 4];
const POINT_A = [3, 5, -2];
const POINT_B = [-1, 2, 7];

/* frame.js writes positions through set() and directions through fields,
 * so the scratch offers both. */
function scratch() {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
  };
}

function call(fn, [x, y, z]) {
  const out = fn(x, y, z, scratch());
  return [out.x, out.y, out.z];
}

/* The shell's spawn rotation: about world +Y, as setFromAxisAngle builds it. */
function rotateY([x, y, z], a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c * x + s * z, y, -s * x + c * z];
}

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const worstDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/* The restatement of the shell's worldDirToSim. */
const worldDirToPlant = (d, yaw) => call(threeDirToSim, rotateY(d, -yaw));
const plantDirToWorld = (d, yaw) => rotateY(call(simPosToThree, d), yaw);
const worldPosToPlant = (p, yaw) => call(threePosToSim, rotateY(sub(p, SPAWN), -yaw));

const results = [];
function check(name, ok, note) {
  results.push({ name, ok, note });
}

/*
 * A contact normal points out of the solid, so it opposes a craft arriving
 * at it, whatever geometry it came from. The bare permutation must break that
 * somewhere, or the check has no teeth: at a quarter turn a head-on hit
 * becomes a graze, at a half turn it is exactly reversed (the town).
 */
let bareWrong = 0;
for (const [label, yaw] of YAWS) {
  for (const [velName, v] of VELOCITIES) {
    const w = plantDirToWorld(v, yaw);
    const len = Math.hypot(...w);
    const normal = w.map((c) => -c / len);
    const nv = dot(worldDirToPlant(normal, yaw), v);
    check(`yaw ${label} deg, ${velName}: the converted normal opposes the plant's own velocity`, nv < 0,
      `n . v = ${nv.toFixed(3)}, want negative (approaching)`);
    if (!(dot(call(threeDirToSim, normal), v) < -EPS)) {
      bareWrong++;
    }
  }
}
const cases = YAWS.length * VELOCITIES.length;
check('the bare permutation fails the same invariant, so this check can fail', bareWrong > 0,
  `${bareWrong} of ${cases} cases wrong without the spawn rotation`);

for (const [label, yaw] of YAWS) {
  const worst = Math.max(...VELOCITIES.map(([, v]) => worstDiff(v, worldDirToPlant(plantDirToWorld(v, yaw), yaw))));
  check(`yaw ${label} deg: a direction survives the round trip`, worst < EPS,
    `worst component error ${worst.toExponential(2)}`);
}

/* The fault was two halves of one conversion disagreeing, so the difference
 * of two converted points must be the converted difference. */
for (const [label, yaw] of YAWS) {
  const viaPoints = sub(worldPosToPlant(POINT_B, yaw), worldPosToPlant(POINT_A, yaw));
  const e = worstDiff(viaPoints, worldDirToPlant(sub(POINT_B, POINT_A), yaw));
  check(`yaw ${label} deg: the direction path is the linear part of the position path`, e < EPS,
    `worst component error ${e.toExponential(2)}`);
}

/*
 * Comments are blanked first: the house style explains a fault by naming the
 * function that caused it, and a lint that fires on its own documentation
 * gets turned off. Block comments keep their newlines so line numbers hold.
 */
const source = (await readFile(join(root, 'src/main.js'), 'utf8'))
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  .replace(/\/\/.*$/gm, '');
const lines = source.split('\n');
const CALL = /\bthreeDirToSim\s*\(/;
const HELPER = /function\s+worldDirToSim\s*\(/;
const WINDOW = 8;

const helper = lines.findIndex((line) => HELPER.test(line));
const windowLines = helper < 0 ? [] : lines.slice(helper, helper + WINDOW);
const callSites = lines.flatMap((line, i) => (CALL.test(line) ? [i] : []));
const strays = callSites.filter((i) => helper < 0 || i < helper || i >= helper + WINDOW);

let seamNote = 'worldDirToSim not found in src/main.js';
if (helper >= 0) {
  seamNote = `${callSites.length} call site(s), ${strays.length} outside the helper`;
  if (strays.length) {
    seamNote += ` at line ${strays.map((i) => i + 1).join(', ')}`;
  }
}
check('src/main.js reaches for the bare permutation only inside worldDirToSim', helper >= 0 && !strays.length, seamNote);

/* Only presence in the window is tested, not order, despite the name. */
const body = windowLines.join('\n');
const bodyNote = helper < 0
  ? 'worldDirToSim not found'
  : `body: ${windowLines.map((l) => l.trim()).filter(Boolean).join(' ')}`.slice(0, 160);
check('and worldDirToSim undoes the spawn rotation before the permutation',
  /applyQuaternion\s*\(\s*qSpawnInv\s*\)/.test(body) && CALL.test(body), bodyNote);

/* The import must still exist, so the seam lint cannot pass merely because
 * the function was renamed. */
const imported = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/render\/frame\.js'/g)]
  .some(([, list]) => /\bthreeDirToSim\b/.test(list));
check('src/main.js still imports threeDirToSim from frame.js', imported);

console.log('frame-check: a direction carries the spawn rotation');
console.log('');
for (const { name, ok, note } of results) {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}`);
  if (note !== undefined) {
    console.log(`        ${note}`);
  }
}
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log('');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
