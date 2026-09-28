/*
 * referee.js: a room's mid air referee (docs/MULTIPLAYER-PLAN.md section
 * 6, Phase 3). The rule is src/game/midair.js; this is the room's side of
 * it: every seat's samples, how far each pair has been judged, and the one
 * `hit` a contact sends to the room.
 *
 * WHEN A PAIR IS JUDGED. On every POSE that arrives, over the room
 * milliseconds both seats now cover and nobody has judged yet: (f, t1],
 * f the pair's frontier, t1 the older of the two newest samples. The
 * frontier moves on the whole millisecond, so how the milliseconds are
 * cut into calls changes nothing about the answer, and so arrival times
 * never decide whether a hit happened, only when it is known (section 6.6,
 * promises 1 and 2). On every room tick the frontier is also moved up to
 * LATE_MS behind the room clock: what a seat has not covered by then is
 * judged as no contact, and a late sample for it is never judged
 * (promise 3). A friendly room (the lead's answer to section 14, question
 * 1) judges nothing: its pilots pass through each other as ghosts.
 *
 * WHAT OWNS WHAT. The RoomCore owns this object (core.referee); a Durable
 * Object runs one event at a time, so nothing here is shared. None of it
 * is written to storage or an attachment: samples are seconds old at most,
 * and a room that hibernated had nobody flying.
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

import { decodePose } from '../../src/share/roomwire.js';
import {
  COOLDOWN_MS, LATE_MS, Track, hitMessage, hullFor, judge,
} from '../../src/game/midair.js';

/* A sample stamped further than this into the room's future is a clock
 * gone wrong, not a pose: dropped. */
export const AHEAD_MS = 250;

export class Referee {
  constructor(friendly) {
    this.friendly = Boolean(friendly);
    this.seats = new Map(); /* seat -> { airframe, hull, track } */
    this.pairs = new Map(); /* 'a:b', a < b -> { f, quiet } */
    this.nextId = 1;
    /* For the checks: every hit this room has sent. */
    this.log = [];
  }

  pair(a, b) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    let p = this.pairs.get(key);
    if (!p) {
      p = { f: -Infinity, quiet: -Infinity };
      this.pairs.set(key, p);
    }
    return p;
  }

  /* A seat's airframe, on its hello and on every profile. A new airframe
   * is a new aircraft: its old samples are not its shape. */
  seat(seat, airframe) {
    const had = this.seats.get(seat);
    if (had && had.airframe === airframe) {
      return;
    }
    this.seats.set(seat, { airframe, hull: hullFor(airframe), track: new Track() });
  }

  leave(seat) {
    this.seats.delete(seat);
    for (const key of [...this.pairs.keys()]) {
      const [a, b] = key.split(':').map(Number);
      if (a === seat || b === seat) {
        this.pairs.delete(key);
      }
    }
  }

  /*
   * A POSE message from `seat`, at room time roomNow. Returns the hit
   * messages it decided, [] almost always.
   */
  pose(seat, bytes, roomNow) {
    const s = this.seats.get(seat);
    if (this.friendly || !s || !s.hull) {
      return [];
    }
    const p = decodePose(bytes);
    if (!p || p.t > roomNow + AHEAD_MS || !s.track.push(p)) {
      return [];
    }
    const out = [];
    for (const [other, o] of this.seats) {
      if (other === seat || !o.hull) {
        continue;
      }
      const [a, b] = seat < other ? [seat, other] : [other, seat];
      const sa = a === seat ? s : o;
      const sb = a === seat ? o : s;
      const pr = this.pair(a, b);
      const t1 = Math.min(sa.track.newest(), sb.track.newest());
      if (!(t1 > pr.f)) {
        continue;
      }
      /* The first judgement of a pair starts at the older stream's start. */
      const t0 = Number.isFinite(pr.f) ? Math.max(pr.f, pr.quiet) : Math.max(sa.track.s[0].t, sb.track.s[0].t, pr.quiet);
      const c = t1 > t0 ? judge(sa.hull, sb.hull, sa.track, sb.track, t0, t1) : null;
      pr.f = Math.floor(t1);
      if (!c) {
        continue;
      }
      pr.quiet = c.tc + COOLDOWN_MS;
      pr.f = Math.max(pr.f, c.tc);
      const hit = hitMessage(this.nextId, c, a, b, sa.hull, sb.hull);
      this.nextId += 1;
      this.log.push({ ...hit, decided: roomNow });
      out.push(hit);
    }
    return out;
  }

  /* The room tick: nothing is waited for past LATE_MS. */
  tick(roomNow) {
    const cut = Math.floor(roomNow - LATE_MS);
    for (const p of this.pairs.values()) {
      if (p.f < cut) {
        p.f = cut;
      }
    }
  }
}
