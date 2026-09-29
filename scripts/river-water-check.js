/*
 * river-water-check.js: a river is water to the plant. In Node, against
 * dist/sim.wasm.
 *
 *   node scripts/river-water-check.js
 *
 * The owner: "the water physics isnt working in the river, it is working
 * in the lake". swiss2's stream was drawn and never declared: the plant's
 * water was one flat surface over a polygon, four bodies at most, and a
 * river three kilometres long that falls and rises with its bed is
 * neither. A channel (sim_water_channel) is water within a half width of
 * a centre line whose points each carry the surface's height, level
 * across and straight along between them. This flies the plant on one:
 *
 *   the channel: its surface between two points, its slope, and dry
 *     ground past its half width; the refusals;
 *   a level channel is the lake: the Timber on floats floating, taking off
 *     and flying on a channel at z = 0 is bit for bit the same flight as
 *     on a lake at z = 0;
 *   on a sloped channel, 4.8 m wide over a bed 0.16 m under the surface as
 *     swiss2's stream is drawn: the Timber floats at its lake height over
 *     the local surface, takes off down it inside its banks, lands back
 *     on it, and taxis along it;
 *   a Skyhunter flown into the channel with crash physics on goes into
 *     the water, as into the lake, and the same throw with no channel
 *     declared does not.
 *
 * Exits 1 on any failure.
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

import { loadSim, SIM_OK, SIM_ERR_BAD_ARG, SIM_ERR_BAD_STATE } from '../tests/lib/simmod.js';
import {
  TIMBERF_AIRFRAME, FLOAT_REST, SKY_AIRFRAME, RC_STEP_MS, floatState, floatTakeoffSticks, attitude, must,
} from '../tests/lib/wingpilot.js';
import { DAMAGE_FLAGS } from '../configs/parts.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
/* A module of its own for each flight that is compared bit for bit, so
 * neither inherits what an earlier one left in the plant. */
