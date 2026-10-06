/*
 * wall-check.js: a quad that taps a wall comes back off it, at any spawn yaw.
 *
 *     node scripts/wall-check.js      (npm run check:wall)
 *
 * The contact normal reaches the plant through the shell's frame seam, and
 * the spawn rotation once went missing from the directions handed over. On
 * a floor that is invisible (up is up at every yaw); on a wall it pushes the
 * craft INTO the masonry at yaw pi. So the same tap is flown square into a
 * wall at four spawn yaws and three speeds on the real plant (scripts/lib/
 * flightrig.js), and each must be accepted, thrown back, kept out of the
 * wall within what the contact cadence allows, and agree with the others.
 * A second set of flights takes the hands off against the wall for three
 * seconds: the craft must fall or leave, never hang there pinned.
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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRig, buildWorld, V, linePath, rampPath, sub, len, cl } from './lib/flightrig.js';
import { deriveObstacles } from '../src/game/obstacles.js';
import { CRAFT_ARM, CRAFT_HULL_R, BOUNCE_SEPARATION } from '../src/game/collide.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmPath = join(root, 'dist/sim.wasm');

const FACE_X = 30;          /* the wall's face; its outward normal is -x */
const PASS_MS = 4;          /* the shell's contact cadence, which sets the allowed overshoot */
/* How far the hull reaches toward a face it meets square on: a motor on the
 * diagonal plus the prop disc. Read from collide.js so a change there moves it. */
const SQUARE_REACH = CRAFT_ARM * Math.SQRT1_2 + CRAFT_HULL_R;
const YAWS = [[0, '0'], [Math.PI / 2, '90'], [Math.PI, '180'], [-Math.PI / 2, '270']];
const SPEEDS = [3, 6, 9];
const EAST = Math.atan2(1, 0);
const WEST = Math.atan2(-1, 0);

console.log('\nwall-check: a quad that taps a wall comes off it, at every spawn yaw\n');
if (!existsSync(wasmPath)) {
  console.log('  SKIP  no dist/sim.wasm; build the plant first, a skip is not a pass');
  process.exit(0);
}
const wasmBytes = readFileSync(wasmPath);
const diffText = readFileSync(join(root, 'configs/betaflight-default.diff'), 'utf8');

