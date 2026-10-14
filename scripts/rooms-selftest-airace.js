/*
 * rooms-selftest-airace.js: the AI racers section of npm run rooms:selftest
 * (edge/rooms/airace.js, docs/AI-PILOTS-RACES-CONTRACT.md), through
 * RoomCore as a platform drives it, with the real plant: a room made for a
 * race on the Swiss valley, one person in it, the host loads
 * tests/fixtures/map-track-v4.json; the room flies its reference lap, and
 * AI pilots fill the grid, marked as AI, in the interceptor, ready; a
 * second person takes one's place before the start. The race starts:
 * each AI pilot's passes reach the room as a racer's own, in
 * order, every gate of every lap, and its finish closes the last lap; the
 * results order them with the person's. Its poses are a quad's and stay
 * over the page's ground. Hard swaps the ghost for a faster one under the
 * same AI pilots. The board's best lap is their ghost when the board has
 * one they can follow, slowed to the level's pace, else the room's
 * reference (boardSection). Off takes them away, the last person leaving
 * takes them all and empties the room. A crash is a wreck and R, never a
 * retire (rebirthSection). Negative controls: a pace the
 * reference cannot lap (16 m/s on this track, aipilot:harness) seats
 * none, and a room made for tag never gets one.
 *
 * NEVER ON THE RECORD. A room writes no board, so in Node what is checked
 * is that the opponent's Race has no record key and its record write is
 * the no-op (aiopponent.js); scripts/bots-two-page.js has a page's.
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

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RoomCore, TICK_MS } from '../edge/rooms/core.js';
import { FILL_TO } from '../edge/rooms/roombots.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { groundOf } from '../edge/rooms/grounds.js';
import { Race } from '../src/game/race.js';
import {
  AI_RACE_AIRFRAME, RACE_PACES, aiRaceUnavailable, kitLoaded, preparedFor,
} from '../edge/rooms/airace.js';
import {
  FLAG_QUAD, PROTO, ROOM_LEVEL, TYPE_BATCH, decodeBatch,
} from '../src/share/roomwire.js';
import { encodeGhost, ghostToBase64 } from '../src/share/ghostdata.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/* The fixture's gates stand 640 m up; a course is built on the ground, so
 * each element here stands on swiss2's (the document's z is up, its y the
 * scene's -z). */
const ground = groundOf('swiss2');
const TRACK = JSON.parse(readFileSync(join(root, 'tests/fixtures/map-track-v4.json'), 'utf8'));
for (const el of TRACK.elements) {
  el.position.z = ground(el.position.x, -el.position.y);
}
const LAPS = 2;

/* A room made for `mode` on swiss2, as host.js init makes one. */
function room({ mode = 'race', open = true } = {}) {
  const r = new RoomCore({
    code: 'A1RACE', cap: 8, friendly: false, map: 'swiss2', epoch: 0, public: open, mode, name: null, pick: [1, 1], mission: null, hidden: false,
  });
  let tokens = 0;
  const env = {
    r, socks: [], clock: 0, empty: 0,
  };
  env.apply = (actions) => {
    for (const x of actions) {
      if (x.send && x.send.got) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      }
      if (x.empty) {
        env.empty += 1;
      }
    }
  };
  env.join = (i) => {
    const so = { name: `p${i}`, address: `10.9.8.${i + 1}`, got: [] };
    env.socks[i] = so;
    env.apply(r.open(so, env.clock));
    env.apply(r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', level: ROOM_LEVEL, name: [i, i, 40 + i], profile: { airframe: AI_RACE_AIRFRAME, map: 'swiss2', figure: 1, livery: null, parts: null },
    }), env.clock, so.address, () => (tokens += 1).toString(16).padStart(32, '0')));
    return so;
  };
  env.leave = (i) => env.apply(r.close(env.socks[i], env.clock));
  env.say = (i, obj) => env.apply(r.message(env.socks[i], JSON.stringify(obj), env.clock, env.socks[i].address));
  env.tick = () => {
    env.clock += TICK_MS;
    env.apply(r.tick(env.clock));
  };
  env.bots = () => [...r.seats.values()].filter((s) => s.bot);
  return env;
}

/* Ticks until the room's ghost for the track is flown, as the server's
 * loop would run between them. */
