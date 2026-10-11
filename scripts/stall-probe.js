/*
 * stall-probe.js: what every fixed wing does past the stall, high above
 * the ground so nothing but the air is in it. It measures, it does not
 * judge: the numbers are the ones docs/CRASH-PLAN.md's round 4 asks of
 * the post stall model, printed for each airframe.
 *
 *   node scripts/stall-probe.js [--only key,...]
 *
 * Every flight is in Manual, from a launch at 1.15 times the airframe's
 * stall speed, 300 m up, wings level, the stick brought back from centre
 * to full over 2 s, the way a stall is entered in the handbook (FAA-H-
 * 8083-3C ch. 5), and then held:
 *
 *   A  power off, full back stick held 10 s: the pitch break (the nose's
 *      fall from its highest to its lowest after the stall, and how long
 *      it took), the wing drop (the largest bank), the yaw rate, and the
 *      nose's height above the flight path over the last 3 s.
 *   B  power off, back stick as A, and full right rudder from the moment
 *      the wing is within 2 deg of its stall, held to 8 s (on a flying
 *      wing, which has none, full right roll instead): the turns, the yaw rate and the angle of attack
 *      over the last 3 s, and whether that is a spin (turning faster than
 *      60 deg/s past the stall).
 *   C  B's entry for 5 s, then the handbook's recovery (FAA-H-8083-3C
 *      ch. 5): full opposite rudder with the stick half forward until the
 *      rotation stops (under 20 deg/s for half a second), then everything
 *      centred. The yaw rate it began from, the turns to the stop, and the
 *      time and height until the wing flies again. B says whether it was a
 *      spin (the wing held stalled) or a spiral (the wing flying).
 *   D  A's entry for 5 s, then the stick forward to neutral: the time
 *      and height until the wing flies again.
 *   E  A in Acro: the stabiliser does not stop a pilot who holds full back
 *      from stalling, and what the wing does then.
 *   F  A with the stick brought full back at once instead of over 2 s,
 *      the entry the crash suite's stall ins and the Slow Stick's S9 fly:
 *      the elevator overshoots the angle of attack past the stall, which
 *      the handbook's entry does not.
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

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { wingDebug, attitude, must } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const MS = 4;

/* sim is the airframe index; Vs the plant's power off stall speed from its
 * gates (tests/*-thresholds.json, tests/crash/scenarios.js); alphaStall
 * the table's CLmax over its lift slope, slats in where fitted; yaw the
 * stick that yaws it (the flying wings have no rudder: roll instead). */
const PLANES = {
  wing: { sim: 2, Vs: 7.25, alphaStall: 0.90 / 4.36, rudder: false },
  sky: { sim: 3, Vs: 9.2, alphaStall: 1.10 / 5.52, rudder: true },
  cub: { sim: 4, Vs: 8.1, alphaStall: 1.15 / 5.21, rudder: true },
  slowstick: { sim: 5, Vs: 4.4, alphaStall: 1.05 / 4.58, rudder: true },
  radian: { sim: 6, Vs: 6.5, alphaStall: 1.05 / 5.709, rudder: true },
  timber: { sim: 7, Vs: 7.2, alphaStall: (1.15 + 0.305) / 5.25, rudder: true },
  /* The Timber with its slats off: T3's stall speed. */
  timbernoslats: { sim: 7, Vs: 8.75, alphaStall: 1.15 / 5.25, rudder: true, slats: 0 },
  bramor: { sim: 8, Vs: 13.0, alphaStall: 0.722 / 4.77, rudder: false },
  timberf: { sim: 9, Vs: 7.1, alphaStall: (1.15 + 0.305) / 5.25, rudder: true },
  cubf: { sim: 10, Vs: 8.7, alphaStall: 1.15 / 5.21, rudder: true },
  bombshell: { sim: 11, Vs: 6.49, alphaStall: 1.0 / 4.991, rudder: true },
  kadet: { sim: 12, Vs: 7.15, alphaStall: 1.15 / 5.029, rudder: true },
  f16: { sim: 16, Vs: 12.33, alphaStall: 1.1 / 3.310, rudder: true },
  uglystik: { sim: 19, Vs: 9.48, alphaStall: 0.95 / 4.824, rudder: true },
  /* The cell's angle at which the top wing, the first, reaches its CL max. */
  tigermoth: { sim: 23, Vs: 9.47, alphaStall: 1.05 / (1.1087 * 4.6328), rudder: true },
};

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

