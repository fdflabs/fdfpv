/*
 * acro-derive.js: Acro's attitude hold (plant mode 2, plant_wing.c
 * acro_sticks) held to the margin rule as3x-derive holds AS3X to (702e8a0ee,
 * scripts/lib/as3xloop.js): the loop broken at the stick the hold writes,
 * measured on the plant in Manual at the hold's own frame, the plant's
 * 1 ms step, over every condition as3xloop flies (slow flight, cruise,
 * level top speed, the full throttle dive, the harrier where a gate flies
 * one, the hover where its hold hangs), on each axis the hold has.
 *
 * The hold's form is ArduPlane's (libraries/APM_Control, AP_RollController,
 * AP_PitchController, AP_YawController, https://github.com/ArduPilot/ardupilot):
 * an attitude error asks a rate of error / TCONST, and a rate PI loop flies
 * it, u = P (rate asked - rate) + I sum(rate asked - rate). With the sticks
 * centred the sum of minus the rate is the error itself, so in acro_sticks'
 * terms, stick per rad and rad/s:
 *   kd = P,  kp = P / TCONST + I,  ki = I / TCONST,
 * and C(z) = P [1 + (1 / TCONST + I/P) S(z) + (I/P) / TCONST S(z)^2],
 * S(z) = T / (1 - z^-1) the error's sum over the step T. The ratios are
 * ArduPlane's defaults: RLL2SRV_TCONST and PTCH2SRV_TCONST 0.5 s (the
 * yaw takes the same, ArduPlane having no yaw angle loop), RLL_RATE_P
 * 0.08 and _I 0.15, PTCH_RATE_P 0.04 and _I 0.15, YAW_RATE_P 0.04 and _I
 * 0.15, and the integrator's limit IMAX 0.666 of the travel. What is left
 * is P per axis, the loop's overall gain, and it is the margin rule's:
 * the highest that keeps MIL-F-9490D's 6 dB and 45 deg on every
 * condition (as3xloop.js GM_MIN_DB, PM_MIN_DEG), Spektrum's "the highest
 * setting that will not cause oscillation at any speed" with the
 * margin under it.
 *
 * The frame is the hold's own, the plant's 1 ms step, where the hold
 * runs; no receiver writes a servo that often, and at the 11 and 22 ms
 * frames the same rule gives far lower gains (docs/CONTROLLERS.md). The
 * margins then put the crossovers well above the servos' slew, the
 * limit of a derivation at the plant's step.
 *
 * DERIVED are the 3D aircraft whose Acro is to hold a hands off hover
 * (the owner, 2026-10-16), but the Timber: the rule gives its pitch a
 * factor of 0.066, which made its hover grid worse, so it keeps its
 * FITTED gains (docs/CONTROLLERS.md). Every other Acro table keeps its
 * gains and is measured and printed, not judged.
 *
 *   node scripts/acro-derive.js           measure and print the gains
 *   node scripts/acro-derive.js --check   fail when a DERIVED table's
 *       gains are not the derivation's, when any of its loops is under
 *       the rule, when a flown check fails, or when the emulated hold
 *       is not the plant's mode 2
 *   --plane NAME measures one table and prints it as JSON.
 *
 * Harness arithmetic in JS maths, which is allowed here because nothing
 * it prints is hashed.
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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TABLE } from '../configs/power.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { tunesFor } from '../configs/registry.js';
import {
  AS3X, GM_MIN_DB, PM_MIN_DEG, rowOf, numOf, gridFor, plantResponse, loopMargins,
  levelCondition, diveCondition, harrierCondition, hoverCondition, hoverHolds, topSpeed, terminalDive,
  planeSim, revive, fanOut, rings,
} from './lib/as3xloop.js';
import { wingSeat, SEAT_FULL } from './lib/propcurve.js';
import { must } from '../tests/lib/wingpilot.js';

const self = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(self));
const src = await readFile(join(ROOT, 'src/native/plant_wing.c'), 'utf8');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };

/* The hold's frame: the plant's step, plant_wing.c WING_DT, the 1 kHz
 * the physics runs at (docs/FLIGHTMODEL.md). */
