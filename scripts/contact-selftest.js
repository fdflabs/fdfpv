/*
 * contact-selftest.js: the plant's ground plane and contact entry points, proved in Node.
 *
 * npm run verify never raises the plant's ground plane or calls its contact
 * entry points, so it cannot see a floor, a wall tap, a tumble or a turtle.
 * This drives dist/sim.wasm directly and asks the questions a pilot would:
 * does a drop land dead, does a tilted drop spin and settle, does an offset
 * wall hit spin the craft, does crashflip right an inverted hull, does a
 * flight that never touches the ground still fall bit for bit as before,
 * does any hull corner or the camera lens end up under the plane, do slides
 * stop, does a seated punch leave the pad, and does a distant plane or the
 * near halo freeze a flip in free air.
 *
 * The grass plane uses GROUND_MU and GROUND_E from collide.js, so the shell's
 * own constants are what get proved. The hull box is written out here on
 * purpose: importing it from collide.js would let a wrong value there move
 * the yardstick together with the thing it measures.
 *
 * Deterministic: no clock, no random, no paths in the output, and no numbers
 * on a passing line, so builds that differ in low bits print the same text.
 * Exit code 1 if any check fails, 0 otherwise. Usage:
 *   node scripts/contact-selftest.js
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { CAMERA_LENS_FORWARD, CAMERA_LENS_UP } from '../src/render/lens.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = readFileSync(join(root, 'dist', 'sim.wasm'));
const config = readFileSync(join(root, 'tests', 'fixtures', 'config-baseline.diff'), 'utf8');

/* The plant's five-inch contact box (plant.c hull defaults) and its 2 mm
 * slop. A corner may sit at the slop; one more millimetre is a real dig. */
const HULL_HALF = 0.094;
const HULL_DOWN = 0.045;
const HULL_UP = 0.038;
const SLOP = 0.002;
const BELOW = -SLOP - 0.001;
const HALO = SLOP + 0.001;
const CORNERS = [];
for (const x of [-HULL_HALF, HULL_HALF]) {
  for (const y of [-HULL_HALF, HULL_HALF]) {
    for (const z of [-HULL_DOWN, HULL_UP]) {
      CORNERS.push([x, y, z]);
    }
  }
}
const LENS = [CAMERA_LENS_FORWARD, 0, CAMERA_LENS_UP];

const LEVEL = [1, 0, 0, 0];
const INVERTED = [0, 1, 0, 0];
const STEP_S = 0.001;

let failures = 0;
function check(label, ok, detail) {
  if (ok) {
    console.log(`  pass ${label}`);
    return;
  }
  failures += 1;
  console.log(detail === undefined ? `  FAIL ${label}` : `  FAIL ${label}: ${detail}`);
}

const f3 = (v) => v.toFixed(3);
const f4 = (v) => v.toFixed(4);

/* State block indices, sim_abi.h. */
const view = (s) => ({
  t: s[0],
  x: s[1], y: s[2], z: s[3],
  vx: s[4], vy: s[5], vz: s[6],
  q: [s[7], s[8], s[9], s[10]],
  rpm: [s[14], s[15], s[16], s[17]],
  omega: Math.sqrt(s[11] * s[11] + s[12] * s[12] + s[13] * s[13]),
  speed: Math.sqrt(s[4] * s[4] + s[5] * s[5] + s[6] * s[6]),
  upZ: Math.min(1, Math.max(-1, 1 - 2 * (s[8] * s[8] + s[9] * s[9]))),
});

/* World z of body vector v under q, from v + 2 (w u + q x u) with u = q x v. */
function worldZ([qw, qx, qy, qz], [vx, vy, vz]) {
  const ux = qy * vz - qz * vy;
  const uy = qz * vx - qx * vz;
  const uz = qx * vy - qy * vx;
  const wz = qx * uy - qy * ux;
  return vz + 2 * (qw * uz + wz);
}

const deepestCorner = (s) => {
  const q = [s[7], s[8], s[9], s[10]];
  let low = Infinity;
  for (const c of CORNERS) {
    low = Math.min(low, s[3] + worldZ(q, c));
  }
  return low;
};
const lensZ = (s) => s[3] + worldZ([s[7], s[8], s[9], s[10]], LENS);

