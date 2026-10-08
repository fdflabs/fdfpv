/*
 * flightmodel-probe.js: the manoeuvres a 3D and aerobatic pilot flies,
 * against the plant, on every powered fixed wing, at its stock power. It
 * measures, it does not judge: docs/FLIGHTMODEL.md reads the numbers
 * against published data, and each flight model PR prints them before and
 * after.
 *
 *   node scripts/flightmodel-probe.js [--only key,...] [--json out.json]
 *
 * Per aircraft:
 *
 *   TW     thrust over weight at standstill, full throttle: the most
 *          thrust in HANG's first 1.5 s (a ducted fan spools up) over the
 *          stock power's mass, configs/power.js.
 *   AUTH   the angular acceleration a full stick gives at zero airspeed,
 *          nose up, full throttle, per axis, rad/s^2, over the centred
 *          sticks' (which is the prop's torque alone). Zero means the
 *          surface has no air over it: no prop wash.
 *   HANG   nose up, no airspeed, full throttle, sticks centred, 5 s: the
 *          climb or sink, the torque roll's rate, and the nose's fall.
 *   HOVER  the same start, a pilot holding the nose vertical on elevator
 *          and rudder, the roll rate at zero on ailerons and the height on
 *          throttle, 8 s: how long the nose stays within 20 deg of
 *          vertical, and the throttle that held it.
 *   HARR   a harrier: level flight at 35 deg of pitch, the height on
 *          throttle, the wings on ailerons, 20 s; the last 5 s. Held is
 *          the pitch within 5 deg of it and the height within 0.5 m/s.
 *   KNIFE  a knife edge at 15 m/s or 2 Vs: rolled 90 deg on ailerons, the
 *          height on rudder, full throttle, 8 s; the last 4 s.
 *   SNAP   at 1.4 Vs, half throttle: full back, full right rudder and full
 *          right aileron for 1 s, then centred: the roll in that second
 *          and its peak rate, against full right aileron alone.
 *   STALL  the power off stall speed, the airspeed at the peak lift
 *          coefficient in a slow pull, clean and (where fitted) full flap.
 *   TORQ   the prop's roll moment at standstill, N m, and its share of
 *          full aileron's at 1.5 Vs.
 *
 * The spin entry and recovery are scripts/stall-probe.js's B and C, which
 * this does not repeat.
 *
 * Harness arithmetic in JS maths, which is allowed: nothing it prints is
 * hashed, and every flight is the plant's own deterministic step.
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TABLE } from '../configs/power.js';
import { loadSim } from '../tests/lib/simmod.js';
import { wingDebug, attitude, must } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const G = 9.80665;
const MS = 4;

/* sim id; Vs a launch reference only (the probe measures its own); ail and
 * rud whether the aircraft has ailerons (or elevons) and a rudder; flaps
 * where it has them. The three channel aircraft roll on their rudder. */
const PLANES = {
  wing: { sim: 2, Vs: 7.25, ail: true, rud: false },
  sky: { sim: 3, Vs: 9.2, ail: true, rud: true },
  cub: { sim: 4, Vs: 8.1, ail: true, rud: true },
  slowstick: { sim: 5, Vs: 4.4, ail: false, rud: true },
  radian: { sim: 6, Vs: 6.5, ail: false, rud: true },
  timber: { sim: 7, Vs: 7.2, ail: true, rud: true, flaps: true },
  bramor: { sim: 8, Vs: 13.0, ail: true, rud: false },
  bombshell: { sim: 11, Vs: 6.49, ail: false, rud: true },
  kadet: { sim: 12, Vs: 7.15, ail: false, rud: true },
  p51: { sim: 15, Vs: 10.5, ail: true, rud: true, flaps: true },
  f16: { sim: 16, Vs: 12.33, ail: true, rud: true },
  zagi: { sim: 17, Vs: 8.0, ail: true, rud: false },
  uglystik: { sim: 19, Vs: 9.48, ail: true, rud: true },
  tigermoth: { sim: 23, Vs: 9.47, ail: true, rud: true },
  /* The war drone has no hangar power: its mass is plant.c's table's. */
  striker: { sim: 27, Vs: 20.0, ail: true, rud: true, mass: 13.8249 },
  extra: { sim: 29, Vs: 8.31, ail: true, rud: true },
};