const T = 0.001;
/* ArduPlane's defaults (https://github.com/ArduPilot/ardupilot,
 * libraries/APM_Control AP_RollController.cpp RLL2SRV_TCONST 0.5 and its
 * rate_pid p 0.08, i 0.15, imax 0.666; AP_PitchController.cpp p 0.04,
 * i 0.15; AP_YawController.h rate_pid 0.04, 0.15). */
const TCONST = 0.5;
/* https://github.com/ArduPilot/ardupilot (APM_Control), as above. */
const AP_RATE = [{ p: 0.08, i: 0.15 }, { p: 0.04, i: 0.15 }, { p: 0.04, i: 0.15 }];
/* https://github.com/ArduPilot/ardupilot (APM_Control), as above. */
export const AP_IMAX = 0.666;
const AX = ['roll', 'pitch', 'yaw'];
const FIELDS = [['acro_roll_kp', 'acro_roll_ki', 'acro_roll_kd'], ['acro_pitch_kp', 'acro_pitch_ki', 'acro_pitch_kd'], ['acro_yaw_kp', 'acro_yaw_ki', 'acro_yaw_kd']];
export const DERIVED = ['FW_EXTRA3D1308', 'FW_CAP1702', 'FW_SLICK2680', 'FW_NIGHTTIMBER1200'];

/* The stick the hold writes moves the body rate the other way on pitch
 * (nose up is -omega[1]) and on yaw (the yaw stick is nose right, a
 * negative omega[2]): the loop is S C P with S the sign that makes it
 * negative feedback (acro_sticks: roll -C p, pitch and yaw +C q, +C r;
 * the body axes of docs/FLIGHTMODEL.md). */
const SIGN = [1, -1, -1];

const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const scale = (a, s) => cx(a.re * s, a.im * s);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };

/* acro_sticks at (kp, ki, kd) with the sticks centred, at z = e^(j theta). */
function holdC(theta, kp, ki, kd) {
  const S = div(cx(T), cx(1 - Math.cos(theta), Math.sin(theta)));
  return add(add(cx(kd), scale(S, kp)), scale(mul(S, S), ki));
}

/* ArduPlane's form at rate P on an axis. */
export function gainsAt(axis, P) {
  const r = AP_RATE[axis].i / AP_RATE[axis].p;
  return { kp: P * (1 / TCONST + r), ki: P * r / TCONST, kd: P };
}

/* Three significant figures, as the tables carry them; the loop's gain
 * rounded down, so the rounding never takes it past the rule. */
const sig3 = (x) => Number(x.toPrecision(3));
const floor3 = (x) => { const e = 10 ** (Math.floor(Math.log10(x)) - 2); return sig3(Math.floor(x / e + 1e-9) * e); };

const ACRO = AIRFRAMES.filter((a) => a.fixedWing && tunesFor(a.id).some((t) => t.wingStab === 2))
  .map((a) => ({ name: `FW_${a.id.toUpperCase()}`, sim: a.simId }))
  .filter((p) => src.includes(`const FixedWingParams ${p.name} = {`));

/* Each condition's nose above the horizon, deg (as3xloop.js flies the
 * level ones level, the dive 80 deg down, the hover straight up), and the
 * weight acro_sticks gives the yaw hold there, 1 - level, level being the
 * nose's horizontal share squared: sin^2 of the nose's angle. */
/* As scripts/lib/as3xloop.js flies them. */
const NOSE = { slow: 0, cruise: 0, top: 0, dive: -80, hover: 90 };
const yawWeight = (c) => Math.sin(c.nose * Math.PI / 180) ** 2;
/* The weight on each axis' loop at a condition. */
const weightOf = (c, axis) => (axis === 2 ? yawWeight(c) : 1);

/* The table's hold: its gains on the three axes, zero where it has none. */
function tableGains(body) {
  return FIELDS.map(([p, i, d]) => ({ kp: numOf(body, p) ?? 0, ki: numOf(body, i) ?? 0, kd: numOf(body, d) ?? 0 }));
}