function sameState(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

async function freshSim() {
  const sim = await loadSim(wasm);
  const code = sim.init(config);
  if (code !== SIM_OK) {
    throw new Error(`sim_init returned ${code}`);
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  return sim;
}

function stateOf(sim) {
  const { code, state } = sim.readState();
  if (!state) {
    throw new Error(`sim_state returned ${code}`);
  }
  return state;
}

/* Fly ms milliseconds at fixed sticks. onStep sees every post-step state and
 * may return true to stop early. Returns the last state. */
function fly(sim, ms, sticks = {}, onStep = null) {
  const { roll = 0, pitch = 0, yaw = 0, throttle = 0 } = sticks;
  let s = stateOf(sim);
  let t = s[0];
  for (let i = 1; i <= ms; i += 1) {
    t += STEP_S;
    sim.input(t, roll, pitch, yaw, throttle);
    sim.step(1);
    s = stateOf(sim);
    if (onStep && onStep(s, i)) {
      break;
    }
  }
  return s;
}

/* Fly and keep the lowest hull corner seen after any step. */
function flyLowest(sim, ms, sticks = {}) {
  let low = Infinity;
  const end = fly(sim, ms, sticks, (s) => {
    low = Math.min(low, deepestCorner(s));
  });
  return { end, low };
}

/* A crashflip attempt: the highest the up axis gets (never below where it
 * started) and the lowest a corner digs on the way. */
function turtle(sim, ms, pitch) {
  let peak = view(stateOf(sim)).upZ;
  let low = Infinity;
  fly(sim, ms, { pitch }, (s) => {
    peak = Math.max(peak, view(s).upZ);
    low = Math.min(low, deepestCorner(s));
  });
  return { peak, low };
}

const pose = (sim, z, q) => sim.e.sim_set_pose(0, 0, z, ...q);
const grass = (sim) => sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E);
const contacts = (sim) => sim.e.sim_ground_contacts();
const rollQ = (half) => [Math.cos(half), Math.sin(half), 0, 0];

/* A sim posed and held by the ground, optionally with the motors cut and the
 * grass raised. Blocks that leave the motors on do so to keep airmode live. */
async function seated(z, q, { motorsOff = false, ground = true } = {}) {
  const sim = await freshSim();
  const poseCode = pose(sim, z, q);
  sim.rest();
  if (motorsOff) {
    sim.motorOverride(-1, 0);
  }
  const groundCode = ground ? grass(sim) : null;
  return { sim, poseCode, groundCode };
}

{
  const sim = await freshSim();
  const needed = ['sim_contact', 'sim_set_ground', 'sim_ground_contacts', 'sim_set_crashflip',
    'sim_crashflip_active', 'sim_set_pose'];
  for (const name of needed) {
    if (typeof sim.e[name] !== 'function') {
      throw new Error(`sim.wasm does not export ${name}`);
    }
  }
  console.log('contact selftest');
  check('the module exports the ground and contact entry points', true);
}

{
  const { sim, poseCode, groundCode } = await seated(1.5, LEVEL, { motorsOff: true });
  check('level pose is accepted', poseCode === SIM_OK, `code ${poseCode}`);
  check('grass plane is accepted', groundCode === SIM_OK, `code ${groundCode}`);
  let s = view(fly(sim, 400));
  check('a level drop leaves its start height', s.z < 1.2, `z ${f3(s.z)}`);
  s = view(fly(sim, 1600));
  const n = contacts(sim);
  check('a level drop reaches the grass', n > 0 || s.z < 0.12, `z ${f3(s.z)}, contacts ${n}`);
  check('a level drop lands dead, no bounce or spin', Math.abs(s.vz) < 0.15 && s.omega < 0.4,
    `vz ${f3(s.vz)}, omega ${f3(s.omega)}`);
  check('a level drop rests at hull height', s.z > 0.02 && s.z < 0.12, `z ${f3(s.z)}`);
}

{
  const { sim } = await seated(1.2, rollQ(25 * Math.PI / 360), { motorsOff: true });
  let spin = 0;
  const s = view(fly(sim, 700, {}, (st) => {
    spin = Math.max(spin, view(st).omega);
  }));
  check('a tilted drop spins on first touch', spin > 0.4, `peak omega ${f3(spin)}`);
  check('a tilted drop settles on its belly', s.omega < 1.5 && Math.abs(s.vz) < 0.25,
    `omega ${f3(s.omega)}, vz ${f3(s.vz)}`);
}

{
  const { sim } = await seated(4.0, LEVEL, { motorsOff: true });
  const s = view(fly(sim, 2500));
  check('a hard drop stays finite', Number.isFinite(s.z) && Number.isFinite(s.vz) && Number.isFinite(s.omega),
    `z ${s.z}, vz ${s.vz}, omega ${s.omega}`);
  check('a hard drop does not rebound', Math.abs(s.vz) < 0.25, `vz ${f3(s.vz)}`);
}

{
  const { sim } = await seated(0.5, LEVEL, { ground: false });
  const code = sim.e.sim_contact(1, 0, 0, 0.32, 0.38, 0, 0, 0.5, 8, 0, 0);
  const s = view(stateOf(sim));
  check('an offset wall hit is accepted', code === SIM_OK, `code ${code}`);
  check('an offset wall hit spins the craft', s.omega > 0.5, `omega ${f3(s.omega)}`);
  check('an offset wall hit shoves along the normal', s.vx > 0.5, `vx ${f3(s.vx)}`);
}

{
  const { sim } = await seated(0.08, INVERTED);
  const up = view(fly(sim, 200)).upZ;
  check('an inverted craft seats upside down on the grass', up < -0.7, `up ${f3(up)}`);
  const armCode = sim.e.sim_set_crashflip(1);
  const active = armCode === SIM_OK ? sim.e.sim_crashflip_active() : null;
  check('crashflip arms and reports active', armCode === SIM_OK && active === 1,
    `code ${armCode}, active ${active}`);
  const { rpm } = view(fly(sim, 80, { pitch: 1 }));
  check('crashflip with pitch splits the motors', Math.max(...rpm) > Math.min(...rpm) + 200,
    `rpm ${rpm.map((r) => r.toFixed(0)).join(',')}`);

  // Both stick signs are tried, so a mixer sign change cannot skip the proof.
  const attempt = async (pitch) => {
    const tsim = await freshSim();
    pose(tsim, 0.08, INVERTED);
    tsim.rest();
    tsim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 0.55, 0.28);
    fly(tsim, 250);
    tsim.e.sim_set_crashflip(1);
    const start = view(stateOf(tsim)).upZ;
    return { start, ...turtle(tsim, 1800, pitch) };
  };
  const neg = await attempt(-1);
  const pos = await attempt(1);
  const best = neg.peak > pos.peak ? neg : pos;
  check('crashflip raises an inverted hull', best.peak > neg.start + 0.35,
    `start ${f3(neg.start)}, peak ${f3(best.peak)}`);
  check('crashflip rolls the hull out of inverted', best.peak > 0, `peak ${f3(best.peak)}`);
  check('crashflip keeps every corner above the plane', best.low > BELOW, `corner ${f4(best.low)}`);
}