async function settle(e) {
  const entry = preparedFor(e.r.race.track, e.r.meta.map, e.r.bots.racers.paces[e.r.bots.level]);
  await entry.done;
  e.tick();
  await e.r.bots.racers.settled();
  e.tick();
  return entry;
}

export async function aiRaceSection(check) {
  console.log('AI racers: the room, on the real plant');
  await kitLoaded;
  const why = aiRaceUnavailable();
  check('this server has the plant (dist/sim.wasm, tests/lib)', why === null, why ?? 'loaded');
  if (why) {
    return;
  }
  {
    const e = room();
    e.join(0);
    check('a race room with no track has no AI pilot', e.bots().length === 0, `${e.bots().length} AI seats`);
    e.say(0, { type: 'track', doc: TRACK });
    check('loading a track wakes the room to fly its ghost', e.r.ticking === true);
    const entry = await settle(e);
    const joins = e.socks[0].got.filter((m) => m.type === 'join' && m.bot);
    check(`the reference laps the track at the Normal pace (${RACE_PACES.normal} m/s) and ${FILL_TO - 1} AI pilots fill the grid, marked bot, in the ${AI_RACE_AIRFRAME}`,
      entry.state === 'ready' && e.bots().length === FILL_TO - 1 && joins.length === FILL_TO - 1
      && joins.every((m) => m.profile.airframe === AI_RACE_AIRFRAME),
      `ghost ${entry.state} ${entry.lap ? (entry.lap.durationMs / 1000).toFixed(3) : '-'} s lap from the ${entry.source}, found and proved in ${entry.cpuMs.toFixed(0)} ms; ${joins.length} joins`);
    const ready = e.r.race.readySeats();
    check('every AI pilot counts as ready on the grid', e.bots().every((s) => ready.includes(s.seat)), `ready ${ready.join(',')}`);
    const peopleBefore = e.r.people().length;
    check('they are not people: the person hosts and is the only one counted', peopleBefore === 1 && e.r.host() === e.r.seats.get(e.socks[0]).seat);

    e.join(1);
    const took = e.bots().length;
    e.leave(1);
    await settle(e);
    check('a second person before the start takes an AI pilot\'s place, and one comes back when they leave',
      took === FILL_TO - 2 && e.bots().length === FILL_TO - 1, `${took} with two people, ${e.bots().length} after`);

    /* The person readies and the host starts LAPS laps. */
    e.say(0, {
      type: 'race', op: 'ready', track: e.r.race.track.id, ready: true,
    });
    e.say(0, { type: 'race', op: 'start', laps: LAPS });
    const race = e.r.race.race;
    const ai = e.bots().map((s) => s.seat);
    check('the race goes off with the person and every AI pilot on its grid',
      race && race.state === 'on' && ai.every((seat) => race.racers.includes(seat)) && race.racers.length === FILL_TO,
      race ? `racers ${race.racers.join(',')}` : 'no race');
    const me = e.r.seats.get(e.socks[0]).seat;
    const ops = () => [...e.r.bots.racers.racers.values()].map((x) => x.op);
    let below = 0;
    let poses = 0;
    let quads = 0;
    const t0 = performance.now();
    const endAt = e.clock + COUNTDOWN_MS + (LAPS + 2) * entry.lap.durationMs + 10000;
    while (e.clock < endAt && race.state === 'on') {
      e.tick();
      if (e.r.roomMs(e.clock) > race.goAt && !race.finish[me] && ai.every((seat) => race.finish[seat] || race.out[seat])) {
        /* The person crosses last, a second after the last AI pilot. */
        const last = Math.max(...ai.map((seat) => (race.finish[seat] ? race.finish[seat].ms : 0)));
        e.say(0, {
          type: 'race', op: 'finish', race: race.id, ms: last + 1000, lap: LAPS, points: 0,
        });
      }
      for (const op of ops()) {
        const st = op.state;
        if (st[3] < ground(-st[2], -st[1]) - 0.5) {
          below += 1;
        }
      }
    }
    const cpu = performance.now() - t0;
    const flownS = ops().reduce((s, op) => s + op.ms, 0) / 1000;
    const events = e.socks[0].got.filter((m) => m.type === 'event' && ai.includes(m.seat));
    const inOrder = ai.every((seat) => {
      const mine = events.filter((m) => m.seat === seat);
      const gates = e.r.race.track.gates;
      /* Gate 1 is the timing gate, which opens every lap, the last lap's
       * closing crossing being the finish. */
      const want = [];
      for (let lap = 0; lap < LAPS; lap += 1) {
        for (let g = 1; g <= gates; g += 1) {
          want.push(`${lap}:${g}`);
        }
      }
      return mine.map((m) => `${m.lap}:${m.gate}`).join() === want.join();
    });
    const sample = events.filter((m) => m.seat === ai[0]).map((m) => `${m.lap}:${m.gate}@${m.t}`).join(' ');
    check(`each AI pilot's passes reach the person as a racer's own, every gate of ${LAPS} laps in order`, events.length > 0 && inOrder, sample);
    const finished = ai.filter((seat) => race.finish[seat] && race.finish[seat].lap === LAPS);
    check('each AI pilot finishes: its last lap closed is the room\'s finish', finished.length === ai.length,
      ai.map((seat) => `${seat}: ${race.finish[seat] ? `${race.finish[seat].ms} ms` : race.out[seat] || 'flying'}`).join(', '));
    const results = race.state === 'results' ? race.results : [];
    check('the results order them with the person, the person last', results.length === FILL_TO && results.at(-1).seat === me
      && results.slice(0, -1).every((row) => ai.includes(row.seat) && row.ms != null),
      results.map((row) => `${row.seat}:${row.ms}`).join(' '));
    const batches = e.socks[0].got.filter((m) => m instanceof Uint8Array && m[0] === TYPE_BATCH);
    for (const b of batches) {
      for (const p of decodeBatch(b).poses) {
        if (ai.includes(p.seat)) {
          poses += 1;
          quads += (p.flags & FLAG_QUAD) ? 1 : 0;
        }
      }
    }
    check('the person sees their poses, a quad\'s', poses > 0 && quads === poses, `${poses} poses, ${quads} as a quad`);
    check('they fly over the page\'s ground, never into it', below === 0, `${below} samples under it`);
    check('never on the record: every opponent\'s Race has its own record write, not the page\'s',
      ops().every((op) => op.race.saveRecord !== Race.prototype.saveRecord));
    console.log(`  AI racers: ${ai.length} flew ${flownS.toFixed(1)} s of plant in ${cpu.toFixed(0)} ms of the room's CPU, `
      + `${(cpu / flownS).toFixed(2)} ms per second flown (the room's tick, judge and the person's messages included)`);

    const normalLap = entry.lap.durationMs;
    e.say(0, { type: 'bots', level: 'hard' });
    const during = e.bots().length;
    const hard = await settle(e);
    const flying = [...e.r.bots.racers.racers.values()].map((x) => x.op.line.durationMs);
    check(`Hard: the ghost is the ${RACE_PACES.hard} m/s lap, the same AI pilots stay seated and chase it`,
      during === FILL_TO - 1 && e.bots().length === FILL_TO - 1 && hard.state === 'ready' && hard.lap.durationMs < normalLap
      && flying.length === FILL_TO - 1 && flying.every((d) => d === hard.lap.durationMs),
      `${(hard.lap.durationMs / 1000).toFixed(3)} s against Normal's ${(normalLap / 1000).toFixed(3)} s; ${during} seated while it was flown`);
    e.say(0, { type: 'bots', level: 'off' });
    check('the host switches them off: every AI pilot leaves', e.bots().length === 0 && e.r.bots.racers.racers.size === 0);
    e.say(0, { type: 'bots', level: 'normal' });
    await settle(e);
    check('and on again: they fill the grid again', e.bots().length === FILL_TO - 1);
    const emptyWas = e.empty;
    e.leave(0);
    check('the last person leaving takes every AI pilot, and the room empties', e.r.seats.size === 0 && e.r.bots.racers.racers.size === 0 && e.empty > emptyWas);
  }
  {
    const e = room();
    e.r.bots.racers.paces = { ...RACE_PACES, normal: 16 };
    e.join(0);
    e.say(0, { type: 'track', doc: TRACK });
    const entry = await settle(e);
    e.tick();
    check('negative control: a pace the reference cannot lap (16 m/s) gives no ghost and no AI pilot',
      entry.state === 'none' && e.bots().length === 0, `ghost ${entry.state}, ${e.bots().length} AI seats`);
  }
  await rebirthSection(check);
  await boardSection(check);
  {
    const e = room({ mode: 'free' });
    e.join(0);
    e.say(0, { type: 'track', doc: TRACK });
    for (let i = 0; i < 5; i += 1) {
      e.tick();
    }
    check('a room not made for a race seats no AI racer for a track', e.r.bots.racers.racers.size === 0);
  }
}