let inertia = [0, 0, 0];
async function planeSim(p) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(p.sim), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  const ptr = sim.e.malloc(4 * 8);
  must(sim.e.sim_live_inertia(ptr), 'sim_live_inertia');
  const li = new Float64Array(sim.e.memory.buffer, ptr, 4);
  inertia = [li[1], li[2], li[3]];
  return sim;
}

/* One flight: hands(ms, o) gives [roll, pitch, yaw, throttle]; every 4 ms
 * sample goes to the list returned. */
const ramp = (ms) => Math.min(1, ms / 2000);

function flight(sim, p, seconds, hands, stab = 0) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(stab), 'sim_wing_set_stab');
  must(sim.e.sim_wing_set_slats(p.slats ?? 1), 'sim_wing_set_slats');
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(1.15 * p.Vs), 'sim_wing_launch');
  const out = [];
  let heading0 = null;
  let turns = 0;
  let lastYaw = 0;
  for (let ms = 0; ms < seconds * 1000; ms += MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const yaw = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
    if (heading0 === null) {
      heading0 = yaw;
      lastYaw = yaw;
    }
    let dy = yaw - lastYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    turns += dy / (2 * Math.PI);
    lastYaw = yaw;
    const v = Math.hypot(s[4], s[5], s[6]);
    const path = Math.asin(Math.max(-1, Math.min(1, s[6] / Math.max(v, 1e-6))));
    const alpha = wingDebug(sim)[0];
    const fullBank = Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
    /* World yaw rate: the body rates about the world vertical. */
    const up = [2 * (s[8] * s[10] - s[7] * s[9]), 2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9])];
    const yawRate = s[11] * up[0] + s[12] * up[1] + s[13] * up[2];
    /* What deepens a spin and keeps it turning (docs/FLIGHTMODEL.md, the
     * spin's measure): the inertial pitch, (Iz - Ix) p r, nose up in a
     * spin, against the elevator's and the stall's together, the
     * aerodynamic pitching moment, N m, nose up positive; and the stalled
     * strips' roll, the roll moment less the linear aerodynamics' and the
     * prop's (the throttle is closed in every flight here), which turns the
     * roll on (autorotation) when it has the roll rate's sign. */
    const d = wingDebug(sim);
    /* The body frame here is y left, so nose up is about -y: the inertial
     * term the plant integrates, (Iz - Ix) p r about y, nose up negated. */
    const inertialPitch = -(inertia[2] - inertia[0]) * s[11] * s[13];
    const strips = d[12] - d[5];
    const o = { t: ms / 1000, z: s[3], v, pitch, bank, fullBank, path, alpha, yawRate, turns, inertialPitch, aeroPitch: d[6], strips, p: s[11], q: -s[12] };
    out.push(o);
    const [r, pi, y, th] = hands(ms, o);
    must(sim.input(ms / 1000, r, pi, y, th), 'sim_input');
    must(sim.step(MS), 'sim_step');
  }
  return out;
}

const mean = (a, k) => a.reduce((x, o) => x + o[k], 0) / a.length;
const f1 = (x) => (x * DEG).toFixed(1);

