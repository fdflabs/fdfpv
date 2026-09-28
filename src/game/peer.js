/*
 * peer.js: where to draw another pilot's aircraft, from the poses the room
 * relays (src/share/roomwire.js), on the room clock.
 *
 * Far peers are drawn in the past, DELAY_MS behind their newest sample,
 * interpolated between two real samples: smooth, and never a guess. Near
 * peers are drawn in the present: extrapolated from the newest sample by
 * its velocity and its angular velocity, at most EXTRAP_MAX_MS ahead, so a
 * pilot formating on another sees them where they are rather than a few
 * metres behind (docs/MULTIPLAYER-PLAN.md section 6.4). Between NEAR_M and
 * FAR_M the two blend.
 *
 * Render only. Nothing here reaches a plant, so no trajectory depends on
 * it, and a single player flight never builds one.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

export const DELAY_MS = 150;
export const EXTRAP_MAX_MS = 250;
export const NEAR_M = 60;
export const FAR_M = 100;
export const STALE_MS = 2000;
const RING = 48;

/* How much of the present to draw a peer this far away with: 1 near, 0 far. */
export function nearWeight(distanceM) {
  if (distanceM <= NEAR_M) {
    return 1;
  }
  if (distanceM >= FAR_M) {
    return 0;
  }
  return (FAR_M - distanceM) / (FAR_M - NEAR_M);
}

function nlerp(a, b, u, out) {
  const s = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw < 0 ? -1 : 1;
  let x = a.qx + (b.qx * s - a.qx) * u;
  let y = a.qy + (b.qy * s - a.qy) * u;
  let z = a.qz + (b.qz * s - a.qz) * u;
  let w = a.qw + (b.qw * s - a.qw) * u;
  const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
  out.qx = x / n;
  out.qy = y / n;
  out.qz = z / n;
  out.qw = w / n;
}

export class PeerTrack {
  constructor() {
    this.poses = []; /* newest last, by room time */
    this.arrivedAt = null; /* room ms the newest arrived */
  }

  /* A decoded pose. Older than the newest held is dropped, never
   * reordered: a TCP stream cannot reorder, so that is a reconnect's
   * leftovers. */
  push(pose, roomNowMs) {
    const last = this.poses[this.poses.length - 1];
    if (last && pose.t <= last.t) {
      return;
    }
    this.poses.push(pose);
    if (this.poses.length > RING) {
      this.poses.splice(0, this.poses.length - RING);
    }
    this.arrivedAt = roomNowMs;
  }

  newest() {
    return this.poses.length ? this.poses[this.poses.length - 1] : null;
  }

  /*
   * The pose to draw at room time nowMs, into out ({ px, py, pz, qx, qy,
   * qz, qw }), with `near` from nearWeight. Returns false when there is
   * nothing to draw: no sample yet, or none for STALE_MS.
   */
  sample(nowMs, near, out) {
    const newest = this.newest();
    if (!newest || this.arrivedAt == null || nowMs - this.arrivedAt > STALE_MS) {
      return false;
    }
    /* The past: interpolated at nowMs - DELAY_MS, held at the ends. */
    const t = nowMs - DELAY_MS;
    let i = this.poses.length - 1;
    while (i > 0 && this.poses[i - 1].t > t) {
      i -= 1;
    }
    const b = this.poses[i];
    const a = i > 0 ? this.poses[i - 1] : b;
    const span = b.t - a.t;
    const u = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 1;
    const past = { px: a.px + (b.px - a.px) * u, py: a.py + (b.py - a.py) * u, pz: a.pz + (b.pz - a.pz) * u, qx: 0, qy: 0, qz: 0, qw: 1 };
    nlerp(a, b, u, past);
    if (near <= 0) {
      Object.assign(out, past);
      return true;
    }
    /* The present: the newest sample carried forward. The angular
     * velocity is in the craft's own axes, so the turn is q * exp(w dt). */
    const dt = Math.min(EXTRAP_MAX_MS, Math.max(0, nowMs - newest.t)) / 1000;
    const hx = newest.wx * dt * 0.5;
    const hy = newest.wy * dt * 0.5;
    const hz = newest.wz * dt * 0.5;
    const angle = Math.sqrt(hx * hx + hy * hy + hz * hz);
    const k = angle > 1e-9 ? Math.sin(angle) / angle : 1;
    const rx = hx * k;
    const ry = hy * k;
    const rz = hz * k;
    const rw = Math.cos(angle);
    const q = newest;
    const now = {
      px: q.px + q.vx * dt,
      py: q.py + q.vy * dt,
      pz: q.pz + q.vz * dt,
      qx: q.qw * rx + q.qx * rw + q.qy * rz - q.qz * ry,
      qy: q.qw * ry - q.qx * rz + q.qy * rw + q.qz * rx,
      qz: q.qw * rz + q.qx * ry - q.qy * rx + q.qz * rw,
      qw: q.qw * rw - q.qx * rx - q.qy * ry - q.qz * rz,
    };
    out.px = past.px + (now.px - past.px) * near;
    out.py = past.py + (now.py - past.py) * near;
    out.pz = past.pz + (now.pz - past.pz) * near;
    nlerp(past, now, near, out);
    return true;
  }
}
