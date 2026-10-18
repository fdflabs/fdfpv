/*
 * flat-fall-check.js: no aircraft falls flat to the ground. Each one,
 * dropped at no airspeed with the sticks centred and the throttle closed,
 * level (falling on its belly) or banked 90 deg (falling on its side),
 * turns its nose into the fall: a statically stable aircraft weathercocks
 * nose down and dives out, or spins; none holds a flat fall without
 * turning. The owner, 2026-10-12, on the Extra: "when i stall out and im
 * falling sideways, it just stays sideways flat trying to correct ...
 * aerodynamically eventually it should enter a spin or nosedive down
 * something but it cant just fall all the way flat".
 *
 * What the time is held to is the aircraft's own: the plant's static
 * moment about the axis the nose turns on, measured at 90, 80, ... 40 deg
 * between the nose and a fall straight down, its damping of that rate and
 * its drag along the fall, with the live inertia, give a one degree of
 * freedom swing from 90 deg to FLAT_FALL.noseDeg, the fall's speed
 * building from rest under that drag. The drop flown on the whole plant
 * must bring the angle between the nose and the flight path under
 * noseDeg within FLAT_FALL.multiple times that swing. The static moment
 * itself must turn the nose into the fall at 90 deg, and at 95, falling
 * a little tail first, where the plant once turned it the other way and
 * held it there: the fin and the
 * stabiliser are plates in the crossflow there (Hoerner, Fluid Dynamic
 * Drag, ch. 3, a flat plate normal to the flow, CN about 1.2), behind
 * the CG. And over the last five seconds of a ten second drop it never
 * sits flat: never a second with the nose more than flatDeg off the path
 * while turning slower than spinDps.
 *
 * Manual, and AS3X as it ships (Heading 0, a rate damper, measured with
 * the damper on). AS3X with full Heading is the hangar's choice; it
 * holds the attitude it was let go at and is judged on the last part
 * alone, never flat.
 *
 *   node scripts/flat-fall-check.js   (npm run flat-fall:check)
 *
 * Harness arithmetic in JS maths, which is allowed: nothing it prints is
 * hashed.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AIRFRAMES } from '../configs/airframes.js';
import { loadSim } from '../tests/lib/simmod.js';
import { must, wingDebug } from '../tests/lib/wingpilot.js';
import { seatStriker } from './lib/strikerpilot.js';
import { combatChoice } from '../configs/combat.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const FLAT_FALL = JSON.parse(await readFile(join(root, 'tests/flatfall-thresholds.json'), 'utf8')).gate;
const DEG = 180 / Math.PI;
const G = 9.80665;
const MS = 4;
const STAB_OFF = 0, STAB_AS3X = 3;
/* The fall the moments are measured in, m/s; they go as its square. */
const V_REF = 10;
/* The rate the damping is measured at, rad/s. */
const W_REF = 1;
/* How long a held state is held before its moment is read: AS3X's frame
 * and its servos' slew have answered by then. */
const HOLD_MS = 150;

const PLANES = ['extra3d1308', 'cap1702', 'slick2680', 'cub1400', 'timber1500', 'nighttimber1200', 'p51d1450'];
const STAB_ON = 1;
/*
 * The fixed wings PDCS seats, each in the modes its tunes ship: Manual and
 * Stabilised (wingStab 1: aircraft/bramor2300/aircraft.js, the wing-stab
 * tune; aircraft/striker2500/aircraft.js, striker-stab). Neither has an
 * AS3X tune, so neither has the full Heading drop. The Bramor is the
 * plant as the shell seats its stock build; the Striker is seated as the
 * shell seats it, on each propulsion with its standard warhead and the
 * bay's trim lead (scripts/lib/strikerpilot.js seatStriker): the bare
 * plant flies at the CG the lead moves.
 */
const strikerAf = AIRFRAMES.find((a) => a.id === 'striker2500');
const strikerTune = await readFile(join(root, `configs/${strikerAf.defaultTune}.diff`), 'utf8');
const KEPT = [
  {
    id: 'bramor2300',
    seat: async () => {
      const sim = await loadSim(wasmBytes);
      must(sim.init(configText), 'sim_init');
      must(sim.e.sim_set_airframe(AIRFRAMES.find((a) => a.id === 'bramor2300').simId), 'sim_set_airframe');
      must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
      return sim;
    },
  },
  ...['prop', 'jet'].map((propulsion) => ({
    id: `striker2500 ${propulsion}`,
    seat: async () => {
      const sim = await seatStriker(loadSim, wasmBytes, strikerTune, strikerAf, combatChoice(strikerAf, { propulsion }));
      must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
      return sim;
    },
  })),
];

