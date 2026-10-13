/*
 * skyhunter-derive.js: the thrust dependent arithmetic behind
 * docs/SKYHUNTER-STAGE1.md, the script its "The script that made the
 * numbers" records: S1, S4 and S7, the throttle S5 holds 20 m/s with, and
 * S10's phugoid, the four state longitudinal model (u, w, q, theta;
 * Nelson, Flight Stability and Automatic Control, ch. 4) trimmed level at
 * 15 m/s from the doc's derivatives. It never loads the plant: this is
 * what the plant is checked against. The thrust is the prop curve the
 * plant flies (scripts/lib/propcurve.js), read off the Skyhunter's table.
 * Harness arithmetic in JS maths, which is allowed here because nothing
 * it prints is hashed. Run with node scripts/skyhunter-derive.js.
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

import { wingProp, SEAT_GATES, wingSeat } from './lib/propcurve.js';
import { cornerOf, profile } from './lib/crossflow.js';

const rho = 1.225;
const g = 9.81;

/* docs/SKYHUNTER-STAGE1.md, the published and estimated figures. */
const b = 1.8, S = 0.36, c = 0.2, m = 2.10, Iyy = 0.14, CD0 = 0.033, e = 0.80;
const CLa = 5.52, Cma = -0.94, Cmq = -14.1;
const Ts = 27.0;
const W = m * g, AR = b * b / S, k = 1 / (Math.PI * e * AR);

const prop = wingProp('FW_SKY1800');
/* The pack the gates seat, at the motor's law and the table's v_meas
 * (scripts/lib/propcurve.js wingSeat, plant_wing.c power_duty). */
const seat = wingSeat('FW_SKY1800');
/* The duty is the speed share, as the doc's T_s d^2 has it. */
const T = (V, d) => Math.max(0, prop.thrust(Ts, V, seat.at(SEAT_GATES, d, V).n));
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let lo = 5, hi = 60;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const dutyAt = (V) => {
  let lo = 0.05, hi = 1;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (T(V, mid) > D(V)) hi = mid; else lo = mid; }
  return hi;
};
let best = { vz: -1, V: 0 };
for (let V = 6; V < 40; V += 0.01) { const vz = (T(V, 1) - D(V)) * V / W; if (vz > best.vz) best = { vz, V }; }

/*
 * S10: Nelson's dimensional derivatives in the stability axes, level at
 * u0, the thrust's fall with speed in X_u. The doc's 9.8 s was taken
 * without CL_q and Cm_alphadot, and this keeps that so the two laws are
 * compared on one model (with both the period is 0.1 s shorter).
 */
function phugoid(u0) {
  const Q = 0.5 * rho * u0 * u0, CL0 = W / (Q * S), CDt = CD0 + k * CL0 * CL0;
  const d = dutyAt(u0), h = 1e-3;
  const dTdu = (T(u0 + h, d) - T(u0 - h, d)) / (2 * h);
  const Xu = -2 * CDt * Q * S / (m * u0) + dTdu / m;
  const Xw = -(2 * k * CL0 * CLa - CL0) * Q * S / (m * u0);
  const Zu = -2 * CL0 * Q * S / (m * u0);
  const Zw = -(CLa + CDt) * Q * S / (m * u0);
  const Mw = Cma * Q * S * c / (Iyy * u0);
  const Mq = Cmq * (c / (2 * u0)) * Q * S * c / Iyy;
  const A = [[Xu, Xw, 0, -g], [Zu, Zw, u0, 0], [0, Mw, Mq, 0], [0, 0, 1, 0]];
  const roots = eigen4(A).filter(([, im]) => im > 1e-9).map(([re, im]) => ({ T: 2 * Math.PI / im, zeta: -re / Math.hypot(re, im) }));
  roots.sort((x, y) => y.T - x.T);
  return { duty: d, dTdu, ph: roots[0], sp: roots[1] };
}

/* The roots of a 4 x 4's characteristic polynomial: its coefficients by
 * Faddeev and LeVerrier, the roots by Durand and Kerner. */