const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
const jsonOut = arg('--json');

const clamp = (x) => Math.max(-1, Math.min(1, x));
const NOSE_UP = [Math.SQRT1_2, 0, -Math.SQRT1_2, 0];

async function planeSim(p) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(p.sim), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  return sim;
}

/* The input clock is the flight's own: sim_input queues a stick at its
 * time, and a reset starts the plant's clock again. */
let clock = 0;
function start(sim, pose, speed = 0, flaps = 0) {
  must(sim.reset(), 'sim_reset');
  clock = 0;
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 300, ...pose), 'sim_set_pose');
  if (speed > 0) {
    must(sim.e.sim_wing_launch(speed), 'sim_wing_launch');
  }
  if (flaps) {
    must(sim.e.sim_wing_set_flaps(flaps), 'sim_wing_set_flaps');
    must(sim.e.sim_wing_flaps_settle(), 'sim_wing_flaps_settle');
  }
}

/* World up in the body frame, the body rates, the speeds. */
function read(sim) {
  const s = sim.readState().state;
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  const upB = [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
  const fullBank = Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y));
  return {
    s, upB, fullBank, ...attitude(s), p: s[11], q: s[12], r: s[13],
    vz: s[6], v: Math.hypot(s[4], s[5], s[6]), z: s[3],
  };
}

function drive(sim, sticks) {
  must(sim.input(clock / 1000, ...sticks), 'sim_input');
  must(sim.step(MS), 'sim_step');
  clock += MS;
}

/* TW and AUTH: one 4 ms step from rest, nose up, full throttle. */
function authority(sim) {
  const one = (sticks) => {
    start(sim, NOSE_UP);
    drive(sim, sticks);
    const o = read(sim);
    return { om: [o.p, o.q, o.r] };
  };
  const base = one([0, 0, 0, 1]);
  const d = (sticks, k) => (one(sticks).om[k] - base.om[k]) / (MS / 1000);
  return {
    torqueAcc: base.om[0] / (MS / 1000),
    roll: d([1, 0, 0, 1], 0),
    pitch: -d([0, 1, 0, 1], 1),
    yaw: -d([0, 0, 1, 1], 2),
  };
}

function hang(sim, p) {
  start(sim, NOSE_UP);
  let thrust = 0;
  for (let ms = 0; ms < 5000; ms += MS) {
    drive(sim, [0, 0, 0, 1]);
    if (ms < 1500) {
      thrust = Math.max(thrust, wingDebug(sim)[8]);
    }
  }
  const o = read(sim);
  return { tw: thrust / (massOf(p) * G), vz: o.vz, rollRate: o.p * DEG, noseDeg: o.pitch * DEG };
}

function massOf(p) {
  if (p.mass) {
    return p.mass;
  }
  const t = Object.values(TABLE).find((x) => x.simId === p.sim);
  if (!t) {
    throw new Error(`no power table for sim id ${p.sim}`);
  }
  return t.massKg;
}

function hover(sim, p) {
  start(sim, NOSE_UP);
  let thr = 0.6, held = 0, lost = false, sumThr = 0, n = 0;
  for (let ms = 0; ms < 8000; ms += MS) {
    const o = read(sim);
    if (!lost && o.upB[0] > Math.cos(20 / DEG)) {
      held = ms + MS;
    } else {
      lost = true;
    }
    thr = Math.max(0, Math.min(1, thr - 0.002 * o.vz));
    const pitch = clamp(3 * o.upB[2] + 0.5 * o.q);
    const yaw = p.rud ? clamp(-3 * o.upB[1] + 0.5 * o.r) : 0;
    const roll = p.ail ? clamp(-0.3 * o.p) : 0;
    drive(sim, [roll, pitch, yaw, thr]);
    sumThr += thr;
    n += 1;
  }
  const o = read(sim);
  return { heldS: held / 1000, meanThr: sumThr / n, vz: o.vz, noseDeg: o.pitch * DEG };
}

/* Bank on ailerons, or on the rudder where the roll stick drives it. */
function wings(o, target) {
  return clamp(-1.2 * (o.fullBank - target) - 0.12 * o.p);
}

