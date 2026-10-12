/*
 * wing-derive.js: the performance arithmetic behind docs/WING-STAGE1.md,
 * the script its "The script that made the numbers" records, from the
 * table of published figures to W1 to W4 and W7. It never loads the
 * plant: this is what the plant is checked against. The thrust is the
 * prop curve the plant flies (scripts/lib/propcurve.js), read off the
 * wing's table. Harness arithmetic in JS maths, which is allowed here
 * because nothing it prints is hashed. Run with node scripts/wing-derive.js.
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

import { wingProp } from './lib/propcurve.js';

const rho = 1.225;
const g = 9.81;

/* docs/WING-STAGE1.md, the published figures. */
const b = 1.0, S = 0.22, m = 0.65, CLmax = 0.90, CD0 = 0.030, e = 0.80;
const Ts = 11.5;
const W = m * g, AR = b * b / S, k = 1 / (Math.PI * e * AR);

const prop = wingProp('FW_WING1000');
/* The duty is the speed share, as the doc's T_s d^2 has it. */
const T = (V, d) => Math.max(0, prop.thrust(Ts, V, d));
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let lo = 5, hi = 60;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};

const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
let best = { vz: -1, V: 0 };
for (let V = 6; V < 40; V += 0.01) { const vz = (T(V, 1) - D(V)) * V / W; if (vz > best.vz) best = { vz, V }; }

const f = (x, n = 2) => Number(x).toFixed(n);
const rows = [
  ['pitch speed m/s (the table), static thrust N', `${f(prop.pitchSpeed, 3)} ${f(Ts)}`],
  ['W2 stall speed m/s', f(Vs)],
  ['W3 best glide L/D at m/s', `${f(LDmax)} ${f(Vmd)}`],
  ['W1 level speed at 65 percent m/s', f(level(0.65))],
  ['W4 top speed m/s', f(level(1))],
  ['W7 best climb m/s at m/s', `${f(best.vz)} ${f(best.V)}`],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(48)} ${v}`);
}