{
  const freeFall = async (setup) => {
    const sim = await freshSim();
    const code = setup ? setup(sim) : null;
    return { sim, code, end: fly(sim, 500) };
  };
  const a = await freeFall();
  const b = await freeFall();
  check('two free-air flights are bit identical', sameState(a.end, b.end));
  check('a free-air flight falls', a.end[3] < -0.5, `z ${f3(a.end[3])}`);
  const c = await freeFall((sim) => sim.e.sim_set_ground(0, 0, 0, 1, 0, 0, 0, 0, 0));
  check('lowering the ground is accepted', c.code === SIM_OK, `code ${c.code}`);
  check('a lowered ground leaves free air bit identical', sameState(a.end, c.end));
  const d = await freeFall((sim) => sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, -100, GROUND_MU, GROUND_E));
  const dz = Math.abs(d.end[3] - a.end[3]);
  const dn = contacts(d.sim);
  check('a plane 100 m down does not touch free air', dz < 1e-9 && dn === 0,
    `dz ${dz.toFixed(6)}, contacts ${dn}`);
}

{
  const landed = async () => {
    const { sim } = await seated(1.2, LEVEL, { motorsOff: true });
    return fly(sim, 900);
  };
  const a = await landed();
  const b = await landed();
  check('two grounded flights are bit identical', sameState(a, b));
}

