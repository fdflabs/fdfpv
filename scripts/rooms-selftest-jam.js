/*
 * rooms-selftest-jam.js: the Trick Battle section of npm run rooms:selftest
 * (docs/JAM-PLAN.md), in its own file as the combat section is.
 * rooms-selftest.js calls jamSection(check) once.
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

import { PROTO } from '../src/share/roomwire.js';
import { RoomCore } from '../edge/rooms/core.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import {
  ROUNDS, SLACK_MS, TURN_MS, matchWinners, roundOrder, roundWinners, standings,
} from '../src/share/roomjam.js';

let tokens = 0x7000;
const newToken = () => {
  tokens += 1;
  return tokens.toString(16).padStart(32, '0');
};

/* A room of n pilots at room ms 0 (epoch 0), meta.mode `mode`. */
function jamRoom(n, mode = 'jam') {
  const r = new RoomCore({
    code: 'J4MR0M', cap: 8, friendly: false, map: 'swiss2', epoch: 0, public: false, mode,
  });
  const env = { r, socks: [], clock: 0, stored: null };
  env.apply = (actions) => {
    for (const x of actions) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      } else if (x.store === 'jam') {
        env.stored = JSON.parse(JSON.stringify(x.value));
      }
    }
  };
  for (let i = 0; i < n; i += 1) {
    const so = {
      name: `jam${i}`, address: `10.7.0.${i + 1}`, got: [], closed: null, attachment: null,
    };
    env.socks.push(so);
    env.apply(r.open(so, 0));
    env.apply(r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', name: [i, i, 30 + i], profile: { airframe: 'cub1400', map: 'swiss2', figure: 0, livery: null, parts: null },
    }), 0, so.address, newToken));
  }
  env.seat = (i) => r.seats.get(env.socks[i]).seat;
  /* Every say a quarter second after the last: a seat's text allowance is
   * TEXT_PER_S (edge/rooms/core.js), and the page sends no faster. */
  env.say = (i, obj) => env.to(env.clock + 250) || env.apply(r.message(env.socks[i], JSON.stringify({ type: 'jam', ...obj }), env.clock, env.socks[i].address));
  env.to = (t) => {
    for (; env.clock < t;) {
      env.clock = Math.min(t, env.clock + 33);
      env.apply(r.tick(env.clock));
    }
  };
  env.jam = (i = 0) => env.socks[i].got.filter((m) => m && m.type === 'jam' && m.jam).map((m) => m.jam).at(-1);
  env.errors = (i) => env.socks[i].got.filter((m) => m && m.type === 'jam' && m.error).map((m) => m.error);
  /* The index of the socket whose seat is `seat`. */
  env.of = (seat) => env.socks.findIndex((so) => r.seats.get(so) && r.seats.get(so).seat === seat);
  return env;
}

const nums = (total, extra = {}) => ({
  total, tricks: 1, unique: 1, crashes: 0, last: { name: 'Powerloop', execution: 'CLEAN', points: total }, ...extra,
});

