/*
 * propcurve.js: a wing table's prop curves, plant_wing.c prop_curve
 * (FixedWingParams axial_curve and torque_curve, docs/FLIGHTMODEL.md "The
 * prop's curves"), read off the table in the plant's source so a
 * derivation predicts on the curve the plant flies: the thrust and the
 * shaft torque over their static values at mu = u / (pitch_speed n),
 * straight between the tenths and on along the last two past mu = 2. It
 * never loads the plant. Harness arithmetic in JS maths, which is allowed
 * here because nothing it prints is hashed.
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

const WING_C = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'src/native/plant_wing.c');

function list(body, name) {
  const m = new RegExp(`\\.${name} = \\{([^}]*)\\}`).exec(body);
  if (!m) return null;
  return m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number);
}

function at(c, mu) {
  const x = Math.max(0, mu) * 10;
  const i = Math.min(c.length - 2, Math.floor(x));
  return c[i] + (x - i) * (c[i + 1] - c[i]);
}

/* The table's pitch speed and its curves; throws where it has none, so a
 * derivation never falls back to a line the plant no longer flies. */
export function wingProp(table) {
  const src = readFileSync(WING_C, 'utf8');
  const m = new RegExp(`const FixedWingParams ${table} = \\{([\\s\\S]*?)\\n\\};`).exec(src);
  if (!m) throw new Error(`propcurve: no table ${table} in plant_wing.c`);
  const axial = list(m[1], 'axial_curve'), torque = list(m[1], 'torque_curve');
  const vp = /\.pitch_speed = ([\d.]+)/.exec(m[1]);
  if (!axial || !vp) throw new Error(`propcurve: ${table} has no axial_curve or pitch_speed`);
  return {
    pitchSpeed: Number(vp[1]),
    /* Thrust over static at mu, and at an airspeed V at speed share n. */
    ct: (mu) => at(axial, mu),
    cp: (mu) => (torque ? at(torque, mu) : NaN),
    thrust: (Ts, V, n) => (n > 0 ? Ts * n * n * at(axial, Math.max(0, V) / (Number(vp[1]) * n)) : 0),
  };
}

/* An electric's steady speed share at a stick with no throttle_rpm table:
 * the ESC's duty is the stick's (linear) and Drela's motor settles where
 * n^2 + K_M n = (K_M + 1) d, K_M = 0.85 / 0.15 (plant_wing.c prop_spool),
 * so a part stick turns the prop faster than its share: 0.437 at 0.4. */
const K_M = 0.85 / 0.15;
/* No cap at 1: a pack over the table's measured voltage gives the motor a
 * duty past it (wingSeat below), as the plant's does. */
export const electricN = (d) => (d > 0 ? (-K_M + Math.sqrt(K_M * K_M + 4 * (K_M + 1) * d)) / 2 : 0);

const PLANT_C = join(dirname(WING_C), 'plant.c');

/* The seats a derivation flies at, open circuit volts a cell. The gate
 * scripts seat 4.1 (sim_set_cell_voltage), so every band is derived there.
 * A maker's published speed or climb is flown on a full pack: Freewing's
 * F-16 manual, "before flying, we need a fully charged battery"
 * (https://www.freewing-model.com/download/freewing-70mm-f-16-v3-70mm-manual.pdf),
 * which is 4.2 on the plant's LiPo curve; a fit to a published figure is
 * made there. */
export const SEAT_GATES = 4.1;
export const SEAT_FULL = 4.2;

/*
 * THE SEAT, plant_wing.c power_duty (docs/POWER-STAGE1.md): an electric's
 * duty runs at the pack's loaded voltage over the table's v_meas, the
 * loaded voltage a cell its thrust and current were measured at. at(vCell,
 * stick, V) is the steady state at an open circuit vCell a cell, a stick
 * and an airspeed: the ratio r = (vCell - I r_cell) / v_meas, the duty the
 * motor turns at, d (the stick's, through the table's throttle_rpm where it
 * has one, times r), its speed share n (Drela's law, electricN, for a prop;
 * the duty itself for a fan, plant_wing.c fan_spool) and the pack's current
 * I = current_full n^3 Cp(mu) / r (power_current), solved together. The
 * drain over a flight is left out: a derivation's figure is the seat's.
 * stickFor(vCell, n, V) inverts it. Throws where the table has no v_meas,
 * so no derivation flies a pack the plant does not. A derivation that
 * derives the table's v_meas and current_full themselves passes them in
 * `derived`.
 */