{
  const { sim } = await seated(0.045, LEVEL, { motorsOff: true });
  const rest = view(fly(sim, 20));
  sim.e.sim_contact(1, 0, 0, 0, 0, rest.x, rest.y, rest.z, 8, 0, 0);
  const shoved = view(stateOf(sim));
  check('a belly shove leaves speed along the grass', shoved.vx > 2, `vx ${f3(shoved.vx)}`);
  grass(sim);
  let s = view(fly(sim, 20));
  check('a belly landing slides at first', s.vx > 0.15, `vx ${f3(s.vx)}`);
  s = view(fly(sim, 180));
  check('grass stops a belly slide', Math.abs(s.vx) < 0.15, `vx ${f3(s.vx)}`);
  const dx = Math.abs(s.x - shoved.x);
  check('a belly slide is short', dx < 0.40, `dx ${f3(dx)}`);
  check('a belly slide stays on the plane', s.z > 0.02 && s.z < 0.16, `z ${f3(s.z)}`);
}

{
  const { sim } = await seated(0.5, LEVEL, { motorsOff: true, ground: false });
  sim.e.sim_contact(-1, 0, 0, 0.12, 0.20, 0, 0, 0.5, -16, 0, 0);
  const inVx = view(stateOf(sim)).vx;
  check('a closing wall hit carries the craft in', inVx < -4, `vx ${f3(inVx)}`);
  sim.e.sim_contact(1, 0, 0, 0.38, 0.28, 0, 0, 0.5, 0, 0, 0);
  const outVx = view(stateOf(sim)).vx;
  check('a wall bounce reverses the closing speed', outVx > 0, `vx ${f3(outVx)}`);
  check('a racing-speed wall bounce dumps energy', Math.abs(outVx) < Math.abs(inVx) * 0.85,
    `out ${f3(outVx)}, in ${f3(inVx)}`);
}

{
  const { sim } = await seated(0.35, rollQ(Math.PI / 4), { motorsOff: true });
  const s = view(fly(sim, 350));
  check('a side arrival rolls instead of locking', s.omega > 0.5, `omega ${f3(s.omega)}`);
  check('a side arrival stays finite and near the plane',
    Number.isFinite(s.z) && Number.isFinite(s.omega) && Math.abs(s.z) < 2, `z ${s.z}, omega ${s.omega}`);
}

{
  const { sim } = await seated(0.08, INVERTED);
  const end = fly(sim, 1800);
  const s = view(end);
  check('an inverted airmode rest settles enough to turtle', s.speed < 4 && s.upZ < 0,
    `speed ${f3(s.speed)}, up ${f3(s.upZ)}`);
  const low = deepestCorner(end);
  check('an inverted rest keeps every corner above the plane', low > BELOW, `corner ${f4(low)}`);
  const lens = lensZ(end);
  check('an inverted rest keeps the camera above the plane', lens > BELOW, `camera ${f4(lens)}`);
}

{
  const { sim } = await seated(0.08, INVERTED);
  fly(sim, 250);
  sim.e.sim_set_crashflip(1);
  let flip = turtle(sim, 1800, -1);
  if (!(flip.peak > 0)) {
    flip = turtle(sim, 1800, 1);
  }
  check('turtle mode rights the craft', flip.peak > 0, `peak ${f3(flip.peak)}`);
  sim.e.sim_set_crashflip(0);
  pose(sim, 0.045, LEVEL);
  sim.rest();
  const z0 = stateOf(sim)[3];
  const s = view(fly(sim, 700, { throttle: 1 }));
  check('after turtle, throttle flies again', s.z > z0 + 0.15 || s.speed > 1.5,
    `z ${f3(s.z)}, speed ${f3(s.speed)}`);
}

{
  const { sim } = await seated(1.5, INVERTED, { motorsOff: true });
  const { end, low } = flyLowest(sim, 2000);
  check('an inverted slam ends above the plane', end[3] > -0.02, `z ${f4(end[3])}`);
  check('an inverted slam never digs a corner in', low > BELOW, `corner ${f4(low)}`);
}

