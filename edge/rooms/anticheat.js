/*
 * anticheat.js: a room race's witness (docs/redesign/COMPLETENESS.md item
 * 62). A racer's client scores its own gates (src/game/race.js) and tells
 * the room each pass and its finish as times since the race's go
 * (edge/rooms/race.js). The room cannot see a gate as the client does, at
 * every physics step, but it holds the racer's own poses, 30 a second on
 * the room clock in the scene frame the gates stand in. So the room keeps
 * its own count of each racer's race from those poses, and a claim further
 * on than that count by the claimed time is refused: a lap that was not
 * flown, or a time faster than it was flown.
 *
 * THE ROOM'S COUNT IS NEVER SHORT OF THE CLIENT'S. Every number in it errs
 * toward the racer, so an honest race is never refused:
 *
 *   the gates     race.js's stations in flying order, counted as Race.pass
 *                 counts them (laps closed on the timing gate, gates into
 *                 the running lap with the start crossing), but a gate is
 *                 met by any pose segment that comes within reach of it:
 *                 the widest scoring box's depth (race.js CLASS_BOX), the
 *                 opening, and for a fixed wing PLANE_REACH of the
 *                 structure, as the client scores a plane
 *   between poses the aircraft flew no faster than safety.js
 *                 POSE_MAX_SPEED, so its path strays from the straight
 *                 segment by at most half that speed times the interval,
 *                 and that much slack is given
 *   gaps          an interval over midair.js GAP_MS, or a jump faster
 *                 than flight (a respawn), is one the room did not see:
 *                 the racer is given every gate it could have reached in
 *                 it at POSE_MAX_SPEED, in order (at most a lap of them
 *                 at no distance, where every gate's reach overlaps the
 *                 next one's)
 *   never back    the count never loses a gate: a wreck voids the
 *                 client's lap, not the room's count
 *   the window    a claim is held to the count at its time plus midair.js
 *                 LATE_MS, the room's slowest frame, since its time and
 *                 the poses' are both the client's estimate of the room
 *                 clock
 *
 * A claim past the racer's newest pose waits for the poses while the
 * racer is still sending them (core.js HERE_MS), and is then judged as if
 * the rest were a gap: a racer that stops sending is given what it could
 * have flown since its last pose. A racer that sent no pose this race is
 * not judged.
 *
 * WHAT A REFUSAL DOES. Nobody is kicked on one claim. A pass is dropped:
 * not held, not relayed, and the racer's next pass is judged on its own.
 * A finish is the racer's retirement from that race (race.js out
 * 'retired', a state every client already shows), because a race waits
 * for every racer to finish or be out. Each is counted (flags), in memory
 * only, for the checks.
 *
 * WHAT THIS DOES NOT JUDGE. A Trick Battle's numbers (edge/rooms/jam.js):
 * the trick detector needs every physics step, and the room has 30 Hz
 * poses (docs/JAM-PLAN.md, the trust boundary). Speed against each
 * airframe's own figures: `topSpeed` (configs/airframes.js) is level
 * flight on a fresh pack, a dive goes faster, the hangar's Power tab fits
 * stronger motors that the room's profile does not carry, and pose
 * velocity is over the ground, wind included. The one speed limit the
 * room keeps is POSE_MAX_SPEED, for every airframe.
 *
 * WHAT OWNS WHAT. The RoomRace owns one Witness (race.witness), inside one
 * RoomCore that runs one event at a time, so nothing here locks. Counts
 * are memory only: a room that hibernated had nobody racing, and a racer
 * the room has no count for is not judged.
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

import { CLASS_BOX, PLANE_REACH, Race, structureGap } from '../../src/game/race.js';
import { raceGatesOf } from '../../src/builder/course.js';
import { GAP_MS, LATE_MS } from '../../src/game/midair.js';
import { airframeById } from '../../configs/airframes.js';
import { POSE_MAX_SPEED } from './safety.js';
import { HERE_MS } from './core.js';

export const CLAIM_WINDOW_MS = LATE_MS;
export const GATE_DEPTH_M = Math.max(...Object.values(CLASS_BOX).map((b) => b.depth));
/* How finely a pose segment is searched for its nearest approach to a
 * gate; the search is never short by more than half of it, which is
 * added to the slack. */
const STEP_M = 0.1;
export const FLAG_LOG_MAX = 50;

/* How long a claim may wait for its racer's poses. A function, because
 * core.js imports this module through race.js and its HERE_MS is not there
 * yet while this one loads. */
