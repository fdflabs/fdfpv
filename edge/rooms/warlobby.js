/*
 * warlobby.js: the lobby of a room made for the war (meta.mode 'war'),
 * between its matches: who is ready, and when the mission starts.
 *
 * The owner, 2026-10-01: "its not hard to make people join a lobby and
 * then start a mission, its on every single game". Every pilot in the room
 * says ready or not. The room starts the room's mission (meta.mission)
 * through the war's own start (war.js, briefing then countdown then live):
 *
 *   all ready      every pilot here is ready (one or more): in
 *                  LOBBY_COUNTDOWN_MS. A pilot who says not ready in that
 *                  time stops it; one who joins in it is not ready and does
 *                  not stop it.
 *   the deadline   LOBBY_DEADLINE_MS after the first pilot said ready, the
 *                  room starts with whoever is ready then, or, if nobody
 *                  is, forgets it. Counting from the first ready and not
 *                  from the room's making, so an empty or idle room never
 *                  starts on its own.
 *   start now      the host's war start (war.js), at once, as ever.
 *
 * A match on (war.on()) has no lobby: a pilot who joins then is in it
 * (war.js late join). When the match starts every flag is cleared, so its
 * end finds the room back in the lobby with nobody ready.
 *
 * What a client sends: { type: 'lobby', op: 'ready', ready } from any
 * pilot, { type: 'lobby', op: 'mission', mission } from the host (the
 * room's mission, between matches). What it is told: { type: 'lobby',
 * lobby } whenever the lobby changes, and `lobby` in the welcome:
 *
 *   { mission, ready: { [seat]: true }, countdownAt, deadlineAt }
 *
 * the two times on the room clock (ms), or null. A build from before this
 * passes over the type. The lobby is the room's memory only: a restart of
 * the rooms server starts it again with nobody ready.
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

import { MISSIONS } from '../../src/share/war/missions/index.js';

export const LOBBY_COUNTDOWN_MS = 5000;
export const LOBBY_DEADLINE_MS = 45000;

export class RoomWarLobby {
  constructor() {
    /* seat -> true, for the pilots here who said ready. */
    this.ready = new Set();
    this.countdownAt = null;
    this.deadlineAt = null;
  }

  /* A room made for the war, between its matches. */
  open(core) {
    return core.meta.mode === 'war' && !core.war.on();
  }

  /* The room's mission: its own, else the first on its map. */
  mission(core) {
    const id = core.meta.mission;
    if (typeof id === 'string' && Object.hasOwn(MISSIONS, id) && MISSIONS[id].map === core.meta.map) {
      return id;
    }
    const first = Object.values(MISSIONS).find((m) => m.map === core.meta.map);
    return first ? first.id : null;
  }

  view(core) {
    return {
      mission: this.mission(core),
      ready: Object.fromEntries([...this.ready].map((seat) => [seat, true])),
      countdownAt: this.countdownAt,
      deadlineAt: this.deadlineAt,
    };
  }

  welcome(core) {
    return core.meta.mode === 'war' ? { lobby: this.view(core) } : {};
  }

  changed(core) {
    const data = JSON.stringify({ type: 'lobby', lobby: this.view(core) });
    return [...core.seats.keys()].map((conn) => ({ send: conn, data }));
  }

  /* Whether the room's clock must run for a time to come. */
  waiting(core) {
    return this.open(core) && (this.countdownAt != null || this.deadlineAt != null);
  }

  clear() {
    this.ready.clear();
    this.countdownAt = null;
    this.deadlineAt = null;
  }

  /* The times, after the flags changed. `arm`: a ready or a leave, which
   * may start or stop the five seconds; a join only keeps them as they
   * are. */
  settle(core, now, arm) {
    const here = new Set([...core.seats.values()].map((s) => s.seat));
    for (const seat of this.ready) {
      if (!here.has(seat)) {
        this.ready.delete(seat);
      }
    }
    if (!this.ready.size) {
      this.countdownAt = null;
      this.deadlineAt = null;
      return;
    }
    const roomNow = Math.ceil(core.roomMs(now));
    this.deadlineAt ??= roomNow + LOBBY_DEADLINE_MS;
    if (!arm) {
      return;
    }
    const all = [...here].every((seat) => this.ready.has(seat));
    if (!all) {
      this.countdownAt = null;
    } else if (this.countdownAt == null) {
      this.countdownAt = roomNow + LOBBY_COUNTDOWN_MS;
    }
  }

  message(core, conn, s, msg, now) {
    if (!this.open(core)) {
      return [];
    }
    if (msg.op === 'ready' && typeof msg.ready === 'boolean') {
      if (msg.ready === this.ready.has(s.seat)) {
        return [];
      }
      if (msg.ready) {
        this.ready.add(s.seat);
      } else {
        this.ready.delete(s.seat);
      }
      this.settle(core, now, true);
      return this.changed(core);
    }
    if (msg.op === 'mission') {
      const id = msg.mission;
      if (s.seat !== core.host()) {
        return [{ send: conn, data: JSON.stringify({ type: 'refused', why: 'host' }) }];
      }
      if (typeof id !== 'string' || !Object.hasOwn(MISSIONS, id) || MISSIONS[id].map !== core.meta.map) {
        return [];
      }
      core.meta.mission = id;
      return [{ store: 'meta', value: core.meta }, ...this.changed(core)];
    }
    return [];
  }

  /* A pilot joined: not ready, and the five seconds go on. */
  join(core, now) {
    if (!this.open(core)) {
      return [];
    }
    this.settle(core, now, false);
    return this.changed(core);
  }

  leave(core, seat, now) {
    if (core.meta.mode !== 'war') {
      return [];
    }
    this.ready.delete(seat);
    if (!this.open(core) || !core.seats.size) {
      return [];
    }
    this.settle(core, now, true);
    return this.changed(core);
  }

  tick(core, now) {
    if (core.meta.mode !== 'war') {
      return [];
    }
    if (core.war.on()) {
      /* A match started, by the host's Start now or by the lobby: nobody
       * is ready for the next one yet. */
      if (this.ready.size || this.countdownAt != null || this.deadlineAt != null) {
        this.clear();
        return this.changed(core);
      }
      return [];
    }
    const roomNow = core.roomMs(now);
    const due = (this.countdownAt != null && roomNow >= this.countdownAt)
      || (this.deadlineAt != null && roomNow >= this.deadlineAt);
    if (!due) {
      return [];
    }
    if (!this.ready.size) {
      this.clear();
      return this.changed(core);
    }
    return this.start(core, now);
  }

  /* The room's mission, started as its host would (war.js start). */
  start(core, now) {
    const host = [...core.seats].find(([, s]) => s.seat === core.host());
    const mission = this.mission(core);
    this.clear();
    if (!host || !mission) {
      return this.changed(core);
    }
    const [conn, s] = host;
    const out = core.war.message(core, conn, s, { type: 'war', op: 'start', mission, intro: true }, now);
    return [...out, ...this.changed(core)];
  }
}