function stallA(sim, p, stab = 0, back = ramp) {
  const tr = flight(sim, p, 10, (ms) => [0, back(ms), 0, 0], stab);
  /* The first sample's angle is read before the step and still holds the
   * previous flight's last one. */
  const iStall = tr.findIndex((o, i) => i > 0 && o.alpha > p.alphaStall);
  if (iStall < 0) {
    return 'never stalled';
  }
  /* The pitch break: from the highest pitch after the stall began (or
   * just before) to the lowest that follows it within 4 s. */
  let iTop = Math.max(0, iStall - 250);
  for (let i = iTop; i < Math.min(tr.length, iStall + 750); i += 1) {
    if (tr[i].pitch > tr[iTop].pitch) iTop = i;
  }
  let iLow = iTop;
  for (let i = iTop; i < Math.min(tr.length, iTop + 1000); i += 1) {
    if (tr[i].pitch < tr[iLow].pitch) iLow = i;
  }
  const maxBank = tr.reduce((m, o) => (Math.abs(o.fullBank) > Math.abs(m.fullBank) ? o : m), tr[0]);
  /* The wing drop at the break: the largest bank from the stall to the
   * nose's lowest point. */
  const dropBank = tr.slice(iStall, iLow + 1).reduce((m, o) => (Math.abs(o.fullBank) > Math.abs(m) ? o.fullBank : m), 0);
  const maxYaw = tr.reduce((m, o) => Math.max(m, Math.abs(o.yawRate)), 0);
  const last = tr.filter((o) => o.t >= 7);
  const nosePath = mean(last.map((o) => ({ d: o.pitch - o.path })), 'd');
  return `stall at ${tr[iStall].t.toFixed(2)} s; nose ${f1(tr[iTop].pitch)} to ${f1(tr[iLow].pitch)} deg `
    + `(drop ${f1(tr[iTop].pitch - tr[iLow].pitch)}) in ${(tr[iLow].t - tr[iTop].t).toFixed(2)} s, wing drop ${f1(dropBank)}; `
    + `max bank ${f1(maxBank.fullBank)} at ${maxBank.t.toFixed(2)} s; max yaw rate ${f1(maxYaw)} deg/s; `
    + `last 3 s: nose ${f1(nosePath)} over path ${f1(mean(last, 'path'))}, alpha ${f1(mean(last, 'alpha'))} `
    + `(${f1(Math.min(...last.map((o) => o.alpha)))} to ${f1(Math.max(...last.map((o) => o.alpha)))}), `
    + `bank ${f1(mean(last, 'fullBank'))}, ${mean(last, 'v').toFixed(1)} m/s`;
}

/* Back stick on the ramp, and the rudder (or roll) full from the moment
 * the wing is within 2 deg of its stall. */
function spinHands(p) {
  let armed = false;
  return (ms, o) => {
    armed = armed || o.alpha > p.alphaStall - 2 / DEG;
    const x = armed ? 1 : 0;
    return p.rudder ? [0, ramp(ms), x, 0] : [x, ramp(ms), 0, 0];
  };
}

function spinB(sim, p) {
  const tr = flight(sim, p, 8, spinHands(p));
  const last = tr.filter((o) => o.t >= 5);
  const yr = mean(last, 'yawRate');
  const a = mean(last, 'alpha');
  /* A spin is autorotation: the wing held stalled while it turns. The same
   * yaw rate with the wing flying is a spiral, a steep turn the rudder
   * holds, which the stick forward does not stop. Which it is reads off
   * the angle of attack over the last 3 s, its least as well as its mean,
   * since a spiral dips in and out of the stall. */
  const aMin = Math.min(...last.map((o) => o.alpha));
  const turning = Math.abs(yr) > 60 / DEG;
  const kind = !turning ? 'no spin' : aMin > p.alphaStall ? 'SPIN' : a > p.alphaStall ? 'SPIN, not steady' : 'SPIRAL, the wing flying';
  const strOn = last.filter((o) => Math.sign(o.strips) === Math.sign(o.p) && Math.abs(o.p) > 0.1).length / last.length;
  const inert = mean(last, 'inertialPitch');
  const aero = mean(last, 'aeroPitch');
  return `${tr[tr.length - 1].turns.toFixed(2)} turns in 8 s; last 3 s: yaw rate ${f1(yr)} deg/s, alpha ${f1(a)} (least ${f1(aMin)}), `
    + `inertial pitch ${inert.toFixed(3)} N m nose up against the aero's ${aero.toFixed(3)}, strips with the roll ${(strOn * 100).toFixed(0)} percent of the time, `
    + `bank ${f1(mean(last, 'fullBank'))}, pitch ${f1(mean(last, 'pitch'))}, ${mean(last, 'v').toFixed(1)} m/s, `
    + `sink ${(-(tr[tr.length - 1].z - tr[tr.length - 751].z) / 3).toFixed(1)} m/s: ${kind}`;
}

