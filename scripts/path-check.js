/*
 * path-check.js: the recogniser's measure of how far the flight path turned,
 * taken on the real aircraft.
 *
 *     node scripts/path-check.js      (npm run check:path)
 *
 * TrickDetector.closeTrack() measures each stretch of path beside the
 * pattern table: how many turns it made, about which axis, on pitch or on
 * roll, and whether an object sat inside the circle. Nothing in the game
 * reads it yet, so this script is its only evidence. It flies the real
 * plant (scripts/lib/flightrig.js) round a rail and a post and through open
 * air, and holds the measure to what the flight was: a loop round the rail
 * is one horizontal turn on pitch, the same circle nose along the rail is
 * on roll, an orbit of the post is two vertical turns, a figure in open air
 * encloses nothing, the spawn yaw changes nothing, and turns are counted
 * about the object's own axis.
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
import {
  makeRig, buildWorld, V, sub, mul, norm, len, rampPath, linePath, circlePath, TURN,
} from './lib/flightrig.js';
import { deriveObstacles } from '../src/game/obstacles.js';
import { TrickDetector } from '../src/game/trickdetect.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmPath = join(root, 'dist/sim.wasm');

console.log('\npath-check: how far the path turned, measured on the real aircraft\n');
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

/* Listen in on every measurement the detector closes. The wrapper goes on
 * the prototype of the class the rig builds, so it sees every detector;
 * it passes everything through untouched. */
let measured = [];
const closeTrack = TrickDetector.prototype.closeTrack;
TrickDetector.prototype.closeTrack = function listen() {
  const row = closeTrack.call(this);
  if (row) measured.push(row);
  return row;
};
/* Hand over the rows of at least `min` turns, and forget all of them. */
function take(min) {
  const rows = measured.filter((r) => r.turns >= min);
  measured = [];
  return rows;
}

const RAIL = V(0, 6.3, 0);
const world = buildWorld([
  { kind: 'capsule', material: 'obstacle', ax: -5, ay: 6.3, az: 0, bx: 5, by: 6.3, bz: 0, r: 0.12 },
  { kind: 'box', material: 'wall', x0: 40 - 0.16, y0: 0, z0: -0.16, x1: 40 + 0.16, y1: 12, z1: 0.16 },
], deriveObstacles, 0);

async function rig(spawnZ = -20, yaw = Math.PI) {
  const r = await makeRig({
    wasmBytes, diffText, colliders: world.colliders, field: world.field,
    spawn: V(0, 0, spawnZ), spawnYaw: yaw, groundY: 0,
  });
  r.hold(200, 0, 0, 0, 0.5);
  return r;
}

/* Come in on a 12 m ramp that arrives on the path at its own speed, fly
 * it, let it settle, and hand over what was measured. */
function flyCircle(r, lap, heading, lapOpts, min) {
  const entry = lap(0);
  const vEntry = len(entry.v);
  const from = sub(entry.p, mul(norm(entry.v), 12));
  r.settle(from, typeof heading === 'function' ? heading(0, { p: from }) : heading, 2.0);
  r.fly(rampPath(from, entry.p, (12 * 1.9) / Math.max(2, vEntry), vEntry), { heading });
  r.fly(lap, { heading, ...lapOpts });
  r.hold(700, 0, 0, 0, 0.45);
  r.done(700);
  return take(min);
}

/* A vertical circle of 3.4 m about the rail, entered at the bottom. */
async function railLoop({ noseAlong = false, secs = 2.9, yaw = Math.PI } = {}) {
  const lap = circlePath(RAIL, V(0, -1, 0), V(0, 0, -1), 3.4, secs, 0, -1);
  return flyCircle(await rig(-20, yaw), lap, noseAlong ? Math.atan2(1, 0) : Math.atan2(0, -1), {}, 0.6);
}

async function orbitAbout(centre) {
  const lap = circlePath(centre, V(1, 0, 0), V(0, 0, 1), 6, 5.0, 0, 2);
  const look = (t, s) => Math.atan2(centre.x - s.p.x, centre.z - s.p.z);
  return flyCircle(await rig(-20), lap, look, { ky: 3.0, yawMax: 0.85 }, 0.3);
}

/* Climb out over open ground and run up to 13 m/s heading +z. */
async function openAirRunUp() {
  const r = await rig(-60);
  const north = Math.atan2(0, 1);
  r.settle(V(0, 14, -50), north, 2.0);
  r.fly(rampPath(V(0, 14, -50), V(0, 14, -36), 2.2, 13), { heading: north });
  return r;
}

async function openAirFlip() {
  const r = await openAirRunUp();
  r.stickUntil([0, 0.85, 0, 0.42], 1400, (c, i, a) => -a.q >= TURN * 0.84);
  r.fly(linePath(r.craft().p, V(0, 14, -10), 2.4), { heading: Math.atan2(0, 1) });
  r.done(700);
  return take(0.3);
}

/* Rows can carry null where nothing was measured; print that as it is. */
const d2 = (v) => (typeof v === 'number' ? v.toFixed(2) : String(v));
const describe = (row) => `${d2(row.turns)} turns ${row.axis}, loop ${d2(row.loop)} on ${row.loopOn}, `
  + `forward ${d2(row.forward)}, object ${row.object}, radius ${row.radius.toFixed(1)}`;
const brief = (rows) => (rows.length ? rows.map((r) => `${d2(r.turns)} turns, object ${r.object}`).join('; ') : 'no turn measured');
const isOneLoopOn = (rows, on) => rows.length === 1 && rows[0].axis === 'horizontal' && rows[0].loopOn === on
  && Math.abs(rows[0].turns - 1) < 0.3 && Math.abs(rows[0].loop - 1) < 0.3;
