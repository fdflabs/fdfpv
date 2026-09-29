/*
 * boost-check.js: Catch the Ace's chase boost in the plant (sim_set_boost,
 * src/native/sim_abi.h), measured. npm run boost:check.
 *
 * The owner: "if you are NOT the ace, you get a 5% speed boost for
 * chasing". The boost is every prop as if it turned faster, its pitch
 * speed scaled and its thrust by the square (sim_abi.h says why that and
 * not a thrust scale), at CHASE_BOOST (src/share/roomtag.js). This holds:
 *
 *   1. 1.0 is today: a scripted flight of the five inch and one of the Cub
 *      with sim_set_boost(1) called before and during it are bit identical,
 *      state by state, to the same flights that never call it.
 *   2. The mode: 1.0 to 1.5 is taken and anything else refused, and it
 *      survives sim_reset and sim_init as the gravity scale does.
 *   3. The owner's number: at CHASE_BOOST the level top speed at full
 *      throttle rises about 5 percent (BAND) on the five inch and on the
 *      Cub, each flown to a steady level at full throttle by a pilot loop,
 *      and the static pull by the square of the boost.
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
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import {
  CUB_AIRFRAME, RC_STEP_MS, attitude, levelSpeed, must, wingDebug,
} from '../tests/lib/wingpilot.js';
import { CHASE_BOOST } from '../src/share/roomtag.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = await readFile(join(root, 'dist/sim.wasm'));
const config = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

/* "About 5 percent": the band the level top speed gain is held to. */
const BAND = { min: 0.04, max: 0.07 };

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  failed += ok ? 0 : 1;
}

async function quadSim() {
  const sim = await loadSim(wasm);
  must(sim.init(config), 'sim_init');
  must(sim.reset(), 'sim_reset');
  must(sim.setCellVoltage(4.2), 'sim_set_cell_voltage');
  return sim;
}

async function cubSim() {
  const sim = await loadSim(wasm);
  must(sim.init(config), 'sim_init');
  must(sim.e.sim_set_airframe(CUB_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.reset(), 'sim_reset');
  return sim;
}

/* A scripted flight's digest over every step's state: a punch, a roll, a
 * dive, at 1 kHz; `touch` is called before it and half way. */
function trace(sim, ms, sticksAt, touch) {
  const h = createHash('sha256');
  touch(sim);
  for (let i = 0; i < ms; i += 1) {
    if (i === ms / 2) {
      touch(sim);
    }
    must(sim.input((i + 1) / 1000, ...sticksAt(i)), 'sim_input');
    must(sim.step(1), 'sim_step');
    h.update(sim.readStateBytes().bytes);
  }
  return h.digest('hex');
}
const quadSticks = (i) => [i > 1500 && i < 2500 ? 0.6 : 0, i > 3000 ? -0.4 : 0, 0.1, i < 1000 ? 0.5 : 0.85];
const cubSticks = (i) => [i > 1500 && i < 2500 ? 0.5 : 0, i > 3000 ? -0.3 : 0.05, 0, 0.9];

/*
 * The five inch's level top speed at full throttle: a pilot loop tilts it
 * forward until the climb is gone (acro, attitude held by the sticks), and
 * the horizontal speed over the last 5 of 40 s is the answer. Started
 * already tilted, near the answer, so it settles on the one level
 * equilibrium rather than wandering.
 */
async function quadTop(boost) {
  const sim = await quadSim();
  must(sim.e.sim_set_boost(boost), 'sim_set_boost');
  let target = -1.1;
  const out = [];
  const total = 40000;
  for (let ms = 0; ms < total; ms += 1) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const vz = s[6];
    target = Math.max(-1.52, Math.min(0, target - 0.00002 * vz));
    const pt = ms < 1000 ? 0 : target - 0.03 * vz;
    const pitchStick = Math.max(-1, Math.min(1, 2.0 * (pt - pitch) - 0.08 * s[12]));
    const roll = Math.max(-1, Math.min(1, -2.0 * bank - 0.08 * s[11]));
    must(sim.input((ms + 1) / 1000, roll, pitchStick, 0, ms < 1000 ? 0.4 : 1), 'sim_input');
    must(sim.step(1), 'sim_step');
    if (ms >= total - 5000) {
      out.push([Math.hypot(s[4], s[5]), vz]);
    }
  }
  const mean = (i) => out.reduce((a, r) => a + r[i], 0) / out.length;
  return { v: mean(0), vz: mean(1) };
}

/* The Cub's, from tests/lib/wingpilot.js: wings level, climb held at nil. */
async function cubTop(boost) {
  const sim = await cubSim();
  must(sim.e.sim_set_boost(boost), 'sim_set_boost');
  return levelSpeed(sim, 1);
}