/*
 * The handbook's recovery from entry's 5 s: anti held until the rotation
 * has stopped, then everything centred. Stopped is the world yaw rate
 * under 20 deg/s for half a second running, not one sample under it: a
 * spinning aircraft's yaw rate swings, and one low sample is not a stop.
 * The spin is over as well when the wing has flown, 2 deg under its stall,
 * for half a second running: what turns on after that is a spiral dive,
 * the wing flying, which a pilot rolls out of on the ailerons and this
 * probe does not fly. What it reports is the yaw rate when the recovery
 * began (an aircraft that was not turning had nothing to recover from),
 * which of the two ended it, the turns from the recovery's start to that
 * end, and the time and height to it.
 */
function recover(sim, p, entry, anti) {
  let t0 = null;
  let z0 = null;
  let turns0 = 0;
  let yaw0 = 0;
  let calm = 0;
  let flown = 0;
  let stoppedAt = null;
  let how = '';
  flight(sim, p, 15, (ms, o) => {
    if (ms < 5000) {
      return entry(ms, o);
    }
    if (t0 === null) {
      t0 = o.t;
      z0 = o.z;
      turns0 = o.turns;
      yaw0 = o.yawRate;
    }
    calm = Math.abs(o.yawRate) < 20 / DEG ? calm + MS : 0;
    flown = o.alpha < p.alphaStall - 2 / DEG ? flown + MS : 0;
    if (stoppedAt === null && (calm >= 500 || flown >= 500)) {
      stoppedAt = o;
      how = calm >= 500 ? 'rotation stopped' : `wing flying, ${f1(o.yawRate)} deg/s of spiral left`;
    }
    return stoppedAt ? [0, 0, 0, 0] : anti;
  });
  const from = `from ${f1(yaw0)} deg/s`;
  if (!stoppedAt) {
    return `${from}: still spinning after 10 s`;
  }
  return `${from}: ${how} in ${Math.abs(stoppedAt.turns - turns0).toFixed(2)} turns, ${(stoppedAt.t - t0).toFixed(2)} s, ${(z0 - stoppedAt.z).toFixed(1)} m`;}

/*
 * G: the accelerated stall a snap roll is: full back stick at once from
 * 1.4 Vs at half throttle, held 1 s: the most angle of attack reached
 * over the stall's, the peak pitch rate, and the roll it makes with full
 * right rudder and aileron with it.
 */
function accel(sim, p) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_wing_set_slats(p.slats ?? 1), 'sim_wing_set_slats');
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(1.4 * p.Vs), 'sim_wing_launch');
  let aMax = -Infinity, qMax = 0, pMax = 0;
  for (let ms = 0; ms < 1000; ms += MS) {
    must(sim.input(ms / 1000, 1, 1, p.rudder ? 1 : 0, 0.5), 'sim_input');
    must(sim.step(MS), 'sim_step');
    const s = sim.readState().state;
    aMax = Math.max(aMax, wingDebug(sim)[0]);
    qMax = Math.max(qMax, -s[12]);
    pMax = Math.max(pMax, Math.abs(s[11]));
  }
  return `alpha to ${f1(aMax)} (${f1(aMax - p.alphaStall)} past the stall), pitch rate to ${f1(qMax)} deg/s, roll rate to ${f1(pMax)} deg/s`;
}

for (const [key, p] of Object.entries(PLANES)) {
  if (only && !only.has(key)) continue;
  const sim = await planeSim(p);
  console.log(`${key} (alpha stall ${f1(p.alphaStall)} deg, launched at ${(1.15 * p.Vs).toFixed(2)} m/s)`);
  console.log(`  A  full back:        ${stallA(sim, p)}`);
  console.log(`  B  back and rudder:  ${spinB(sim, p)}`);
  const anti = p.rudder ? [0, -0.5, -1, 0] : [-1, -0.5, 0, 0];
  console.log(`  C  spin recovery:    ${recover(sim, p, spinHands(p), anti)}`);
  console.log(`  D  stall recovery:   ${recover(sim, p, (ms) => [0, ramp(ms), 0, 0], [0, 0, 0, 0])}`);
  console.log(`  E  full back, Acro:  ${stallA(sim, p, 2)}`);
  console.log(`  F  full back at once: ${stallA(sim, p, 0, () => 1)}`);
  console.log(`  G  accelerated:      ${accel(sim, p)}`);
}
