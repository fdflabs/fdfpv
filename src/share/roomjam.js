/*
 * roomjam.js: Trick Battle's numbers and its rules on paper, read by the
 * room (edge/rooms/jam.js) and by the page alike (docs/JAM-PLAN.md).
 *
 * Pure data and pure functions, no imports from edge/ or the shell.
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

/* A run's length in seconds, the host's choice between matches; the
 * second is a room's until its host picks. */
export const RUN_SECONDS = [45, 60, 90];
export const RUN_SECONDS_DEFAULT = 60;
export const ROUNDS = 3;
/* The count before every run after the match's first, whose count is the
 * race's (edge/rooms/race.js COUNTDOWN_MS). */
export const TURN_MS = 3000;
/* How long past a run's end the room still takes the runner's numbers: a
 * last message in flight when its clock ran out. */
export const SLACK_MS = 2000;
/* Bounds on what a runner may claim. A two minute freestyle run is in the
 * tens of thousands; these only keep nonsense off the table. */
export const TOTAL_MAX = 10000000;
export const COUNT_MAX = 999;
export const NAME_MAX = 40;
/* The sheet's execution grades (src/game/tricks-sheet.js EXECUTION), here
 * as names only so the room needs no strings. */
export const EXECUTIONS = ['CLEAN', 'SLOPPY', 'BUMP', 'MISSED', 'CRASH'];

const whole = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;

/* A runner's numbers as the room keeps them, or null when they are out of
 * shape. `last` is optional and null when absent. */
export function cleanNumbers(msg) {
  if (!msg || !whole(msg.total, TOTAL_MAX) || !whole(msg.tricks, COUNT_MAX)
    || !whole(msg.unique, COUNT_MAX) || !whole(msg.crashes, COUNT_MAX) || msg.unique > msg.tricks) {
    return null;
  }
  let last = null;
  if (msg.last != null) {
    const l = msg.last;
    if (typeof l !== 'object' || typeof l.name !== 'string' || l.name.length < 1 || l.name.length > NAME_MAX
      || /[\u0000-\u001f]/.test(l.name) || !EXECUTIONS.includes(l.execution) || !whole(l.points, TOTAL_MAX)) {
      return null;
    }
    last = { name: l.name, execution: l.execution, points: l.points };
  }
  return {
    total: msg.total, tricks: msg.tricks, unique: msg.unique, crashes: msg.crashes, last,
  };
}

/* Round r's turn order (1 based): the match's seats by seat, rotated by one
 * per round so nobody always goes first. */
export function roundOrder(seats, r) {
  const sorted = [...seats].sort((a, b) => a - b);
  const k = sorted.length ? (r - 1) % sorted.length : 0;
  return [...sorted.slice(k), ...sorted.slice(0, k)];
}

/* The seats that took a round from its runs: the highest total, a tie to
 * fewer crashes, still tied every tied seat. Empty for no runs. */
export function roundWinners(runs) {
  let best = [];
  for (const r of runs) {
    const b = best[0];
    if (!b || r.total > b.total || (r.total === b.total && r.crashes < b.crashes)) {
      best = [r];
    } else if (r.total === b.total && r.crashes === b.crashes) {
      best.push(r);
    }
  }
  return best.map((r) => r.seat).sort((a, b) => a - b);
}

/* The match's standings from every run: { seat, wins, total } by place
 * (most round wins, then the higher sum of totals, then the lower seat). */
export function standings(seats, runs, rounds) {
  const rows = new Map(seats.map((seat) => [seat, { seat, wins: 0, total: 0 }]));
  for (let r = 1; r <= rounds; r += 1) {
    const these = runs.filter((x) => x.round === r);
    for (const seat of roundWinners(these)) {
      if (rows.has(seat)) rows.get(seat).wins += 1;
    }
  }
  for (const x of runs) {
    if (rows.has(x.seat)) rows.get(x.seat).total += x.total;
  }
  return [...rows.values()].sort((a, b) => b.wins - a.wins || b.total - a.total || a.seat - b.seat);
}

/* The match's winners from its standings: every seat level with the first
 * on wins and total. */
export function matchWinners(rows) {
  if (!rows.length) return [];
  const [a] = rows;
  return rows.filter((r) => r.wins === a.wins && r.total === a.total).map((r) => r.seat).sort((x, y) => x - y);
}

/*
 * The page's side of a jam: what the room last said, and the few questions
 * the shell asks of it each frame. `send` writes a message to the room.
 */