function eigen4(A) {
  const n = 4;
  const mul = (X, Y) => X.map((r, i) => r.map((_, j) => X[i].reduce((s, _x, l) => s + X[i][l] * Y[l][j], 0)));
  let M = A.map((r) => r.map(() => 0));
  const cs = [1];
  for (let i = 1; i <= n; i += 1) {
    M = mul(A, M).map((r, a) => r.map((v, j) => v + (a === j ? cs[i - 1] : 0)));
    const AM = mul(A, M);
    cs.push(-AM.reduce((s, r, a) => s + r[a], 0) / i);
  }
  const cmul = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
  const cdiv = (x, y) => { const q = y[0] * y[0] + y[1] * y[1]; return [(x[0] * y[0] + x[1] * y[1]) / q, (x[1] * y[0] - x[0] * y[1]) / q]; };
  let z = [0, 1, 2, 3].map((i) => { let p = [1, 0]; for (let j = 0; j < i; j += 1) p = cmul(p, [0.4, 0.9]); return p; });
  for (let it = 0; it < 500; it += 1) {
    z = z.map((zi, i) => {
      let p = [1, 0];
      for (let j = 1; j <= n; j += 1) { p = cmul(p, zi); p[0] += cs[j]; }
      let q = [1, 0];
      z.forEach((zj, j) => { if (j !== i) q = cmul(q, [zi[0] - zj[0], zi[1] - zj[1]]); });
      const s = cdiv(p, q);
      return [zi[0] - s[0], zi[1] - s[1]];
    });
  }
  return z;
}

/* The side crossflow drag area: the pod's side, 0.086 m^2, the render
 * model's (ESTIMATED), at Allen and Perkins' crossflow coefficient of 1.2
 * times their eta of 0.7, the 1.2 a round body's taken over to the drawn
 * sections (scripts/lib/crossflow.js, NACA TN 3038), as the Extra's. The
 * sections: station, half width, half height, squareness, m, the drawn
 * model's POD (src/render/skycraft.js), smoothstepped between rows, and
 * its nose from -0.385, an ellipse in side and plan that takes the first
 * row's width and height down by sqrt(1 - u^2) and its squareness to 2. */
const POD = [
  [-0.300, 0.066, 0.075, 2.6], [-0.100, 0.068, 0.079, 2.8], [0.050, 0.066, 0.078, 2.8],
  [0.130, 0.056, 0.066, 2.5], [0.195, 0.042, 0.046, 2.2], [0.235, 0.028, 0.028, 2.0],
];
const NOSE_Z = -0.385;
const side = profile((z) => {
  if (z <= POD[0][0]) {
    const [z0, w, h, e] = POD[0];
    const u = (z0 - z) / (z0 - NOSE_Z);
    const k = Math.sqrt(Math.max(0, 1 - u * u));
    return { depth: 2 * h * k, f: w / h, rho: cornerOf(2 + (e - 2) * k) };
  }
  let i = 0;
  while (z > POD[i + 1][0]) i += 1;
  const [a, bb] = [POD[i], POD[i + 1]];
  const u = (z - a[0]) / (bb[0] - a[0]);
  const t = u * u * (3 - 2 * u);
  const at = (j) => a[j] + (bb[j] - a[j]) * t;
  return { depth: 2 * at(2), f: at(1) / at(2), rho: cornerOf(at(3)) };
}, NOSE_Z, POD[POD.length - 1][0]);
const sectionK = side.ratio;
/* Where it acts (plant_wing.c side_x): the side view's centroid, each
 * station weighted by its own crossflow drag (scripts/lib/crossflow.js
 * profile, Allen and Perkins NACA TR 1048), ahead of the drawing's origin, the CG (src/render/skycraft.js).
 * ESTIMATED: the drawn sections. */
const sideX = -(side.centre - (0));
const sideCda = 0.086 * 1.2 * sectionK * 0.7;

const f = (x, n = 2) => Number(x).toFixed(n);
const ph = phugoid(15);
const rows = [
  ['pitch speed m/s (the table), static thrust N', `${f(prop.pitchSpeed, 3)} ${f(Ts)}`],
  ['S1 level speed at 65 percent m/s', f(level(0.65))],
  ['S4 top speed m/s', f(level(1))],
  ['S7 best climb m/s at m/s', `${f(best.vz)} ${f(best.V)}`],
  ['S5 the duty that holds 20 m/s level', f(dutyAt(20), 4)],
  ['S10 at 15 m/s: duty, dT/du N s/m', `${f(ph.duty, 3)} ${f(ph.dTdu, 3)}`],
  ['   phugoid period s, zeta', `${f(ph.ph.T)} ${f(ph.ph.zeta)}`],
  ['   short period s, zeta', `${f(ph.sp.T)} ${f(ph.sp.zeta)}`],
  ['side crossflow drag area m2; its section over a round body\'s (TN 3038)', `${f(sideCda, 4)}; ${f(sectionK, 4)}`],
  ['side_x: the crossflow\'s centre of pressure ahead of the CG, m (Allen and Perkins)', f(sideX, 4)],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(48)} ${v}`);
}