/* The conditions as3xloop's measurePlane flies, on the stick. */
async function measure(name) {
  const plane = ACRO.find((p) => p.name === name);
  const body = rowOf(src, name);
  const sim = await planeSim(plane.sim, SEAT_FULL);
  const t = Object.values(TABLE).find((x) => x.simId === plane.sim);
  const trim = numOf(body, 'stab_trim_throttle');
  const vs = Math.sqrt(2 * t.massKg * 9.80665 / (1.225 * numOf(body, 'area') * numOf(body, 'cl_max')));
  const conds = [
    levelCondition('slow', 1.3 * vs, trim),
    levelCondition('cruise', t.cruiseMs, trim),
    levelCondition('top', topSpeed(sim), 1),
    diveCondition(terminalDive(sim)),
  ];
  const th = AS3X[name]?.th;
  let harrierNose = null;
  if (th) {
    const b = JSON.parse(readFileSync(join(ROOT, `tests/${th[0]}-thresholds.json`), 'utf8'))[th[1]];
    conds.push(harrierCondition((b.vMin + b.vMax) / 2, (b.dutyMin + b.dutyMax) / 2, b.alphaDeg));
    harrierNose = b.alphaDeg;
  }
  const electric = /\.current_full = [1-9]/.test(body);
  const hover = hoverCondition(electric ? wingSeat(name).hoverStick(SEAT_FULL) ?? 1 : 0.6);
  if (hoverHolds(sim, hover)) conds.push(hover);
  const rudderMix = /\.mix = FW_MIX_RUDDER/.test(body);
  const has = [!rudderMix, true, (numOf(body, 'throw_r') ?? 0) > 0];
  const grid = gridFor(T);
  return {
    name,
    conds: conds.map((c) => ({ id: c.id, V: c.V, nose: NOSE[c.id] ?? harrierNose, resp: [0, 1, 2].map((ax) => (has[ax] ? plantResponse(sim, c, ax, grid, T, 0.05, 'stick') : null)) })),
  };
}

const marginsAt = (c, axis, g) => loopMargins(c.resp[axis], (theta) => scale(holdC(theta, g.kp, g.ki, g.kd), SIGN[axis] * weightOf(c, axis)));
const under = (m) => m.gmDb < GM_MIN_DB || (m.pmDeg !== null && m.pmDeg < PM_MIN_DEG);
const f = (x, d = 1) => (x === null || !Number.isFinite(x) ? '  none' : x.toFixed(d).padStart(6));

/* Every P on the 2 percent grid from 1e-4 to 64 that holds the rule on
 * every condition, highest first, rounded down to three figures. Capped
 * where the proportional term would leave the stick inside the hold's own
 * leash, kp acro_err_max over 1 (a lane decision, w50-hover, not a
 * source): the margins are a linear loop's, and past the cap the hold
 * slams the surface for any error it allows, a loop they do not
 * describe. */
function candidates(m, axis, errMax) {
  const conds = m.conds.filter((c) => c.resp[axis] && weightOf(c, axis) > 0.01);
  if (!conds.length) return [];
  const out = [];
  for (let g = 1e-4; g <= 64; g *= 1.02) {
    const P = floor3(g);
    if (gainsAt(axis, P).kp * errMax > 1) break;
    if (conds.every((c) => !under(marginsAt(c, axis, gainsAt(axis, P))))) out.push(P);
  }
  return [...new Set(out)].reverse();
}
const rounded = (axis, P) => { const k = gainsAt(axis, P); return { kp: sig3(k.kp), ki: sig3(k.ki), kd: sig3(k.kd) }; };

/*
 * THE HOLD AT ANY GAIN. acro_sticks with every stick but the one a
 * release holds centred, run here a step at a time on the plant in
 * Manual, its sticks flown as the hold's, which the plant's expo, throws
 * and servos then carry as they carry mode 2's (the plant's Acro rewrites
 * the sticks and nothing else). At the table's gains it is mode 2;
 * emulatorMatches checks it on the plant.
 */