function harrier(sim, p) {
  const v0 = 1.3 * p.Vs;
  start(sim, [1, 0, 0, 0], v0);
  let iP = 0, iT = 0.5;
  const last = [];
  for (let ms = 0; ms < 20000; ms += MS) {
    const o = read(sim);
    const target = Math.min(35, 35 * ms / 4000) / DEG;
    iP = Math.max(-0.5, Math.min(0.5, iP + 0.002 * (target - o.pitch)));
    const pitch = clamp(3 * (target - o.pitch) + 0.4 * o.q + iP);
    /* The height on throttle, slowly: a fast loop trades the speed the
     * high angle of attack needs for height, and cycles the stall. */
    iT = Math.max(0, Math.min(1, iT - 0.0003 * o.vz));
    const thr = Math.max(0, Math.min(1, iT - 0.15 * o.vz));
    drive(sim, [wings(o, 0), pitch, 0, thr]);
    if (ms >= 15000) {
      last.push({ ...o, thr, alpha: wingDebug(sim)[0], pitchStick: pitch });
    }
  }
  const mean = (k) => last.reduce((a, x) => a + x[k], 0) / last.length;
  const bankMax = Math.max(...last.map((x) => Math.abs(x.fullBank)));
  return {
    pitch: mean('pitch') * DEG, alpha: mean('alpha') * DEG, v: mean('v'), vz: mean('vz'),
    thr: mean('thr'), bankMax: bankMax * DEG, stick: mean('pitchStick'),
    held: Math.abs(mean('pitch') - 35 / DEG) < 5 / DEG && Math.abs(mean('vz')) < 0.5,
  };
}

function knife(sim, p) {
  if (!p.ail || !p.rud) {
    return null;
  }
  const v0 = Math.max(15, 2 * p.Vs);
  start(sim, [1, 0, 0, 0], v0);
  let iY = 0;
  const last = [];
  for (let ms = 0; ms < 8000; ms += MS) {
    const o = read(sim);
    const bankT = Math.min(90, 90 * ms / 1000) / DEG;
    /* Rolled right, body y is up: nose left raises the nose. */
    const noseT = Math.max(-0.3, Math.min(0.5, -0.1 * o.vz));
    iY = Math.max(-0.5, Math.min(0.5, iY + 0.002 * (noseT - o.pitch)));
    const yaw = ms < 1000 ? 0 : clamp(-3 * (noseT - o.pitch) - iY - 0.3 * o.r);
    drive(sim, [wings(o, bankT), 0, yaw, 1]);
    if (ms >= 4000) {
      last.push({ ...o, yaw, beta: wingDebug(sim)[1] });
    }
  }
  const mean = (k) => last.reduce((a, x) => a + x[k], 0) / last.length;
  return { vz: mean('vz'), v: mean('v'), bank: mean('fullBank') * DEG, rudder: mean('yaw'), beta: mean('beta') * DEG };
}

function snap(sim, p, sticks) {
  start(sim, [1, 0, 0, 0], 1.4 * p.Vs);
  let roll = 0, peak = 0, last = read(sim).fullBank;
  for (let ms = 0; ms < 1000; ms += MS) {
    drive(sim, [...sticks, 0.5]);
    const o = read(sim);
    let d = o.fullBank - last;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    roll += d;
    last = o.fullBank;
    peak = Math.max(peak, Math.abs(o.p));
  }
  let stopMs = null;
  for (let ms = 0; ms < 2000; ms += MS) {
    drive(sim, [0, 0, 0, 0.5]);
    const o = read(sim);
    if (stopMs === null && Math.abs(o.p) < 30 / DEG) {
      stopMs = ms + MS;
    }
  }
  return { rollDeg: roll * DEG, peakDegS: peak * DEG, stopS: stopMs === null ? null : stopMs / 1000 };
}

function stallSpeed(sim, p, flaps = 0) {
  start(sim, [1, 0, 0, 0], 1.6 * p.Vs, flaps);
  let best = { cl: -Infinity, v: null };
  for (let ms = 0; ms < 15000; ms += MS) {
    const o = read(sim);
    const target = Math.min(0.6, 0.04 * ms / 1000);
    drive(sim, [p.ail ? wings(o, 0) : 0, clamp(2.5 * (target - o.pitch) + 0.25 * o.q), 0, 0]);
    const d = wingDebug(sim);
    if (ms > 1000 && d[3] > best.cl) {
      best = { cl: d[3], v: o.v };
    }
  }
  return best;
}