export function jamSection(check) {
  console.log('trick battle (jam)');

  check('turn order rotates by one each round', roundOrder([5, 2, 9], 1).join() === '2,5,9' && roundOrder([5, 2, 9], 2).join() === '5,9,2'
    && roundOrder([5, 2, 9], 3).join() === '9,2,5');
  check('a round goes to the highest total, a tie to fewer crashes, still tied to both',
    roundWinners([{ seat: 1, total: 9, crashes: 0 }, { seat: 2, total: 12, crashes: 3 }]).join() === '2'
    && roundWinners([{ seat: 1, total: 9, crashes: 2 }, { seat: 2, total: 9, crashes: 1 }]).join() === '2'
    && roundWinners([{ seat: 1, total: 9, crashes: 1 }, { seat: 2, total: 9, crashes: 1 }]).join() === '1,2');
  const runs = [
    { round: 1, seat: 1, total: 10, crashes: 0 }, { round: 1, seat: 2, total: 5, crashes: 0 },
    { round: 2, seat: 1, total: 4, crashes: 0 }, { round: 2, seat: 2, total: 50, crashes: 0 },
  ];
  const rows = standings([1, 2], runs, 2);
  check('the match: most round wins, a tie to the higher sum of totals', rows[0].seat === 2 && rows[0].wins === 1 && rows[1].wins === 1
    && matchWinners(rows).join() === '2');
  check('level on both is a shared win', matchWinners(standings([1, 2], runs.slice(0, 2).concat([{ round: 2, seat: 1, total: 5, crashes: 0 }, { round: 2, seat: 2, total: 10, crashes: 0 }]), 2)).join() === '1,2');

  /* Refusals. */
  const a = jamRoom(2, null);
  a.say(1, { op: 'start', seconds: 60 });
  check('only the host starts a match', a.r.jam.match === null);
  a.say(0, { op: 'start', seconds: 61 });
  check('a run length not on the list is refused', a.r.jam.match === null && a.errors(0).join() === 'seconds');
  const alone = jamRoom(1, null);
  alone.say(0, { op: 'start', seconds: 60 });
  check('alone in a room not made for it is refused', alone.r.jam.match === null && alone.errors(0).join() === 'alone');

  /* Two pilots, a whole match. */
  const e = jamRoom(2);
  e.say(0, { op: 'start', seconds: 45 });
  let v = e.jam(1);
  const [s0, s1] = [e.seat(0), e.seat(1)];
  check('a start counts down the first run, the lower seat first, to both', v && v.state === 'turn' && v.round === 1 && v.runner === Math.min(s0, s1)
    && v.goAt === e.clock + COUNTDOWN_MS && v.endAt === v.goAt + 45000 && e.jam(0).id === v.id);
  check('the room is busy: no second start', (() => { e.say(0, { op: 'start', seconds: 60 }); return e.socks[0].got.some((m) => m && m.type === 'refused' && m.why === 'jam') && e.r.jam.match.id === v.id; })());
  const runnerI = () => e.of(e.r.jam.match.order[e.r.jam.match.turn]);
  e.say(runnerI(), { op: 'score', ...nums(100) });
  check('numbers before the run are ignored', e.r.jam.match.live.total === 0);
  e.to(v.goAt);
  check('the run goes at goAt', e.jam(1).state === 'run');
  const r0 = runnerI();
  const w0 = 1 - r0;
  e.say(w0, { op: 'score', ...nums(500) });
  check('a watcher\'s numbers are ignored', e.r.jam.match.live.total === 0);
  e.say(r0, { op: 'score', ...nums(300) });
  check('the runner\'s numbers reach the other pilot live, last trick and all', e.jam(w0).live.total === 300 && e.jam(w0).live.last.name === 'Powerloop');
  e.say(r0, { op: 'score', ...nums(200) });
  e.say(r0, { op: 'score', ...nums(400, { unique: 3 }) });
  e.say(r0, { op: 'score', ...nums(1.5) });
  e.say(r0, { op: 'score', ...nums(400, { last: { name: 'x'.repeat(41), execution: 'CLEAN', points: 1 } }) });
  e.say(r0, { op: 'score', ...nums(400, { last: { name: 'Flip', execution: 'PERFECT', points: 1 } }) });
  check('a total going down, more unique than tricks, a fraction, a long name or an unknown grade are ignored', e.r.jam.match.live.total === 300);
  e.say(r0, { op: 'done', ...nums(900, { tricks: 4, unique: 3, crashes: 1 }) });
  v = e.jam(w0);
  check('done closes the run and counts the next pilot in', v.state === 'turn' && v.runs.length === 1 && v.runs[0].total === 900 && v.runs[0].why === 'done'
    && v.runner === e.seat(w0) && v.goAt === Math.ceil(e.clock) + TURN_MS && v.live.total === 0);
  check('it was stored', e.stored && e.stored.match.runs.length === 1);
  e.to(v.goAt);
  e.say(w0, { op: 'score', ...nums(50) });
  e.to(v.endAt + SLACK_MS - 300);
  check('the room waits SLACK_MS past the run for a last message', e.jam(0).state === 'run');
  e.say(w0, { op: 'score', ...nums(60) });
  e.to(v.endAt + SLACK_MS + 40);
  v = e.jam(0);
  check('then closes it with what it heard, round 2, the order turned', v.runs.length === 2 && v.runs[1].total === 60 && v.runs[1].why === 'time'
    && v.round === 2 && v.order[0] === e.seat(w0) && v.wins[e.seat(r0)] === 1);
  /* Round 2 to the same pilot: 2 wins of 3 cannot be caught. */
  e.to(v.goAt);
  e.say(e.of(v.runner), { op: 'done', ...nums(10) });
  v = e.jam(0);
  e.to(v.goAt);
  e.say(e.of(v.runner), { op: 'done', ...nums(20) });
  v = e.jam(0);
  check('a leader with two round wins of three ends the match early', v.state === 'results' && v.runs.length === 4 && v.winners.join() === String(e.seat(r0))
    && v.wins[e.seat(r0)] === 2);
  check('and the room is finished, its game over', e.r.finished() && !e.r.jam.on() && e.r.game() === null);

  /* A pilot alone flies all three rounds. */
  const solo = jamRoom(1);
  solo.say(0, { op: 'start', seconds: 45 });
  for (let k = 0; k < ROUNDS; k += 1) {
    solo.to(solo.jam(0).goAt);
    solo.say(0, { op: 'done', ...nums(100 + k) });
  }
  v = solo.jam(0);
  check('alone in a room made for it, three rounds, then results', v.state === 'results' && v.runs.length === 3 && v.winners.join() === String(solo.seat(0)));

  /* Three pilots: the runner leaves mid run, then a watcher leaves. */
  const t = jamRoom(3);
  t.say(0, { op: 'start', seconds: 60 });
  t.to(t.r.jam.match.goAt);
  const first = t.of(t.r.jam.match.order[0]);
  const leaver = t.r.jam.match.order[0];
  t.say(first, { op: 'score', ...nums(70) });
  t.apply(t.r.close(t.socks[first], t.clock));
  t.to(t.clock + 40);
  v = t.jam(first === 0 ? 1 : 0);
  check('a runner who leaves ends its run with what the room heard', v.runs.length === 1 && v.runs[0].why === 'left' && v.runs[0].total === 70 && v.state === 'turn');
  check('and is skipped for the rest of the match', (() => {
    for (let k = 0; k < 20 && t.r.jam.on(); k += 1) {
      const m = t.r.jam.match;
      t.to(m.goAt);
      if (m.order[m.turn] === leaver) return false;
      const i = t.of(m.order[m.turn]);
      if (i < 0) return false;
      t.say(i, { op: 'done', ...nums(5 + k) });
    }
    return !t.r.jam.on() && t.r.jam.match.runs.filter((x) => x.why === 'left').length === 1 && t.r.jam.match.runs.length >= 5;
  })());

  /* Too few left: settleGames ends it. */
  const u = jamRoom(2, null);
  u.say(0, { op: 'start', seconds: 60 });
  u.to(u.r.jam.match.goAt + 100);
  u.apply(u.r.close(u.socks[1], u.clock));
  u.to(u.clock + 30000);
  check('a match started in passing with one pilot left is ended', !u.r.jam.on() && u.r.jam.match.state === 'results');

  /* The host's end. */
  const h = jamRoom(2);
  h.say(0, { op: 'start', seconds: 60 });
  h.to(h.r.jam.match.goAt);
  h.say(h.of(h.r.jam.match.order[0]), { op: 'score', ...nums(42) });
  h.say(1, { op: 'end' });
  check('only the host ends it', h.r.jam.on());
  h.say(0, { op: 'end' });
  v = h.jam(1);
  check('the host\'s end: the open run kept, results', v.state === 'results' && v.runs.length === 1 && v.runs[0].why === 'ended' && v.runs[0].total === 42);

  /* Store and restore. */
  const s = jamRoom(2);
  s.say(0, { op: 'start', seconds: 90 });
  s.to(s.r.jam.match.goAt);
  const back = new RoomCore({ code: 'J4MR0M', cap: 8, friendly: false, map: 'swiss2', epoch: 0, public: false, mode: 'jam' });
  back.jam.restore(s.stored);
  check('a stored match comes back as it was', back.jam.match && back.jam.match.seconds === 90 && back.jam.match.state === 'run' && back.jam.nextId === 2);

  /* The lobby starts it with the host's seconds. */
  const l = jamRoom(1);
  l.apply(l.r.message(l.socks[0], JSON.stringify({ type: 'lobby', op: 'seconds', seconds: 90 }), 0, l.socks[0].address));
  l.apply(l.r.message(l.socks[0], JSON.stringify({ type: 'lobby', op: 'ready', ready: true }), 0, l.socks[0].address));
  l.to(30000);
  check('a jam room\'s lobby starts a match with its seconds', l.r.jam.match && l.r.jam.match.seconds === 90 && l.r.meta.seconds === 90);
}
