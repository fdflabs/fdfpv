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
 * retire (rebirthSection). The solids are each structure's own: frame
 * bars, hoop rims, pylon posts (framesSection). Negative controls: a pace the
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
import { deserialize, serialize } from 'node:v8';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RoomCore, TICK_MS } from '../edge/rooms/core.js';
import { FILL_TO } from '../edge/rooms/roombots.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { groundOf } from '../edge/rooms/grounds.js';
import { Race } from '../src/game/race.js';
import { aiPilot } from '../src/game/aipilot.js';
import { START_MS } from '../src/game/aiopponent.js';
import {
  AI_RACE_AIRFRAME, PYLON_SEGMENTS, RACE_PACES, RIM_SEGMENTS, aiRaceUnavailable, framesOf, kitLoaded, preparedFor,
} from '../edge/rooms/airace.js';
import { addGate, newCourse } from '../src/builder/course.js';
import { raceFromDocument } from '../src/game/verify.js';
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

/* A room made for `mode` on swiss2, as host.js init makes one; with
 * `stored`, host.js load's: every key a { store } wrote, through the
 * SQLite file's v8 bytes (edge/rooms/node.js Store), restored before the
 * seats, and no socket left. */
function room({
  mode = 'race', open = true, stored = null, clock = 0,
} = {}) {
  const r = new RoomCore({
    code: 'A1RACE', cap: 8, friendly: false, map: 'swiss2', epoch: 0, public: open, mode, name: null, pick: [1, 1], mission: null, hidden: false,
  });
  if (stored) {
    for (const [key, value] of stored) {
      r[key].restore(deserialize(value));
    }
    r.restore([]);
  }
  let tokens = 0;
  const env = {
    r, socks: [], clock, empty: 0, stored: new Map(), onStore: null,
  };
  env.apply = (actions) => {
    for (const x of actions) {
      if (x.send && x.send.got) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      }
      if (x.empty) {
        env.empty += 1;
      }
      if (x.store) {
        env.stored.set(x.store, serialize(x.value));
        if (env.onStore) {
          env.onStore(x);
        }
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
    /* Each AI claim against the newest pose its seat had sent when the
     * claim came: the crossing lies between two of its poses, and its
     * Race may see it a few ms after the newest (it judges every
     * OBSTACLE_STEP), so the claim is within one pose interval of it,
     * either side. Before 2026-10-15 a pass ran about 20 ms a second of
     * race ahead (airace.js THE CLOCK). */
    const ahead = [];
    const claim = e.r.race.claim.bind(e.r.race);
    e.r.race.claim = (core, c, now) => {
      const last = ai.includes(c.seat) ? e.r.race.witness.seats.get(c.seat)?.last : null;
      if (last) {
        ahead.push({ seat: c.seat, at: c.at, pose: last.t });
      }
      return claim(core, c, now);
    };
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
    /* The AI pilots fly the real plant through the real gates, scored by
     * the shell's own Race: the race's witness (edge/rooms/anticheat.js)
     * judges their claims as a person's, and must refuse none. */
    e.r.race.claim = claim;
    const gaps = ahead.map((a) => a.at - a.pose);
    const worst = ahead.reduce((m, a) => (Math.abs(a.at - a.pose) > Math.abs(m.at - m.pose) ? a : m), ahead[0] ?? { at: 0, pose: 0 });
    check(`each AI pilot's pass is stamped at the room time its pose crossed the gate: within one pose interval (${TICK_MS.toFixed(1)} ms) of its newest pose`,
      ahead.length >= ai.length * LAPS * e.r.race.track.gates && gaps.every((g) => Math.abs(g) <= TICK_MS),
      `${ahead.length} claims, ${Math.min(...gaps).toFixed(1)} to ${Math.max(...gaps).toFixed(1)} ms past the newest pose; the worst, seat ${worst.seat}: claim ${worst.at} against pose ${worst.pose}`);
    const w = e.r.race.witness;
    check('the room\'s witness decided every AI pilot\'s pass and finish on its poses and refused none', w.judged >= ai.length * LAPS * e.r.race.track.gates && w.flagged === 0,
      `${w.judged} decided, ${w.flagged} refused ${JSON.stringify(w.flags)}`);
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
  framesSection(check);
  await rebirthSection(check);
  await restoreSection(check);
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
 * The solids an AI pilot meets, from each structure's own geometry: a
 * course of a gate, a quad hoop, a pylon pair, a single pylon and a plane
 * hoop, each 30 m on down the scene's -z, flown through along -z. A line
 * through a rim, a cone or a frame bar meets a solid of the page's kind;
 * one through an opening meets none. Negative controls: the pair's
 * scoring square's top edge, where the old builder put a bar and nothing
 * stands, and the air beside the pair.
 */
function framesSection(check) {
  const doc = newCourse('swiss2', 'frames');
  const q = {
    x: 0, y: 0, z: 0, w: 1,
  };
  ['gate', 'hoop175', 'pylonPair', 'pylon', 'hoop30'].forEach((type, i) => addGate(doc, type, { x: 0, y: 0, z: -30 * i }, q));
  const course = raceFromDocument(doc);
  const col = framesOf(course);
  const at = (i, x, y) => {
    const solid = col.hit(x, y, -30 * i + 3, x, y, -30 * i - 3);
    return solid < 0 ? 'none' : col.kindName(solid);
  };
  const ap = course.gates.map((g) => g.apertures[0]);
  /* A rim's tube centre, one tube radius inside its outside (f.r). */
  const rim = (i) => {
    const f = ap[i].frame;
    return f.r - (f.r - ap[i].clearW / 2) / 2;
  };
  const pair = ap[2].frame.cones[0];
  const seen = {
    gateBar: at(0, 0, ap[0].centreY + ap[0].frame.hh - 0.01),
    gateOpening: at(0, 0, ap[0].centreY),
    quadRim: at(1, 0, ap[1].centreY + rim(1)),
    quadRimSide: at(1, rim(1), ap[1].centreY),
    quadOpening: at(1, 0, ap[1].centreY),
    pairCone: at(2, pair.x, 2),
    pairOpening: at(2, 0, ap[2].centreY),
    pairSquareTop: at(2, 0, ap[2].centreY + ap[2].clearH / 2),
    besidePair: at(2, 3 * pair.x, 2),
    pylonPost: at(3, 0, 20),
    pylonOpening: at(3, course.gates[3].x, ap[3].centreY),
    planeRim: at(4, 0, ap[4].centreY - rim(4)),
    planeOpening: at(4, 0, ap[4].centreY),
  };
  const { byKind } = col.stats();
  const kinds = (k) => byKind[k];
  const detail = JSON.stringify(seen);
  check(`a quad hoop's rim is ${RIM_SEGMENTS} firm tubes and a plane hoop's ${RIM_SEGMENTS} soft ones, and a line through either rim meets it`,
    kinds('hoop') === RIM_SEGMENTS && seen.quadRim === 'gate' && seen.quadRimSide === 'gate' && seen.planeRim === 'hoop', `${kinds('hoop')} soft; ${detail}`);
  check(`a pylon is ${PYLON_SEGMENTS} posts up its cone and a pair two such cones, and a line through either cone meets a pylon`,
    kinds('pylon') === 3 * PYLON_SEGMENTS && seen.pairCone === 'pylon' && seen.pylonPost === 'pylon', `${kinds('pylon')} posts; ${detail}`);
  check('a rectangular gate keeps its four bars: a line through its top bar meets a gate',
    kinds('gate') === 4 + RIM_SEGMENTS && seen.gateBar === 'gate', `${kinds('gate')} firm; ${detail}`);
  check('a line through every opening meets nothing',
    ['gateOpening', 'quadOpening', 'pairOpening', 'pylonOpening', 'planeOpening'].every((k) => seen[k] === 'none'), detail);
  check('negative control: nothing stands at the top of a pylon pair\'s scoring square, nor in the air beside it',
    seen.pairSquareTop === 'none' && seen.besidePair === 'none', detail);
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
 * A restore mid race (a restart, or a drain past its cap: host.js load
 * from what the room stored): the room stores each AI racer's plant and
 * lap every STORE_MS of a race; a second room made from those stores, as
 * a new process makes it, seats the same AI pilots, writes each one's
 * plant back bit for bit, and they fly on to the finish from there, not
 * left. Each pilot's own memory is kept too (aipilot.js snapshot): from
 * the first tick after the restore its sticks are the ones the unbroken
 * room's racer flew on with. Negative controls: the same stores without
 * the pilots' memory fly other sticks from the first tick; named for
 * another build of dist/sim.wasm, the AI pilots are dropped and marked
 * left in the race.
 */
/* A restored room's racers watched from the first tick that flies them:
 * each one's clock, laps and plant then, and every stick its pilot gives
 * from there. */
function watchRestored(env) {
  const racers = env.r.bots.racers;
  const fly = racers.fly.bind(racers);
  const first = new Map();
  const calls = new Map();
  racers.fly = (core, now, racer, ...rest) => {
    const seat = [...racers.racers].find(([, rc]) => rc === racer)[0];
    if (!first.has(seat)) {
      first.set(seat, { ms: racer.op.ms, state: Float64Array.from(racer.op.state), lapsDone: racer.lapsDone });
      const log = [];
      calls.set(seat, log);
      const { pilot } = racer.op;
      const live = pilot.sticks;
      pilot.sticks = (ms, st, gate) => {
        const out = live(ms, st, gate);
        log.push({ ms, out: out.slice() });
        return out;
      };
    }
    return fly(core, now, racer, ...rest);
  };
  return { first, calls };
}

/* Ms after the restore at which a restored racer's sticks first differ
 * from the unbroken one's at the same clock, or null when every one of
 * at least 250 (a second) is the same; undefined when they cannot be
 * held together (not from the same clock). */
function sticksDiffer(unbroken, restored) {
  if (!unbroken || !restored || !restored.length || unbroken[0].ms !== restored[0].ms) {
    return undefined;
  }
  const n = Math.min(unbroken.length, restored.length);
  for (let i = 0; i < n; i += 1) {
    if (!restored[i].out.every((v, j) => Object.is(v, unbroken[i].out[j])) || restored[i].ms !== unbroken[i].ms) {
      return restored[i].ms - restored[0].ms;
    }
  }
  return n >= 250 ? null : undefined;
}

function sticksSaid(log, restored) {
  const at = sticksDiffer(log && log.calls, restored);
  const n = Math.min(log ? log.calls.length : 0, restored ? restored.length : 0);
  if (at === undefined) {
    return `not held together (${n} calls, from ${log && log.calls[0] ? log.calls[0].ms : '-'} and ${restored && restored[0] ? restored[0].ms : '-'} ms)`;
  }
  return at === null ? `${n} calls the same` : `differ at +${at} ms`;
}

async function restoreSection(check) {
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
  /* What each plant was when the room stored it, to hold the restore to;
   * and each pilot's own memory then (aipilot.js snapshot, through plain
   * JSON) with every call its live pilot took from there. */
  let atStore = null;
  const logs = new Map();
  const latest = new Map();
  e.onStore = (x) => {
    if (x.store === 'bots' && x.value.racers) {
      atStore = new Map([...e.r.bots.racers.racers].map(([seat, rc]) => [seat, { ms: rc.op.ms, state: Float64Array.from(rc.op.state), lapsDone: rc.lapsDone }]));
      for (const [seat, rc] of e.r.bots.racers.racers) {
        const { pilot } = rc.op;
        if (!logs.has(pilot)) {
          const live = pilot.sticks;
          const log = { seat, rc };
          pilot.sticks = (ms, st, gate) => {
            const out = live(ms, st, gate);
            log.calls.push({ ms, st: Float64Array.from(st), gate, out: out.slice() });
            return out;
          };
          logs.set(pilot, log);
        }
        Object.assign(logs.get(pilot), { snap: JSON.parse(JSON.stringify(pilot.snapshot())), calls: [] });
        latest.set(seat, logs.get(pilot));
      }
    }
  };
  const passes = (so, seat) => so.got.filter((m) => m.type === 'event' && m.seat === seat);
  /* Mid lap: every AI pilot past its timing gate and a stored plant. */
  const endAt = e.clock + COUNTDOWN_MS + 2 * entry.lap.durationMs;
  while (e.clock < endAt && !(atStore && ai.every((seat) => passes(e.socks[0], seat).length >= 3))) {
    e.tick();
  }
  const kept = deserialize(e.stored.get('bots'));
  const keptBytes = e.stored.get('bots').length;
  check('in a race on the room stores every AI racer\'s plant with its lap, named for this build',
    Boolean(kept.racers && kept.racers.build && kept.racers.racers.length === ai.length && atStore),
    kept.racers ? `${kept.racers.racers.length} racers, ${(keptBytes / 1024).toFixed(0)} kB stored, build ${kept.racers.build.slice(0, 12)}` : 'none');
  const restoredAt = e.clock + 2000;
  const stored = new Map(e.stored);
  /* The unbroken race flies on a second past its last store. */
  e.onStore = null;
  for (const flyTo = e.clock + 1000; e.clock < flyTo;) {
    e.tick();
  }
  e.leave(0);
  /* A fresh pilot restored from each snapshot, handed what the live one
   * was handed after it: the same sticks, bit for bit. Negative control: a
   * fresh pilot not restored. */
  const logged = ai.map((seat) => latest.get(seat)).filter(Boolean);
  const replay = (l, restore) => {
    const p = aiPilot({ line: l.rc.op.line, rates: l.rc.seated.rates, learnt: l.rc.seated.learnt, startMs: START_MS });
    if (restore) {
      p.restore(l.snap);
    }
    const i = l.calls.findIndex((c) => !p.sticks(c.ms, c.st, c.gate).every((v, j) => Object.is(v, c.out[j])));
    return i < 0 ? null : l.calls[i].ms - l.calls[0].ms;
  };
  check('a pilot\'s snapshot, through plain JSON, restored into a fresh pilot: the same sticks as the live one, every call, bit for bit',
    logged.length === ai.length && logged.every((l) => l.calls.length >= 250 && replay(l, true) === null),
    logged.map((l) => `${l.seat}: ${l.calls.length} calls, ${replay(l, true) === null ? 'same' : `differ at +${replay(l, true)} ms`}`).join(', '));
  check('negative control: a fresh pilot not restored flies other sticks within its eyes\' 200 ms',
    logged.length === ai.length && logged.every((l) => replay(l, false) !== null && replay(l, false) < 200),
    logged.map((l) => `${l.seat}: differ at +${replay(l, false)} ms`).join(', '));

  const b = room({ stored, clock: restoredAt });
  const br = b.r.race.race;
  check('restored mid race, the room seats the same AI pilots and none is out of the race',
    br && br.state === 'on' && ai.every((seat) => b.r.bots.racers.has(seat) && b.bots().some((s) => s.seat === seat) && !br.out[seat]),
    br ? `AI ${b.bots().map((s) => s.seat).join(',')}, out ${JSON.stringify(br.out)}` : 'no race');
  b.join(0);
  await preparedFor(b.r.race.track, b.r.meta.map, b.r.bots.racers.paces[b.r.bots.level]).done;
  await b.r.bots.racers.settled();
  const { first, calls } = watchRestored(b);
  b.tick();
  const same = ai.every((seat) => {
    const a = atStore.get(seat);
    const f = first.get(seat);
    return a && f && a.ms === f.ms && a.lapsDone === f.lapsDone && a.state.every((v, i) => Object.is(v, f.state[i]));
  });
  check('each AI racer flies on from its kept plant: the same clock, laps and plant state, bit for bit',
    same, ai.map((seat) => `${seat}: ${atStore.get(seat) ? atStore.get(seat).ms : '-'} -> ${first.get(seat) ? first.get(seat).ms : '-'} ms`).join(', '));
  const finishBy = b.clock + 2 * entry.lap.durationMs + 20000;
  while (b.clock < finishBy && !ai.every((seat) => br.finish[seat] || br.out[seat])) {
    b.tick();
  }
  const after = (seat) => passes(b.socks[0], seat);
  check('and they finish the race from there, passing on through the gates after the kept one',
    ai.every((seat) => br.finish[seat] && br.finish[seat].lap === 1 && !br.out[seat] && after(seat).length > 0),
    ai.map((seat) => `${seat}: ${after(seat).map((m) => m.gate).join('.')} ${br.finish[seat] ? `finish ${br.finish[seat].ms}` : br.out[seat] || 'flying'}`).join(', '));
  b.leave(0);
  check('the restored racer\'s sticks are the unbroken racer\'s from the first tick after restore, bit for bit',
    ai.every((seat) => latest.get(seat) && sticksDiffer(latest.get(seat).calls, calls.get(seat)) === null),
    ai.map((seat) => `${seat}: ${sticksSaid(latest.get(seat), calls.get(seat))}`).join(', '));

  /* Negative control: the same stores without the pilots' memory (as one
   * kept before it was): the racers fly on, their sticks other than the
   * unbroken racer's within the eyes' 200 ms. */
  const blind = new Map(stored);
  const bv = deserialize(blind.get('bots'));
  for (const x of bv.racers.racers) {
    delete x.pilot;
  }
  blind.set('bots', serialize(bv));
  const d = room({ stored: blind, clock: restoredAt });
  d.join(0);
  await preparedFor(d.r.race.track, d.r.meta.map, d.r.bots.racers.paces[d.r.bots.level]).done;
  await d.r.bots.racers.settled();
  const dw = watchRestored(d);
  for (let i = 0; i < 20; i += 1) {
    d.tick();
  }
  d.leave(0);
  check('negative control: restored without the pilot\'s memory, the sticks differ from the unbroken racer\'s within 200 ms',
    ai.every((seat) => {
      const at = latest.get(seat) && sticksDiffer(latest.get(seat).calls, dw.calls.get(seat));
      return at !== null && at !== undefined && at < 200;
    }),
    ai.map((seat) => `${seat}: ${sticksSaid(latest.get(seat), dw.calls.get(seat))}`).join(', '));

  const other = new Map(stored);
  const value = deserialize(other.get('bots'));
  value.racers.build = 'another build';
  other.set('bots', serialize(value));
  const c = room({ stored: other, clock: restoredAt });
  const cr = c.r.race.race;
  check('negative control: a plant kept by another build is not written in: the AI pilots are dropped and marked left',
    c.bots().length === 0 && ai.every((seat) => cr.out[seat] === 'left'), `AI ${c.bots().length}, out ${JSON.stringify(cr.out)}`);
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