const enclosesNothing = (rows) => rows.every((r) => r.object === 'none');

const powerloop = await railLoop();
report(isOneLoopOn(powerloop, 'pitch'), 'a loop round the rail is one turn about a horizontal axis, on pitch',
  powerloop.length ? powerloop.map(describe).join('; ') : 'no turn measured');
const maverick = await railLoop({ noseAlong: true, secs: 2.3 });
report(isOneLoopOn(maverick, 'roll'), 'the same circle flown nose along the rail is the same turn, on roll',
  maverick.length ? maverick.map(describe).join('; ') : 'no turn measured');
report(
  powerloop.length === 1 && maverick.length === 1
    && powerloop[0].object === 'inside' && maverick[0].object === 'inside',
  'and both find the rail inside the circle',
  `loop round it: ${powerloop[0]?.object}, nose along it: ${maverick[0]?.object}`,
);

{
  const rows = await orbitAbout(V(40, 6, 0));
  const orbit = rows.find((r) => r.turns > 1.5);
  report(Boolean(orbit) && orbit.axis === 'vertical' && orbit.trackFrac > 0.7 && orbit.object === 'inside',
    'two laps of the post are two turns about a vertical axis, the post inside',
    orbit ? `${describe(orbit)}, tracked ${d2(orbit.trackFrac)}` : 'no turn over 1.5 measured');
  const arcs = rows.filter((r) => r.turns <= 1.5);
  report(enclosesNothing(arcs), 'and the arcs flown in and out enclose nothing', brief(arcs));
}
{
  const rows = await orbitAbout(V(40, 6, 60));
  report(rows.length > 0 && enclosesNothing(rows), 'the same two laps round empty air find nothing inside', brief(rows));
}
{
  const rows = await openAirFlip();
  report(enclosesNothing(rows), 'a flip in open air encloses nothing, so it is no lap',
    rows.length ? rows.map(describe).join('; ') : 'no turn measured');
}
{
  /* A Juicy Flick: half a pitch back, then half a roll. */
  const r = await openAirRunUp();
  r.stickUntil([0, -0.8, 0, 0.5], 900, (c, i, a) => a.q >= TURN * 0.46);
  r.stickUntil([0.85, 0, 0, 0.5], 900, (c, i, a) => Math.abs(a.p) >= TURN * 0.46);
  r.fly(linePath(r.craft().p, V(0, 10, -10), 2.4), { heading: Math.atan2(0, 1) });
  r.done(700);
  const rows = take(0.3);
  report(enclosesNothing(rows), 'nor does half a pitch and half a roll in open air',
    rows.length ? rows.map(describe).join('; ') : 'no turn measured');
}
{
  const firsts = [];
  for (const [yaw, name] of [[0, '0'], [Math.PI / 2, '90'], [Math.PI, '180']]) {
    firsts.push([name, (await railLoop({ yaw }))[0] ?? null]);
  }
  const ok = firsts.every(([, r]) => r !== null && r.axis === 'horizontal' && r.loopOn === 'pitch');
  const turns = firsts.map(([, r]) => r?.turns);
  const spread = ok ? Math.max(...turns) - Math.min(...turns) : Infinity;
  report(ok && spread < 0.25, 'the loop round the rail measures alike from three spawn yaws',
    `${firsts.map(([name, r]) => `yaw ${name}: ${r ? `${d2(r.turns)} on ${r.loopOn}` : 'nothing'}`).join(' | ')}`
    + ` (spread ${ok ? d2(spread) : 'n/a'})`);
}
const side = (below) => (below ? 'under' : 'over');
{
  const rows = await railLoop();
  const r = rows[0];
  report(
    rows.length === 1 && r.objectAxis === 'horizontal' && Math.abs(Math.abs(r.turnsAbout) - 1) < 0.3
      && r.startBelow === r.endBelow,
    'the loop is one turn about the rail\'s own axis, ending on the side it began',
    r ? `${rows.length} turn(s); first: ${d2(r.turnsAbout)} turns about a ${r.objectAxis ?? 'missing'} axis, `
      + `${side(r.startBelow)} to ${side(r.endBelow)}` : 'no turn measured',
  );
}
{
  const lap = circlePath(RAIL, V(0, -1, 0), V(0, 0, -1), 3.4, 2.9, Math.PI, -0.5);
  const rows = flyCircle(await rig(-20), lap, Math.atan2(0, -1), {}, 0.3);
  const over = rows.find((r) => r.object !== 'none' && !r.startBelow && r.endBelow);
  report(Boolean(over) && Math.abs(Math.abs(over.turnsAbout) - 0.5) < 0.25,
    'half a figure begun over the rail comes out under it, half a turn about the rail',
    over ? `${d2(over.turnsAbout)} turns about it, ${side(over.startBelow)} to ${side(over.endBelow)}, object ${over.object}`
      : `none begun over and ended under: ${rows.map((r) => `${d2(r.turns)} ${side(r.startBelow)} to ${side(r.endBelow)} ${r.object}`).join('; ')}`);
}
{
  const rows = await openAirFlip();
  report(rows.every((r) => r.object === 'none' && r.turnsAbout === null),
    'and a figure in open air has no object axis to turn about',
    rows.length ? rows.map((r) => `object ${r.object}, about ${r.turnsAbout ?? 'nothing'}`).join('; ') : 'no turn measured');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
