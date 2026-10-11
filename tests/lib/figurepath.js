/*
 * figurepath.js: synthetic flight paths for the figure detector's checks.
 *
 * A path is a list of segments, each a stretch of milliseconds with body
 * rates (p, q, r in rad/s, the plant's frame: x forward, y left, z up, so
 * a pull up is a negative q) and a rule for the velocity: along the nose
 * at a speed, at an angle of attack below the nose, or a fixed world
 * vector (a spin's sink, a hover's stillness). The attitude integrates
 * the rates at 1 ms as the plant would, and the output is the plant's
 * state array per step, so the detector reads exactly what it reads in
 * flight. Used for the figures today's physics cannot fly yet (spins,
 * snaps, the blender) and for the exact shape of every other one.
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

export const DEG = Math.PI / 180;

/* A quaternion for a nose pitched up by `pitch` rad, then rolled by `roll`
 * rad, heading along +x. */
export function attitudeQuat(pitch = 0, roll = 0) {
  const cp = Math.cos(-pitch / 2), sp = Math.sin(-pitch / 2);
  const cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
  /* q = qPitch(about y) * qRoll(about x) */
  return [cp * cr, cp * sr, sp * cr, -sp * sr];
}

/*
 * Runs the segments; calls each(state) per 1 ms step. Returns the end
 * state. seg: { ms, p=0, q=0, r=0, speed, alpha=0 (rad, velocity below
 * the nose), world: [vx,vy,vz] (overrides), keepVel (the velocity held
 * from the segment's first step), worldRate: [wx,wy,wz] (rad/s about
 * world axes, added to the body rates), aboutVel (rad/s about the
 * velocity, with keepVel), dSpeed: m/s per s }.
 */
export function flyPath(segments, each, start = {}) {
  let [w, x, y, z] = start.q ?? [1, 0, 0, 0];
  let px = 0, py = 0, pz = start.z ?? 100;
  let speed = start.speed ?? 20;
  let t = 0;
  const dt = 0.001;
  const st = new Array(14).fill(0);
  for (const seg of segments) {
    if (seg.speed !== undefined) speed = seg.speed;
    for (let i = 0; i < seg.ms; i += 1) {
      let p = seg.p ?? 0, q = seg.q ?? 0, r = seg.r ?? 0;
      let wr = seg.worldRate;
      if (seg.aboutVel) {
        /* Autorotation about the flight path, as a snap or a rolling
         * harrier turns. */
        const m = Math.hypot(st[4], st[5], st[6]) || 1;
        wr = [seg.aboutVel * st[4] / m, seg.aboutVel * st[5] / m, seg.aboutVel * st[6] / m];
      }
      if (wr) {
        /* A world angular velocity, turned into the body: R^T w. */
        const [ax, ay, az] = wr;
        p += (1 - 2 * (y * y + z * z)) * ax + 2 * (x * y + w * z) * ay + 2 * (x * z - w * y) * az;
        q += 2 * (x * y - w * z) * ax + (1 - 2 * (x * x + z * z)) * ay + 2 * (y * z + w * x) * az;
        r += 2 * (x * z + w * y) * ax + 2 * (y * z - w * x) * ay + (1 - 2 * (x * x + y * y)) * az;
      }
      const dw = 0.5 * (-x * p - y * q - z * r);
      const dx = 0.5 * (w * p + y * r - z * q);
      const dy = 0.5 * (w * q + z * p - x * r);
      const dz = 0.5 * (w * r + x * q - y * p);
      w += dw * dt; x += dx * dt; y += dy * dt; z += dz * dt;
      const m = Math.hypot(w, x, y, z);
      w /= m; x /= m; y /= m; z /= m;
      if (seg.dSpeed) speed = Math.max(0, speed + seg.dSpeed * dt);
      let v;
      if (seg.keepVel && t > 0) {
        v = [st[4], st[5], st[6]];
      } else if (seg.world) {
        v = seg.world;
      } else {
        const n = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
        const u = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
        const a = seg.alpha ?? 0;
        const ca = Math.cos(a), sa = Math.sin(a);
        v = [speed * (ca * n[0] - sa * u[0]), speed * (ca * n[1] - sa * u[1]), speed * (ca * n[2] - sa * u[2])];
      }
      px += v[0] * dt; py += v[1] * dt; pz += v[2] * dt;
      t += dt;
      st[0] = t; st[1] = px; st[2] = py; st[3] = pz; st[4] = v[0]; st[5] = v[1]; st[6] = v[2];
      st[7] = w; st[8] = x; st[9] = y; st[10] = z; st[11] = p; st[12] = q; st[13] = r;
      each(st);
    }
  }
  return st;
}

/* A loop's pitch rate for a radius at a speed: pull up is negative q. */
export const pull = (speed, radius, turns = 1) => ({ q: -speed / radius, ms: Math.round((turns * 2 * Math.PI * radius / speed) * 1000), speed });
export const push = (speed, radius, turns = 1) => ({ ...pull(speed, radius, turns), q: speed / radius });
export const straight = (ms, speed) => ({ ms, speed });
/* A roll at a rate (rad/s) for a number of turns. */
export const roll = (rate, turns, speed) => ({ p: rate, ms: Math.round((turns * 2 * Math.PI / Math.abs(rate)) * 1000), speed });