/*
 * A crash is a person's wreck and R: an AI pilot that a mid air breaks
 * (roombots.js hits, the referee's path) on its first lap is not retired:
 * its lap in flight is voided, it is back on its grid place, its clock
 * runs on, and it finishes. Negative controls: the AI pilots that never
 * crashed pass every gate once, in order, and a crash after its finish
 * changes nothing.
 */
async function rebirthSection(check) {
  const e = room();
  e.join(0);
  e.say(0, { type: 'track', doc: TRACK });
  const entry = await settle(e);
  e.say(0, {
    type: 'race', op: 'ready', track: e.r.race.track.id, ready: true,
  });
  e.say(0, { type: 'race', op: 'start', laps: 1 });
  const race = e.r.race.race;
  const ai = e.bots().map((s) => s.seat);
  const [hit, ...others] = ai;
  const racer = e.r.bots.racers.racers.get(hit);
  const gates = e.r.race.track.gates;
  const passes = (seat) => e.socks[0].got.filter((m) => m.type === 'event' && m.seat === seat);
  const breakIt = (seat) => e.r.bots.hits([{ A: { seat, brk: 1 }, B: { seat: 0, brk: 0 } }], e.r.roomMs(e.clock));
  const endAt = e.clock + COUNTDOWN_MS + 3 * entry.lap.durationMs + 30000;
  let crashedAt = null;
  let grid = null;
  let after = null;
  while (e.clock < endAt && race.state === 'on') {
    e.tick();
    if (crashedAt === null && passes(hit).length >= 3) {
      const before = racer.op;
      breakIt(hit);
      crashedAt = e.r.roomMs(e.clock) - race.goAt;
      e.tick();
      /* Reborn where a fresh opponent on its line starts: its grid place. */
      const fresh = racer.op;
      grid = {
        replaced: fresh !== before, bornMs: racer.bornMs, opMs: fresh.ms, laps: racer.lapsDone,
      };
    }
    if (race.finish[hit] && after === null) {
      after = { ...race.finish[hit], clock: e.clock };
      breakIt(hit);
    }
    /* The person crosses last, once the broken finisher has lain a while. */
    if (after && e.clock - after.clock > 2000 && !race.finish[e.r.seats.get(e.socks[0]).seat] && ai.every((seat) => race.finish[seat] || race.out[seat])) {
      const last = Math.max(...ai.map((seat) => (race.finish[seat] ? race.finish[seat].ms : 0)));
      e.say(0, {
        type: 'race', op: 'finish', race: race.id, ms: last + 1000, lap: 1, points: 0,
      });
    }
  }
  const mine = passes(hit).map((m) => `${m.lap}:${m.gate}@${m.t}`);
  const ts = passes(hit).map((m) => m.t);
  const voided = passes(hit).findIndex((m, i, all) => i > 0 && m.gate < all[i - 1].gate);
  check('an AI pilot broken in a mid air on its first lap is not retired: it is put back on its grid place, its clock running on',
    crashedAt !== null && grid && grid.replaced && grid.laps === 0 && grid.bornMs >= crashedAt - 2 * TICK_MS && grid.opMs <= 2 * TICK_MS && !race.out[hit],
    `broken at race ${crashedAt} ms; ${JSON.stringify(grid)}; out ${race.out[hit] || 'no'}`);
  check('the room hears its lap voided as a person\'s: the timing gate again at a lower count, later, then every gate of the lap',
    voided > 0 && passes(hit)[voided].gate === 1 && passes(hit)[voided].lap === 0
    && ts.every((t, i) => i === 0 || t > ts[i - 1])
    && passes(hit).slice(voided).map((m) => m.gate).join() === Array.from({ length: gates }, (_, i) => i + 1).join(),
    mine.join(' '));
  check('and it finishes the race, after the AI pilots that flew clean', after && after.lap === 1 && race.state === 'results'
    && others.every((seat) => race.finish[seat] && race.finish[seat].ms < after.ms),
    ai.map((seat) => `${seat}: ${race.finish[seat] ? race.finish[seat].ms : race.out[seat] || 'flying'}`).join(', '));
  check('negative control: the AI pilots that never crashed pass each gate once, in order',
    others.every((seat) => passes(seat).map((m) => m.gate).join() === Array.from({ length: gates }, (_, i) => i + 1).join()),
    others.map((seat) => passes(seat).map((m) => m.gate).join('.')).join(' | '));
  check('negative control: a crash after its finish changes nothing: the finish stands and nothing more is said',
    after && race.finish[hit] && race.finish[hit].ms === after.ms && !race.out[hit] && passes(hit).every((m) => m.t <= after.ms),
    `finish ${after ? after.ms : '-'} -> ${race.finish[hit] ? race.finish[hit].ms : '-'}`);
  e.leave(0);
}

