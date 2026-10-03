/*
 * gamelobby.js: the lobby of every room, between its rounds: who is ready,
 * and when the next one starts. A room is made for a game (meta.mode
 * 'war', 'combat', 'tag' or 'race') or for free flight (meta.mode null).
 *
 * The owner, 2026-10-01: "its not hard to make people join a lobby and
 * then start a mission, its on every single game"; on 2026-10-02, of
 * Toilet paper combat and Catch the Ace: "when i click on them directly, it
 * should take me to the lobby of the room"; and the same day: "every click
 * will take you to the lobby for it, ready to go either single or multi".
 * Every pilot in the room says ready or not. The room starts its round
 * through the game's own start, as its host would (war.js, combat.js,
 * tag.js, race.js), or, for free flight, by saying its pilots fly:
 *
 *   all ready      every pilot here is ready, one alone as well: in
 *                  LOBBY_COUNTDOWN_MS. A pilot who says not ready in that
 *                  time stops it; one who joins in it is not ready and does
 *                  not stop it.
 *   the deadline   LOBBY_DEADLINE_MS after the first ready, the room starts
 *                  with whoever is ready then, or, if nobody is, forgets
 *                  it. Counting from the first ready and not from the
 *                  room's making, so an empty or idle room never starts on
 *                  its own.
 *   start now      the host's own start of the game, at once, as ever.
 *
 * A race needs its track first (the host's, race.js load), and a pilot on
 * its grid (race.js ready: the track's world built under the lobby
 * screen): until then the flags are kept and no time runs, and the times
 * are settled again when a pilot comes onto the grid (core.js).
 *
 * A round on has no lobby: a pilot who joins then is in it (war.js late
 * join; combat.js seat() gives a newcomer paper; tag.js pose() makes a
 * newcomer a hunter; free flight is just flying). A race on is the one
 * that cannot be joined: it went off a grid, and its racers were the ones
 * on it. When the round starts every flag is cleared, so its end finds the
 * room back in the lobby with nobody ready. Free flight has no end: its
 * round is on from its first start until the room is empty.
 *
 * WHAT THE ROUND IS. Each game's lobby carries the one thing its host sets
 * between rounds, kept on the room (core.meta) so a restart keeps it: the
 * war its mission, combat its minutes (combat.js ROUND_MINUTES), tag its
 * goal (src/share/roomtag.js). A room made without one starts with the
 * first. A race's track is its own (the host's { type: 'track' }), and
 * shown here as `track`, its id or null; free flight has `live`.
 *
 * What a client sends: { type: 'lobby', op: 'ready', ready } from any
 * pilot; from the host, between rounds, { type: 'lobby', op: 'mission',
 * mission } in a war room, { op: 'minutes', minutes } in a combat room,
 * { op: 'goal', goal } in a tag room. What it is told: { type: 'lobby',
 * lobby } whenever the lobby changes, and `lobby` in the welcome:
 *
 *   { mission | minutes | goal | track | live, ready: { [seat]: true }, countdownAt, deadlineAt }
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

/* The lost match's stage the lobby's mission restarts from, or null. */
function warCheckpoint(core) {
  const id = warMission(core);
  return id ? core.war.checkpointOf(MISSIONS[id]) : null;
}

/* The war's mission: the room's own, else the first on its map. */
function warMission(core) {
  const id = core.meta.mission;
  if (typeof id === 'string' && Object.hasOwn(MISSIONS, id) && MISSIONS[id].map === core.meta.map) {
    return id;
  }
  const first = Object.values(MISSIONS).find((m) => m.map === core.meta.map);
  return first ? first.id : null;
}

const combatMinutes = (core) => (ROUND_MINUTES.includes(core.meta.minutes) ? core.meta.minutes : ROUND_MINUTES[0]);
const tagGoal = (core) => (Number.isInteger(core.meta.goal) && core.meta.goal >= GOAL_MIN && core.meta.goal <= GOAL_MAX ? core.meta.goal : GOALS[0].goal);

/*
 * The games a lobby runs, by meta.mode (null is free flight): the one
 * setting the host chooses between rounds (`set`: its key on the wire and
 * on core.meta, and whether a value may be set), what the lobby shows of
 * the round (`show`), whether the round can start (`can`) and whether one
 * is on, and the round's start as the host would make it. A start returns
 * the room's actions.
 */