export function waitMs() {
  return 4 * (HERE_MS + CLAIM_WINDOW_MS);
}

/* The reach a racer's gates are scored with: a fixed wing's, as the shell
 * and verify.js score a plane's lap, or none. */
export function reachOf(airframe) {
  const af = airframe ? airframeById(airframe) : null;
  return af && af.fixedWing ? PLANE_REACH : 0;
}

/* p in an opening's own frame: x across, y up from its centre, z along
 * the travel axis (race.js toLocal). */
function local(g, ap, p) {
  const dx = p.x - g.x;
  const dy = p.y - (g.y + ap.centreY);
  const dz = p.z - g.z;
  return {
    x: dx * g.ax.x + dy * g.ax.y + dz * g.ax.z,
    y: dx * g.ay.x + dy * g.ay.y + dz * g.ay.z,
    z: dx * g.az.x + dy * g.az.y + dz * g.az.z,
  };
}

/* How far p is from where gate g counts a pass, at `reach`. Never more
 * than the distance to the opening, so a structure race.js measures as
 * unreachable from one side (a turned pylon) still counts its opening. */
export function gateDistance(g, p, reach) {
  let best = Infinity;
  for (const ap of g.apertures) {
    const l = local(g, ap, p);
    const hw = ap.clearW * 0.5;
    const hh = ap.clearH * 0.5;
    const opening = ap.round
      ? Math.max(0, Math.hypot(l.x, l.y) - hw)
      : Math.hypot(Math.max(0, Math.abs(l.x) - hw), Math.max(0, Math.abs(l.y) - hh));
    const across = reach > 0 ? Math.min(opening, Math.max(0, structureGap(ap, l.x, l.y) - reach)) : opening;
    best = Math.min(best, Math.hypot(Math.max(0, Math.abs(l.z) - GATE_DEPTH_M), across));
  }
  return best;
}

/* Whether the segment a to b comes within `slack` of gate g. */
function meets(g, a, b, reach, slack) {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / STEP_M));
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    p.x = a.x + (b.x - a.x) * u;
    p.y = a.y + (b.y - a.y) * u;
    p.z = a.z + (b.z - a.z) * u;
    if (gateDistance(g, p, reach) <= slack + STEP_M / 2) {
      return true;
    }
  }
  return false;
}

/* The least distance from anywhere gate a counts to anywhere gate b
 * does: their centres less the furthest either counts from its own. */
function between(a, b, reach) {
  const radius = (g) => Math.max(...g.apertures.map((ap) => Math.abs(ap.centreY) + Math.hypot(ap.clearW / 2, ap.clearH / 2, GATE_DEPTH_M) + reach));
  return Math.max(0, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - radius(a) - radius(b));
}

export class Witness {
  constructor() {
    /* The race's stations in flying order, race.js's own (stationOf). */
    this.gates = [];
    this.timingIdx = 0;
    this.goAt = 0;
    /* seat -> the room's count of that racer's race:
     *   { reach, last, heard, next, started, laps, gate, leaving, log }
     * last its newest sample { t, x, y, z }, heard the room's ms that
     * came, next the station it is flying to, started, laps and gate what
     * Race.pass would have it at, and log every step of the count as
     * { t, laps, gate }. */
    this.seats = new Map();
    /* The claims decided since this room was made, and every one refused,
     * for the checks: { seat, kind, why, t }, the newest FLAG_LOG_MAX. */
    this.judged = 0;
    this.flags = [];
    this.flagged = 0;
  }

  /* A race starts on the room's track at goAt: the stations it is scored
   * on, and nobody counted yet. */
  start(doc, goAt) {
    this.seats.clear();
    this.goAt = goAt;
    try {
      const race = new Race(raceGatesOf(doc), 'full');
      this.gates = race.gates;
      this.timingIdx = race.timingIdx;
    } catch (e) {
      /* race.js roomTrack already raced this document: a throw here is a
       * track the room cannot read, and with no gates nothing is judged. */
      this.gates = [];
      this.timingIdx = 0;
    }
  }

  /* The station the count is flying to, passed at room ms t, as Race.pass
   * counts it. */
  step(c, t) {
    const passed = c.next;
    c.next = (passed + 1) % this.gates.length;
    if (passed === this.timingIdx) {
      if (c.started) {
        c.laps += 1;
      }
      c.started = true;
      c.gate = 1;
    } else if (c.started) {
      c.gate += 1;
    }
    c.log.push({ t, laps: c.laps, gate: c.gate });
  }