/* Radians per degree, for the tables' expressions (scripts/lib/as3xloop.js
 * receiverOf reads them the same way). */
const DEG = Math.PI / 180;
const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const rot = (q, v) => qmul(qmul(q, [0, ...v]), [q[0], -q[1], -q[2], -q[3]]).slice(1);
const degOf = (body, f) => { const m = new RegExp(`\\.${f} = ([0-9.]+) \\* WING_PI / 180\\.0`).exec(body); return m ? Number(m[1]) * DEG : numOf(body, f); };

function holdOf(body) {
  return {
    rate: [degOf(body, 'acro_roll_rate'), degOf(body, 'acro_pitch_rate')],
    ff: [numOf(body, 'acro_roll_ff'), numOf(body, 'acro_pitch_ff')],
    expo: numOf(body, 'acro_expo'), db: numOf(body, 'stab_deadband'), errMax: degOf(body, 'acro_err_max'),
    iMax: numOf(body, 'acro_i_max'),
  };
}

function acroStepper(h, g, pass = -1) {
  let q = null;
  const I = [0, 0, 0];
  const band = (x) => { x = Math.max(-1, Math.min(1, x)); return x > h.db ? (x - h.db) / (1 - h.db) : x < -h.db ? (x + h.db) / (1 - h.db) : 0; };
  const shape = (x) => { const d = band(x); return d * d * d * h.expo + d * (1 - h.expo); };
  return (s, roll, pitch, yaw) => {
    const quat = [s[7], s[8], s[9], s[10]], om = [s[11], s[12], s[13]];
    if (!q) { q = quat.slice(); I.fill(0); }
    const fly = [band(roll) !== 0, band(pitch) !== 0];
    const holdYaw = g[2].kp > 0 && band(yaw) === 0;
    const rr = h.rate[0] * shape(roll), ru = h.rate[1] * shape(pitch);
    const wv = rot(quat, om), fv = rot(quat, [1, 0, 0]);
    const level = fv[0] * fv[0] + fv[1] * fv[1];
    const hh = 0.0005;
    let t = qmul(qmul([1, 0, 0, level * wv[2] * hh], q), [1, rr * hh, -ru * hh, 0]);
    const tn = Math.hypot(...t);
    t = t.map((x) => x / tn);
    let qe = qmul([quat[0], -quat[1], -quat[2], -quat[3]], t);
    if (qe[0] < 0) qe = qe.map((x) => -x);
    const tw = Math.hypot(qe[0], qe[1]);
    const tc = tw > 1e-12 ? qe[0] / tw : 1, ts = tw > 1e-12 ? qe[1] / tw : 0;
    let ex = 2 * Math.atan2(ts, tc);
    const sy = qe[2] * tc - qe[3] * ts, sz = qe[2] * ts + qe[3] * tc;
    const sn = Math.hypot(sy, sz);
    const k = sn > 1e-12 ? 2 * Math.atan2(sn, tw) / sn : 2;
    let ey = sy * k, ez = holdYaw ? sz * k : 0;
    const en = Math.hypot(ex, ey, ez);
    const leash = (fly[0] || fly[1]) && en > h.errMax;
    if (leash) { ex *= h.errMax / en; ey *= h.errMax / en; ez *= h.errMax / en; }
    if (holdYaw && !leash) {
      q = t;
    } else {
      const ea = Math.hypot(ey, ez);
      const sh = ea > 1e-12 ? Math.sin(0.5 * ea) / ea : 0.5;
      q = qmul(quat, qmul([Math.cos(0.5 * ea), 0, ey * sh, ez * sh], [Math.cos(0.5 * ex), Math.sin(0.5 * ex), 0, 0]));
      const n = Math.hypot(...q);
      q = q.map((x) => x / n);
    }
    const ec = Math.hypot(ex, ey, ez);
    if (ec > h.errMax) { ex *= h.errMax / ec; ey *= h.errMax / ec; ez *= h.errMax / ec; }
    const clip = (x) => Math.max(-h.iMax, Math.min(h.iMax, x));
    const c1 = (x) => Math.max(-1, Math.min(1, x));
    I[0] = clip(I[0] + g[0].ki * ex * T);
    I[1] = clip(I[1] + g[1].ki * -ey * T);
    const out = [
      c1(g[0].kp * ex + I[0] + g[0].kd * (rr - om[0]) + h.ff[0] * rr),
      c1(g[1].kp * -ey + I[1] + g[1].kd * (ru + om[1]) + h.ff[1] * ru),
      yaw,
    ];
    if (holdYaw) {
      const wy = 1 - level;
      I[2] = clip(I[2] + wy * g[2].ki * -ez * T);
      out[2] = c1(wy * (g[2].kp * -ez + g[2].kd * om[2]) + I[2]);
    }
    if (pass >= 0) out[pass] = [roll, pitch, yaw][pass];
    return out;
  };
}