async function freshSim() {
  const m = await loadSim(wasmBytes);
  if (m.init(configText) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  must(m.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  return m;
}
let sim = await freshSim();

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const W_TIMBER = 1.934 * 9.81;

/* swiss2's lower stream: 5.2 m wide as drawn, the water 0.16 m over its
 * bed at the centre (src/maps/swiss2/water/stream.js). */
const HALF = 2.6;
const DEPTH = 0.16;
/* The test river: along x every 2 m, straight to x = 200 and then
 * bending 20 m to the left over the next 180, falling 0.2 m in 100. */
const SLOPE = -0.002;
const riverLine = (slope) => {
  const pts = [];
  for (let x = -40; x <= 380; x += 2) {
    pts.push({ x, y: x <= 200 ? 0 : ((x - 200) / 180) * 20, z: slope * x });
  }
  return pts;
};

function declareRiver(pts) {
  const b = sim.e.sim_water_channel(HALF);
  if (b < 0) {
    throw new Error(`sim_water_channel: ${b}`);
  }
  for (const p of pts) {
    must(sim.e.sim_water_channel_point(b, p.x, p.y, p.z), 'sim_water_channel_point');
  }
  return b;
}

const sampleOut = sim.e.malloc(7 * 8);
function sample(x, y) {
  must(sim.e.sim_water_sample(x, y, 0, sampleOut), 'sim_water_sample');
  return Array.from(new Float64Array(sim.e.memory.buffer, sampleOut, 7));
}

/* The channel itself. */
{
  must(sim.e.sim_water_clear(), 'sim_water_clear');
  const b = declareRiver(riverLine(SLOPE));
  const mid = sample(101, 1.5);
  const out = sample(101, HALF + 0.05);
  const bend = sample(290, 10 + 1);
  const past = sample(390, 21);
  check('a channel is water within its half width of its line, at the surface between two points',
    b === 0 && mid[0] === 0 && Math.abs(mid[1] - SLOPE * 101) < 1e-12 && Math.abs(mid[2] - SLOPE) < 1e-12 && mid[3] === 0 && out[0] === -1 && bend[0] === 0 && past[0] === -1,
    `at (101, 1.5) body ${mid[0]} z ${mid[1].toFixed(6)} slope ${mid[2].toFixed(6)}; ${HALF + 0.05} m off the line body ${out[0]}; on the bend body ${bend[0]} z ${bend[1].toFixed(4)}; past its end body ${past[0]}`);
  const refused = [
    sim.e.sim_water_channel(0), sim.e.sim_water_channel(NaN), sim.e.sim_water_channel(2000),
    sim.e.sim_water_wind(b, 2, 1, 0, 100), sim.e.sim_water_swell(b, 0.1, 2, 1, 0), sim.e.sim_water_vertex(b, 0, 0),
    sim.e.sim_water_channel_point(b, NaN, 0, 0),
  ];
  const lake = sim.e.sim_water_add(0, 0, 0);
  const late = sim.e.sim_water_channel_point(b, 400, 20, 0);
  for (let k = 0; k < 6; k += 1) {
    sim.e.sim_water_add(0, 0, 0);
  }
  const full = sim.e.sim_water_channel(1);
  check('a bad channel, wind or swell on one, a point after another body, and a full table are refused',
    refused.every((c) => c === SIM_ERR_BAD_ARG) && lake === 1 && late === SIM_ERR_BAD_ARG && full === SIM_ERR_BAD_STATE,
    `${refused.join(', ')}; point after a lake ${late}; ninth body ${full}`);
}

/* The Timber on floats on the water declared by `water`, its bed DEPTH
 * under the surface at x = 0 along the river's slope. */
function onRiver(water, slope, z0) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_airframe(TIMBERF_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_flaps(1), 'sim_wing_set_flaps');
  const n = Math.hypot(slope, 1);
  must(sim.e.sim_set_ground(1, -slope / n, 0, 1 / n, 0, 0, z0 - DEPTH, 1.4, 0), 'sim_set_ground');
  must(sim.e.sim_water_clear(), 'sim_water_clear');
  water();
  const rest = FLOAT_REST[TIMBERF_AIRFRAME];
  const h = rest.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, z0 + rest.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}

/* Floats, then a take off down the river on the manual's sticks, then
 * the climb away: the state every step, hashed, and what the run saw. */
function takeOff(ms0 = 0) {
  const hash = createHash('sha256');
  let clock = ms0;
  const run = { rest: null, lof: null, worstY: 0, climb: null };
  let onStep = false;
  let s = sim.readState().state;
  for (let ms = 0; ms < 16000; ms += RC_STEP_MS) {
    let sticks = [0, 0, 0, 0];
    if (ms >= 4000) {
      const f = floatState(sim);
      if (!onStep && f[0] < 0.25 * W_TIMBER && ms > 4200) {
        onStep = true;
      }
      const { bank } = attitude(s);
      const yaw = clamp1(-0.6 * s[2] - 0.8 * s[5]);
      sticks = run.lof ? [clamp1(-1.2 * bank - 0.12 * s[11]), clamp1(3 * (0.12 - attitude(s).pitch) + 0.3 * s[12]), 0, 1]
        : floatTakeoffSticks(s, { onStep, vRotate: 7.6 });
      sticks[2] = run.lof ? 0 : yaw;
    }
    must(sim.input(clock / 1000, ...sticks), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    clock += RC_STEP_MS;
    s = sim.readState().state;
    hash.update(new Uint8Array(Float64Array.from(s).buffer));
    if (ms === 3996) {
      run.rest = { z: s[3], pitch: attitude(s).pitch * 180 / Math.PI, x: s[1] };
    }
    const f = floatState(sim);
    if (ms > 4000 && !run.lof) {
      run.worstY = Math.max(run.worstY, Math.abs(s[2]));
      if (f[4] + f[5] === 0 && speed(s) > 5) {
        run.lof = { x: s[1], v: speed(s), t: (ms - 4000) / 1000 };
      }
    }
    run.climb = { x: s[1], y: s[2], z: s[3] };
  }
  run.hash = hash.digest('hex').slice(0, 16);
  return run;
}

/* A level channel is the lake. */
{
  sim = await freshSim();
  onRiver(() => sim.e.sim_water_add(0, 0, 0), 0, 0);
  const lake = takeOff();
  sim = await freshSim();
  onRiver(() => declareRiver(riverLine(0)), 0, 0);
  const river = takeOff();
  check('the Timber floats, takes off and climbs on a level channel exactly as on the lake',
    lake.hash === river.hash && Boolean(lake.lof),
    `lake ${lake.hash}, channel ${river.hash}; liftoff ${lake.lof ? `${lake.lof.x.toFixed(1)} m down at ${lake.lof.v.toFixed(2)} m/s` : 'never'}`);
}

/* On a sloped channel. */
{
  onRiver(() => declareRiver(riverLine(SLOPE)), SLOPE, 0);
  const r = takeOff();
  const surfaceAtRest = SLOPE * r.rest.x;
  const over = r.rest.z - surfaceAtRest;
  const want = FLOAT_REST[TIMBERF_AIRFRAME].z;
  check('on a sloped channel the Timber floats at its lake height over the surface under it',
    Math.abs(over - want) < 0.003,
    `CG ${over.toFixed(4)} m over the surface at x ${r.rest.x.toFixed(2)}, on the lake ${want}; pitch ${r.rest.pitch.toFixed(2)} deg`);
  check('and takes off down it inside its banks',
    Boolean(r.lof) && r.worstY < HALF - 0.5,
    r.lof ? `liftoff ${r.lof.x.toFixed(1)} m down at ${r.lof.v.toFixed(2)} m/s after ${r.lof.t.toFixed(2)} s, at most ${r.worstY.toFixed(2)} m off the line` : 'never left the water');

  /* Down onto it: level at 1.2 m over the surface at 11 m/s, idle, held
   * off nose up, kept on the line with the rudder, then a taxi. */
  onRiver(() => declareRiver(riverLine(SLOPE)), SLOPE, 0);
  const x0 = 20;
  must(sim.e.sim_set_pose(x0, 0, SLOPE * x0 + 1.2, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_set_velocity(11, 0, -0.3, 0, 0, 0), 'sim_set_velocity');
  let s = sim.readState().state;
  let touch = null;
  let wetFor = 0;
  let worstY = 0;
  let clock = 0;
  let afloat = null;
  let taxi = null;
  for (let ms = 0; ms < 26000; ms += RC_STEP_MS) {
    const { pitch, bank } = attitude(s);
    const roll = clamp1(-1.2 * bank - 0.12 * s[11]);
    const yaw = clamp1(-0.6 * s[2] - 0.8 * s[5]);
    const f = floatState(sim);
    const wet = f[4] + f[5] > 0;
    let sticks;
    if (ms < 16000) {
      sticks = [roll, touch ? 1 : clamp1(3 * (0.1 - pitch) + 0.3 * s[12]), yaw, 0];
    } else {
      sticks = [roll, 0.3, yaw, 0.3];
    }
    must(sim.input(clock / 1000, ...sticks), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    clock += RC_STEP_MS;
    s = sim.readState().state;
    if (wet && !touch) {
      touch = { x: s[1], v: speed(s) };
    }
    wetFor = wet ? wetFor + RC_STEP_MS : 0;
    worstY = Math.max(worstY, Math.abs(s[2]));
    if (ms === 15996) {
      afloat = { x: s[1], v: speed(s), buoy: floatState(sim)[0], over: s[3] - SLOPE * s[1], wetFor };
    }
    if (ms === 25996) {
      taxi = { x: s[1], v: speed(s), wetFor };
    }
  }
  check('it lands on the sloped channel from 1.2 m and comes to float on it inside its banks',
    Boolean(touch) && afloat.wetFor > 5000 && afloat.v < 1.5 && Math.abs(afloat.buoy - W_TIMBER) < 0.25 * W_TIMBER && worstY < HALF - 0.5,
    touch ? `touched down at x ${touch.x.toFixed(1)}, ${touch.v.toFixed(2)} m/s; 16 s on: ${afloat.v.toFixed(2)} m/s, buoyancy ${afloat.buoy.toFixed(1)} N of a weight ${W_TIMBER.toFixed(1)}, CG ${afloat.over.toFixed(3)} m over the surface, wet ${(afloat.wetFor / 1000).toFixed(1)} s; at most ${worstY.toFixed(2)} m off the line` : 'never touched the water');
  check('and taxis along it',
    taxi.wetFor >= 10000 && taxi.x - afloat.x > 5,
    `${(taxi.x - afloat.x).toFixed(1)} m in 10 s at 30 percent, ${taxi.v.toFixed(2)} m/s, wet throughout: ${taxi.wetFor >= 10000}`);
}

/* A landplane into it, crash physics on, the ground at the surface as the
 * shell puts it over water. */
function skyInto(declare) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_airframe(SKY_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_damage(1), 'sim_set_damage');
  must(sim.e.sim_water_clear(), 'sim_water_clear');
  if (declare) {
    declareRiver(riverLine(SLOPE));
  }
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, SLOPE * 60, 1.4, 0), 'sim_set_ground');
  must(sim.e.sim_set_pose(40, 0, SLOPE * 40 + 1.0, Math.cos(-0.1), 0, Math.sin(-0.1), 0), 'sim_set_pose');
  must(sim.e.sim_set_velocity(14, 0, -2, 0, 0, 0), 'sim_set_velocity');
  let flags = 0;
  for (let ms = 0; ms < 2000; ms += RC_STEP_MS) {
    must(sim.input(ms / 1000, 0, 0, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    flags |= sim.e.sim_damage_flags();
  }
  must(sim.e.sim_set_damage(0), 'sim_set_damage');
  return { wet: (flags & DAMAGE_FLAGS.inWater) !== 0, v: speed(sim.readState().state) };
}
{
  const river = skyInto(true);
  const dry = skyInto(false);
  check('a Skyhunter flown into the channel goes into the water, and with no channel it does not',
    river.wet && !dry.wet,
    `channel: in the water ${river.wet}, ${river.v.toFixed(2)} m/s after 2 s; none: in the water ${dry.wet}, ${dry.v.toFixed(2)} m/s`);
}

/*
 * A Skyhunter over the channel in the open air, near its bank: two pilots
 * on swiss2 had one break up 3 m over the stream. The plant finds the
 * body under the craft's centre and samples it at every hull point, and a
 * point past every chunk's box (a wing tip out over the bank, its centre
 * inside the half width) read the channel's HIGHEST surface, the head of
 * the stream, as the water there. This channel falls 8 m to a level run,
 * as swiss2's does from the torrent to the valley floor; the craft flies
 * the level run 3 m up, 2 m off the line, its tip 2.9 m off it.
 */
function skyAlongBank() {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_airframe(SKY_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_damage(1), 'sim_set_damage');
  must(sim.e.sim_water_clear(), 'sim_water_clear');
  const pts = [];
  for (let x = -40; x <= 300; x += 2) {
    pts.push({ x, y: 0, z: x < 0 ? (-x / 40) * 8 : 0 });
  }
  declareRiver(pts);
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, -DEPTH, 1.4, 0), 'sim_set_ground');
  must(sim.e.sim_set_pose(60, 2.0, 3.0, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_set_velocity(18, 0, 0, 0, 0, 0), 'sim_set_velocity');
  let flags = 0;
  let low = Infinity;
  for (let ms = 0; ms < 1000; ms += RC_STEP_MS) {
    must(sim.input(ms / 1000, 0, 0, 0, 0.5), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    flags |= sim.e.sim_damage_flags();
    low = Math.min(low, sim.readState().state[3]);
  }
  must(sim.e.sim_set_damage(0), 'sim_set_damage');
  return { flags, low, v: speed(sim.readState().state) };
}
{
  const r = skyAlongBank();
  const wreck = DAMAGE_FLAGS.wingLost | DAMAGE_FLAGS.tailLost | DAMAGE_FLAGS.batteryEjected;
  check('a Skyhunter 3 m over a channel, off its line, is not in its water: a tip past the chunk boxes reads the surface there, not the head of the stream',
    (r.flags & DAMAGE_FLAGS.inWater) === 0 && (r.flags & wreck) === 0 && r.low > 1.5,
    `in the water ${(r.flags & DAMAGE_FLAGS.inWater) !== 0}, flags 0x${r.flags.toString(16)}, lowest ${r.low.toFixed(2)} m, ${r.v.toFixed(2)} m/s after 1 s`);
}

must(sim.e.sim_water_clear(), 'sim_water_clear');
const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed} of ${checks.length} passed`);
process.exit(failed ? 1 : 0);