const GAMES = {
  war: {
    set: { key: 'mission', valid: (core, v) => typeof v === 'string' && Object.hasOwn(MISSIONS, v) && MISSIONS[v].map === core.meta.map },
    show: (core) => ({ mission: warMission(core) }),
    can: (core) => warMission(core) !== null,
    on: (core) => core.war.on(),
    /* After a loss, the same mission again from the stage it was lost in
     * (the owner, 2 Oct; war.js checkpointOf), with no briefing; else the
     * mission from its start, with its film. */
    start: (core, conn, s, now) => core.war.message(core, conn, s, warCheckpoint(core)
      ? { type: 'war', op: 'start', mission: warMission(core), from: 'checkpoint' }
      : { type: 'war', op: 'start', mission: warMission(core), intro: true }, now),
  },
  combat: {
    set: { key: 'minutes', valid: (core, v) => ROUND_MINUTES.includes(v) },
    show: (core) => ({ minutes: combatMinutes(core) }),
    can: () => true,
    on: (core) => core.combat.on(),
    start: (core, conn, s, now) => core.combat.message(core, conn, s, { type: 'combat', op: 'start', minutes: combatMinutes(core) }, now),
  },
  tag: {
    set: { key: 'goal', valid: (core, v) => Number.isInteger(v) && v >= GOAL_MIN && v <= GOAL_MAX },
    show: (core) => ({ goal: tagGoal(core) }),
    can: () => true,
    on: (core) => core.tag.on(),
    start: (core, conn, s, now) => core.tag.message(core, conn, s, { type: 'tag', op: 'start', goal: tagGoal(core) }, now),
  },
  /* The racers are the pilots on the track's grid when it goes (race.js
   * start, its own ready): a pilot in the lobby has the room's track
   * built under the lobby screen, and is on it. */
  race: {
    set: null,
    show: (core) => ({ track: core.race.track ? core.race.track.id : null }),
    can: (core) => Boolean(core.race.track) && core.race.readySeats().length > 0,
    on: (core) => Boolean(core.race.race && core.race.race.state === 'on'),
    start: (core, conn, s, now) => core.race.message(core, conn, s, { type: 'race', op: 'start', laps: 3 }, now),
  },
  free: {
    set: null,
    show: (core) => ({ live: core.gameLobby.live }),
    can: () => true,
    on: (core) => core.gameLobby.live,
    start: (core) => {
      core.gameLobby.live = true;
      return [];
    },
  },
};

export class RoomGameLobby {
  constructor() {
    /* seat -> true, for the pilots here who said ready. */
    this.ready = new Set();
    this.countdownAt = null;
    this.deadlineAt = null;
    /* Free flight's round: on from its first start until the room is
     * empty. */
    this.live = false;
  }

  /* The room's game, or free flight's, else null. */
  game(core) {
    const mode = core.meta.mode ?? 'free';
    return Object.hasOwn(GAMES, mode) ? GAMES[mode] : null;
  }

  /* A room made for a game, between its rounds. */
  open(core) {
    const g = this.game(core);
    return Boolean(g) && !g.on(core);
  }

  view(core) {
    const g = this.game(core);
    return {
      ...g.show(core),
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
    if (!this.ready.size || !this.game(core).can(core)) {
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
    const { set } = this.game(core);
    if (set && msg.op === set.key) {
      if (s.seat !== core.host()) {
        return [{ send: conn, data: JSON.stringify({ type: 'refused', why: 'host' }) }];
      }
      if (!set.valid(core, msg[set.key])) {
        return [];
      }
      core.meta[set.key] = msg[set.key];
      return [{ store: 'meta', value: core.meta }, ...this.changed(core)];
    }
    return [];
  }

  /* Something the round needs changed (a race's grid): the times again,
   * the flags as they are. */
  rearm(core, now) {
    if (!this.open(core)) {
      return [];
    }
    const was = [this.countdownAt, this.deadlineAt].join();
    this.settle(core, now, true);
    return [this.countdownAt, this.deadlineAt].join() === was ? [] : this.changed(core);
  }

  /* A pilot joined: not ready, and the five seconds go on. Nothing of
   * the lobby changed, so nothing is said: the joiner has it in the
   * welcome, and the others hear of the joiner by its join. */
  join(core, now) {
    if (this.open(core)) {
      this.settle(core, now, false);
    }
    return [];
  }

  leave(core, seat, now) {
    if (!this.game(core)) {
      return [];
    }
    this.ready.delete(seat);
    if (!core.seats.size) {
      this.clear();
      this.live = false;
      return [];
    }
    if (!this.open(core)) {
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
    if (!this.ready.size) {
      this.clear();
      return this.changed(core);
    }
    return this.start(core, now);
  }

  /* The room's round, started as its host would. */
  start(core, now) {
    const g = this.game(core);
    const host = [...core.seats].find(([, s]) => s.seat === core.host());
    this.clear();
    if (!host || !g.can(core)) {
      return this.changed(core);
    }
    const [conn, s] = host;
    const out = g.start(core, conn, s, now);
    return [...out, ...this.changed(core)];
  }
}