/* One flight in Acro from a condition's start (or a level launch), the
 * plant's own (g null) or the hold emulated at gains g: pilot(i) the
 * pilot's [roll, pitch, yaw], kick (axis, rad/s) put on the body at
 * 2 s, after the hold has taken over from the start's. The rate on
 * `axis` every step from `from` ms. */
/* After the start's hold has handed over: the slowest transient seen,
 * the Timber's yaw at cruise, is gone in 2 s (npm run acro:derive). */
const KICK_MS = 2000;
function acroFlight(sim, h, g, cond, axis, { kick = 0, pilot = () => [0, 0, 0], ms = KICK_MS + 1500, from = KICK_MS, pass = -1 } = {}) {
  cond.start(sim);
  must(sim.e.sim_wing_set_stab(g ? 0 : 2), 'sim_wing_set_stab');
  const step = g ? acroStepper(h, g, pass) : null;
  const t0 = cond.t0 ?? 0;
  const trace = [];
  for (let i = 0; i < ms; i += 1) {
    let s = sim.readState().state;
    if (i === KICK_MS && kick) {
      const w = [s[11], s[12], s[13]];
      w[axis] += kick;
      must(sim.e.sim_set_velocity(s[4], s[5], s[6], ...w), 'sim_set_velocity');
      s = sim.readState().state;
    }
    const p = pilot(i);
    const st = step ? step(s, ...p) : p;
    must(sim.input(t0 + i / 1000, ...st, cond.hold(s)[3]), 'sim_input');
    must(sim.step(1), 'sim_step');
    if (cond.pin) cond.pin(sim);
    if (i >= from) trace.push(sim.readState().state[11 + axis]);
  }
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  return trace;
}

/* A level launch at V on throttle thr, flown free, the sticks the
 * pilot's (scripts/lib/as3xloop.js pilotFlight's launch). */
const launched = (V, thr) => ({
  start(sim) {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(V), 'sim_wing_launch');
  },
  hold: () => [0, 0, 0, thr], /* sticks centred, the throttle held: scripts/lib/as3xloop.js levelCondition's form */
  pin: null,
});

/*
 * THE TWO FLOWN CHECKS, on top of the margins (702e8a0ee's, on the
 * receiver there):
 *   kick     each axis kicked 1 rad/s at cruise, top speed, the dive and
 *            the hover: still ringing a second on (as3xloop.js rings,
 *            against the same flight unkicked) fails. Not judged where
 *            the unkicked flight is not steady on the axis, its rate
 *            wandering by more than rings' own floor, a twentieth of the
 *            kick: two flights compared there part company whether or
 *            not anything rings (a hover drifting off its spot, the
 *            torque rolling it). The range is printed, so a skip never
 *            reads as a pass; the hands off hover is judged by
 *            hover:probe;
 *   release  level at cruise, the axis' stick held at 35 percent and at
 *            full for 1 s and let go: the most rate the other way in the
 *            2 s after, against the same flight with that axis' stick
 *            passed straight to its surface (the other axes still held),
 *            the airframe's own return. More than that by the least a
 *            pilot sees fails: 7 percent of that flight's peak rate on
 *            the axis, the Weber fraction for visual velocity
 *            as3x-feel.js F1 holds AS3X to (De Bruyn and Orban, Vision
 *            Research 28(12), 1988).
 * The gains are the highest that hold the margin rule and pass both:
 * the literal form of "the highest setting that will not cause
 * oscillation at any speed", the oscillation looked for on the plant as
 * well as in the measured loop, whose linear margins do not see a hold
 * saturating its stick.
 */
