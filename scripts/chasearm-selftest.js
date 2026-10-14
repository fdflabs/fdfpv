/*
 * chasearm-selftest.js: the chase camera's arm (src/render/chasearm.js)
 * against real Colliders (src/game/collide.js), in Node.
 *
 *   node scripts/chasearm-selftest.js
 *
 * Each case puts a craft by a solid and the camera where the chase view
 * would put it, and first proves the case is one: the unfixed camera is
 * inside the solid, or its line to the craft crosses one (the negative
 * control). Then pullIn must leave the camera, and every point of its
 * line to the craft, CAMERA_CLEAR_M from every solid, as far back as
 * that allows; with nothing in the way it must not move it at all, and a
 * craft parked on a deck keeps its arm.
 *
 * Exits 1 on any failure.
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

import { Colliders } from '../src/game/collide.js';
import { CAMERA_CLEAR_M, pullIn } from '../src/render/chasearm.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

/* A house's walls (two boxes), a thin garden wall, a lamp post, a dam's
 * face with a deck over it. */
const col = new Colliders();
col.addBox('wall', 0, 0, 0, 10, 6, 0.3);
col.addBox('wall', 0, 0, 0, 0.3, 6, 8);
col.addBox('wall', 20, 0, -0.05, 30, 2, 0.05);
col.addPost('pole', 40, 0, 0, 8, 0.15);
col.addBox('wall', 60, 0, -20, 100, 30, 0);
col.build();

/* The least gap to any solid along the line from a to b, sampled every
 * centimetre: the line the camera looks down to the craft. */
function lineGap(a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / 0.01));
  let least = Infinity;
  for (let k = 0; k <= n; k += 1) {
    const f = k / n;
    least = Math.min(least, col.gapAt(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f, 5));
  }
  return least;
}
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(3) : 'clear');

/* [name, craft, the camera the chase view asked for, what the unfixed
 * camera must show: 'inside' a solid, 'through' one, or 'clear']. */
const CASES = [
  ['backing past a house wall puts the camera inside it', { x: 5, y: 2, z: 1.5 }, { x: 5, y: 3, z: 0.15 }, 'inside'],
  ['a camera behind a house corner looks through it', { x: 2, y: 2, z: 2 }, { x: -3, y: 3, z: -3 }, 'through'],
  ['a camera behind a thin garden wall looks through it', { x: 25, y: 1, z: 2 }, { x: 25, y: 1.5, z: -4 }, 'through'],
  ['a lamp post between craft and camera', { x: 40, y: 3, z: 3 }, { x: 40, y: 3.5, z: -3 }, 'through'],
  ['along the dam face, the camera swung into it', { x: 80, y: 15, z: 1.2 }, { x: 80, y: 16.5, z: -5 }, 'inside'],
  ['nothing in the way', { x: 200, y: 5, z: 200 }, { x: 200, y: 6, z: 206 }, 'clear'],
];

for (const [name, craft, aim, want] of CASES) {
  const at = col.gapAt(aim.x, aim.y, aim.z, 5);
  const through = lineGap(craft, aim);
  const shows = at === 0 ? 'inside' : through < CAMERA_CLEAR_M ? 'through' : 'clear';
  check(`${name}: unfixed, the camera is ${want}`, shows === want, `gap at the camera ${f2(at)} m, least on its line ${f2(through)} m`);
  const cam = { ...aim };
  const kept = pullIn(col, craft, cam);
  const after = lineGap(craft, cam);
  const arm = Math.hypot(aim.x - craft.x, aim.y - craft.y, aim.z - craft.z);
  if (want === 'clear') {
    check(`${name}: the arm is left whole`, kept === 1 && cam.x === aim.x && cam.y === aim.y && cam.z === aim.z, `kept ${f2(kept)}`);
    continue;
  }
  check(`${name}: pulled in, the camera and its line are ${CAMERA_CLEAR_M} m clear`, after >= CAMERA_CLEAR_M - 1e-6 && kept < 1,
    `kept ${f2(kept)} of ${f2(arm)} m, least on its line ${f2(after)} m`);
  /* As far back as the line allows: a few centimetres further out along
   * the arm is no longer clear. */
  const out = Math.min(1, kept + 0.05 / arm);
  const further = {
    x: craft.x + (aim.x - craft.x) * out, y: craft.y + (aim.y - craft.y) * out, z: craft.z + (aim.z - craft.z) * out,
  };
  check(`${name}: and no nearer the craft than it has to be`, lineGap(craft, further) < CAMERA_CLEAR_M + 0.06, `5 cm further out the line is ${f2(lineGap(craft, further))} m clear`);
}

/* A craft scraping a wall: the camera keeps no less room from it than
 * the craft has, and is never in it. */
const scrape = { x: 5, y: 2, z: 0.5 };
const cam = { x: 5, y: 3, z: -3 };
const own = col.gapAt(scrape.x, scrape.y, scrape.z, 5);
pullIn(col, scrape, cam);
check('a craft scraping a wall: its camera keeps the craft\'s own room from it', lineGap(scrape, cam) >= own - 1e-6 && col.gapAt(cam.x, cam.y, cam.z, 5) > 0,
  `craft ${f2(own)} m from the wall, least on the camera's line ${f2(lineGap(scrape, cam))} m`);

/* A plane parked on a dam's deck, 0.21 m over it, the camera back and up
 * over the open deck: the arm is left whole. A clearance taken as
 * CAMERA_CLEAR_M from the start put this camera inside the plane. */
const deck = new Colliders();
deck.addBox('wall', -50, 0, -5, 50, 225, 5);
deck.build();
const parked = { x: 0, y: 225.21, z: 0 };
const behind = { x: 0, y: 226.25, z: 3.73 };
const keptDeck = pullIn(deck, parked, behind);
check('a plane parked on a deck keeps its whole arm', keptDeck === 1 && behind.z === 3.73, `kept ${f2(keptDeck)}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
