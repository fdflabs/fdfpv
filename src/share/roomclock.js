/*
 * roomclock.js: this page's estimate of a room's clock (src/share/rooms.js
 * pings, edge/rooms/core.js answers).
 *
 * WHY IT HAS TO BE GOOD. Every POSE is stamped on the room clock, and the
 * referee (src/game/midair.js) places an aircraft where its stamp says it
 * was. A stamp e ms off puts it v e metres off its true path: 5 ms at
 * 50 m/s is 25 cm, five times the depth a mid air is judged on, and the
 * audit (scripts/collide-audit-air.js) measured crossing passes missing
 * up to 84 percent at 20 ms. The error that made those numbers was not the
 * network: it was one estimate taken from eight pings at a join, and a
 * page whose frames are slow reads a reply only when its frame ends, so
 * every one of the eight looked late by a slice of a frame.
 *
 * HOW. Each ping is an NTP exchange: the page's send time c, the room's
 * time s, the page's receive time r; the offset is s - c less half the
 * round trip r - c, wrong by half of whatever made one leg longer than
 * the other. The two halves are filtered apart. s - c, the way out, is
 * clean even on a busy page, since a ping goes out when a timer fires,
 * which is when the page is free: the least of the last WINDOW is the
 * fastest way out, and tracks drift. The round trip is not: a reply that
 * lands mid frame waits for the frame, so the least of the last RTT_KEEP
 * is used, and shorter still the room's own measure of the socket's
 * round trip where it sends one (edge/rooms/node.js, a ping frame the
 * browser answers below the page). Pings come every TRACK_MS, dithered,
 * for as long as the room is open. The first SYNC_PINGS, a quarter second
 * apart, set the clock outright; after that it is slewed toward the
 * estimate at most SLEW_PER_S, so a peer drawn from these stamps never
 * jumps, and only an error past STEP_MS (a machine that slept) is stepped.
 *
 * The room answers with Date.now(), whole milliseconds, so its time was
 * anywhere in the millisecond it names: half of one is added to a whole
 * number. (The whole one, the millisecond's end, is the bound the least
 * of many cut answers tends to, and was measured: 0.6 to 1.0 ms at p95 on
 * the modelled LAN against 0.4 to 0.5 with the half.) A room that
 * answers with a fraction is taken as it is.
 *
 * ACCURACY, measured by scripts/roomclock-check.js (npm run rooms:clock)
 * against the real server on this machine's loopback, and over a modelled
 * LAN and internet with a page at 60 fps and at 5 fps busy for 90 percent
 * of each frame. The target, met on all of them: under 2 ms at p95 on a
 * LAN at any frame rate (0.5 ms modelled, 0.4 ms on the loopback); over
 * the internet within 1 ms of half the asymmetry of the two legs, which no
 * page can see (NTP has the same limit): 2.3 and 2.6 ms modelled on 2 ms
 * of asymmetry, where the clock before was 5.5 ms at 60 fps and 80 ms at
 * 5 fps. Without the room's round trip (the Durable Object) a busy page
 * over the internet is as far off as before: its replies all wait behind
 * its frames.
 *
 * Plain arithmetic on numbers, no DOM: the check runs this file in Node.
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

/* The pings on joining, and the gap between them. */
export const SYNC_PINGS = 8;
export const SYNC_GAP_MS = 250;
/* A ping this often after that, while the room is open, give or take. */
export const TRACK_MS = 2000;
export const DITHER_MS = 100;
/* The exchanges the earliest arrival is chosen from, the last 16 s, and
 * the round trips the shortest is chosen from, the last two minutes. */
export const WINDOW = 8;
export const RTT_KEEP = 64;
/* How fast the clock is moved toward the estimate, ms per second: 0.2
 * percent, which no pilot sees in a peer's speed. */
export const SLEW_PER_S = 2;
/* An error this large is stepped, not slewed. */
export const STEP_MS = 250;

export class RoomClock {
  /* random() in [0, 1), for the pings' dither; the check passes a seeded
   * one. */
  constructor(random = Math.random) {
    this.random = random;
    this.reset();
  }

  /* Nothing known: a room left. */
  reset() {
    this.resync();
    /* The best estimate, and the offset in use (room = page + offset),
     * and the page time the offset was last moved at. */
    this.target = null;
    this.offset = null;
    this.at = 0;
  }

  /* A new socket to the room (a welcome, a reconnect): its exchanges start
   * again and set the clock outright, but the clock in use stays until
   * the first of them, so the page is never without one. */
  resync() {
    /* The last WINDOW exchanges' room time less send time, and the last
     * RTT_KEEP round trips. */
    this.fwd = [];
    this.rtts = [];
    this.n = 0;
  }

  /* The time to the next ping, after the n answered so far. The tracking
   * pings are dithered by up to DITHER_MS: a page whose frames are a
   * whole fraction of TRACK_MS would otherwise send every ping at the same
   * point of its frame, and every reply would land in the same busy part
   * of a later one. */
  nextPingMs() {
    return this.n < SYNC_PINGS - 1 ? SYNC_GAP_MS : TRACK_MS + this.random() * DITHER_MS;
  }

  /*
   * One exchange: the page sent at c, the room said s, the page read it at
   * r, all ms (c and r on the page's clock). Returns false for one that
   * cannot be an exchange.
   */
  sample(c, s, r, netRtt = null) {
    const rtt = r - c;
    if (!(rtt >= 0) || !Number.isFinite(s)) {
      return false;
    }
    if (Number.isFinite(netRtt) && netRtt >= 0) {
      this.rtts.push(netRtt);
    }
    this.fwd.push(s + (Number.isInteger(s) ? 0.5 : 0) - c);
    if (this.fwd.length > WINDOW) {
      this.fwd.shift();
    }
    this.rtts.push(rtt);
    if (this.rtts.length > RTT_KEEP) {
      this.rtts.shift();
    }
    this.n += 1;
    this.advance(r);
    this.target = Math.min(...this.fwd) - this.bestRtt() / 2;
    if (this.offset == null || this.n <= SYNC_PINGS || Math.abs(this.target - this.offset) > STEP_MS) {
      this.offset = this.target;
    }
    return true;
  }

  /* Slew the offset toward the estimate up to page time t. */
  advance(t) {
    if (this.offset == null) {
      this.at = t;
      return;
    }
    const dt = t - this.at;
    if (dt > 0) {
      const most = (SLEW_PER_S * dt) / 1000;
      this.offset += Math.max(-most, Math.min(most, this.target - this.offset));
      this.at = t;
    }
  }

  /* The room clock at page time t, ms, or null before any exchange. */
  roomAt(t) {
    if (this.offset == null) {
      return null;
    }
    this.advance(t);
    return t + this.offset;
  }

  /* The shortest round trip in the window, ms: what the error is bounded
   * by half of. */
  bestRtt() {
    return Math.min(...this.rtts);
  }
}