/* 702e8a0ee's two sticks (docs/FLIGHTMODEL.md, "37 deg/s back from a 35
 * percent roll, 157 from full"). */
const STICKS = [0.35, 1];
/* scripts/as3x-feel.js F1's Weber fraction, as above. */
const WEBER = 0.07;
function release(sim, h, g, V, thr, axis, stick, pass = -1) {
  const tr = acroFlight(sim, h, g, launched(V, thr), axis, { pilot: (i) => { const st = [0, 0, 0]; if (i >= 1000 && i < 2000) st[axis] = stick; return st; }, ms: 4000, from: 0, pass });
  const rel = tr[2000];
  let back = 0, peak = 0;
  for (let i = 0; i < tr.length; i += 1) {
    peak = Math.max(peak, Math.abs(tr[i]));
    if (i > 2000) back = Math.max(back, -Math.sign(rel) * tr[i]);
  }
  return { back, peak };
}

function flown(sim, h, g, conds, cruise, axis) {
  const rang = [], held = [];
  for (const c of conds) {
    const still = acroFlight(sim, h, g, c, axis);
    const range = Math.max(...still) - Math.min(...still);
    if (range > 0.05) { held.push(`${c.id} (${range.toFixed(2)} rad/s)`); continue; }
    if (rings(acroFlight(sim, h, g, c, axis, { kick: 1 }), still, 1)) rang.push(c.id);
  }
  const kicks = STICKS.map((st) => {
    const r = release(sim, h, g, cruise.V, cruise.throttle, axis, st);
    const ref = release(sim, h, g, cruise.V, cruise.throttle, axis, st, axis);
    const bound = ref.back + WEBER * ref.peak;
    return { stick: st, back: r.back, manual: ref.back, bound, ok: r.back <= bound };
  });
  return { rang, held, kicks, ok: !rang.length && kicks.every((k) => k.ok) };
}

/* The plant's own mode 2 against the emulation at the table's gains. */
function emulatorMatches(sim, h, g, cond) {
  let worst = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const a = acroFlight(sim, h, null, cond, axis, { kick: 1 });
    const b = acroFlight(sim, h, g, cond, axis, { kick: 1 });
    for (let i = 0; i < a.length; i += 1) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  }
  return worst;
}

/* One table: measured, derived, flown. */
async function work(name) {
  const m = await measure(name);
  if (!DERIVED.includes(name)) return { m };
  const plane = ACRO.find((p) => p.name === name);
  const body = rowOf(src, name);
  const h = { ...holdOf(body), iMax: AP_IMAX };
  const sim = await planeSim(plane.sim, SEAT_FULL);
  const t = Object.values(TABLE).find((x) => x.simId === plane.sim);
  const trim = numOf(body, 'stab_trim_throttle');
  const cruise = levelCondition('cruise', t.cruiseMs, trim);
  const conds = [cruise, levelCondition('top', topSpeed(sim), 1), diveCondition(terminalDive(sim))];
  const electric = /\.current_full = [1-9]/.test(body);
  const hover = hoverCondition(electric ? wingSeat(name).hoverStick(SEAT_FULL) ?? 1 : 0.6);
  if (hoverHolds(sim, hover)) conds.push(hover);
  const cand = [0, 1, 2].map((axis) => candidates(m, axis, h.errMax));
  const P = cand.map((c) => c[0] ?? 0);
  const gains = () => P.map((p, axis) => rounded(axis, p));
  const flownAt = [];
  for (let axis = 0; axis < 3; axis += 1) {
    let r = null;
    for (const p of cand[axis]) {
      P[axis] = p;
      r = flown(sim, h, gains(), conds, cruise, axis);
      if (r.ok) break;
    }
    if (r && !r.ok) P[axis] = 0;
    flownAt.push(r);
  }
  const shipped = tableGains(body);
  const match = emulatorMatches(sim, { ...h, iMax: numOf(body, 'acro_i_max') }, shipped, cruise);
  return { m, derived: gains(), linear: cand.map((c) => c[0] ?? 0), P, flownAt, match };
}