{
  const { sim } = await seated(0.08, INVERTED);
  fly(sim, 200);
  const { end, low } = flyLowest(sim, 800, { throttle: 1 });
  check('inverted full throttle ends above the plane', end[3] > -0.02, `z ${f4(end[3])}`);
  check('inverted full throttle never digs a corner in', low > BELOW, `corner ${f4(low)}`);
}

{
  const a = 35 * Math.PI / 360;
  const { sim } = await seated(0.12, [0, Math.cos(a), 0, -Math.sin(a)], { motorsOff: true });
  const { low } = flyLowest(sim, 800);
  check('an angled inverted rest never digs a corner in', low > BELOW, `corner ${f4(low)}`);
}

{
  const { sim } = await seated(-1.0, INVERTED, { motorsOff: true });
  sim.step(1);
  const s = stateOf(sim);
  const low = deepestCorner(s);
  check('a buried start is lifted onto the plane in one step', s[3] > -0.02 && low > BELOW,
    `z ${f4(s[3])}, corner ${f4(low)}`);
}

{
  const { sim } = await seated(0.08, INVERTED);
  fly(sim, 250);
  sim.e.sim_set_crashflip(1);
  const { low } = flyLowest(sim, 1800, { pitch: -1 });
  check('a turtle sweep never digs a corner in', low > BELOW, `corner ${f4(low)}`);
}

{
  const { sim } = await seated(0.5, LEVEL, { motorsOff: true, ground: false });
  sim.e.sim_contact(-1, 0, 0, 0.12, 0.20, 0, 0, 0.5, -10, 0, 0);
  const inVx = view(stateOf(sim)).vx;
  const code = sim.e.sim_deflect(1, 0, 0, 0.35, 0.5, 0.5, 0, 0, 0.5);
  const s = view(stateOf(sim));
  check('the deflect wrapper is accepted', code === SIM_OK, `code ${code}`);
  check('the deflect wrapper spins and turns the craft back', s.omega > 0.2 && s.vx > inVx,
    `omega ${f3(s.omega)}, vx ${f3(s.vx)} vs ${f3(inVx)}`);
}

{
  const { sim } = await seated(1.5, LEVEL, { motorsOff: true });
  let hit = false;
  let rebound = 0;
  fly(sim, 2000, {}, (s) => {
    hit = hit || contacts(sim) > 0;
    if (hit) {
      rebound = Math.max(rebound, s[6]);
    }
  });
  check('touchdown is a dead thump', hit && rebound < 0.25, `peak vz ${f3(rebound)}, hit ${hit}`);
}

{
  const { sim } = await seated(0.02, INVERTED, { motorsOff: true });
  const rest = fly(sim, 10);
  const r = view(rest);
  const restLow = deepestCorner(rest);
  check('a props-down craft seats on the grass', r.upZ < -0.7 && restLow > BELOW && restLow < 0.01,
    `up ${f3(r.upZ)}, corner ${f4(restLow)}, contacts ${contacts(sim)}`);
  sim.e.sim_contact(1, 0, 0, 0, 0, r.x, r.y, r.z, 8, 0, 0);
  const shoved = view(stateOf(sim));
  grass(sim);
  const end = fly(sim, 5);
  const s = view(end);
  check('a props-down shove leaves speed', shoved.vx > 2, `vx ${f3(shoved.vx)}`);
  check('a props-down arrival stops at once', s.speed < 0.12, `speed ${f3(s.speed)}`);
  const dx = Math.abs(s.x - shoved.x);
  check('a props-down arrival barely moves', dx < 0.03, `dx ${f4(dx)}`);
  const low = deepestCorner(end);
  const lens = lensZ(end);
  check('a props-down arrival keeps hull and camera above the plane', low > BELOW && lens > BELOW,
    `corner ${f4(low)}, camera ${f4(lens)}`);
}