function torque(sim, p) {
  start(sim, [1, 0, 0, 0]);
  drive(sim, [0, 0, 0, 1]);
  const q = wingDebug(sim)[12];
  if (!p.ail) {
    return { q, share: null };
  }
  start(sim, [1, 0, 0, 0], 1.5 * p.Vs);
  drive(sim, [1, 0, 0, 0]);
  const l = wingDebug(sim)[5];
  return { q, share: Math.abs(q / l) };
}

const f = (x, d = 1) => (x === null || x === undefined ? 'n/a' : x.toFixed(d));
const out = {};
for (const [key, p] of Object.entries(PLANES)) {
  if (only && !only.has(key)) continue;
  const sim = await planeSim(p);
  const r = {
    auth: authority(sim),
    hang: hang(sim, p),
    hover: hover(sim, p),
    harrier: harrier(sim, p),
    knife: knife(sim, p),
    snap: p.ail && p.rud ? snap(sim, p, [1, 1, 1]) : null,
    ailRoll: p.ail ? snap(sim, p, [1, 0, 0]) : null,
    stall: stallSpeed(sim, p),
    stallFlaps: p.flaps ? stallSpeed(sim, p, 2) : null,
    torque: torque(sim, p),
  };
  out[key] = r;
  const a = r.auth;
  console.log(key);
  console.log(`  TW     ${f(r.hang.tw, 2)}`);
  console.log(`  AUTH   roll ${f(a.roll)} pitch ${f(a.pitch)} yaw ${f(a.yaw)} rad/s2 (torque alone ${f(a.torqueAcc)})`);
  console.log(`  HANG   vz ${f(r.hang.vz)} m/s, roll rate ${f(r.hang.rollRate)} deg/s, nose ${f(r.hang.noseDeg)} deg after 5 s`);
  console.log(`  HOVER  held ${f(r.hover.heldS, 2)} s of 8, throttle ${f(r.hover.meanThr, 2)}, vz ${f(r.hover.vz)} m/s, nose ${f(r.hover.noseDeg)} deg at the end`);
  const h = r.harrier;
  console.log(`  HARR   pitch ${f(h.pitch)} alpha ${f(h.alpha)} deg, ${f(h.v)} m/s, vz ${f(h.vz, 2)}, throttle ${f(h.thr, 2)}, elevator stick ${f(h.stick, 2)}, wing rock ${f(h.bankMax)} deg: ${h.held ? 'HELD' : 'not held'}`);
  const k = r.knife;
  console.log(`  KNIFE  ${k ? `bank ${f(k.bank)} deg, ${f(k.v)} m/s, vz ${f(k.vz, 2)}, rudder stick ${f(k.rudder, 2)}, sideslip ${f(k.beta)} deg` : 'n/a (no aileron and rudder pair)'}`);
  const sn = r.snap, ar = r.ailRoll;
  console.log(`  SNAP   ${sn ? `${f(sn.rollDeg)} deg in 1 s, peak ${f(sn.peakDegS)} deg/s, stops ${f(sn.stopS, 2)} s after release` : 'n/a'}; aileron alone ${ar ? `${f(ar.rollDeg)} deg, peak ${f(ar.peakDegS)} deg/s` : 'n/a'}`);
  console.log(`  STALL  clean ${f(r.stall.v, 2)} m/s (CL ${f(r.stall.cl, 2)})${r.stallFlaps ? `, full flap ${f(r.stallFlaps.v, 2)} m/s (CL ${f(r.stallFlaps.cl, 2)})` : ''}`);
  console.log(`  TORQ   ${f(r.torque.q, 3)} N m at standstill${r.torque.share !== null ? `, ${f(100 * r.torque.share)} percent of full aileron at 1.5 Vs` : ''}`);
}
if (jsonOut) {
  await writeFile(jsonOut, `${JSON.stringify(out, null, 1)}\n`);
}