if (opt('--plane')) {
  const out = JSON.stringify(await work(opt('--plane')));
  await new Promise((resolve) => { process.stdout.write(out, resolve); });
  process.exit(0);
}

/* The emulation agrees with the plant's mode 2 within this, rad/s: what
 * JS's libm and the plant's own differ by over the flight, far under any
 * rate the checks read. */
const MATCH = 1e-9; /* as scripts/as3x-feel.js F0 holds its emulation */

const fleet = await fanOut(self, ACRO.map((p) => p.name));
/* The failures npm run acro:derive counts. */
let bad = 0;
for (const { name } of ACRO) {
  const w = fleet[name];
  const m = revive(w.m);
  const body = rowOf(src, name);
  const table = tableGains(body);
  const derived = w.derived ?? null;
  console.log(`\n${name}${derived ? ' (derived)' : ''}: ${m.conds.map((c) => `${c.id} ${c.V.toFixed(1)} m/s`).join(', ')}`);
  for (let axis = 0; axis < 3; axis += 1) {
    const g = table[axis];
    if (!m.conds.some((c) => c.resp[axis])) continue;
    if (derived) {
      const d = derived[axis];
      const same = d.kp === g.kp && d.ki === g.ki && d.kd === g.kd;
      const fl = w.flownAt[axis];
      console.log(`  ${AX[axis].padEnd(5)} P ${w.P[axis]} (the margins' highest inside the stick ${w.linear[axis]}): kp ${d.kp}, ki ${d.ki}, kd ${d.kd}; table ${g.kp}, ${g.ki}, ${g.kd}${same ? '' : '  DIFFERS'}`);
      if (fl) {
        console.log(`        kicked: ${fl.rang.length ? `RINGS at ${fl.rang.join(', ')}` : 'settles everywhere'}${fl.held.length ? ` ; NOT JUDGED, unsteady unkicked over the 1.5 s: ${fl.held.join(', ')}` : ''}; release ${fl.kicks.map((k) => `${Math.round(k.stick * 100)} percent back ${(k.back / DEG).toFixed(1)} deg/s (its stick passed through ${(k.manual / DEG).toFixed(1)}, bound ${(k.bound / DEG).toFixed(1)})`).join(', ')}`);
        if (!fl.ok) bad += 1;
      }
      if (!same) bad += 1;
    }
    if (!(g.kp > 0 || g.kd > 0)) { console.log(`  ${AX[axis].padEnd(5)} not held`); continue; }
    for (const c of m.conds) {
      if (!c.resp[axis] || !(weightOf(c, axis) > 0.01)) continue;
      const r = marginsAt(c, axis, g);
      const low = under(r);
      if (low && derived) bad += 1;
      console.log(`  ${AX[axis].padEnd(5)} ${c.id.padEnd(8)} GM ${f(r.gmDb)} dB at ${f(r.w180, 0)} rad/s, PM ${f(r.pmDeg)} deg at ${f(r.wc, 1)} rad/s, Ms ${f(r.msDb)} dB${low ? (derived ? '  UNDER THE RULE' : '  under the rule (not judged)') : ''}`);
    }
  }
  if (derived) {
    console.log(`  the emulated hold against the plant's mode 2, kicked at cruise: within ${w.match.toExponential(1)} rad/s`);
    if (!(w.match <= MATCH)) bad += 1;
  }
}

if (argv.includes('--check')) {
  console.log(bad ? `\nacro-derive: FAIL, ${bad}` : '\nacro-derive: ok');
  process.exit(bad ? 1 : 0);
}