/* Static pull at full throttle, the Cub held still for a step. */
async function cubPull(boost) {
  const sim = await cubSim();
  must(sim.e.sim_set_boost(boost), 'sim_set_boost');
  must(sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.input(0, 0, 0, 0, 1), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  return wingDebug(sim)[8];
}

console.log(`the chase boost, CHASE_BOOST ${CHASE_BOOST}`);

console.log('1. at 1.0 it is today, bit for bit');
{
  const none = () => {};
  const one = (sim) => must(sim.e.sim_set_boost(1), 'sim_set_boost');
  const qa = trace(await quadSim(), 5000, quadSticks, none);
  const qb = trace(await quadSim(), 5000, quadSticks, one);
  check('the five inch: 5 s punched, rolled and dived, every state the same with sim_set_boost(1) as without', qa === qb, `${qa.slice(0, 16)} ${qb.slice(0, 16)}`);
  const ca = trace(await cubSim(), 5000, cubSticks, (sim) => must(sim.e.sim_wing_launch(12), 'sim_wing_launch'));
  const cb = trace(await cubSim(), 5000, cubSticks, (sim) => {
    must(sim.e.sim_wing_launch(12), 'sim_wing_launch');
    one(sim);
  });
  check('the Cub: 5 s from a throw, every state the same with sim_set_boost(1) as without', ca === cb, `${ca.slice(0, 16)} ${cb.slice(0, 16)}`);
  const qc = trace(await quadSim(), 5000, quadSticks, (sim) => must(sim.e.sim_set_boost(CHASE_BOOST), 'sim_set_boost'));
  check('and the boost does change the flight', qc !== qa);
}

console.log('2. a mode');
{
  const sim = await quadSim();
  const refused = [0.99, 1.51, NaN].every((x) => sim.e.sim_set_boost(x) !== SIM_OK) && sim.e.sim_boost() === 1;
  check('outside 1.0 to 1.5 it is refused, and nothing changes', refused);
  must(sim.e.sim_set_boost(CHASE_BOOST), 'sim_set_boost');
  must(sim.reset(), 'sim_reset');
  const afterReset = sim.e.sim_boost();
  must(sim.init(config), 'sim_init');
  check('it survives sim_reset and sim_init', afterReset === CHASE_BOOST && sim.e.sim_boost() === CHASE_BOOST, `${afterReset} ${sim.e.sim_boost()}`);
}

console.log('3. the owner\'s 5 percent');
{
  const q0 = await quadTop(1);
  const q1 = await quadTop(CHASE_BOOST);
  const qGain = q1.v / q0.v - 1;
  check(`the five inch's level top speed at full throttle rises ${Math.round(BAND.min * 100)} to ${Math.round(BAND.max * 100)} percent`,
    qGain >= BAND.min && qGain <= BAND.max && Math.abs(q0.vz) < 0.2 && Math.abs(q1.vz) < 0.2,
    `${q0.v.toFixed(2)} to ${q1.v.toFixed(2)} m/s, ${(qGain * 100).toFixed(1)} percent, climb ${q0.vz.toFixed(3)} and ${q1.vz.toFixed(3)} m/s`);
  const c0 = await cubTop(1);
  const c1 = await cubTop(CHASE_BOOST);
  const cGain = c1.v / c0.v - 1;
  check(`the Cub's level top speed at full throttle rises ${Math.round(BAND.min * 100)} to ${Math.round(BAND.max * 100)} percent`,
    cGain >= BAND.min && cGain <= BAND.max && Math.abs(c0.vz) < 1 && Math.abs(c1.vz) < 1,
    `${c0.v.toFixed(2)} to ${c1.v.toFixed(2)} m/s, ${(cGain * 100).toFixed(1)} percent, climb ${c0.vz.toFixed(2)} and ${c1.vz.toFixed(2)} m/s`);
  const p0 = await cubPull(1);
  const p1 = await cubPull(CHASE_BOOST);
  /* To a part in a thousand: the pack sags a little more under the
   * larger current (src/native/plant_wing.c power_duty) and takes a
   * sliver back. */
  check('the Cub\'s static pull rises by the square of the boost', Math.abs(p1 / p0 - CHASE_BOOST * CHASE_BOOST) < 1e-3,
    `${p0.toFixed(3)} to ${p1.toFixed(3)} N, ${(p1 / p0).toFixed(6)}`);
}

console.log(`\n${failed ? `${failed} FAILED` : 'all passed'}`);
process.exit(failed ? 1 : 0);
