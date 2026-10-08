/*
 * hold.js: where an aircraft nobody is flying is, on the room clock
 * (docs/campaign/interior/CONTRACT-HOLDS.md, TECH-NEEDS.md N15). A fixed
 * wing left alone orbits a point at its altitude; a quad hovers where it
 * was left. The hold is a path, not a second plant: what a mission needs
 * from an unattended ISR is where it is, and the room and every client
 * must get the same answer, so the orbit uses only + - * / and sqrt
 * (bit exact in every engine), never Math.sin or Math.cos.
 *
 * Frame: the ops frame (z up, metres), room ms, as CONTRACT-P0.md 1.
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

import { airStartSpeed } from '../../../configs/airframes.js';

/* Bank held on the orbit, as its tangent: 25 degrees, inside the 30 to 45
 * degree bank limit small UAV loiter autopilots fly (Beard and McLain,
 * Small Unmanned Aircraft, 2012, ch. 9), so the circle is one the
 * aircraft could fly. tan(25 deg). */
const TAN_BANK = 0.4663076581549986;
const G = 9.80665;

/* sin and cos of a small angle a (|a| under 0.01 rad here) by Taylor
 * series, then made exactly unit length. */
function smallTurn(a) {
  const a2 = a * a;
  const s = a * (1 - a2 / 6 * (1 - a2 / 20 * (1 - a2 / 42)));
  const c = 1 - a2 / 2 * (1 - a2 / 12 * (1 - a2 / 30 * (1 - a2 / 56)));
  const n = Math.sqrt(c * c + s * s);
  return [c / n, s / n];
}

function mul(x, y) {
  const c = x[0] * y[0] - x[1] * y[1];
  const s = x[0] * y[1] + x[1] * y[0];
  const n = Math.sqrt(c * c + s * s);
  return [c / n, s / n];
}

/* The per ms turn raised to the n by squaring: about twenty products for
 * ten minutes, each renormalised, so the radius does not drift. */
function turnBy(step, n) {
  let out = [1, 0];
  let b = step;
  for (let k = n; k > 0; k = Math.floor(k / 2)) {
    if (k % 2 === 1) {
      out = mul(out, b);
    }
    b = mul(b, b);
  }
  return out;
}

/*
 * The hold an aircraft takes when left at room ms t: pose { p: [x, y, z],
 * v: [vx, vy, vz] } in the ops frame. A fixed wing turns left onto a
 * circle tangent to its track, at its own speed or its air start speed
 * (configs/airframes.js airStartSpeed, 1.3 times stall), whichever is
 * faster, so the first point of the circle is where it was and the
 * first velocity is its track. A quad hovers at p.
 */
export function holdOf(pose, af, t) {
  if (!Number.isInteger(t)) {
    throw new Error(`hold: room ms must be an integer, got ${t}`);
  }
  const p0 = [pose.p[0], pose.p[1], pose.p[2]];
  if (!af.fixedWing) {
    return { kind: 'hover', t0: t, p0 };
  }
  const vx = pose.v[0];
  const vy = pose.v[1];
  const ground = Math.sqrt(vx * vx + vy * vy);
  const speed = Math.max(ground, airStartSpeed(af));
  /* A plane held still (on the ground) has no track; it is not held. */
  if (!(ground > 0)) {
    throw new Error('hold: a fixed wing needs a track to orbit on');
  }
  const ux = vx / ground;
  const uy = vy / ground;
  const r = speed * speed / (G * TAN_BANK);
  const c = [p0[0] - uy * r, p0[1] + ux * r, p0[2]];
  return {
    kind: 'orbit', t0: t, p0, c, r, speed, step: smallTurn(speed / r / 1000),
  };
}

/* Where a hold is at room ms t (an integer, at or after its t0):
 * { p, v }. */
export function holdPose(h, t) {
  if (!Number.isInteger(t) || t < h.t0) {
    throw new Error(`hold: room ms ${t} before the hold began at ${h.t0}`);
  }
  if (h.kind === 'hover') {
    return { p: [...h.p0], v: [0, 0, 0] };
  }
  const [cs, sn] = turnBy(h.step, t - h.t0);
  const rx = h.p0[0] - h.c[0];
  const ry = h.p0[1] - h.c[1];
  const x = rx * cs - ry * sn;
  const y = rx * sn + ry * cs;
  const k = h.speed / h.r;
  return { p: [h.c[0] + x, h.c[1] + y, h.p0[2]], v: [-y * k, x * k, 0] };
}