{
  const h = Math.PI / 4;
  const { sim } = await seated(0.20, [Math.cos(h), 0, Math.sin(h), 0], { motorsOff: true });
  let lowLens = Infinity;
  fly(sim, 800, {}, (s) => {
    lowLens = Math.min(lowLens, lensZ(s));
  });
  check('a nose-down rest keeps the camera above the plane', lowLens > BELOW, `camera ${f4(lowLens)}`);
}

{
  const { sim } = await seated(0.045, LEVEL);
  let leftAt = -1;
  const s = view(fly(sim, 500, { throttle: 1 }, (st, i) => {
    if (leftAt < 0 && st[3] > 0.12) {
      leftAt = i;
    }
  }));
  check('a seated punch leaves the pad promptly', leftAt > 0 && leftAt < 200, `left at ${leftAt}ms`);
  check('a seated punch climbs', s.z > 0.5 && s.vz > 1.0, `z ${f3(s.z)}, vz ${f3(s.vz)}`);
  check('a seated punch stays upright', s.upZ > 0.7, `up ${f3(s.upZ)}`);
}

{
  const { sim } = await seated(4.0, INVERTED);
  const r = view(stateOf(sim));
  sim.e.sim_contact(1, 0, 0, 0, 0, r.x, r.y, r.z, 6, 0, 0);
  const launched = view(stateOf(sim));
  check('an inverted craft high above the grass is launched', launched.vx > 2 && launched.upZ < -0.7,
    `vx ${f3(launched.vx)}, up ${f3(launched.upZ)}`);
  const s = view(fly(sim, 40));
  check('a distant plane does not freeze an inverted flip', s.speed > 1.5 && s.z > 3.5,
    `speed ${f3(s.speed)}, z ${f3(s.z)}`);
  const n = contacts(sim);
  check('a distant plane reports no contacts', n === 0, `contacts ${n}`);
}

{
  const { sim } = await seated(4.0, LEVEL);
  const r = view(stateOf(sim));
  sim.e.sim_contact(1, 0, 0, 0.32, 0.38, r.x, r.y, r.z, 8, 0, 0);
  const w0 = view(stateOf(sim)).omega;
  check('a high wall hit leaves a roll', w0 > 0.8, `omega ${f3(w0)}`);
  const s = view(fly(sim, 40));
  check('a distant plane does not freeze a leftover roll', s.omega > 0.4 && s.z > 3.5,
    `omega ${f3(s.omega)}, z ${f3(s.z)}`);
}

{
  const { sim } = await seated(0.18, rollQ(135 * Math.PI / 360));
  const r = view(stateOf(sim));
  sim.e.sim_contact(1, 0, 0, 0.32, 0.38, r.x, r.y, r.z, 8, 0, 0);
  const w0 = view(stateOf(sim)).omega;
  check('a wall hit near the grass spins the craft hard', w0 > 8, `omega ${f3(w0)}`);
  let frozenAt = -1;
  fly(sim, 120, {}, (s, i) => {
    const v = view(s);
    if (v.speed < 0.05 && v.omega < 0.05 && deepestCorner(s) > HALO) {
      frozenAt = i;
      return true;
    }
    return false;
  });
  check('the near halo does not freeze a flip in mid air', frozenAt < 0, `frozen at ${frozenAt}ms`);
}

{
  const sim = await freshSim();
  const badNormal = sim.e.sim_contact(2, 0, 0, 0.3, 0.3, 0, 0, 0, 0, 0, 0);
  check('a contact with a non-unit normal is refused', badNormal !== SIM_OK, `code ${badNormal}`);
  const badMu = sim.e.sim_contact(1, 0, 0, 0.3, 3, 0, 0, 0, 0, 0, 0);
  check('a contact with friction out of range is refused', badMu !== SIM_OK, `code ${badMu}`);
  const zeroNormal = sim.e.sim_set_ground(1, 0, 0, 0, 0, 0, 0, 0.5, 0.3);
  check('a ground with a zero normal is refused', zeroNormal !== SIM_OK, `code ${zeroNormal}`);
}

{
  const sim = await loadSim(wasm);
  const code = sim.e.sim_set_crashflip(1);
  check('crashflip is refused before init', code !== SIM_OK, `code ${code}`);
}

console.log('');
console.log(failures ? `${failures} failed` : 'all contact checks passed');
process.exitCode = failures ? 1 : 0;