export function createRoomJam(send) {
  let seat = null;
  let jam = { state: 'lobby' };
  let error = null;
  let turnTaken = null;
  let resultsTaken = null;
  const turnKey = () => `${jam.id}:${jam.round}:${jam.runner}:${jam.goAt}`;

  const api = {
    onWelcome(w) {
      seat = w.seat;
      jam = w.jam || { state: 'lobby' };
      error = null;
      /* A match already over is not a result to show, and a turn already
       * under way when this pilot came back is not a new start. */
      if (jam.state === 'results') {
        resultsTaken = jam.id;
      }
      if (jam.state === 'run') {
        turnTaken = turnKey();
      }
    },

    onMessage(m) {
      if (m.type !== 'jam') {
        return false;
      }
      if (m.error) {
        error = m.error;
      } else if (m.jam) {
        error = null;
        jam = m.jam;
      }
      return true;
    },

    view() {
      return jam;
    },
    seat() {
      return seat;
    },
    error() {
      return error;
    },
    on() {
      return jam.state === 'turn' || jam.state === 'run';
    },
    /* Whether this pilot flies the turn on now or counting down. */
    mine() {
      return api.on() && jam.runner === seat;
    },
    /* A pilot of the match watching another's turn, or a newcomer who
     * came during the match. */
    watching() {
      return api.on() && jam.runner !== seat;
    },

    /* ms to hold this pilot's aircraft: until its own run goes, all of
     * another's turn and the next one's count (asked again every frame,
     * so finite: a hold is also a countdown on screen). 0 when it may fly. */
    holdMs(roomNow) {
      if (!api.on() || roomNow == null) {
        return 0;
      }
      return api.mine() ? Math.max(0, jam.goAt - roomNow) : Math.max(0, jam.endAt - roomNow) + SLACK_MS + TURN_MS;
    },

    /* This pilot's turn counting down, once: the shell puts it on its
     * slot and starts a run (createJamRun). */
    takeTurn(roomNow) {
      if (api.mine() && jam.state === 'turn' && roomNow != null && roomNow < jam.goAt && turnTaken !== turnKey()) {
        turnTaken = turnKey();
        return jam;
      }
      return null;
    },

    takeResults() {
      if (jam.state === 'results' && resultsTaken !== jam.id) {
        resultsTaken = jam.id;
        return jam;
      }
      return null;
    },

    /* The match's standings now, from the runs the room closed. */
    standings() {
      const seats = jam.state === 'lobby' ? [] : Object.keys(jam.wins || {}).map(Number);
      return standings(seats, jam.runs || [], jam.rounds || ROUNDS);
    },

    /* Host only, the room checks. */
    start(seconds) {
      send({ type: 'jam', op: 'start', seconds });
    },
    end() {
      send({ type: 'jam', op: 'end' });
    },

    clear() {
      seat = null;
      jam = { state: 'lobby' };
      error = null;
    },
  };
  return api;
}

/* The runner's numbers go at most every SEND_MS, the latest coalesced,
 * and the last one at least DONE_GAP_MS after them: a seat's text
 * allowance is five a second (edge/rooms/core.js TEXT_PER_S). */
export const SEND_MS = 500;
export const DONE_GAP_MS = 500;

/*
 * One run of this pilot's, scored by `score` (a src/game/score.js
 * FreestyleScore the shell made untimed: the room's clock ends a jam run,
 * not the scorer's, which would start at the first trick). The shell lands
 * tricks and crashes into the scorer as in freestyle; frame(wallMs, roomNow)
 * sends the numbers as they change and, once roomNow reaches the run's
 * end, finishes the scorer and sends 'done'. Returns the summary once
 * done, else null.
 */
export function createJamRun(score, endAt, send) {
  let sentAt = -Infinity;
  let sent = null;
  let done = null;
  let lastTrick = 0;
  const numbers = () => {
    const s = score.summary();
    const r = score.tricks.at(-1);
    return {
      total: Math.round(s.total),
      tricks: s.tricks,
      unique: s.unique,
      crashes: s.crashes,
      last: r ? { name: r.name.slice(0, NAME_MAX), execution: r.execution, points: Math.max(0, Math.round(r.net)) } : null,
    };
  };
  return {
    endAt,
    done: () => done,
    frame(wallMs, roomNow) {
      if (done) {
        return done;
      }
      if (roomNow != null && roomNow >= endAt) {
        if (score.state !== 'over') {
          score.finish();
        }
        if (wallMs - sentAt < DONE_GAP_MS) {
          return null;
        }
        const n = numbers();
        send({ type: 'jam', op: 'done', ...n });
        done = { ...n, summary: score.summary() };
        return done;
      }
      if (wallMs - sentAt < SEND_MS) {
        return null;
      }
      const n = numbers();
      const key = `${n.total}:${n.tricks}:${n.crashes}`;
      if (key === sent && score.tricks.length === lastTrick) {
        return null;
      }
      sent = key;
      lastTrick = score.tricks.length;
      sentAt = wallMs;
      send({ type: 'jam', op: 'score', ...n });
      return null;
    },
  };
}
