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
