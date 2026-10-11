/*
 * jam.js: Trick Battle (Batalla de Trucos), a room's freestyle jam
 * (docs/JAM-PLAN.md). The room's half; the rules on paper are
 * src/share/roomjam.js.
 *
 * Three rounds; in each every pilot of the match flies one timed run, one
 * after another, while the rest watch. The runner's own client scores the
 * run with the game's freestyle scorer (src/game/score.js) and sends its
 * numbers; the room decides who runs and when on its clock, takes numbers
 * only from the runner inside its run, keeps them in shape (whole, in
 * range, never going down), and names the winners. The room cannot detect
 * tricks itself: the detector needs every physics step, the room has 30 Hz
 * poses (docs/JAM-PLAN.md, the trust boundary).
 *
 * WHAT OWNS WHAT. This object lives inside one RoomCore, which runs one
 * event at a time, so nothing here locks. The match is handed back as a
 * { store } action on every change of turn or state and to restore() after
 * a hibernation (edge/rooms/host.js). Scores between are memory only: a
 * room that slept had nobody flying.
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

import { minPlayersFor } from '../../src/share/modes.js';
import {
  ROUNDS, RUN_SECONDS, SLACK_MS, TURN_MS, cleanNumbers, matchWinners, roundOrder, standings,
} from '../../src/share/roomjam.js';
import { COUNTDOWN_MS } from './race.js';

const NOTHING = () => ({
  total: 0, tricks: 0, unique: 0, crashes: 0, last: null,
});

export class RoomJam {
  constructor() {
    /*
     * { id, seconds, state: 'turn'|'run'|'results', round, order, turn,
     *   goAt, endAt, live, runs, players: { seat: token }, winners }, or
     *   null before the first match. order is this round's seats in turn
     *   order, turn the index of the runner in it.
     */
    this.match = null;
    this.nextId = 1;
  }

  restore(saved) {
    if (!saved) {
      return;
    }
    this.match = saved.match ?? null;
    this.nextId = saved.nextId ?? 1;
  }

  store() {
    return { store: 'jam', value: { match: this.match, nextId: this.nextId } };
  }

  on() {
    const m = this.match;
    return Boolean(m) && m.state !== 'results';
  }

  /* The match's pilots who are here, in their own seats. */
  players(core) {
    const m = this.match;
    if (!m) {
      return [];
    }
    return [...core.seats.values()].filter((t) => m.players[t.seat] === t.token).map((t) => t.seat);
  }

  view(core) {
    const m = this.match;
    if (!m) {
      return { state: 'lobby' };
    }
    const seats = Object.keys(m.players).map(Number);
    const wins = Object.fromEntries(standings(seats, m.runs, ROUNDS).map((r) => [r.seat, r.wins]));
    return {
      state: m.state,
      id: m.id,
      seconds: m.seconds,
      rounds: ROUNDS,
      round: m.round,
      order: m.order,
      runner: m.state === 'results' ? null : m.order[m.turn],
      goAt: m.goAt,
      endAt: m.endAt,
      live: m.live,
      runs: m.runs,
      wins,
      winners: m.winners,
      gone: seats.filter((seat) => !this.players(core).includes(seat)),
    };
  }

  welcome(core) {
    return { jam: this.view(core) };
  }

  broadcast(core) {
    const data = JSON.stringify({ type: 'jam', jam: this.view(core) });
    return [...core.seats.keys(), ...core.watchers.keys()].map((conn) => ({ send: conn, data }));
  }

  changed(core) {
    return [this.store(), ...this.broadcast(core)];
  }

  error(conn, error) {
    return [{ send: conn, data: JSON.stringify({ type: 'jam', error }) }];
  }

  message(core, conn, s, msg, now) {
    if (msg.op === 'score' || msg.op === 'done') {
      return this.numbers(core, s, msg, now);
    }
    if (s.seat !== core.host()) {
      return [];
    }
    if (msg.op === 'start') {
      return this.start(core, conn, msg, now);
    }
    if (msg.op === 'end' && this.on()) {
      return this.abandon(core, now);
    }
    return [];
  }

  start(core, conn, msg, now) {
    if (core.game()) {
      return this.error(conn, 'busy');
    }
    if (!RUN_SECONDS.includes(msg.seconds)) {
      return this.error(conn, 'seconds');
    }
    if (core.seats.size < minPlayersFor('jam', core.meta.mode)) {
      return this.error(conn, 'alone');
    }
    const players = {};
    for (const t of core.seats.values()) {
      players[t.seat] = t.token;
    }
    const goAt = Math.ceil(core.roomMs(now)) + COUNTDOWN_MS;
    this.match = {
      id: this.nextId,
      seconds: msg.seconds,
      state: 'turn',
      round: 1,
      order: roundOrder(Object.keys(players).map(Number), 1),
      turn: 0,
      goAt,
      endAt: goAt + msg.seconds * 1000,
      live: NOTHING(),
      runs: [],
      players,
      winners: [],
    };
    this.nextId += 1;
    return this.changed(core);
  }

  /* The runner's numbers, inside its run only. A 'done' closes the run. */
  numbers(core, s, msg, now) {
    const m = this.match;
    if (!m || m.state !== 'run' || m.order[m.turn] !== s.seat || m.players[s.seat] !== s.token) {
      return [];
    }
    if (core.roomMs(now) > m.endAt + SLACK_MS) {
      return this.advance(core, now);
    }
    const n = cleanNumbers(msg);
    if (!n || n.total < m.live.total || n.tricks < m.live.tricks || n.crashes < m.live.crashes) {
      return [];
    }
    m.live = n;
    if (msg.op === 'done') {
      this.close(core, 'done', now);
      return this.changed(core);
    }
    return this.broadcast(core);
  }

  /* Ended by the host, or by the room when too few of its pilots are left
   * (core.js settleGames): the open run closed as it stands, results. */
  abandon(core, now) {
    if (!this.on()) {
      return [];
    }
    const m = this.match;
    if (m.state === 'run') {
      this.record(m.order[m.turn], 'ended');
    }
    this.finish();
    return this.changed(core);
  }

  record(seat, why) {
    const m = this.match;
    const { last, ...n } = m.live;
    m.runs.push({ round: m.round, seat, ...n, why });
  }

  finish() {
    const m = this.match;
    m.state = 'results';
    m.winners = matchWinners(standings(Object.keys(m.players).map(Number), m.runs, ROUNDS));
    m.live = NOTHING();
  }

  /* Whether the leader can no longer be caught on round wins: only with two
   * or more pilots, so a pilot alone flies every round. */
  clinched() {
    const m = this.match;
    const seats = Object.keys(m.players).map(Number);
    if (seats.length < 2) {
      return false;
    }
    const rows = standings(seats, m.runs, m.round);
    const left = ROUNDS - m.round;
    return rows.length > 1 && rows[0].wins > rows[1].wins + left;
  }

  /* Close the runner's run and move to the next pilot here, round or
   * results. */
  close(core, why, now) {
    const m = this.match;
    this.record(m.order[m.turn], why);
    this.next(core, now);
  }

  next(core, now) {
    const m = this.match;
    const here = new Set(this.players(core));
    m.live = NOTHING();
    for (;;) {
      m.turn += 1;
      if (m.turn >= m.order.length) {
        if (m.round >= ROUNDS || this.clinched()) {
          this.finish();
          return;
        }
        m.round += 1;
        m.order = roundOrder(Object.keys(m.players).map(Number), m.round);
        m.turn = 0;
      }
      if (here.has(m.order[m.turn])) {
        break;
      }
    }
    m.state = 'turn';
    m.goAt = Math.ceil(core.roomMs(now)) + TURN_MS;
    m.endAt = m.goAt + m.seconds * 1000;
  }

  tick(core, now) {
    return this.on() ? this.advance(core, now) : [];
  }

  advance(core, now) {
    const m = this.match;
    const roomNow = core.roomMs(now);
    const was = [m.state, m.round, m.turn].join();
    const runner = m.order[m.turn];
    if (!this.players(core).includes(runner)) {
      if (m.state === 'run') {
        this.close(core, 'left', now);
      } else {
        this.next(core, now);
      }
    } else if (m.state === 'turn' && roomNow >= m.goAt) {
      m.state = 'run';
    } else if (m.state === 'run' && roomNow > m.endAt + SLACK_MS) {
      this.close(core, 'time', now);
    }
    return [m.state, m.round, m.turn].join() === was ? [] : this.changed(core);
  }
}