  /* Every station in order the racer could have reached from p in `ms` at
   * POSE_MAX_SPEED, each at the earliest it could have been, from room ms
   * t0. */
  unseen(c, p, t0, ms) {
    const n = this.gates.length;
    let left = POSE_MAX_SPEED * (ms / 1000);
    let cost = gateDistance(this.gates[c.next], p, c.reach);
    let free = 0;
    while (cost <= left && free < n) {
      left -= cost;
      const from = this.gates[c.next];
      this.step(c, t0 + (ms - (left / POSE_MAX_SPEED) * 1000));
      cost = between(from, this.gates[c.next], c.reach);
      free = cost === 0 ? free + 1 : 0;
    }
  }

  /* A racer's pose, at the room's ms roomNow, on airframe `airframe`. */
  sample(seat, airframe, p, roomNow) {
    if (!this.gates.length) {
      return;
    }
    let c = this.seats.get(seat);
    if (!c) {
      c = {
        reach: 0, last: null, heard: -Infinity, next: 0, started: false, laps: 0, gate: 0, leaving: false, log: [],
      };
      this.seats.set(seat, c);
    }
    /* A seat that changed aircraft mid race keeps the wider reach. */
    c.reach = Math.max(c.reach, reachOf(airframe));
    const b = { t: p.t, x: p.px, y: p.py, z: p.pz };
    const a = c.last;
    if (a && b.t <= a.t) {
      return;
    }
    c.last = b;
    c.heard = roomNow;
    if (!a || b.t <= this.goAt) {
      return;
    }
    const dt = b.t - a.t;
    if (dt > GAP_MS || Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > POSE_MAX_SPEED * (dt / 1000)) {
      this.unseen(c, a, a.t, dt);
      return;
    }
    /* On a one gate course the gate just passed counts again only once
     * the racer has been seen out of its reach (race.js judge, leaving). */
    if (c.leaving) {
      c.leaving = gateDistance(this.gates[c.next], b, c.reach) === 0;
      return;
    }
    if (meets(this.gates[c.next], a, b, c.reach, (POSE_MAX_SPEED * (dt / 1000)) / 2)) {
      this.step(c, b.t);
      c.leaving = this.gates.length === 1;
    }
  }

  /*
   * One claim, { seat, at, finish, laps, gate, heardAt }: the room ms of
   * the crossing claimed, the laps closed and the gate the client says it
   * is at then (a finish: its laps), and the room ms it arrived. 'ok',
   * 'wait', or the refusal's reason. A claim waits no longer than
   * waitMs(), whatever its racer keeps sending.
   */
  judge(claim, roomNow) {
    const c = this.seats.get(claim.seat);
    if (!this.gates.length || !c || !c.last) {
      return 'ok';
    }
    const by = claim.at + CLAIM_WINDOW_MS;
    /* The count only grows, so a claim it already reaches is decided now. */
    if (this.reaches(c.log, by, claim)) {
      return 'ok';
    }
    if (c.last.t >= by) {
      return claim.finish ? 'laps_not_flown' : 'gate_not_flown';
    }
    if (roomNow - c.heard <= HERE_MS && roomNow - claim.heardAt <= waitMs()) {
      return 'wait';
    }
    /* What it could have flown since its newest pose, on a copy. */
    const ahead = { ...c, log: [] };
    this.unseen(ahead, c.last, c.last.t, by - c.last.t);
    if (this.reaches([...c.log, ...ahead.log], by, claim)) {
      return 'ok';
    }
    return claim.finish ? 'laps_not_flown' : 'gate_not_flown';
  }

  /* Whether the count in `log` by room ms `by` is as far on as the claim. */
  reaches(log, by, claim) {
    let count = { laps: 0, gate: 0 };
    for (const e of log) {
      if (e.t > by) {
        break;
      }
      count = e;
    }
    if (claim.finish) {
      return count.laps >= claim.laps;
    }
    return count.laps > claim.laps || (count.laps === claim.laps && count.gate >= claim.gate);
  }

  /* A claim decided: counted, and a refusal kept. */
  record(claim, verdict) {
    this.judged += 1;
    if (verdict === 'ok') {
      return;
    }
    this.flagged += 1;
    this.flags.push({ seat: claim.seat, kind: claim.finish ? 'finish' : 'pass', why: verdict, t: claim.at });
    if (this.flags.length > FLAG_LOG_MAX) {
      this.flags.shift();
    }
  }
}