export function wingSeat(table, derived = {}) {
  const src = readFileSync(WING_C, 'utf8');
  const m = new RegExp(`const FixedWingParams ${table} = \\{([\\s\\S]*?)\\n\\};`).exec(src);
  if (!m) throw new Error(`propcurve: no table ${table} in plant_wing.c`);
  const num = (name) => { const x = new RegExp(`\\.${name} = ([\\d.]+)`).exec(m[1]); return x ? Number(x[1]) : 0; };
  const vMeas = derived.vMeas ?? num('v_meas'), currentFull = derived.currentFull ?? num('current_full'), fan = num('fan_tau') > 0;
  if (!(vMeas > 0) || !(currentFull > 0)) throw new Error(`propcurve: ${table} has no v_meas or current_full`);
  const entry = new RegExp(`\\[SIM_AIRFRAME_\\w+\\] = \\{((?:(?!\\n\\},)[\\s\\S])*?\\.fw = &${table},[\\s\\S]*?)\\n\\},`).exec(readFileSync(PLANT_C, 'utf8'));
  if (!entry) throw new Error(`propcurve: no airframe flies ${table} in plant.c`);
  const rCell = Number(/\.r_cell = ([\d.]+)/.exec(entry[1])[1]);
  const cells = Number(/\.cells = ([\d.]+)/.exec(entry[1])[1]);
  const massKg = Number(/\.mass_kg = ([\d.]+)/.exec(entry[1])[1]);
  const thrustStatic = num('thrust_static');
  const rpm = list(m[1], 'throttle_rpm');
  const stickDuty = (stick) => {
    const t = Math.max(0, Math.min(1, stick));
    if (!rpm) return t;
    const x = t * 10, i = x >= 10 ? 9 : Math.floor(x);
    const c = rpm[i] + (x - i) * (rpm[i + 1] - rpm[i]);
    return (c * c + K_M * c) / (K_M + 1);
  };
  const prop = wingProp(table);
  const at = (vCell, stick, V) => {
    let r = vCell / vMeas, I = 0, d = 0, n = 0;
    for (let k = 0; k < 200; k += 1) {
      d = stickDuty(stick) * r;
      n = fan ? d : electricN(d);
      const cp = n > 0 ? prop.cp(Math.max(0, V) / (prop.pitchSpeed * n)) : 0;
      I = n > 0 && prop.ct(Math.max(0, V) / (prop.pitchSpeed * n)) > 0 ? currentFull * n * n * n * cp / r : 0;
      const next = (vCell - I * rCell) / vMeas;
      if (Math.abs(next - r) < 1e-12) { r = next; break; }
      r = next;
    }
    return { r, d, n, I };
  };
  /* The stick that turns the rotor at the speed share n, or null past
   * full throttle's. */
  const stickFor = (vCell, n, V) => {
    if (at(vCell, 1, V).n < n) return null;
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (at(vCell, mid, V).n < n) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  /* The stick that hangs the airframe's weight on the prop standing (its
   * table mass, no load or option), or null where full throttle cannot. */
  const hoverStick = (vCell) => stickFor(vCell, Math.sqrt(massKg * 9.81 / thrustStatic), 0);
  return { vMeas, rCell, cells, currentFull, fan, at, stickFor, hoverStick };
}

/*
 * A mapped engine (FixedWingParams.engine_q, plant_wing.c engine_torque and
 * prop_spool): its torque at the stick and the speed it turns, nothing past
 * engine_rpm_max but the idle stop's, against the air's on the prop, Q_f n^2
 * torque_curve(mu) times the tips' Mach load over the full point's
 * (CP_MACH, APC's 22x8 static rows). Null where the table has no map.
 * net(stick, V, n) is the rotor's net torque over Q_f; nAt(stick, V) the
 * speed share it settles at, the first one up from a near stop where the
 * net turns from driving to braking, as the spool from rest finds it.
 */
const CP_MACH = [1.000, 1.011, 1.049, 1.191, 1.532, 1.941];
const cpMach = (m) => {
  const x = (m - 0.5) / 0.1;
  if (!(x > 0)) return CP_MACH[0];
  if (x >= CP_MACH.length - 1) return CP_MACH[CP_MACH.length - 1];
  const i = Math.floor(x);
  return CP_MACH[i] + (x - i) * (CP_MACH[i + 1] - CP_MACH[i]);
};

export function wingEngine(table) {
  const src = readFileSync(WING_C, 'utf8');
  const body = new RegExp(`const FixedWingParams ${table} = \\{([\\s\\S]*?)\\n\\};`).exec(src)[1];
  const map = /\.engine_q = \{([\s\S]*?)\n {2}\}/.exec(body);
  if (!map) return null;
  const q = map[1].replace(/\/\*[\s\S]*?\*\//g, '').split('}')
    .map((row) => row.replace(/[{\s]/g, '').split(',').filter((x) => x !== '').map(Number))
    .filter((row) => row.length === 15);
  const num = (name) => Number(new RegExp(`\\.${name} = ([\\d.]+)`).exec(body)[1]);
  const rpmMax = num('engine_rpm_max'), rpmFull = 0.85 * num('rpm_no_load');
  const qf = num('torque_arm') * num('thrust_static');
  const tipF = Math.PI * 2 * num('slip_r') * rpmFull / 60 / 340;
  const prop = wingProp(table);
  const torque = (stick, rpm) => {
    const st = rpm > rpmMax ? 0 : Math.max(0, Math.min(1, stick));
    const xr = st <= 0.2 ? st / 0.2 : 1 + (st - 0.2) / 0.1;
    const r = xr >= 9 ? 8 : Math.floor(xr), fr = xr - r;
    const xc = (rpm - 1000) / 500;
    const c = xc < 0 ? 0 : (xc >= 14 ? 13 : Math.floor(xc)), fc = xc - c;
    const q0 = q[r][c] + fc * (q[r][c + 1] - q[r][c]);
    const q1 = q[r + 1][c] + fc * (q[r + 1][c + 1] - q[r + 1][c]);
    return q0 + fr * (q1 - q0);
  };
  const net = (stick, V, n) => torque(stick, n * rpmFull) / qf
    - n * n * prop.cp(Math.max(0, V) / (prop.pitchSpeed * n)) * cpMach(tipF * n) / cpMach(tipF);
  const nAt = (stick, V) => {
    let prev = 0.02;
    for (let n = 0.025; n <= 1.6; n += 0.005) {
      if (net(stick, V, n) <= 0) {
        let lo = prev, hi = n;
        for (let i = 0; i < 50; i += 1) { const mid = (lo + hi) / 2; if (net(stick, V, mid) > 0) lo = mid; else hi = mid; }
        return lo;
      }
      prev = n;
    }
    return 1.6;
  };
  return { torque, net, nAt, rpmFull, rpmMax, qf };
}
