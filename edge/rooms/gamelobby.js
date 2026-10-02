/*
 * gamelobby.js: the lobby of a room made for a game (meta.mode 'war',
 * 'combat' or 'tag'), between its rounds: who is ready, and when the next
 * one starts.
 *
 * The owner, 2026-10-01: "its not hard to make people join a lobby and
 * then start a mission, its on every single game", and on 2026-10-02, of
 * Toilet paper combat and Catch the Ace: "when i click on them directly, it
 * should take me to the lobby of the room". Every pilot in the room says
 * ready or not. The room starts its game through the game's own start, as
 * its host would (war.js, combat.js, tag.js):
 *
 *   all ready      every pilot here is ready, and there are at least the
 *                  game's fewest players here (core.js games(): one for
 *                  the war, two for combat and tag): in
 *                  LOBBY_COUNTDOWN_MS. A pilot who says not ready in that
 *                  time stops it; one who joins in it is not ready and does
 *                  not stop it.
 *   the deadline   LOBBY_DEADLINE_MS after the game's fewest players are
 *                  ready, the room starts with whoever is ready then. With
 *                  fewer ready than that (a leave, a not ready) both times
 *                  fall, and a lone pilot in a combat or tag room who says
 *                  ready waits for a second: those games need two, and the
 *                  game's own start would refuse one. Counting from the
 *                  ready and not from the room's making, so an empty or
 *                  idle room never starts on its own.
 *   start now      the host's own start of the game, at once, as ever.
 *
 * A round on has no lobby: a pilot who joins then is in it (war.js late
 * join; combat.js seat() gives a newcomer paper; tag.js pose() makes a
 * newcomer a hunter). When the round starts every flag is cleared, so its
 * end finds the room back in the lobby with nobody ready. A combat room's
 * results still count down to its next round on their own (combat.js
 * continuous play), until the clients that draw this lobby are out.
 *
 * Race is not here: a race needs a track picked and a grid start, so there
 * is no round to join while it runs; its rooms keep the host's start.
 *
 * WHAT THE ROUND IS. Each game's lobby carries the one thing its host sets
 * between rounds, kept on the room (core.meta) so a restart keeps it: the
 * war its mission, combat its minutes (combat.js ROUND_MINUTES), tag its
 * goal (src/share/roomtag.js). A room made without one starts with the
 * first.
 *
 * What a client sends: { type: 'lobby', op: 'ready', ready } from any
 * pilot; from the host, between rounds, { type: 'lobby', op: 'mission',
 * mission } in a war room, { op: 'minutes', minutes } in a combat room,
 * { op: 'goal', goal } in a tag room. What it is told: { type: 'lobby',
 * lobby } whenever the lobby changes, and `lobby` in the welcome:
 *
 *   { mission | minutes | goal, ready: { [seat]: true }, countdownAt, deadlineAt }
 *
 * the two times on the room clock (ms), or null. A build from before this
 * passes over the type. The flags and times are the room's memory only: a
 * restart of the rooms server starts them again with nobody ready.
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
import { GOALS, GOAL_MAX, GOAL_MIN } from '../../src/share/roomtag.js';
import { ROUND_MINUTES } from './combat.js';

export const LOBBY_COUNTDOWN_MS = 5000;
export const LOBBY_DEADLINE_MS = 45000;

/* The war's mission: the room's own, else the first on its map. */
function warMission(core) {
  const id = core.meta.mission;
  if (typeof id === 'string' && Object.hasOwn(MISSIONS, id) && MISSIONS[id].map === core.meta.map) {
    return id;
  }
  const first = Object.values(MISSIONS).find((m) => m.map === core.meta.map);
  return first ? first.id : null;
}

/*
 * The games a lobby runs, by meta.mode: the one setting the host chooses
 * (its key on the wire and on core.meta, its value now, whether a value
 * may be set), whether a round is on, and the round's start as the host
 * would make it.
 */
const GAMES = {
  war: {
    key: 'mission',
    value: warMission,
    valid: (core, v) => typeof v === 'string' && Object.hasOwn(MISSIONS, v) && MISSIONS[v].map === core.meta.map,
    on: (core) => core.war.on(),
    start: (core, conn, s, v, now) => core.war.message(core, conn, s, { type: 'war', op: 'start', mission: v, intro: true }, now),
  },
  combat: {
    key: 'minutes',
    value: (core) => (ROUND_MINUTES.includes(core.meta.minutes) ? core.meta.minutes : ROUND_MINUTES[0]),
    valid: (core, v) => ROUND_MINUTES.includes(v),
    on: (core) => core.combat.on(),
    start: (core, conn, s, v, now) => core.combat.message(core, conn, s, { type: 'combat', op: 'start', minutes: v }, now),
  },
  tag: {
    key: 'goal',
    value: (core) => (Number.isInteger(core.meta.goal) && core.meta.goal >= GOAL_MIN && core.meta.goal <= GOAL_MAX ? core.meta.goal : GOALS[0].goal),
    valid: (core, v) => Number.isInteger(v) && v >= GOAL_MIN && v <= GOAL_MAX,
    on: (core) => core.tag.on(),
    start: (core, conn, s, v, now) => core.tag.message(core, conn, s, { type: 'tag', op: 'start', goal: v }, now),
  },
};

export class RoomGameLobby {
  constructor() {
    /* seat -> true, for the pilots here who said ready. */
    this.ready = new Set();
    this.countdownAt = null;
    this.deadlineAt = null;
  }

  /* The room's game, when it was made for one with a lobby, else null. */
  game(core) {
    return Object.hasOwn(GAMES, core.meta.mode) ? GAMES[core.meta.mode] : null;
  }

  /* A room made for a game, between its rounds. */
  open(core) {
    const g = this.game(core);
    return Boolean(g) && !g.on(core);
  }

  /* The fewest players the game is played with, as the room counts them
   * (core.js games()). */
  min(core) {
    const g = core.games(0).find((x) => x.id === core.meta.mode);
    return g ? g.min : 1;
  }

  view(core) {
    const g = this.game(core);
    return {
      [g.key]: g.value(core),
      ready: Object.fromEntries([...this.ready].map((seat) => [seat, true])),
      countdownAt: this.countdownAt,
      deadlineAt: this.deadlineAt,
    };
  }

  welcome(core) {
    return this.game(core) ? { lobby: this.view(core) } : {};
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
    const min = this.min(core);
    if (this.ready.size < min) {
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
    const g = this.game(core);
    if (msg.op === g.key) {
      if (s.seat !== core.host()) {
        return [{ send: conn, data: JSON.stringify({ type: 'refused', why: 'host' }) }];
      }
      if (!g.valid(core, msg[g.key])) {
        return [];
      }
      core.meta[g.key] = msg[g.key];
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
    if (!this.game(core)) {
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
    const g = this.game(core);
    if (!g) {
      return [];
    }
    if (g.on(core)) {
      /* A round started, by the host's Start now or by the lobby: nobody
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
    if (this.ready.size < this.min(core)) {
      this.clear();
      return this.changed(core);
    }
    return this.start(core, now);
  }

  /* The room's round, started as its host would. */
  start(core, now) {
    const g = this.game(core);
    const host = [...core.seats].find(([, s]) => s.seat === core.host());
    const v = g.value(core);
    this.clear();
    if (!host || v == null) {
      return this.changed(core);
    }
    const [conn, s] = host;
    return [...g.start(core, conn, s, v, now), ...this.changed(core)];
  }
}