/*
 * The board's best lap: a board (a stub of fdfpv-leaderboard's two reads,
 * src/share/board.js fetchTrackTimes and fetchGhost) at ROOMS_BOARD_ORIGIN
 * serving a lap the room's own reference flew at 7 m/s. Under Normal's
 * 8 it is taken as is; a 10 m/s one is slowed to Normal's pace; one 300 m
 * off the course, which no AI pilot can follow round the gates, gives way
 * to the reference.
 */
async function boardSection(check) {
  const lapAt = async (pace) => {
    const e = room();
    e.r.bots.racers.paces = { ...RACE_PACES, normal: pace };
    e.join(0);
    e.say(0, { type: 'track', doc: TRACK });
    const entry = await settle(e);
    e.leave(0);
    return entry.data;
  };
  const slow = await lapAt(7);
  const fast = await lapAt(10);
  const away = { ...slow, pos: slow.pos.map((v, i) => (i % 3 === 0 ? v + 300 : v)) };
  const served = { slow, fast, away };
  const asked = [];
  const server = createServer((req, res) => {
    asked.push(req.url);
    const [, which, , , id, , timeId] = req.url.split('/');
    const lap = served[which];
    const body = timeId
      ? { id: timeId, name: 'a pilot', lapMs: lap.durationMs, ghost: ghostToBase64(encodeGhost(lap)) }
      : {
        times: [
          { id: 'plane', name: 'a plane', lapMs: 1000, hasGhost: true, craft: 'cub1400' },
          { id: 'best', name: 'a pilot', lapMs: lap.durationMs, hasGhost: true, craft: '' },
          { id: 'noghost', name: 'a pilot', lapMs: 2000, hasGhost: false, craft: '' },
        ],
        id,
      };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((go) => { server.listen(0, '127.0.0.1', go); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const raced = async (which) => {
    process.env.ROOMS_BOARD_ORIGIN = `${base}/${which}`;
    const e = room();
    e.join(0);
    e.say(0, { type: 'track', doc: TRACK });
    const entry = await settle(e);
    const seated = e.bots().length;
    e.leave(0);
    return { entry, seated };
  };
  try {
    const a = await raced('slow');
    check('a board lap slower than the level\'s pace is the ghost as posted, its best quad lap with a ghost',
      a.entry.source === 'board' && a.entry.lap.durationMs === slow.durationMs && a.seated === FILL_TO - 1
      && asked.some((u) => u.endsWith('/times/best/ghost')),
      `${a.entry.source}, ${(a.entry.lap.durationMs / 1000).toFixed(3)} s; asked ${asked.filter((u) => u.startsWith('/slow')).join(' ')}`);
    const b = await raced('fast');
    const k = b.entry.lap.durationMs / fast.durationMs;
    check(`a faster one is slowed to Normal's ${RACE_PACES.normal} m/s along its path`,
      b.entry.source === 'board' && k > 1.2 && k < 1.3 && b.seated === FILL_TO - 1, `${k.toFixed(3)} times its ${(fast.durationMs / 1000).toFixed(3)} s`);
    const c = await raced('away');
    check('a board lap the AI pilot cannot follow round the gates gives way to the room\'s reference lap',
      c.entry.source === 'reference' && c.seated === FILL_TO - 1, `${c.entry.source}`);
  } finally {
    delete process.env.ROOMS_BOARD_ORIGIN;
    server.close();
  }
}
