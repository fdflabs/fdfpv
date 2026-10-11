/*
 * roomfoot.js: the pilot on foot, in a room (docs/ON-FOOT.md). This pilot
 * tells the room where they stand (roomwire.js FOOT), and the others' are
 * drawn where they stand, walking between samples (src/render/peers.js
 * buildPilotFigure stride). No three.js and no DOM, so both ends are
 * checked in Node (scripts/rooms-selftest-foot.js).
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

import { FOOT_HANGAR, FOOT_HZ, FOOT_ON, encodeFoot } from './roomwire.js';

/* ms between sends while flying from a walked spot: the figure only
 * stands there, and this says it is still meant. */
export const FOOT_SPOT_MS = 1000;
/* ms without a FOOT after which a figure goes back to its station: the
 * sender's slowest cadence missed twice and a half. */
export const FOOT_STALE_MS = 2500;
/* ms a figure takes to reach the newest sample: one sample's gap, so it
 * walks on steadily between them. */
const EASE_MS = 1000 / FOOT_HZ;
/* m: a sample further than this from the drawn figure is a move (the
 * flight line, a restart), not a walk: the figure is put there. */
const SNAP_M = 10;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/*
 * The sender. link is the room link (src/share/rooms.js); source() is
 * where this pilot stands: { flags, x, y, z, heading } with flags FOOT_ON
 * and FOOT_HANGAR, flags 0 for a walked spot flown from, or null at the
 * station. frame(wallMs) once a frame.
 */
export function createFootSender(link, source) {
  let nextAt = 0;
  let lastFlags = -1;
  let lastBytes = null;

  function frame(wallMs) {
    const f = source();
    if (!f) {
      lastFlags = -1;
      lastBytes = null;
      return;
    }
    const moving = (f.flags & (FOOT_ON | FOOT_HANGAR)) !== 0;
    if (f.flags === lastFlags && wallMs < nextAt) {
      return;
    }
    /* On the cadence's own clock, so frames that do not divide it do not
     * stretch it; a change, or a stall longer than a period, starts it
     * again from now. */
    const period = moving ? 1000 / FOOT_HZ : FOOT_SPOT_MS;
    nextAt = f.flags === lastFlags && wallMs - nextAt < period ? nextAt + period : wallMs + period;
    lastFlags = f.flags;
    lastBytes = encodeFoot(f);
    link.sendBinary(lastBytes);
  }

  /* After a reconnect: the room has a new seat record, say it again. */
  function resend() {
    if (lastBytes) {
      link.sendBinary(lastBytes);
    }
  }

  return { frame, resend };
}

/*
 * A peer's feet as drawn: push(sample, wallMs) on each FOOT_RELAY,
 * draw(wallMs) once a frame, drawn() for a check. draw returns null when
 * no FOOT is fresh (the figure stands at its station), else { x, y, z,
 * heading, flags, moved }, moved being the metres walked since the last
 * draw.
 */
export function createFootTrack() {
  let last = null;
  let lastAt = -Infinity;
  const from = { x: 0, y: 0, z: 0, heading: 0 };
  const drawn = { x: 0, y: 0, z: 0, heading: 0, flags: 0, moved: 0 };
  let shown = false;
  /* Where the last frame drew it, for the metres walked since. */
  let prevX = 0;
  let prevZ = 0;

  /* Where the figure is at wallMs, eased from `from` to the newest. */
  function place(wallMs) {
    const k = Math.min(1, (wallMs - lastAt) / EASE_MS);
    drawn.x = from.x + (last.x - from.x) * k;
    drawn.y = from.y + (last.y - from.y) * k;
    drawn.z = from.z + (last.z - from.z) * k;
    drawn.heading = wrapAngle(from.heading + wrapAngle(last.heading - from.heading) * k);
    drawn.flags = last.flags;
  }

  function push(s, wallMs) {
    /* Eased on from where it is drawn at this moment, not the last frame. */
    if (shown) {
      place(wallMs);
    }
    if (!shown || Math.hypot(s.x - drawn.x, s.z - drawn.z) > SNAP_M) {
      Object.assign(drawn, { x: s.x, y: s.y, z: s.z, heading: s.heading });
      prevX = s.x;
      prevZ = s.z;
    }
    from.x = drawn.x;
    from.y = drawn.y;
    from.z = drawn.z;
    from.heading = drawn.heading;
    last = s;
    lastAt = wallMs;
    shown = true;
  }

  function draw(wallMs) {
    if (!last || wallMs - lastAt > FOOT_STALE_MS) {
      shown = false;
      return null;
    }
    place(wallMs);
    drawn.moved = Math.hypot(drawn.x - prevX, drawn.z - prevZ);
    prevX = drawn.x;
    prevZ = drawn.z;
    return drawn;
  }

  /* As last drawn, a copy, or null; for a check. */
  const peek = () => (shown ? { ...drawn } : null);

  return { push, draw, drawn: peek };
}