function qmul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
function rot(q, v, inverse = false) {
  const [w, x0, y0, z0] = q;
  const [x, y, z] = inverse ? [-x0, -y0, -z0] : [x0, y0, z0];
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
function axisAngle(axis, a) {
  const s = Math.sin(a / 2);
  return [Math.cos(a / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

/* The two drops: level, the nose turning down about body y; on its side,
 * banked 90 deg, about body z. sign is the way about that axis that takes
 * the nose down. */
const BANK90 = axisAngle([1, 0, 0], Math.PI / 2);
function dropCase(name, base, axis) {
  const nz = (s) => rot(qmul(base, axisAngle(axis, s * 0.1)), [1, 0, 0])[2];
  return { name, base, axis, sign: nz(1) < nz(-1) ? 1 : -1, k: axis[1] ? 1 : 2 };
}
const CASES = [dropCase('level', [1, 0, 0, 0], [0, 1, 0]), dropCase('on its side', BANK90, [0, 0, 1])];

/* Held at theta deg between the nose and a fall straight down at V_REF,
 * turning at rate rad/s nose down: the moment nose down, N m, and the
 * drag along the fall, N. */
function held(sim, c, theta, rate) {
  const q = qmul(c.base, axisAngle(c.axis, c.sign * (90 - theta) / DEG));
  const w = [0, 0, 0];
  w[c.k] = c.sign * rate;
  must(sim.reset(), 'sim_reset');
  for (let ms = 0; ms < HOLD_MS; ms += 1) {
    must(sim.e.sim_set_pose(0, 0, 500, ...q), 'sim_set_pose');
    must(sim.e.sim_set_velocity(0, 0, -V_REF, ...w), 'sim_set_velocity');
    must(sim.input(ms / 1000, 0, 0, 0, 0), 'sim_input');
    must(sim.step(1), 'sim_step');
  }
  const d = wingDebug(sim);
  const vb = rot(q, [0, 0, -1], true);
  return { m: c.sign * d[12 + c.k], drag: -(d[9] * vb[0] + d[10] * vb[1] + d[11] * vb[2]) };
}

function inertia(sim) {
  const p = sim.e.malloc(4 * 8);
  must(sim.e.sim_live_inertia(p), 'sim_live_inertia');
  const out = Array.from(new Float64Array(sim.e.memory.buffer, p, 4));
  sim.e.free(p);
  return out;
}

/* The one degree of freedom swing from 90 deg to noseDeg, from rest:
 * I theta'' = -(C(theta) V^2 + D V theta'), V' = g - K(theta) V^2 / m,
 * C, K the moment and drag per V^2 read straight between the measured
 * angles, D the damping per V. Seconds, or Infinity if it never gets
 * there in 10 s. */
function swing(table, damp, iax, mass) {
  const at = (key, th) => {
    const i = Math.min(table.length - 2, Math.max(0, Math.floor((90 - th) / 10)));
    const a = table[i], b = table[i + 1];
    return a[key] + (b[key] - a[key]) * (a.theta - th) / (a.theta - b.theta);
  };
  let th = 90, om = 0, v = 0;
  const dt = 0.0005;
  for (let t = 0; t < 10; t += dt) {
    if (th <= FLAT_FALL.noseDeg) return t;
    const acc = (at('c', th) * v * v + damp * v * om) / iax;
    om += acc * dt;
    th -= om * DEG * dt;
    v += (G - at('k', th) * v * v / mass) * dt;
  }
  return Infinity;
}

/* The drop flown: from rest at the case's attitude, 10 s. When the nose
 * first comes within noseDeg of the flight path, and the longest stretch
 * of the last five seconds sat flat. */
function drop(sim, c, stab, heading) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(stab), 'sim_wing_set_stab');
  must(sim.setHeading([heading, heading, heading]), 'sim_wing_set_heading');
  must(sim.e.sim_set_pose(0, 0, 800, ...c.base), 'sim_set_pose');
  must(sim.e.sim_set_velocity(0, 0, 0, 0, 0, 0), 'sim_set_velocity');
  let into = null, flat = 0, worst = 0;
  for (let ms = 0; ms < 10000; ms += MS) {
    must(sim.input(ms / 1000, 0, 0, 0, 0), 'sim_input');
    must(sim.step(MS), 'sim_step');
    const s = sim.readState().state;
    const vel = [s[4], s[5], s[6]];
    const V = Math.hypot(...vel);
    if (V < 1) continue;
    const nose = rot([s[7], s[8], s[9], s[10]], [1, 0, 0]);
    const path = Math.acos(Math.max(-1, Math.min(1, (nose[0] * vel[0] + nose[1] * vel[1] + nose[2] * vel[2]) / V))) * DEG;
    if (into == null && path < FLAT_FALL.noseDeg) into = (ms + MS) / 1000;
    const turning = Math.hypot(s[11], s[12], s[13]) * DEG;
    flat = ms >= 5000 && path > FLAT_FALL.flatDeg && turning < FLAT_FALL.spinDps ? flat + MS : 0;
    worst = Math.max(worst, flat);
  }
  return { into, flat: worst / 1000 };
}

let bad = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}`);
  if (!ok) bad += 1;
};
async function judge(id, sim, modes, fullHeading) {
  const [mass, ...iner] = inertia(sim);
  for (const c of CASES) {
    for (const [mode, stab] of modes) {
      must(sim.e.sim_wing_set_stab(stab), 'sim_wing_set_stab');
      must(sim.setHeading([0, 0, 0]), 'sim_wing_set_heading');
      const table = [];
      for (let th = 90; th >= 40; th -= 10) {
        const h = held(sim, c, th, 0);
        table.push({ theta: th, c: h.m / (V_REF * V_REF), k: h.drag / (V_REF * V_REF) });
      }
      const damp = (held(sim, c, 60, W_REF).m - held(sim, c, 60, 0).m) / (V_REF * W_REF);
      const t1 = swing(table, damp, iner[c.k], mass);
      const limit = FLAT_FALL.multiple * t1;
      const m90 = table[0].c * V_REF * V_REF;
      const m95 = held(sim, c, 95, 0).m;
      const flown = drop(sim, c, stab, 0);
      const tag = `${id} ${c.name}, ${mode}`;
      say(m90 > 0 && m95 > 0, `${tag}: at 90 and 95 deg the air turns the nose into the fall (${m90.toFixed(3)}, ${m95.toFixed(3)} N m at ${V_REF} m/s)`);
      say(flown.into != null && flown.into <= limit,
        `${tag}: nose within ${FLAT_FALL.noseDeg} deg of the path at ${flown.into == null ? 'never' : flown.into.toFixed(2) + ' s'}, within ${limit.toFixed(2)} s (${FLAT_FALL.multiple} x its own swing, ${t1.toFixed(2)} s; damping ${damp.toFixed(4)} N m s/m)`);
      say(flown.flat === 0, `${tag}: never flat over the last 5 s (${flown.flat.toFixed(2)} s more than ${FLAT_FALL.flatDeg} deg off the path turning under ${FLAT_FALL.spinDps} deg/s)`);
    }
    if (!fullHeading) continue;
    const held1 = drop(sim, c, STAB_AS3X, 1);
    say(held1.flat === 0, `${id} ${c.name}, AS3X at full Heading: never flat over the last 5 s (${held1.flat.toFixed(2)} s; nose within ${FLAT_FALL.noseDeg} deg of the path at ${held1.into == null ? 'never' : held1.into.toFixed(2) + ' s'})`);
  }
}
for (const id of PLANES) {
  const af = AIRFRAMES.find((a) => a.id === id);
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  await judge(id, sim, [['Manual', STAB_OFF], ['AS3X', STAB_AS3X]], true);
}
for (const k of KEPT) {
  await judge(k.id, await k.seat(), [['Manual', STAB_OFF], ['Stabilised', STAB_ON]], false);
}
if (bad) {
  console.log(`${bad} FAILED`);
  process.exit(1);
}
console.log('every aircraft dropped flat or on its side turns its nose into the fall in its own time, and none falls flat');