let passed = 0;
let failed = 0;
function report(ok, label, note) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}`);
  if (note) console.log(`        ${note}`);
}

const world = buildWorld([{
  kind: 'box', material: 'wall', x0: FACE_X, y0: 0, z0: -6, x1: FACE_X + 1.5, y1: 8, z1: 6,
}], deriveObstacles, 0);

/* Settle in front of the wall and ramp up to the speed, released 1.4 m off
 * the face. Returns the rig and its craft at the release point. */
async function approach(yaw, speed) {
  const rig = await makeRig({
    wasmBytes, diffText, colliders: world.colliders, field: world.field,
    spawn: V(FACE_X - 15, 0, 0), spawnYaw: yaw, groundY: 0,
  });
  rig.hold(200, 0, 0, 0, 0.5);
  const start = V(FACE_X - 13, 3.2, 0);
  const release = V(FACE_X - 1.4, 3.2, 0);
  rig.settle(start, EAST, 2.6);
  rig.fly(rampPath(start, release, (len(sub(release, start)) / speed) * 1.25, speed), { heading: EAST });
  return rig;
}

/* Coast into the wall at hover throttle, level out, then fly back out. */
async function tap(yaw, speed) {
  const rig = await approach(yaw, speed);
  const approachVx = rig.craft().v.x;
  const coast = [];
  let deepest = -1e9;
  rig.stickUntil([0, 0, 0, 0.345], Math.round((1.4 / speed) * 1000) + 320, (c) => {
    if (c.p.x > deepest) deepest = c.p.x;
    coast.push({ x: c.p.x, vx: c.v.x, touched: rig.stats.contacts > 0 });
    return false;
  });
  rig.stickUntil((c) => [0, cl(c.fwd.y * 2.6, -0.5, 0.5), 0, 0.55], 900,
    (c) => Math.abs(c.fwd.y) < 0.10 && c.up.y > 0.9);
  const arrive = { ...rig.stats };
  rig.fly(linePath(rig.craft().p, V(FACE_X - 9, 3.2, 0), 1.8), { heading: WEST });
  const exitGap = FACE_X - rig.craft().p.x;

  const first = coast.findIndex((s) => s.touched);
  const after = first < 0 ? [] : coast.slice(first);
  return {
    yaw, speed, approach: approachVx, deepest, arrive, stats: { ...rig.stats }, exitGap,
    hit: first < 0 ? null : coast[first],
    peakOut: first < 0 ? 0 : after.reduce((m, s) => Math.max(m, -s.vx), -Infinity),
    maxGap: after.reduce((m, s) => Math.max(m, FACE_X - s.x), 0),
  };
}

/* Approach the same way, then let go against the wall for three seconds. */
async function pin(yaw, speed) {
  const rig = await approach(yaw, speed);
  let peakY = -Infinity;
  rig.stickUntil([0, 0, 0, 0.345], 3000, (c) => {
    if (c.p.y > peakY) peakY = c.p.y;
    return false;
  });
  const end = rig.craft();
  return { peakY, endY: end.p.y, endGap: FACE_X - end.p.x };
}

const runs = [];
for (const [yaw, name] of YAWS) {
  for (const speed of SPEEDS) runs.push({ name, ...(await tap(yaw, speed)) });
}
const at = (r) => `yaw ${r.name} at ${r.speed} m/s`;
const f3 = (v) => v.toFixed(3);

for (const r of runs) {
  const a = r.arrive;
  report(a.contacts > 0 && a.resolved > 0 && a.outbound === 0,
    `${at(r)}: the hull meets the face and the plant takes the contact`,
    `arriving: ${a.contacts} contacts, ${a.resolved} resolved, ${a.resting} resting, `
    + `${a.inbound} in, ${a.outbound} out; whole flight ${r.stats.contacts} contacts, ${r.stats.outbound} out`);
}
for (const r of runs) {
  report(r.hit !== null && r.peakOut > 0.15 && r.maxGap > SQUARE_REACH,
    `${at(r)}: it comes back off the face`,
    r.hit === null ? 'never touched the wall'
      : `back off at up to ${f3(r.peakOut)} m/s, centre up to ${f3(r.maxGap)} m off the face, `
        + `hull reach ${f3(SQUARE_REACH)} m`);
}
for (const r of runs.filter((x) => x.speed >= 9)) {
  report(r.hit !== null && r.exitGap > 3,
    `${at(r)}: thrown clear, then flown out more than 3 m`,
    `centre ${f3(r.hit ? FACE_X - r.hit.x : 0)} m off at first touch, ${f3(r.exitGap)} m off after the fly out`);
}
{
  const slow = runs.filter((r) => r.speed <= 6).map((r) => r.peakOut);
  const lo = Math.min(...slow);
  const hi = Math.max(...slow);
  report(lo > 0.20 && hi < 0.30,
    'below the knee every rebound is the saturated restitution value',
    `${f3(lo)} to ${f3(hi)} m/s over 3 and 6 m/s, predicted about ${f3(0.15 * 1.7)}`);
}
for (const r of runs) {
  const slop = r.speed * (PASS_MS / 1000) * 2 + BOUNCE_SEPARATION;
  const reach = r.deepest + SQUARE_REACH;
  report(r.deepest <= FACE_X - SQUARE_REACH + slop,
    `${at(r)}: the hull stays out of the masonry, within what the cadence allows`,
    `deepest centre x ${f3(r.deepest)}, hull to ${f3(reach)}, `
    + `${(Math.max(0, (reach - FACE_X) * 1000)).toFixed(0)} mm in, ${(slop * 1000).toFixed(0)} mm allowed`);
}
for (const speed of SPEEDS) {
  const ratios = runs.filter((r) => r.speed === speed).map((r) => r.peakOut / Math.max(0.01, r.approach));
  const spread = Math.max(...ratios) - Math.min(...ratios);
  report(spread < 0.2, `at ${speed} m/s the four spawn yaws throw it back alike`,
    `rebound over arrival ${ratios.map((x) => `${(x * 100).toFixed(1)}%`).join(', ')}`);
}
{
  const mean = (speed) => runs.filter((r) => r.speed === speed).reduce((s, r) => s + r.peakOut, 0) / YAWS.length;
  report(mean(9) > mean(3), 'a harder arrival comes back off harder',
    `mean rebound ${f3(mean(3))} m/s from 3 m/s, ${f3(mean(9))} m/s from 9 m/s`);
}
for (const [yaw, name] of YAWS) {
  for (const speed of SPEEDS) {
    const p = await pin(yaw, speed);
    const dropped = p.peakY - p.endY;
    report(dropped > 2.0 || p.endGap > SQUARE_REACH * 4,
      `yaw ${name} at ${speed} m/s: three seconds hands off and it is not hanging on the wall`,
      `fell ${f3(dropped)} m, ended ${f3(p.endGap)} m off the face`);
  }
}

console.log('\n  Every tap, for the record. Only the 9 m/s exits are asserted above; at 3 and 6 m/s');
console.log('  the exit swings with the spawn yaw from a few centimetres to metres, so it is logged.');
for (const r of runs) {
  console.log(`    ${r.speed >= 9 ? 'asserted' : 'logged  '}  ${at(r).padEnd(18)}`
    + `  in ${f3(r.approach)}  back ${f3(r.peakOut)}  gap ${f3(r.maxGap)}  exit ${f3(r.exitGap)}`
    + `  contacts ${r.stats.contacts} resolved ${r.stats.resolved} resting ${r.stats.resting} out ${r.stats.outbound}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
